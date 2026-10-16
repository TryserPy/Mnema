// Клиент Refrain ИИ (1.31): вход по почте, ключ устройства, подпись запросов, токены, задачи, кэш ответов, «Сообщить о проблеме».
// Один код для Electron (главный процесс) и Android (окно приложения). Сеть, хранилище и подпись передаются снаружи:
// секретная часть ключа устройства живёт только в safeStorage (Electron) или Android Keystore — сюда приходит лишь готовая подпись.
// Токены и ключи никуда не пишутся, кроме переданного хранилища (оно шифрует), и не попадают в тексты ошибок.
import { API_PREFIX, FIELD_LIMITS, H, TASKS, TASK_FIELDS, canonicalString, powOk } from './refrain/api.mjs';

/** Адрес сервера Refrain ИИ (Cloudflare Worker, docs/refrain-1.31/launch.md). Один на всё приложение. */
export const REFRAIN_API = 'https://refrain-ai.mnema-ai.workers.dev';

/** Ответы Refrain ИИ помнятся на устройстве 7 дней: повтор того же фото или текста бесплатный. */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CACHE_MAX = 60;

/** При этих ошибках Refrain ИИ запрос уходит следующему по порядку (свой ключ, без интернета). network — нет связи с сервером. */
export const FALLBACK_CODES = ['limit_day', 'limit_month', 'paused', 'access_closed', 'blocked', 'upstream', 'network'];

/** Платформа для заголовка x-refrain-app и устройства: сервер знает только windows, linux и android. */
export function refrainPlatform(p) {
  return p === 'win32' || p === 'windows' ? 'windows' : p === 'android' ? 'android' : 'linux';
}

/** Обновить токен доступа заранее, если до конца осталось меньше этого. */
const REFRESH_AHEAD_MS = 30 * 1000;

// ---------- SHA-256 (синхронно, без зависимостей: PoW, хэш тела для подписи, ключ кэша) ----------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const W = new Uint32Array(64);
const enc = new TextEncoder();
// Рабочий буфер для коротких сообщений (PoW, строка подписи): без выделения памяти на каждый хэш.
const SMALL = new Uint8Array(512);
const SMALL_VIEW = new DataView(SMALL.buffer);

/** SHA-256 первых len байт msg → out (32 байта). */
function hashInto(msg, len, out) {
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = total <= SMALL.length ? SMALL : new Uint8Array(total);
  const dv = buf === SMALL ? SMALL_VIEW : new DataView(buf.buffer);
  buf.set(len === msg.length ? msg : msg.subarray(0, len));
  buf.fill(0, len, total);
  buf[len] = 0x80;
  const bits = len * 8;
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(total - 4, bits >>> 0);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const hs = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < 8; i++) {
    const v = hs[i];
    out[i * 4] = v >>> 24;
    out[i * 4 + 1] = (v >>> 16) & 0xff;
    out[i * 4 + 2] = (v >>> 8) & 0xff;
    out[i * 4 + 3] = v & 0xff;
  }
  return out;
}

/** SHA-256 строки (UTF-8) или байтов → 32 байта. */
export function sha256(data) {
  const msg = typeof data === 'string' ? enc.encode(data) : data;
  return hashInto(msg, msg.length, new Uint8Array(32));
}

export const hex = (bytes) => Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
export const sha256hex = (data) => hex(sha256(data));

export function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64(s) {
  const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** Подпись ECDSA из DER (так отдаёт Android Keystore) → r‖s, 64 байта (так ждёт сервер). null — не DER-подпись P-256. */
export function derToP1363(der) {
  const d = der instanceof Uint8Array ? der : new Uint8Array(der);
  let i = 0;
  if (d[i++] !== 0x30) return null;
  let len = d[i++];
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | d[i++];
  }
  if (i + len !== d.length) return null;
  const out = new Uint8Array(64);
  for (let part = 0; part < 2; part++) {
    if (d[i++] !== 0x02) return null;
    let n = d[i++];
    let v = d.subarray(i, i + n);
    i += n;
    while (v.length > 32 && v[0] === 0) v = v.subarray(1);
    if (v.length > 32 || !n) return null;
    out.set(v, part * 32 + 32 - v.length);
  }
  return i === d.length ? out : null;
}

