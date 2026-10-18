// Фото страниц учебника → конспект в Markdown.
// Без интернета: фото выпрямляется (страница на столе, перспектива, тени, наклон), Tesseract читает слова,
// а колонки, абзацы, заголовки, списки, жирный, рисунки, рамки «Запомните» и формулы Refrain восстанавливает сама.
// Точный режим — ИИ с зрением; если он не справился, страница читается без интернета.
import { aiError, humanError } from './ai';
import { aiRequest } from './aiTasks';
import { noteAnswer, REFRAIN_SIDE, type RefrainFields } from './refrain';
import { rgbaToGray, type Gray } from './textbookImage';
import { adviceFor, type Advice, type PhotoFacts } from './textbookPhoto';
import { dewarpPixels, drawPage, grayCanvas, jpegKey, ocrImage, rotatePixels180, sharpnessOfText, splitPixels, tickUi, type Part, type PreparedPixels, type PrepInfo, type Want } from './textbookPrep';
import { analyzeOffThread, prepareOffThread, rotateOffThread } from './textbookOffload';
import { refineFigureBox, remapFigureMarks, tidyFigures } from './textbookFigures';
import { mergeInput, mergeSystem, pageSystem, parseMerged, readSystem, type NoteStyle } from './textbookNote';
import { buildPage, judgeAiAnswer, type Box, type Doubt, type Figure, type OcrLine, type PageResult, type Rect } from './textbookText';

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

export { GLYPH_TARGET, markBold } from './textbookPrep';

// ---------- Картинки ----------

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

/** Повернуть, обрезать и уменьшить страницу до maxSide по длинной стороне. */
export async function renderPage(p: PageInput, maxSide: number): Promise<HTMLCanvasElement> {
  const bmp = await loadBitmap(p.file);
  try {
    return drawPage(bmp, p.rotate, p.crop, maxSide, newCanvas) as HTMLCanvasElement;
  } finally {
    bmp.close();
  }
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasToJpeg(c: HTMLCanvasElement, q = 0.82): string {
  return c.toDataURL('image/jpeg', q);
}

async function canvasBytes(c: HTMLCanvasElement, type: 'image/png' | 'image/jpeg' = 'image/png', q = 0.92): Promise<Uint8Array> {
  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), type, q));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Страница картинкой: холст в окне или ImageBitmap из фонового потока (рисуется без копирования пикселей). */
type Pic = HTMLCanvasElement | ImageBitmap;

/** Вырезать кусок (в долях) и вернуть data URI. */
export function cropUri(c: Pic, b: Box, type: 'image/jpeg' | 'image/png' = 'image/jpeg', maxSide = 1100): string {
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

function scaleCanvas(c: Pic, maxSide: number): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(c.width, c.height));
  if (k === 1 && c instanceof HTMLCanvasElement) return c;
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

/** Серая картинка → PNG-байты для Tesseract (запасной путь: обычно PNG готовит фоновый поток). */
async function grayPng(g: Gray): Promise<Uint8Array> {
  return canvasBytes(grayCanvas(g, newCanvas) as HTMLCanvasElement, 'image/png');
}

/** Подготовленная страница + выровненная цветная страница картинкой (из неё режутся рисунки и сомнительные слова). */
export interface Prepared extends Part {
  color: Pic;
}

/** Картинка страницы: готовая из фонового потока или холст из пикселей (одно копирование, без пересчёта). */
function withCanvas(px: Part): Prepared {
  return { ...px, color: px.bitmap ?? canvasOf(px.rgba, px.info.w, px.info.h) };
}

/** Фото страницы в конспекте (1600 px) и что ещё приготовить в фоновом потоке. */
const PHOTO = { side: 1600, q: 0.82 };
const WANT_OFFLINE: Want = { ocr: true, jpegs: [PHOTO] };
const AI_PHOTO = { side: 1800, q: 0.85 };
const WANT_AI: Want = { ocr: false, jpegs: [AI_PHOTO, { side: REFRAIN_SIDE, q: 0.85 }, PHOTO] };
const jpegOf = (prep: Prepared, j: { side: number; q: number }) => prep.jpegs?.[jpegKey(j.side, j.q)] ?? canvasToJpeg(scaleCanvas(prep.color, j.side), j.q);

/**
 * Подготовка: страница на столе → ровный прямоугольник, ровный свет, строки горизонтально (снимок на боку поворачиваем),
 * буквы нужного размера. С 1.32 — в фоновом потоке, если он доступен (textbookOffload.ts).
 */
