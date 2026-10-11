// Знакомство-тренажёр: счёт действий («Шаг N из М») и расчёты рамки подсветки.
import { describe, expect, it } from 'vitest';
import { ACTIONS, actionNumber, clipRect, MAJORS, needsScroll, sameRect, stepInfo, TOTAL_ACTIONS } from './components/guideTarget';

describe('счёт действий в знакомстве', () => {
  it('на каждый крупный шаг есть число действий, всего — их сумма', () => {
    expect(ACTIONS.length).toBe(MAJORS.length);
    expect(TOTAL_ACTIONS).toBe(ACTIONS.reduce((a, b) => a + b, 0));
    expect(ACTIONS.every((n) => n >= 1)).toBe(true);
  });

  it('первое действие — «Шаг 1», а выбор пункта «Новый предмет» (второе действие) — уже «Шаг 2», а не «Шаг 1»', () => {
    expect(actionNumber(0, 1)).toBe(1);
    expect(actionNumber(0, 2)).toBe(2);
    expect(actionNumber(0, 3)).toBe(3);
  });

  it('номер сквозной: шаг «Тема» продолжает счёт после «Предмета»', () => {
    expect(actionNumber(1, 1)).toBe(ACTIONS[0] + 1);
    expect(actionNumber(2, 1)).toBe(ACTIONS[0] + ACTIONS[1] + 1);
  });

  it('последнее действие главного пути — «М из М»', () => {
    expect(actionNumber(MAJORS.length - 1, 1)).toBe(TOTAL_ACTIONS);
  });

  it('номер растёт строго по пути и не выходит за границы', () => {
    let prev = 0;
    for (let m = 0; m < ACTIONS.length; m++)
      for (let k = 1; k <= ACTIONS[m]; k++) {
        const n = actionNumber(m, k);
        expect(n).toBe(prev + 1);
        prev = n;
      }
    expect(prev).toBe(TOTAL_ACTIONS);
    expect(actionNumber(0, 99)).toBe(ACTIONS[0]); // лишнее действие внутри шага не залезает в следующий
    expect(actionNumber(0, 0)).toBe(1);
    expect(actionNumber(99, 1)).toBe(TOTAL_ACTIONS);
    expect(actionNumber(-3, 1)).toBe(1);
  });

  it('если человек ушёл в сторону, номер честно откатывается (закрыл окно: 3-е действие → снова 1-е)', () => {
    expect(actionNumber(0, 3)).toBeGreaterThan(actionNumber(0, 1));
    expect(actionNumber(0, 1)).toBe(1);
    // вернулся к крупному шагу «Тема» с её 3-го действия на 1-е
    expect(actionNumber(1, 1)).toBeLessThan(actionNumber(1, 3));
  });

  it('stepInfo: название крупного шага и доля для полоски', () => {
    const a = stepInfo(0, 2);
    expect(a).toMatchObject({ n: 2, total: TOTAL_ACTIONS, title: 'Предмет' });
    expect(a.pct).toBeCloseTo((2 / TOTAL_ACTIONS) * 100);
    const z = stepInfo(MAJORS.length - 1, 1);
    expect(z.pct).toBeCloseTo(100);
    expect(z.title).toBe('Готово');
  });
});

describe('рамка подсветки', () => {
  it('sameRect: разница меньше полпикселя — одно и то же', () => {
    expect(sameRect({ x: 1, y: 1, w: 10, h: 10 }, { x: 1.2, y: 1.1, w: 10.3, h: 9.9 })).toBe(true);
    expect(sameRect({ x: 1, y: 1, w: 10, h: 10 }, { x: 2, y: 1, w: 10, h: 10 })).toBe(false);
    expect(sameRect(null, null)).toBe(true);
    expect(sameRect(null, { x: 0, y: 0, w: 1, h: 1 })).toBe(false);
  });

  it('clipRect обрезает по экрану, а если ничего не видно — null', () => {
    expect(clipRect({ x: -10, y: 20, w: 100, h: 50 }, 390, 844)).toEqual({ x: 0, y: 20, w: 90, h: 50 });
    expect(clipRect({ x: 300, y: 800, w: 200, h: 200 }, 390, 844)).toEqual({ x: 300, y: 800, w: 90, h: 44 });
    expect(clipRect({ x: 0, y: 900, w: 50, h: 50 }, 390, 844)).toBeNull();
    expect(clipRect({ x: 0, y: 0, w: 0, h: 0 }, 390, 844)).toBeNull(); // скрытый элемент
  });

  it('needsScroll: цель за краем — прокручиваем, целиком на виду — нет, огромную — не трогаем', () => {
    const view = { x: 0, y: 0, w: 390, h: 800 };
    expect(needsScroll({ x: 10, y: 100, w: 300, h: 60 }, view)).toBe(false);
    expect(needsScroll({ x: 10, y: 780, w: 300, h: 60 }, view)).toBe(true);
    expect(needsScroll({ x: 10, y: -20, w: 300, h: 60 }, view)).toBe(true);
    expect(needsScroll({ x: 10, y: -500, w: 300, h: 3000 }, view)).toBe(false);
    // под нижней панелью телефона (80px) — тоже «за краем»
    expect(needsScroll({ x: 10, y: 700, w: 300, h: 60 }, view, 56, 80)).toBe(true);
    expect(needsScroll({ x: 10, y: 600, w: 300, h: 60 }, view, 56, 80)).toBe(false);
  });
});
