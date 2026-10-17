// Режим разработчика (1.32): скрытая консоль — журнал, сети, хранилище, ошибки, FPS и долгие задачи.
// Включается: 7 нажатий на номер версии в «Профиле», адрес с ?debug=1 или переключатель в самой консоли.
// У обычных учеников выключен и ничего не делает; наружу ничего не отправляет без явной кнопки.
import { logLine } from './refrain';

const KEY = 'refrain-dev';
const NET_MAX = 80;

export interface NetEntry {
  at: number;
  method: string;
  url: string;
  status: number;
  ms: number;
}

const net: NetEntry[] = [];
const listeners = new Set<() => void>();
let on = false;
let wrapped = false;

function lsGet(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
function lsSet(v: boolean): void {
  try {
    if (v) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* закрытый режим — только до перезапуска */
  }
}

/** Адрес без секретов: ключи, токены, пароли и почта в запросе и фрагменте заменяются на «•••». */
export function maskUrl(u: string): string {
  return String(u)
    .replace(/([?&#](?:key|api_key|apikey|token|access_token|refresh_token|password|pass|secret|code|auth|signature|sig)=)[^&#\s]*/gi, '$1•••')
    .replace(/\/\/[^/@\s]+:[^/@\s]+@/g, '//•••@')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '•••@•••')
    .slice(0, 300);
}

export const devOn = (): boolean => on;

export function onDev(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}
const emit = () => {
  for (const l of listeners) l();
};

export function setDev(v: boolean): void {
  on = v;
  lsSet(v);
  if (v) wrap();
  emit();
}

export function netEntries(): readonly NetEntry[] {
  return net;
}
export function clearNet(): void {
  net.length = 0;
  emit();
}

/** Запомнить запрос: метод, адрес без секретов, ответ и время. Заголовки и тела не запоминаются. */
export function recordNet(e: NetEntry): void {
  net.push({ ...e, url: maskUrl(e.url) });
  if (net.length > NET_MAX) net.splice(0, net.length - NET_MAX);
  emit();
}

/** Обернуть сеть приложения (mnemaApi.http и fetch), только когда режим включён. */
function wrap(): void {
  if (wrapped || typeof window === 'undefined') return;
  wrapped = true;
  const api = window.mnemaApi;
  if (api?.http) {
    const orig = api.http;
    api.http = async (r) => {
      const t = performance.now();
      const res = await orig(r);
      if (on) recordNet({ at: Date.now(), method: (r.method || 'GET').toUpperCase(), url: r.url, status: res.status, ms: Math.round(performance.now() - t) });
      return res;
    };
  }
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const t = performance.now();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      try {
        const res = await origFetch(input, init);
        if (on && !url.startsWith('data:') && !url.startsWith('blob:')) recordNet({ at: Date.now(), method: (init?.method || 'GET').toUpperCase(), url, status: res.status, ms: Math.round(performance.now() - t) });
        return res;
      } catch (e) {
        if (on) recordNet({ at: Date.now(), method: (init?.method || 'GET').toUpperCase(), url, status: 0, ms: Math.round(performance.now() - t) });
        throw e;
      }
    };
  }
  // Долгие задачи (> 50 мс) — в журнал как предупреждение; одинаковые подряд свернутся в ×N.
  try {
    const po = new PerformanceObserver((list) => {
      if (!on) return;
      for (const e of list.getEntries()) if (e.duration > 120) logLine(`долгая задача ${Math.round(e.duration)} мс`, 'warn');
    });
    po.observe({ type: 'longtask', buffered: false });
  } catch {
    /* браузер не умеет longtask */
  }
}

/** Включить при запуске, если режим уже был включён или в адресе ?debug=1 (?debug=0 — выключить). */
export function initDev(): void {
  if (typeof window === 'undefined') return;
  let want = lsGet();
  try {
    const q = new URLSearchParams(window.location.search).get('debug');
    if (q === '1') want = true;
    if (q === '0') want = false;
  } catch {
    /* нет адреса */
  }
  if (want) setDev(true);
}

/** Семь нажатий подряд (с паузами меньше 1,5 с) на номер версии. */
let taps: number[] = [];
export function tapVersion(now = Date.now()): number {
  taps = [...taps.filter((t) => now - t < 1500 * 7), now].slice(-7);
  const ok = taps.length === 7 && taps.every((t, i) => i === 0 || t - taps[i - 1] < 1500);
  if (ok) {
    taps = [];
    setDev(!on);
    return 7;
  }
  return taps.length;
}
