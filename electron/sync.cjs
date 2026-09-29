// Синхронизация по Wi-Fi: компьютер открывает на время маленький сервер в домашней сети,
// телефон сканирует QR-код (адрес + одноразовый ключ) и присылает свои данные.
// Слияние делает окно Мнемы (там живые данные), сервер только передаёт.
const { ipcMain } = require('electron');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

let server = null;
let session = null; // { token, port, hosts, until }
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

function start() {
  stop();
  // Код из 8 цифр — его можно и ввести руками. Перебор отсекаем: после 20 неверных попыток сервер закрывается.
  const token = String(crypto.randomInt(0, 1e8)).padStart(8, '0');
  let bad = 0;
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const send = (code, obj) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(obj));
      };
      if (req.headers['x-mnema-token'] !== token) {
        if (++bad >= 20) setTimeout(stop, 10);
        return send(403, { error: 'Неверный код синхронизации' });
      }
      if (req.method === 'GET' && req.url === '/mnema/hello') return send(200, { app: 'Mnema', name: os.hostname() });
      if (req.method !== 'POST' || req.url !== '/mnema/sync') return send(404, { error: 'Нет такого адреса' });
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > 300 * 1024 * 1024) req.destroy();
        else chunks.push(c);
      });
      req.on('end', async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const r = await askRenderer(body.data);
          send(200, { data: r.data, report: r.report, name: os.hostname() });
          getWin()?.webContents.send('sync:done', { device: String(body.device || 'телефон').slice(0, 60), report: r.report });
        } catch (e) {
          send(500, { error: String(e.message || e) });
        }
      });
    });
    srv.on('error', reject);
    srv.listen(0, '0.0.0.0', () => {
      server = srv;
      const port = srv.address().port;
      session = { token, port, hosts: lanAddresses() };
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
  ipcMain.handle('net:http', async (_e, r) => {
    if (!r || !/^https?:\/\//i.test(r.url)) return { status: 0, text: 'Неверный адрес' };
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
