// «Потяни вниз, чтобы обновить» (1.32, п.10) — только на телефоне и только когда экран прокручен до самого верха.
// Индикатор едет на transform; пока идёт обновление — крутится. Для чтения с экрана — фраза в aria-live.
import { useEffect, useRef, useState } from 'react';
import { PULL_TRIGGER, pullDistance } from '../gestures';
import { haptic, Icon, touchUI } from './ui';

export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const run = useRef(onRefresh);
  run.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    const host = el?.closest('.main') as HTMLElement | null;
    if (!el || !host || !touchUI()) return;
    let start: { x: number; y: number } | null = null;
    let d = 0;
    let armed = false;
    const paint = (px: number, anim: boolean) => {
      el.style.transition = anim ? 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.22s' : 'none';
      el.style.transform = `translate(-50%, ${px - 48}px)`;
      el.style.opacity = String(Math.min(1, px / PULL_TRIGGER));
      el.style.setProperty('--pull', String(Math.min(1, px / PULL_TRIGGER)));
    };
    const down = (e: TouchEvent) => {
      if (busyRef.current || e.touches.length !== 1 || host.scrollTop > 0) return;
      // Внутри листов, редакторов и полей вниз тянут своё.
      if ((e.target as Element | null)?.closest?.('input, textarea, [contenteditable="true"], .modal, .sheet, canvas')) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      d = 0;
      armed = false;
    };
    const move = (e: TouchEvent) => {
      if (!start) return;
      const dy = e.touches[0].clientY - start.y;
      const dx = e.touches[0].clientX - start.x;
      if (dy <= 0 || (d === 0 && Math.abs(dx) > dy)) {
        if (d > 0) paint(0, true);
        start = dy <= 0 && d === 0 ? null : start;
        d = 0;
        return;
      }
      d = pullDistance(dy);
      if (e.cancelable) e.preventDefault(); // не даём браузеру «пружинить» и перезагружать страницу своим жестом
      const now = d >= PULL_TRIGGER;
      if (now && !armed) haptic(8);
      armed = now;
      el.classList.toggle('armed', armed);
      paint(d, false);
    };
    const up = () => {
      if (!start) return;
      start = null;
      if (!armed) return paint(0, true);
      busyRef.current = true;
      setBusy(true);
      paint(PULL_TRIGGER, true);
      void Promise.resolve()
        .then(() => run.current())
        .catch(() => undefined)
        .finally(() => {
          busyRef.current = false;
          setBusy(false);
          el.classList.remove('armed');
          paint(0, true);
        });
    };
    host.addEventListener('touchstart', down, { passive: true });
    host.addEventListener('touchmove', move, { passive: false });
    host.addEventListener('touchend', up);
    host.addEventListener('touchcancel', up);
    paint(0, false);
    return () => {
      host.removeEventListener('touchstart', down);
      host.removeEventListener('touchmove', move);
      host.removeEventListener('touchend', up);
      host.removeEventListener('touchcancel', up);
    };
  }, []);

  return (
    <>
      <div ref={ref} className={'ptr' + (busy ? ' busy' : '')} aria-hidden>
        <Icon name="sync" size={20} />
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {busy ? 'Обновляю…' : ''}
      </span>
    </>
  );
}
