// Подготовка фото страницы к распознаванию — только пиксели, без DOM (1.32, п.7).
// Один и тот же код работает в фоновом потоке (Web Worker + OffscreenCanvas, см. textbookWorker.ts) и, если поток
// недоступен (Electron с file://, старый WebView, запрет CSP), — в главном потоке с паузами для интерфейса.
import { boxBlur, findPageQuad, flattenLight, makeYielder, medianGlyphHeight, noiseLevel, quadSize, rgbaToGray, skewOf, stretchContrast, warpQuad, type Gray, type Quad } from './textbookImage';
import { applyRowWarp, cropRgba, estimateRowWarp, findSpine, inkCoverage, lightStats, rotateGrayQ, rotateRgbaQ, sharpness, textDirection, type PhotoFacts } from './textbookPhoto';
import { analyzeRegions, strokeStat, type RegionsResult } from './textbookRegions';
import type { OcrLine, Rect } from './textbookText';

/** Высота строчных букв, к которой приводим текст перед распознаванием (px). */
export const GLYPH_TARGET = 22;
export const WORK_SIDE = 3000;

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** Как создать холст: в окне — document.createElement('canvas'), в фоновом потоке — OffscreenCanvas. */
export type MakeCanvas = (w: number, h: number) => AnyCanvas;

export const ctx2d = (c: AnyCanvas, read = false): Ctx2D => c.getContext('2d', read ? { willReadFrequently: true } : undefined) as Ctx2D;

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PrepInfo {
  quad: boolean;
  skew: number;
  scale: number;
  glyph: number;
  noise: number;
  w: number;
  h: number;
  dir?: 'h' | 'v';
  dirScores?: number[];
  spread?: boolean;
  warp?: number;
  facts?: Partial<PhotoFacts>;
}

/** Подготовленная страница без холста: пиксели, серая копия и сведения о снимке. Холст для обрезки рисунков делает окно. */
export interface PreparedPixels {
  rgba: Uint8ClampedArray;
  gray: Gray;
  info: PrepInfo;
}

export type PrepProgress = (text: string, frac?: number) => void;

/** Пауза, чтобы окно успело отрисовать кадр. В фоновом потоке не нужна — там передаётся пустая. */
export type Yield = () => Promise<void>;
export const tickUi: Yield = () => new Promise<void>((r) => setTimeout(r, 0));

/** Повернуть, обрезать и уменьшить страницу до maxSide по длинной стороне. */
export function drawPage(bmp: ImageBitmap, rotate: number, crop: Crop | undefined, maxSide: number, mk: MakeCanvas): AnyCanvas {
  const rot = rotate % 360;
  const rw = rot === 90 || rot === 270 ? bmp.height : bmp.width;
  const rh = rot === 90 || rot === 270 ? bmp.width : bmp.height;
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(c.x * rw);
  const sy = Math.round(c.y * rh);
  const sw = Math.max(1, Math.round(c.w * rw));
  const sh = Math.max(1, Math.round(c.h * rh));
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  // Рисуем сразу в нужный размер: гигантский холст на 12+ Мпикс не нужен.
  const out = mk(Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale)));
  const oc = ctx2d(out);
  oc.imageSmoothingQuality = 'high';
  oc.save();
  oc.scale(scale, scale);
  oc.translate(-sx, -sy);
  oc.translate(rw / 2, rh / 2);
  oc.rotate((rot * Math.PI) / 180);
  oc.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  oc.restore();
  return out;
}

export function canvasFrom(rgba: Uint8ClampedArray, w: number, h: number, mk: MakeCanvas): AnyCanvas {
  const c = mk(w, h);
  ctx2d(c).putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return c;
}

/** Во сколько раз одна сторона четырёхугольника длиннее противоположной (1 — снято прямо). */
export function foreshorten(q: Quad): number {
  const d = (a: Quad[0], b: Quad[0]) => Math.hypot(a.x - b.x, a.y - b.y);
  const top = d(q[0], q[1]);
  const bottom = d(q[3], q[2]);
  const left = d(q[0], q[3]);
  const right = d(q[1], q[2]);
  return Math.max(Math.max(top, bottom) / Math.max(1, Math.min(top, bottom)), Math.max(left, right) / Math.max(1, Math.min(left, right)));
}

