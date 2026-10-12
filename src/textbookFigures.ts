// Рисунки от ИИ: рамка из ответа бывает неточной (с полями, обрезанная, со лишним), поэтому её уточняем по пикселям:
// обрезаем однотонные поля, расширяем до краёв рисунка, выбрасываем мелкие и декоративные, убираем повторы и ровняем подписи.
// Чистые функции над RGBA (без canvas) — их проверяют тесты (v130-textbook.test.ts).
import type { Box } from './textbookText';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** «Чернила» в области вокруг рамки: пиксель заметно отличается от бумаги. */
interface InkMap {
  x0: number; // область в координатах выборки
  y0: number;
  w: number;
  h: number;
  step: number; // шаг выборки в пикселях изображения
  /** Интегральное изображение (w+1)×(h+1): сколько «чернил» в прямоугольнике. */
  sum: Uint32Array;
}

function inkMap(rgba: Uint8ClampedArray, W: number, H: number, region: { x0: number; y0: number; x1: number; y1: number }): InkMap {
  const step = Math.max(1, Math.floor(Math.max(W, H) / 1100));
  const x0 = Math.floor(region.x0 / step);
  const y0 = Math.floor(region.y0 / step);
  const w = Math.max(1, Math.floor(region.x1 / step) - x0);
  const h = Math.max(1, Math.floor(region.y1 / step) - y0);
  // Бумага — самые светлые пиксели области (их средний цвет).
  const lum: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (clamp((y0 + y) * step, 0, H - 1) * W + clamp((x0 + x) * step, 0, W - 1)) * 4;
      lum.push(rgba[i] * 0.3 + rgba[i + 1] * 0.59 + rgba[i + 2] * 0.11);
    }
  const sorted = lum.slice().sort((a, b) => a - b);
  const cut = sorted[Math.floor(sorted.length * 0.85)] ?? 255;
  let pr = 0;
  let pg = 0;
  let pb = 0;
  let pn = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (lum[y * w + x] < cut) continue;
      const i = (clamp((y0 + y) * step, 0, H - 1) * W + clamp((x0 + x) * step, 0, W - 1)) * 4;
      pr += rgba[i];
      pg += rgba[i + 1];
      pb += rgba[i + 2];
      pn++;
    }
  if (pn) (pr /= pn), (pg /= pn), (pb /= pn);
  else (pr = pg = pb = 255);
  const sum = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = (clamp((y0 + y) * step, 0, H - 1) * W + clamp((x0 + x) * step, 0, W - 1)) * 4;
      const d = Math.max(Math.abs(rgba[i] - pr), Math.abs(rgba[i + 1] - pg), Math.abs(rgba[i + 2] - pb));
      row += d > 38 ? 1 : 0;
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  return { x0, y0, w, h, step, sum };
}

function inkIn(m: InkMap, x0: number, y0: number, x1: number, y1: number): number {
  const W = m.w + 1;
  x0 = clamp(x0 - m.x0, 0, m.w);
  x1 = clamp(x1 - m.x0, 0, m.w);
  y0 = clamp(y0 - m.y0, 0, m.h);
  y1 = clamp(y1 - m.y0, 0, m.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  return m.sum[y1 * W + x1] - m.sum[y0 * W + x1] - m.sum[y1 * W + x0] + m.sum[y0 * W + x0];
}

export interface Refined {
  box: Box;
  /** Доля «чернил» внутри рамки (0..1): у пустой рамки около нуля. */
  ink: number;
}

/**
 * Уточняет рамку рисунка по пикселям. null — внутри рамки почти ничего нет (ИИ ошибся адресом).
 * 1) срезаем пустые поля со всех сторон; 2) если рисунок упирается в край рамки (обрезан) — расширяем, пока он продолжается
 * (до первой пустой строки или столбца, не дальше 18% размера рамки); 3) оставляем небольшой запас.
 */
export function refineFigureBox(rgba: Uint8ClampedArray, W: number, H: number, box: Box): Refined | null {
  const px = { x0: box.x * W, y0: box.y * H, x1: (box.x + box.w) * W, y1: (box.y + box.h) * H };
  const growX = (px.x1 - px.x0) * 0.18;
  const growY = (px.y1 - px.y0) * 0.18;
  const region = { x0: clamp(px.x0 - growX, 0, W), y0: clamp(px.y0 - growY, 0, H), x1: clamp(px.x1 + growX, 0, W), y1: clamp(px.y1 + growY, 0, H) };
  const m = inkMap(rgba, W, H, region);
  const s = m.step;
  const R = { x0: m.x0, y0: m.y0, x1: m.x0 + m.w, y1: m.y0 + m.h };
  let x0 = clamp(Math.round(px.x0 / s), R.x0, R.x1 - 1);
  let y0 = clamp(Math.round(px.y0 / s), R.y0, R.y1 - 1);
  let x1 = clamp(Math.round(px.x1 / s), x0 + 1, R.x1);
  let y1 = clamp(Math.round(px.y1 / s), y0 + 1, R.y1);
  const EMPTY = 0.004;
  // Доля чернил в узкой полосе: тонкая полоска (шаг выборки не меньше одной клетки).
  const rowF = (y: number) => inkIn(m, x0, y, x1, y + 1) / Math.max(1, x1 - x0);
  const colF = (x: number) => inkIn(m, x, y0, x + 1, y1) / Math.max(1, y1 - y0);
  const origW = x1 - x0;
  const origH = y1 - y0;
  for (let pass = 0; pass < 2; pass++) {
    // 1. срезаем пустое
    while (y1 - y0 > 2 && rowF(y0) < EMPTY) y0++;
    while (y1 - y0 > 2 && rowF(y1 - 1) < EMPTY) y1--;
    while (x1 - x0 > 2 && colF(x0) < EMPTY) x0++;
    while (x1 - x0 > 2 && colF(x1 - 1) < EMPTY) x1--;
    // 2. рисунок упирается в край — продолжаем (тонкий запас: 2 клетки у края)
    const touch = (a: number, b: number, c: number, d: number) => inkIn(m, a, b, c, d) / Math.max(1, (c - a) * (d - b)) > 0.012;
    const maxY = Math.max(4, Math.round(origH * 0.18));
    const maxX = Math.max(4, Math.round(origW * 0.18));
    let g = 0;
    if (touch(x0, y0, x1, Math.min(y1, y0 + 2))) while (g++ < maxY && y0 > R.y0 && rowF(y0 - 1) >= EMPTY) y0--;
    g = 0;
    if (touch(x0, Math.max(y0, y1 - 2), x1, y1)) while (g++ < maxY && y1 < R.y1 && rowF(y1) >= EMPTY) y1++;
    g = 0;
    if (touch(x0, y0, Math.min(x1, x0 + 2), y1)) while (g++ < maxX && x0 > R.x0 && colF(x0 - 1) >= EMPTY) x0--;
    g = 0;
    if (touch(Math.max(x0, x1 - 2), y0, x1, y1)) while (g++ < maxX && x1 < R.x1 && colF(x1) >= EMPTY) x1++;
  }
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  const ink = inkIn(m, x0, y0, x1, y1) / area;
  if (ink < 0.006) return null;
  // запас, чтобы рамка рисунка не резала линии
  const padX = Math.max(6, W * 0.008);
  const padY = Math.max(6, H * 0.008);
  const fx0 = clamp(x0 * s - padX, 0, W);
  const fy0 = clamp(y0 * s - padY, 0, H);
  const fx1 = clamp(x1 * s + padX, 0, W);
  const fy1 = clamp(y1 * s + padY, 0, H);
  return { box: { x: fx0 / W, y: fy0 / H, w: (fx1 - fx0) / W, h: (fy1 - fy0) / H }, ink };
}

/** Рисунок слишком мелкий или похож на украшение (тонкая линия, рамка, значок). */
export function isDecorative(box: Box, ink: number, pageW: number, pageH: number): boolean {
  const wpx = box.w * pageW;
  const hpx = box.h * pageH;
  const area = box.w * box.h;
  if (area < 0.012) return true; // меньше ~1% страницы
  if (box.w < 0.07 || box.h < 0.035) return true;
  const aspect = Math.max(wpx / Math.max(1, hpx), hpx / Math.max(1, wpx));
  if (aspect > 9) return true; // линия-разделитель
  if (ink < 0.01) return true; // почти пусто
  return false;
}

function iou(a: Box, b: Box): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
}

