// Жесты пальцем (1.32, п.10): свайп карточки при повторении и «потянуть вниз, чтобы обновить».
// Здесь только расчёты — без DOM, чтобы их можно было проверить тестами; обработчики касаний — в компонентах.

/** Насколько сдвинуть палец вбок, чтобы свайп засчитался: доля ширины карточки, но не меньше 80 и не больше 160 px. */
export function swipeThreshold(width: number): number {
  return Math.min(160, Math.max(80, width * 0.28));
}

/** Сдвиг в начале жеста, после которого понятно, куда ведут палец: вбок (свайп) или вверх-вниз (прокрутка). */
export const SWIPE_SLOP = 10;

/**
 * Куда ведут палец в начале жеста. Вбок — только если по горизонтали явно больше, чем по вертикали,
 * иначе это прокрутка длинного ответа, и карточку не трогаем.
 */
export function swipeAxis(dx: number, dy: number): 'x' | 'y' | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_SLOP && ay < SWIPE_SLOP) return null;
  return ax > ay * 1.4 ? 'x' : 'y';
}

/**
 * Итог свайпа карточки: вправо — «Помню» (Хорошо), влево — «Снова». Быстрый короткий взмах (больше 0,5 px/мс)
 * тоже засчитывается — так привычно по Telegram и Tinder.
 */
export function swipeVerdict(dx: number, width: number, ms = 1000): 'good' | 'again' | null {
  const fast = ms > 0 && Math.abs(dx) / ms > 0.5 && Math.abs(dx) > 40;
  if (Math.abs(dx) < swipeThreshold(width) && !fast) return null;
  return dx > 0 ? 'good' : 'again';
}

/** Сопротивление при «потянуть вниз»: палец уходит дальше, полоска — всё медленнее (как резинка). */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0;
  return Math.min(120, dy * 0.5 + Math.sqrt(dy) * 2);
}

/** Сколько потянуть (после сопротивления), чтобы обновить. */
export const PULL_TRIGGER = 64;
