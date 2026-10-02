// Холст для рисунков в конспекте. Рисунок хранится как SVG (data: URI) прямо в Markdown,
// а точки линий — в атрибутах data-points, чтобы рисунок можно было открыть и дорисовать.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { Icon } from './ui';

export interface Stroke {
  tool: 'pen' | 'marker';
  color: string;
  width: number;
  points: [number, number][];
}

export type DrawingBg = 'theme' | 'white' | 'paper' | 'grid' | 'lines' | 'dots' | 'dark';

export interface DrawingData {
  width: number;
  height: number;
  strokes: Stroke[];
  bg?: DrawingBg; // фон; «theme» — прозрачный, сливается с конспектом (в тёмной теме рисунок инвертируется)
  display?: number; // ширина в конспекте, % от ширины холста (30–100)
}

export const DRAWING_ALT = 'Рисунок';
const COLORS = ['#1E2230', '#FFFFFF', '#C2413B', '#E0572E', '#D69A00', '#2F8F5B', '#0E8FA3', '#2A5BB8', '#6B3FC4', '#C2417A'];
const MARKERS = ['#F6D34A', '#8BD68B', '#7CC4F2', '#F29CB6', '#F2A65A'];
const SIZES = [2, 4, 7, 12];
export const BACKGROUNDS: { id: DrawingBg; name: string }[] = [
  { id: 'theme', name: 'Как у конспекта' },
  { id: 'white', name: 'Белый' },
  { id: 'paper', name: 'Бумага' },
  { id: 'grid', name: 'Клетка' },
  { id: 'lines', name: 'Линейка' },
  { id: 'dots', name: 'Точки' },
  { id: 'dark', name: 'Тёмный' }
];

/** Фон холста как кусок SVG. В файле фон «как у конспекта» — прозрачный. */
export function bgMarkup(bg: DrawingBg, forFile: boolean): string {
  const fill = (c: string) => `<rect width="100%" height="100%" fill="${c}"/>`;
  const pat = (inner: string, size: number) => `<defs><pattern id="mbg" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${inner}</pattern></defs><rect width="100%" height="100%" fill="url(#mbg)"/>`;
  switch (bg) {
    case 'theme':
      return forFile ? '' : fill('var(--surface)');
    case 'paper':
      return fill('#FBF6E9');
    case 'dark':
      return fill('#1F2330');
    case 'grid':
      return fill('#FFFFFF') + pat('<path d="M30 0H0V30" fill="none" stroke="#D5DEEE" stroke-width="1"/>', 30);
    case 'lines':
      return fill('#FFFFFF') + pat('<path d="M0 33.5H34" fill="none" stroke="#C9D6EA" stroke-width="1"/>', 34) + '<path d="M56 0V100000" stroke="#EAA3A3" stroke-width="1.5"/>';
    case 'dots':
      return fill('#FFFFFF') + pat('<circle cx="15" cy="15" r="1.4" fill="#B9C3D6"/>', 30);
    default:
      return fill('#FFFFFF');
  }
}

function pathD(points: [number, number][]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M${x} ${y} L${x + 0.1} ${y + 0.1}`;
  }
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q${x} ${y} ${((x + nx) / 2).toFixed(1)} ${((y + ny) / 2).toFixed(1)}`;
  }
  const last = points[points.length - 1];
  return d + ` L${last[0]} ${last[1]}`;
}

/** Тёмные «чернила»: в тёмной теме на прозрачном фоне их показываем светлыми. */
export function isInk(color: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.3;
}

function strokeAttrs(s: Stroke) {
  return {
    stroke: s.color,
    strokeWidth: s.tool === 'marker' ? s.width * 3 : s.width,
    strokeOpacity: s.tool === 'marker' ? 0.45 : 1
  };
}

