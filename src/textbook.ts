// Фото страниц учебника → конспект в Markdown.
// Точный режим — ИИ с зрением возвращает разметку и рамки рисунков.
// Без интернета — Tesseract даёт слова и рамки, а жирный, заголовки, рисунки и рамки
// «Запомните» Мнема восстанавливает сама по картинке.
import { cleanLatex } from './ai';

export interface PageInput {
  id: string;
  file: Blob;
  name: string;
  n: number; // номер страницы
  rotate: 0 | 90 | 180 | 270;
  crop?: Box; // доли 0..1 от повёрнутой картинки
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Figure {
  box: Box; // доли 0..1 на странице
  caption: string;
  uri: string;
}

export interface Doubt {
  id: string;
  text: string;
  crop: string; // data URI кусочка фото
}

export interface PageResult {
  n: number;
  photo: string; // data:image/jpeg (для просмотра и хранения)
  markdown: string; // с метками ⟦РИС:i⟧ и ⟦?:id⟧
  figures: Figure[];
  doubts: Doubt[];
  detectedPage?: number;
}

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
  const full = document.createElement('canvas');
  full.width = rw;
  full.height = rh;
  const fc = full.getContext('2d')!;
  fc.translate(rw / 2, rh / 2);
  fc.rotate((rot * Math.PI) / 180);
  fc.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  bmp.close();
  const c = p.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(c.x * rw);
  const sy = Math.round(c.y * rh);
  const sw = Math.max(1, Math.round(c.w * rw));
  const sh = Math.max(1, Math.round(c.h * rh));
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const out = document.createElement('canvas');
  out.width = Math.round(sw * scale);
  out.height = Math.round(sh * scale);
  const oc = out.getContext('2d')!;
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(full, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

/** Угол наклона текста (в градусах) по профилю строк: при верном угле строки дают резкие пики. */
export function skewAngle(src: HTMLCanvasElement): number {
  const W = 500;
  const scale = W / src.width;
  const H = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  let sum = 0;
  const lum = new Float32Array(W * H);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    lum[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    sum += lum[j];
  }
  const thr = (sum / lum.length) * 0.7;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (lum[y * W + x] < thr) (xs.push(x), ys.push(y));
  if (xs.length < 200) return 0;
  const score = (deg: number) => {
    const t = Math.tan((deg * Math.PI) / 180);
    const hist = new Float32Array(H + W);
    for (let i = 0; i < xs.length; i++) {
      const r = Math.round(ys[i] - xs[i] * t) + W;
      if (r >= 0 && r < hist.length) hist[r]++;
    }
    let sc = 0;
    for (let i = 0; i < hist.length; i++) sc += hist[i] * hist[i];
    return sc;
  };
  let best = 0;
  let bestS = -1;
  for (let a = -6; a <= 6.001; a += 0.25) {
    const sc = score(a);
    if (sc > bestS) (bestS = sc), (best = a);
  }
  for (let a = best - 0.25; a <= best + 0.25; a += 0.05) {
    const sc = score(a);
    if (sc > bestS) (bestS = sc), (best = a);
  }
  return Math.abs(best) < 0.1 ? 0 : best;
}

/** Выровнять страницу, если она снята с наклоном. */
export function deskew(src: HTMLCanvasElement): HTMLCanvasElement {
  const deg = skewAngle(src);
  if (!deg) return src;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d')!;
  // Фон — цвет угла страницы.
  const px = src.getContext('2d')!.getImageData(Math.floor(src.width * 0.5), 2, 1, 1).data;
  ctx.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((-deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

export function canvasToJpeg(c: HTMLCanvasElement, q = 0.82): string {
  return c.toDataURL('image/jpeg', q);
}

async function canvasBytes(c: HTMLCanvasElement, q = 0.9): Promise<Uint8Array> {
  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', q));
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

// ---------- Общая доводка текста ----------

const LAT2CYR: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У', a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у' };

/** Исправляет типичные ошибки распознавания русского текста. */
export function fixOcrText(s: string): string {
  let t = s;
  t = t.replace(/(^|\n)(#+\s*)?\$\s?(\d)/g, '$1$2§ $3'); // «$ 7.» → «§ 7.»
  // Слова из латинских букв-двойников посреди русского текста: «OT» → «от».
  t = t.replace(/(?<=[А-Яа-яЁё][^\n]{0,40}?\s|^)([ABCEHKMOPTXYaceopxy]{1,4})(?=\s+[А-Яа-яЁё])/gm, (w) => [...w].map((ch) => LAT2CYR[ch] ?? ch).join('').toLowerCase());
  // Смешанные слова: кириллица + латинский двойник.
  t = t.replace(/[А-Яа-яЁёA-Za-z]+/g, (w) => (/[А-Яа-яЁё]/.test(w) && /[A-Za-z]/.test(w) && [...w].every((ch) => /[А-Яа-яЁё]/.test(ch) || LAT2CYR[ch]) ? [...w].map((ch) => LAT2CYR[ch] ?? ch).join('') : w));
  // Римские цифры после имени: «Александр П» → «Александр II», «Пётр Т» → «Пётр I».
  t = t.replace(/([А-ЯЁ][а-яё]{2,}\**\s)(П|Ш|Т|Г)(?=[\s.,;:)*]|$)/gm, (_m, a: string, r: string) => a + ({ П: 'II', Ш: 'III', Т: 'I', Г: 'I' } as Record<string, string>)[r]);
  t = t.replace(/\*\*([^*\n]+)\*\* (I{1,3}|IV|VI{0,3}|IX|X{1,3})(?=[\s.,;:)]|$)/gm, '**$1 $2**');
  t = t.replace(/[‐‑]/g, '-');
  // Предлог с большой буквы посреди предложения: «нести повинности В пользу» → «в пользу».
  t = t.replace(/(?<=[а-яё,] )([ВСКОУИА])(?= [а-яё])/g, (m) => m.toLowerCase());
  // Диапазон лет: дефис → тире.
  t = t.replace(/(\b\d{3,4})-(\d{2,4}\b)/g, '$1–$2');
  return t;
}

/** Склеивает строки абзаца, убирая переносы «раз-\nвитие». */
function joinLines(lines: string[]): string {
  let out = '';
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (!out) out = l;
    else if (/[а-яёa-z]-$/i.test(out) && /^[а-яё]/.test(l)) out = out.slice(0, -1) + l;
    else out += ' ' + l;
  }
  return out;
}

const BOX_TITLES = /^(Запомни(те)?|Это важно|Важно|Вывод(ы)?|Главное|Обрати(те)? внимание|Правило)[:!.]?$/i;

// ---------- Без интернета: Tesseract + анализ картинки ----------

interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  conf: number;
}
interface OcrLine {
  bbox: { x0: number; y0: number; x1: number; y1: number };
  para: number;
  words: OcrWord[];
}

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

/** Доля тёмных пикселей в прямоугольнике — чтобы найти жирное и рисунки. */
function inkMap(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  const lum = new Uint8Array(width * height);
  let sum = 0;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const v = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    lum[j] = v;
    sum += v;
  }
  const mean = sum / lum.length;
  const thr = mean * 0.62;
  // Интегральная картинка тёмных пикселей.
  const integ = new Uint32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += lum[y * width + x] < thr ? 1 : 0;
      integ[(y + 1) * (width + 1) + x + 1] = integ[y * (width + 1) + x + 1] + row;
    }
  }
  // «Не фон»: заметно темнее или цветнее фона — для рисунков с заливкой.
  const colorful = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const mx = Math.max(data[i], data[i + 1], data[i + 2]);
    const mn = Math.min(data[i], data[i + 1], data[i + 2]);
    colorful[j] = lum[j] < mean * 0.8 || mx - mn > 60 ? 1 : 0;
  }
  const dark = (x0: number, y0: number, x1: number, y1: number) => {
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(width, Math.ceil(x1));
    y1 = Math.min(height, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return 0;
    const W = width + 1;
    const n = integ[y1 * W + x1] - integ[y0 * W + x1] - integ[y1 * W + x0] + integ[y0 * W + x0];
    return n / ((x1 - x0) * (y1 - y0));
  };
  /** Рамка «не фона» внутри области (для точной обрезки рисунка). */
  const tightBox = (x0: number, y0: number, x1: number, y1: number) => {
    let minX = x1, minY = y1, maxX = x0, maxY = y0; // prettier-ignore
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 2)
      for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 2)
        if (colorful[y * width + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
    return maxX > minX && maxY > minY ? { x0: minX, y0: minY, x1: maxX, y1: maxY } : null;
  };
  const colorShare = (x0: number, y0: number, x1: number, y1: number) => {
    let n = 0;
    let all = 0;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, y1); y += 3)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, x1); x += 3) {
        all++;
        n += colorful[y * width + x];
      }
    return all ? n / all : 0;
  };
  /** Толщина штриха: медиана длин тёмных отрезков по строкам пикселей — у жирного она больше. */
  const strokeWidth = (x0: number, y0: number, x1: number, y1: number) => {
    const runs: number[] = [];
    const X0 = Math.max(0, Math.floor(x0));
    const X1 = Math.min(width, Math.ceil(x1));
    const Y0 = Math.max(0, Math.floor(y0 + (y1 - y0) * 0.2));
    const Y1 = Math.min(height, Math.ceil(y1 - (y1 - y0) * 0.2));
    for (let y = Y0; y < Y1; y += 2) {
      let run = 0;
      for (let x = X0; x < X1; x++) {
        if (lum[y * width + x] < thr) run++;
        else if (run) {
          runs.push(run);
          run = 0;
        }
      }
      if (run) runs.push(run);
    }
    return median(runs);
  };
  return { dark, tightBox, colorShare, strokeWidth, width, height };
}