/** Подпись под рисунком: чистый текст, «Рис. 12. Название». Без подписи — пусто. */
export function normalizeCaption(raw: string): string {
  let c = raw.replace(/[*_`[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!c) return '';
  // «Рис 12 название», «рис.12 - название», «12. Название» → «Рис. 12. Название»
  const m = /^(рис(?:унок)?|табл(?:ица)?|схема|график|карта|фото)\.?\s*(\d+(?:\.\d+)?)?\s*[.:–—-]?\s*(.*)$/i.exec(c);
  if (m) {
    const kind = /^рис/i.test(m[1]) ? 'Рис.' : /^табл/i.test(m[1]) ? 'Табл.' : m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + '.';
    c = [kind, m[2] ? m[2] + '.' : '', m[3]].filter(Boolean).join(' ').replace(/\.\s*\.$/, '.');
    // «Рис. 12.» без названия — оставляем как есть
  }
  return c.length > 160 ? c.slice(0, 157).trimEnd() + '…' : c;
}

export interface RawFigure {
  box: Box;
  caption: string;
}
export interface TidyResult {
  /** Оставленные рисунки в прежнем порядке. */
  figures: RawFigure[];
  /** Исходный номер → новый номер рисунка (-1 — выброшен; повтор указывает на оставленный): по нему правим метки в тексте. */
  map: number[];
  /** Сколько выброшено. */
  dropped: number;
}

/**
 * Рисунки от ИИ → уточнённые, без мелких и декоративных, без повторов. map[i] — новый номер исходного рисунка.
 * Если уточнить не вышло (пустая рамка) — рисунок выбрасываем: в конспекте лучше без него, чем с чистым листом.
 */
export function tidyFigures(rgba: Uint8ClampedArray, W: number, H: number, figs: RawFigure[]): TidyResult {
  const out: RawFigure[] = [];
  const map: number[] = [];
  figs.forEach((f) => {
    const r = refineFigureBox(rgba, W, H, f.box);
    if (!r || isDecorative(r.box, r.ink, W, H)) {
      map.push(-1);
      return;
    }
    // повтор: почти та же рамка уже есть
    const twin = out.findIndex((o) => iou(o.box, r.box) > 0.6);
    if (twin >= 0) {
      if (!out[twin].caption && f.caption) out[twin].caption = normalizeCaption(f.caption);
      map.push(twin);
      return;
    }
    out.push({ box: r.box, caption: normalizeCaption(f.caption) });
    map.push(out.length - 1);
  });
  return { figures: out, map, dropped: map.filter((x) => x < 0).length };
}

/** После уточнения рисунков правим метки ⟦РИС:i⟧ в тексте: выброшенные убираем, повторы одного рисунка оставляем один раз. */
export function remapFigureMarks(md: string, map: number[]): string {
  const seen = new Set<number>();
  return md
    .replace(/⟦РИС:(\d+)⟧/g, (_m, i: string) => {
      const to = map[Number(i)];
      if (to === undefined || to < 0 || seen.has(to)) return '';
      seen.add(to);
      return `⟦РИС:${to}⟧`;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
