// Подготовка фото страницы к распознаванию: поиск страницы на столе и выпрямление перспективы,
// выравнивание освещения (тени и градиенты), поиск наклона строк, оценка размера букв.
// Здесь только чистые функции над массивами пикселей (без canvas) — их можно проверять в тестах.

export interface Gray {
  w: number;
  h: number;
  d: Uint8ClampedArray;
}
export interface Pt {
  x: number;
  y: number;
}
/** Углы страницы: левый верхний, правый верхний, правый нижний, левый нижний. */
export type Quad = [Pt, Pt, Pt, Pt];

/** Возвращает управление интерфейсу, когда работа длится дольше ~25 мс, — чтобы окно не зависало. */
export function makeYielder(ms = 25): () => Promise<void> {
  let last = Date.now();
  return async () => {
    if (Date.now() - last < ms) return;
    await new Promise<void>((r) => setTimeout(r, 0));
    last = Date.now();
  };
}

export function rgbaToGray(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const d = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; j < d.length; i += 4, j++) d[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return { w, h, d };
}

/** Уменьшение усреднением по клеткам. */
export function shrinkGray(g: Gray, nw: number, nh: number): Gray {
  nw = Math.max(1, Math.min(nw, g.w));
  nh = Math.max(1, Math.min(nh, g.h));
  const out = new Uint8ClampedArray(nw * nh);
  const sx = g.w / nw;
  const sy = g.h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += g.d[yy * g.w + xx];
      out[y * nw + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return { w: nw, h: nh, d: out };
}

/** Размытие прямоугольным окном (радиус r), по краям — повтор крайних значений. */
export function boxBlur(g: Gray, r: number): Gray {
  if (r < 1) return g;
  const { w, h } = g;
  const tmp = new Float32Array(w * h);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += g.d[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / win;
      s += g.d[row + Math.min(w - 1, x + r + 1)] - g.d[row + Math.max(0, x - r)];
    }
  }
  const out = new Uint8ClampedArray(w * h);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / win;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return { w, h, d: out };
}

/** Порог Оцу: граница между тёмным и светлым. */
export function otsu(g: Gray): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < g.d.length; i++) hist[g.d[i]]++;
  const total = g.d.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) (best = v), (thr = t);
  }
  return thr;
}

// ---------- Страница на столе ----------

/** Наибольшая светлая область (4-связная) → маска. */
function largestBlob(mask: Uint8Array, w: number, h: number): { pts: number[]; area: number } {
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let best: number[] = [];
  let bestArea = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    seen[s] = 1;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) (seen[p - 1] = 1), (queue[tail++] = p - 1);
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) (seen[p + 1] = 1), (queue[tail++] = p + 1);
      if (y > 0 && mask[p - w] && !seen[p - w]) (seen[p - w] = 1), (queue[tail++] = p - w);
      if (y < h - 1 && mask[p + w] && !seen[p + w]) (seen[p + w] = 1), (queue[tail++] = p + w);
    }
    if (tail > bestArea) {
      bestArea = tail;
      best = Array.from(queue.subarray(0, tail));
    }
  }
  return { pts: best, area: bestArea };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Находит страницу на фото: светлый четырёхугольник на более тёмном фоне (стол).
 * Возвращает null, если страница занимает весь кадр или не видна целиком — тогда выпрямлять нечего.
 * Координаты — в пикселях исходной картинки g.
 */
