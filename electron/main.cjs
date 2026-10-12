// Refrain — главный процесс Electron: окно и хранение данных в JSON-файле.
const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Вызовы моста принимаем только от главной страницы Refrain (file:///…/dist/index.html), не от встроенных
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
      console.warn('mnema: вызов', channel, 'не от окна Refrain — отклонён');
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
const openFiles = require('./openFiles.cjs');
const linux = require('./linux.cjs');
const { permissionAllowed, lockDown } = require('./secure.cjs');
const vault = require('./vaultPath.cjs');
linux.applyEarlyFlags(app); // Linux: Wayland/X11 по умолчанию и портал горячих клавиш — до запуска окна

let mainWin = null;
const startHidden = process.argv.includes('--hidden');

// Где лежат данные — electron/dataLayout.cjs: «Мои данные» (файл данных, копии, ПРОЧТИ.txt) отдельно от служебных файлов Electron.
const L = require('./dataLayout.cjs');
// Раскладка папок считается сразу: userData должен быть задан до запуска (ниже), а ipc-обработчики берут пути отсюда.
// Отдельная папка данных (проверки, две копии на одном компьютере) — REFRAIN_USER_DATA или прежняя MNEMA_USER_DATA.
const layout = L.resolveLayout({ appData: app.getPath('appData'), env: process.env });
app.setPath('userData', layout.systemDir);

const readData = () => L.readData(layout);
const writeData = (json) => L.writeData(layout, json); // атомарно: временный файл + переименование

function createWindow() {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Refrain',
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
  // При автозапуске окно не показываем — Refrain ждёт в трее.
  if (!startHidden) win.once('ready-to-show', () => win.show());
  win.on('close', (e) => {
    if (tray.shouldHideOnClose()) {
      e.preventDefault();
      tray.hideWindow(win); // к значку у часов; на Linux без значка — свернуть
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
  // Окно никогда не уходит со страницы Refrain: сайты открываем в браузере, остальное (чужой файл,
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
  // Путь проверяется по настоящему положению файла: ссылка внутри папки на файл снаружи не читается.
  const full = vault.resolveInside(vaultRoot, rel);
  if (path.extname(full).toLowerCase() !== '.md') throw new Error('Недопустимый путь');
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
    if (!found || !vault.isRealInside(vaultRoot, found)) continue;
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
const SECRETS = () => path.join(layout.systemDir, 'secrets.json'); // в «Служебном», не в «Мои данные»
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
  L.writeAtomic(SECRETS(), JSON.stringify(all), 0o600);
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
  let root;
  try {
    root = vault.exportRoot(r.filePaths[0]); // «Refrain» внутри выбранной папки; если это ссылка наружу — отказ
  } catch {
    return { ok: false, error: 'Папка «Refrain» в выбранном месте ведёт за его пределы — выбери другую папку.' };
  }
  let written = 0;
  for (const f of files || []) {
    const rel = String(f.path || '').replace(/[<>:"|?*\x00-\x1f]/g, '_');
    let full;
    try {
      full = vault.resolveInside(root, rel); // и сам файл, и его папки не должны быть ссылками за пределы «Refrain»
      fs.mkdirSync(path.dirname(full), { recursive: true });
      full = vault.resolveInside(root, rel); // папки созданы — проверяем ещё раз по настоящему положению
    } catch {
      continue;
    }
    fs.writeFileSync(full, f.base64 ? Buffer.from(f.content, 'base64') : String(f.content), f.base64 ? undefined : 'utf8');
    written++;
  }
  return { ok: true, folder: root, written };
});

// Автокопии: список и чтение. Только файлы refrain-ГГГГ-ММ-ДД.json (и прежние mnema-…) из «Резервные копии» — имя проверяется, путь из окна не принимается.
ipcMain.handle('backup:list', () => L.listBackups(layout));
ipcMain.handle('backup:read', (_e, name) => L.readBackup(layout, name));

// «Открыть папку с данными» — именно «Мои данные», а не служебные файлы Electron.
ipcMain.handle('data:folder', () => {
  try {
    L.ensureLayout(layout);
  } catch (err) {
    console.error('refrain: папка данных', err);
  }
  shell.openPath(layout.dataDir);
  return layout.dataDir;
});
ipcMain.handle('data:folderPath', () => layout.dataDir);

// Папка данных теперь задаётся раскладкой (electron/dataLayout.cjs): «Мои данные» и «Служебное» в папке Refrain; данные из прежней папки Mnema
// переносятся при первом запуске (копированием), поэтому после обновления Refrain пустым не откроется.
const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  // Переезд со старого места (%APPDATA%\Mnema) — копированием и с проверкой; старые файлы не трогаем. Выполняется до готовности приложения:
  // «Local State» (ключ шифрования ключей ИИ) должен лежать в новой служебной папке раньше, чем Chromium её откроет.
  try {
    L.ensureLayout(layout);
    const moved = L.migrateLegacy(layout);
    if (moved) console.log('refrain: перенос данных', JSON.stringify(moved));
    // Не получилось скопировать — работаем прямо со старым файлом, чтобы ничего не потерять и данные не разошлись.
    if (moved && moved.data === 'missing') layout.dataFile = path.join(moved.from, L.NAMES.legacyDataFile);
    else if (moved && moved.data === 'conflict') console.warn('refrain: на новом месте уже есть другие данные — старые не тронуты');
  } catch (err) {
    console.error('refrain: перенос данных не удался', err);
  }
  app.on('second-instance', (_e, argv, cwd) => {
    const w = mainWin;
    if (w) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    }
    openFiles.handleArgv(argv, cwd); // двойной щелчок по файлу .mnema, пока Refrain уже открыта
  });
  ai.register();
  ocr.register();
  sync.register(() => mainWin);
  tray.register(() => mainWin);
  notify.register(() => mainWin);
  updater.register(() => mainWin);
  openFiles.register(() => mainWin);
  openFiles.handleArgv(process.argv, process.cwd()); // Refrain запущена двойным щелчком по файлу
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
    // Electron по умолчанию выдаёт любые разрешения (камера, микрофон, место…) любому фрейму. Даём их только самой Refrain
    // (камера для фото учебника, микрофон для ответов голосом); встроенным плеерам — лишь полный экран.
    // Те же правила и для запроса, и для проверки разрешения (setPermissionCheckHandler иначе отвечал бы «да» любому фрейму).
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => cb(permissionAllowed(permission, details && details.requestingUrl)));
    session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => permissionAllowed(permission, (details && details.requestingUrl) || requestingOrigin));
    // Файлы с ключами и секретами, записанные прежними версиями, были доступны всем пользователям компьютера (Linux) — закрываем.
    lockDown(path.join(app.getPath('userData'), 'ai.json'));
    lockDown(SECRETS());
    try {
      L.dailyBackup(layout);
    } catch (err) {
      console.error('backup failed', err);
    }
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
  app.setAppUserModelId('app.mnema.study');
}
