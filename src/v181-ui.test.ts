import { describe, expect, it } from 'vitest';
import { barUnreachable, FLOAT_HYSTERESIS } from './floatBar';

describe('2.0: квадратик инструментов конспекта (баг 2)', () => {
  it('панель на виду или видна хоть частично — квадратика нет', () => {
    expect(barUnreachable(69, 0, false)).toBe(false); // компьютер: панель целиком видна (раньше квадратик появлялся уже тут)
    expect(barUnreachable(11 + 57, 57, false)).toBe(false); // телефон: из-под шапки торчит «хвост» в 11 px — панель ещё доступна
    expect(barUnreachable(1, 0, false)).toBe(false);
  });
  it('панель целиком выше видимого верха — квадратик есть', () => {
    expect(barUnreachable(0, 0, false)).toBe(true);
    expect(barUnreachable(-30, 0, false)).toBe(true);
    expect(barUnreachable(57, 57, false)).toBe(true); // телефон: нижний край ровно под шапкой
    expect(barUnreachable(60, 60, false)).toBe(true); // «на весь экран»: под липкой полосой 60 px
  });
  it('гистерезис: уже показанный квадратик не мигает на пару пикселей', () => {
    expect(barUnreachable(5, 0, true)).toBe(true);
    expect(barUnreachable(FLOAT_HYSTERESIS, 0, true)).toBe(true);
    expect(barUnreachable(FLOAT_HYSTERESIS + 1, 0, true)).toBe(false); // вернул панель заметно — прячем
  });
});