/**
 * Подготовка: страница на столе → ровный прямоугольник, ровный свет, строки горизонтально (снимок на боку поворачиваем),
 * буквы нужного размера. src — уже повёрнутая и обрезанная страница (drawPage).
 */
export async function preparePixels(src: AnyCanvas, cropped: boolean, mk: MakeCanvas, onProgress?: PrepProgress, pause: Yield = tickUi): Promise<PreparedPixels> {
  const tick = makeYielder();
  let W = src.width;
  let H = src.height;
  let rgba = ctx2d(src, true).getImageData(0, 0, W, H).data as Uint8ClampedArray;
  await pause();
  let quadUsed = false;
  let fore = 1;
  if (!cropped) {
    const g0 = rgbaToGray(rgba, W, H);
    await pause();
    const quad = findPageQuad(g0);
    await pause();
    if (quad) {
      const sz = quadSize(quad, WORK_SIDE);
      onProgress?.('Выпрямляю страницу…', 0.14);
      fore = foreshorten(quad);
      rgba = await warpQuad(rgba, W, H, quad, sz.w, sz.h, tick);
      W = sz.w;
      H = sz.h;
      quadUsed = true;
    }
  }
  // Свет до выравнивания: по нему видно «темно / пересвет / блик».
  const raw = rgbaToGray(rgba, W, H);
  const light = lightStats(raw);
  await pause();
  onProgress?.('Выравниваю свет и тени…', 0.24);
  const flat = await flattenLight(rgba, W, H, tick);
  await pause();
  // Снимок лёг на бок: строки вертикальные — поворачиваем (какой из двух поворотов верный, решит чтение).
  const dirInfo = textDirection(flat.gray);
  const dir = dirInfo.dir;
  let flatColor = flat.color;
  let flatGray = flat.gray;
  if (dir === 'v') {
    const r = rotateRgbaQ(flatColor, W, H, 1);
    flatColor = r.data;
    W = r.w;
    H = r.h;
    flatGray = rotateGrayQ(flatGray, 1);
  }
  await pause();
  const skew = skewOf(flatGray, 14);
  await pause();
  const glyph = medianGlyphHeight(flatGray);
  const noise = noiseLevel(flatGray);
  await pause();
  let scale = glyph > 0 ? Math.min(2.5, Math.max(0.5, GLYPH_TARGET / glyph)) : 1;
  // Слишком большие страницы не раздуваем (память и время распознавания).
  scale = Math.min(scale, 3600 / Math.max(W, H));
  if (Math.abs(scale - 1) < 0.08) scale = 1;
  const out = mk(Math.round(W * scale), Math.round(H * scale));
  const octx = ctx2d(out, true);
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.imageSmoothingQuality = 'high';
  octx.translate(out.width / 2, out.height / 2);
  if (skew) octx.rotate((-skew * Math.PI) / 180);
  octx.scale(scale, scale);
  octx.drawImage(canvasFrom(flatColor, W, H, mk), -W / 2, -H / 2);
  const res = octx.getImageData(0, 0, out.width, out.height);
  await pause();
  const gray = rgbaToGray(res.data as Uint8ClampedArray, out.width, out.height);
  const facts: Partial<PhotoFacts> = { paper: light.paper, clipped: light.clipped, inkDepth: light.inkDepth, glyph, foreshorten: fore };
  return { rgba: res.data as Uint8ClampedArray, gray, info: { quad: quadUsed, skew, scale, glyph, noise, w: out.width, h: out.height, dir, dirScores: [dirInfo.hScore, dirInfo.vScore], facts } };
}

/** Пересобирает страницу из новых пикселей. */
function rebuildPixels(prep: PreparedPixels, rgba: Uint8ClampedArray, w: number, h: number, extra: Partial<PrepInfo> = {}): PreparedPixels {
  return { rgba, gray: rgbaToGray(rgba, w, h), info: { ...prep.info, w, h, ...extra } };
}

