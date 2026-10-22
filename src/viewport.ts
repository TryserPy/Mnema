// Видимая часть окна на телефоне (1.33): экранная клавиатура, системные панели и масштаб.
// В Android WebView и Safari 100dvh не уменьшается, когда открыта клавиатура, — нижние листы, кнопки «Отмена»/«Готово»
// и нижняя навигация уезжали под неё. Здесь из visualViewport выставляются:
//   --vvh  — высота видимой части окна;
//   --kb   — сколько снизу закрыто клавиатурой (0, если её нет);
//   html[data-kb] — клавиатура открыта (CSS прячет нижнюю навигацию и плавающие кнопки).
// 1.34: когда клавиатура открывается, поле, где печатают, прокручивается на виду (revealFocused).

/** Клавиатура открыта, если снизу закрыто больше этого (адресная строка и жесты — меньше). */
export const KB_MIN = 120;

export function keyboardInset(innerHeight: number, vv: { height: number; offsetTop: number } | null): number {
  if (!vv) return 0;
  return Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
}

/** Поле, в котором печатают (его должно быть видно над клавиатурой). */
export function isTypingField(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit', 'color', 'file'].includes(el.type);
}

/**
 * Насколько прокрутить, чтобы поле (или строка с курсором) оказалось в видимой части окна с запасом gap:
 * > 0 — вниз, < 0 — вверх, 0 — уже видно. Высокое поле (конспект) — достаточно, чтобы был виден его верх или курсор.
 */
export function revealDelta(rect: { top: number; bottom: number }, view: { top: number; bottom: number }, gap = 12): number {
  const room = view.bottom - view.top - gap * 2;
  if (rect.bottom - rect.top > room) {
    // Не помещается целиком: верх поля (или курсор) — у верхнего края видимой части.
    if (rect.top >= view.top + gap && rect.top <= view.bottom - gap) return 0;
    return rect.top - (view.top + gap);
  }
  if (rect.bottom > view.bottom - gap) return rect.bottom - (view.bottom - gap);
  if (rect.top < view.top + gap) return rect.top - (view.top + gap);
  return 0;
}

/** Где курсор (для конспекта — сама строка, а не всё поле). */
function caretRect(el: HTMLElement): { top: number; bottom: number } {
  if (el.isContentEditable) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.height || r.top) return { top: r.top, bottom: r.bottom };
    }
  }
  return el.getBoundingClientRect();
}

/** Открылась клавиатура — поле, где печатают, прокрутить на виду (Android WebView и Safari сами этого часто не делают). */
export function revealFocused(vv: { height: number; offsetTop: number } | null): void {
  const el = document.activeElement;
  if (!isTypingField(el)) return;
  const view = { top: vv?.offsetTop ?? 0, bottom: (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight) };
  const dy = revealDelta(caretRect(el), view);
  if (!dy) return;
  // Прокручиваем ближайший прокручиваемый блок (окно, .main, тело окна), а не всю страницу.
  let box: HTMLElement | null = el.parentElement;
  while (box && !(box.scrollHeight > box.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
  if (box) box.scrollBy({ top: dy });
  else window.scrollBy({ top: dy });
}

export function initViewport(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const root = document.documentElement;
  const vv = window.visualViewport ?? null;
  let raf = 0;
  let wasOpen = false;
  const apply = () => {
    raf = 0;
    const kb = keyboardInset(window.innerHeight, vv);
    const open = kb >= KB_MIN;
    // Клавиатура только что открылась (или окно уменьшилось, interactive-widget=resizes-content) — показать поле.
    if (open && !wasOpen) requestAnimationFrame(() => revealFocused(vv));
    wasOpen = open;
    root.style.setProperty('--vvh', `${Math.round(vv?.height ?? window.innerHeight)}px`);
    root.style.setProperty('--kb', `${kb >= KB_MIN ? kb : 0}px`);
    if (kb >= KB_MIN) root.dataset.kb = '';
    else delete root.dataset.kb;
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };
  apply();
  // Окно само уменьшилось под клавиатуру (Chrome с resizes-content): visualViewport не «закрыт», но поле могло уйти вниз.
  let lastH = window.innerHeight;
  const onResize = () => {
    if (window.innerHeight < lastH - KB_MIN) requestAnimationFrame(() => revealFocused(vv));
    lastH = window.innerHeight;
    schedule();
  };
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  window.addEventListener('resize', onResize);
  return () => {
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onResize);
    if (raf) cancelAnimationFrame(raf);
  };
}
