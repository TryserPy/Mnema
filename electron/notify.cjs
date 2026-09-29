// Напоминания о домашних заданиях: окно присылает список «что и когда напомнить», здесь — таймеры и уведомления Windows.
const { ipcMain, Notification } = require('electron');

let timers = [];
let getWin = () => null;
const shown = new Set(); // чтобы не показать одно и то же дважды

function clear() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

function fire(r) {
  if (shown.has(r.id + '@' + r.at) || !Notification.isSupported()) return;
  shown.add(r.id + '@' + r.at);
  const n = new Notification({ title: r.title, body: r.body, silent: false });
  n.on('click', () => {
    const w = getWin();
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
    w.webContents.send('notify:open', r.open || 'homework');
  });
  n.show();
}

function schedule(list) {
  clear();
  const now = Date.now();
  for (const r of Array.isArray(list) ? list.slice(0, 200) : []) {
    if (!r || typeof r.at !== 'number' || typeof r.title !== 'string') continue;
    const wait = r.at - now;
    if (wait < -60 * 1000) continue; // давно прошло
    // setTimeout не любит больше ~24 дней — дальние напоминания переставим при следующем обновлении списка
    if (wait > 20 * 86400000) continue;
    timers.push(setTimeout(() => fire({ id: String(r.id), at: r.at, title: r.title.slice(0, 120), body: String(r.body || '').slice(0, 300), open: r.open }), Math.max(0, wait)));
  }
}

function register(winGetter) {
  getWin = winGetter;
  ipcMain.on('notify:schedule', (_e, list) => schedule(list));
}

module.exports = { register };
