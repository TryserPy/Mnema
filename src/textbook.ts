// Фото страниц учебника → конспект в Markdown.
// Без интернета: фото выпрямляется (страница на столе, перспектива, тени, наклон), Tesseract читает слова,
// а колонки, абзацы, заголовки, списки, жирный, рисунки, рамки «Запомните» и формулы Refrain восстанавливает сама.
// Точный режим — ИИ с зрением; если он не справился, страница читается без интернета.
import { humanError } from './ai';
import { aiRequest } from './aiTasks';
import { noteAnswer, REFRAIN_SIDE, type RefrainFields } from './refrain';
import { boxBlur, findPageQuad, flattenLight, makeYielder, medianGlyphHeight, noiseLevel, quadSize, rgbaToGray, skewOf, stretchContrast, warpQuad, type Gray } from './textbookImage';
import { adviceFor, applyRowWarp, cropRgba, estimateRowWarp, findSpine, inkCoverage, lightStats, rotateGrayQ, rotateRgbaQ, sharpness, textDirection, type Advice, type PhotoFacts } from './textbookPhoto';
import { refineFigureBox, remapFigureMarks, tidyFigures } from './textbookFigures';
import { mergeInput, mergeSystem, pageSystem, parseMerged, readSystem, type NoteStyle } from './textbookNote';
import { analyzeRegions, strokeStat } from './textbookRegions';
import { buildPage, judgeAiAnswer, median, type Box, type Doubt, type Figure, type OcrLine, type PageResult, type Rect } from './textbookText';
import type { Quad } from './textbookImage';

export { assemble, fixOcrText, judgeAiAnswer, parseAiMarkdown, sanitizeAiText } from './textbookText';
export type { Box, Doubt, Figure, PageResult } from './textbookText';

/** Ход распознавания одной страницы: что делаю сейчас и (если знаю) какая доля работы сделана, 0..1. */
export type Progress = (text: string, frac?: number) => void;

export interface PageInput {
  id: string;
  file: Blob;
  name: string;
  n: number; // номер страницы
  rotate: 0 | 90 | 180 | 270;
  crop?: Box; // доли 0..1 от повёрнутой картинки
}

/** Высота строчных букв, к которой приводим текст перед распознаванием (px). */
export const GLYPH_TARGET = 22;
const WORK_SIDE = 3000;

// ---------- Картинки ----------

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

/** Повернуть, обрезать и уменьшить страницу до maxSide по длинной стороне. */
export async function renderPage(p: PageInput, maxSide: number): Promise<HTMLCanvasElement> {
  const bmp = await loadBitmap(p.file);
  const rot = p.rotate % 360;
  const rw = rot === 90 || rot === 270 ? bmp.height : bmp.width;
  const rh = rot === 90 || rot === 270 ? bmp.width : bmp.height;
  const c = p.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(c.x * rw);
  const sy = Math.round(c.y * rh);
  const sw = Math.max(1, Math.round(c.w * rw));
  const sh = Math.max(1, Math.round(c.h * rh));
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  // Рисуем сразу в нужный размер: гигантский холст на 12+ Мпикс не нужен.
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const oc = out.getContext('2d')!;
  oc.imageSmoothingQuality = 'high';
  oc.save();
  oc.scale(scale, scale);
  oc.translate(-sx, -sy);
  oc.translate(rw / 2, rh / 2);
  oc.rotate((rot * Math.PI) / 180);
  oc.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  oc.restore();
  bmp.close();
  return out;
}

export function canvasToJpeg(c: HTMLCanvasElement, q = 0.82): string {
  return c.toDataURL('image/jpeg', q);
}

async function canvasBytes(c: HTMLCanvasElement, type: 'image/png' | 'image/jpeg' = 'image/png', q = 0.92): Promise<Uint8Array> {
  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), type, q));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Вырезать кусок (в долях) и вернуть data URI. */
