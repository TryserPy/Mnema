// Веб-версия (браузер и установленное PWA на компьютере, Android, iPhone и iPad): здесь из возможностей браузера
// собирается такой же window.mnemaApi, как на Windows (electron/preload.cjs) и Android (android.ts).
// Данные лежат в IndexedDB этого браузера, сеть идёт через fetch (серверу нужен CORS), файлы сохраняются скачиванием.
import { createAiService } from '../../shared/aiCore.mjs';
import { initStorage, listBackups, loadData, readBackup, requestPersistence, saveData, saveDataSync } from './webStorage';
import { listenInstall } from './webInstall';

type Api = NonNullable<Window['mnemaApi']>;

const b64 = {
  enc: (s: string) => {
    let bin = '';
    for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
    return btoa(bin);
  },
  dec: (s: string) => {
    try {
      return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
    } catch {
      return '';
    }
  }
};

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
    return { status: 0, text: '', error: aborted ? 'Сервер слишком долго не отвечает' : 'Нет связи с сервером. Если интернет есть — сервер не разрешает запросы из браузера (CORS); в приложении для Windows и Android такого ограничения нет.' };
  } finally {
    clearTimeout(timer);
  }
}

function createApi(): Api {
  const ai = createAiService({
    http,
    store: {
      read: () => {
        try {
          return JSON.parse(ls.get('mnema-ai') || '{}');
        } catch {
          return {};
        }
      },
      write: (c) => ls.set('mnema-ai', JSON.stringify(c)),
      // Это не шифрование (в браузере нечем хранить ключ отдельно от данных), а защита от случайного подсмотра:
      // ключ лежит только в хранилище этого сайта в этом браузере и никуда, кроме выбранного ИИ-сервиса, не уходит.
      encrypt: (s) => 'ks:' + b64.enc(s),
      decrypt: (s) => (s && s.startsWith('ks:') ? b64.dec(s.slice(3)) : ''),
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
    secretGet: async (name) => b64.dec(ls.get('mnema-secret:' + name) ?? ''),
    secretSet: async (name, value) => {
      ls.set('mnema-secret:' + name, value ? b64.enc(value) : '');
      return true;
    },
    // В браузере нет «выбора папки», поэтому экспорт для Obsidian — один zip-архив, как на телефоне.
    obsidianExport: async (files) => {
      const { zipSync, strToU8 } = await import('fflate');
      const { downloadBytes } = await import('../share');
      const tree: Record<string, Uint8Array> = {};
      for (const f of files) tree['Мнема/' + f.path] = f.base64 ? Uint8Array.from(atob(f.content), (c) => c.charCodeAt(0)) : strToU8(f.content);
      const name = 'Мнема для Obsidian.zip';
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

/** Небольшая плашка внизу экрана: вышла новая версия. */
function updateBanner(apply: () => void) {
  if (document.getElementById('mnema-update')) return;
  const bar = document.createElement('div');
  bar.id = 'mnema-update';
  bar.style.cssText =
    'position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:9000;margin:auto;max-width:420px;display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:14px;background:var(--text,#1b1d24);color:var(--bg,#fff);font:14px/1.4 Onest,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28)';
  const t = document.createElement('span');
  t.textContent = 'Вышла новая версия Мнемы';
  const b = document.createElement('button');
  b.textContent = 'Обновить';
  b.className = 'btn small primary';
  b.onclick = apply;
  const x = document.createElement('button');
  x.textContent = '×';
  x.setAttribute('aria-label', 'Позже');
  x.style.cssText = 'background:none;border:none;color:inherit;font-size:20px;cursor:pointer;padding:0 4px';
  x.onclick = () => bar.remove();
  const right = document.createElement('span');
  right.style.cssText = 'display:flex;gap:6px;align-items:center';
  right.append(b, x);
  bar.append(t, right);
  document.body.append(bar);
}

/** Работа без интернета и обновления: service worker (sw.js собирается вместе с приложением). */
function registerWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  void sw.register(new URL('sw.js', document.baseURI).href).then((reg) => {
    const offer = (w: ServiceWorker | null) => {
      if (!w || !sw.controller) return; // первая установка — предлагать нечего
      updateBanner(() => w.postMessage({ type: 'skip-waiting' }));
    };
    offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => w.state === 'installed' && offer(w));
    });
    // Искать обновление при возвращении в приложение и раз в час, пока оно открыто.
    const check = () => void reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    setInterval(check, 3600_000);
  });
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    (window as unknown as { __mnemaFlush?: () => void }).__mnemaFlush?.();
    location.reload();
  });
}

/** true — можно запускать приложение. На Windows и Android мост уже есть, и ничего не меняется. */
export async function initWeb(): Promise<boolean> {
  if (window.mnemaApi) return true;
  listenInstall();
  if (!(await takeLock())) {
    notice('Мнема уже открыта в другой вкладке', 'Данные у вкладок общие, и две сразу затёрли бы изменения друг друга. Закрой другую вкладку или окно Мнемы и обнови эту страницу.', {
      label: 'Обновить страницу',
      run: () => location.reload()
    });
    return false;
  }
  await initStorage();
  window.mnemaApi = createApi();
  void requestPersistence();
  registerWorker();
  return true;
}
