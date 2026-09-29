// Обновление Мнемы из выпусков на GitHub (electron-updater): проверить, скачать, установить при перезапуске.
const { app, ipcMain } = require('electron');

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

function register(getWin) {
  const send = (payload) => {
    const w = getWin();
    if (w && !w.isDestroyed()) w.webContents.send('update:event', payload);
  };
  // Репозиторий зашит здесь, а не приходит из окна: иначе чужой файл резервной копии мог бы подсунуть «обновление».
  ipcMain.handle('update:check', async () => {
    try {
      const u = get();
      u.setFeedURL({ provider: 'github', owner: REPO.owner, repo: REPO.repo });
      u.removeAllListeners('download-progress');
      u.removeAllListeners('update-downloaded');
      u.on('download-progress', (p) => send({ type: 'progress', percent: Math.round(p.percent || 0) }));
      u.on('update-downloaded', (i) => send({ type: 'ready', version: i.version }));
      const r = await u.checkForUpdates();
      if (!r) return { ok: false, error: 'Обновления проверяются только в установленной Мнеме' };
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
    try {
      await get().downloadUpdate();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e).slice(0, 300) };
    }
  });
  ipcMain.handle('update:install', () => {
    app.isQuitting = true;
    setImmediate(() => get().quitAndInstall(false, true));
    return true;
  });
}

module.exports = { register };
