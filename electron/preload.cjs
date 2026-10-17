// Мост между окном и главным процессом: данные, Obsidian, ИИ-помощник, трей.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mnemaApi', {
  load: () => ipcRenderer.sendSync('data:load'),
  save: (json) => ipcRenderer.invoke('data:save', json),
  saveSync: (json) => ipcRenderer.sendSync('data:saveSync', json),
  openDataFolder: () => ipcRenderer.invoke('data:folder'),
  dataFolderPath: () => ipcRenderer.invoke('data:folderPath'),
  backupList: () => ipcRenderer.invoke('backup:list'),
  backupRead: (name) => ipcRenderer.invoke('backup:read', name),
  obsidianPick: () => ipcRenderer.invoke('obsidian:pick'),
  obsidianRead: (rel) => ipcRenderer.invoke('obsidian:read', rel),
  aiGetConfig: () => ipcRenderer.invoke('ai:getConfig'),
  aiSetConfig: (patch) => ipcRenderer.invoke('ai:setConfig', patch),
  aiAsk: (req) => ipcRenderer.invoke('ai:ask', req),
  aiLocalModels: () => ipcRenderer.invoke('ai:localModels'),
  aiSaveCustom: (draft) => ipcRenderer.invoke('ai:saveCustom', draft),
  aiDeleteCustom: (id) => ipcRenderer.invoke('ai:deleteCustom', id),
  aiProbe: (q) => ipcRenderer.invoke('ai:probe', q),
  aiKeyStorage: () => ipcRenderer.invoke('ai:keyStorage'),
  aiTranscribe: (req) => ipcRenderer.invoke('ai:transcribe', req),
  // Refrain ИИ: вход, лимит, устройства, «Сообщить о проблеме». Токены и ключ устройства остаются в главном процессе.
  refrain: {
    status: () => ipcRenderer.invoke('refrain:status'),
    loginStart: (email) => ipcRenderer.invoke('refrain:loginStart', { email }),
    loginVerify: (p) => ipcRenderer.invoke('refrain:loginVerify', p),
    me: () => ipcRenderer.invoke('refrain:me'),
    invite: (code) => ipcRenderer.invoke('refrain:invite', { code }),
    unbind: (id) => ipcRenderer.invoke('refrain:unbind', { id }),
    deleteAccount: () => ipcRenderer.invoke('refrain:deleteAccount'),
    logout: () => ipcRenderer.invoke('refrain:logout'),
    bug: (report) => ipcRenderer.invoke('refrain:bug', report),
    screenshot: () => ipcRenderer.invoke('refrain:screenshot')
  },
  ocrRecognize: (bytes) => ipcRenderer.invoke('ocr:recognize', bytes),
  trayState: (state) => ipcRenderer.send('tray:state', state),
  onMiniStart: (cb) => {
    const h = () => cb();
    ipcRenderer.on('mini:start', h);
    return () => ipcRenderer.removeListener('mini:start', h);
  },
  miniEnd: () => ipcRenderer.send('mini:end'),
  scheduleNotifications: (list) => ipcRenderer.send('notify:schedule', list),
  updateCheck: (src) => ipcRenderer.invoke('update:check', src),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdateEvent: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('update:event', h);
    return () => ipcRenderer.removeListener('update:event', h);
  },
  // Файл Refrain (.mnema, .refrainstyle, .mnemamod), который открыли двойным щелчком или из командной строки.
  onOpenFile: (cb) => {
    const h = (_e, f) => cb(f);
    ipcRenderer.on('file:open', h);
    ipcRenderer.send('openfile:ready');
    return () => ipcRenderer.removeListener('file:open', h);
  },
  onNotifyOpen: (cb) => {
    const h = (_e, what) => cb(what);
    ipcRenderer.on('notify:open', h);
    return () => ipcRenderer.removeListener('notify:open', h);
  },
  syncStart: () => ipcRenderer.invoke('sync:start'),
  syncStop: () => ipcRenderer.invoke('sync:stop'),
  onSyncIncoming: (cb) => {
    const h = async (_e, msg) => {
      try {
        const r = await cb(msg.data);
        ipcRenderer.send('sync:reply', { id: msg.id, data: r.data, report: r.report });
      } catch (err) {
        ipcRenderer.send('sync:reply', { id: msg.id, error: String((err && err.message) || err) });
      }
    };
    ipcRenderer.on('sync:incoming', h);
    return () => ipcRenderer.removeListener('sync:incoming', h);
  },
  onSyncDone: (cb) => {
    const h = (_e, msg) => cb(msg);
    ipcRenderer.on('sync:done', h);
    return () => ipcRenderer.removeListener('sync:done', h);
  },
  http: (r) => ipcRenderer.invoke('net:http', r),
  yandexLogin: (url) => ipcRenderer.invoke('oauth:yandex', url),
  secretGet: (name) => ipcRenderer.invoke('secret:get', name),
  secretSet: (name, value) => ipcRenderer.invoke('secret:set', name, value),
  obsidianExport: (files) => ipcRenderer.invoke('obsidian:export', files),
  saveFile: (name, base64, mime) => ipcRenderer.invoke('file:save', { name, base64, mime }),
  platform: process.platform
});
