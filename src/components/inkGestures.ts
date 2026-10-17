// Жесты холста (1.32): один палец или стилус — рисует, два пальца — масштаб и сдвиг (щипок), колёсико с Ctrl — масштаб.
// Ладонь не рисует: если на этом холсте уже был стилус, касания пальцем только двигают и масштабируют;
// широкое касание (ребро ладони) не рисует никогда. Масштаб — через <g transform>, данные рисунка не меняются.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from 'react';
import { svgPoint } from './Drawing';

export interface InkView {
  s: number;
  x: number;
  y: number;
}

export const MAX_ZOOM = 6;
/** Касание шире этого (CSS px) — ладонь, а не палец. */
const PALM_PX = 42;

/** Масштаб в рамках и сдвиг так, чтобы холст не уезжал за край. w, h — размер холста в единицах viewBox. */
export function clampView(v: InkView, w: number, h: number): InkView {
  const s = Math.min(MAX_ZOOM, Math.max(1, v.s));
  return { s, x: Math.min(0, Math.max(w - w * s, v.x)), y: Math.min(0, Math.max(h - h * s, v.y)) };
}

/** Масштаб с центром в точке (в единицах viewBox): точка под пальцами остаётся на месте. */
export function zoomAt(v: InkView, factor: number, cx: number, cy: number, w: number, h: number): InkView {
  const s = Math.min(MAX_ZOOM, Math.max(1, v.s * factor));
  const k = s / v.s;
  return clampView({ s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }, w, h);
}

export function useInk(o: {
  svg: RefObject<SVGSVGElement | null>;
  size: { w: number; h: number };
  onStart: (p: [number, number]) => void;
  onMove: (p: [number, number]) => void;
  onEnd: () => void;
  /** Начался щипок: недорисованный штрих отменить. */
  onCancel: () => void;
}) {
  const [view, setView] = useState<InkView>({ s: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pts = useRef(new Map<number, { x: number; y: number; type: string }>());
  const drawing = useRef<number | null>(null);
  const pinch = useRef<{ d: number; mx: number; my: number; v: InkView } | null>(null);
  const penSeen = useRef(false);

  const raw = (e: { clientX: number; clientY: number }) => svgPoint(o.svg.current!, e.clientX, e.clientY);
  const toContent = (r: [number, number]): [number, number] => {
    const v = viewRef.current;
    return [Math.round(((r[0] - v.x) / v.s) * 10) / 10, Math.round(((r[1] - v.y) / v.s) * 10) / 10];
  };
  const two = () => {
    const [a, b] = [...pts.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const onPointerDown = (e: RPointerEvent) => {
    if (e.pointerType === 'pen') penSeen.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const r = raw(e);
    pts.current.set(e.pointerId, { x: r[0], y: r[1], type: e.pointerType });
    const touches = [...pts.current.values()].filter((p) => p.type === 'touch').length;
    if (e.pointerType === 'touch' && touches >= 2) {
      if (drawing.current !== null) {
        drawing.current = null;
        o.onCancel();
      }
      pinch.current = { ...two(), v: viewRef.current };
      return;
    }
    const palm = e.pointerType === 'touch' && (penSeen.current || Math.max(e.width || 0, e.height || 0) >= PALM_PX);
    if (palm || drawing.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drawing.current = e.pointerId;
    o.onStart(toContent(r));
  };

  const onPointerMove = (e: RPointerEvent) => {
    const p = pts.current.get(e.pointerId);
    if (!p) return;
    const r = raw(e);
    p.x = r[0];
    p.y = r[1];
    const pc = pinch.current;
    if (pc && pts.current.size >= 2) {
      const t = two();
      const k = t.d / pc.d;
      const s = Math.min(MAX_ZOOM, Math.max(1, pc.v.s * k));
      // Точка холста, что была между пальцами, остаётся между пальцами (и едет за ними).
      const cx = (pc.mx - pc.v.x) / pc.v.s;
      const cy = (pc.my - pc.v.y) / pc.v.s;
      setView(clampView({ s, x: t.mx - cx * s, y: t.my - cy * s }, o.size.w, o.size.h));
      return;
    }
    if (drawing.current === e.pointerId) o.onMove(toContent(r));
  };

  const onPointerUp = (e: RPointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (drawing.current === e.pointerId) {
      drawing.current = null;
      o.onEnd();
    }
  };

  // Ctrl + колёсико (и щипок на тачпаде) — масштаб. Слушатель не пассивный: иначе браузер масштабировал бы всю страницу.
  const sizeRef = useRef(o.size);
  sizeRef.current = o.size;
  useEffect(() => {
    const el = o.svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = svgPoint(el, e.clientX, e.clientY);
      setView(zoomAt(viewRef.current, e.deltaY < 0 ? 1.15 : 1 / 1.15, r[0], r[1], sizeRef.current.w, sizeRef.current.h));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [o.svg]);

  const zoom = (f: number) => setView(zoomAt(viewRef.current, f, o.size.w / 2, o.size.h / 2, o.size.w, o.size.h));
  const reset = () => setView({ s: 1, x: 0, y: 0 });
  const transform = view.s === 1 && !view.x && !view.y ? undefined : `translate(${view.x} ${view.y}) scale(${view.s})`;
  return { view, transform, zoom, reset, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture: onPointerUp } };
}
