// Секреты веб-версии (ключи ИИ, пароль и токен облака): зашифрованы AES-GCM неизвлекаемым ключом из IndexedDB.
// Раньше лежали в localStorage в base64 — их видел любой, кто открыл хранилище сайта или скопировал профиль браузера.
// Ключ нельзя выгрузить из браузера, поэтому копия localStorage без самого профиля бесполезна. От вредного кода на самой
// странице это не защищает (он может попросить расшифровать) — от него защищает CSP.
// Синхронный доступ (так устроен shared/aiCore.mjs): при запуске всё расшифровывается в память, запись — в фоне.
import { vaultKey } from './webStorage';

const STORE = 'mnema-vault';
const secrets = new Map<string, string>();
let key: CryptoKey | null = null;
let saving: Promise<void> = Promise.resolve();

const b64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** Прежний формат (до 1.32): base64 строки UTF-8. */
export const legacyDecode = (s: string): string => {
  try {
    return new TextDecoder().decode(unb64(s));
  } catch {
    return '';
  }
};

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* закрытый режим — секрет просто не запомнится */
  }
}

/** Загрузить и расшифровать. Без IndexedDB/WebCrypto секреты живут только до закрытия вкладки (на диск открытым текстом не пишутся). */
export async function initVault(): Promise<void> {
  key = await vaultKey();
  const raw = lsGet(STORE);
  if (!key || !raw) return;
  try {
    const { iv, data } = JSON.parse(raw) as { iv: string; data: string };
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) as BufferSource }, key, unb64(data) as BufferSource);
    for (const [k, v] of Object.entries(JSON.parse(new TextDecoder().decode(plain)) as Record<string, string>)) secrets.set(k, v);
  } catch {
    /* ключ сменился (очистили базу) — секреты придётся ввести заново */
  }
}

function persist(): void {
  if (!key) return;
  const k = key;
  const snapshot = JSON.stringify(Object.fromEntries(secrets));
  saving = saving.then(async () => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(snapshot)));
    lsSet(STORE, JSON.stringify({ iv: b64(iv), data: b64(data) }));
  }).catch(() => undefined);
}

export function vaultGet(name: string): string {
  return secrets.get(name) ?? '';
}

export function vaultSet(name: string, value: string): void {
  if (value) secrets.set(name, value);
  else secrets.delete(name);
  persist();
}

/** Убрать ключи ИИ, на которые больше нет ссылок (ключ заменили или удалили). */
export function vaultPrune(prefix: string, keep: Set<string>): void {
  let changed = false;
  for (const k of [...secrets.keys()]) if (k.startsWith(prefix) && !keep.has(k)) changed = secrets.delete(k) || changed;
  if (changed) persist();
}

/** Дождаться записи (для тестов и перед закрытием). */
export const vaultSaved = (): Promise<void> => saving;

/**
 * Перенести секреты из прежнего формата: «mnema-secret:имя» (base64) → хранилище, старые строки стереть.
 * Ключи ИИ («ks:base64» внутри mnema-ai) переносит createApi при чтении настроек ИИ.
 */
export function migrateLegacySecrets(): void {
  let moved = false;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('mnema-secret:')) continue;
      const v = legacyDecode(localStorage.getItem(k) ?? '');
      if (v && !secrets.has(k.slice(13))) secrets.set(k.slice(13), v);
      if (key) localStorage.removeItem(k);
      moved = true;
    }
  } catch {
    /* нет localStorage */
  }
  if (moved) persist();
}