export function findPageQuad(g: Gray): Quad | null {
  const W = 320;
  const k = g.w / W;
  const small = shrinkGray(g, W, Math.max(8, Math.round(g.h / k)));
  const sw = small.w;
  const sh = small.h;
  const blurred = boxBlur(small, 2);
  const thr = otsu(blurred);
  // Страница и стол должны заметно различаться, иначе это не «страница на столе».
  let lo = 0;
  let nlo = 0;
  let hi = 0;
  let nhi = 0;
  for (let i = 0; i < blurred.d.length; i++) {
    if (blurred.d[i] <= thr) (lo += blurred.d[i]), nlo++;
    else (hi += blurred.d[i]), nhi++;
  }
  if (!nlo || !nhi || hi / nhi - lo / nlo < 28) return null;
  const mask = new Uint8Array(sw * sh);
  for (let i = 0; i < mask.length; i++) mask[i] = blurred.d[i] > thr ? 1 : 0;
  const { pts, area } = largestBlob(mask, sw, sh);
  if (area < sw * sh * 0.25) return null;
  let tl = { x: 0, y: 0, v: Infinity };
  let br = { x: 0, y: 0, v: -Infinity };
  let tr = { x: 0, y: 0, v: -Infinity };
  let bl = { x: 0, y: 0, v: Infinity };
  for (const p of pts) {
    const x = p % sw;
    const y = (p - x) / sw;
    if (x + y < tl.v) tl = { x, y, v: x + y };
    if (x + y > br.v) br = { x, y, v: x + y };
    if (x - y > tr.v) tr = { x, y, v: x - y };
    if (x - y < bl.v) bl = { x, y, v: x - y };
  }
  const q: Quad = [tl, tr, br, bl].map((p) => ({ x: (p.x + 0.5) * k, y: (p.y + 0.5) * (g.h / sh) })) as Quad;
  // Угол у самой границы кадра — страница обрезана кадром.
  const mx = g.w * 0.012;
  const my = g.h * 0.012;
  if (q.some((p) => p.x < mx || p.y < my || p.x > g.w - mx || p.y > g.h - my)) return null;
  // Разумный четырёхугольник: стороны не должны отличаться в разы, площадь — заметная доля кадра.
  const top = dist(q[0], q[1]);
  const bottom = dist(q[3], q[2]);
  const left = dist(q[0], q[3]);
  const right = dist(q[1], q[2]);
  if (Math.min(top, bottom, left, right) < Math.min(g.w, g.h) * 0.2) return null;
  if (Math.max(top, bottom) / Math.min(top, bottom) > 1.6 || Math.max(left, right) / Math.min(left, right) > 1.6) return null;
  const aspect = Math.max(top, bottom) / Math.max(left, right);
  if (aspect < 0.35 || aspect > 2.6) return null;
  if (polyArea(q) < g.w * g.h * 0.22) return null;
  if (!isConvex(q)) return null;
  // Чуть внутрь: край страницы и стол за ним нам не нужны.
  const c = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
  const inset = 0.006;
  return q.map((p) => ({ x: p.x + (c.x - p.x) * inset * 2, y: p.y + (c.y - p.y) * inset * 2 })) as Quad;
}

export function polyArea(q: Pt[]): number {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    const n = q[(i + 1) % q.length];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

function isConvex(q: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    const c = q[(i + 2) % q.length];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-6) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Размер выпрямленной страницы по длинам сторон (не больше maxSide по длинной). */
export function quadSize(q: Quad, maxSide = 3200): { w: number; h: number } {
  let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  let h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const k = Math.min(1, maxSide / Math.max(w, h));
  w *= k;
  h *= k;
  return { w: Math.max(2, Math.round(w)), h: Math.max(2, Math.round(h)) };
}

/** Коэффициенты проективного преобразования единичного квадрата в четырёхугольник. */
export function squareToQuad(q: Quad) {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dy1 * dx2;
    g = (dx3 * dy2 - dy3 * dx2) / den;
    h = (dx1 * dy3 - dy1 * dx3) / den;
  }
  return { a: p1.x - p0.x + g * p1.x, b: p3.x - p0.x + h * p3.x, c: p0.x, d: p1.y - p0.y + g * p1.y, e: p3.y - p0.y + h * p3.y, f: p0.y, g, h };
}

/** Точка единичного квадрата (u, v) → точка на фото. */
export function mapQuad(m: ReturnType<typeof squareToQuad>, u: number, v: number): Pt {
  const den = m.g * u + m.h * v + 1;
  return { x: (m.a * u + m.b * v + m.c) / den, y: (m.d * u + m.e * v + m.f) / den };
}

