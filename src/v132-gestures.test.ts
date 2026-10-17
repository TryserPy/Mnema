// 1.32, п.10: свайп карточки и «потяни вниз» — расчёты без DOM.
import { describe, expect, it } from 'vitest';
import { PULL_TRIGGER, pullDistance, swipeAxis, swipeThreshold, swipeVerdict } from './gestures';

describe('свайп карточки', () => {
  it('порог — доля ширины в пределах 80…160 px', () => {
    expect(swipeThreshold(200)).toBe(80);
    expect(swipeThreshold(360)).toBeCloseTo(100.8);
    expect(swipeThreshold(1200)).toBe(160);
  });

  it('вбок — только при явном горизонтальном сдвиге, иначе это прокрутка', () => {
    expect(swipeAxis(4, 3)).toBeNull();
    expect(swipeAxis(30, 5)).toBe('x');
    expect(swipeAxis(20, 18)).toBe('y'); // по диагонали — прокрутка, карточку не трогаем
    expect(swipeAxis(2, -40)).toBe('y');
  });

  it('вправо — «Помню», влево — «Снова», мало — ничего', () => {
    expect(swipeVerdict(120, 360)).toBe('good');
    expect(swipeVerdict(-120, 360)).toBe('again');
    expect(swipeVerdict(60, 360)).toBeNull();
  });

  it('быстрый короткий взмах засчитывается, медленный — нет', () => {
    expect(swipeVerdict(60, 360, 80)).toBe('good');
    expect(swipeVerdict(-60, 360, 80)).toBe('again');
    expect(swipeVerdict(60, 360, 600)).toBeNull();
    expect(swipeVerdict(30, 360, 20)).toBeNull(); // дрогнул палец — не свайп
  });
});

describe('потяни вниз', () => {
  it('резинка: дальше — медленнее, не больше 120 px', () => {
    expect(pullDistance(-10)).toBe(0);
    expect(pullDistance(40)).toBeLessThan(40);
    expect(pullDistance(400)).toBe(120);
    expect(pullDistance(200) - pullDistance(100)).toBeLessThan(pullDistance(100) - pullDistance(0));
  });

  it('обновляет примерно после 100 px пальцем', () => {
    expect(pullDistance(90)).toBeLessThan(PULL_TRIGGER);
    expect(pullDistance(110)).toBeGreaterThanOrEqual(PULL_TRIGGER);
  });
});
