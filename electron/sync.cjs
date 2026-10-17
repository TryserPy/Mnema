// Синхронизация по Wi-Fi: компьютер открывает на время маленький сервер в домашней сети,
// телефон сканирует QR-код (адрес + одноразовый код) и присылает свои данные — зашифрованными ключом из кода.
// Слияние делает окно Refrain (там живые данные), сервер только передаёт.
const { ipcMain } = require('electron');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');
const { createGuard, ipOf, readBody } = require('./syncGuard.cjs');

let servers = []; // по одному серверу на каждый адрес локальной сети (и на петлю 127.0.0.1) — не на 0.0.0.0
let session = null; // { token (код с экрана), port, hosts }
let getWin = () => null;
let stopTimer = null;
const pending = new Map();

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/^(vEthernet|VirtualBox|VMware|docker|br-|veth|Hyper-V)/i.test(name)) continue;
      out.push(a.address);
    }
  }
  // Домашние сети первыми.
  return out.sort((x, y) => Number(!/^192\.168\./.test(x)) - Number(!/^192\.168\./.test(y)));
}

function stop() {
  clearTimeout(stopTimer);
  for (const srv of servers) {
    srv.close();
    srv.closeAllConnections?.();
  }
  servers = [];
  session = null;
  for (const p of pending.values()) p.reject(new Error('stopped'));
  pending.clear();
}

function askRenderer(data) {
  const win = getWin();
  if (!win) return Promise.reject(new Error('Окно Refrain закрыто'));
  const id = crypto.randomBytes(8).toString('hex');
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    win.webContents.send('sync:incoming', { id, data });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('Refrain на компьютере не ответила'));
      }
    }, 60000);
  });
}

let cryptoPromise = null;
const syncCrypto = () => (cryptoPromise ??= import(pathToFileURL(path.join(__dirname, '..', 'shared', 'syncCrypto.mjs')).href));

/** Открыть слушатели на адресах: первый берёт свободный порт, остальные — тот же (в QR-коде один порт на все адреса). */
async function listenOn(addresses, handler) {
  const out = [];
  let port = 0;
  for (const addr of addresses) {
    const srv = http.createServer(handler);
    srv.headersTimeout = 20000; // медленные заголовки («slowloris») не держат соединение
    srv.requestTimeout = 10 * 60 * 1000; // большая копия по Wi-Fi идёт долго, но не вечно
    srv.maxConnections = 24;
    try {
      await new Promise((resolve, reject) => {
        srv.once('error', reject);
        srv.listen(port, addr, () => {
          srv.removeListener('error', reject);
          resolve();
        });
      });
    } catch (e) {
      if (!out.length) throw e; // не вышло на первом адресе — ошибка; на остальных (порт занят) просто без этого адреса
      continue;
    }
    srv.on('error', () => {});
    if (!port) port = srv.address().port;
    out.push(srv);
  }
  return { servers: out, port };
}

