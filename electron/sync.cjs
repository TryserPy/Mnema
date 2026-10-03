// Синхронизация по Wi-Fi: компьютер открывает на время маленький сервер в домашней сети,
// телефон сканирует QR-код (адрес + одноразовый код) и присылает свои данные — зашифрованными ключом из кода.
// Слияние делает окно Мнемы (там живые данные), сервер только передаёт.
const { ipcMain } = require('electron');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');

let server = null;
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
  if (server) server.close();
  server = null;
  session = null;
  for (const p of pending.values()) p.reject(new Error('stopped'));
  pending.clear();
}

function askRenderer(data) {
  const win = getWin();
  if (!win) return Promise.reject(new Error('Окно Мнемы закрыто'));
  const id = crypto.randomBytes(8).toString('hex');
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    win.webContents.send('sync:incoming', { id, data });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('Мнема на компьютере не ответила'));
      }
    }, 60000);
  });
}

let cryptoPromise = null;
const syncCrypto = () => (cryptoPromise ??= import(pathToFileURL(path.join(__dirname, '..', 'shared', 'syncCrypto.mjs')).href));

async function start() {
  stop();
  // Код из 12 знаков (~60 бит) — его можно и ввести руками. Из кода получается ключ шифрования; сам код в сеть не уходит,
  // поэтому подслушать или подменить обмен нельзя. Перебор по сети отсекаем: после 20 неверных попыток сервер закрывается.
  const sc = await syncCrypto();
  const code = sc.newCode();
  const key = await sc.syncKey(code);
  let bad = 0;
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const send = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(typeof body === 'string' ? body : JSON.stringify(body));
      };
      // Старая Мнема (код из 8 цифр в заголовке) — с ней обмен без шифрования не ведём.
      if (req.headers['x-mnema-token'] !== undefined) return send(426, { error: 'Обнови Мнему на этом устройстве — синхронизация теперь зашифрована' });
      const route = req.method === 'POST' && (req.url === '/mnema/hello' ? 'hello' : req.url === '/mnema/sync' ? 'sync' : null);
      if (!route) return send(404, { error: 'Нет такого адреса' });
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > (route === 'hello' ? 64 * 1024 : 300 * 1024 * 1024)) req.destroy();
        else chunks.push(c);
      });
      req.on('end', async () => {
        let msg;
        try {
          msg = await sc.open(key, route + '-req', Buffer.concat(chunks).toString('utf8'));
        } catch {
          if (++bad >= 20) setTimeout(stop, 10);
          return send(403, { error: 'Неверный код синхронизации', v: 2 });
        }
        try {
          if (route === 'hello') return send(200, await sc.seal(key, 'hello-res', { n: msg.n, app: 'Mnema', name: os.hostname() }));
          const r = await askRenderer(msg.data);
          send(200, await sc.seal(key, 'sync-res', { n: msg.n, data: r.data, report: r.report, name: os.hostname() }));
          getWin()?.webContents.send('sync:done', { device: String(msg.device || 'телефон').slice(0, 60), report: r.report });
        } catch (e) {
          send(500, { error: String(e.message || e) });
        }
      });
    });
    srv.on('error', reject);
    srv.listen(0, '0.0.0.0', () => {
      server = srv;
      const port = srv.address().port;
      session = { token: code, port, hosts: lanAddresses() };
      // Сервер живёт 15 минут — потом закрывается сам.
      stopTimer = setTimeout(stop, 15 * 60 * 1000);
      resolve(session);
    });
  });
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
      const res = await fetch(r.url, { method: r.method || 'GET', headers: r.headers || {}, body: r.body, signal: ctrl.signal });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      return { status: 0, text: e.name === 'AbortError' ? 'Нет ответа' : String((e.cause && e.cause.code) || e.message || e) };
    } finally {
      clearTimeout(timer);
    }
  });
}

module.exports = { register, stop };
