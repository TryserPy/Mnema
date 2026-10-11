// Жирный шрифт, рисунки и рамки на выровненной странице: чистые функции над массивами пикселей.
import type { Gray } from './textbookImage';

export interface RectPx {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

// ---------- Жирный шрифт ----------

/** Толщина штриха и «чернильность» слова на выровненной серой картинке (бумага ≈ 255, чернила тёмные). */
export function strokeStat(g: Gray, r: RectPx, thr = 140): { stem: number; density: number } {
  const h = r.y1 - r.y0;
  const X0 = Math.max(0, Math.floor(r.x0));
  const X1 = Math.min(g.w, Math.ceil(r.x1));
  const Y0 = Math.max(0, Math.floor(r.y0 + h * 0.4));
  const Y1 = Math.min(g.h, Math.ceil(r.y0 + h * 0.8));
  const runs: number[] = [];
  let dark = 0;
  let all = 0;
  for (let y = Y0; y < Y1; y++) {
    let run = 0;
    for (let x = X0; x < X1; x++) {
      const isDark = g.d[y * g.w + x] < thr;
      all++;
      if (isDark) {
        run++;
        dark++;
      } else if (run) {
        runs.push(run);
        run = 0;
      }
    }
    if (run) runs.push(run);
  }
  // Очень длинные отрезки — перекладины букв, а не штрихи.
  const maxRun = Math.max(4, h * 0.55);
  const stems = runs.filter((x) => x <= maxRun).sort((a, b) => a - b);
  const stem = stems.length ? stems[Math.floor(stems.length / 2)] : 0;
  return { stem, density: all ? dark / all : 0 };
}

// ---------- Рисунки и рамки ----------

export interface RegionsResult {
  figures: RectPx[];
  boxes: RectPx[];
}

/** Расширение маски квадратным окном ±r. */
function dilateGrid(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r < 1) return src;
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let cnt = 0;
    for (let x = 0; x < Math.min(w, r); x++) cnt += src[y * w + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) cnt += src[y * w + x + r];
      if (x - r - 1 >= 0) cnt -= src[y * w + x - r - 1];
      tmp[y * w + x] = cnt > 0 ? 1 : 0;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let cnt = 0;
    for (let y = 0; y < Math.min(h, r); y++) cnt += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) cnt += tmp[(y + r) * w + x];
      if (y - r - 1 >= 0) cnt -= tmp[(y - r - 1) * w + x];
      out[y * w + x] = cnt > 0 ? 1 : 0;
    }
  }
  return out;
}

interface Comp {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cells: number;
}

function labelComps(mask: Uint8Array, w: number, h: number, eight: boolean): { comps: Comp[]; label: Int32Array } {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const comps: Comp[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    const id = comps.length + 1;
    const c: Comp = { x0: w, y0: h, x1: 0, y1: 0, cells: 0 };
    let top = 0;
    stack[top++] = s;
    label[s] = id;
    while (top) {
      const p = stack[--top];
      const x = p % w;
      const y = (p - x) / w;
      c.cells++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || (!eight && dx && dy)) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (mask[q] && !label[q]) (label[q] = id), (stack[top++] = q);
        }
    }
    comps.push(c);
  }
  return { comps, label };
}

const iou = (a: RectPx, b: RectPx) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  const i = w * h;
  return i / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i);
};

/**
 * Рисунки и рамки на выровненной цветной странице. Текст (слова, найденные распознаванием) стирается,
 * остальное «не бумага» собирается в пятна: пятно с содержимым — рисунок, пустая обводка или заливка вокруг текста — рамка.
 */