export async function recognizeOffline(p: PageInput, onProgress?: (t: string) => void): Promise<PageResult> {
  const api = window.mnemaApi;
  if (!api?.ocrRecognize) throw new Error('Распознавание без интернета работает в приложении для Windows.');
  onProgress?.('Выравниваю страницу…');
  const canvas = deskew(await renderPage(p, 2200));
  onProgress?.('Читаю текст…');
  const res = await api.ocrRecognize(await canvasBytes(canvas));
  if (!res.ok) throw new Error(res.error);
  onProgress?.('Собираю страницу…');
  const lines = (res.lines as OcrLine[]).filter((l) => l.words.some((w) => w.text.trim()));
  lines.sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const ink = inkMap(canvas);
  const heights = lines.map((l) => l.bbox.y1 - l.bbox.y0);
  const mh = median(heights) || 20;
  const mwh = median(lines.flatMap((l) => l.words.map((w) => w.bbox.y1 - w.bbox.y0))) || mh;
  const left = median(lines.map((l) => l.bbox.x0));

  // Жирное: штрихи букв заметно толще обычных на этой странице.
  const sw = (w: OcrWord) => ink.strokeWidth(w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1);
  const normal = median(lines.flatMap((l) => l.words.filter((w) => w.text.replace(/[^\p{L}]/gu, '').length > 2).map(sw))) || 3;
  const isBold = (w: OcrWord) => {
    const v = sw(w);
    return v >= normal * 1.3 && v - normal >= 1;
  };

  const doubts: Doubt[] = [];
  const figures: Figure[] = [];
  let detectedPage: number | undefined;

  // Номер страницы: одиночное число внизу или вверху.
  const edge = lines.filter((l) => l.words.length === 1 && /^\d{1,4}$/.test(l.words[0].text.trim()) && (l.bbox.y0 > canvas.height * 0.88 || l.bbox.y1 < canvas.height * 0.08));
  if (edge.length) detectedPage = Number(edge[edge.length - 1].words[0].text.trim());
  const content = lines.filter((l) => !edge.includes(l));

  // Рисунки: большие промежутки между строками, где есть «не фон».
  const blocks: ({ kind: 'line'; line: OcrLine } | { kind: 'fig'; idx: number })[] = [];
  let prevBottom = 0;
  for (const l of content) {
    const gap = l.bbox.y0 - prevBottom;
    if (gap > mh * 3.2) {
      const region = { x0: 0, y0: prevBottom + mh * 0.4, x1: canvas.width, y1: l.bbox.y0 - mh * 0.3 };
      const share = ink.colorShare(region.x0, region.y0, region.x1, region.y1);
      if (share > 0.012) {
        const tb = ink.tightBox(Math.round(region.x0), Math.round(region.y0), Math.round(region.x1), Math.round(region.y1));
        if (tb && tb.x1 - tb.x0 > canvas.width * 0.12 && tb.y1 - tb.y0 > mh * 2.5) {
          const pad = 8;
          const box = { x: (tb.x0 - pad) / canvas.width, y: (tb.y0 - pad) / canvas.height, w: (tb.x1 - tb.x0 + pad * 2) / canvas.width, h: (tb.y1 - tb.y0 + pad * 2) / canvas.height };
          figures.push({ box, caption: '', uri: cropUri(canvas, box) });
          blocks.push({ kind: 'fig', idx: figures.length - 1 });
        }
      }
    }
    blocks.push({ kind: 'line', line: l });
    prevBottom = l.bbox.y1;
  }

  // Обычный промежуток между строками — чтобы отличить новый абзац.
  const gaps: number[] = [];
  for (let i = 1; i < content.length; i++) {
    const g = content[i].bbox.y0 - content[i - 1].bbox.y1;
    if (g > 0 && g < mh * 2) gaps.push(g);
  }
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const lineGap = sortedGaps[Math.floor(sortedGaps.length * 0.25)] || mh * 0.4;

  // Строки → абзацы.
  const out: string[] = [];
  let cur: { lines: string[]; para: number; heading: boolean; box: boolean; caption: boolean; bottom: number } | null = null;
  let inBox = false;
  const flush = () => {
    if (!cur) return;
    let text = joinLines(cur.lines);
    text = text.replace(/\*\*\s+\*\*/g, ' ').replace(/\*\*([^*]+)\*\*\s*\*\*([^*]+)\*\*/g, '**$1 $2**');
    if (cur.heading) out.push('## ' + text.replace(/\*\*/g, ''));
    else if (cur.caption) {
      const f = figures.length ? figures[figures.length - 1] : null;
      if (f && !f.caption) f.caption = text.replace(/\*+/g, '');
      else out.push('*' + text.replace(/\*+/g, '') + '*');
    } else if (cur.box) out.push('> ' + text);
    else out.push(text);
    cur = null;
  };
  for (const b of blocks) {
    if (b.kind === 'fig') {
      flush();
      inBox = false;
      out.push(`⟦РИС:${b.idx}⟧`);
      continue;
    }
    const l = b.line;
    const h = l.bbox.y1 - l.bbox.y0;
    const words = l.words.map((w) => {
      let t = w.text.trim();
      if (!t) return '';
      const bold = w.text.trim().length > 1 && isBold(w);
      if (w.conf < 62 && t.replace(/[^\p{L}]/gu, '').length > 2) {
        const id = 'd' + doubts.length;
        const pad = 6;
        doubts.push({ id, text: t, crop: cropUri(canvas, { x: (w.bbox.x0 - pad * 4) / canvas.width, y: (w.bbox.y0 - pad) / canvas.height, w: (w.bbox.x1 - w.bbox.x0 + pad * 8) / canvas.width, h: (w.bbox.y1 - w.bbox.y0 + pad * 2) / canvas.height }, 'image/png', 600) });
        t = `⟦?:${id}⟧`;
      }
      return bold ? `**${t}**` : t;
    });
    const text = words.filter(Boolean).join(' ');
    const plainText = l.words.map((w) => w.text).join(' ').trim();
    const wordH = median(l.words.map((w) => w.bbox.y1 - w.bbox.y0));
    const allBold = words.length > 0 && words.every((w) => !w || /^\*\*.*\*\*$/.test(w));
    const heading: boolean = plainText.length < 90 && (h > mh * 1.3 || wordH > mwh * 1.25 || (allBold && !cur && plainText.length < 70 && !/[.,;]$/.test(plainText)));
    const caption = /^(Рис(унок)?\.?|Схема|Таблица|Табл\.)\s*\d/i.test(plainText);
    const boxTitle = BOX_TITLES.test(plainText.replace(/[*]/g, ''));
    const gap = cur ? l.bbox.y0 - cur.bottom : 0;
    const indent = l.bbox.x0 - left > mh * 0.8;
    const endsSentence = cur ? /[.!?:»)]\**$/.test(cur.lines[cur.lines.length - 1] ?? '') : false;
    const newPara = !cur || cur.para !== l.para || (gap > Math.max(lineGap * 1.55, lineGap + mh * 0.25) && endsSentence) || gap > lineGap * 2.6 || heading || cur.heading || caption || boxTitle || (indent && cur.lines.length > 0 && /[.!?:»]$/.test(cur.lines[cur.lines.length - 1]));
    if (boxTitle) {
      flush();
      inBox = true;
      out.push(`> **${plainText.replace(/[:!.]$/, '')}:**`);
      continue;
    }
    if (inBox && gap > mh * 1.4) inBox = false;
    if (newPara) {
      flush();
      cur = { lines: [], para: l.para, heading, box: inBox, caption, bottom: l.bbox.y1 };
    }
    cur!.lines.push(text);
    cur!.bottom = l.bbox.y1;
  }
  flush();
  // Заголовок рамки и её текст — одним блоком цитаты.
  let md = out.join('\n\n').replace(/(> \*\*[^\n]+:\*\*)\n\n> /g, '$1 ');
  md = fixOcrText(md);
  return { n: p.n, photo: canvasToJpeg(scaleCanvas(canvas, 1600)), markdown: md, figures, doubts, detectedPage };
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

