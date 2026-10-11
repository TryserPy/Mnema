// Где сейчас на экране то, что подсвечиваем. Читаем место элемента КАЖДЫЙ КАДР, а не раз в четверть секунды:
// окно «Создать» появляется с анимацией (сдвиг и увеличение), список в окне прокручивается, окно меняет размер —
// рамка должна всё это повторять без отставания. Работает и с телефоном (zoom/--rf-ui-scale не мешают: берём getBoundingClientRect).
import { useEffect, useState, type MutableRefObject } from 'react';
import { clipRect, sameRect, type Rect } from './guideTarget';

/**
 * @param elRef  в `.current` — подсвечиваемый элемент (обновляй где угодно, хоть раз в секунду).
 * @param active идёт ли подсветка вообще.
 * @param onStale вызывается, если элемент пропал из страницы (React заменил узел) — пора искать цель заново.
 */
export function useTargetRect(elRef: MutableRefObject<HTMLElement | null>, active: boolean, onStale?: () => void): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = elRef.current;
      if (!el) return setRect((o) => (o ? null : o));
      if (!el.isConnected) {
        setRect((o) => (o ? null : o));
        onStale?.();
        return;
      }
      const b = el.getBoundingClientRect();
      const next = clipRect({ x: b.left, y: b.top, w: b.width, h: b.height }, window.innerWidth, window.innerHeight);
      setRect((o) => (sameRect(o, next) ? o : next));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  return rect;
}
