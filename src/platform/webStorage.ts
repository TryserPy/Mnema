// Хранилище данных в браузере (веб-версия). Приложение читает данные синхронно (как из файла на компьютере),
// а IndexedDB асинхронный — поэтому перед запуском всё читается в память (initStorage), а записи уходят в IndexedDB следом.
// Если IndexedDB недоступен (например, закрытое окно в старом браузере), данные лежат в localStorage — как раньше.

const DB_NAME = 'mnema-web';
const KV = 'kv';
const BACKUPS = 'backups';
const DATA_KEY = 'data';
/** Старый путь: до веб-версии Мнема в обычном браузере писала в localStorage (store.ts). */
const LS_KEY = 'mnema-data';
/** Копия, которую успели сохранить синхронно при закрытии вкладки, пока IndexedDB не ответил. */
const LS_PENDING = 'mnema-data-pending';
/** Так store.ts узнаёт, что данные есть, но прочитать их не вышло — тогда он не пишет поверх. */
const READ_ERROR = '!read-error';
const KEEP_BACKUPS = 8;

let db: IDBDatabase | null = null;
let cache: string | null = null;
let useLocal = false;
let chain: Promise<unknown> = Promise.resolve();

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(KV);
        req.result.createObjectStore(BACKUPS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('no db'));
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('aborted'));
  });
}

const get = <T>(store: string, key: string) => tx<T>(store, 'readonly', (s) => s.get(key));
const put = (store: string, key: string, value: string) => tx(store, 'readwrite', (s) => void s.put(value, key));
const del = (store: string, key: string) => tx(store, 'readwrite', (s) => void s.delete(key));
const keys = (store: string) => tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()).then((k) => (k ?? []).map(String));

function ls(op: 'get' | 'set' | 'remove', key: string, value?: string): string | null | boolean {
  try {
    if (op === 'get') return localStorage.getItem(key);
    if (op === 'set') localStorage.setItem(key, value!);
    else localStorage.removeItem(key);
    return true;
  } catch {
    return op === 'get' ? null : false;
  }
}

const dayName = (d = new Date()) => `mnema-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;

/** Раз в день откладываем копию того, что было на момент запуска (как автокопии на компьютере); хранятся последние 8. */
async function dailyBackup(json: string) {
  try {
    const name = dayName();
    const all = await keys(BACKUPS);
    if (!all.includes(name)) {
      await put(BACKUPS, name, json);
      all.push(name);
    }
    for (const old of all.sort().slice(0, Math.max(0, all.length - KEEP_BACKUPS))) await del(BACKUPS, old);
  } catch {
    /* копия — приятное дополнение, запуску она мешать не должна */
  }
}

/** Прочитать данные в память. Вызывать один раз до запуска приложения. */
export async function initStorage(): Promise<void> {
  db = await openDb();
  const legacy = ls('get', LS_KEY) as string | null;
  const pending = ls('get', LS_PENDING) as string | null;
  if (!db) {
    useLocal = true;
    cache = pending || legacy;
    return;
  }
  try {
    const stored = (await get<string>(KV, DATA_KEY)) ?? null;
    // Свежее — то, что успели сохранить при закрытии; потом — IndexedDB; и только потом старый localStorage.
    cache = pending || stored || legacy;
    if (cache && cache !== stored) {
      await put(KV, DATA_KEY, cache);
      ls('remove', LS_PENDING);
      ls('remove', LS_KEY);
    } else if (pending) ls('remove', LS_PENDING);
    if (cache) void dailyBackup(cache);
  } catch {
    cache = READ_ERROR;
  }
}

export const loadData = () => cache;

export function saveData(json: string): Promise<boolean> {
  cache = json;
  chain = chain.then(async () => {
    if (!useLocal) {
      try {
        await put(KV, DATA_KEY, json);
        ls('remove', LS_PENDING);
        return true;
      } catch {
        /* пробуем localStorage ниже */
      }
    }
    return ls('set', LS_KEY, json) === true;
  });
  return chain as Promise<boolean>;
}

/** При закрытии вкладки дождаться IndexedDB нельзя: запись запускаем, а копию кладём в localStorage на случай, если не успеет. */
export function saveDataSync(json: string): boolean {
  cache = json;
  const kept = ls('set', LS_PENDING, json) === true;
  void saveData(json);
  return kept || !useLocal;
}

export async function listBackups(): Promise<{ name: string; size: number }[]> {
  if (!db) return [];
  try {
    const out: { name: string; size: number }[] = [];
    for (const name of (await keys(BACKUPS)).sort().reverse()) out.push({ name, size: ((await get<string>(BACKUPS, name)) ?? '').length });
    return out;
  } catch {
    return [];
  }
}

export async function readBackup(name: string): Promise<string | null> {
  if (!db || !/^mnema-\d{4}-\d{2}-\d{2}\.json$/.test(name)) return null;
  try {
    return (await get<string>(BACKUPS, name)) ?? null;
  } catch {
    return null;
  }
}

/** Просим браузер не стирать данные при нехватке места (Safari и Chrome иначе вправе это сделать). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return Boolean(await navigator.storage?.persist?.());
  } catch {
    return false;
  }
}
