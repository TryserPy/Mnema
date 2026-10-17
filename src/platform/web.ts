// Веб-версия (браузер и установленное PWA на компьютере, Android, iPhone и iPad): здесь из возможностей браузера
// собирается такой же window.mnemaApi, как на Windows (electron/preload.cjs) и Android (android.ts).
// Данные лежат в IndexedDB этого браузера, сеть идёт через fetch (серверу нужен CORS), файлы сохраняются скачиванием.
import { createAiService } from '../../shared/aiCore.mjs';
import { initStorage, listBackups, loadData, readBackup, requestPersistence, saveData, saveDataSync } from './webStorage';
import { listenInstall } from './webInstall';
import { initVault, legacyDecode, migrateLegacySecrets, vaultGet, vaultPrune, vaultSet } from './webVault';

type Api = NonNullable<Window['mnemaApi']>;

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* закрытый режим или переполнено — настройка просто не запомнится */
    }
  }
};

type HttpInit = { method?: string; headers?: Record<string, string>; body?: string; bodyBase64?: boolean; timeout?: number };
type HttpRes = { status: number; text: string; error?: string };

/** Запрос из страницы. Работает только к серверам, которые разрешают доступ с других сайтов (CORS): OpenAI, Anthropic, Gemini, Nextcloud с настройкой и т. п. */
async function http(url: string, init: HttpInit = {}): Promise<HttpRes> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeout ?? 60000);
  try {
    const headers = { ...(init.headers ?? {}) };
    // Без этого заголовка Anthropic не отвечает на запросы из браузера.
    if (/^https:\/\/api\.anthropic\.com\//i.test(url)) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    const body = init.body == null ? undefined : init.bodyBase64 ? Uint8Array.from(atob(init.body), (c) => c.charCodeAt(0)) : init.body;
    const res = await fetch(url, { method: init.method ?? 'GET', headers, body, signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    return { status: 0, text: '', error: aborted ? 'Сервер слишком долго не отвечает' : 'Нет связи с сервером. Если интернет есть — сервер не разрешает запросы из браузера (CORS); в приложении для Windows, Linux и Android такого ограничения нет.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Положить ключ ИИ в хранилище секретов; в настройки ИИ идёт только ссылка на него. */
function sealKey(value: string): string {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  vaultSet('ai:' + id, value);
  return 'kv:' + id;
}

function createApi(): Api {
  const ai = createAiService({
    http,
    store: {
      read: () => {
        let c: { keys?: Record<string, string> } = {};
        try {
          c = JSON.parse(ls.get('mnema-ai') || '{}');
        } catch {
          return {};
        }
        // До 1.32 ключи лежали прямо здесь в base64 («ks:…») — переносим в зашифрованное хранилище (webVault).
        const keys = c.keys && typeof c.keys === 'object' ? c.keys : {};
        const old = Object.entries(keys).filter(([, v]) => typeof v === 'string' && v.startsWith('ks:'));
        if (old.length) {
          for (const [k, v] of old) keys[k] = sealKey(legacyDecode(v.slice(3)));
          ls.set('mnema-ai', JSON.stringify(c));
        }
        return c;
      },
      write: (c) => {
        ls.set('mnema-ai', JSON.stringify(c));
        const refs = Object.values((c as { keys?: Record<string, string> }).keys ?? {}).filter((v) => typeof v === 'string' && v.startsWith('kv:'));
        vaultPrune('ai:', new Set(refs.map((v) => 'ai:' + v.slice(3))));
      },
      // Ключ ИИ — в зашифрованном хранилище (webVault: AES-GCM, неизвлекаемый ключ в IndexedDB); в настройках — только ссылка «kv:…».
      encrypt: (s) => sealKey(s),
      decrypt: (s) => (s && s.startsWith('kv:') ? vaultGet('ai:' + s.slice(3)) : s && s.startsWith('ks:') ? legacyDecode(s.slice(3)) : ''),
      newId: () => Math.random().toString(16).slice(2, 14)
    }
  });

  return {
    platform: 'web',
    load: loadData,
    save: saveData,
    saveSync: saveDataSync,
    backupList: listBackups,
    backupRead: readBackup,
    aiGetConfig: async () => ai.getConfig(),
    aiSetConfig: async (p) => ai.setConfig(p),
    aiSaveCustom: async (d) => ai.saveCustom(d),
    aiDeleteCustom: async (id) => ai.deleteCustom(id),
    aiAsk: (r) => ai.ask(r),
    aiProbe: (q) => ai.probe(q),
    aiLocalModels: () => ai.localModels(),
    aiTranscribe: (r) => ai.transcribe(r),
    http: async (r) => {
      const res = await http(r.url, { method: r.method, headers: r.headers, body: r.body, timeout: r.timeout });
      return { status: res.status, text: res.text || res.error || '' };
    },
    secretGet: async (name) => vaultGet(name),
    secretSet: async (name, value) => {
      vaultSet(name, value);
      return true;
    },
    // В браузере нет «выбора папки», поэтому экспорт для Obsidian — один zip-архив, как на телефоне.
    obsidianExport: async (files) => {
      const { zipSync, strToU8 } = await import('fflate');
      const { downloadBytes } = await import('../share');
      const tree: Record<string, Uint8Array> = {};
      for (const f of files) tree['Refrain/' + f.path] = f.base64 ? Uint8Array.from(atob(f.content), (c) => c.charCodeAt(0)) : strToU8(f.content);
      const name = 'Refrain для Obsidian.zip';
      const ok = await downloadBytes(name, zipSync(tree, { level: 6 }), 'application/zip');
      return { ok, folder: name, written: files.length, zip: true };
    },
    ocrRecognize: async (bytes) => (await import('./ocrWeb')).recognize(bytes)
  };
}

/** Одна вкладка — один хозяин данных: две вкладки затирали бы записи друг друга. */
async function takeLock(): Promise<boolean> {
  const locks = (navigator as unknown as { locks?: { request(name: string, opts: object, cb: (l: unknown) => Promise<void>): Promise<void> } }).locks;
  if (!locks) return true;
  return new Promise((resolve) => {
    locks
      .request('mnema-data', { ifAvailable: true }, (lock) => {
        resolve(Boolean(lock));
        // Замок держим, пока вкладка жива: промис не завершается никогда.
        return lock ? new Promise<void>(() => {}) : Promise.resolve();
      })
      .catch(() => resolve(true));
  });
}

function notice(title: string, text: string, button?: { label: string; run: () => void }): HTMLElement {
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:24px;background:var(--bg,#f6f7fb);color:var(--text,#1b1d24);font:16px/1.5 Onest,system-ui,sans-serif;text-align:center';
  const inner = document.createElement('div');
  inner.style.cssText = 'max-width:420px;display:grid;gap:12px;justify-items:center';
  const h = document.createElement('h1');
  h.textContent = title;
  h.style.cssText = 'margin:0;font-size:22px';
  const p = document.createElement('p');
  p.textContent = text;
  p.style.margin = '0';
  inner.append(h, p);
  if (button) {
    const b = document.createElement('button');
    b.textContent = button.label;
    b.className = 'btn primary';
    b.onclick = button.run;
    inner.append(b);
  }
  box.append(inner);
  document.body.append(box);
  return box;
}

/**
 * Работа без интернета и обновления: service worker (sw.js собирается вместе с приложением).
 * Обновление применяется тихо, без плашек: новая версия скачивается в фоне и ждёт; при следующем открытии
 * (или перезагрузке) приложения, пока страница ещё «свежая», она включается сама. Посреди работы страница
 * никогда не перезагружается.
 */
function registerWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const bornAt = Date.now();
  const hadController = Boolean(sw.controller); // первый заход: сервис-воркер только встаёт, перезагружать страницу незачем
  let reloading = false;
  void sw.register(new URL('sw.js', document.baseURI).href).then((reg) => {
    // Новая версия уже ждёт с прошлого раза, а страница только что открылась — включаем её сразу.
    if (reg.waiting && sw.controller) reg.waiting.postMessage({ type: 'skip-waiting' });
    // Искать обновление при возвращении в приложение и раз в час, пока оно открыто (само оно включится при следующем открытии).
    const check = () => void reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    setInterval(check, 3600_000);
  });
  sw.addEventListener('controllerchange', () => {
    // Смена версии позже первых секунд после открытия — человек уже работает: ничего не перезагружаем.
    if (!hadController || reloading || Date.now() - bornAt > 8000) return;
    reloading = true;
    // Заставка уже сыграла в этом заходе — после перезагрузки ради обновления второй раз её не показываем (public/splash-theme.js).
    try {
      sessionStorage.setItem('refrain-no-splash', String(Date.now()));
    } catch {
      /* без хранилища заставка сыграет ещё раз — не страшно */
    }
    (window as unknown as { __mnemaFlush?: () => void }).__mnemaFlush?.();
    location.reload();
  });
}

/** Онлайн-версия — только для проверки: при каждом новом заходе (новая вкладка, перезапуск) напоминаем об этом. */
function testNotice() {
  const KEY = 'mnema-web-test-ok';
  try {
    if (sessionStorage.getItem(KEY)) return;
  } catch {
    /* закрытое хранилище — просто покажем окно */
  }
  if (document.getElementById('mnema-test-notice')) return;
  const box = document.createElement('div');
  box.id = 'mnema-test-notice';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'mnema-test-title');
  box.style.cssText =
    'position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:rgba(16,18,24,.55);font:16px/1.5 Onest,system-ui,sans-serif';
  const card = document.createElement('div');
  card.style.cssText =
    'max-width:420px;width:100%;box-sizing:border-box;display:grid;gap:12px;padding:22px 22px 20px;border-radius:20px;background:var(--surface,#fff);color:var(--ink,#1b1d24);box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:left';
  const h = document.createElement('h2');
  h.id = 'mnema-test-title';
  h.textContent = 'Онлайн-версия Refrain — только для тестов';
  h.style.cssText = 'margin:0;font-size:1.25rem;line-height:1.25;overflow-wrap:anywhere';
  const p = document.createElement('p');
  p.textContent = 'Данные хранятся только в этом браузере и могут пропасть. Для постоянной учёбы — приложение для Windows, Linux или Android.';
  p.style.cssText = 'margin:0;color:var(--ink-2,#444);overflow-wrap:anywhere';
  const b = document.createElement('button');
  b.textContent = 'Понятно';
  b.className = 'btn primary';
  b.style.justifySelf = 'end';
  b.onclick = () => {
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* ничего страшного: окно вернётся при следующем заходе */
    }
    box.remove();
  };
  card.append(h, p, b);
  box.append(card);
  document.body.append(box);
  b.focus();
}

/** true — можно запускать приложение. На Windows, Linux и Android мост уже есть, и ничего не меняется. */
export async function initWeb(): Promise<boolean> {
  if (window.mnemaApi) return true;
  listenInstall();
  if (!(await takeLock())) {
    notice('Refrain уже открыта в другой вкладке', 'Данные у вкладок общие, и две сразу затёрли бы изменения друг друга. Закрой другую вкладку или окно Refrain и обнови эту страницу.', {
      label: 'Обновить страницу',
      run: () => location.reload()
    });
    return false;
  }
  await initStorage();
  await initVault();
  migrateLegacySecrets();
  window.mnemaApi = createApi();
  void requestPersistence();
  registerWorker();
  testNotice();
  return true;
}
