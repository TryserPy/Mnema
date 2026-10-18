// Черновики (1.33): то, что ученик начал вводить и не сохранил (новая карточка, правка карточки), переживает закрытие окна,
// переход в конспект, перезагрузку и сворачивание приложения на телефоне. Ключ — по месту: «new:<тема>», «card:<id>».
// Черновик стирается только после сохранения или явного «Отмена» / «Удалить черновик».
// Хранилище — localStorage этого устройства (в закрытом режиме или при переполнении просто не запоминается).
import { useEffect, useRef, useSyncExternalStore } from 'react';

const PREFIX = 'refrain-draft:';
/** Сколько черновиков держим (самые старые уходят) и сколько дней. */
const MAX_DRAFTS = 40;
const TTL_MS = 30 * 24 * 3600 * 1000;
/** Больше — не храним (картинка в «Закрыть часть картинки» может весить мегабайты). */
const MAX_CHARS = 400_000;

interface Stored<T> {
  at: number;
  v: T;
}

function ls(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadDraft<T>(key: string, now = Date.now()): { value: T; at: number } | null {
  const s = ls();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Stored<T>;
    if (!d || typeof d.at !== 'number' || now - d.at > TTL_MS) {
      s.removeItem(PREFIX + key);
      return null;
    }
    return { value: d.v, at: d.at };
  } catch {
    return null;
  }
}

export function hasDraft(key: string): boolean {
  return loadDraft(key) !== null;
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/** Есть ли черновик (обновляется сразу, когда он появился или стёрт) — для пометки «черновик» на кнопке. */
export function useHasDraft(key: string): boolean {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    () => hasDraft(key),
    () => false
  );
}

export function saveDraft<T>(key: string, value: T, now = Date.now()): boolean {
  const s = ls();
  if (!s) return false;
  try {
    const json = JSON.stringify({ at: now, v: value } satisfies Stored<T>);
    if (json.length > MAX_CHARS) return false;
    const had = s.getItem(PREFIX + key) !== null;
    s.setItem(PREFIX + key, json);
    prune(s, now);
    if (!had) changed();
    return true;
  } catch {
    // Закрытый режим или хранилище переполнено: черновик не запомнится, но работа не прервётся.
    return false;
  }
}

export function clearDraft(key: string): void {
  try {
    const s = ls();
    if (s?.getItem(PREFIX + key) === null) return;
    s?.removeItem(PREFIX + key);
    changed();
  } catch {
    /* нечего стирать */
  }
}

function prune(s: Storage, now: number): void {
  const all: { k: string; at: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k?.startsWith(PREFIX)) continue;
    let at = 0;
    try {
      at = (JSON.parse(s.getItem(k) || '{}') as Stored<unknown>).at || 0;
    } catch {
      /* битый — уйдёт первым */
    }
    all.push({ k, at });
  }
  all.sort((a, b) => b.at - a.at);
  all.forEach((d, i) => {
    if (i >= MAX_DRAFTS || now - d.at > TTL_MS) s.removeItem(d.k);
  });
}

/**
 * Автосохранение черновика: через delay после последнего изменения, сразу при сворачивании (visibilitychange),
 * уходе со страницы (pagehide) и закрытии окна (размонтирование). Пустое (isEmpty) — черновик стирается.
 * key = null — не сохранять (например, после «Отмена»).
 */
export function useDraft<T>(key: string | null, value: T, isEmpty: (v: T) => boolean, delay = 400): { discard: () => void } {
  const off = useRef(false);
  const latest = useRef({ key, value, isEmpty });
  latest.current = { key: off.current ? null : key, value, isEmpty };
  const dirty = useRef(false);
  const first = useRef(true);

  const flush = () => {
    const { key: k, value: v, isEmpty: empty } = latest.current;
    if (!k || !dirty.current) return;
    dirty.current = false;
    if (empty(v)) clearDraft(k);
    else saveDraft(k, v);
  };

  useEffect(() => {
    // Первое значение — то, что уже лежит (восстановленный черновик или карточка): сохранять нечего.
    if (first.current) {
      first.current = false;
      return;
    }
    // После «сохранено» новое изменение (следующая карточка в том же окне) снова пишется в черновик.
    if (off.current) {
      off.current = false;
      return;
    }
    dirty.current = true;
    const t = setTimeout(flush, delay);
    return () => clearTimeout(t);
  }, [key, JSON.stringify(value)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const hidden = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
      flush();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    /** Сохранено или «Отмена»: черновик стереть и не писать, пока ученик снова не начнёт вводить (окно может закрыться в том же такте). */
    discard: () => {
      off.current = true;
      dirty.current = false;
      if (latest.current.key ?? key) clearDraft((latest.current.key ?? key)!);
      latest.current = { ...latest.current, key: null };
    }
  };
}
