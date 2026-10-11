// Знакомство-тренажёр: чистая логика без DOM — счёт действий и расчёты с рамкой подсветки. Тесты: src/v130-guide.test.ts.

/** Крупные шаги знакомства (в плашке рядом с номером: «Шаг 4 из 16 · Тема»). */
export const MAJORS = ['Предмет', 'Тема', 'Конспект', 'Карточка', 'Повторение', 'Готово'];

/**
 * Сколько действий в каждом крупном шаге, если идти «главным путём».
 * Предмет: открыть «Создать» → выбрать «Новый предмет» → назвать и создать.
 * Тема: то же самое. Конспект: открыть тему → открыть вкладку «Конспект» → написать.
 * Карточка: вернуться в тему → вкладка «Конспект» → выделить и «В карточку» → заполнить и сохранить.
 * Повторение: уйти на «Сегодня» (закрыть окно) → «Учиться». Готово: «Закончить».
 */
export const ACTIONS = [3, 3, 3, 4, 2, 1];

/** Всего действий на главном пути — это «М» в «Шаг N из М». */
export const TOTAL_ACTIONS = ACTIONS.reduce((a, b) => a + b, 0);

/** Сквозной номер действия: сколько действий в пройденных крупных шагах + номер внутри текущего (с единицы, в пределах шага). */
export function actionNumber(major: number, step: number): number {
  const m = Math.max(0, Math.min(ACTIONS.length - 1, Math.floor(major)));
  const before = ACTIONS.slice(0, m).reduce((a, b) => a + b, 0);
  return before + Math.max(1, Math.min(ACTIONS[m], Math.floor(step) || 1));
}

/** Всё для плашки: номер, сколько всего, название крупного шага и доля для полоски. */
export function stepInfo(major: number, step: number): { n: number; total: number; title: string; pct: number } {
  const n = actionNumber(major, step);
  const m = Math.max(0, Math.min(MAJORS.length - 1, Math.floor(major)));
  return { n, total: TOTAL_ACTIONS, title: MAJORS[m], pct: (n / TOTAL_ACTIONS) * 100 };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Рамки считаем одинаковыми, если все числа отличаются меньше чем на полпикселя (иначе рамка зря перерисовывается каждый кадр). */
export function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
}

/** Рамка не должна вылезать за экран: обрезаем по видимой области. Если от цели ничего не видно — null. */
export function clipRect(r: Rect, vw: number, vh: number): Rect | null {
  const x1 = Math.max(0, r.x);
  const y1 = Math.max(0, r.y);
  const x2 = Math.min(vw, r.x + r.w);
  const y2 = Math.min(vh, r.y + r.h);
  if (x2 - x1 < 1 || y2 - y1 < 1) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Нужно ли прокрутить цель в видимую область: она (почти) целиком не помещается в экран или в окно, где лежит.
 * Огромные цели (редактор конспекта выше экрана) не трогаем — иначе страница прыгала бы под пальцем.
 * `view` — видимая область (экран, суженный окном-родителем с прокруткой); `top`/`bottom` — полосы экрана, занятые плашкой тура или панелями.
 */
export function needsScroll(r: Rect, view: Rect, top = 0, bottom = 0): boolean {
  const vTop = view.y + top;
  const vBottom = view.y + view.h - bottom;
  if (r.h > (vBottom - vTop) * 0.85) return false; // не поместится всё равно
  return r.y < vTop - 0.5 || r.y + r.h > vBottom + 0.5;
}
