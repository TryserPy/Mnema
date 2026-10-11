// Логотип Refrain: R с эхо. Играет при появлении и при наведении (если анимации не выключены).
import { useEffect, useRef } from 'react';
import '../logo.css';

const R = 'M10 24 V8 H17 C21 8 23 10 23 12.5 C23 15 21 17 17 17 H10 M16.5 17.5 L23 24';

/** Перезапустить анимацию логотипа с начала, если она сейчас не идёт. */
function replay(el: HTMLElement | null) {
  if (!el?.getAnimations) return;
  if (document.documentElement.dataset.motion === 'off' || document.documentElement.dataset.uiAnim === 'off') return;
  const as = el.getAnimations({ subtree: true });
  if (as.some((a) => a.playState === 'running')) return;
  as.forEach((a) => {
    a.currentTime = 0;
    a.play();
  });
}

export function Logo({ size = 34, appear = true, hover = true }: { size?: number; appear?: boolean; hover?: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  const logo = useRef<HTMLSpanElement>(null);
  // Появление: класс play на один проигрыш; потом он снимается, чтобы наведение могло сыграть заново.
  useEffect(() => {
    const el = logo.current;
    if (!el || !appear) return;
    el.classList.add('play');
    const off = setTimeout(() => el.classList.remove('play'), 1800);
    return () => clearTimeout(off);
  }, [appear]);
  const onEnter = () => {
    const el = logo.current;
    if (!el || !hover) return;
    if (el.classList.contains('play')) return replay(el);
    el.classList.add('play');
    clearTimeout((el as unknown as { _t?: ReturnType<typeof setTimeout> })._t);
    (el as unknown as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => el.classList.remove('play'), 1800);
  };
  return (
    <span ref={box} className={'logo-box' + (hover ? ' hov' : '')} style={{ ['--ml' as string]: size }} aria-hidden="true" onPointerEnter={onEnter}>
      <span ref={logo} className="mlogo" style={{ ['--ml' as string]: size }}>
        <span className="mlogo-bg" />
        <span className="mlogo-ring" />
        <svg viewBox="0 0 32 32">
          <path className="echo e2" d={R} />
          <path className="echo e1" d={R} />
          <path className="r" pathLength={100} d={R} />
        </svg>
        <span className="mlogo-dot" />
      </span>
    </span>
  );
}
