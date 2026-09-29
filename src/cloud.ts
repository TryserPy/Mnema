// Облачная копия и синхронизация через WebDAV (Яндекс Диск, Nextcloud, любой WebDAV).
// Скачиваем копию из облака, сливаем с данными на устройстве и кладём результат обратно.
// По желанию шифруем паролем (AES-GCM, ключ из пароля через PBKDF2) — тогда облако видит только шифр.
import { getData, normalizeData, replaceData, updateSettings } from './store';
import { mergeData, type MergeReport } from './sync';
import type { AppData } from './types';

export const CLOUD_FILE = 'mnema-data.json';

export interface CloudSettings {
  url: string; // например https://webdav.yandex.ru
  user: string;
  folder: string; // папка в облаке
  encrypt: boolean;
  auto: boolean;
  lastAt?: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function keyFrom(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptText(text: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
  return JSON.stringify({ mnemaEncrypted: 1, salt: b64(salt), iv: b64(iv), data: b64(data) });
}

export async function decryptText(text: string, password: string): Promise<string> {
  const o = JSON.parse(text) as { mnemaEncrypted?: number; salt: string; iv: string; data: string };
  if (!o.mnemaEncrypted) return text;
  if (!password) throw new Error('Копия в облаке зашифрована — введи пароль шифрования.');
  try {
    const key = await keyFrom(password, unb64(o.salt));
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) as BufferSource }, key, unb64(o.data) as BufferSource));
  } catch {
    throw new Error('Пароль шифрования не подходит.');
  }
}

function basic(user: string, pass: string) {
  const bytes = enc.encode(`${user}:${pass}`);
  return 'Basic ' + b64(bytes);
}

function fileUrl(c: CloudSettings) {
  const base = c.url.trim().replace(/\/+$/, '');
  const folder = c.folder.trim().replace(/^\/+|\/+$/g, '');
  return { dir: `${base}/${folder.split('/').map(encodeURIComponent).join('/')}`, file: `${base}/${folder ? folder.split('/').map(encodeURIComponent).join('/') + '/' : ''}${CLOUD_FILE}` };
}

function httpError(status: number, text: string): Error {
  if (status === 401) return new Error('Облако не приняло логин или пароль. Для Яндекс Диска нужен пароль приложения (Яндекс ID → Безопасность → Пароли приложений → «Файлы»).');
  if (status === 403) return new Error('Нет доступа к папке в облаке.');
  if (status === 507) return new Error('В облаке закончилось место.');
  if (status === 0) return new Error('Нет связи с облаком. Проверь интернет. ' + text);
  return new Error(`Облако ответило ошибкой ${status}. ${text.slice(0, 120)}`);
}

export interface CloudResult {
  report: MergeReport | null;
  uploadedBytes: number;
}

/** Синхронизация с облаком: скачать → слить → загрузить. */
export async function cloudSync(c: CloudSettings, pass: string, encPass: string, onStep?: (s: string) => void): Promise<CloudResult> {
  const http = window.mnemaApi?.http;
  if (!http) throw new Error('Облако работает в приложении Мнема (Windows или Android).');
  if (c.encrypt && !encPass) throw new Error('Включено шифрование — задай пароль шифрования.');
  if (!/^https:\/\//i.test(c.url) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(c.url)) throw new Error('Адрес облака должен начинаться с https://');
  const auth = { authorization: basic(c.user, pass) };
  const { dir, file } = fileUrl(c);
  onStep?.('Проверяю облако…');
  const got = await http({ url: file, method: 'GET', headers: auth, timeout: 180000 });
  let report: MergeReport | null = null;
  if (got.status === 200) {
    onStep?.('Объединяю с копией из облака…');
    const text = await decryptText(got.text, encPass);
    let remote: AppData;
    try {
      remote = normalizeData(JSON.parse(text));
    } catch {
      throw new Error('Файл в облаке повреждён или это не данные Мнемы.');
    }
    const merged = mergeData(getData(), remote);
    replaceData(merged.data);
    report = merged.report;
  } else if (got.status === 404) {
    onStep?.('Создаю папку в облаке…');
    if (c.folder.trim()) {
      const mk = await http({ url: dir, method: 'MKCOL', headers: auth, timeout: 30000 });
      if (![201, 405, 301, 200].includes(mk.status)) throw httpError(mk.status, mk.text);
    }
  } else throw httpError(got.status, got.text);

  onStep?.('Загружаю в облако…');
  const json = JSON.stringify(getData());
  const body = c.encrypt ? await encryptText(json, encPass) : json;
  const put = await http({ url: file, method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body, timeout: 300000 });
  if (![200, 201, 204].includes(put.status)) throw httpError(put.status, put.text);
  updateSettings({ cloud: { ...c, lastAt: new Date().toISOString() } });
  return { report, uploadedBytes: body.length };
}