/** Страница вверх ногами (поворот на 180°). */
export function rotatePixels180(prep: PreparedPixels): PreparedPixels {
  const r = rotateRgbaQ(prep.rgba, prep.info.w, prep.info.h, 2);
  return rebuildPixels(prep, r.data, r.w, r.h);
}

/** Разворот: режем по корешку на левую и правую страницы (с небольшим запасом у корешка). null — это одна страница. */
export function splitPixels(prep: PreparedPixels): [PreparedPixels, PreparedPixels] | null {
  const sp = findSpine(prep.gray);
  if (!sp) return null;
  const { w, h } = prep.info;
  const L = cropRgba(prep.rgba, w, h, 0, 0, Math.round(sp.a), h);
  const R = cropRgba(prep.rgba, w, h, Math.round(sp.b), 0, w, h);
  return [rebuildPixels(prep, L.data, L.w, L.h, { spread: true }), rebuildPixels(prep, R.data, R.w, R.h, { spread: true })];
}

/** Убирает «волну» строк, если она есть. */
export function dewarpPixels(prep: PreparedPixels): PreparedPixels {
  const warp = estimateRowWarp(prep.gray);
  if (!warp) return prep;
  const rgba = applyRowWarp(prep.rgba, prep.info.w, prep.info.h, warp.dy);
  return rebuildPixels(prep, rgba, prep.info.w, prep.info.h, { warp: Math.round(warp.amp * 10) / 10 });
}

/** Что просим у подготовки: страница с фото, нужен ли разрез разворота и выпрямление строк. */
export interface PrepJob {
  file: Blob;
  rotate: number;
  crop?: Crop;
  /** Резать ли разворот на две страницы. */
  split: boolean;
  /** Что приготовить к чтению каждой страницы (PNG для распознавания, JPEG). */
  want?: Want;
}

/** Весь путь подготовки: фото → страница(ы), готовые к чтению (каждая — с выпрямленными строками). */
export interface PreparedJob {
  /** Вся страница до разреза (серая и сведения) — по ней совет, что переснять, если ИИ ничего не прочитал. */
  whole: Pick<PreparedPixels, 'gray' | 'info'>;
  parts: Part[];
  spread: boolean;
}

export async function prepareParts(job: PrepJob, mk: MakeCanvas, onProgress?: PrepProgress, pause: Yield = tickUi, bitmap = false): Promise<PreparedJob> {
  onProgress?.('Ищу страницу на фото…', 0.04);
  const bmp = await createImageBitmap(job.file, { imageOrientation: 'from-image' });
  let src: AnyCanvas;
  try {
    src = drawPage(bmp, job.rotate, job.crop, WORK_SIDE, mk);
  } finally {
    bmp.close();
  }
  await pause();
  const whole = await preparePixels(src, Boolean(job.crop), mk, onProgress, pause);
  const halves = job.split ? splitPixels(whole) : null;
  await pause();
  const parts: Part[] = [];
  for (const part of halves ?? [whole]) {
    const px = dewarpPixels(part);
    await pause();
    parts.push(job.want ? await finishPart(px, job.want, mk, bitmap) : px);
    await pause();
  }
  return { whole: { gray: whole.gray, info: whole.info }, parts, spread: Boolean(halves) };
}

// ---------- Доводка страницы: то, что раньше делало окно ----------

/** Какие картинки страницы нужны сразу: PNG для распознавания и JPEG заданного размера (фото страницы, для ИИ). */
export interface Want {
  ocr: boolean;
  jpegs: { side: number; q: number }[];
}

/** Готовая к чтению страница: пиксели + (по желанию) картинка для обрезки, PNG для распознавания и JPEG. */
export interface Part extends PreparedPixels {
  /** Цветная страница картинкой: из неё окно режет рисунки и сомнительные слова (drawImage — без копирования пикселей). */
  bitmap?: ImageBitmap;
  ocrPng?: Uint8Array;
  /** data:image/jpeg по ключу jpegKey(side, q). */
  jpegs?: Record<string, string>;
}