/** Вырезает четырёхугольник из фото в прямоугольник outW×outH (билинейная выборка). */
export async function warpQuad(src: Uint8ClampedArray, sw: number, sh: number, q: Quad, outW: number, outH: number, tick: () => Promise<void> = async () => {}): Promise<Uint8ClampedArray> {
  const m = squareToQuad(q);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const v = (y + 0.5) / outH;
    for (let x = 0; x < outW; x++) {
      const u = (x + 0.5) / outW;
      const den = m.g * u + m.h * v + 1;
      const fx = (m.a * u + m.b * v + m.c) / den - 0.5;
      const fy = (m.d * u + m.e * v + m.f) / den - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const xa = Math.min(sw - 1, Math.max(0, x0));
      const xb = Math.min(sw - 1, Math.max(0, x0 + 1));
      const ya = Math.min(sh - 1, Math.max(0, y0));
      const yb = Math.min(sh - 1, Math.max(0, y0 + 1));
      const i00 = (ya * sw + xa) * 4;
      const i10 = (ya * sw + xb) * 4;
      const i01 = (yb * sw + xa) * 4;
      const i11 = (yb * sw + xb) * 4;
      const o = (y * outW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * tx;
        const bot = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * tx;
        out[o + c] = top + (bot - top) * ty;
      }
    }
    if ((y & 63) === 63) await tick();
  }
  return out;
}

// ---------- Освещение ----------

/**
 * Карта «цвета бумаги»: наибольшая яркость в окрестности (текст тоньше окна, поэтому он не влияет),
 * затем сглаживание. Деление на неё убирает тени и градиенты.
 */
export function paperMap(g: Gray, block: number): Gray {
  const bw = Math.max(1, Math.ceil(g.w / block));
  const bh = Math.max(1, Math.ceil(g.h / block));
  const grid = new Uint8ClampedArray(bw * bh);
  // Берём «почти максимум» (≈ 90-й процентиль по клетке): одиночные яркие шумовые точки не мешают.
  const hist = new Uint32Array(256);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      hist.fill(0);
      let n = 0;
      const y1 = Math.min(g.h, (by + 1) * block);
      const x1 = Math.min(g.w, (bx + 1) * block);
      for (let y = by * block; y < y1; y++) for (let x = bx * block; x < x1; x++) (hist[g.d[y * g.w + x]]++, n++);
      let acc = 0;
      const want = n * 0.12;
      let v = 255;
      for (; v > 0; v--) {
        acc += hist[v];
        if (acc >= want) break;
      }
      grid[by * bw + bx] = v;
    }
  // Клетки, целиком занятые тёмным рисунком, берут яркость соседей — иначе большая заливка «выбелится».
  const bgGrid = boxBlur({ w: bw, h: bh, d: grid }, 1);
  const mx = new Uint8ClampedArray(bw * bh);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m = Math.max(m, bgGrid.d[Math.min(bh - 1, Math.max(0, by + dy)) * bw + Math.min(bw - 1, Math.max(0, bx + dx))]);
      mx[by * bw + bx] = m;
    }
  const sm = boxBlur({ w: bw, h: bh, d: mx }, 1);
  // Увеличение до размера картинки (билинейно, по центрам клеток).
  const out = new Uint8ClampedArray(g.w * g.h);
  for (let y = 0; y < g.h; y++) {
    const fy = (y + 0.5) / block - 0.5;
    const y0 = Math.max(0, Math.min(bh - 1, Math.floor(fy)));
    const y1 = Math.min(bh - 1, y0 + 1);
    const ty = Math.min(1, Math.max(0, fy - y0));
    for (let x = 0; x < g.w; x++) {
      const fx = (x + 0.5) / block - 0.5;
      const x0 = Math.max(0, Math.min(bw - 1, Math.floor(fx)));
      const x1 = Math.min(bw - 1, x0 + 1);
      const tx = Math.min(1, Math.max(0, fx - x0));
      const a = sm.d[y0 * bw + x0] + (sm.d[y0 * bw + x1] - sm.d[y0 * bw + x0]) * tx;
      const b = sm.d[y1 * bw + x0] + (sm.d[y1 * bw + x1] - sm.d[y1 * bw + x0]) * tx;
      out[y * g.w + x] = a + (b - a) * ty;
    }
  }
  return { w: g.w, h: g.h, d: out };
}