export async function prepareOffline(p: PageInput, onProgress?: Progress): Promise<Prepared> {
  const job = await prepareOffThread({ file: p.file, rotate: p.rotate, crop: p.crop, split: false, want: WANT_OFFLINE }, onProgress);
  return withCanvas(job.parts[0]);
}

/** Страница вверх ногами (поворот на 180°). */
export function rotatePrepared180(prep: Prepared): Prepared {
  return withCanvas(rotatePixels180(prep));
}

/** Разворот: режем по корешку на левую и правую страницы (с небольшим запасом у корешка). null — это одна страница. */
export function splitSpread(prep: Prepared): [Prepared, Prepared] | null {
  const halves = splitPixels(prep);
  return halves && [withCanvas(halves[0]), withCanvas(halves[1])];
}

/** Убирает «волну» строк, если она есть. */
export function dewarpPrepared(prep: Prepared): Prepared {
  const px = dewarpPixels(prep);
  return px === prep ? prep : withCanvas(px);
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
  const res = await api.ocrRecognize(prep.ocrPng ?? (await grayPng(ocrImage(prep))));
  if (!res.ok) throw new Error(res.error);
  onProgress?.('Собираю абзацы, заголовки и рисунки…', span[1]);
  await tickUi();
  const found = (res.lines as OcrLine[]).filter((l) => l.words?.some((w) => w.text.trim()));
  const good = goodWordCount(found);
  const rev = reversedShare(found) > 0.5;
  // Жирный, рисунки и рамки, резкость — в фоновом потоке; пиксели возвращаются в страницу.
  const an = await analyzeOffThread(prep, found);
  prep.rgba = an.px.rgba;
  prep.gray = an.px.gray;
  const { lines, regions } = an;
  const gray = prep.gray;
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
    sharp: an.sharp,
    moire: 0,
    conf: q.conf,
    unsureShare: q.words ? q.unsure / q.words : 0,
    words: q.words
  };
  facts.cover = an.cover;
  const advice: Advice[] = adviceFor(facts);
  debugHook?.({ info: prep.info, lines, layout, regions, facts: { ...facts, good, rev: rev ? 1 : 0 } as PhotoFacts, advice });
  const page: PageResult = { n: p.n, photo: jpegOf(prep, PHOTO), markdown, figures, doubts, detectedPage: layout.detectedPage, quality: q, advice: advice.length ? advice : undefined };
  return { page, good, empty: !markdown.trim() && !figures.length, rev };
}

const NO_TEXT = 'на фото не нашлось текста. Проверь, что страница видна целиком, резкая и не повёрнута боком (кнопка «Повернуть»).';