// ---------- Точный режим: ИИ ----------

const AI_SYSTEM = `Ты переводишь фото страницы школьного учебника в Markdown для конспекта ученика.
Правила:
- Текст переписывай дословно, ничего не пересказывай и не добавляй. Переносы слов убирай.
- Заголовки — «## », подзаголовки — «### ».
- Жирный — **…**, курсив — *…* (как в учебнике).
- Списки — «- » или «1. ». Таблицы — таблицами Markdown.
- Формулы — LaTeX в $…$, отдельной строкой — $$…$$. Химические формулы тоже: $H_2O$.
- Рамки «Запомните», «Это важно», «Вывод» и т. п. — цитатой: «> **Запомните:** текст».
- Рисунки, схемы, графики, карты, фото НЕ описывай. Вместо каждого вставь отдельной строкой [[РИСУНОК x1 y1 x2 y2 | подпись]], где x1 y1 x2 y2 — рамка самого рисунка (без подписи) в тысячных долях ширины и высоты фото (0–1000), подпись — текст подписи под рисунком, если есть (отдельно её тогда не пиши).
- Колонтитулы и номер страницы в текст не пиши. Если номер страницы виден, в самом конце добавь строку [[СТРАНИЦА N]].
- Если текст не виден или это не страница учебника, верни [[ПУСТО]].
Верни только Markdown, без \`\`\` и без пояснений.`;