export function drawingToSvg(d: DrawingData): string {
  const paths = d.strokes
    .map((s) => {
      const a = strokeAttrs(s);
      const pts = s.points.map((p) => `${p[0]},${p[1]}`).join(' ');
      return `<path d="${pathD(s.points)}" fill="none" stroke="${s.color}" stroke-width="${a.strokeWidth}" stroke-opacity="${a.strokeOpacity}" stroke-linecap="round" stroke-linejoin="round" data-tool="${s.tool}" data-width="${s.width}"${isInk(s.color) ? ' data-dark="1"' : ''} data-points="${pts}"/>`;
    })
    .join('');
  const bg = d.bg ?? 'white';
  const disp = Math.max(30, Math.min(100, d.display ?? 62));
  const w = Math.round((d.width * disp) / 100);
  const h = Math.round((d.height * disp) / 100);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="${w}" height="${h}" data-mnema="drawing" data-bg="${bg}" data-display="${disp}">${bgMarkup(bg, true)}${paths}</svg>`;
}

export function svgToDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return 'data:image/svg+xml;base64,' + btoa(bin);
}

/** Прочитать рисунок Мнемы из data: URI. Возвращает null, если это обычная картинка. */
export function parseDrawing(src: string): DrawingData | null {
  if (!src.startsWith('data:image/svg+xml;base64,')) return null;
  try {
    const bin = atob(src.slice('data:image/svg+xml;base64,'.length));
    const svgText = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.getAttribute('data-mnema') !== 'drawing') return null;
    const [, , w, h] = (svg.getAttribute('viewBox') ?? '0 0 900 500').split(/\s+/).map(Number);
    const strokes: Stroke[] = [...svg.querySelectorAll('path[data-points]')].map((p) => ({
      tool: (p.getAttribute('data-tool') as Stroke['tool']) ?? 'pen',
      color: p.getAttribute('stroke') ?? '#1E2230',
      width: Number(p.getAttribute('data-width') ?? 3),
      points: (p.getAttribute('data-points') ?? '')
        .split(' ')
        .filter(Boolean)
        .map((pt) => pt.split(',').map(Number) as [number, number])
    }));
    const bg = (svg.getAttribute('data-bg') as DrawingBg | null) ?? 'white';
    const display = Number(svg.getAttribute('data-display')) || 62;
    return { width: w || 900, height: h || 500, strokes, bg, display };
  } catch {
    return null;
  }
}

/** Рисунок «как у конспекта» прямо в страницу (а не картинкой) — чтобы тёмные линии светлели в тёмной теме. */
export function inlineDrawing(src: string): HTMLElement | null {
  try {
    const bin = atob(src.slice('data:image/svg+xml;base64,'.length));
    const svgText = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    // Рисунок Мнемы состоит только из этих элементов. <style> и атрибут style из чужого рисунка пропускать нельзя: глобальный CSS прячет кнопки и подделывает окна.
    const clean = DOMPurify.sanitize(svgText, {
      ALLOWED_TAGS: ['svg', 'g', 'path', 'rect', 'circle', 'defs', 'pattern'],
      FORBID_ATTR: ['style', 'href', 'xlink:href'],
      ADD_ATTR: ['data-dark', 'data-mnema', 'data-bg']
    });
    if (!clean.includes('<svg')) return null;
    const span = document.createElement('span');
    span.className = 'drawing-inline';
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', DRAWING_ALT);
    span.innerHTML = clean;
    span.querySelectorAll('path').forEach((p) => p.removeAttribute('data-points'));
    return span;
  } catch {
    return null;
  }
}

/** Фон рисунка по картинке — для подсветки в конспекте (рисунок «как у конспекта» подстраивается под тему). */
export function drawingBgOf(src: string): DrawingBg | null {
  if (!src.startsWith('data:image/svg+xml;base64,')) return null;
  try {
    const head = atob(src.slice(26, 26 + 800));
    if (!head.includes('data-mnema="drawing"')) return null;
    return (/data-bg="(\w+)"/.exec(head)?.[1] as DrawingBg) ?? 'white';
  } catch {
    return null;
  }
}

/** Текст конспекта до и после рисунка — для предпросмотра «Как будет в конспекте». */
export interface DrawingContext {
  before: string;
  after: string;
}

export function DrawingEditor({ initial, onSave, onCancel, context }: { initial?: DrawingData | null; onSave: (d: DrawingData) => void; onCancel: () => void; context?: DrawingContext }) {
  const [data, setData] = useState<DrawingData>(() => ({ bg: 'theme', display: 70, ...(initial ?? { width: 900, height: 500, strokes: [] }) }));
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<'pen' | 'marker' | 'eraser'>('pen');
  const [color, setColor] = useState(data.bg === 'dark' ? '#FFFFFF' : COLORS[0]);
  const [marker, setMarker] = useState(MARKERS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [full, setFull] = useState(false);
  const [preview, setPreview] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const bg = data.bg ?? 'theme';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoOne();
        else undo();
      }
      if (e.key === 'Escape' && full) setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function toPoint(e: RPointerEvent): [number, number] {
    return svgPoint(svgRef.current!, e.clientX, e.clientY);
  }

  function erase(p: [number, number]) {
    const R = 12;
    const keep = data.strokes.filter((s) => !s.points.some(([x, y]) => Math.abs(x - p[0]) < R && Math.abs(y - p[1]) < R));
    if (keep.length !== data.strokes.length) setData({ ...data, strokes: keep });
  }

  function down(e: RPointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toPoint(e);
    if (tool === 'eraser') return erase(p);
    setCurrent({ tool, color: tool === 'marker' ? marker : color, width: size, points: [p] });
  }

  function move(e: RPointerEvent) {
    if (e.buttons === 0) return;
    const p = toPoint(e);
    if (tool === 'eraser') return erase(p);
    if (!current) return;
    const last = current.points[current.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return;
    setCurrent({ ...current, points: [...current.points, p] });
  }

  function up() {
    if (current) {
      setData({ ...data, strokes: [...data.strokes, current] });
      setRedo([]);
      setCurrent(null);
    }
  }

  function undo() {
    if (!data.strokes.length) return;
    setRedo([...redo, data.strokes[data.strokes.length - 1]]);
    setData({ ...data, strokes: data.strokes.slice(0, -1) });
  }

  function redoOne() {
    if (!redo.length) return;
    setData({ ...data, strokes: [...data.strokes, redo[redo.length - 1]] });
    setRedo(redo.slice(0, -1));
  }

  const setBg = (b: DrawingBg) => {
    setData({ ...data, bg: b });
    // Тёмный фон — сразу белая ручка, светлый после тёмного — снова тёмная.
    if (b === 'dark' && color === COLORS[0]) setColor('#FFFFFF');
    if (b !== 'dark' && color === '#FFFFFF') setColor(COLORS[0]);
  };

  const all = current ? [...data.strokes, current] : data.strokes;
  const themed = bg === 'theme';
  const palette = tool === 'marker' ? MARKERS : COLORS;
  const cur = tool === 'marker' ? marker : color;
  const pick = (c: string) => (tool === 'marker' ? setMarker(c) : setColor(c));
  const previewSrc = preview ? svgToDataUri(drawingToSvg(data)) : '';

  const body = (
    <div className={'drawing-editor' + (full ? ' full' : '')}>
      <div className="draw-tools">
        <div className="seg compact" role="radiogroup" aria-label="Инструмент">
          {(
            [
              ['pen', 'Ручка'],
              ['marker', 'Маркер'],
              ['eraser', 'Ластик']
            ] as const
          ).map(([t, l]) => (
            <button key={t} type="button" role="radio" aria-checked={tool === t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>
              {l}
            </button>
          ))}
        </div>
        {tool !== 'eraser' && (
          <div className="swatches draw-colors" aria-label="Цвет">
            {palette.map((c) => (
              <button key={c} type="button" aria-label={`Цвет ${c}`} className={'swatch small' + (c.toLowerCase() === cur.toLowerCase() ? ' on' : '')} style={{ background: c, ['--sw' as string]: c === '#FFFFFF' ? '#9aa3b5' : c }} onClick={() => pick(c)} />
            ))}
            <label className={'swatch small custom-sw' + (!palette.some((c) => c.toLowerCase() === cur.toLowerCase()) ? ' on' : '')} title="Свой цвет" style={!palette.some((c) => c.toLowerCase() === cur.toLowerCase()) ? { background: cur, ['--sw' as string]: cur } : undefined}>
              <input type="color" value={cur} onChange={(e) => pick(e.target.value)} aria-label="Свой цвет" />
              {palette.some((c) => c.toLowerCase() === cur.toLowerCase()) && <span aria-hidden>+</span>}
            </label>
          </div>
        )}
        <div className="row gap4" aria-label="Толщина">
          {SIZES.map((s) => (
            <button key={s} type="button" aria-label={`Толщина ${s}`} className={'size-btn' + (s === size ? ' on' : '')} onClick={() => setSize(s)}>
              <span style={{ width: Math.min(18, s + 3), height: Math.min(18, s + 3), background: tool === 'marker' ? marker : undefined }} />
            </button>
          ))}
        </div>
        <span className="grow" />
        <button type="button" className="icon-btn" aria-label="Отменить" title="Отменить (Ctrl+Z)" onClick={undo} disabled={!data.strokes.length}>
          <Icon name="undo" />
        </button>
        <button type="button" className="icon-btn flip" aria-label="Вернуть" title="Вернуть (Ctrl+Shift+Z)" onClick={redoOne} disabled={!redo.length}>
          <Icon name="undo" />
        </button>
        <button type="button" className={'icon-btn' + (full ? ' on' : '')} aria-pressed={full} aria-label={full ? 'Свернуть холст' : 'Холст на весь экран'} title={full ? 'Свернуть (Esc)' : 'На весь экран'} onClick={() => setFull(!full)}>
          <Icon name={full ? 'shrink' : 'expand'} />
        </button>
      </div>
      <div className="draw-opts">
        <div className="draw-bgs" role="radiogroup" aria-label="Фон">
          <span className="small muted">Фон</span>
          {BACKGROUNDS.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={bg === b.id} className={'bg-chip' + (bg === b.id ? ' on' : '')} onClick={() => setBg(b.id)} title={b.id === 'theme' ? 'Без фона — рисунок сливается с конспектом в любой теме' : b.name}>
              <span className={'bg-sw bg-' + b.id} />
              {b.name}
            </button>
          ))}
        </div>
      </div>
      <div className="draw-area">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${data.width} ${data.height}`}
          className={'draw-svg ' + tool + (themed ? ' themed' : '')}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          role="img"
          aria-label="Холст для рисования"
        >
          <g dangerouslySetInnerHTML={{ __html: bgMarkup(bg, false) }} />
          {all.map((s, i) => {
            const a = strokeAttrs(s);
            return <path key={i} d={pathD(s.points)} fill="none" stroke={a.stroke} strokeWidth={a.strokeWidth} strokeOpacity={a.strokeOpacity} strokeLinecap="round" strokeLinejoin="round" data-dark={isInk(s.color) ? '1' : undefined} />;
          })}
        </svg>
      </div>
      <div className="draw-size">
        <label className="row gap8 grow">
          <span className="small">Размер в конспекте</span>
          <input type="range" min={30} max={100} step={5} value={data.display ?? 70} onChange={(e) => setData({ ...data, display: Number(e.target.value) })} aria-label="Размер в конспекте" />
          <span className="small muted draw-pct">{data.display ?? 70}%</span>
        </label>
        <button type="button" className="btn ghost small" onClick={() => setData({ ...data, height: data.height + 250 })}>
          Холст выше
        </button>
        {data.height > 300 && (
          <button type="button" className="btn ghost small" onClick={() => setData({ ...data, height: Math.max(250, data.height - 250) })}>
            Ниже
          </button>
        )}
        <button type="button" className={'btn small' + (preview ? ' on-tool' : '')} aria-pressed={preview} onClick={() => setPreview(!preview)}>
          <Icon name="book" size={16} /> Как будет в конспекте
        </button>
      </div>
      {preview && (
        <div className="draw-preview" aria-label="Предпросмотр">
          <div className="note-page dp-page">
            {context?.before.trim() ? (
              context.before.trim().split('\n').filter(Boolean).map((p, i) => <p key={'b' + i} className="dp-text">{p}</p>)
            ) : (
              <>
                <div className="dp-line" style={{ width: '46%' }} />
                <div className="dp-line" />
              </>
            )}
            {bg === 'theme' ? <span className="dp-img-inline" ref={(el) => { if (el) { el.innerHTML = ''; const n = inlineDrawing(previewSrc); if (n) el.appendChild(n); } }} /> : <img src={previewSrc} alt="Рисунок" className="dp-img" />}
            {context?.after.trim() ? (
              context.after.trim().split('\n').filter(Boolean).map((p, i) => <p key={'a' + i} className="dp-text">{p}</p>)
            ) : (
              <>
                <div className="dp-line" style={{ width: '82%' }} />
                <div className="dp-line" style={{ width: '64%' }} />
              </>
            )}
          </div>
        </div>
      )}
      <div className="row between gap8 wrap">
        <button type="button" className="btn ghost small" disabled={!data.strokes.length} onClick={() => setData({ ...data, strokes: [] })}>
          Очистить
        </button>
        <div className="row gap8">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="btn primary" disabled={!data.strokes.length} onClick={() => onSave(data)}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
  return full ? createPortal(<div className="draw-full">{body}</div>, document.body) : body;
}

