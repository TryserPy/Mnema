// «Сообщить о проблеме»: снимок (окна или свой) с отметками — рамка, стрелка, маркер, «скрыть». Отметки рисуются прямо
// на картинке, которая уйдёт с отчётом; сама картинка — JPEG не больше SHOT_MAX знаков base64.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

/** Сервер принимает снимок до 1 МБ (≈1,4 млн знаков base64). */
export const SHOT_MAX = 1.4 * 1024 * 1024;
const SIDE = 1600;

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

type Tool = 'box' | 'arrow' | 'pen' | 'blur';
type Shape = { tool: Tool; pts: { x: number; y: number }[] };

const TOOLS: { id: Tool; name: string; icon: string }[] = [
  { id: 'box', name: 'Рамка', icon: '▭' },
  { id: 'arrow', name: 'Стрелка', icon: '↗' },
  { id: 'pen', name: 'Маркер', icon: '✎' },
  { id: 'blur', name: 'Скрыть', icon: '▦' }
];

function rectOf(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/** Нарисовать снимок и отметки. «Скрыть» — крупная мозаика: личное на снимке (почта, имя) не прочитать. */
export function paint(ctx: CanvasRenderingContext2D, img: CanvasImageSource, shapes: Shape[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const line = Math.max(3, Math.round(Math.max(w, h) / 320));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of shapes) {
    const a = s.pts[0];
    const b = s.pts[s.pts.length - 1];
    if (!a || !b) continue;
    if (s.tool === 'blur') {
      const q = rectOf(a, b);
      const r = { x: Math.floor(q.x), y: Math.floor(q.y), w: Math.ceil(q.w), h: Math.ceil(q.h) };
      const cell = Math.max(10, Math.round(Math.max(w, h) / 90));
      for (let y = r.y; y < r.y + r.h; y += cell)
        for (let x = r.x; x < r.x + r.w; x += cell) {
          const px = ctx.getImageData(Math.min(w - 1, Math.round(x + cell / 2)), Math.min(h - 1, Math.round(y + cell / 2)), 1, 1).data;
          ctx.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
          ctx.fillRect(x, y, Math.min(cell, r.x + r.w - x), Math.min(cell, r.y + r.h - y));
        }
      continue;
    }
    ctx.strokeStyle = '#e5383b';
    ctx.lineWidth = s.tool === 'pen' ? line * 2.2 : line;
    if (s.tool === 'box') {
      const r = rectOf(a, b);
      ctx.fillStyle = 'rgba(229, 56, 59, 0.12)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    } else if (s.tool === 'pen') {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#ffd400';
      ctx.beginPath();
      s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const head = line * 5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - head * Math.cos(ang - 0.5), b.y - head * Math.sin(ang - 0.5));
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - head * Math.cos(ang + 0.5), b.y - head * Math.sin(ang + 0.5));
      ctx.stroke();
    }
  }
}

/**
 * Снимок в форме — обычная картинка: страница листается пальцем как всегда (раньше любое касание рисовало рамку
 * и перехватывало прокрутку). Нажатие — полноэкранный редактор: рамка, стрелка, маркер, «скрыть»; там рисует один палец.
 * onChange получает итоговую картинку (с отметками).
 */