export function analyzeRegions(rgba: Uint8ClampedArray, g: Gray, textRects: RectPx[], mh: number): RegionsResult {
  const { w: W, h: H } = g;
  const c = 4;
  const gw = Math.ceil(W / c);
  const gh = Math.ceil(H / c);
  const ink = new Uint8Array(gw * gh);
  const cr = new Float32Array(gw * gh);
  const cb = new Float32Array(gw * gh);
  const valid = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++)
    for (let cx = 0; cx < gw; cx++) {
      let n = 0;
      let nInk = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      const y1 = Math.min(H, (cy + 1) * c);
      const x1 = Math.min(W, (cx + 1) * c);
      for (let y = cy * c; y < y1; y++)
        for (let x = cx * c; x < x1; x++) {
          const i = y * W + x;
          const gv = g.d[i];
          const r = rgba[i * 4];
          const gg = rgba[i * 4 + 1];
          const b = rgba[i * 4 + 2];
          const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
          if (gv < 190 || sat > 55) nInk++;
          else if (gv > 205) (n++, (sr += r), (sg += gg), (sb += b));
        }
      const k = cy * gw + cx;
      ink[k] = nInk >= 3 ? 1 : 0;
      if (n >= 8) {
        valid[k] = 1;
        cr[k] = (sr - sg) / n;
        cb[k] = (sb - sg) / n;
      }
    }
  // Текст — стираем.
  const txt = new Uint8Array(gw * gh);
  for (const r of textRects) {
    const x0 = Math.max(0, Math.floor(r.x0 / c) - 1);
    const x1 = Math.min(gw - 1, Math.floor(r.x1 / c) + 1);
    const y0 = Math.max(0, Math.floor(r.y0 / c) - 1);
    const y1 = Math.min(gh - 1, Math.floor(r.y1 / c) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) txt[y * gw + x] = 1;
  }
  const noText = new Uint8Array(gw * gh);
  for (let i = 0; i < noText.length; i++) noText[i] = ink[i] && !txt[i] ? 1 : 0;
  const rd = Math.max(2, Math.round((mh * 0.55) / c));
  const dil = dilateGrid(noText, gw, gh, rd);
  const { comps, label } = labelComps(dil, gw, gh, true);
  const px = (v: number) => v * c;
  const figures: RectPx[] = [];
  const boxes: RectPx[] = [];
  const textPrefix = new Uint32Array((gw + 1) * (gh + 1));
  for (let y = 0; y < gh; y++) {
    let row = 0;
    for (let x = 0; x < gw; x++) {
      row += txt[y * gw + x];
      textPrefix[(y + 1) * (gw + 1) + x + 1] = textPrefix[y * (gw + 1) + x + 1] + row;
    }
  }
  const sum = (x0: number, y0: number, x1: number, y1: number) => textPrefix[(y1 + 1) * (gw + 1) + x1 + 1] - textPrefix[y0 * (gw + 1) + x1 + 1] - textPrefix[(y1 + 1) * (gw + 1) + x0] + textPrefix[y0 * (gw + 1) + x0];
  const minW = Math.max(W * 0.1, mh * 4) / c;
  const minH = (mh * 3.2) / c;
  comps.forEach((cp, idx) => {
    const id = idx + 1;
    const cw = cp.x1 - cp.x0 + 1;
    const ch = cp.y1 - cp.y0 + 1;
    if (cw < minW || ch < minH) return;
    if (cw * ch > gw * gh * 0.6) return;
    let own = 0;
    let inner = 0;
    const mx = Math.max(2, Math.round(cw * 0.04) + rd);
    const my = Math.max(2, Math.round(ch * 0.04) + rd);
    for (let y = cp.y0; y <= cp.y1; y++)
      for (let x = cp.x0; x <= cp.x1; x++) {
        const k = y * gw + x;
        if (label[k] === id && noText[k]) {
          own++;
          if (x >= cp.x0 + mx && x <= cp.x1 - mx && y >= cp.y0 + my && y <= cp.y1 - my) inner++;
        }
      }
    const iw = Math.max(1, cw - 2 * mx);
    const ih = Math.max(1, ch - 2 * my);
    const innerShare = inner / (iw * ih);
    const touches = cp.x0 <= 1 || cp.y0 <= 1 || cp.x1 >= gw - 2 || cp.y1 >= gh - 2;
    if (touches && cw * ch > gw * gh * 0.25) return;
    const textIn = sum(cp.x0, cp.y0, cp.x1, cp.y1) / (cw * ch);
    const rect = { x0: px(cp.x0) - c, y0: px(cp.y0) - c, x1: px(cp.x1 + 1) + c, y1: px(cp.y1 + 1) + c };
    // Обводка с текстом внутри и без собственного содержимого — рамка.
    if (innerShare < 0.004 && own > 0) {
      if (textIn > 0.06) boxes.push(rect);
      return;
    }
    if (own < 14) return;
    figures.push(rect);
  });

  // Заливка: ячейки бумаги другого оттенка, чем остальная страница.
  const vals1: number[] = [];
  const vals2: number[] = [];
  for (let k = 0; k < valid.length; k += 3)
    if (valid[k]) {
      vals1.push(cr[k]);
      vals2.push(cb[k]);
    }
  if (vals1.length > 200) {
    const p1 = median(vals1);
    const p2 = median(vals2);
    const tint = new Uint8Array(gw * gh);
    for (let k = 0; k < tint.length; k++) tint[k] = valid[k] && Math.abs(cr[k] - p1) + Math.abs(cb[k] - p2) >= 13 ? 1 : 0;
    const tdil = dilateGrid(tint, gw, gh, 2);
    const { comps: tc } = labelComps(tdil, gw, gh, false);
    for (const cp of tc) {
      const cw = cp.x1 - cp.x0 + 1;
      const ch = cp.y1 - cp.y0 + 1;
      if (cw < (mh * 6) / c || ch < (mh * 1.8) / c || cw * ch > gw * gh * 0.5) continue;
      let t = 0;
      for (let y = cp.y0; y <= cp.y1; y++) for (let x = cp.x0; x <= cp.x1; x++) t += tint[y * gw + x];
      const textIn = sum(cp.x0, cp.y0, cp.x1, cp.y1) / (cw * ch);
      if (t / (cw * ch) < 0.35 || textIn < 0.05) continue;
      boxes.push({ x0: px(cp.x0), y0: px(cp.y0), x1: px(cp.x1 + 1), y1: px(cp.y1 + 1) });
    }
  }
  const merged: RectPx[] = [];
  for (const b of boxes) {
    const k = merged.findIndex((m) => iou(m, b) > 0.4);
    if (k >= 0) merged[k] = { x0: Math.min(merged[k].x0, b.x0), y0: Math.min(merged[k].y0, b.y0), x1: Math.max(merged[k].x1, b.x1), y1: Math.max(merged[k].y1, b.y1) };
    else merged.push(b);
  }
  return { figures: figures.filter((f) => !merged.some((b) => iou(f, b) > 0.35)), boxes: merged };
}
