// Видимая часть окна на телефоне (1.33): экранная клавиатура, системные панели и масштаб.
// В Android WebView и Safari 100dvh не уменьшается, когда открыта клавиатура, — нижние листы, кнопки «Отмена»/«Готово»
// и нижняя навигация уезжали под неё. Здесь из visualViewport выставляются:
//   --vvh  — высота видимой части окна;
//   --kb   — сколько снизу закрыто клавиатурой (0, если её нет);
//   html[data-kb] — клавиатура открыта (CSS прячет нижнюю навигацию и плавающие кнопки).

/** Клавиатура открыта, если снизу закрыто больше этого (адресная строка и жесты — меньше). */
export const KB_MIN = 120;

export function keyboardInset(innerHeight: number, vv: { height: number; offsetTop: number } | null): number {
  if (!vv) return 0;
  return Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
}

export function initViewport(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const root = document.documentElement;
  const vv = window.visualViewport ?? null;
  let raf = 0;
  const apply = () => {
    raf = 0;
    const kb = keyboardInset(window.innerHeight, vv);
    root.style.setProperty('--vvh', `${Math.round(vv?.height ?? window.innerHeight)}px`);
    root.style.setProperty('--kb', `${kb >= KB_MIN ? kb : 0}px`);
    if (kb >= KB_MIN) root.dataset.kb = '';
    else delete root.dataset.kb;
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };
  apply();
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  return () => {
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (raf) cancelAnimationFrame(raf);
  };
}