/** Proof-of-work: перебор, пока SHA-256(challenge + ':' + i) не начнётся с difficulty нулевых бит. Время от времени уступает поток. */
export async function solvePow(challenge, difficulty, { yieldEvery = 20000, pause = () => new Promise((r) => setTimeout(r, 0)), limit = 1e8 } = {}) {
  const prefix = enc.encode(challenge + ':');
  const msg = new Uint8Array(prefix.length + 20);
  msg.set(prefix);
  const out = new Uint8Array(32);
  for (let i = 0; i < limit; i++) {
    const digits = String(i);
    for (let k = 0; k < digits.length; k++) msg[prefix.length + k] = digits.charCodeAt(k);
    if (powOk(hashInto(msg, prefix.length + digits.length, out), difficulty)) return digits;
    if (i && i % yieldEvery === 0) await pause();
  }
  throw new Error('pow');
}

// ---------- Ошибки ----------

/** Секунды → «45 с», «3 мин», «2 ч». */
function waitText(sec) {
  const n = Math.max(1, Math.ceil(Number(sec) || 60));
  if (n < 120) return `${n} с`;
  if (n < 7200) return `${Math.ceil(n / 60)} мин`;
  return `${Math.ceil(n / 3600)} ч`;
}

function untilText(until) {
  const t = until ? Date.parse(until) : NaN;
  if (!Number.isFinite(t)) return '';
  return ' до ' + new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/**
 * Что показать ученику по коду ошибки (contracts.md, «Коды ошибок»). Текст приложения, а не сервера: так он одинаковый везде
 * и без причин срабатывания защиты. extra — retryAfter, until, attemptsLeft из ответа.
 */
export function refrainMessage(code, extra = {}) {
  switch (code) {
    case 'limit_day':
      return 'На сегодня бесплатные страницы Refrain ИИ закончились. Лимит обновится в 00:00 по Москве.';
    case 'limit_month':
      return 'Бесплатные страницы Refrain ИИ на этот месяц закончились.';
    case 'paused':
      return 'Refrain ИИ на паузе. Попробуй позже или подключи свой ключ.';
    case 'access_closed':
      return 'Refrain ИИ сейчас в закрытом тесте. Если у тебя есть приглашение, введи его: Настройки → ИИ-помощник.';
    case 'blocked':
      return `Доступ к Refrain ИИ приостановлен${untilText(extra.until)}.`;
    case 'too_fast':
      return `Слишком часто. Подожди ${waitText(extra.retryAfter)} и попробуй ещё раз.`;
    case 'bad_request':
    case 'payload_too_large':
      return 'Refrain ИИ не принял запрос — это ошибка приложения. Нажми «Сообщить о проблеме», пожалуйста.';
    case 'upstream':
      return 'Сбой ИИ, попробуй ещё раз.';
    case 'internal':
      return 'Сбой на сервере Refrain ИИ. Попробуй позже.';
    case 'token_expired':
      return 'Вход в Refrain ИИ устарел. Попробуй ещё раз.';
    case 'device_unknown':
    case 'session_revoked':
      return 'Вход в Refrain ИИ на этом устройстве закончился. Войди заново: Настройки → ИИ-помощник.';
    case 'device_limit':
      return 'К аккаунту уже привязано наибольшее число устройств. Выбери, какое отвязать.';
    case 'pow_invalid':
      return 'Проверка устарела. Нажми «Прислать код» ещё раз.';
    case 'email_rejected':
      return 'Эта почта не подходит. Проверь адрес или возьми другую (одноразовые почты не принимаются).';
    case 'code_invalid':
      return 'Неверный или устаревший код.' + (Number.isInteger(extra.attemptsLeft) && extra.attemptsLeft > 0 ? ` Осталось попыток: ${extra.attemptsLeft}.` : ' Попроси новый код.');
    case 'code_locked':
      return `Слишком много попыток. Попробуй через ${waitText(extra.retryAfter)}.`;
    case 'invite_invalid':
      return 'Приглашение не подошло: оно неверное, истекло или им уже воспользовались.';
    case 'network':
      return 'Нет связи с Refrain ИИ. Проверь интернет.';
    case 'signed_out':
      return 'Войди в Refrain ИИ: Настройки → ИИ-помощник.';
    case 'no_secure_storage':
      return 'На этом устройстве нет защищённого хранилища ключей, поэтому Refrain ИИ здесь не включить. Можно пользоваться своим ключом.';
    case 'device_key':
      return 'Не получилось создать или прочитать ключ устройства. Войди в Refrain ИИ заново.';
    default:
      return '';
  }
}

function fail(code, extra = {}) {
  const { error, ...rest } = extra;
  return { ok: false, code, error: refrainMessage(code, rest) || error || 'Ошибка Refrain ИИ.', ...rest };
}

/** Тело запроса /v1/task: только поля контракта, строки — в рамках. Лишнее не отправляем (сервер считает его сигналом). */
export function taskBody(fields, wishes) {
  const b = {};
  if (!fields || typeof fields !== 'object' || !TASKS.includes(fields.task)) return null;
  for (const k of TASK_FIELDS) if (fields[k] !== undefined && fields[k] !== null && fields[k] !== '') b[k] = fields[k];
  if (typeof b.subject === 'string') b.subject = b.subject.slice(0, FIELD_LIMITS.subject);
  if (typeof b.topic === 'string') b.topic = b.topic.slice(0, FIELD_LIMITS.topic);
  if (b.page !== undefined && !(Number.isInteger(b.page) && b.page >= 1 && b.page <= FIELD_LIMITS.page)) delete b.page;
  if (b.image) {
    if (typeof b.image !== 'object' || !FIELD_LIMITS.imageMimes.includes(b.image.mime) || typeof b.image.data !== 'string') return null;
    b.image = { mime: b.image.mime, data: b.image.data };
  }
  if (b.text !== undefined && typeof b.text !== 'string') return null;
  delete b.wishes;
  const w = typeof wishes === 'string' ? wishes.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, FIELD_LIMITS.wishes) : '';
  if (w) b.wishes = w;
  return b;
}

