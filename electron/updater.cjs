// Обновление Refrain из выпусков на GitHub (electron-updater): проверить, скачать, установить при перезапуске.
// Linux: AppImage обновляется сам (electron-updater по latest-linux.yml); пакет .deb и распакованный архив — только уведомление
// о новой версии со ссылкой на нужный файл: ставить пакеты без пароля администратора нельзя, и пытаться не надо.
const { app, ipcMain } = require('electron');
const linux = require('./linux.cjs');

const REPO = { owner: 'TryserPy', repo: 'Mnema' };
let updater = null;
function get() {
  if (!updater) {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
  }
  return updater;
}

const manualMode = () => linux.updateMode({ platform: process.platform, env: process.env }) === 'manual';

// Linux без AppImage: спросить у GitHub последний выпуск и выбрать подходящий файл.
async function manualCheck() {
  if (!app.isPackaged) return { ok: false, error: 'Обновления проверяются только в установленной Refrain' };
  const { net } = require('electron');
  const fallbackUrl = `https://github.com/${REPO.owner}/${REPO.repo}/releases/latest`;
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Refrain' },
      signal: AbortSignal.timeout(15000)
    });
    if (res.status === 404) return { ok: false, error: 'В репозитории пока нет выпусков' };
    if (res.status === 403 || res.status === 429) return { ok: false, error: 'GitHub просит подождать — попробуй через час' };
    if (!res.ok) return { ok: false, error: 'GitHub ответил ошибкой ' + res.status };
    return linux.manualUpdateInfo(await res.json(), { current: app.getVersion(), arch: process.arch, packageType: linux.installedPackageType(), fallbackUrl });
  } catch {
    return { ok: false, error: 'Нет интернета или GitHub недоступен' };
  }
}

function register(getWin) {
  const send = (payload) => {
    const w = getWin();
    if (w && !w.isDestroyed()) w.webContents.send('update:event', payload);
  };
  // Репозиторий зашит здесь, а не приходит из окна: иначе чужой файл резервной копии мог бы подсунуть «обновление».
  ipcMain.handle('update:check', async () => {
    if (manualMode()) return manualCheck();
    try {
      const u = get();
      u.setFeedURL({ provider: 'github', owner: REPO.owner, repo: REPO.repo });
      u.removeAllListeners('download-progress');
      u.removeAllListeners('update-downloaded');
      u.on('download-progress', (p) => send({ type: 'progress', percent: Math.round(p.percent || 0) }));
      u.on('update-downloaded', (i) => send({ type: 'ready', version: i.version }));
      const r = await u.checkForUpdates();
      if (!r) return { ok: false, error: 'Обновления проверяются только в установленной Refrain' };
      const info = r && r.updateInfo;
      const latest = info ? info.version : null;
      const available = Boolean(r && (r.isUpdateAvailable ?? (latest && latest !== app.getVersion())));
      const notes = info && typeof info.releaseNotes === 'string' ? info.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 2000) : '';
      return { ok: true, current: app.getVersion(), latest, available, notes };
    } catch (e) {
      const msg = String((e && e.message) || e);
      return { ok: false, error: /404|Not Found|no published/i.test(msg) ? 'В репозитории пока нет выпусков' : /ENOTFOUND|ETIMEDOUT|ECONN|net::/i.test(msg) ? 'Нет интернета' : msg.slice(0, 300) };
    }
  });
  ipcMain.handle('update:download', async () => {
    if (manualMode()) return { ok: false, error: 'Скачай новую версию по ссылке — этот вариант Refrain сама не обновляется' };
    try {
      await get().downloadUpdate();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e).slice(0, 300) };
    }
  });
  ipcMain.handle('update:install', () => {
    if (manualMode()) return false;
    app.isQuitting = true;
    setImmediate(() => get().quitAndInstall(false, true));
    return true;
  });
}

module.exports = { register };
