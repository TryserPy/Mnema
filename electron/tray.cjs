// Значок в трее, мини-повторение по горячей клавише и напоминание в заданное время.
const { app, ipcMain, Tray, Menu, nativeImage, globalShortcut, Notification, screen } = require('electron');
const path = require('path');

const HOTKEY = 'CommandOrControl+Alt+M';
let tray = null;
let state = { enabled: false, due: 0, reminder: null, hotkey: true, accelerator: HOTKEY, closeToTray: false, autostart: false };
let registered = null;
let lastNotified = '';
let miniRestore = null; // { bounds, wasVisible }
let getWin = () => null;

function icon(size) {
  return nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: size, height: size });
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function showMain() {
  const w = getWin();
  if (!w) return;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
}

function startMini() {
  const w = getWin();
  if (!w) return;
  if (!miniRestore) {
    miniRestore = { bounds: w.getBounds(), wasVisible: w.isVisible() && !w.isMinimized(), maximized: w.isMaximized() };
    if (w.isMaximized()) w.unmaximize();
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = 460;
    const height = 620;
    w.setMinimumSize(360, 480);
    w.setBounds({ x: area.x + area.width - width - 24, y: area.y + area.height - height - 24, width, height });
    w.setAlwaysOnTop(true, 'floating');
  }
  w.show();
  w.focus();
  w.webContents.send('mini:start');
}

function endMini() {
  const w = getWin();
  if (!w || !miniRestore) return;
  w.setAlwaysOnTop(false);
  w.setMinimumSize(900, 600);
  w.setBounds(miniRestore.bounds);
  if (miniRestore.maximized) w.maximize();
  if (!miniRestore.wasVisible) w.hide();
  miniRestore = null;
}

function tooltip() {
  return state.due > 0 ? `Мнема — ${state.due} ${plural(state.due, 'карточка', 'карточки', 'карточек')} на сегодня` : 'Мнема — на сегодня всё повторено';
}

function rebuildMenu() {
  if (!tray) return;
  tray.setToolTip(tooltip());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Открыть Мнему', click: showMain },
      { label: `Повторить 5 карточек${registered ? '   ' + registered.replace('CommandOrControl', 'Ctrl') : ''}`, enabled: state.due > 0, click: startMini },
      { type: 'separator' },
      {
        label: 'Выход',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function apply() {
  if (state.enabled && !tray) {
    tray = new Tray(icon(16));
    tray.on('click', showMain);
  }
  if (!state.enabled && tray) {
    tray.destroy();
    tray = null;
  }
  if (registered) globalShortcut.unregister(registered);
  registered = null;
  if (state.enabled && state.hotkey) {
    const acc = state.accelerator || HOTKEY;
    try {
      if (globalShortcut.register(acc, () => (state.due > 0 ? startMini() : showMain()))) registered = acc;
    } catch {
      /* клавиша занята другой программой или записана неверно */
    }
  }
  rebuildMenu();
  if (process.platform === 'win32' || process.platform === 'darwin') {
    app.setLoginItemSettings({ openAtLogin: Boolean(state.enabled && state.autostart), args: ['--hidden'] });
  }
}

function checkReminder() {
  if (!state.enabled || !state.reminder || state.due <= 0 || !Notification.isSupported()) return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = now.toDateString();
  if (hhmm >= state.reminder && lastNotified !== today) {
    lastNotified = today;
    const n = new Notification({
      title: 'Мнема',
      body: `Пора повторить: ${state.due} ${plural(state.due, 'карточка', 'карточки', 'карточек')}. Это займёт несколько минут.`,
      icon: icon(64)
    });
    n.on('click', showMain);
    n.show();
  }
}

function register(winGetter) {
  getWin = winGetter;
  ipcMain.on('tray:state', (_e, s) => {
    if (!s || typeof s !== 'object') return;
    const firstReminderSet = s.reminder && s.reminder !== state.reminder;
    state = {
      enabled: Boolean(s.enabled),
      due: Math.max(0, Number(s.due) || 0),
      reminder: typeof s.reminder === 'string' && /^\d{2}:\d{2}$/.test(s.reminder) ? s.reminder : null,
      hotkey: s.hotkey !== false,
      accelerator: typeof s.accelerator === 'string' && /^[A-Za-z0-9+\\/.,;'\[\]`=\-]{1,40}$/.test(s.accelerator) ? s.accelerator : HOTKEY,
      closeToTray: Boolean(s.closeToTray),
      autostart: Boolean(s.autostart)
    };
    // Если время напоминания только что задали и оно уже прошло — сегодня не напоминаем.
    if (firstReminderSet) {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hhmm >= state.reminder) lastNotified = now.toDateString();
    }
    apply();
  });
  ipcMain.on('mini:end', endMini);
  setInterval(checkReminder, 30_000);
  app.on('will-quit', () => globalShortcut.unregisterAll());
}

module.exports = {
  register,
  shouldHideOnClose: () => state.enabled && state.closeToTray && !app.isQuitting,
  isEnabled: () => state.enabled
};
