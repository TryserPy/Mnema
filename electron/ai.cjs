// ИИ-помощник на Windows и Linux: общая логика — в shared/aiCore.mjs и shared/refrainClient.mjs, здесь только сеть,
// файлы настроек и шифрование ключей средствами системы (safeStorage).
// electron берётся при первом обращении: так фабрику refrainParts можно проверить тестом без самого Electron.
const electron = () => require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { isOwnPage, keyStorageInfo, writePrivate } = require('./secure.cjs');

const CONFIG_FILE = () => path.join(electron().app.getPath('userData'), 'ai.json');

const store = {
  read() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8'));
    } catch {
      return {};
    }
  },
  write(c) {
    writePrivate(CONFIG_FILE(), JSON.stringify(c, null, 1)); // 0600: в файле лежат ключи ИИ
  },
  encrypt(text) {
    const { safeStorage } = electron();
    if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(text).toString('base64');
    return 'raw:' + Buffer.from(text, 'utf8').toString('base64');
  },
  decrypt(stored) {
    if (!stored) return '';
    const { safeStorage } = electron();
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

// ---------- Refrain ИИ: сессия и ключ устройства ----------
// Секретная часть ключа устройства и токены лежат только зашифрованными safeStorage. Без настоящего хранилища
// (Linux без GNOME Keyring/KWallet — «basic_text») вход в Refrain ИИ не разрешается: secure() → false.
// Фабрика отдельно от Electron, чтобы её проверяли тесты (src/v131-refrain.test.ts).
function refrainParts({ safeStorage: ss, keyFile, cacheFile, platform = process.platform }) {
  const secureStorage = () => keyStorageInfo(ss, platform).encrypted;
  const readJson = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  };
  const readFile = () => readJson(keyFile);
  const writeFile = (f) => writePrivate(keyFile, JSON.stringify(f));
  const seal = (text) => {
    if (!secureStorage()) throw new Error('no secure storage');
    return ss.encryptString(text).toString('base64');
  };
  const unseal = (b64) => ss.decryptString(Buffer.from(b64, 'base64'));

  const store = {
    read() {
      const f = readFile();
      if (typeof f.session !== 'string') return null;
      try {
        return JSON.parse(unseal(f.session));
      } catch {
        return null; // файл с другого компьютера или пользователя — не расшифровать
      }
    },
    write(sess) {
      const f = readFile();
      if (sess) f.session = seal(JSON.stringify(sess));
      else delete f.session;
      writeFile(f);
    },
    readCache: () => readJson(cacheFile),
    writeCache: (c) => writePrivate(cacheFile, JSON.stringify(c))
  };

  let deviceKey = null; // расшифрованный ключ живёт только в памяти главного процесса
  const signer = {
    async secure() {
      return secureStorage();
    },
    async publicKey() {
      const f = readFile();
      if (typeof f.key === 'string' && typeof f.pub === 'string') return f.pub;
      const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      f.key = seal(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
      f.pub = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
      writeFile(f);
      deviceKey = pair.privateKey;
      return f.pub;
    },
    async sign(message) {
      if (!deviceKey) {
        const f = readFile();
        if (typeof f.key !== 'string') throw new Error('no device key');
        deviceKey = crypto.createPrivateKey(unseal(f.key));
      }
      return crypto.sign('sha256', Buffer.from(message, 'utf8'), { key: deviceKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    },
    async reset() {
      deviceKey = null;
      const f = readFile();
      delete f.key;
      delete f.pub;
      writeFile(f);
    }
  };
  return { store, signer };
}

let servicePromise = null;
function service() {
  servicePromise ??= Promise.all([import(pathToFileURL(path.join(__dirname, '..', 'shared', 'aiCore.mjs')).href), import(pathToFileURL(path.join(__dirname, '..', 'shared', 'refrainClient.mjs')).href)]).then(([core, rc]) => {
    const { app, safeStorage } = electron();
    const parts = refrainParts({ safeStorage, keyFile: path.join(app.getPath('userData'), 'refrain.json'), cacheFile: path.join(app.getPath('userData'), 'refrain-cache.json') });
    const refrain = rc.createRefrainClient({ http, ...parts, platform: rc.refrainPlatform(process.platform), appVersion: app.getVersion() });
    return { ...core.createAiService({ http, store, refrain }), refrain };
  });
  return servicePromise;
}

/** Снимок окна для «Сообщить о проблеме»: JPEG до 1280 px по ширине. Ученик видит его до отправки. */
async function screenshot(e) {
  const win = electron().BrowserWindow.fromWebContents(e.sender);
  if (!win) return null;
  let img = await win.webContents.capturePage();
  const { width } = img.getSize();
  if (width > 1280) img = img.resize({ width: 1280 });
  for (const q of [70, 50, 35]) {
    const jpg = img.toJPEG(q);
    if (jpg.length < 1024 * 1024) return jpg.toString('base64');
  }
  return null;
}

function register() {
  const { ipcMain, safeStorage } = electron();
  const h = (name, fn) => ipcMain.handle(name, async (_e, arg) => fn(await service(), arg));
  h('ai:getConfig', (s) => s.getConfig());
  h('ai:setConfig', (s, patch) => s.setConfig(patch));
  h('ai:saveCustom', (s, draft) => s.saveCustom(draft || {}));
  h('ai:deleteCustom', (s, id) => s.deleteCustom(id));
  h('ai:ask', (s, req) => s.ask(req));
  h('ai:transcribe', (s, req) => s.transcribe(req));
  h('ai:probe', (s, q) => s.probe(q));
  h('ai:localModels', (s) => s.localModels());
  // Честно о том, как хранятся ключи: на Linux без хранилища паролей (GNOME Keyring, KWallet) они почти не защищены.
  ipcMain.handle('ai:keyStorage', () => keyStorageInfo(safeStorage));

  // Refrain ИИ: только своей странице (не встроенным плеерам). Наружу уходят маска почты, лимит и устройства — токенов и ключей тут нет.
  const r = (name, fn) =>
    ipcMain.handle(name, async (e, arg) => {
      if (!isOwnPage(e.senderFrame && e.senderFrame.url)) return { ok: false, code: 'bad_request', error: 'Нет доступа.' };
      return fn((await service()).refrain, arg || {}, e);
    });
  r('refrain:status', (c) => c.status());
  r('refrain:loginStart', (c, a) => c.loginStart(a.email));
  r('refrain:loginVerify', (c, a) => c.loginVerify({ email: a.email, code: a.code, invite: a.invite, replaceDevice: a.replaceDevice, deviceName: a.deviceName || require('os').hostname() }));
  r('refrain:me', (c) => c.me());
  r('refrain:invite', (c, a) => c.invite(a.code));
  r('refrain:unbind', (c, a) => c.unbind(a.id));
  r('refrain:deleteAccount', (c) => c.deleteAccount());
  r('refrain:logout', (c) => c.logout());
  r('refrain:bug', (c, a) => c.bug(a));
  r('refrain:screenshot', (_c, _a, e) => screenshot(e).catch(() => null));
}

module.exports = { register, refrainParts };
