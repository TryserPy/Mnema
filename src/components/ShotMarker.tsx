// «Сообщить о проблеме»: снимок (окна или свой) с отметками — рамкой обводишь место, где проблема. Отметки рисуются прямо
// на картинке, которая уйдёт с отчётом; сама картинка — JPEG не больше SHOT_MAX знаков base64.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

/** Сервер принимает снимок до 1 МБ (≈1,4 млн знаков base64). */
export const SHOT_MAX = 1.4 * 1024 * 1024;
const SIDE = 1600;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Не получилось открыть картинку. Подойдут PNG, JPEG или WebP.'));
    img.src = url;
  });
}

/** Холст → JPEG base64 (без «data:»), качество снижается, пока не влезет в SHOT_MAX. */
function toJpeg(c: HTMLCanvasElement): string {
  for (const q of [0.85, 0.75, 0.6, 0.45, 0.3]) {
    const url = c.toDataURL('image/jpeg', q);
    const b64 = url.slice(url.indexOf(',') + 1);
    if (b64.length < SHOT_MAX) return b64;
  }
  return '';
}

/** Файл-картинка → JPEG base64 (длинная сторона не больше 1600 px). */
export async function imageFileToShot(f: File): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const b64 = toJpeg(c);
    if (!b64) throw new Error('Картинка слишком большая.');
    return b64;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function paint(ctx: CanvasRenderingContext2D, img: HTMLImageElement, boxes: Box[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const line = Math.max(3, Math.round(Math.max(w, h) / 320));
  for (const b of boxes) {
    const x = Math.min(b.x, b.x + b.w);
    const y = Math.min(b.y, b.y + b.h);
    const bw = Math.abs(b.w);
    const bh = Math.abs(b.h);
    ctx.fillStyle = 'rgba(229, 56, 59, 0.12)';
    ctx.fillRect(x, y, bw, bh);
    ctx.lineWidth = line;
    ctx.strokeStyle = '#e5383b';
    ctx.strokeRect(x, y, bw, bh);
  }
}

/** Снимок с отметками. onChange получает итоговую картинку (с рамками) каждый раз, когда рамок стало больше или меньше. */
export function ShotMarker({ src, onChange }: { src: string; onChange: (jpeg: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const draft = useRef<Box | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    let alive = true;
    setBoxes([]);
    void loadImage(`data:image/jpeg;base64,${src}`)
      .then((i) => alive && setImg(i))
      .catch(() => alive && setImg(null));
    return () => {
      alive = false;
    };
  }, [src]);

  const size = img ? (() => {
    const k = Math.min(1, SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    return { w: Math.max(1, Math.round(img.naturalWidth * k)), h: Math.max(1, Math.round(img.naturalHeight * k)) };
  })() : null;

  const redraw = (list: Box[]) => {
    const c = canvas.current;
    if (!c || !img || !size) return;
    paint(c.getContext('2d')!, img, list, size.w, size.h);
  };

  useEffect(() => {
    redraw(boxes);
    const c = canvas.current;
    if (!c || !img) return;
    changeRef.current(boxes.length ? toJpeg(c) || src : src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, boxes]);

  if (!img || !size) return null;

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h };
  };

  return (
    <div className="stack gap6 rf-marker">
      <canvas
        ref={canvas}
        width={size.w}
        height={size.h}
        className="rf-shot rf-shot-canvas"
        role="img"
        aria-label="Снимок, который уйдёт с отчётом. Обведи рамкой место, где проблема"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = at(e);
          draft.current = { x: p.x, y: p.y, w: 0, h: 0 };
        }}
        onPointerMove={(e) => {
          if (!draft.current) return;
          const p = at(e);
          draft.current = { ...draft.current, w: p.x - draft.current.x, h: p.y - draft.current.y };
          redraw([...boxes, draft.current]);
        }}
        onPointerUp={() => {
          const d = draft.current;
          draft.current = null;
          // Простое нажатие — небольшая рамка вокруг точки: на телефоне так проще.
          const r = Math.max(24, Math.round(Math.max(size.w, size.h) / 30));
          const box = d && (Math.abs(d.w) > 8 || Math.abs(d.h) > 8) ? d : d ? { x: d.x - r, y: d.y - r, w: r * 2, h: r * 2 } : null;
          if (box) setBoxes([...boxes, box]);
        }}
        onPointerCancel={() => {
          draft.current = null;
          redraw(boxes);
        }}
      />
      <div className="row gap8 wrap">
        <span className="small muted grow">{boxes.length ? `Отмечено мест: ${boxes.length}` : 'Обведи рамкой или нажми, где проблема'}</span>
        {boxes.length > 0 && (
          <>
            <button type="button" className="btn small ghost" onClick={() => setBoxes(boxes.slice(0, -1))}>
              <Icon name="undo" size={14} /> Убрать последнюю
            </button>
            <button type="button" className="btn small ghost" onClick={() => setBoxes([])}>
              Стереть все
            </button>
          </>
        )}
      </div>
    </div>
  );
}