export const jpegKey = (side: number, q: number) => `${side}@${q}`;

/** Картинка для распознавания: контраст и, на шумном снимке, лёгкое размытие. */
export function ocrImage(px: PreparedPixels): Gray {
  return px.info.noise > 9 ? stretchContrast(boxBlur(px.gray, 1), 60, 240) : stretchContrast(px.gray, 60, 240);
}

export function grayCanvas(g: Gray, mk: MakeCanvas): AnyCanvas {
  const rgba = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0, j = 0; i < g.d.length; i++, j += 4) (rgba[j] = rgba[j + 1] = rgba[j + 2] = g.d[i]), (rgba[j + 3] = 255);
  return canvasFrom(rgba, g.w, g.h, mk);
}

export async function encodeCanvas(c: AnyCanvas, type: 'image/png' | 'image/jpeg', q = 0.92): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality: q });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Не получилось сохранить картинку.'))), type, q));
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error ?? new Error('Не получилось прочитать картинку.'));
    r.readAsDataURL(b);
  });
}

/** Уменьшить картинку до maxSide по длинной стороне (больше не увеличивает). */
export function scaleTo(c: AnyCanvas | ImageBitmap, maxSide: number, mk: MakeCanvas): AnyCanvas | ImageBitmap {
  const k = Math.min(1, maxSide / Math.max(c.width, c.height));
  if (k === 1) return c;
  const o = mk(Math.round(c.width * k), Math.round(c.height * k));
  const ctx = ctx2d(o);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, o.width, o.height);
  return o;
}

/** Готовит то, что нужно для чтения страницы. bitmap — отдать цветную страницу картинкой (только в фоновом потоке). */
export async function finishPart(px: PreparedPixels, want: Want, mk: MakeCanvas, bitmap: boolean): Promise<Part> {
  const out: Part = { ...px };
  if (want.ocr) out.ocrPng = new Uint8Array(await (await encodeCanvas(grayCanvas(ocrImage(px), mk), 'image/png')).arrayBuffer());
  const color = canvasFrom(px.rgba, px.info.w, px.info.h, mk);
  if (want.jpegs.length) {
    out.jpegs = {};
    for (const j of want.jpegs) {
      const sc = scaleTo(color, j.side, mk);
      out.jpegs[jpegKey(j.side, j.q)] = await blobToDataUrl(await encodeCanvas(sc as AnyCanvas, 'image/jpeg', j.q));
    }
  }
  if (bitmap && 'transferToImageBitmap' in color) out.bitmap = color.transferToImageBitmap();
  return out;
}

// ---------- После распознавания: жирный, рисунки и рамки, резкость ----------

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

/** Помечает жирные слова: штрихи заметно толще обычных на этой странице. */
export function markBold(lines: OcrLine[], gray: Gray): void {
  const wordH = median(lines.flatMap((l) => l.words.filter((w) => w.text.replace(/[^\p{L}]/gu, '').length >= 3).map((w) => w.bbox.y1 - w.bbox.y0)));
  if (!wordH) return;
  const stats = new Map<object, { stem: number; density: number; h: number; n: number }>();
  for (const l of lines)
    for (const w of l.words) {
      const n = w.text.replace(/[^\p{L}\p{N}]/gu, '').length;
      if (n < 1) continue;
      const s = strokeStat(gray, w.bbox);
      stats.set(w, { ...s, h: w.bbox.y1 - w.bbox.y0, n });
    }
  const body = [...stats.values()].filter((s) => s.n >= 3 && s.h > wordH * 0.8 && s.h < wordH * 1.25 && s.stem > 0);
  if (body.length < 5) return;
  const stem = median(body.map((s) => s.stem));
  const dens = median(body.map((s) => s.density));
  for (const l of lines)
    for (const w of l.words) {
      const s = stats.get(w);
      if (!s) continue;
      const rel = s.stem / stem;
      const dRel = s.density / (dens || 1);
      // Короткие слова и одиночные буквы — только при явном превосходстве.
      const need = s.n <= 2 ? 1.5 : 1.28;
      w.bold = rel >= need && s.stem - stem >= 0.8 && dRel >= 1.12;
    }
}

