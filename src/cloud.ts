// Облачная копия и синхронизация: Яндекс Диск через REST API и вход в Яндекс (OAuth, только папка приложения),
// либо любой WebDAV (Nextcloud, платный Яндекс Диск). Скачиваем копию из облака, сливаем с данными на устройстве и кладём результат обратно.
// По желанию шифруем паролем (AES-GCM, ключ из пароля через PBKDF2) — тогда облако видит только шифр.
import { forSync, getData, normalizeData, replaceData, updateSettings } from './store';
import { mergeData, trashedText, type MergeReport } from './sync';
import { toast } from './components/ui';
import type { AppData } from './types';
import { YANDEX_API, yandexError } from './yandexDisk';
import { appHttp } from './devMode';

export const CLOUD_FILE = 'mnema-data.json';

export interface CloudSettings {
  /** yandex — Яндекс Диск через вход в Яндекс (REST API); webdav (или нет поля, до 1.32) — логин и пароль WebDAV. */
  kind?: 'yandex' | 'webdav';
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

/** Ошибка облака с кодом: по нему окно облака показывает кнопку («Войти через Яндекс» при 402 у WebDAV). */
export class CloudError extends Error {
  constructor(
    message: string,
    public code: 'webdav_paid' | 'auth' | 'other' = 'other'
  ) {
    super(message);
  }
}

function httpError(status: number, text: string, yandex = false): Error {
  // Яндекс Диск по WebDAV на бесплатном тарифе: 402 «WebDAV is not available for the free tariff».
  if (status === 402) return new CloudError(yandex ? 'Яндекс больше не даёт WebDAV на бесплатном тарифе. Подключи Диск через вход в Яндекс — это бесплатно и без пароля приложения.' : 'Облако просит оплату за этот способ доступа (WebDAV).', 'webdav_paid');
  if (status === 401) return new CloudError(yandex ? 'Яндекс не принял логин или пароль приложения. Проще подключить Диск через вход в Яндекс.' : 'Облако не приняло логин или пароль.', 'auth');
  if (status === 403) return new Error('Нет доступа к папке в облаке.');
  if (status === 507) return new Error('В облаке закончилось место.');
  if (status === 0) return new Error('Нет связи с облаком. Проверь интернет.');
  return new Error(`Облако ответило ошибкой ${status}. ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
}

type Http = NonNullable<NonNullable<Window['mnemaApi']>['http']>;
type HttpRes = { status: number; text: string };

/** Сбой сети, перегрузка, «занято» — повторить с паузой 1, 2, 4 с. Остальные ответы — сразу. */
export async function withRetry(call: () => Promise<HttpRes>, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<HttpRes> {
  let r = await call();
  for (let i = 0; i < 3 && [0, 423, 429, 500, 502, 503, 504].includes(r.status); i++) {
    await wait(1000 * 2 ** i);
    r = await call();
  }
  return r;
}

/** Где лежит копия: прочитать (null — копии ещё нет), подготовить папку, записать. */
export interface CloudBackend {
  read(): Promise<string | null>;
  prepare(): Promise<void>;
  write(body: string): Promise<void>;
}

export function webdavBackend(http: Http, c: CloudSettings, pass: string): CloudBackend {
  if (!/^https:\/\//i.test(c.url) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(c.url)) throw new Error('Адрес облака должен начинаться с https://');
  const yandex = /webdav\.yandex\./i.test(c.url);
  const auth = { authorization: basic(c.user, pass) };
  const { dir, file } = fileUrl(c);
  return {
    async read() {
      const got = await withRetry(() => http({ url: file, method: 'GET', headers: auth, timeout: 180000 }));
      if (got.status === 200) return got.text;
      if (got.status === 404) return null;
      throw httpError(got.status, got.text, yandex);
    },
    async prepare() {
      if (!c.folder.trim()) return;
      const mk = await withRetry(() => http({ url: dir, method: 'MKCOL', headers: auth, timeout: 30000 }));
      if (![201, 405, 301, 200].includes(mk.status)) throw httpError(mk.status, mk.text, yandex);
    },
    async write(body) {
      const put = await withRetry(() => http({ url: file, method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body, timeout: 300000 }));
      if (![200, 201, 204].includes(put.status)) throw httpError(put.status, put.text, yandex);
    }
  };
}

/** Путь в папке приложения на Диске: app:/Refrain/mnema-data.json. Доступ токена — только к этой папке. */
export function yandexPath(folder: string, name = CLOUD_FILE): string {
  const f = folder.trim().replace(/^\/+|\/+$/g, '').replace(/[\\:*?"<>|]/g, '');
  return `app:/${f ? f + '/' : ''}${name}`;
}

/**
 * Яндекс Диск через REST API (cloud-api.yandex.net). Скачать: GET resources/download → href → GET href.
 * Загрузить: GET resources/upload → href → PUT href. Папка: PUT resources (409 — уже есть). Токен уходит только на cloud-api.
 */
export function yandexBackend(http: Http, c: CloudSettings, token: string): CloudBackend {
  if (!token) throw new CloudError('Войди в Яндекс, чтобы подключить Диск.', 'auth');
  const auth = { authorization: `OAuth ${token}`, accept: 'application/json' };
  const api = (path: string, method = 'GET') => withRetry(() => http({ url: YANDEX_API + path, method, headers: auth, timeout: 30000 }));
  const href = (text: string): string => {
    try {
      const u = (JSON.parse(text) as { href?: unknown }).href;
      if (typeof u === 'string' && /^https:\/\//.test(u)) return u;
    } catch {
      /* ниже ошибка */
    }
    throw new Error('Яндекс Диск ответил не так, как ожидалось. Попробуй ещё раз позже.');
  };
  const path = encodeURIComponent(yandexPath(c.folder));
  return {
    async read() {
      const r = await api(`/resources/download?path=${path}`);
      if (r.status === 404) return null;
      if (r.status !== 200) throw yandexError(r.status, r.text);
      const got = await withRetry(() => http({ url: href(r.text), method: 'GET', timeout: 180000 }));
      if (got.status !== 200) throw yandexError(got.status, got.text);
      return got.text;
    },
    async prepare() {
      if (!c.folder.trim()) return;
      const r = await api(`/resources?path=${encodeURIComponent(yandexPath(c.folder, '').replace(/\/$/, ''))}`, 'PUT');
      if (![201, 409].includes(r.status)) throw yandexError(r.status, r.text);
    },
    async write(body) {
      const r = await api(`/resources/upload?path=${path}&overwrite=true`);
      if (r.status !== 200) throw yandexError(r.status, r.text);
      const put = await withRetry(() => http({ url: href(r.text), method: 'PUT', headers: { 'content-type': 'application/json' }, body, timeout: 300000 }));
      if (![200, 201, 202].includes(put.status)) throw yandexError(put.status, put.text);
    }
  };
}

export interface CloudResult {
  report: MergeReport | null;
  uploadedBytes: number;
}

/**
 * Если шифрование включено, файл в облаке обязан быть зашифрован. Незашифрованный файл мог подложить кто угодно с доступом к папке —
 * его не читаем и не сливаем, а синхронизацию останавливаем (свои данные не трогаем и поверх него ничего не загружаем).
 */
export function assertCloudEncrypted(text: string, encrypt: boolean): void {
  if (!encrypt) return;
  let ok = false;
  try {
    const o = JSON.parse(text) as { mnemaEncrypted?: unknown } | null;
    ok = Boolean(o && typeof o === 'object' && o.mnemaEncrypted === 1);
  } catch {
    /* не JSON — ниже та же остановка */
  }
  if (!ok) throw new Error('Файл в облаке не зашифрован — синхронизация остановлена. Если файл подложили, удали его в облаке; если шифрование включено по ошибке, выключи его в настройках облака.');
}

/** Слить копию из облака с данными на устройстве. Если слияние убрало заметную часть данных — они лежат в корзине, об этом сообщаем. */
function mergeRemote(remote: AppData): MergeReport {
  const merged = mergeData(getData(), remote);
  replaceData(merged.data);
  warnTrashed(merged.report);
  return merged.report;
}

/** Предупреждение, если слияние отправило в корзину заметную часть данных. */
export function warnTrashed(r: MergeReport): void {
  if (r.trashed) toast(trashedText(r));
}

/**
 * Синхронизация с облаком: скачать → слить → загрузить. secret — пароль WebDAV или токен Яндекса (по c.kind);
 * в журналы и тексты ошибок ни он, ни логин не попадают.
 */
export async function cloudSync(c: CloudSettings, secret: string, encPass: string, onStep?: (s: string) => void): Promise<CloudResult> {
  const http = appHttp();
  if (!http) throw new Error('Облако работает в приложении Refrain (Windows, Linux или Android).');
  if (c.encrypt && !encPass) throw new Error('Включено шифрование — задай пароль шифрования.');
  const backend = c.kind === 'yandex' ? yandexBackend(http, c, secret) : webdavBackend(http, c, secret);
  onStep?.('Проверяю облако…');
  const got = await backend.read();
  let report: MergeReport | null = null;
  if (got !== null) {
    onStep?.('Объединяю с копией из облака…');
    assertCloudEncrypted(got, c.encrypt);
    const text = await decryptText(got, encPass);
    let remote: AppData;
    try {
      remote = normalizeData(JSON.parse(text));
    } catch {
      throw new Error('Файл в облаке повреждён или это не данные Refrain.');
    }
    report = mergeRemote(remote);
  } else {
    onStep?.('Создаю папку в облаке…');
    await backend.prepare();
  }

  onStep?.('Загружаю в облако…');
  const json = JSON.stringify(forSync(getData()));
  const body = c.encrypt ? await encryptText(json, encPass) : json;
  await backend.write(body);
  updateSettings({ cloud: { ...c, lastAt: new Date().toISOString() } });
  return { report, uploadedBytes: body.length };
}

/** Имя секрета для входа в облако: пароль WebDAV или токен Яндекса. */
export const cloudSecretName = (c: Pick<CloudSettings, 'kind'>): string => (c.kind === 'yandex' ? 'cloud-yandex' : 'cloud-pass');

/**
 * Синхронизировать с облаком по сохранённым настройкам и паролям (автосинхронизация и «потянуть вниз» на «Сегодня»).
 * null — облако не настроено или пароль не сохранён: синхронизировать нечего.
 */
export async function cloudSyncSaved(): Promise<CloudResult | null> {
  const c = getData().settings.cloud;
  const api = window.mnemaApi;
  if (!c || !api?.secretGet) return null;
  const [pass, encPass] = await Promise.all([api.secretGet(cloudSecretName(c)), api.secretGet('cloud-enc')]);
  if (!pass) return null;
  return cloudSync(c, pass, c.encrypt ? (encPass ?? '') : '');
}
