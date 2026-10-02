// Когда показывать маленький «квадратик» с инструментами конспекта.
// Раньше он появлялся, пока панель ещё была на виду (жёсткий отступ −72 px считался от окна).
// Теперь — только когда ВСЯ панель ушла выше видимого верха прокручиваемой области.

/** Запас, чтобы квадратик не мигал на «резине» прокрутки телефона: появляется при уходе панели,
 *  а пропадает, только когда панель вернулась заметно (не на пиксель). */
export const FLOAT_HYSTERESIS = 12;

/**
 * @param barBottom нижний край панели инструментов (px, от верха окна)
 * @param visibleTop верх видимой части области прокрутки (с учётом липкой полосы в режиме «на весь экран»)
 * @param wasGone     квадратик сейчас показан
 */
export function barUnreachable(barBottom: number, visibleTop: number, wasGone: boolean, hysteresis = FLOAT_HYSTERESIS): boolean {
  return wasGone ? barBottom <= visibleTop + hysteresis : barBottom <= visibleTop;
}

/** Верх видимой области: верх контейнера прокрутки плюс высота липкой полосы (только в режиме «на весь экран»). */
export function visibleTopOf(container: Element | null, bar: Element): number {
  const c = container ?? bar.closest('.note-layout.full') ?? bar.closest('.main');
  const top = c ? Math.max(0, c.getBoundingClientRect().top) : 0;
  const stickyH = c?.classList.contains('full') ? (c.querySelector('.note-full-bar') as HTMLElement | null)?.offsetHeight ?? 0 : 0;
  return top + stickyH;
}
