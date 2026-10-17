// 1.32, помодоро: время от endsAt, обновление на границе секунды, «пилюля» и спрятанный таймер не останавливают отсчёт.
import { describe, expect, it } from 'vitest';
import { focusLeft, focusState, fmtLeft, msToNextSecond, pauseFocus, resumeFocus, setFocusView, startFocus, stopFocus, tickFocus } from './focusTimer';

describe('фокус-таймер', () => {
  it('следующее обновление — ровно на смене секунды', () => {
    const t0 = 1_000_000;
    startFocus(25, t0);
    expect(msToNextSecond(focusState(), t0 + 250)).toBe(755); // осталось …:59.750 → через 750 мс станет …:59
    expect(msToNextSecond(focusState(), t0)).toBe(1005);
    stopFocus();
  });

  it('после «сна» время верное сразу: считается от endsAt, а не тиками', () => {
    const t0 = 2_000_000;
    startFocus(25, t0);
    expect(fmtLeft(focusLeft(focusState(), t0 + 10 * 60000 + 300))).toBe('15:00');
    expect(tickFocus(5, t0 + 26 * 60000)).toBe('work');
    expect(focusState()?.phase).toBe('break');
    stopFocus();
  });

  it('спрятанный и свёрнутый таймер идёт; вид переживает паузу и смену фазы', () => {
    const t0 = 3_000_000;
    startFocus(10, t0);
    setFocusView('hidden');
    pauseFocus(t0 + 60000);
    resumeFocus(t0 + 120000);
    expect(focusState()?.view).toBe('hidden');
    expect(fmtLeft(focusLeft(focusState(), t0 + 180000))).toBe('08:00');
    setFocusView('mini');
    tickFocus(5, t0 + 20 * 60000);
    expect(focusState()).toMatchObject({ phase: 'break', view: 'mini' });
    stopFocus();
  });
});
