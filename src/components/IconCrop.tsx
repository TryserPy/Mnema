// Окно «Своя картинка»: выбрать файл, обрезать до квадрата (перетащить и приблизить) и получить маленький значок.
// Исходный файл не сохраняется — из него только рисуется квадрат на canvas, а результат перекодируется в WebP/PNG 128×128.
import { useEffect, useRef, useState } from 'react';
import { cropRect, drawCrop, ICON_ACCEPT, ICON_SIDE, ICON_SOURCE_MAX, loadIconSource, renderIcon, type CropView } from '../iconImage';
import { Modal } from './ui';

const STAGE = 240;

export function IconCropDialog({ onClose, onDone, color }: { onClose: () => void; onDone: (uri: string) => void; color?: string }) {
  const [src, setSrc] = useState<{ img: HTMLImageElement; w: number; h: number; release: () => void } | null>(null);
  const [view, setView] = useState<CropView>({ zoom: 1, cx: 0.5, cy: 0.5 });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLCanvasElement>(null);
  const big = useRef<HTMLCanvasElement>(null);
  const small = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; v: CropView } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => src?.release(), [src]);

  useEffect(() => {
    if (!src) return;
    if (stage.current) drawCrop(stage.current, src.img, src.w, src.h, view, STAGE);
    if (big.current) drawCrop(big.current, src.img, src.w, src.h, view, 42);
    if (small.current) drawCrop(small.current, src.img, src.w, src.h, view, 22);
  }, [src, view]);

  async function pick(file?: File) {
    if (!file) return;
    setErr('');
    if (file.size > ICON_SOURCE_MAX) return setErr('Файл слишком большой: возьми картинку до 12 МБ.');
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|svg)$/i.test(file.name)) return setErr('Это не картинка. Подойдут PNG, JPG, WebP, GIF и SVG.');
    try {
      const s = await loadIconSource(file);
      setSrc(s);
      setView({ zoom: 1, cx: 0.5, cy: 0.5 });
    } catch {
      setErr('Не получилось открыть эту картинку. Попробуй другой файл.');
    }
  }

  const onDown = (e: React.PointerEvent) => {
    if (!src) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, v: view };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !src) return;
    const r = cropRect(src.w, src.h, d.v);
    const k = r.side / STAGE; // пикселей картинки в одном пикселе окна
    const cx = (r.sx + r.side / 2 - (e.clientX - d.x) * k) / src.w;
    const cy = (r.sy + r.side / 2 - (e.clientY - d.y) * k) / src.h;
    setView({ zoom: d.v.zoom, cx: Math.min(1, Math.max(0, cx)), cy: Math.min(1, Math.max(0, cy)) });
  };
  const onUp = () => (drag.current = null);

  function save() {
    if (!src) return;
    setBusy(true);
    try {
      const uri = renderIcon(src.img, src.w, src.h, view);
      if (!uri) setErr('Не удалось сделать из этой картинки достаточно лёгкий значок. Возьми попроще.');
      else onDone(uri);
    } catch {
      setErr('Не удалось обработать картинку.');
    }
    setBusy(false);
  }

  return (
    <Modal title="Своя картинка для значка" onClose={onClose} width={400} sticky>
      <div className="icon-crop">
        <input ref={fileRef} type="file" accept={ICON_ACCEPT} hidden onChange={(e) => void pick(e.target.files?.[0])} />
        {!src ? (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              Выбери картинку (PNG, JPG, WebP, GIF или SVG) — потом останется обрезать её до квадрата. В приложении хранится только маленький значок {ICON_SIDE}×{ICON_SIDE}, сам файл не сохраняется.
            </p>
            <button type="button" className="btn primary" onClick={() => fileRef.current?.click()}>
              Выбрать файл…
            </button>
          </>
        ) : (
          <>
            <div className="icon-crop-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={(e) => setView((v) => ({ ...v, zoom: Math.min(4, Math.max(1, v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) }))} aria-label="Перетащи картинку, чтобы выбрать, что войдёт в значок">
              <canvas ref={stage} />
            </div>
            <label className="row gap8 small muted">
              Размер
              <input className="icon-crop-range" type="range" min={1} max={4} step={0.01} value={view.zoom} onChange={(e) => setView({ ...view, zoom: Number(e.target.value) })} aria-label="Приблизить" />
            </label>
            <div className="icon-crop-prev small muted">
              Так будет выглядеть:
              <span className="subj-ico has-img big" style={{ borderColor: color ?? 'var(--accent)' }}>
                <canvas ref={big} style={{ width: '100%', height: '100%' }} />
              </span>
              <span className="subj-ico has-img small" style={{ borderColor: color ?? 'var(--accent)' }}>
                <canvas ref={small} style={{ width: '100%', height: '100%' }} />
              </span>
            </div>
            <button type="button" className="link-btn small" onClick={() => fileRef.current?.click()}>
              другой файл
            </button>
          </>
        )}
        {err && (
          <p className="small" role="alert" style={{ margin: 0, color: 'var(--danger, #c0392b)' }}>
            {err}
          </p>
        )}
        <div className="row end gap8" style={{ width: '100%' }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn primary" disabled={!src || busy} onClick={save}>
            Готово
          </button>
        </div>
      </div>
    </Modal>
  );
}