// ---------- Маленький холст «от руки» (ответ, формула) ----------

/** PNG (base64 без префикса) с рисунком, обрезанным по линиям, — для распознавания. */
export async function strokesToPng(strokes: Stroke[], maxSide = 900): Promise<string> {
  const pts = strokes.flatMap((s) => s.points);
  if (!pts.length) throw new Error('Пустой рисунок');
  const pad = 24;
  const minX = Math.min(...pts.map((p) => p[0])) - pad;
  const minY = Math.min(...pts.map((p) => p[1])) - pad;
  const w = Math.max(...pts.map((p) => p[0])) + pad - minX;
  const h = Math.max(...pts.map((p) => p[1])) + pad - minY;
  const shifted = strokes.map((s) => ({ ...s, color: '#000000', points: s.points.map(([x, y]) => [x - minX, y - minY] as [number, number]) }));
  const svg = drawingToSvg({ width: Math.ceil(w), height: Math.ceil(h), strokes: shifted });
  const img = new Image();
  img.src = svgToDataUri(svg);
  await img.decode();
  const scale = Math.min(1.5, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png').split(',')[1];
}

/** Точка экрана → координаты внутри SVG (учитывает рамку, поля, масштаб и анимации окна). */
export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): [number, number] {
  const m = svg.getScreenCTM();
  if (m) {
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
  }
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return [Math.round(((clientX - r.left) / r.width) * vb.width * 10) / 10, Math.round(((clientY - r.top) / r.height) * vb.height * 10) / 10];
}

