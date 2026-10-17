// «Закрыть часть картинки» (1.32, N5): показ при повторении и редактор рамок.
// Редактор: пальцем или мышью тянешь — рамка; нажал на рамку — выбрал (двигать, тянуть за угол, подписать, удалить);
// два пальца — масштаб и сдвиг (inkGestures.ts), ладонь не рисует. Рамки хранятся долями ширины и высоты картинки.
import { useEffect, useRef, useState } from 'react';
import { occlTarget, type OcclMask, type Occlusion } from '../occlusion';
import { useInk } from './inkGestures';
import { CameraCapture } from './CameraCapture';
import { haptic, Icon, motionOn, touchUI } from './ui';

/** Размер картинки по data: URL (для viewBox). */
function useImageSize(src: string | null): { w: number; h: number } | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!src) return setSize(null);
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setSize({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return size;
}

/**
 * Картинка с рамками. ord — какой элемент спрашиваем (его рамки — цветные с «?»), revealed — ответ открыт:
 * спрашиваемые рамки становятся прозрачными с подписью. Без ord — превью: все рамки одного цвета.
 */
export function OcclusionView({ img, occl, ord, revealed = false, small = false }: { img: string; occl: Occlusion; ord?: number; revealed?: boolean; small?: boolean }) {
  const size = useImageSize(img);
  const target = ord === undefined ? null : occlTarget(occl, ord);
  if (!size) return <div className={'occl-view' + (small ? ' small' : '')} aria-busy="true" />;
  const { w, h } = size;
  const desc = ord === undefined ? `Картинка, закрыто частей: ${occl.masks.length}` : revealed ? 'Картинка, ответ открыт' : 'Картинка: что под выделенной рамкой?';
  return (
    <div className={'occl-view' + (small ? ' small' : '')}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={desc}>
        <image href={img} x={0} y={0} width={w} height={h} />
        {occl.masks.map((m, i) => {
          const isTarget = target?.has(i) ?? false;
          if (target && !isTarget && !occl.all) return null;
          const r = { x: m.x * w, y: m.y * h, width: m.w * w, height: m.h * h };
          const cls = target === null ? 'occl-mask' : isTarget ? (revealed ? 'occl-mask target open' : 'occl-mask target') : 'occl-mask other';
          const fs = Math.max(14, Math.min(r.height * 0.7, r.width * 0.5, Math.max(w, h) * 0.05));
          return (
            <g key={i}>
              <rect className={cls} {...r} rx={Math.min(r.width, r.height) * 0.08} />
              {isTarget && !revealed && (
                <text className="occl-q" x={r.x + r.width / 2} y={r.y + r.height / 2} fontSize={fs} textAnchor="middle" dominantBaseline="central">
                  ?
                </text>
              )}
              {isTarget && revealed && m.label && <LabelPill text={m.label} r={r} fs={fs * 0.7} w={w} h={h} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Подпись рамки в ответе — плашкой над рамкой (если места нет — под ней), чтобы читалась поверх любой картинки. */
function LabelPill({ text, r, fs, w, h }: { text: string; r: { x: number; y: number; width: number; height: number }; fs: number; w: number; h: number }) {
  const pad = fs * 0.4;
  const tw = Math.min(w, text.length * fs * 0.56 + pad * 2);
  const th = fs + pad * 1.4;
  const x = Math.min(w - tw, Math.max(0, r.x + r.width / 2 - tw / 2));
  const above = r.y - th - pad * 0.5;
  const y = above >= 0 ? above : Math.min(h - th, r.y + r.height + pad * 0.5);
  return (
    <g className="occl-pill">
      <rect x={x} y={y} width={tw} height={th} rx={th / 2} />
      <text x={x + tw / 2} y={y + th / 2} fontSize={fs} textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
    </g>
  );
}

/** Уменьшить картинку до 1600 px по длинной стороне (JPEG на белом): в данных — не больше ~1 МБ. */
export async function pictureData(file: Blob, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  let q = 0.86;
  let url = c.toDataURL('image/jpeg', q);
  while (url.length > 1_400_000 && q > 0.5) url = c.toDataURL('image/jpeg', (q -= 0.1));
  return url;
}

type Drag = { kind: 'new'; x0: number; y0: number } | { kind: 'move'; i: number; dx: number; dy: number; m: OcclMask } | { kind: 'size'; i: number; m: OcclMask };

const MIN = 0.015;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function OcclusionEditor({ img, occl, onImage, onChange }: { img: string; occl: Occlusion; onImage: (src: string) => void; onChange: (o: Occlusion) => void }) {
  const size = useImageSize(img || null);
  const svg = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Картинка выбрана — холст целиком на экран (на телефоне он ниже полей карточки).
  useEffect(() => {
    if (img && size) canvasRef.current?.scrollIntoView({ block: 'start', behavior: motionOn('windows') ? 'smooth' : 'auto' });
  }, [img, size !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  const fileRef = useRef<HTMLInputElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [draft, setDraftState] = useState<OcclMask | null>(null);
  const draftRef = useRef<OcclMask | null>(null);
  const setDraft = (r: OcclMask | null) => {
    draftRef.current = r;
    setDraftState(r);
  };
  const [camera, setCamera] = useState(false);
  const [err, setErr] = useState('');
  const drag = useRef<Drag | null>(null);
  const occlRef = useRef(occl);
  occlRef.current = occl;
  const W = size?.w ?? 1;
  const H = size?.h ?? 1;
  const handle = Math.max(W, H) * 0.035;

  const ink = useInk({
    svg,
    size: { w: W, h: H },
    onStart: ([px, py]) => {
      const x = px / W;
      const y = py / H;
      const ms = occlRef.current.masks;
      // Угол выбранной рамки — менять размер; рамка — двигать; пусто — новая рамка.
      const s = sel !== null ? ms[sel] : null;
      if (s && Math.abs(px - (s.x + s.w) * W) < handle && Math.abs(py - (s.y + s.h) * H) < handle) {
        drag.current = { kind: 'size', i: sel!, m: s };
        return;
      }
      for (let i = ms.length - 1; i >= 0; i--) {
        const m = ms[i];
        if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) {
          setSel(i);
          drag.current = { kind: 'move', i, dx: x - m.x, dy: y - m.y, m };
          return;
        }
      }
      setSel(null);
      drag.current = { kind: 'new', x0: x, y0: y };
      setDraft({ x, y, w: 0, h: 0 });
    },
    onMove: ([px, py]) => {
      const d = drag.current;
      if (!d) return;
      const x = clamp01(px / W);
      const y = clamp01(py / H);
      if (d.kind === 'new') setDraft({ x: Math.min(d.x0, x), y: Math.min(d.y0, y), w: Math.abs(x - d.x0), h: Math.abs(y - d.y0) });
      else if (d.kind === 'move') {
        const nx = clamp01(Math.min(1 - d.m.w, x - d.dx));
        const ny = clamp01(Math.min(1 - d.m.h, y - d.dy));
        onChange({ ...occlRef.current, masks: occlRef.current.masks.map((m, i) => (i === d.i ? { ...m, x: nx, y: ny } : m)) });
      } else {
        onChange({ ...occlRef.current, masks: occlRef.current.masks.map((m, i) => (i === d.i ? { ...m, w: Math.max(MIN, x - m.x), h: Math.max(MIN, y - m.y) } : m)) });
      }
    },
    onEnd: () => {
      const d = drag.current;
      drag.current = null;
      if (d?.kind === 'new') {
        const r = draftRef.current;
        setDraft(null);
        if (r && r.w >= MIN && r.h >= MIN) {
          const masks = [...occlRef.current.masks, r];
          onChange({ ...occlRef.current, masks });
          setSel(masks.length - 1);
          haptic(8);
        }
      }
    },
    onCancel: () => {
      drag.current = null;
      setDraft(null);
    }
  });

  async function take(f: Blob) {
    setErr('');
    try {
      onImage(await pictureData(f));
      onChange({ ...occlRef.current, masks: [] });
      setSel(null);
      ink.reset();
    } catch {
      setErr('Не получилось открыть картинку. Подойдут JPEG, PNG или скриншот.');
    }
  }

  const patch = (p: Partial<OcclMask>) => sel !== null && onChange({ ...occl, masks: occl.masks.map((m, i) => (i === sel ? { ...m, ...p } : m)) });
  const remove = () => {
    if (sel === null) return;
    onChange({ ...occl, masks: occl.masks.filter((_, i) => i !== sel) });
    setSel(null);
  };

  if (!img)
    return (
      <div
        className="occl-empty"
        onPaste={(e) => {
          const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'));
          if (f) void take(f);
        }}
        tabIndex={0}
      >
        <p className="small muted">Схема, карта, рисунок из учебника: закроешь рамками подписи — и будешь вспоминать, что под каждой. {touchUI() ? '' : 'Можно вставить картинку из буфера (Ctrl+V).'}</p>
        <div className="row gap8 wrap">
          {touchUI() && typeof navigator.mediaDevices?.getUserMedia === 'function' && (
            <button type="button" className="btn primary" onClick={() => setCamera(true)}>
              <Icon name="camera" size={18} /> Сфотографировать
            </button>
          )}
          <button type="button" className={'btn' + (touchUI() ? '' : ' primary')} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Выбрать картинку
          </button>
        </div>
        {err && <div className="hint warn">{err}</div>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && void take(e.target.files[0]), (e.target.value = ''))} />
        {camera && <CameraCapture onShot={(f) => (setCamera(false), void take(f))} onClose={() => setCamera(false)} />}
      </div>
    );

  const m = sel !== null ? occl.masks[sel] : null;
  return (
    <div className="occl-editor stack gap8">
      <p className="small muted">{occl.masks.length ? 'Нажми на рамку, чтобы подписать, сдвинуть или удалить; потяни за угол — размер.' : 'Проведи пальцем или мышью по тому, что нужно закрыть, — появится рамка.'} Два пальца — приблизить.</p>
      <div className="occl-canvas" ref={canvasRef}>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} {...ink.handlers} aria-label="Картинка: рисуй рамки">
          <g transform={ink.transform}>
            <image href={img} x={0} y={0} width={W} height={H} />
            {occl.masks.map((mk, i) => (
              <g key={i}>
                <rect className={'occl-mask edit' + (i === sel ? ' sel' : '')} x={mk.x * W} y={mk.y * H} width={mk.w * W} height={mk.h * H} />
                <text className="occl-num" x={mk.x * W + handle * 0.3} y={mk.y * H + handle * 0.9} fontSize={handle * 0.8}>
                  {i + 1}
                </text>
                {i === sel && <rect className="occl-handle" x={(mk.x + mk.w) * W - handle / 2} y={(mk.y + mk.h) * H - handle / 2} width={handle} height={handle} rx={handle / 4} />}
              </g>
            ))}
            {draft && <rect className="occl-mask draft" x={draft.x * W} y={draft.y * H} width={draft.w * W} height={draft.h * H} />}
          </g>
        </svg>
      </div>
      {m && (
        <div className="occl-sel row gap8 wrap">
          <span className="small strong">Рамка {sel! + 1}</span>
          <input className="input grow" value={m.label ?? ''} maxLength={200} placeholder="Что под ней (для ответа)" aria-label="Что под рамкой" onChange={(e) => patch({ label: e.target.value || undefined })} />
          <button type="button" className="btn small ghost danger" onClick={remove}>
            <Icon name="trash" size={16} /> Удалить
          </button>
        </div>
      )}
      <div className="row gap12 wrap center-row">
        <label className="row gap8 small">
          <input type="checkbox" checked={occl.all} onChange={(e) => onChange({ ...occl, all: e.target.checked })} />
          Пока спрашиваю одну рамку, остальные тоже закрыты
        </label>
        <span className="grow" />
        {ink.view.s > 1 && (
          <button type="button" className="btn small ghost" onClick={ink.reset}>
            Весь рисунок
          </button>
        )}
        <button type="button" className="btn small ghost" onClick={() => fileRef.current?.click()}>
          Другая картинка
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && void take(e.target.files[0]), (e.target.value = ''))} />
    </div>
  );
}
