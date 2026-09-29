// ИИ-помощник на Windows: общая логика — в shared/aiCore.mjs, здесь только сеть, файл настроек
// и шифрование ключей средствами Windows (safeStorage).
const { app, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'ai.json');

const store = {
  read() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8'));
    } catch {
      return {};
    }
  },
  write(c) {
    fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true });
    fs.writeFileSync(CONFIG_FILE(), JSON.stringify(c, null, 1), 'utf8');
  },
  encrypt(text) {
    if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(text).toString('base64');
    return 'raw:' + Buffer.from(text, 'utf8').toString('base64');
  },
  decrypt(stored) {
    if (!stored) return '';
    try {
      if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
      if (stored.startsWith('raw:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
    } catch {
      /* ключ с другого компьютера — не расшифровать */
    }
    return '';
  },
  newId: () => crypto.randomBytes(6).toString('hex')
};

async function http(url, { method = 'GET', headers = {}, body, bodyBase64, timeout = 150000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : bodyBase64 ? Buffer.from(body, 'base64') : body, signal: ctrl.signal });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    const code = e.name === 'AbortError' ? 'timeout' : (e.cause && e.cause.code) || e.message || String(e);
    return { status: 0, text: '', error: code };
  } finally {
    clearTimeout(t);
  }
}

let servicePromise = null;
function service() {
  servicePromise ??= import(pathToFileURL(path.join(__dirname, '..', 'shared', 'aiCore.mjs')).href).then((m) => m.createAiService({ http, store }));
  return servicePromise;
}

function register() {
  const h = (name, fn) => ipcMain.handle(name, async (_e, arg) => fn(await service(), arg));
  h('ai:getConfig', (s) => s.getConfig());
  h('ai:setConfig', (s, patch) => s.setConfig(patch));
  h('ai:saveCustom', (s, draft) => s.saveCustom(draft || {}));
  h('ai:deleteCustom', (s, id) => s.deleteCustom(id));
  h('ai:ask', (s, req) => s.ask(req));
  h('ai:transcribe', (s, req) => s.transcribe(req));
  h('ai:probe', (s, q) => s.probe(q));
  h('ai:localModels', (s) => s.localModels());
}

module.exports = { register };