/** Резкость по самому «текстовому» окну картинки (не по рисунку и не по пустому полю). */
export function sharpnessOfText(g: Gray): number {
  const S = 640;
  let best = { x: 0, y: 0, ink: -1 };
  for (let gy = 0; gy < 3; gy++)
    for (let gx = 0; gx < 3; gx++) {
      const x0 = Math.max(0, Math.min(g.w - S, Math.round(((gx + 0.5) / 3) * g.w - S / 2)));
      const y0 = Math.max(0, Math.min(g.h - S, Math.round(((gy + 0.5) / 3) * g.h - S / 2)));
      let ink = 0;
      for (let y = y0; y < Math.min(g.h, y0 + S); y += 3) for (let x = x0; x < Math.min(g.w, x0 + S); x += 3) if (g.d[y * g.w + x] < 150) ink++;
      if (ink > best.ink) best = { x: x0, y: y0, ink };
    }
  const w = Math.min(S, g.w);
  const h = Math.min(S, g.h);
  const d = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) d.set(g.d.subarray((best.y + y) * g.w + best.x, (best.y + y) * g.w + best.x + w), y * w);
  return sharpness({ w, h, d });
}

export interface Analysis {
  lines: OcrLine[];
  regions: RegionsResult;
  goodWords: Rect[];
  sharp: number;
  cover: number;
}

/** Всё тяжёлое после распознавания, кроме сборки текста: жирный, рисунки и рамки, резкость и покрытие текстом. */
export function analyzePixels(px: PreparedPixels, lines: OcrLine[]): Analysis {
  const gray = px.gray;
  markBold(lines, gray);
  // Размер строки — для порогов; рисунки и рамки ищем там, где нет уверенного текста.
  const goodWords = lines.flatMap((l) => l.words.filter((w) => w.conf >= 30 && w.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 2).map((w) => w.bbox));
  const mh = median(lines.map((l) => l.bbox.y1 - l.bbox.y0)) || 30;
  const regions = analyzeRegions(px.rgba, gray, goodWords, mh, px.info.glyph * px.info.scale);
  return { lines, regions, goodWords, sharp: sharpnessOfText(gray), cover: inkCoverage(gray, goodWords, regions.figures) };
}

// ---------- Сообщения фонового потока (textbookWorker.ts ↔ textbookOffload.ts) ----------

export type PrepRequest =
  | { id: number; op: 'prepare'; job: PrepJob }
  | { id: number; op: 'rotate180'; px: PreparedPixels; want: Want }
  | { id: number; op: 'analyze'; px: PreparedPixels; lines: OcrLine[] };
export type PrepResult = PreparedJob | Part | (Analysis & { px: PreparedPixels });
/** px в ошибке — пиксели, пришедшие в поток: их возвращаем, чтобы окно могло доделать работу само. */
export type PrepReply = { id: number; type: 'progress'; text: string; frac?: number } | { id: number; type: 'done'; result: PrepResult } | { id: number; type: 'error'; message: string; px?: PreparedPixels };

/** Буферы пикселей (каждый один раз: страница без разреза делит буфер с целой) и картинки — их передаём, а не копируем. */
export function transferables(...pxs: (Partial<Part> | Pick<PreparedPixels, 'gray'> | undefined)[]): Transferable[] {
  const set = new Set<Transferable>();
  for (const p of pxs) {
    if (!p) continue;
    if ('rgba' in p && p.rgba) set.add(p.rgba.buffer as ArrayBuffer);
    if (p.gray) set.add(p.gray.d.buffer as ArrayBuffer);
    if ('ocrPng' in p && p.ocrPng) set.add(p.ocrPng.buffer as ArrayBuffer);
    if ('bitmap' in p && p.bitmap) set.add(p.bitmap);
  }
  return [...set];
}