/**
 * Выравнивает освещение: бумага становится белой везде, текст остаётся тёмным.
 * Возвращает цветную картинку (с той же поправкой по каналам) и серую для распознавания.
 */
export async function flattenLight(rgba: Uint8ClampedArray, w: number, h: number, tick: () => Promise<void> = async () => {}): Promise<{ color: Uint8ClampedArray; gray: Gray; paper: number }> {
  const g = rgbaToGray(rgba, w, h);
  await tick();
  const block = Math.max(12, Math.round(Math.max(w, h) / 110));
  const bg = paperMap(g, block);
  await tick();
  // «Нормальная» яркость бумаги на всей странице — чтобы тёмные углы не растягивались безгранично.
  const sorted = Uint8ClampedArray.from(bg.d.filter((_, i) => (i & 15) === 0)).sort();
  const paper = sorted[Math.floor(sorted.length * 0.8)] || 255;
  const color = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      const gain = 255 / Math.max(bg.d[j], paper * 0.4, 40);
      const i = j * 4;
      color[i] = rgba[i] * gain;
      color[i + 1] = rgba[i + 1] * gain;
      color[i + 2] = rgba[i + 2] * gain;
      color[i + 3] = 255;
    }
    if ((y & 127) === 127) await tick();
  }
  return { color, gray: rgbaToGray(color, w, h), paper };
}

/** Тёмная бумага в серых тонах: подтягивает контраст текста (светлая бумага → 255, чернила → 0). */
export function stretchContrast(g: Gray, black = 70, white = 235): Gray {
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = ((v - black) / (white - black)) * 255;
  const d = new Uint8ClampedArray(g.d.length);
  for (let i = 0; i < d.length; i++) d[i] = lut[g.d[i]];
  return { w: g.w, h: g.h, d };
}

/** Уровень шума: медиана модуля лапласиана на светлом фоне. */
export function noiseLevel(g: Gray): number {
  const vals: number[] = [];
  for (let y = 2; y < g.h - 2; y += 7)
    for (let x = 2; x < g.w - 2; x += 7) {
      const i = y * g.w + x;
      if (g.d[i] < 200) continue;
      vals.push(Math.abs(4 * g.d[i] - g.d[i - 1] - g.d[i + 1] - g.d[i - g.w] - g.d[i + g.w]));
    }
  if (!vals.length) return 0;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

// ---------- Наклон и размер текста ----------

/** Угол наклона строк (градусы, + — по часовой): при верном угле проекция тёмных точек даёт резкие пики. */
export function skewOf(g: Gray, range = 12): number {
  const W = 640;
  const s = g.w > W ? shrinkGray(g, W, Math.round((g.h * W) / g.w)) : g;
  const xs: number[] = [];
  const ys: number[] = [];
  const thr = 150;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.d[y * s.w + x] < thr) (xs.push(x), ys.push(y));
  if (xs.length < 200) return 0;
  const H = s.h;
  const Wd = s.w;
  const hist = new Float32Array(H + Wd + 2);
  const score = (deg: number) => {
    const t = Math.tan((deg * Math.PI) / 180);
    hist.fill(0);
    for (let i = 0; i < xs.length; i++) {
      const r = Math.round(ys[i] - xs[i] * t) + Wd;
      if (r >= 0 && r < hist.length) hist[r]++;
    }
    let sc = 0;
    for (let i = 0; i < hist.length; i++) sc += hist[i] * hist[i];
    return sc;
  };
  let best = 0;
  let bestS = -1;
  for (let a = -range; a <= range + 0.001; a += 0.4) {
    const sc = score(a);
    if (sc > bestS) (bestS = sc), (best = a);
  }
  for (let a = best - 0.4; a <= best + 0.4001; a += 0.05) {
    const sc = score(a);
    if (sc > bestS) (bestS = sc), (best = a);
  }
  return Math.abs(best) < 0.12 ? 0 : best;
}