/** Страница читается; если текста почти нет — пробуем вверх ногами (снимок мог перевернуться). */
async function readUpright(p: PageInput, prep: Prepared, onProgress?: Progress, span?: [number, number]): Promise<Read & { flipped: boolean }> {
  let r = await readPrepared(p, prep, onProgress, span);
  // Перевёрнутую страницу готовим один раз (в фоновом потоке, пиксели prep уходят туда — дальше нужна только она).
  let flippedRead: Promise<Read> | null = null;
  const readFlipped = () => (flippedRead ??= rotateOffThread(prep, { ...WANT_OFFLINE, jpegs: prep.jpegs?.[jpegKey(PHOTO.side, PHOTO.q)] ? [PHOTO] : [] }).then((x) => readPrepared(p, withCanvas(x), onProgress, span)));
  if (r.rev) {
    // Tesseract сам перевернул страницу: слова пришли справа налево. Поворачиваем снимок и читаем заново.
    const alt = await readFlipped();
    if (!alt.rev && alt.good > r.good * 0.6) return { ...alt, flipped: true };
  }
  if (r.good < 25 || r.page.quality!.conf < 50) {
    const alt = await readFlipped();
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
  // Выпрямление, свет, разрез разворота и «волна» строк — в фоновом потоке; здесь только чтение.
  const job = await prepareOffThread({ file: p.file, rotate: p.rotate, crop: p.crop, split: opts.spread !== false, want: WANT_OFFLINE }, onProgress);
  const halves = job.spread;
  const parts = job.parts;
  const out: PageResult[] = [];
  let flips = 0;
  for (let j = 0; j < parts.length; j++) {
    const span: [number, number] = [0.36 + (0.5 * j) / parts.length, 0.36 + (0.5 * (j + 1)) / parts.length];
    const r = await readUpright(p, withCanvas(parts[j]), onProgress, span);
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
  return { color: c, rgba, gray: rgbaToGray(rgba, c.width, c.height), info: { quad: false, skew: 0, scale: 1, glyph: 0, noise: 0, w: c.width, h: c.height } satisfies PrepInfo };
}

/** Что не так со снимком — для сообщения, когда ИИ ничего не прочитал. */
function photoTrouble(prep: Pick<PreparedPixels, 'gray' | 'info'>): string {
  const f: PhotoFacts = { paper: 255, clipped: 0, inkDepth: 0, glyph: prep.info.glyph, foreshorten: 1, glareShare: 0, ...prep.info.facts, sharp: sharpnessOfText(prep.gray), moire: 0, conf: 0, unsureShare: 1, words: 0 };
  const a = adviceFor(f).filter((x) => x.code !== 'generic');
  return a.length ? ' ' + a.map((x) => x.text).join(' ') : ' Проверь, что страница видна целиком, резкая и хорошо освещена.';
}

/** refrain — та же задача для Refrain ИИ (фото уже уменьшено до 1600 px или текст страниц). */
async function askAi(system: string, text: string, photoUri: string | null, maxTokens: number, refrain?: RefrainFields): Promise<{ ok: true; text: string } | { ok: false; error: string; unavailable?: boolean }> {
  const api = window.mnemaApi;
  if (!api?.aiAsk) return { ok: false, error: 'ИИ-помощник работает в приложении для Windows, Linux, на телефоне и в браузере.' };
  try {
    const r = await api.aiAsk(aiRequest('textbook', { system, text, image: photoUri ? { mime: 'image/jpeg', data: photoUri.split(',')[1] } : undefined, maxTokens, refrain }));
    noteAnswer(r, refrain?.task);
    // unavailable — спросить было некого (нет входа в Refrain ИИ и ключа): остальные страницы просить бессмысленно.
    if (!r.ok) return { ok: false, error: aiError(r), ...(r.signIn || r.noKey ? { unavailable: true } : {}) };
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
export async function recognizeWithAiPages(p: PageInput, o: AiReadOptions, onProgress?: Progress): Promise<{ pages: PageResult[]; direct: boolean; unavailable?: string }> {
  const api = window.mnemaApi;
  if (!api?.aiAsk) throw new Error('ИИ-помощник работает в приложении для Windows, Linux, на телефоне и в браузере.');
  onProgress?.('Готовлю фото…', 0.05);
  // Подготовка (и разрез разворота, и «волна» строк) — в фоновом потоке; не вышло — страница как есть.
  let prep: Pick<PreparedPixels, 'gray' | 'info'>;
  let parts: Part[];
  try {
    const job = await prepareOffThread({ file: p.file, rotate: p.rotate, crop: p.crop, split: !p.crop, want: WANT_AI }, onProgress);
    prep = job.whole;
    parts = job.parts;
  } catch {
    const plain = await plainPrepared(p);
    prep = plain;
    parts = (p.crop ? null : splitPixels(plain)) ?? [plain];
    parts = parts.map(dewarpPixels);
  }
  const direct = o.direct && parts.length === 1 && o.style !== 'verbatim';
  const pages: PageResult[] = [];
  let unavailable: string | undefined;
  for (let j = 0; j < parts.length; j++) {
    const span: [number, number] = [0.15 + (0.8 * j) / parts.length, 0.15 + (0.8 * (j + 1)) / parts.length];
    const part = withCanvas(parts[j]);
    const n = p.n + j;
    const canvas = part.color;
    onProgress?.('Сжимаю фото…', span[0]);
    await tickUi();
    const photo = jpegOf(part, AI_PHOTO);
    await tickUi();
    onProgress?.(parts.length > 1 ? `ИИ читает ${j === 0 ? 'левую' : 'правую'} страницу разворота…` : direct ? 'ИИ делает конспект страницы…' : 'ИИ читает страницу…', span[0]);
    const fallback = async (why: string, quiet = false): Promise<PageResult> => {
      if (!api.ocrRecognize) throw new Error(why);
      onProgress?.(quiet ? 'Читаю без интернета…' : 'ИИ не справился — читаю без интернета…', span[0]);
      const r = await readUpright(p, part, onProgress, span);
      // Причину показывает textbookMessages — одной строкой на все страницы с той же причиной (quiet — та же, что у всего чтения).
      return { ...r.page, n, aiFallback: why };
    };
    if (unavailable) {
      pages.push(await fallback(unavailable, true));
      continue;
    }
    // Refrain ИИ: «Конспект»/«Кратко» сразу по странице или «Дословно» (чтение для свода), фото — 1600 px.
    const refrain: RefrainFields = { task: direct ? (o.style === 'brief' ? 'textbook.brief' : 'textbook.summary') : 'textbook.verbatim', image: { mime: 'image/jpeg', data: jpegOf(part, { side: REFRAIN_SIDE, q: 0.85 }).split(',')[1] }, ...(n ? { page: n } : {}) };
    const ans = await askAi(direct ? pageSystem(o.style) : readSystem(), `Страница учебника${n ? `, номер ${n}` : ''}.${parts.length > 1 ? ` Это ${j === 0 ? 'левая' : 'правая'} страница разворота.` : ''} ${direct ? 'Сделай по ней конспект по правилам.' : 'Переведи её в Markdown по правилам.'} Фото может быть повёрнуто — читай как видишь.`, photo, 6000, refrain);
    if (!ans.ok) {
      if (ans.unavailable) unavailable = ans.error;
      pages.push(await fallback(ans.error, Boolean(ans.unavailable)));
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
    pages.push({ n, photo: jpegOf(part, PHOTO), markdown, figures, doubts: [], detectedPage: parsed.detectedPage, spread: parts.length > 1 ? (j === 0 ? 'left' : 'right') : undefined });
  }
  if (!pages.length) throw new Error('ИИ не нашёл на фото текста учебника.' + photoTrouble(prep));
  if (parts.length > 1) pages[0].note = (pages[0].note ? pages[0].note + ' ' : '') + 'На снимке разворот — страницы прочитаны по очереди, слева направо.';
  return { pages, direct, ...(unavailable ? { unavailable } : {}) };
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
  /** ИИ некому было спросить (нет входа, ключа, не запущен LM Studio): все страницы прочитаны без ИИ, причина — эта. */
  aiDown?: string;
  /** Связный конспект по всем страницам не получился (причина); показан подробный текст страниц. */
  mergeFail?: string;
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
  // ИИ некому отвечать (нет входа и ключа) — остальные страницы сразу без интернета, причина — одной строкой.
  let aiDown = '';
  for (let i = 0; i < inputs.length; i++) {
    if (h.cancelled()) return null;
    const p = inputs[i];
    h.progress(i, 'Готовлю фото…', 0);
    const onP: Progress = (text, frac) => h.progress(i, text, frac);
    try {
      if (o.engine === 'ai' && !aiDown) {
        const r = await recognizeWithAiPages(p, { style: o.style, direct: inputs.length === 1 }, onP);
        results.push(...r.pages.map((pg) => (isScreenshot({ name: p.name, type: p.file.type }) ? { ...pg, screen: true } : pg)));
        lastDirect = r.direct;
        if (r.unavailable) aiDown = r.unavailable;
      } else {
        results.push(...(await recognizeOfflinePages(p, onP)).map((pg) => (isScreenshot({ name: p.name, type: p.file.type }) ? { ...pg, screen: true } : pg)));
      }
    } catch (e) {
      errors.push(`Стр. ${p.n}: ${friendlyOcrError(e)}`);
    }
  }
  if (h.cancelled()) return null;
  applyDetectedPages(results);
  const notes: string[] = [];
  let summary: string | null = null;
  let mergeFail = '';

  if (o.engine === 'ai' && !aiDown && o.style !== 'verbatim' && results.length && !(results.length === 1 && lastDirect)) {
    h.progress(inputs.length - 1, results.length > 1 ? 'ИИ составляет один конспект по всем страницам…' : 'ИИ составляет конспект…', 0.5);
    const why = await mergeWithAi(results, o.style, (t) => h.progress(inputs.length - 1, t, 0.7)).then(
      (r) => (r.ok ? ((summary = r.markdown), '') : r.why),
      (e: Error) => e.message
    );
    if (why) mergeFail = why;
  }
  if (h.cancelled()) return null;
  return { results, errors, summary, notes, ...(aiDown ? { aiDown } : {}), ...(mergeFail ? { mergeFail } : {}) };
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
/** Скриншот, а не фото с камеры: PNG/WebP без «IMG_», или имя «Screenshot…», «Снимок экрана…». */
export function isScreenshot(f: { name?: string; type?: string } | undefined): boolean {
  if (!f) return false;
  const name = f.name ?? '';
  if (/screen ?shot|скриншот|снимок экрана|screen_|Screenshot_/i.test(name)) return true;
  return /image\/(png|webp)/i.test(f.type ?? '') && !/^(IMG|DSC|PXL|photo)[_-]/i.test(name);
}

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