export async function recognizeWithAi(p: PageInput, onProgress?: (t: string) => void): Promise<PageResult> {
  const api = window.mnemaApi;
  if (!api?.aiAsk) throw new Error('ИИ-помощник работает в приложении для Windows.');
  const canvas = await renderPage(p, 1800);
  const photo = canvasToJpeg(canvas, 0.85);
  onProgress?.('ИИ читает страницу…');
  const r = await api.aiAsk({ system: AI_SYSTEM, text: `Страница учебника${p.n ? `, номер ${p.n}` : ''}. Переведи её в Markdown по правилам.`, image: { mime: 'image/jpeg', data: photo.split(',')[1] }, maxTokens: 5000 });
  if (!r.ok) throw new Error(r.error);
  let md = r.text.trim().replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '');
  if (/\[\[ПУСТО\]\]/.test(md) && md.length < 40) throw new Error('ИИ не нашёл на фото текста учебника.');
  let detectedPage: number | undefined;
  md = md.replace(/\[\[СТРАНИЦА\s+(\d{1,4})\]\]/g, (_m, n: string) => {
    detectedPage = Number(n);
    return '';
  });
  const figures: Figure[] = [];
  md = md.replace(/\[\[РИСУНОК\s+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)\s*(?:\|\s*([^\]]*))?\]\]/g, (_m, a, b, c, d, cap?: string) => {
    let [x1, y1, x2, y2] = [a, b, c, d].map(Number);
    // Модели иногда отдают доли 0–1 — поправим.
    if (Math.max(x1, y1, x2, y2) <= 1.001) [x1, y1, x2, y2] = [x1, y1, x2, y2].map((v) => v * 1000);
    const pad = 12;
    const box = { x: Math.max(0, (Math.min(x1, x2) - pad) / 1000), y: Math.max(0, (Math.min(y1, y2) - pad) / 1000), w: 0, h: 0 };
    box.w = Math.min(1 - box.x, (Math.abs(x2 - x1) + pad * 2) / 1000);
    box.h = Math.min(1 - box.y, (Math.abs(y2 - y1) + pad * 2) / 1000);
    if (box.w < 0.03 || box.h < 0.03) return '';
    figures.push({ box, caption: (cap ?? '').trim(), uri: cropUri(canvas, box) });
    return `\n\n⟦РИС:${figures.length - 1}⟧\n\n`;
  });
  md = md.replace(/\\\(([\s\S]+?)\\\)/g, (_m, t: string) => `$${cleanLatex(t)}$`).replace(/\\\[([\s\S]+?)\\\]/g, (_m, t: string) => `$$${cleanLatex(t)}$$`);
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return { n: p.n, photo: canvasToJpeg(await renderPage(p, 1600)), markdown: md, figures, doubts: [], detectedPage };
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