/** Ключ кэша: хэш фото или текста (и указаний — с другими указаниями ответ другой) + задача. Версию промта добавляет кэш. */
export function cacheKey(body) {
  const content = body.image ? body.image.data : body.text || '';
  return sha256hex(`${content}\n${body.wishes || ''}\n${body.subject || ''}\n${body.topic || ''}\n${body.page || ''}`) + '|' + body.task;
}

/**
 * http(url, { method, headers, body, timeout }) → { status, text, error? }
 * store: { read() → сессия | null, write(сессия | null), readCache() → {}, writeCache(obj) } — хранилище шифрует сессию само.
 * signer: { publicKey() → SPKI base64url (создаёт ключ, если его нет), sign(строка) → r‖s base64url, reset(), secure() → можно ли хранить ключ }
 */
export function createRefrainClient({ http, store, signer, platform, appVersion, base = REFRAIN_API, now = () => Date.now(), random = (n) => crypto.getRandomValues(new Uint8Array(n)), pause }) {
  const appHeader = `refrain/${appVersion} (${platform})`;
  let refreshing = null;

  function session() {
    try {
      const s = store.read();
      return s && typeof s.deviceId === 'string' && typeof s.refreshToken === 'string' ? s : null;
    } catch {
      return null;
    }
  }

  function parse(res) {
    if (!res || !res.status) return fail('network');
    let body = null;
    try {
      body = JSON.parse(res.text);
    } catch {
      return fail('internal');
    }
    if (res.status >= 200 && res.status < 300 && body && body.ok !== false) return body;
    const e = body && body.error && typeof body.error === 'object' ? body.error : {};
    const { code, message, ...extra } = e;
    // Текст сервера — только для кода, которого приложение не знает (новый выпуск сервера).
    return fail(typeof code === 'string' ? code : 'internal', { ...extra, ...(typeof message === 'string' && message ? { error: message.slice(0, 300) } : {}) });
  }

  async function plain(path, body, timeout = 30000) {
    const res = await http(base + API_PREFIX + path, { method: 'POST', headers: { 'content-type': 'application/json', [H.app]: appHeader }, body: JSON.stringify(body), timeout });
    return parse(res);
  }

  /** Подписанный запрос. withAccess — с токеном доступа (все, кроме /auth/refresh). */
  async function sendSigned(method, path, raw, s, withAccess, timeout) {
    const time = Math.floor(now());
    const nonce = b64url(random(16));
    const fullPath = API_PREFIX + path;
    const message = canonicalString({ method, path: fullPath, bodySha256Hex: sha256hex(raw), time, nonce, deviceId: s.deviceId });
    let signature;
    try {
      signature = await signer.sign(message);
    } catch {
      return fail('device_key');
    }
    const headers = { [H.device]: s.deviceId, [H.time]: String(time), [H.nonce]: nonce, [H.signature]: signature, [H.app]: appHeader };
    if (raw) headers['content-type'] = 'application/json';
    if (withAccess) headers[H.auth] = `Bearer ${s.accessToken}`;
    return parse(await http(base + fullPath, { method, headers, body: raw || undefined, timeout }));
  }

  function clearCache() {
    try {
      store.writeCache({ entries: {}, versions: {} });
    } catch {
      /* кэш необязателен */
    }
  }

  async function forget() {
    try {
      store.write(null);
    } catch {
      /* нечего стирать */
    }
    try {
      await signer.reset();
    } catch {
      /* ключа уже нет */
    }
  }

  /**
   * Обновление токенов строго по одному: все, кому нужен свежий токен, ждут одно и то же обновление.
   * staleAccess — токен, с которым пришёл отказ: если его уже сменили, второй раз не обновляем (повтор старого токена обновления = кража).
   */
  function refresh(staleAccess) {
    const s = session();
    if (!s) return Promise.resolve(fail('signed_out'));
    if (refreshing) return refreshing;
    if (staleAccess && s.accessToken !== staleAccess) return Promise.resolve({ ok: true });
    refreshing = (async () => {
      const r = await sendSigned('POST', '/auth/refresh', JSON.stringify({ refreshToken: s.refreshToken }), s, false, 30000);
      if (r.ok === false) {
        if (r.code === 'session_revoked' || r.code === 'device_unknown') await forget();
        return r;
      }
      store.write({ ...s, accessToken: r.accessToken, refreshToken: r.refreshToken, accessExpiresAt: Date.parse(r.accessExpiresAt) || now() + 60000, quota: r.quota ?? s.quota });
      return { ok: true };
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function signed(method, path, body, timeout = 60000) {
    if (refreshing) await refreshing;
    let s = session();
    if (!s) return fail('signed_out');
    if (!s.accessToken || (s.accessExpiresAt || 0) - now() < REFRESH_AHEAD_MS) {
      const u = await refresh(s.accessToken);
      if (u.ok === false) return u;
      s = session();
    }
    const raw = body === undefined ? '' : JSON.stringify(body);
    let r = await sendSigned(method, path, raw, s, true, timeout);
    if (r.ok === false && r.code === 'token_expired') {
      const u = await refresh(s.accessToken);
      if (u.ok === false) return u;
      s = session();
      if (!s) return fail('signed_out');
      r = await sendSigned(method, path, raw, s, true, timeout);
    }
    if (r.ok === false && (r.code === 'session_revoked' || r.code === 'device_unknown')) await forget();
    return r;
  }

  function saveQuota(quota) {
    const s = session();
    if (s && quota) store.write({ ...s, quota });
  }

  // ---------- Кэш ответов ----------

  function readCache() {
    try {
      const c = store.readCache();
      return c && typeof c === 'object' && c.entries && typeof c.entries === 'object' ? c : { entries: {}, versions: {} };
    } catch {
      return { entries: {}, versions: {} };
    }
  }
  function cached(key, task) {
    const c = readCache();
    const v = c.versions && c.versions[task];
    const e = v && c.entries[`${key}|${v}`];
    return e && now() - e.at < CACHE_TTL_MS ? e : null;
  }
  function remember(key, task, promptVersion, text, format) {
    const c = readCache();
    const t = now();
    c.versions = { ...(c.versions || {}), [task]: promptVersion };
    c.entries[`${key}|${promptVersion}`] = { at: t, text, format };
    const keep = Object.entries(c.entries)
      .filter(([, e]) => e && t - e.at < CACHE_TTL_MS)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, CACHE_MAX);
    c.entries = Object.fromEntries(keep);
    try {
      store.writeCache(c);
    } catch {
      /* кэш необязателен */
    }
  }

  async function powFor(purpose) {
    const c = await plain('/auth/pow', { purpose });
    if (c.ok === false) return c;
    try {
      return { ok: true, pow: { challenge: c.challenge, solution: await solvePow(c.challenge, c.difficulty, pause ? { pause } : {}) } };
    } catch {
      return fail('pow_invalid');
    }
  }

  return {
    /** Вход выполнен на этом устройстве. */
    signedIn: () => Boolean(session()),
    /** Для экрана настроек: вошёл ли ученик, маска почты, остаток лимита и можно ли здесь хранить ключ устройства. Токенов здесь нет. */
    async status() {
      const s = session();
      let secure = false;
      try {
        secure = Boolean(await signer.secure());
      } catch {
        secure = false;
      }
      return s ? { signedIn: true, secure, emailMasked: s.emailMasked || '', quota: s.quota || null } : { signedIn: false, secure };
    },

    /** Шаг 1: задачка (≈1 с) и письмо с кодом. Ответ одинаковый для любой почты. */
    async loginStart(email) {
      if (!(await signer.secure())) return fail('no_secure_storage');
      const p = await powFor('login');
      if (p.ok === false) return p;
      const r = await plain('/auth/start', { email: String(email || '').trim(), pow: p.pow });
      return r.ok === false ? r : { ok: true };
    },

    /** Шаг 2: код из письма. Каждый вход — новый ключ устройства. device_limit → повтор с replaceDevice. */
    async loginVerify({ email, code, invite, replaceDevice, deviceName }) {
      if (!(await signer.secure())) return fail('no_secure_storage');
      let publicKey;
      try {
        if (!replaceDevice) {
          store.write(null);
          await signer.reset();
        }
        publicKey = await signer.publicKey();
      } catch {
        return fail('device_key');
      }
      const body = { email: String(email || '').trim(), code: String(code || '').trim(), device: { publicKey, name: String(deviceName || 'Устройство').slice(0, 60), platform } };
      if (invite) body.invite = String(invite).trim().toUpperCase();
      if (replaceDevice) body.replaceDevice = replaceDevice;
      const r = await plain('/auth/verify', body);
      if (r.ok === false) return r;
      store.write({ deviceId: r.deviceId, accessToken: r.accessToken, refreshToken: r.refreshToken, accessExpiresAt: Date.parse(r.accessExpiresAt) || now(), emailMasked: r.emailMasked, quota: r.quota });
      return { ok: true, emailMasked: r.emailMasked, quota: r.quota };
    },

    /** Задача. fields — AiRequest.refrain, wishes — «Свои указания». Повтор того же фото или текста за 7 дней берётся из кэша. */
    async task(fields, wishes) {
      const body = taskBody(fields, wishes ?? fields?.wishes);
      if (!body) return fail('bad_request');
      const key = cacheKey(body);
      const hit = cached(key, body.task);
      if (hit) return { ok: true, text: hit.text, format: hit.format, cached: true, charged: 0, quota: session()?.quota ?? null };
      if (!session()) return fail('signed_out');
      // Сервер ждёт модель до ~3 минут (с повтором, если рассуждение съело ответ) — клиент ждёт дольше сервера.
      const r = await signed('POST', '/task', body, 240000);
      if (r.quota) saveQuota(r.quota);
      if (r.ok === false) return r;
      remember(key, body.task, r.promptVersion, r.text, r.format);
      return { ok: true, text: r.text, format: r.format, charged: r.charged, quota: r.quota };
    },

    async me() {
      const r = await signed('GET', '/me');
      if (r.ok !== false) {
        const s = session();
        if (s) store.write({ ...s, quota: r.quota, emailMasked: r.emailMasked });
      }
      return r;
    },
    async invite(code) {
      const r = await signed('POST', '/invite', { code: String(code || '').trim().toUpperCase() });
      if (r.quota) saveQuota(r.quota);
      return r;
    },
    async unbind(deviceId) {
      if (!/^dev_[A-Za-z0-9_-]{16}$/.test(String(deviceId))) return fail('bad_request');
      const mine = session()?.deviceId === deviceId;
      const r = await signed('DELETE', '/devices/' + deviceId);
      if (r.ok !== false && mine) await forget();
      return r;
    },
    async deleteAccount() {
      const r = await signed('DELETE', '/account');
      if (r.ok !== false) {
        await forget();
        clearCache();
      }
      return r;
    },
    /** Выйти: закрыть сессию на сервере (если есть связь) и забыть токены и ключ здесь. */
    async logout() {
      if (session()) await signed('POST', '/auth/logout');
      await forget();
      clearCache();
      return { ok: true };
    },

    /** «Сообщить о проблеме»: без входа, с задачкой. Ответ — номер обращения. */
    async bug(report) {
      const p = await powFor('bug');
      if (p.ok === false) return p;
      const r = await plain('/bug', { ...report, pow: p.pow }, 60000);
      return r.ok === false ? r : { ok: true, id: r.id };
    }
  };
}
