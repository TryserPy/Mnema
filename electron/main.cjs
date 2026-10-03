// Мнема — главный процесс Electron: окно и хранение данных в JSON-файле.
const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Вызовы моста принимаем только от главной страницы Мнемы (file:///…/dist/index.html), не от встроенных
// видео и не от чужой страницы. Обёртка ставится до подключения остальных модулей — они тоже под ней.
function fromApp(e) {
  try {
    const f = e.senderFrame;
    if (!f || f.parent) return false;
    const u = new URL(f.url);
    return u.protocol === 'file:' && !u.host && u.pathname.endsWith('/dist/index.html');
  } catch {
    return false;
  }
}
for (const m of ['handle', 'on', 'once']) {
  const orig = ipcMain[m].bind(ipcMain);
  ipcMain[m] = (channel, fn) =>
    orig(channel, (e, ...args) => {
      if (fromApp(e)) return fn(e, ...args);
      console.warn('mnema: вызов', channel, 'не от окна Мнемы — отклонён');
      if (m === 'handle') throw new Error('Недоступно');
      e.returnValue = null;
    });
}
const ai = require('./ai.cjs');
const tray = require('./tray.cjs');
const notify = require('./notify.cjs');
const updater = require('./updater.cjs');
const ocr = require('./ocr.cjs');
const sync = require('./sync.cjs');

let mainWin = null;
const startHidden = process.argv.includes('--hidden');

const DATA_FILE = () => path.join(app.getPath('userData'), 'mnema-data.json');
const BACKUP_DIR = () => path.join(app.getPath('userData'), 'backups');
const MAX_BACKUPS = 8;

function readData() {
  try {
    return fs.readFileSync(DATA_FILE(), 'utf8');
  } catch {
    return null;
  }
}

// Атомарная запись: сначала во временный файл, потом переименование.
function writeData(json) {
  const file = DATA_FILE();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, file);
}

// Резервная копия раз в сутки при запуске; хранятся последние MAX_BACKUPS.
function dailyBackup() {
  const current = readData();
  if (!current) return;
  const dir = BACKUP_DIR();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const target = path.join(dir, `mnema-${stamp}.json`);
  if (!fs.existsSync(target)) fs.writeFileSync(target, current, 'utf8');
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('mnema-') && f.endsWith('.json')).sort();
  while (files.length > MAX_BACKUPS) fs.unlinkSync(path.join(dir, files.shift()));
}

function createWindow() {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Мнема',
    backgroundColor: '#F6F3EC',
    autoHideMenuBar: false, // false + скрытая полоса: Alt не выдвигает меню «File Edit View Window» сверху
    icon: nativeImage.createFromPath(path.join(__dirname, 'icon.png')),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });
  mainWin = win;
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // При автозапуске окно не показываем — Мнема ждёт в трее.
  if (!startHidden) win.once('ready-to-show', () => win.show());
  win.on('close', (e) => {
    if (tray.shouldHideOnClose()) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    mainWin = null;
  });
  // Внешние ссылки открываем в браузере, а не внутри приложения.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Окно никогда не уходит со страницы Мнемы: сайты открываем в браузере, остальное (чужой файл,
  // //сервер/папка) запрещаем — иначе чужая страница получила бы доступ к данным через мост.
  win.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
}

// ---------- Импорт из Obsidian: доступ только к папке, которую выбрал пользователь ----------
let vaultRoot = null;
let vaultImages = new Map(); // имя файла (в нижнем регистре) → полный путь
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function scanVault(root) {
  const files = [];
  vaultImages = new Map();
  const walk = (dir, depth) => {
    if (depth > 12 || files.length > 5000) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, depth + 1);
      else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (ext === '.md') files.push(path.relative(root, full).split(path.sep).join('/'));
        else if (IMAGE_EXT.has(ext) && !vaultImages.has(ent.name.toLowerCase())) vaultImages.set(ent.name.toLowerCase(), full);
      }
    }
  };
  walk(root, 0);
  return files.sort((a, b) => a.localeCompare(b, 'ru'));
}

ipcMain.handle('obsidian:pick', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { title: 'Папка с заметками Obsidian', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  vaultRoot = r.filePaths[0];
  return { root: vaultRoot, name: path.basename(vaultRoot), files: scanVault(vaultRoot) };
});

ipcMain.handle('obsidian:read', (_e, rel) => {
  if (!vaultRoot || typeof rel !== 'string') throw new Error('Папка не выбрана');
  const full = path.resolve(vaultRoot, rel);
  if (!full.startsWith(path.resolve(vaultRoot) + path.sep) || path.extname(full).toLowerCase() !== '.md') throw new Error('Недопустимый путь');
  const text = fs.readFileSync(full, 'utf8');
  const images = {};
  for (const m of text.matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]|!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const raw = (m[1] || m[2] || '').trim();
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      /* имя с символом % — оставляем как есть */
    }
    const name = path.basename(decoded);
    const found = vaultImages.get(name.toLowerCase());
    if (!found) continue;
    const st = fs.statSync(found);
    if (st.size > 3 * 1024 * 1024) continue;
    images[name] = `data:${MIME[path.extname(found).toLowerCase()]};base64,${fs.readFileSync(found).toString('base64')}`;
  }
  return { text, images };
});

