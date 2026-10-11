// Свои значки-картинки для папок и предметов (поле iconImg).
// Хранится только маленькая растровая картинка data:image/(webp|png|jpeg|gif);base64 до ~40 КБ, которую приложение само перекодировало
// через canvas из выбранного файла. Исходник (особенно SVG — в нём бывают скрипты) нигде не сохраняется.
// Из чужих данных (файл темы, копия, облако, Wi-Fi) принимается только такая картинка; остальное выбрасывается.

/** Сторона значка в пикселях (с запасом для плотных экранов: на экране значок 22–42 px). */
export const ICON_SIDE = 128;
/** Самый большой допустимый размер картинки (в байтах после декодирования). */
export const ICON_MAX_BYTES = 40 * 1024;

const RE = /^data:image\/(png|webp|jpeg|gif);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Первые байты файла по типу: подложный «png», внутри которого на самом деле SVG или что-то ещё, не проходит. */
function magicOk(kind: string, b64: string): boolean {
  let head: string;
  try {
    head = atob(b64.slice(0, 24));
  } catch {
    return false;
  }
  const at = (s: string, off = 0) => head.slice(off, off + s.length) === s;
  if (kind === 'png') return at('\x89PNG\r\n\x1a\n');
  if (kind === 'jpeg') return at('\xff\xd8\xff');
  if (kind === 'gif') return at('GIF87a') || at('GIF89a');
  return at('RIFF') && at('WEBP', 8);
}

/** Размер в байтах после декодирования base64. */
export function dataUriBytes(uri: string): number {
  const i = uri.indexOf(',');
  const b64 = i < 0 ? '' : uri.slice(i + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** Годится ли строка как значок: настоящая маленькая картинка data:image/(png|webp|jpeg|gif);base64. */
export function validIconImg(x: unknown): x is string {
  if (typeof x !== 'string' || x.length > Math.ceil((ICON_MAX_BYTES * 4) / 3) + 40) return false;
  const m = RE.exec(x);
  if (!m) return false;
  if (m[2].length % 4 !== 0) return false;
  if (dataUriBytes(x) > ICON_MAX_BYTES) return false;
  return magicOk(m[1], m[2]);
}

/** Значок из чужих данных: годная картинка или undefined. */
export function cleanIconImg(x: unknown): string | undefined {
  return validIconImg(x) ? x : undefined;
}

/** У предметов и папок (и в корзине) оставить только годные значки-картинки. Если менять нечего, возвращает тот же массив. */
export function cleanIconImgs<T extends { iconImg?: string }>(items: T[]): T[] {
  let changed = false;
  const out = items.map((it) => {
    if (!it || typeof it !== 'object' || it.iconImg === undefined || validIconImg(it.iconImg)) return it;
    changed = true;
    const { iconImg: _drop, ...rest } = it;
    void _drop;
    return rest as T;
  });
  return changed ? out : items;
}

// ---------- Кадрирование ----------

export interface CropView {
  /** Приближение: 1 — виден самый большой квадрат, 4 — четверть стороны. */
  zoom: number;
  /** Центр квадрата в долях картинки (0–1). */
  cx: number;
  cy: number;
}

/** Квадрат исходной картинки, который попадёт в значок. Всегда внутри картинки. */
export function cropRect(w: number, h: number, v: CropView): { sx: number; sy: number; side: number } {
  const zoom = Number.isFinite(v.zoom) ? Math.min(8, Math.max(1, v.zoom)) : 1;
  const side = Math.max(1, Math.min(w, h) / zoom);
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const cx = Number.isFinite(v.cx) ? v.cx : 0.5;
  const cy = Number.isFinite(v.cy) ? v.cy : 0.5;
  return { sx: clamp(cx * w - side / 2, 0, Math.max(0, w - side)), sy: clamp(cy * h - side / 2, 0, Math.max(0, h - side)), side };
}

/** Нарисовать кадр в квадратный canvas (и для предпросмотра, и для итога). */
export function drawCrop(canvas: HTMLCanvasElement, img: CanvasImageSource, w: number, h: number, v: CropView, side: number) {
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const r = cropRect(w, h, v);
  ctx.clearRect(0, 0, side, side);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, r.sx, r.sy, r.side, r.side, 0, 0, side, side);
}

/**
 * Подобрать сжатие так, чтобы картинка уложилась в лимит: сначала WebP с убывающим качеством, потом PNG,
 * при необходимости — меньшей стороной. `render` — любой способ получить data URI (в приложении — canvas.toDataURL).
 * Возвращает null, если уложиться не удалось.
 */
export function fitIcon(render: (side: number, mime: 'image/webp' | 'image/png', quality: number) => string): string | null {
  const ok = (u: string): boolean => validIconImg(u);
  for (const side of [ICON_SIDE, 96, 64]) {
    for (const q of [0.92, 0.8, 0.66, 0.5, 0.35]) {
      const uri = render(side, 'image/webp', q);
      if (ok(uri)) return uri;
      if (!uri.startsWith('data:image/webp')) break; // браузер не умеет WebP — отдал PNG: качество не влияет, пробуем PNG ниже
    }
    const png = render(side, 'image/png', 1);
    if (ok(png)) return png;
  }
  return null;
}

/** Загрузить выбранный файл-картинку для кадрирования. SVG и любой другой исходник только рисуется на canvas и не сохраняется. */
export async function loadIconSource(file: Blob): Promise<{ img: HTMLImageElement; w: number; h: number; release: () => void }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  try {
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok();
      img.onerror = () => bad(new Error('Не удалось открыть картинку'));
      img.src = url;
    });
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  // У SVG без размеров naturalWidth бывает 0 — тогда берём квадрат по умолчанию.
  const w = img.naturalWidth || 512;
  const h = img.naturalHeight || 512;
  return { img, w, h, release: () => URL.revokeObjectURL(url) };
}

/** Итоговый значок из кадра. */
export function renderIcon(img: CanvasImageSource, w: number, h: number, v: CropView): string | null {
  const canvas = document.createElement('canvas');
  return fitIcon((side, mime, q) => {
    drawCrop(canvas, img, w, h, v, side);
    return canvas.toDataURL(mime, q);
  });
}

/** Какие файлы предлагаем выбрать. */
export const ICON_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg';
/** Исходник больше этого размера не открываем (он нужен только для кадрирования). */
export const ICON_SOURCE_MAX = 12 * 1024 * 1024;