async function start() {
  stop();
  // Код из 12 знаков (~60 бит) — его можно и ввести руками. Из кода получается ключ шифрования; сам код в сеть не уходит,
  // поэтому подслушать или подменить обмен нельзя. Перебор по сети отсекаем: после нескольких неверных попыток адрес источника
  // блокируется (а не сервер закрывается — иначе чужой мог бы просто выключать синхронизацию). Тело до проверки кода — не больше 64 КБ:
  // обмен данными принимается только с билетом, который выдаёт «hello» после проверки кода. Повторно присланный запрос (тот же nonce) отклоняется.
  const sc = await syncCrypto();
  const code = sc.newCode();
  const key = await sc.syncKey(code);
  const guard = createGuard();
  const handler = (req, res) => {
    const ip = ipOf(req);
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', connection: 'close' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    // Отказ без чтения тела: лишнее закрывает соединение.
    const refuse = (status, body) => {
      send(status, body);
      res.on('finish', () => req.destroy());
    };
    if (guard.blocked(ip)) return refuse(429, { error: 'Слишком много неверных попыток. Подожди или открой синхронизацию заново.' });
    // Старая Refrain (код из 8 цифр в заголовке) — с ней обмен без шифрования не ведём.
    if (req.headers['x-mnema-token'] !== undefined) return refuse(426, { error: 'Обнови Refrain на этом устройстве — синхронизация теперь зашифрована' });
    const route = req.method === 'POST' && (req.url === '/mnema/hello' ? 'hello' : req.url === '/mnema/sync' ? 'sync' : null);
    if (!route) return refuse(404, { error: 'Нет такого адреса' });
    let slot = false;
    if (route === 'sync') {
      // Обмен — только с билетом, выданным после проверки кода: большое тело принимаем лишь от того, кто код знает.
      const ticket = req.headers['x-mnema-session'];
      if (ticket === undefined) return refuse(426, { error: 'Обнови Refrain на другом устройстве — синхронизация стала надёжнее' });
      if (!guard.enterSync()) return refuse(429, { error: 'Компьютер сейчас занят другим обменом. Повтори через минуту.' });
      if (!guard.useTicket(ticket)) {
        guard.leaveSync();
        guard.fail(ip);
        return refuse(403, { error: 'Обмен не разрешён: начни синхронизацию заново', v: 2 });
      }
      slot = true;
    }
    readBody(req, route === 'sync' ? guard.limits.syncBody : guard.limits.preAuthBody).then(
      async (text) => {
        try {
          let msg;
          try {
            msg = await sc.open(key, route + '-req', text);
          } catch {
            guard.fail(ip);
            return send(403, { error: 'Неверный код синхронизации', v: 2 });
          }
          guard.ok(ip);
          if (guard.replayed(msg && msg.n)) {
            guard.fail(ip);
            return send(409, { error: 'Этот запрос уже был — начни синхронизацию заново' });
          }
          try {
            if (route === 'hello') {
              const t = guard.issueTicket();
              if (!t) return send(429, { error: 'Слишком много одновременных обменов. Повтори через минуту.' });
              return send(200, await sc.seal(key, 'hello-res', { n: msg.n, app: 'Mnema', name: os.hostname(), t }));
            }
            const r = await askRenderer(msg.data);
            send(200, await sc.seal(key, 'sync-res', { n: msg.n, data: r.data, report: r.report, name: os.hostname() }));
            getWin()?.webContents.send('sync:done', { device: String(msg.device || 'телефон').slice(0, 60), report: r.report });
          } catch (e) {
            send(500, { error: String(e.message || e) });
          }
        } finally {
          if (slot) guard.leaveSync();
        }
      },
      (e) => {
        if (slot) guard.leaveSync();
        if (e && e.code === 'TOO_BIG') {
          guard.fail(ip);
          return refuse(413, { error: 'Слишком большое сообщение' });
        }
        req.destroy();
      }
    );
  };
  // Адреса локальной сети (их показывает QR-код) и петля 127.0.0.1 (запасной вход этого же компьютера и проверки); 0.0.0.0 не слушаем.
  const hosts = lanAddresses();
  const bound = await listenOn([...hosts, '127.0.0.1'], handler);
  servers = bound.servers;
  session = { token: code, port: bound.port, hosts };
  // Сервер живёт 15 минут — потом закрывается сам.
  stopTimer = setTimeout(stop, 15 * 60 * 1000);
  return session;
}

function register(winGetter) {
  getWin = winGetter;
  ipcMain.handle('sync:start', async () => {
    try {
      const s = await start();
      return { ok: true, ...s };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });
  ipcMain.handle('sync:stop', () => {
    stop();
    return true;
  });
  ipcMain.on('sync:reply', (_e, msg) => {
    const p = msg && pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve({ data: msg.data, report: msg.report });
  });
  // Простой HTTP-запрос из окна (для синхронизации с другим устройством) — без ограничений CORS.
  // Метод запроса — из списка того, что нужно приложению (облако, синхронизация, обновления) и модам; адрес — только http(s).
  const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'MKCOL', 'PROPFIND']);
  ipcMain.handle('net:http', async (_e, r) => {
    if (!r || !/^https?:\/\//i.test(r.url)) return { status: 0, text: 'Неверный адрес' };
    if (r.method && !HTTP_METHODS.has(String(r.method).toUpperCase())) return { status: 0, text: 'Метод запроса не разрешён' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(Number(r.timeout) || 30000, 300000));
    try {
      // redirect: 'manual' — переходы проверяет окно (ссылки из «Карточки из ссылки»: без внутренних адресов); maxBytes — читаем не больше.
      const res = await fetch(r.url, { method: r.method || 'GET', headers: r.headers || {}, body: r.body, signal: ctrl.signal, redirect: r.redirect === 'manual' ? 'manual' : 'follow' });
      if (r.redirect === 'manual' && res.status >= 300 && res.status < 400) return { status: res.status, text: '', location: res.headers.get('location') || '' };
      if (!(Number(r.maxBytes) > 0) || !res.body) return { status: res.status, text: await res.text() };
      const reader = res.body.getReader();
      const parts = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        total += value.length;
        if (total >= r.maxBytes) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
      return { status: res.status, text: Buffer.concat(parts).subarray(0, r.maxBytes).toString('utf8'), type: res.headers.get('content-type') || '' };
    } catch (e) {
      return { status: 0, text: e.name === 'AbortError' ? 'Нет ответа' : String((e.cause && e.cause.code) || e.message || e) };
    } finally {
      clearTimeout(timer);
    }
  });
}

module.exports = { register, stop, lanAddresses };
