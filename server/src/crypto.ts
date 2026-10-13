// Криптография на WebCrypto: base64url, SHA-256, HMAC, ECDSA P-256, PBKDF2, случайные строки.
const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url');
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export function fromB64(s: string): Uint8Array {
  const b = atob(s);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export const hex = (bytes: ArrayBuffer | Uint8Array): string => [...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
}
export const sha256hex = async (data: string | Uint8Array): Promise<string> => hex(await sha256(data));

const hmacKeys = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string | Uint8Array): Promise<CryptoKey> {
  const id = typeof secret === 'string' ? secret : hex(secret);
  let k = hmacKeys.get(id);
  if (!k) {
    k = crypto.subtle.importKey('raw', typeof secret === 'string' ? enc.encode(secret) : secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    if (hmacKeys.size > 32) hmacKeys.clear();
    hmacKeys.set(id, k);
  }
  return k;
}
export async function hmac(secret: string | Uint8Array, data: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)));
}
/** HMAC с назначением: один TOKEN_SECRET, но разные ключи для токенов, кодов, IP и PoW. */
export const tagged = async (secret: string, purpose: string, data: string): Promise<string> => b64url(await hmac(secret, `${purpose}\u0000${data}`));

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
export function randomId(prefix: string): string {
  return prefix + '_' + randomToken(12);
}
export function randomDigits(n: number): string {
  const a = crypto.getRandomValues(new Uint32Array(n));
  return [...a].map((x) => String(x % 10)).join('');
}

/** Проверка подписи устройства: ECDSA P-256 / SHA-256, ключ SPKI, подпись r‖s (64 байта). */
export async function verifyDevice(publicKeySpkiB64url: string, signatureB64url: string, message: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('spki', fromB64url(publicKeySpkiB64url), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sig = fromB64url(signatureB64url);
    if (sig.length !== 64) return false;
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, enc.encode(message));
  } catch {
    return false;
  }
}

/** Ключ устройства годится: P-256 SPKI. */
export async function validDeviceKey(spkiB64url: string): Promise<boolean> {
  if (typeof spkiB64url !== 'string' || spkiB64url.length > 200) return false;
  try {
    await crypto.subtle.importKey('spki', fromB64url(spkiB64url), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return true;
  } catch {
    return false;
  }
}

/** PIN: «pbkdf2$итерации$соль(b64url)$хэш(b64url)» (scripts/pin-hash.mjs). */
export async function checkPin(stored: string | undefined, pin: string): Promise<boolean> {
  if (!stored || !/^\d{6}$/.test(pin)) return false;
  const [alg, it, salt, want] = stored.split('$');
  const iterations = Number(it);
  if (alg !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 1 || iterations > 100000 || !salt || !want) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64url(salt), iterations }, key, 256);
  return safeEqual(b64url(bits), want);
}