// ---------- Сборка конспекта ----------

/** Страницы → итоговый Markdown: метки [стр. N], рисунки, исправленные слова, склейка абзацев. */
export function assemble(pages: PageResult[], fixes: Record<string, string>): string {
  const parts: string[] = [];
  for (const p of pages) {
    let md = p.markdown.replace(/⟦\?:(\w+)⟧/g, (_m, id: string) => fixes[`${p.n}:${id}`] ?? p.doubts.find((d) => d.id === id)?.text ?? '');
    md = md.replace(/⟦РИС:(\d+)⟧/g, (_m, i: string) => {
      const f = p.figures[Number(i)];
      if (!f) return '';
      const cap = f.caption.replace(/[[\]]/g, '');
      return `![${cap || 'Рисунок'}](${f.uri})` + (cap ? `\n\n*${cap}*` : '');
    });
    md = md.trim();
    if (!md) continue;
    // Абзац, разорванный между страницами, склеиваем.
    const prev = parts[parts.length - 1];
    const first = md.split('\n\n')[0];
    if (prev && /[а-яёa-z,\-–—]$/i.test(prev.trimEnd()) && /^[а-яё]/.test(first) && !/^[#>!*-]/.test(first)) {
      const joined = /[а-яё]-$/i.test(prev.trimEnd()) ? prev.trimEnd().slice(0, -1) + first : prev.trimEnd() + ' ' + first;
      parts[parts.length - 1] = joined;
      md = md.slice(first.length).trim();
      parts.push(`[стр. ${p.n}]`);
      if (md) parts.push(md);
      continue;
    }
    parts.push(`[стр. ${p.n}]`);
    parts.push(md);
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
