// Знакомство-тренажёр: счёт действий («Шаг N из М») и расчёты рамки подсветки. Чистая логика из components/guideTarget.ts.
import { describe, expect, it } from 'vitest';
import { ACTIONS, actionNumber, lowSidePlace, MAJORS, needsScroll, sameRect, stepInfo, TOTAL_ACTIONS } from './components/guideTarget';

describe('счёт действий в знакомстве', () => {
  it('на каждый крупный шаг есть число действий, всего — их сумма', () => {
    expect(ACTIONS.length).toBe(MAJORS.length);
    expect(TOTAL_ACTIONS).toBe(ACTIONS.reduce((a, b) => a + b, 0));
    expect(ACTIONS.every((n) => n >= 1)).toBe(true);
    expect(ACTIONS[0]).toBe(3); // Предмет: «Создать» → «Новый предмет» → назвать и создать
  });

  it('«Создать» — шаг 1, выбор «Новый предмет» (второе действие) — шаг 2, а не снова «Шаг 1»', () => {
    expect(actionNumber(0, 3)).toBe(1);
    expect(actionNumber(0, 2)).toBe(2);
    expect(actionNumber(0, 1)).toBe(3);
  });

  it('номер сквозной: «Тема» продолжает счёт после «Предмета»', () => {
    expect(actionNumber(1, ACTIONS[1])).toBe(ACTIONS[0] + 1);
    expect(actionNumber(2, ACTIONS[2])).toBe(ACTIONS[0] + ACTIONS[1] + 1);
  });

  it('главный путь: номер растёт ровно на единицу и кончается на «М из М»', () => {
    let prev = 0;
    for (let m = 0; m < ACTIONS.length; m++)
      for (let left = ACTIONS[m]; left >= 1; left--) {
        const n = actionNumber(m, left);
        expect(n).toBe(prev + 1);
        prev = n;
      }
    expect(prev).toBe(TOTAL_ACTIONS);
  });

  it('ушёл в сторону — номер честно откатывается, но не ниже 1 и не выше М', () => {
    expect(actionNumber(0, 1)).toBeGreaterThan(actionNumber(0, 3)); // закрыл окно: с «назвать» обратно на «Создать»
    expect(actionNumber(0, 3)).toBe(1);
    expect(actionNumber(3, 4)).toBeLessThan(actionNumber(3, 2)); // карточка: вышел из темы — дальше от конца
    expect(actionNumber(0, 99)).toBe(1);
    expect(actionNumber(0, 0)).toBe(3); // «осталось 0» читаем как «последнее»
    expect(actionNumber(99, 1)).toBe(TOTAL_ACTIONS);
    expect(actionNumber(-3, ACTIONS[0])).toBe(1);
    expect(actionNumber(NaN, NaN)).toBeGreaterThanOrEqual(1);
  });

  it('stepInfo: название крупного шага и доля для полоски; экран «Готово» — «М из М»', () => {
    const a = stepInfo(0, 2);
    expect(a).toMatchObject({ n: 2, total: TOTAL_ACTIONS, title: 'Предмет' });
    expect(a.pct).toBeCloseTo((2 / TOTAL_ACTIONS) * 100);
    const t = stepInfo(1, 3);
    expect(t.title).toBe('Тема');
    expect(t.n).toBe(ACTIONS[0] + 1);
    const z = stepInfo(MAJORS.length, 1);
    expect(z).toMatchObject({ n: TOTAL_ACTIONS, total: TOTAL_ACTIONS, pct: 100 });
    const lastStep = stepInfo(MAJORS.length - 1, 1);
    expect(lastStep.n).toBe(TOTAL_ACTIONS);
    expect(lastStep.title).toBe('Повторение');
  });
});

describe('рамка подсветки', () => {
  it('sameRect: разница меньше полпикселя — одно и то же', () => {
    expect(sameRect({ x: 1, y: 1, w: 10, h: 10 }, { x: 1.2, y: 1.1, w: 10.3, h: 9.9 })).toBe(true);
    expect(sameRect({ x: 1, y: 1, w: 10, h: 10 }, { x: 2, y: 1, w: 10, h: 10 })).toBe(false);
    expect(sameRect(null, null)).toBe(true);
    expect(sameRect(null, { x: 0, y: 0, w: 1, h: 1 })).toBe(false);
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
    // окно со своей прокруткой: видимая область — само окно
    expect(needsScroll({ x: 10, y: 560, w: 300, h: 60 }, { x: 0, y: 100, w: 390, h: 400 })).toBe(true);
  });
});

describe('плашка на низком экране (телефон на боку)', () => {
  it('окно посередине экрана 844×390: плашка уходит в поле сбоку и не заходит на окно', () => {
    const modal = { x: 157, y: 8, w: 530, h: 374 };
    const p = lowSidePlace(modal, 844);
    expect(p).not.toBeNull();
    expect(p!.width).toBeGreaterThanOrEqual(130);
    const right = p!.left + p!.width;
    expect(right <= modal.x || p!.left >= modal.x + modal.w).toBe(true); // не пересекает окно (ни слева, ни справа)
    expect(p!.left).toBeGreaterThanOrEqual(8);
    expect(p!.left + p!.width).toBeLessThanOrEqual(844 - 8);
  });

  it('сбоку тесно (окно почти на всю ширину) или цель узкая — null, плашка остаётся наверху', () => {
    expect(lowSidePlace({ x: 20, y: 8, w: 640, h: 340 }, 667)).toBeNull();
    expect(lowSidePlace({ x: 300, y: 8, w: 40, h: 40 }, 844)).toBeNull(); // кнопка: найдётся место и без боковой полосы
  });
});