export function ShotMarker({ src, onChange }: { src: string; onChange: (jpeg: string) => void }) {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [preview, setPreview] = useState(src);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setShapes([]);
    setPreview(src);
  }, [src]);
  return (
    <div className="stack gap6 rf-marker">
      <button type="button" className="rf-shot-btn" onClick={() => setEditing(true)} aria-label="Открыть снимок и отметить, где проблема">
        <img className="rf-shot" src={`data:image/jpeg;base64,${preview}`} alt="Снимок, который уйдёт с отчётом" />
        <span className="rf-shot-hint">✎ Отметить</span>
      </button>
      <span className="small muted">{shapes.length ? `Отметок: ${shapes.length}. Нажми на снимок, чтобы поправить.` : 'Нажми на снимок, чтобы обвести место, где проблема, или скрыть личное.'}</span>
      {editing && (
        <ShotEditor
          src={src}
          initial={shapes}
          onCancel={() => setEditing(false)}
          onDone={(list, jpeg) => {
            setShapes(list);
            setPreview(jpeg);
            onChange(jpeg);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

/** Полноэкранный редактор снимка. Второй палец отменяет текущий штрих (случайное касание ладонью). */
function ShotEditor({ src, initial, onCancel, onDone }: { src: string; initial: Shape[]; onCancel: () => void; onDone: (shapes: Shape[], jpeg: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [shapes, setShapes] = useState<Shape[]>(initial);
  const [tool, setTool] = useState<Tool>('box');
  const draft = useRef<Shape | null>(null);
  const pointers = useRef(new Set<number>());

  useEffect(() => {
    let alive = true;
    void loadImage(`data:image/jpeg;base64,${src}`).then((i) => alive && setImg(i), () => undefined);
    return () => {
      alive = false;
    };
  }, [src]);
  const size = img ? (() => {
    const k = Math.min(1, SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    return { w: Math.max(1, Math.round(img.naturalWidth * k)), h: Math.max(1, Math.round(img.naturalHeight * k)) };
  })() : null;
  const redraw = (list: Shape[]) => {
    const c = canvas.current;
    if (c && img && size) paint(c.getContext('2d', { willReadFrequently: true })!, img, list, size.w, size.h);
  };
  useEffect(() => redraw(shapes)); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Esc закрывает только редактор снимка: перехватываем раньше окна «Сообщить о проблеме» (оно смотрит defaultPrevented),
    // иначе вместе с редактором закрывалась и форма с уже написанным текстом.
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onCancel]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size!.w, y: ((e.clientY - r.top) / r.height) * size!.h };
  };

  return createPortal(
    <div className="shot-editor" role="dialog" aria-modal="true" aria-label="Отметить на снимке">
      <div className="shot-tools" role="toolbar" aria-label="Инструменты">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className={'shot-tool' + (tool === t.id ? ' on' : '')} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
            <span aria-hidden="true">{t.icon}</span>
            {t.name}
          </button>
        ))}
        <button type="button" className="shot-tool" disabled={!shapes.length} onClick={() => setShapes(shapes.slice(0, -1))} aria-label="Отменить последнюю отметку">
          <Icon name="undo" size={16} />
        </button>
      </div>
      <div className="shot-stage">
        {size && (
          <canvas
            ref={canvas}
            width={size.w}
            height={size.h}
            className="shot-canvas"
            onPointerDown={(e) => {
              pointers.current.add(e.pointerId);
              if (pointers.current.size > 1) {
                draft.current = null;
                redraw(shapes);
                return;
              }
              e.currentTarget.setPointerCapture(e.pointerId);
              draft.current = { tool, pts: [at(e)] };
            }}
            onPointerMove={(e) => {
              const d = draft.current;
              if (!d) return;
              const p = at(e);
              d.pts = d.tool === 'pen' ? [...d.pts, p] : [d.pts[0], p];
              redraw([...shapes, d]);
            }}
            onPointerUp={(e) => {
              pointers.current.delete(e.pointerId);
              const d = draft.current;
              draft.current = null;
              if (!d || !size) return;
              const a = d.pts[0];
              const b = d.pts[d.pts.length - 1];
              const tiny = Math.hypot(b.x - a.x, b.y - a.y) < 8;
              // Простое нажатие рамкой — небольшая рамка вокруг точки: пальцем так проще.
              const r = Math.max(24, Math.round(Math.max(size.w, size.h) / 30));
              if (tiny && d.tool === 'box') setShapes([...shapes, { tool: 'box', pts: [{ x: a.x - r, y: a.y - r }, { x: a.x + r, y: a.y + r }] }]);
              else if (!tiny) setShapes([...shapes, d]);
              else redraw(shapes);
            }}
            onPointerCancel={(e) => {
              pointers.current.delete(e.pointerId);
              draft.current = null;
              redraw(shapes);
            }}
          />
        )}
      </div>
      <div className="shot-bar">
        <button type="button" className="btn" onClick={onCancel}>
          Отмена
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const c = canvas.current;
            onDone(shapes, c && shapes.length ? toJpeg(c) || src : src);
          }}
        >
          Готово
        </button>
      </div>
    </div>,
    document.body
  );
}
