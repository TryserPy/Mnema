// Общее для знакомства (Tutorial) и «Где это?» (ShowMe): следить за тем, что подсвечивать, без опроса по таймеру.
// Экран поменялся (появился или пропал элемент, окно, сменился класс) — один раз за кадр пересчитываем подсказку;
// размер элемента или окна изменился — пересчитываем положение рамки. Пока ничего не меняется, ничего и не считается.
import { useEffect, useLayoutEffect, useState } from 'react';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Счётчик «на экране что-то поменялось» (не чаще раза за кадр). Изменения внутри самой подсказки (.tut) не считаются. */
export function useDomTick(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const bump = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          setTick((t) => t + 1);
        });
    };
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        const el = m.target instanceof Element ? m.target : m.target.parentElement;
        if (!el?.closest('.tut')) {
          bump();
          return;
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'hidden', 'aria-selected', 'aria-checked', 'open'] });
    window.addEventListener('resize', bump);
    window.addEventListener('scroll', bump, true);
    return () => {
      mo.disconnect();
      window.removeEventListener('resize', bump);
      window.removeEventListener('scroll', bump, true);
      cancelAnimationFrame(raf);
    };
  }, [active]);
  return tick;
}

const same = (a: Rect | null, b: Rect | null) => (a === b) || (!!a && !!b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1);

/** Положение элемента на экране; обновляется, когда меняется сам элемент, его размер или `tick`. Нет элемента — null. */
export function useRect(el: HTMLElement | null, tick: number): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (!el || !el.isConnected) return setRect((o) => (o === null ? o : null));
    const r = el.getBoundingClientRect();
    const next = { x: r.left, y: r.top, w: r.width, h: r.height };
    setRect((o) => (same(o, next) ? o : next));
  }, [el, tick]);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const next = { x: r.left, y: r.top, w: r.width, h: r.height };
      setRect((o) => (same(o, next) ? o : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return el ? rect : null;
}