export function cropUri(c: HTMLCanvasElement, b: Box, type: 'image/jpeg' | 'image/png' = 'image/jpeg', maxSide = 1100): string {
  const sx = Math.max(0, Math.round(b.x * c.width));
  const sy = Math.max(0, Math.round(b.y * c.height));
  const sw = Math.max(1, Math.min(c.width - sx, Math.round(b.w * c.width)));
  const sh = Math.max(1, Math.min(c.height - sy, Math.round(b.h * c.height)));
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const o = document.createElement('canvas');
  o.width = Math.max(1, Math.round(sw * scale));
  o.height = Math.max(1, Math.round(sh * scale));
  const ctx = o.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height);
  return o.toDataURL(type, 0.85);
}

function scaleCanvas(c: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(c.width, c.height));
  if (k === 1) return c;
  const o = document.createElement('canvas');
  o.width = Math.round(c.width * k);
  o.height = Math.round(c.height * k);
  const ctx = o.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, o.width, o.height);
  return o;
}

function canvasOf(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return c;
}

/** Серая картинка → PNG-байты для Tesseract. */
async function grayPng(g: Gray): Promise<Uint8Array> {
  const rgba = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0, j = 0; i < g.d.length; i++, j += 4) (rgba[j] = rgba[j + 1] = rgba[j + 2] = g.d[i]), (rgba[j + 3] = 255);
  return canvasBytes(canvasOf(rgba, g.w, g.h), 'image/png');
}

export interface Prepared {
  /** Выровненная цветная страница нужного размера (бумага белая). */
  color: HTMLCanvasElement;
  rgba: Uint8ClampedArray;
  /** Серая для распознавания. */
  gray: Gray;
  info: { quad: boolean; skew: number; scale: number; glyph: number; noise: number; w: number; h: number; dir?: 'h' | 'v'; dirScores?: number[]; spread?: boolean; warp?: number; facts?: Partial<PhotoFacts> };
}

const tickUi = () => new Promise<void>((r) => setTimeout(r, 0));

/** Во сколько раз одна сторона четырёхугольника длиннее противоположной (1 — снято прямо). */
function foreshorten(q: Quad): number {
  const d = (a: Quad[0], b: Quad[0]) => Math.hypot(a.x - b.x, a.y - b.y);
  const top = d(q[0], q[1]);
  const bottom = d(q[3], q[2]);
  const left = d(q[0], q[3]);
  const right = d(q[1], q[2]);
  return Math.max(Math.max(top, bottom) / Math.max(1, Math.min(top, bottom)), Math.max(left, right) / Math.max(1, Math.min(left, right)));
}