/** Медианная высота тёмных связных пятен (≈ высота строчных букв) — чтобы привести текст к удобному для Tesseract размеру. */
export function medianGlyphHeight(g: Gray, thr = 140): number {
  const { w, h, d } = g;
  // Масштабируем, если картинка огромна: считаем на копии не больше ~1800 px по длинной стороне.
  const k = Math.max(w, h) > 1800 ? 1800 / Math.max(w, h) : 1;
  const s = k < 1 ? shrinkGray(g, Math.round(w * k), Math.round(h * k)) : g;
  const sw = s.w;
  const sh = s.h;
  const bin = new Uint8Array(sw * sh);
  for (let i = 0; i < bin.length; i++) bin[i] = s.d[i] < thr ? 1 : 0;
  void d;
  const label = new Int32Array(sw * sh);
  const stack = new Int32Array(sw * sh);
  const heights: number[] = [];
  let n = 0;
  for (let st = 0; st < bin.length; st++) {
    if (!bin[st] || label[st]) continue;
    n++;
    let top = 0;
    stack[top++] = st;
    label[st] = n;
    let minX = sw, maxX = 0, minY = sh, maxY = 0, area = 0; // prettier-ignore
    while (top) {
      const p = stack[--top];
      const x = p % sw;
      const y = (p - x) / sw;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= sw || yy >= sh) continue;
          const q = yy * sw + xx;
          if (bin[q] && !label[q]) (label[q] = n), (stack[top++] = q);
        }
    }
    const ch = maxY - minY + 1;
    const cw = maxX - minX + 1;
    // Похоже на букву: не точка и не длинная линия/рамка, достаточно заполнено.
    if (ch >= 4 && ch <= sh * 0.08 && cw <= ch * 3.2 && area >= ch * 1.2) heights.push(ch);
  }
  if (heights.length < 20) return 0;
  heights.sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)] / k;
}

/** Поворачивает RGBA-картинку на deg градусов (против часовой стрелки на положительный угол не нужен: вызывай с -skew). */
export async function rotateRgba(src: Uint8ClampedArray, w: number, h: number, deg: number, fill: [number, number, number], tick: () => Promise<void> = async () => {}): Promise<Uint8ClampedArray> {
  const out = new Uint8ClampedArray(src.length);
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Обратное отображение: откуда в исходнике берётся точка результата.
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const fx = cos * dx + sin * dy + cx - 0.5;
      const fy = -sin * dx + cos * dy + cy - 0.5;
      const o = (y * w + x) * 4;
      if (fx < -1 || fy < -1 || fx > w || fy > h) {
        out[o] = fill[0];
        out[o + 1] = fill[1];
        out[o + 2] = fill[2];
        out[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const xa = Math.min(w - 1, Math.max(0, x0));
      const xb = Math.min(w - 1, Math.max(0, x0 + 1));
      const ya = Math.min(h - 1, Math.max(0, y0));
      const yb = Math.min(h - 1, Math.max(0, y0 + 1));
      const i00 = (ya * w + xa) * 4;
      const i10 = (ya * w + xb) * 4;
      const i01 = (yb * w + xa) * 4;
      const i11 = (yb * w + xb) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * tx;
        const bot = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * tx;
        out[o + c] = top + (bot - top) * ty;
      }
      out[o + 3] = 255;
    }
    if ((y & 63) === 63) await tick();
  }
  return out;
}
