// Refrain на Linux: автозапуск, поведение без значка у часов, флаги Wayland, выбор способа обновления.
// Чистые функции (без Electron) — наверху и покрыты тестами (src/linux.test.ts); работа с системой — внизу.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const AUTOSTART_NAME = 'refrain.desktop';

// ---------- Чистая логика ----------

/** Аргумент для строки Exec= в .desktop-файле: в двойных кавычках, спецсимволы с обратной косой чертой. */
function desktopExecQuote(arg) {
  const s = String(arg);
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s.replace(/%/g, '%%');
  return '"' + s.replace(/(["`$\\])/g, '\\$1').replace(/%/g, '%%') + '"';
}

/** Строка значения в .desktop-файле: без переводов строки, чтобы нельзя было дописать свой ключ. */
function desktopValue(v) {
  return String(v).replace(/[\r\n]+/g, ' ');
}

/** Что запускать при входе в систему: AppImage — сам файл (внутренний путь живёт только пока он открыт), иначе — исполняемый файл. */
function autostartCommand(env, execPath) {
  const appImage = env && typeof env.APPIMAGE === 'string' && env.APPIMAGE.startsWith('/') ? env.APPIMAGE : '';
  return appImage || execPath;
}

/** Содержимое ~/.config/autostart/refrain.desktop. */
function autostartEntry({ exec, args = ['--hidden'], name = 'Refrain', icon = 'refrain', comment = 'Refrain — напоминания и повторение у часов' }) {
  return (
    [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${desktopValue(name)}`,
      `Comment=${desktopValue(comment)}`,
      `Exec=${[exec, ...args].map(desktopExecQuote).join(' ')}`,
      `Icon=${desktopValue(icon)}`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      'X-GNOME-Autostart-Delay=5',
      'StartupNotify=false',
      ''
    ].join('\n')
  );
}

/** Где лежит файл автозапуска (XDG_CONFIG_HOME или ~/.config). */
function autostartFile(env, home) {
  const base = env && typeof env.XDG_CONFIG_HOME === 'string' && env.XDG_CONFIG_HOME.startsWith('/') ? env.XDG_CONFIG_HOME : path.join(home, '.config');
  return path.join(base, 'autostart', AUTOSTART_NAME);
}

/** Ответ gdbus/dbus-send на «есть ли владелец у имени» → true / false / null (не разобрали). */
function parseNameHasOwner(stdout) {
  const s = String(stdout || '');
  if (/\btrue\b/i.test(s)) return true;
  if (/\bfalse\b/i.test(s)) return false;
  return null;
}

/** Если спросить систему не вышло: GNOME без расширения AppIndicator значка у часов не показывает, остальные оболочки — как правило, показывают. */
function guessTrayHost(env) {
  const desktops = String((env && (env.XDG_CURRENT_DESKTOP || env.DESKTOP_SESSION)) || '').toLowerCase();
  if (/gnome|ubuntu|unity|budgie|pop/.test(desktops) && !/kde|xfce|mate|cinnamon|lxqt|lxde|deepin/.test(desktops)) return false;
  return true;
}

/**
 * Что делать при закрытии окна.
 * 'close' — закрыть (и выйти), 'hide' — спрятать к значку, 'minimize' — свернуть: значка нет, и спрятанное окно было бы не найти.
 */
function closeAction({ platform, trayEnabled, closeToTray, quitting, trayHost }) {
  if (quitting || !trayEnabled || !closeToTray) return 'close';
  if (platform === 'linux' && trayHost === false) return 'minimize';
  return 'hide';
}

function isWayland(env) {
  const e = env || {};
  return String(e.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' || Boolean(e.WAYLAND_DISPLAY);
}

/** Флаги Chromium, которые ставим до запуска окна: [[имя, значение?], …]. */
function chromiumFlags(env, argv = []) {
  const flags = [];
  // Wayland, если он есть, иначе X11 — без этого часть сборок Electron идёт через XWayland (размытый текст на HiDPI).
  if (!argv.some((a) => /^--ozone-platform(=|$)/.test(a))) flags.push(['ozone-platform-hint', 'auto']);
  // Глобальные горячие клавиши под Wayland — через портал рабочего стола (иначе Ctrl+Alt+M не сработает).
  if (isWayland(env)) flags.push(['enable-features', 'GlobalShortcutsPortal']);
  return flags;
}

/**
 * Как обновляться на Linux.
 * 'auto' — AppImage: electron-updater сам скачает и заменит файл; 'manual' — пакет .deb/.rpm и распакованный архив:
 * только сообщаем о новой версии и даём ссылку (ставить пакеты без пароля администратора нельзя).
 */
function updateMode({ platform, env }) {
  if (platform !== 'linux') return 'auto';
  if (env && typeof env.APPIMAGE === 'string' && env.APPIMAGE) return 'auto';
  return 'manual';
}

/** Расширение пакета, который стоит у человека (по файлу package-type рядом с приложением). */
function packageKind(packageType) {
  const t = String(packageType || '').trim().toLowerCase();
  return t === 'deb' || t === 'rpm' || t === 'pacman' ? t : '';
}

/**
 * Какой файл из выпуска предложить скачать: свой тип пакета и своя архитектура, иначе AppImage, иначе страница выпуска.
 * assets — как в ответе GitHub: [{ name, browser_download_url, size }].
 */
function pickLinuxAsset(assets, { arch, packageType }) {
  const list = Array.isArray(assets) ? assets : [];
  const kind = packageKind(packageType);
  const names = {
    x64: { deb: /_amd64\.deb$/i, rpm: /(x86_64|x64)\.rpm$/i, pacman: /(x86_64|x64)\.pacman$/i, AppImage: /-x86_64\.AppImage$/i, tar: /-x64\.tar\.gz$/i },
    arm64: { deb: /_arm64\.deb$/i, rpm: /(aarch64|arm64)\.rpm$/i, pacman: /(aarch64|arm64)\.pacman$/i, AppImage: /-(arm64|aarch64)\.AppImage$/i, tar: /-arm64\.tar\.gz$/i }
  }[arch === 'arm64' ? 'arm64' : 'x64'];
  const order = kind ? [kind, 'AppImage', 'tar'] : ['AppImage', 'tar'];
  for (const k of order) {
    const a = list.find((x) => x && typeof x.name === 'string' && names[k].test(x.name) && typeof x.browser_download_url === 'string');
    if (a) return { name: a.name, url: a.browser_download_url, size: typeof a.size === 'number' ? a.size : undefined };
  }
  return null;
}

/** a новее b: 1.10.0 > 1.9.3 */
function isNewer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/** Ответ GitHub о последнем выпуске → то, что показываем в окне обновления. */
function manualUpdateInfo(release, { current, arch, packageType, fallbackUrl }) {
  const latest = String((release && release.tag_name) || '').replace(/^v/, '');
  if (!latest) return { ok: false, error: 'В репозитории пока нет выпусков' };
  const asset = pickLinuxAsset(release.assets, { arch, packageType });
  const notes = typeof release.body === 'string' ? release.body.replace(/<[^>]+>/g, '').trim().slice(0, 2000) : '';
  return {
    ok: true,
    current,
    latest,
    available: isNewer(latest, current),
    notes,
    manual: true,
    url: asset ? asset.url : fallbackUrl,
    fileName: asset ? asset.name : undefined,
    size: asset ? asset.size : undefined
  };
}

// ---------- Работа с системой ----------

/** До запуска окна: флаги Chromium. */
function applyEarlyFlags(app) {
  if (process.platform !== 'linux') return;
  for (const [name, value] of chromiumFlags(process.env, process.argv)) app.commandLine.appendSwitch(name, value);
}

/** Спросить у шины D-Bus, есть ли в системе «приёмник значков» (StatusNotifierWatcher). Без него значок у часов не появится. */
function probeTrayHost() {
  return new Promise((resolve) => {
    if (process.platform !== 'linux') return resolve(true);
    const done = (v) => resolve(v === null ? guessTrayHost(process.env) : v);
    execFile(
      'gdbus',
      ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.NameHasOwner', 'org.kde.StatusNotifierWatcher'],
      { timeout: 3000 },
      (err, stdout) => {
        if (!err) return done(parseNameHasOwner(stdout));
        execFile(
          'dbus-send',
          ['--session', '--print-reply', '--dest=org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus.NameHasOwner', 'string:org.kde.StatusNotifierWatcher'],
          { timeout: 3000 },
          (err2, stdout2) => done(err2 ? null : parseNameHasOwner(stdout2))
        );
      }
    );
  });
}

/** Включить или выключить запуск при входе (файл в ~/.config/autostart). Возвращает true, если получилось. */
function setAutostart(app, enabled) {
  try {
    const file = autostartFile(process.env, os.homedir());
    if (!enabled) {
      fs.rmSync(file, { force: true });
      return true;
    }
    if (!app.isPackaged) return false; // из исходников запускать нечего: путь был бы к самому Electron
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const text = autostartEntry({ exec: autostartCommand(process.env, process.execPath) });
    let same = false;
    try {
      same = fs.readFileSync(file, 'utf8') === text;
    } catch {
      /* файла ещё нет */
    }
    if (!same) fs.writeFileSync(file, text, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** Тип установленного пакета ('deb', 'rpm', …) из файла, который кладёт electron-builder; пусто — AppImage или архив. */
function installedPackageType() {
  try {
    return fs.readFileSync(path.join(process.resourcesPath || '', 'package-type'), 'utf8').trim();
  } catch {
    return '';
  }
}

module.exports = {
  AUTOSTART_NAME,
  desktopExecQuote,
  autostartCommand,
  autostartEntry,
  autostartFile,
  parseNameHasOwner,
  guessTrayHost,
  closeAction,
  isWayland,
  chromiumFlags,
  updateMode,
  packageKind,
  pickLinuxAsset,
  isNewer,
  manualUpdateInfo,
  applyEarlyFlags,
  probeTrayHost,
  setAutostart,
  installedPackageType
};