/** Резкость по самому «текстовому» окну картинки (не по рисунку и не по пустому полю). */
function sharpnessOfText(g: Gray): number {
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

/**
 * Подготовка: страница на столе → ровный прямоугольник, ровный свет, строки горизонтально (снимок на боку поворачиваем),
 * буквы нужного размера.
 */
export async function prepareOffline(p: PageInput, onProgress?: Progress): Promise<Prepared> {
  const tick = makeYielder();
  onProgress?.('Ищу страницу на фото…', 0.04);
  const src = await renderPage(p, WORK_SIDE);
  await tickUi();
  let W = src.width;
  let H = src.height;
  let rgba = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data as Uint8ClampedArray;
  let quadUsed = false;
  let fore = 1;
  if (!p.crop) {
    const quad = findPageQuad(rgbaToGray(rgba, W, H));
    await tickUi();
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
  onProgress?.('Выравниваю свет и тени…', 0.24);
  const flat = await flattenLight(rgba, W, H, tick);
  await tickUi();
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
  const skew = skewOf(flatGray, 14);
  const glyph = medianGlyphHeight(flatGray);
  const noise = noiseLevel(flatGray);
  let scale = glyph > 0 ? Math.min(2.5, Math.max(0.5, GLYPH_TARGET / glyph)) : 1;
  // Слишком большие страницы не раздуваем (память и время распознавания).
  scale = Math.min(scale, 3600 / Math.max(W, H));
  if (Math.abs(scale - 1) < 0.08) scale = 1;
  const out = document.createElement('canvas');
  out.width = Math.round(W * scale);
  out.height = Math.round(H * scale);
  const octx = out.getContext('2d', { willReadFrequently: true })!;
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.imageSmoothingQuality = 'high';
  octx.translate(out.width / 2, out.height / 2);
  if (skew) octx.rotate((-skew * Math.PI) / 180);
  octx.scale(scale, scale);
  octx.drawImage(canvasOf(flatColor, W, H), -W / 2, -H / 2);
  const res = octx.getImageData(0, 0, out.width, out.height);
  await tickUi();
  const gray = rgbaToGray(res.data, out.width, out.height);
  const facts: Partial<PhotoFacts> = { paper: light.paper, clipped: light.clipped, inkDepth: light.inkDepth, glyph, foreshorten: fore };
  return { color: out, rgba: res.data as Uint8ClampedArray, gray, info: { quad: quadUsed, skew, scale, glyph, noise, w: out.width, h: out.height, dir, dirScores: [dirInfo.hScore, dirInfo.vScore], facts } };
}

/** Пересобирает Prepared из новых пикселей (canvas, серая). */
function rebuild(prep: Prepared, rgba: Uint8ClampedArray, w: number, h: number, extra: Partial<Prepared['info']> = {}): Prepared {
  const color = canvasOf(rgba, w, h);
  return { color, rgba, gray: rgbaToGray(rgba, w, h), info: { ...prep.info, w, h, ...extra } };
}

/** Страница вверх ногами (поворот на 180°). */
export function rotatePrepared180(prep: Prepared): Prepared {
  const r = rotateRgbaQ(prep.rgba, prep.info.w, prep.info.h, 2);
  return rebuild(prep, r.data, r.w, r.h);
}

/** Разворот: режем по корешку на левую и правую страницы (с небольшим запасом у корешка). null — это одна страница. */
export function splitSpread(prep: Prepared): [Prepared, Prepared] | null {
  const sp = findSpine(prep.gray);
  if (!sp) return null;
  const { w, h } = prep.info;
  const L = cropRgba(prep.rgba, w, h, 0, 0, Math.round(sp.a), h);
  const R = cropRgba(prep.rgba, w, h, Math.round(sp.b), 0, w, h);
  return [rebuild(prep, L.data, L.w, L.h, { spread: true }), rebuild(prep, R.data, R.w, R.h, { spread: true })];
}

/** Убирает «волну» строк, если она есть. */
export function dewarpPrepared(prep: Prepared): Prepared {
  const warp = estimateRowWarp(prep.gray);
  if (!warp) return prep;
  const rgba = applyRowWarp(prep.rgba, prep.info.w, prep.info.h, warp.dy);
  return rebuild(prep, rgba, prep.info.w, prep.info.h, { warp: Math.round(warp.amp * 10) / 10 });
}

// ---------- Жирный шрифт ----------

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

// ---------- Без интернета ----------

let debugHook: ((x: unknown) => void) | null = null;
/** Для замеров: получить промежуточные данные последнего распознавания. */
export function setDebugHook(f: ((x: unknown) => void) | null) {
  debugHook = f;
}

/** Сколько слов прочитано уверенно (не короче трёх букв): по нему видно, что страница не вверх ногами. */
export function goodWordCount(lines: OcrLine[]): number {
  let n = 0;
  for (const l of lines) for (const w of l.words) if (w.conf >= 55 && (w.text.match(/[А-Яа-яЁёA-Za-z]/g) ?? []).length >= 3) n++;
  return n;
}

/** Доля строк, где слова идут справа налево по координатам: так бывает, когда Tesseract сам перевернул страницу вверх ногами. */
export function reversedShare(lines: OcrLine[]): number {
  let multi = 0;
  let rev = 0;
  for (const l of lines) {
    const ws = l.words.filter((w) => w.text.trim());
    if (ws.length < 3) continue;
    multi++;
    let dec = 0;
    for (let i = 1; i < ws.length; i++) if (ws[i].bbox.x0 < ws[i - 1].bbox.x0) dec++;
    if (dec > (ws.length - 1) * 0.6) rev++;
  }
  return multi >= 3 ? rev / multi : 0;
}

interface Read {
  page: PageResult;
  good: number;
  empty: boolean;
  /** Строки прочитаны задом наперёд: страница лежит вверх ногами. */
  rev: boolean;
}

/** Чтение уже подготовленной страницы: Tesseract → раскладка → рисунки и сомнительные слова. */
async function readPrepared(p: PageInput, prep: Prepared, onProgress?: Progress, span: [number, number] = [0.36, 0.9]): Promise<Read> {
  const api = window.mnemaApi;
  if (!api?.ocrRecognize) throw new Error('Распознавание без интернета работает в приложении для Windows, Linux, на телефоне и в браузере.');
  onProgress?.('Читаю текст…', span[0]);
  const gray = prep.gray;
  const ocrImg = prep.info.noise > 9 ? stretchContrast(boxBlur(gray, 1), 60, 240) : stretchContrast(gray, 60, 240);
  const res = await api.ocrRecognize(await grayPng(ocrImg));
  if (!res.ok) throw new Error(res.error);
  onProgress?.('Собираю абзацы, заголовки и рисунки…', span[1]);
  await tickUi();
  const lines = (res.lines as OcrLine[]).filter((l) => l.words?.some((w) => w.text.trim()));
  const good = goodWordCount(lines);
  const rev = reversedShare(lines) > 0.5;
  markBold(lines, gray);
  // Размер строки — для порогов; рисунки и рамки ищем там, где нет уверенного текста.
  const goodWords = lines.flatMap((l) => l.words.filter((w) => w.conf >= 30 && w.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 2).map((w) => w.bbox));
  const mh = median(lines.map((l) => l.bbox.y1 - l.bbox.y0)) || 30;
  const regions = analyzeRegions(prep.rgba, gray, goodWords, mh, prep.info.glyph * prep.info.scale);
  const layout = buildPage({ lines, width: gray.w, height: gray.h, figures: regions.figures, boxes: regions.boxes });
  const canvas = prep.color;
  const doubts: Doubt[] = layout.doubts.slice(0, 40).map((d) => {
    const pad = 6;
    const bw = d.bbox.x1 - d.bbox.x0;
    return {
      id: d.id,
      text: d.text,
      crop: cropUri(canvas, { x: (d.bbox.x0 - pad * 4) / canvas.width, y: (d.bbox.y0 - pad) / canvas.height, w: (bw + pad * 8) / canvas.width, h: (d.bbox.y1 - d.bbox.y0 + pad * 2) / canvas.height }, 'image/png', 600)
    };
  });
  // Сомнительных слов больше лимита — остальные остаются как прочитаны.
  let markdown = layout.markdown;
  for (const d of layout.doubts.slice(40)) markdown = markdown.replace(`⟦?:${d.id}⟧`, d.text);
  const figures: Figure[] = regions.figures.map((f: Rect, i: number) => {
    const pad = 8;
    const box = { x: Math.max(0, (f.x0 - pad) / canvas.width), y: Math.max(0, (f.y0 - pad) / canvas.height), w: 0, h: 0 };
    box.w = Math.min(1 - box.x, (f.x1 - f.x0 + pad * 2) / canvas.width);
    box.h = Math.min(1 - box.y, (f.y1 - f.y0 + pad * 2) / canvas.height);
    return { box, caption: layout.captions[i] ?? '', uri: cropUri(canvas, box) };
  });
  const q = layout.quality;
  // Советы ученику, если страница прочиталась слабо: что не так со снимком.
  const facts: PhotoFacts = {
    paper: 255,
    clipped: 0,
    inkDepth: 0,
    glyph: prep.info.glyph,
    foreshorten: 1,
    glareShare: 0,
    ...prep.info.facts,
    sharp: sharpnessOfText(gray),
    moire: 0,
    conf: q.conf,
    unsureShare: q.words ? q.unsure / q.words : 0,
    words: q.words
  };
  facts.cover = inkCoverage(gray, goodWords, regions.figures);
  const advice: Advice[] = adviceFor(facts);
  debugHook?.({ info: prep.info, lines, layout, regions, facts: { ...facts, good, rev: rev ? 1 : 0 } as PhotoFacts, advice });
  const page: PageResult = { n: p.n, photo: canvasToJpeg(scaleCanvas(canvas, 1600)), markdown, figures, doubts, detectedPage: layout.detectedPage, quality: q, advice: advice.length ? advice : undefined };
  return { page, good, empty: !markdown.trim() && !figures.length, rev };
}

const NO_TEXT = 'на фото не нашлось текста. Проверь, что страница видна целиком, резкая и не повёрнута боком (кнопка «Повернуть»).';

/** Страница читается; если текста почти нет — пробуем вверх ногами (снимок мог перевернуться). */
async function readUpright(p: PageInput, prep: Prepared, onProgress?: Progress, span?: [number, number]): Promise<Read & { flipped: boolean }> {
  let r = await readPrepared(p, prep, onProgress, span);
  if (r.rev) {
    // Tesseract сам перевернул страницу: слова пришли справа налево. Поворачиваем снимок и читаем заново.
    const alt = await readPrepared(p, rotatePrepared180(prep), onProgress, span);
    if (!alt.rev && alt.good > r.good * 0.6) return { ...alt, flipped: true };
  }
  if (r.good < 25 || r.page.quality!.conf < 50) {
    const alt = await readPrepared(p, rotatePrepared180(prep), onProgress, span);
    if (alt.good > r.good * 1.5 + 5) return { ...alt, flipped: true };
  }
  return { ...r, flipped: false };
}

/**
 * Фото → страницы. Одно фото — обычно одна страница, но разворот (две страницы на снимке) режется по корешку
 * и читается как две: сначала левая, потом правая. Страница вверх ногами или на боку поворачивается сама,
 * «волна» строк у корешка выпрямляется. Если снимок плох, в странице есть advice — честный совет, что переснять.
 */
export async function recognizeOfflinePages(p: PageInput, onProgress?: Progress, opts: { spread?: boolean } = {}): Promise<PageResult[]> {
  const api = window.mnemaApi;
  if (!api?.ocrRecognize) throw new Error('Распознавание без интернета работает в приложении для Windows, Linux, на телефоне и в браузере.');
  const prep = await prepareOffline(p, onProgress);
  const halves = opts.spread === false ? null : splitSpread(prep);
  const parts = halves ?? [prep];
  const out: PageResult[] = [];
  let flips = 0;
  for (let j = 0; j < parts.length; j++) {
    const span: [number, number] = [0.36 + (0.5 * j) / parts.length, 0.36 + (0.5 * (j + 1)) / parts.length];
    const r = await readUpright(p, dewarpPrepared(parts[j]), onProgress, span);
    if (r.flipped) flips++;
    out.push(r.page);
  }
  // Разворот лежит вверх ногами: левая половина на снимке — это правая страница.
  if (halves && flips === 2) out.reverse();
  out.forEach((pg, j) => {
    pg.n = p.n + j;
    if (halves) pg.spread = j === 0 ? 'left' : 'right';
  });
  if (halves) {
    const note = 'На снимке разворот — прочитал две страницы по очереди.';
    out[0].note = out[0].note ? out[0].note + ' ' + note : note;
  }
  if (out.every((pg) => !pg.markdown.trim() && !pg.figures.length)) throw new Error(NO_TEXT);
  return out;
}

/** Одна страница с фото (без разворота) — для проверок и запасного пути ИИ. */
export async function recognizeOffline(p: PageInput, onProgress?: Progress): Promise<PageResult> {
  const [page] = await recognizeOfflinePages(p, onProgress, { spread: false });
  return page;
}

// ---------- Точный режим: ИИ ----------

/** Без предобработки (если она не удалась): страница как есть, не больше 1800 px. */
async function plainPrepared(p: PageInput): Promise<Prepared> {
  const c = await renderPage(p, 1800);
  const rgba = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data as Uint8ClampedArray;
  return { color: c, rgba, gray: rgbaToGray(rgba, c.width, c.height), info: { quad: false, skew: 0, scale: 1, glyph: 0, noise: 0, w: c.width, h: c.height } };
}

/** Что не так со снимком — для сообщения, когда ИИ ничего не прочитал. */
function photoTrouble(prep: Prepared): string {
  const f: PhotoFacts = { paper: 255, clipped: 0, inkDepth: 0, glyph: prep.info.glyph, foreshorten: 1, glareShare: 0, ...prep.info.facts, sharp: sharpnessOfText(prep.gray), moire: 0, conf: 0, unsureShare: 1, words: 0 };
  const a = adviceFor(f).filter((x) => x.code !== 'generic');
  return a.length ? ' ' + a.map((x) => x.text).join(' ') : ' Проверь, что страница видна целиком, резкая и хорошо освещена.';
}

/** refrain — та же задача для Refrain ИИ (фото уже уменьшено до 1600 px или текст страниц). */
async function askAi(system: string, text: string, photoUri: string | null, maxTokens: number, refrain?: RefrainFields): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const api = window.mnemaApi;
  if (!api?.aiAsk) return { ok: false, error: 'ИИ-помощник работает в приложении для Windows, Linux, на телефоне и в браузере.' };
  try {
    const r = await api.aiAsk(aiRequest('textbook', { system, text, image: photoUri ? { mime: 'image/jpeg', data: photoUri.split(',')[1] } : undefined, maxTokens, refrain }));
    noteAnswer(r, refrain?.task);
    if (!r.ok) return { ok: false, error: humanError(r.error) };
    return { ok: true, text: r.text };
  } catch (e) {
    return { ok: false, error: humanError((e as Error).message || String(e)) };
  }
}

export interface AiReadOptions {
  style: NoteStyle;
  /** Одна страница на всё: сразу конспект, без второго запроса. */
  direct: boolean;
}

/**
 * Страница (или разворот) → страницы, прочитанные ИИ. Фото предварительно выпрямляется и выравнивается по свету;
 * разворот режется по корешку на две страницы (каждая половина читается крупнее, чем весь разворот целиком).
 * Если ИИ не справился, страница читается без интернета.
 */
export async function recognizeWithAiPages(p: PageInput, o: AiReadOptions, onProgress?: Progress): Promise<{ pages: PageResult[]; direct: boolean }> {
  const api = window.mnemaApi;
  if (!api?.aiAsk) throw new Error('ИИ-помощник работает в приложении для Windows, Linux, на телефоне и в браузере.');
  onProgress?.('Готовлю фото…', 0.05);
  let prep: Prepared;
  try {
    prep = await prepareOffline(p, onProgress);
  } catch {
    prep = await plainPrepared(p);
  }
  const halves = p.crop ? null : splitSpread(prep);
  const parts = halves ?? [prep];
  const direct = o.direct && parts.length === 1 && o.style !== 'verbatim';
  const pages: PageResult[] = [];
  for (let j = 0; j < parts.length; j++) {
    const span: [number, number] = [0.15 + (0.8 * j) / parts.length, 0.15 + (0.8 * (j + 1)) / parts.length];
    const part = dewarpPrepared(parts[j]);
    const n = p.n + j;
    const canvas = part.color;
    const photo = canvasToJpeg(scaleCanvas(canvas, 1800), 0.85);
    onProgress?.(parts.length > 1 ? `ИИ читает ${j === 0 ? 'левую' : 'правую'} страницу разворота…` : direct ? 'ИИ делает конспект страницы…' : 'ИИ читает страницу…', span[0]);
    const fallback = async (why: string): Promise<PageResult> => {
      if (!api.ocrRecognize) throw new Error(why);
      onProgress?.('ИИ не справился — читаю без интернета…', span[0]);
      const r = await readUpright(p, part, onProgress, span);
      return { ...r.page, n, note: `${why} Страница прочитана без интернета — проверь её внимательнее.` };
    };
    // Refrain ИИ: «Конспект»/«Кратко» сразу по странице или «Дословно» (чтение для свода), фото — 1600 px.
    const refrain: RefrainFields = { task: direct ? (o.style === 'brief' ? 'textbook.brief' : 'textbook.summary') : 'textbook.verbatim', image: { mime: 'image/jpeg', data: canvasToJpeg(scaleCanvas(canvas, REFRAIN_SIDE), 0.85).split(',')[1] }, ...(n ? { page: n } : {}) };
    const ans = await askAi(direct ? pageSystem(o.style) : readSystem(), `Страница учебника${n ? `, номер ${n}` : ''}.${parts.length > 1 ? ` Это ${j === 0 ? 'левая' : 'правая'} страница разворота.` : ''} ${direct ? 'Сделай по ней конспект по правилам.' : 'Переведи её в Markdown по правилам.'} Фото может быть повёрнуто — читай как видишь.`, photo, 6000, refrain);
    if (!ans.ok) {
      pages.push(await fallback(ans.error));
      continue;
    }
    const verdict = judgeAiAnswer(ans.text);
    if (!verdict.ok) {
      if (verdict.empty) {
        if (parts.length > 1) continue; // пустая половина разворота (форзац, чистая страница) — пропускаем
        throw new Error('ИИ не нашёл на фото текста учебника.' + photoTrouble(part));
      }
      pages.push(await fallback(verdict.why));
      continue;
    }
    const parsed = verdict.parsed;
    // Рамки рисунков от ИИ уточняем по пикселям: поля, обрезанные края, мелочь и украшения.
    const tidy = tidyFigures(part.rgba, part.info.w, part.info.h, parsed.figures);
    const markdown = remapFigureMarks(parsed.markdown, tidy.map);
    const figures: Figure[] = tidy.figures.map((f) => ({ box: f.box, caption: f.caption, uri: cropUri(canvas, f.box) }));
    pages.push({ n, photo: canvasToJpeg(scaleCanvas(canvas, 1600)), markdown, figures, doubts: [], detectedPage: parsed.detectedPage, spread: parts.length > 1 ? (j === 0 ? 'left' : 'right') : undefined });
  }
  if (!pages.length) throw new Error('ИИ не нашёл на фото текста учебника.' + photoTrouble(prep));
  if (parts.length > 1) pages[0].note = (pages[0].note ? pages[0].note + ' ' : '') + 'На снимке разворот — страницы прочитаны по очереди, слева направо.';
  return { pages, direct };
}

/** Одна страница ИИ (для проверок): режим «Дословно». */
export async function recognizeWithAi(p: PageInput, onProgress?: Progress): Promise<PageResult> {
  const r = await recognizeWithAiPages(p, { style: 'verbatim', direct: false }, onProgress);
  return r.pages[0];
}

// ---------- Все страницы: чтение + связный конспект ----------

export interface RunOptions {
  engine: 'ai' | 'offline';
  style: NoteStyle;
}
export interface RunHooks {
  /** i — номер фото, с которым работаем (с нуля). */
  progress: (i: number, text: string, frac?: number) => void;
  cancelled: () => boolean;
}
export interface RunOutput {
  results: PageResult[];
  errors: string[];
  /** Связный конспект от ИИ по всем страницам (Markdown с метками рисунков); null — собираем из страниц. */
  summary: string | null;
  /** Что сказать ученику (откаты, пояснения). */
  notes: string[];
}

/** Если на фото виден номер страницы — берём его (только когда все номера нашлись и идут подряд). */
export function applyDetectedPages(out: PageResult[]): void {
  const detected = out.map((r) => r.detectedPage);
  if (out.length && detected.every((d) => d !== undefined) && detected.every((d, i) => i === 0 || d === detected[i - 1]! + 1)) out.forEach((r, i) => (r.n = detected[i]!));
}

/**
 * Читает все фото и, если нужен конспект по нескольким страницам, вторым запросом к ИИ собирает один связный конспект
 * (метки рисунков и [стр. N] сохраняются). Если второй запрос не удался, остаётся подробный текст страниц — с пояснением.
 * null — ученик нажал «Отмена».
 */
export async function readPages(inputs: PageInput[], o: RunOptions, h: RunHooks): Promise<RunOutput | null> {
  const results: PageResult[] = [];
  const errors: string[] = [];
  let lastDirect = false;
  for (let i = 0; i < inputs.length; i++) {
    if (h.cancelled()) return null;
    const p = inputs[i];
    h.progress(i, 'Готовлю фото…', 0);
    const onP: Progress = (text, frac) => h.progress(i, text, frac);
    try {
      if (o.engine === 'ai') {
        const r = await recognizeWithAiPages(p, { style: o.style, direct: inputs.length === 1 }, onP);
        results.push(...r.pages);
        lastDirect = r.direct;
      } else {
        results.push(...(await recognizeOfflinePages(p, onP)));
      }
    } catch (e) {
      errors.push(`Стр. ${p.n}: ${friendlyOcrError(e)}`);
    }
  }
  if (h.cancelled()) return null;
  applyDetectedPages(results);
  const notes: string[] = [];
  let summary: string | null = null;
  if (o.engine === 'ai' && o.style !== 'verbatim' && results.length && !(results.length === 1 && lastDirect)) {
    h.progress(inputs.length - 1, results.length > 1 ? 'ИИ составляет один конспект по всем страницам…' : 'ИИ составляет конспект…', 0.5);
    const why = await mergeWithAi(results, o.style, (t) => h.progress(inputs.length - 1, t, 0.7)).then(
      (r) => (r.ok ? ((summary = r.markdown), '') : r.why),
      (e: Error) => e.message
    );
    if (why) notes.push(`Не удалось составить конспект по всему параграфу (${why.replace(/\.$/, '')}). Показан подробный текст страниц — его можно сократить самому, или нажми «Назад» и попробуй ещё раз.`);
  }
  if (h.cancelled()) return null;
  return { results, errors, summary, notes };
}

/** Второй запрос: подробный текст страниц → один конспект. Длинные параграфы сводятся кусками. */
async function mergeWithAi(pages: PageResult[], style: Exclude<NoteStyle, 'verbatim'>, onStep: (t: string) => void): Promise<{ ok: true; markdown: string } | { ok: false; why: string }> {
  const chunks = mergeInput(pages);
  const parts: string[] = [];
  for (let k = 0; k < chunks.length; k++) {
    if (chunks.length > 1) onStep(`ИИ составляет конспект, часть ${k + 1} из ${chunks.length}…`);
    const ans = await askAi(mergeSystem(style), chunks[k].text, null, 7000, { task: 'textbook.merge', text: chunks[k].text });
    if (!ans.ok) return { ok: false, why: ans.error };
    const v = parseMerged(ans.text, pages, chunks[k].chars);
    if (!v.ok) return { ok: false, why: v.why };
    parts.push(v.markdown);
  }
  return { ok: true, markdown: parts.join('\n\n') };
}

/** Ошибка распознавания — понятным текстом: что случилось и что сделать. */
export function friendlyOcrError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (/createImageBitmap|decode|InvalidState|image source|The source image/i.test(m)) return 'не получилось открыть это фото. Сохрани его как JPEG или PNG и добавь снова.';
  if (/memory|allocation|RangeError|Array buffer/i.test(m)) return 'фото слишком большое для этого устройства. Уменьши его (например, сфотографируй с меньшим разрешением) и попробуй ещё раз.';
  if (/Failed to fetch|load.*(worker|traineddata|wasm)|NetworkError|importScripts|404/i.test(m)) return 'не загрузились файлы распознавания. Обнови страницу и попробуй снова.';
  if (/Слишком большой файл/.test(m)) return 'фото слишком большое. Сфотографируй с меньшим разрешением.';
  return m || 'неизвестная ошибка. Попробуй ещё раз.';
}

/** Перерезать рисунок по новой рамке. */
export async function recropFigure(photo: string, box: Box): Promise<string> {
  const img = new Image();
  img.src = photo;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return cropUri(c, box);
}

/** «Подогнать по рисунку»: рамка, которую ученик поставил примерно, уточняется по пикселям. null — внутри пусто. */
export async function fitFigure(photo: string, box: Box): Promise<Box | null> {
  const img = new Image();
  img.src = photo;
  await img.decode();
  const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const rgba = ctx.getImageData(0, 0, c.width, c.height).data as Uint8ClampedArray;
  return refineFigureBox(rgba, c.width, c.height, box)?.box ?? null;
}
