// Номер страницы, введённый руками (1.34): «Страница [ 7 ] из 12». Чистые функции — их проверяют тесты (pageNumber.test.ts).

/**
 * Что ввёл ученик → номер страницы 1..total. Целое число ограничивается диапазоном (0 и минус → 1, больше — последняя),
 * всё остальное (пусто, дробь, буквы, «1e3», цифры других алфавитов) — прежняя страница. Никогда не NaN.
 */
export function parsePageInput(raw: string, current: number, total: number): number {
  const last = Math.max(1, Math.floor(Number.isFinite(total) ? total : 1));
  const keep = clampPage(current, last);
  const s = raw.trim();
  if (!/^[-+]?\d{1,9}$/.test(s)) return keep;
  return clampPage(Number(s), last);
}

/** Номер внутри 1..total (total < 1 считается 1). */
export function clampPage(n: number, total: number): number {
  const last = Math.max(1, Math.floor(total));
  if (!Number.isFinite(n)) return 1;
  return Math.min(last, Math.max(1, Math.trunc(n)));
}


/**
 * Страницы с «настоящими» номерами (фото учебника: стр. 45, 46, 48…): что ввёл ученик → индекс в списке.
 * Ввели номер, которого нет, — ближайшая страница (при равенстве — меньшая); некорректный ввод — прежний индекс.
 */
export function pageIndexFor(raw: string, current: number, numbers: readonly number[]): number {
  if (!numbers.length) return 0;
  const keep = Math.min(numbers.length - 1, Math.max(0, Number.isFinite(current) ? Math.trunc(current) : 0));
  const s = raw.trim();
  if (!/^[-+]?\d{1,9}$/.test(s)) return keep;
  const want = Number(s);
  let best = 0;
  for (let i = 1; i < numbers.length; i++) if (Math.abs(numbers[i] - want) < Math.abs(numbers[best] - want)) best = i;
  return best;
}

/** Номера идут подряд с 1 (1, 2, 3 …) — тогда пишем «из N», иначе показываем ещё и порядковый номер. */
export const plainNumbers = (numbers: readonly number[]) => numbers.every((n, i) => n === i + 1);
