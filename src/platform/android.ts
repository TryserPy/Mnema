// Android: приложение — это окно WebView, а «родная» часть (Java) даёт мост MnemaAndroid:
// файл данных, сеть без ограничений браузера, шифрование ключей, сохранение файлов, речь.
// Здесь из моста собирается такой же window.mnemaApi, как на Windows.
import { createAiService } from '../../shared/aiCore.mjs';
import { bridgeKey } from './bridgeKey';

interface AndroidBridge {
  load(): string | null;
  save(json: string): boolean;
  take(id: string): string;
  http(id: string, req: string): void;
  prefGet(name: string): string | null;
  prefSet(name: string, value: string): void;
  encrypt(text: string): string;
  decrypt(text: string): string;
  saveFile(id: string, name: string, mime: string, base64: string): void;
  speechStart(lang: string): string;
  speechStop(): void;
  appVersion(): string;
  speak?(text: string, lang: string): void;
  setReminders?(json: string): void;
  setWidget?(json: string): void;
  notifyPermission?(id: string): void;
  print?(): void;
  apkDownload?(id: string, url: string): void;
  apkInstall?(id: string, ask: boolean): void;
  setIcon?(name: string): void;
  setSelMenu?(json: string): void;
}

/** Каждый вызов моста несёт ключ (см. bridgeKey.ts): оборачиваем, чтобы остальной код его не видел. */
function withKey(raw: Record<string, unknown>): AndroidBridge {
  const k = bridgeKey();
  return new Proxy({} as AndroidBridge, {
    get: (_t, name) => (typeof raw[name as string] === 'function' ? (...args: unknown[]) => (raw[name as string] as (...a: unknown[]) => unknown).call(raw, k, ...args) : undefined)
  });
}

declare global {
  interface Window {
    MnemaAndroid?: unknown;
    __mnemaNative?: { done: (id: string) => void };
    __mnemaBack?: () => boolean;
    __mnemaUpdate?: (json: string) => void;
    __mnemaResume?: () => void;
  }
}

const RAW = window.MnemaAndroid as Record<string, unknown> | undefined;
if (RAW) {
  const A = withKey(RAW);
  const pending = new Map<string, (r: unknown) => void>();
  let n = 0;
  const call = <T>(start: (id: string) => void): Promise<T> =>
    new Promise((resolve) => {
      const id = 'r' + ++n + '_' + Date.now().toString(36);
      pending.set(id, resolve as (r: unknown) => void);
      start(id);
    });
  window.__mnemaNative = {
    done(id: string) {
      const cb = pending.get(id);
      pending.delete(id);
      let r: unknown = null;
      try {
        r = JSON.parse(A.take(id) || 'null');
      } catch {
        r = { status: 0, error: 'bad response' };
      }
      cb?.(r);
    }
  };

  // Вернулись в Мнему (например, из настроек Android) — событие для всех, кому нужно.
  window.__mnemaResume = () => window.dispatchEvent(new Event('mnema:resume'));

  // События обновления из Java (ход скачивания, ошибка установки) — всем, кто подписан.
  type UpdateEvent = Parameters<NonNullable<NonNullable<Window['mnemaApi']>['onUpdateEvent']>>[0] extends (e: infer E) => void ? E : never;
  const updateListeners = new Set<(e: UpdateEvent) => void>();
  window.__mnemaUpdate = (json: string) => {
    let e: UpdateEvent;
    try {
      e = JSON.parse(json);
    } catch {
      return;
    }
    for (const cb of updateListeners) cb(e);
  };

  type HttpRes = { status: number; text: string; error?: string };
  const http = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; bodyBase64?: boolean; timeout?: number } = {}) =>
    call<HttpRes>((id) => A.http(id, JSON.stringify({ url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ?? null, bodyBase64: Boolean(init.bodyBase64), timeout: init.timeout ?? 60000 })));

  const ai = createAiService({
    http,
    store: {
      read: () => {
        try {
          return JSON.parse(A.prefGet('ai') || '{}');
        } catch {
          return {};
        }
      },
      write: (c) => A.prefSet('ai', JSON.stringify(c)),
      encrypt: (s) => 'ks:' + A.encrypt(s),
      decrypt: (s) => (s && s.startsWith('ks:') ? A.decrypt(s.slice(3)) : ''),
      newId: () => Math.random().toString(16).slice(2, 14)
    }
  });

  window.mnemaApi = {
    platform: 'android',
    load: () => A.load(),
    save: async (json: string) => A.save(json),
    saveSync: (json: string) => A.save(json),
    openDataFolder: async () => '',
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
      return { status: res.status, text: res.text ?? res.error ?? '' };
    },
    secretGet: async (name) => {
      const v = A.prefGet('secret:' + name);
      return v ? A.decrypt(v) : '';
    },
    secretSet: async (name, value) => {
      A.prefSet('secret:' + name, value ? A.encrypt(value) : '');
      return true;
    },
    saveFile: (name, base64, mime) => call<{ ok: boolean }>((id) => A.saveFile(id, name, mime, base64)).then((r) => r.ok),
    // На телефоне нет «выбора папки», поэтому экспорт для Obsidian — один zip-архив.
    obsidianExport: async (files) => {
      const { zipSync, strToU8 } = await import('fflate');
      const tree: Record<string, Uint8Array> = {};
      for (const f of files) {
        if (f.base64) {
          const bin = atob(f.content);
          const u = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          tree['Мнема/' + f.path] = u;
        } else tree['Мнема/' + f.path] = strToU8(f.content);
      }
      const zip = zipSync(tree, { level: 6 });
      let s = '';
      for (let i = 0; i < zip.length; i += 0x8000) s += String.fromCharCode(...zip.subarray(i, i + 0x8000));
      const name = 'Мнема для Obsidian.zip';
      const r = await call<{ ok: boolean; canceled?: boolean }>((id) => A.saveFile(id, name, 'application/zip', btoa(s)));
      return { ok: r.ok, canceled: !r.ok, folder: name, written: files.length, zip: true };
    },
    speechStart: (lang) => JSON.parse(A.speechStart(lang)),
    speechStop: () => A.speechStop(),
    scheduleNotifications: A.setReminders ? (list) => A.setReminders!(JSON.stringify(list)) : undefined,
    setWidget: A.setWidget ? (json: string) => A.setWidget!(json) : undefined,
    notifyPermission: A.notifyPermission ? () => call<{ ok: boolean }>((id) => A.notifyPermission!(id)).then((r) => r.ok) : undefined,
    speak: A.speak ? (text: string, lang: string) => A.speak!(text, lang) : undefined,
    print: A.print ? () => A.print!() : undefined,
    // Обновление: скачать APK из выпуска на GitHub и отдать Android на установку.
    updateDownload: A.apkDownload ? (url?: string) => call<{ ok: boolean; error?: string }>((id) => A.apkDownload!(id, url ?? '')) : undefined,
    updateInstall: A.apkInstall ? (ask = true) => call<{ ok: boolean; permission?: boolean; error?: string }>((id) => A.apkInstall!(id, ask)) : undefined,
    onUpdateEvent: (cb) => {
      updateListeners.add(cb);
      return () => void updateListeners.delete(cb);
    },
    setAppIcon: A.setIcon ? (name: string) => A.setIcon!(name) : undefined,
    setSelMenu: A.setSelMenu ? (items) => A.setSelMenu!(JSON.stringify(items)) : undefined,
    ocrRecognize: async (bytes) => (await import('./ocrWeb')).recognize(bytes)
  };
}