export function SketchPad({ strokes, onChange, height = 240, label = 'Холст для письма' }: { strokes: Stroke[]; onChange: (s: Stroke[]) => void; height?: number; label?: string }) {
  const [erase, setErase] = useState(false);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const H = Math.round((height / 600) * 900);
  // Ширина холста в тех же единицах, что и высота: пропорции совпадают с окном, линия идёт ровно за курсором.
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setW(Math.max(300, Math.round((H * r.width) / r.height)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [H]);

  function pt(e: RPointerEvent): [number, number] {
    return svgPoint(ref.current!, e.clientX, e.clientY);
  }
  function eraseAt(p: [number, number]) {
    const keep = strokes.filter((s) => !s.points.some(([x, y]) => Math.abs(x - p[0]) < 14 && Math.abs(y - p[1]) < 14));
    if (keep.length !== strokes.length) onChange(keep);
  }
  function down(e: RPointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pt(e);
    if (erase) return eraseAt(p);
    setCurrent({ tool: 'pen', color: '#1E2230', width: 4, points: [p] });
  }
  function move(e: RPointerEvent) {
    if (e.buttons === 0) return;
    const p = pt(e);
    if (erase) return eraseAt(p);
    if (!current) return;
    const last = current.points[current.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return;
    setCurrent({ ...current, points: [...current.points, p] });
  }
  function up() {
    if (current) onChange([...strokes, current]);
    setCurrent(null);
  }
  const all = current ? [...strokes, current] : strokes;
  return (
    <div className="sketch">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ height }} className={'sketch-svg' + (erase ? ' eraser' : '')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} role="img" aria-label={label}>
        <rect width="100%" height="100%" fill="#ffffff" />
        {all.map((s, i) => (
          <path key={i} d={pathD(s.points)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <div className="sketch-tools">
        <button type="button" className={'btn small' + (erase ? '' : ' on-tool')} onClick={() => setErase(false)}>
          Ручка
        </button>
        <button type="button" className={'btn small' + (erase ? ' on-tool' : '')} onClick={() => setErase(true)}>
          Ластик
        </button>
        <button type="button" className="btn small ghost" disabled={!strokes.length} onClick={() => onChange(strokes.slice(0, -1))}>
          Отменить
        </button>
        <button type="button" className="btn small ghost" disabled={!strokes.length} onClick={() => onChange([])}>
          Очистить
        </button>
      </div>
    </div>
  );
}
