import { beforeEach, describe, expect, it } from 'vitest';
import { clampMinutes, focusLeft, focusState, pauseFocus, resumeFocus, startFocus, stopFocus, tickFocus } from './focusTimer';

describe('фокус-таймер', () => {
  beforeEach(() => stopFocus());
  it('учёба → перерыв → «продолжим?», пауза держит остаток', () => {
    startFocus(25, 0);
    expect(focusLeft(focusState(), 60000)).toBe(24 * 60000);
    pauseFocus(60000);
    expect(focusLeft(focusState(), 10 * 60000)).toBe(24 * 60000);
    resumeFocus(10 * 60000);
    expect(tickFocus(5, 33 * 60000)).toBeNull();
    expect(tickFocus(5, 34 * 60000)).toBe('work');
    expect(focusState()).toMatchObject({ phase: 'break', rounds: 1 });
    expect(tickFocus(5, 39 * 60000)).toBe('break');
    expect(focusState()?.phase).toBe('done');
  });
  it('минуты — в разумных рамках', () => {
    expect(clampMinutes('0', 'work')).toBe(1);
    expect(clampMinutes(500, 'work')).toBe(180);
    expect(clampMinutes(99, 'break')).toBe(60);
    expect(clampMinutes('abc', 'break')).toBe(5);
  });
});
