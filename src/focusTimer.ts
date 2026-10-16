// Фокус-таймер (помодоро) на любом экране: учёба → перерыв → «продолжить?». Минуты — из настроек («Учёба → Фокус»).
// Состояние лежит в localStorage: таймер переживает переход между экранами и перезапуск приложения.
import { useSyncExternalStore } from 'react';

export type FocusPhase = 'work' | 'break' | 'done';

export interface FocusState {
  phase: FocusPhase;
  /** Когда кончится фаза (мс), если таймер идёт. */
  endsAt: number | null;
  /** Сколько осталось (мс), если на паузе. */
  left: number | null;
  /** Сколько учебных отрезков уже позади. */
  rounds: number;
}

const KEY = 'refrain-focus';
const MIN = 60000;
let state: FocusState | null = load();
const subs = new Set<() => void>();

function load(): FocusState | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as FocusState | null;
    return v && (v.phase === 'work' || v.phase === 'break' || v.phase === 'done') ? v : null;
  } catch {
    return null;
  }
}

function set(next: FocusState | null) {
  state = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* без памяти таймер всё равно идёт */
  }
  subs.forEach((f) => f());
}

export function focusState(): FocusState | null {
  return state;
}

export function subscribeFocus(f: () => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}

export function useFocus(): FocusState | null {
  return useSyncExternalStore(subscribeFocus, focusState, focusState);
}

/** Минуты в разумных рамках: учёба 1–180, перерыв 1–60. */
export function clampMinutes(v: unknown, kind: 'work' | 'break'): number {
  const n = Math.round(Number(v));
  const max = kind === 'work' ? 180 : 60;
  return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : kind === 'work' ? 25 : 5;
}

export function startFocus(workMin: number, now = Date.now()): void {
  set({ phase: 'work', endsAt: now + clampMinutes(workMin, 'work') * MIN, left: null, rounds: state?.rounds ?? 0 });
}

export function startBreak(breakMin: number, now = Date.now()): void {
  set({ phase: 'break', endsAt: now + clampMinutes(breakMin, 'break') * MIN, left: null, rounds: state?.rounds ?? 0 });
}

export function pauseFocus(now = Date.now()): void {
  if (!state?.endsAt) return;
  set({ ...state, endsAt: null, left: Math.max(0, state.endsAt - now) });
}

export function resumeFocus(now = Date.now()): void {
  if (!state || state.endsAt || state.left === null) return;
  set({ ...state, endsAt: now + state.left, left: null });
}

export function stopFocus(): void {
  set(null);
}

/** Сколько осталось в текущей фазе. */
export function focusLeft(s: FocusState | null, now = Date.now()): number {
  if (!s) return 0;
  return s.endsAt ? Math.max(0, s.endsAt - now) : (s.left ?? 0);
}

/**
 * Время вышло: учёба → перерыв (сам), перерыв → «done» (ждём ученика). Возвращает, что закончилось, — для сообщения.
 */
export function tickFocus(breakMin: number, now = Date.now()): 'work' | 'break' | null {
  const s = state;
  if (!s?.endsAt || s.endsAt > now) return null;
  if (s.phase === 'work') {
    set({ phase: 'break', endsAt: now + clampMinutes(breakMin, 'break') * MIN, left: null, rounds: s.rounds + 1 });
    return 'work';
  }
  if (s.phase === 'break') {
    set({ ...s, phase: 'done', endsAt: null, left: 0 });
    return 'break';
  }
  return null;
}

export function fmtLeft(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
