// Память интерфейса: открытые и закрытые разделы, последний раздел настроек, вкладка темы, где ученик был перед закрытием.
// Лежит в localStorage этого устройства (не в данных и не в синхронизации). Недоступен (закрытое окно) — всё работает без памяти.
import { useState } from 'react';

const KEY = 'refrain-ui';
type Mem = Record<string, unknown>;

let cache: Mem | null = null;

function read(): Mem {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    cache = v && typeof v === 'object' && !Array.isArray(v) ? (v as Mem) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function recall<T>(key: string, fallback: T): T {
  const v = read()[key];
  return v === undefined ? fallback : (v as T);
}

export function remember(key: string, value: unknown): void {
  const m = { ...read() };
  if (value === undefined) delete m[key];
  else m[key] = value;
  cache = m;
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* память — удобство, не страшно */
  }
}

/** useState, который помнит значение между запусками. */
export function useRemembered<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => recall(key, fallback));
  return [
    v,
    (next: T) => {
      setV(next);
      remember(key, next);
    }
  ];
}

/** Для тестов: забыть кэш (localStorage читается заново). */
export function resetUiMemory(): void {
  cache = null;
}