ipcMain.on('data:load', (e) => {
  e.returnValue = readData();
});
ipcMain.handle('data:save', (_e, json) => {
  writeData(json);
  return true;
});
ipcMain.on('data:saveSync', (e, json) => {
  try {
    writeData(json);
    e.returnValue = true;
  } catch {
    e.returnValue = false;
  }
});
// Секреты (пароль облака и т. п.) — зашифрованы средствами Windows.
const SECRETS = () => path.join(app.getPath('userData'), 'secrets.json');
function readSecrets() {
  try {
    return JSON.parse(fs.readFileSync(SECRETS(), 'utf8'));
  } catch {
    return {};
  }
}
// Окно (и моды в нём) читает и пишет только эти секреты; ключи ИИ читает главный процесс сам.
const SECRET_NAMES = new Set(['cloud-pass', 'cloud-enc']);
ipcMain.handle('secret:get', (_e, name) => {
  if (!SECRET_NAMES.has(String(name))) return '';
  const v = readSecrets()[String(name)];
  if (!v) return '';
  try {
    const { safeStorage } = require('electron');
    if (v.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'));
    if (v.startsWith('raw:')) return Buffer.from(v.slice(4), 'base64').toString('utf8');
  } catch {
    /* не расшифровать */
  }
  return '';
});
ipcMain.handle('secret:set', (_e, name, value) => {
  if (!SECRET_NAMES.has(String(name))) return false;
  const { safeStorage } = require('electron');
  const all = readSecrets();
  if (!value) delete all[String(name)];
  else all[String(name)] = safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(String(value)).toString('base64') : 'raw:' + Buffer.from(String(value)).toString('base64');
  fs.writeFileSync(SECRETS(), JSON.stringify(all), 'utf8');
  return true;
});

// Экспорт в Obsidian: выбрать папку и записать файлы (пути — только внутри выбранной папки).
// Сохранить файл (резервная копия, колода Anki, тема…) — через окно «Сохранить как».
ipcMain.handle('file:save', async (e, req) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const name = String((req && req.name) || 'файл').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120);
  const ext = path.extname(name).slice(1);
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), name), filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, Buffer.from(String(req.base64 || ''), 'base64'));
  return true;
});

ipcMain.handle('obsidian:export', async (e, files) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { title: 'Куда сохранить заметки (папка хранилища Obsidian)', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  const root = path.resolve(r.filePaths[0], 'Мнема');
  let written = 0;
  for (const f of files || []) {
    const rel = String(f.path || '').replace(/[<>:"|?*\x00-\x1f]/g, '_');
    const full = path.resolve(root, rel);
    if (!full.startsWith(root + path.sep)) continue;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, f.base64 ? Buffer.from(f.content, 'base64') : String(f.content), f.base64 ? undefined : 'utf8');
    written++;
  }
  return { ok: true, folder: root, written };
});

// Автокопии: список и чтение. Только файлы mnema-ГГГГ-ММ-ДД.json из папки backups — имя проверяется, путь из окна не принимается.
const BACKUP_NAME = /^mnema-\d{4}-\d{2}-\d{2}\.json$/;
ipcMain.handle('backup:list', () => {
  const dir = BACKUP_DIR();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => BACKUP_NAME.test(f))
    .sort()
    .reverse()
    .map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
});
ipcMain.handle('backup:read', (_e, name) => {
  if (typeof name !== 'string' || !BACKUP_NAME.test(name)) return null;
  try {
    return fs.readFileSync(path.join(BACKUP_DIR(), name), 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('data:folder', () => {
  shell.openPath(app.getPath('userData'));
  return app.getPath('userData');
});

// Отдельная папка данных (для проверки синхронизации двух копий на одном компьютере).
if (process.env.MNEMA_USER_DATA) app.setPath('userData', process.env.MNEMA_USER_DATA);
const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = mainWin;
    if (w) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    }
  });
  ai.register();
  ocr.register();
  sync.register(() => mainWin);
  tray.register(() => mainWin);
  notify.register(() => mainWin);
  updater.register(() => mainWin);
  // Запустили скрыто, но трей выключен — показать окно, иначе приложение будет невидимым.
  ipcMain.once('tray:state', (_e, s) => {
    setTimeout(() => {
      if (startHidden && mainWin && !(s && s.enabled)) mainWin.show();
    }, 50);
  });
  app.on('before-quit', () => {
    app.isQuitting = true;
  });
  app.whenReady().then(() => {
    // YouTube не показывает встроенный плеер без адреса страницы (Referer), а у окна приложения его нет.
    const { session } = require('electron');
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*', 'https://rutube.ru/*', 'https://vk.com/*'] }, (d, cb) => {
      if (!d.requestHeaders.Referer) d.requestHeaders.Referer = 'https://mnema.app/';
      cb({ requestHeaders: d.requestHeaders });
    });
    // Картинки и ссылки вида //сервер/папка (file://сервер/…) на Windows идут в сетевую папку —
    // это утечка (адрес, данные входа Windows). Такие запросы отменяем.
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: /^file:\/\/[^/]/i.test(d.url) }));
    // Electron по умолчанию выдаёт любые разрешения (камера, микрофон, место…) любому фрейму. Даём их только самой Мнеме
    // (камера для фото учебника, микрофон для ответов голосом); встроенным плеерам — лишь полный экран.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => {
      let own = false;
      try {
        const u = new URL(details.requestingUrl || '');
        own = u.protocol === 'file:' && !u.host && u.pathname.endsWith('/dist/index.html');
      } catch {
        /* не адрес — чужой */
      }
      cb(own || permission === 'fullscreen');
    });
    try {
      dailyBackup();
    } catch (err) {
      console.error('backup failed', err);
    }
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
  app.setAppUserModelId('app.mnema.study');
}
