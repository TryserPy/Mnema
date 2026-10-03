// Шифрование синхронизации по Wi-Fi — общее для компьютера (главный процесс Electron) и окна (Windows и Android).
// Код с экрана (12 знаков, ~60 бит) превращается в ключ AES-GCM; в сеть код не уходит. Перехватчик видит только шифр,
// а подменённое или чужое сообщение не расшифровывается — обмен прерывается. Только WebCrypto: он есть и в Node, и в окне.

/** Алфавит Крокфорда: без I, L, O, U — их легко спутать с 1 и 0. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LEN = 12;
const SALT = 'mnema-sync-2';
const ITERATIONS = 200000;

/** Новый код синхронизации: 12 случайных знаков. */
export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return Array.from(bytes, (b) => CODE_ALPHABET[b & 31]).join('');
}

// Русская раскладка: похожие буквы засчитываем за латинские, чтобы код можно было набрать не переключаясь.
const CYR = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: '0', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y', З: '3' };

/** Код, как его ввели (с пробелами, дефисами, строчными, O вместо 0), → 12 знаков; не код — пустая строка. */
export function normCode(s) {
  const out = String(s || '')
    .toUpperCase()
    .replace(/[А-ЯЁ]/g, (ch) => CYR[ch] ?? ch)
    .replace(/[\s\-–—_.]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return out.length === CODE_LEN && [...out].every((ch) => CODE_ALPHABET.includes(ch)) ? out : '';
}

/** Как показывать код: 4-4-4. */
export function formatCode(code) {
  return String(code).replace(/(.{4})(?=.)/g, '$1-');
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Ключ из кода. Медленный (PBKDF2), поэтому считается один раз на сеанс. */
export async function syncKey(code) {
  const c = normCode(code);
  if (!c) throw new Error('Неверный код синхронизации');
  const base = await crypto.subtle.importKey('raw', enc.encode(c), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Зашифровать сообщение. label — что это за сообщение (запрос или ответ, какой адрес): чужое на его место не подставить. */
export async function seal(key, label, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(label) }, key, enc.encode(JSON.stringify(obj))));
  return JSON.stringify({ v: 2, iv: b64(iv), data: b64(data) });
}

/** Расшифровать сообщение; подделка, чужой код или не тот label — ошибка. */
export async function open(key, label, text) {
  let o;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error('Не зашифрованное сообщение');
  }
  if (!o || o.v !== 2 || typeof o.iv !== 'string' || typeof o.data !== 'string') throw new Error('Не зашифрованное сообщение');
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv), additionalData: enc.encode(label) }, key, unb64(o.data));
  } catch {
    throw new Error('Сообщение не прошло проверку');
  }
  return JSON.parse(dec.decode(plain));
}

/** Случайная метка запроса: ответ должен вернуть её же (старый перехваченный ответ не подсунуть). */
export function nonce() {
  return b64(crypto.getRandomValues(new Uint8Array(12)));
}
