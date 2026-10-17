// Вход в Яндекс для облака (1.32): отдельное окно без моста и Node, своя сессия (куки не смешиваются с окном Refrain).
// Окно открывает страницу входа oauth.yandex.ru; когда Яндекс переходит на страницу с токеном (verification_code#access_token=…),
// адрес отдаётся окну Refrain, а окно входа закрывается. Ходить можно только по сайтам Яндекса.
const { BrowserWindow, ipcMain } = require('electron');

const START = /^https:\/\/oauth\.yandex\.ru\/authorize\?/;
const DONE = /^https:\/\/oauth\.yandex\.ru\/verification_code[#?]/;
const YANDEX_HOST = /^https:\/\/([a-z0-9-]+\.)*(yandex\.(ru|com|by|kz|uz|com\.tr)|ya\.ru|passport\.yandex\.[a-z.]+)(\/|$)/i;

function open(url, parent) {
  return new Promise((resolve) => {
    let done = false;
    const win = new BrowserWindow({
      width: 520,
      height: 720,
      parent: parent || undefined,
      modal: Boolean(parent),
      title: 'Вход в Яндекс',
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:yandex-oauth' }
    });
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
      if (!win.isDestroyed()) win.close();
    };
    const check = (e, next) => {
      if (DONE.test(next)) {
        if (e && e.preventDefault) e.preventDefault();
        return finish(next);
      }
      if (!YANDEX_HOST.test(next)) {
        if (e && e.preventDefault) e.preventDefault();
      }
    };
    win.webContents.on('will-navigate', check);
    win.webContents.on('will-redirect', check);
    win.webContents.on('did-navigate', (_e, next) => DONE.test(next) && finish(next));
    win.webContents.on('did-navigate-in-page', (_e, next) => DONE.test(next) && finish(next));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => finish(null));
    win.loadURL(url);
  });
}

function register(getWin) {
  ipcMain.handle('oauth:yandex', async (_e, url) => {
    if (typeof url !== 'string' || !START.test(url)) return null;
    return open(url, getWin());
  });
}

module.exports = { register, DONE, YANDEX_HOST };
