// Свайп карточки при повторении (1.32, п.10). Только палец: мышь и стилус работают кнопками, как раньше.
// До ответа: нажатие на карточку открывает ответ. После ответа: вправо — «Помню», влево — «Снова».
// Карточка едет за пальцем на transform (без перерисовки страницы), вертикальная прокрутка длинного ответа не мешает.
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { swipeAxis, swipeThreshold, swipeVerdict } from '../gestures';
import { haptic, motionOn } from './ui';

interface Opts {
  enabled: boolean;
  revealed: boolean;
  /** Можно ли открыть ответ нажатием (нет поля ввода ответа). */
  tapReveal: boolean;
  onReveal: () => void;
  onGrade: (v: 'good' | 'again') => void;
}

/** Внутри чего нажатие — не про карточку: кнопки, ссылки, поля, рисунок, длинная формула с прокруткой вбок. */
function ownGesture(target: EventTarget | null, card: HTMLElement): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== card) {
    if (el.matches('button, a, input, textarea, select, label, [contenteditable="true"], canvas, .hand-pad, .voice-box, .ai-box')) return true;
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible') return true;
    el = el.parentElement;
  }
  return false;
}

export function useCardSwipe(o: Opts) {
  const opts = useRef(o);
  opts.current = o;
  const g = useRef<{ id: number; x: number; y: number; t: number; axis: 'x' | 'y' | null; el: HTMLElement; w: number; armed: '' | 'good' | 'again' } | null>(null);

  const paint = (el: HTMLElement, dx: number, armed: '' | 'good' | 'again') => {
    el.style.transform = dx ? `translateX(${dx}px) rotate(${motionOn('review') ? dx / 40 : 0}deg)` : '';
    if (armed) el.dataset.swipe = armed;
    else delete el.dataset.swipe;
    el.style.setProperty('--swipe', String(Math.min(1, Math.abs(dx) / swipeThreshold(el.clientWidth))));
  };

  const reset = (el: HTMLElement) => {
    el.classList.add('swipe-back');
    paint(el, 0, '');
    el.style.removeProperty('--swipe');
    window.setTimeout(() => el.classList.remove('swipe-back'), 220);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'touch' || !opts.current.enabled || g.current) return;
    const el = e.currentTarget;
    if (ownGesture(e.target, el)) return;
    g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: null, el, w: el.clientWidth, armed: '' };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.axis) {
      s.axis = swipeAxis(dx, dy);
      if (s.axis === 'x' && opts.current.revealed) s.el.setPointerCapture?.(e.pointerId);
    }
    if (s.axis !== 'x' || !opts.current.revealed) return;
    const armed = Math.abs(dx) >= swipeThreshold(s.w) ? (dx > 0 ? 'good' : 'again') : '';
    if (armed && armed !== s.armed) haptic(6); // палец почувствует, что отпускать уже можно
    s.armed = armed;
    paint(s.el, dx, armed);
  };

  const end = (e: ReactPointerEvent<HTMLElement>, cancel: boolean) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    g.current = null;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const { revealed, tapReveal, onReveal, onGrade } = opts.current;
    if (cancel) return reset(s.el);
    // Нажатие без сдвига до ответа — показать ответ (как кнопка «Показать ответ», только по всей карточке).
    if (!revealed) {
      if (!s.axis && tapReveal && Math.hypot(dx, dy) < 10 && !window.getSelection()?.toString()) onReveal();
      return;
    }
    if (s.axis !== 'x') return reset(s.el);
    const v = swipeVerdict(dx, s.w, performance.now() - s.t);
    if (!v) return reset(s.el);
    // Карточка улетает в сторону ответа, затем — следующая. Без анимаций — сразу.
    if (!motionOn('review')) return onGrade(v);
    s.el.classList.add('swipe-out');
    paint(s.el, (v === 'good' ? 1 : -1) * (s.w + 80), v);
    window.setTimeout(() => {
      onGrade(v);
      // Карточка осталась (например, открылось «Почему?») — вернуть её на место.
      requestAnimationFrame(() => {
        if (!s.el.isConnected) return;
        s.el.classList.remove('swipe-out');
        paint(s.el, 0, '');
      });
    }, 170);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => end(e, false),
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => end(e, true)
  };
}
