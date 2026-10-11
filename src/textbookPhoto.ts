// Снимок «как в жизни»: разворот из двух страниц, снимок на боку и вверх ногами, «волна» строк, размытие, темно, блики, мелко.
// Только чистые функции над массивами пикселей (без canvas) — их проверяют тесты (v130-textbook.test.ts).
// Порядок работы (см. textbook.ts): страница выпрямлена и освещение выровнено → направление строк → разворот → «волна» → чтение.
import { boxBlur, rgbaToGray, shrinkGray, type Gray } from './textbookImage';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function percentile(a: ArrayLike<number>, p: number): number {
  if (!a.length) return 0;
  const s = Array.from(a).sort((x, y) => x - y);
  return s[clamp(Math.floor(s.length * p), 0, s.length - 1)];
}

/** Карта «чернил» на уменьшенной картинке: пиксель темнее бумаги заметно (бумага — верхний процентиль яркости). */
export function smallInk(g: Gray, maxSide = 700): { w: number; h: number; ink: Uint8Array; paper: number } {
  const k = Math.min(1, maxSide / Math.max(g.w, g.h));
  const s = k < 1 ? shrinkGray(g, Math.max(1, Math.round(g.w * k)), Math.max(1, Math.round(g.h * k))) : g;
  const paper = percentile(s.d.length > 60000 ? s.d.filter((_, i) => (i & 3) === 0) : s.d, 0.9) || 255;
  const thr = paper * 0.8;
  const ink = new Uint8Array(s.w * s.h);
  for (let i = 0; i < ink.length; i++) ink[i] = s.d[i] < thr ? 1 : 0;
  return { w: s.w, h: s.h, ink, paper };
}

// ---------- Направление строк: горизонтально или снимок лёг на бок ----------

/** Суммарное изменение профиля, нормированное на его «массу»: у строк текста профиль то высокий, то нулевой. */
function lineScore(profile: number[]): number {
  let tv = 0;
  let sum = 0;
  for (let i = 0; i < profile.length; i++) {
    sum += profile[i];
    if (i) tv += Math.abs(profile[i] - profile[i - 1]);
  }
  return sum > 0 ? tv / sum : 0;
}

/**
 * Куда идут строки текста: 'h' — слева направо (обычный снимок или вверх ногами), 'v' — снимок лёг на бок.
 * Ink размывается вдоль предполагаемой строки, и смотрим, где профиль «полосатый».
 */
export function textDirection(g: Gray): { dir: 'h' | 'v'; hScore: number; vScore: number } {
  const { w, h, ink } = smallInk(g);
  const rh = Math.max(3, Math.round(w * 0.025));
  const rv = Math.max(3, Math.round(h * 0.025));
  // Горизонтальное размытие: доля чернил в окне; «строка» там, где она заметна.
  const hMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    const row = y * w;
    for (let x = 0; x < Math.min(w, rh); x++) s += ink[row + x];
    for (let x = 0; x < w; x++) {
      if (x + rh < w) s += ink[row + x + rh];
      if (x - rh - 1 >= 0) s -= ink[row + x - rh - 1];
      const n = Math.min(w - 1, x + rh) - Math.max(0, x - rh) + 1;
      hMask[row + x] = s / n > 0.12 ? 1 : 0;
    }
  }
  const vMask = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = 0; y < Math.min(h, rv); y++) s += ink[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + rv < h) s += ink[(y + rv) * w + x];
      if (y - rv - 1 >= 0) s -= ink[(y - rv - 1) * w + x];
      const n = Math.min(h - 1, y + rv) - Math.max(0, y - rv) + 1;
      vMask[y * w + x] = s / n > 0.12 ? 1 : 0;
    }
  }
  const rows: number[] = new Array(h).fill(0);
  const cols: number[] = new Array(w).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) (rows[y] += hMask[y * w + x] / w), (cols[x] += vMask[y * w + x] / h);
  const hScore = lineScore(rows);
  const vScore = lineScore(cols);
  // Уверенно «на боку» только при явном перевесе; сомнения решает чтение (линии Tesseract стоят вертикально или нет).
  return { dir: vScore > hScore * 1.5 ? 'v' : 'h', hScore, vScore };
}

// ---------- Повороты на 90° ----------

/** Поворот серой картинки по часовой стрелке на q·90°. */
export function rotateGrayQ(g: Gray, q: number): Gray {
  q = ((q % 4) + 4) % 4;
  if (q === 0) return g;
  const { w, h } = g;
  if (q === 2) {
    const d = new Uint8ClampedArray(g.d.length);
    for (let i = 0; i < d.length; i++) d[i] = g.d[d.length - 1 - i];
    return { w, h, d };
  }
  const d = new Uint8ClampedArray(g.d.length);
  const nw = h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // q=1: (x, y) → (h-1-y, x); q=3: (x, y) → (y, w-1-x)
      const nx = q === 1 ? h - 1 - y : y;
      const ny = q === 1 ? x : w - 1 - x;
      d[ny * nw + nx] = g.d[y * w + x];
    }
  return { w: h, h: w, d };
}

/** То же для RGBA. */
export function rotateRgbaQ(rgba: Uint8ClampedArray, w: number, h: number, q: number): { data: Uint8ClampedArray; w: number; h: number } {
  q = ((q % 4) + 4) % 4;
  if (q === 0) return { data: rgba, w, h };
  const out = new Uint8ClampedArray(rgba.length);
  if (q === 2) {
    for (let i = 0; i < w * h; i++) {
      const j = (w * h - 1 - i) * 4;
      out[i * 4] = rgba[j];
      out[i * 4 + 1] = rgba[j + 1];
      out[i * 4 + 2] = rgba[j + 2];
      out[i * 4 + 3] = rgba[j + 3];
    }
    return { data: out, w, h };
  }
  const nw = h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = q === 1 ? h - 1 - y : y;
      const ny = q === 1 ? x : w - 1 - x;
      const o = (ny * nw + nx) * 4;
      const s = (y * w + x) * 4;
      out[o] = rgba[s];
      out[o + 1] = rgba[s + 1];
      out[o + 2] = rgba[s + 2];
      out[o + 3] = rgba[s + 3];
    }
  return { data: out, w: h, h: w };
}

/** Вырезка прямоугольника [x0, x1) × [y0, y1) из RGBA. */
export function cropRgba(rgba: Uint8ClampedArray, w: number, h: number, x0: number, y0: number, x1: number, y1: number): { data: Uint8ClampedArray; w: number; h: number } {
  x0 = clamp(Math.round(x0), 0, w - 1);
  y0 = clamp(Math.round(y0), 0, h - 1);
  x1 = clamp(Math.round(x1), x0 + 1, w);
  y1 = clamp(Math.round(y1), y0 + 1, h);
  const nw = x1 - x0;
  const nh = y1 - y0;
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) out.set(rgba.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1) * 4), y * nw * 4);
  return { data: out, w: nw, h: nh };
}

// ---------- Разворот: две страницы на одном фото ----------

export interface Spine {
  /** Где резать (px по ширине картинки): левая страница — [0, a), правая — [b, w). */
  x: number;
  a: number;
  b: number;
  /** Ширина пустой полосы вокруг корешка. */
  gap: number;
  /** Насколько уверены, 0..1. */
  conf: number;
}

/**
 * Ищет корешок разворота. Два признака: тёмная складка во всю высоту страницы (после выравнивания света от тени у корешка
 * остаётся тонкая тёмная линия) или пустая вертикальная полоса (поля у сгиба) примерно посередине. Текст должен быть по обе стороны.
 * Ожидается уже выпрямленное фото со строками по горизонтали. Для одной «высокой» страницы сразу null.
 */
export function findSpine(g: Gray): Spine | null {
  if (g.w / g.h < 1.12) return null;
  const { w, h, ink } = smallInk(g, 800);
  const rowInk = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += ink[y * w + x];
    rowInk[y] = n;
  }
  // Строки страницы, где есть текст: поля сверху и снизу и стол не считаем.
  let y0 = 0;
  let y1 = h - 1;
  const thrRow = w * 0.01;
  while (y0 < h - 1 && rowInk[y0] < thrRow) y0++;
  while (y1 > y0 && rowInk[y1] < thrRow) y1--;
  if (y1 - y0 < h * 0.3) return null;
  const body = y1 - y0 + 1;
  const col = new Float32Array(w);
  for (let y = y0; y <= y1; y++) for (let x = 0; x < w; x++) col[x] += ink[y * w + x];
  const frac = (x: number) => col[x] / body;
  // Столбец «пуст», если чернил в нём почти нет.
  const empty = new Uint8Array(w);
  for (let x = 0; x < w; x++) empty[x] = col[x] <= Math.max(1, body * 0.006) ? 1 : 0;
  // Складка — столбцы, почти целиком тёмные: такого в обычном тексте не бывает.
  const fold = new Uint8Array(w);
  for (let x = 0; x < w; x++) fold[x] = frac(x) >= 0.55 ? 1 : 0;
  const busy: number[] = [];
  for (let x = 0; x < w; x++) if (!empty[x] && !fold[x] && frac(x) < 0.4) busy.push(frac(x));
  if (busy.length < w * 0.2) return null;
  const meanBusy = busy.reduce((a, b) => a + b, 0) / busy.length;
  const side = (a: number, b: number) => {
    a = clamp(Math.round(a), 0, w);
    b = clamp(Math.round(b), 0, w);
    let s = 0;
    let n = 0;
    for (let x = a; x < b; x++) if (frac(x) < 0.4) (s += frac(x)), n++;
    return n ? s / (b - a) : 0;
  };
  const textBoth = (a: number, b: number) => side(a - w * 0.3, a) > meanBusy * 0.35 && side(b, b + w * 0.3) > meanBusy * 0.35;
  const aspectOk = (c: number) => c / body > 0.4 && c / body < 1.25;
  const lo = Math.round(w * 0.36);
  const hi = Math.round(w * 0.64);
  const minGap = Math.max(3, Math.round(w * 0.008));
  const out = (a: number, b: number, gap: number, conf: number): Spine => ({ x: (((a + b) / 2) / w) * g.w, a: (a / w) * g.w, b: (b / w) * g.w, gap: (gap / w) * g.w, conf });

  // 1. Складка. Берём самую длинную в середине.
  let bestFold: { a: number; b: number } | null = null;
  for (let x = lo; x < hi; ) {
    if (!fold[x]) {
      x++;
      continue;
    }
    let e = x;
    while (e < hi && fold[e]) e++;
    if (e - x <= w * 0.05 && (!bestFold || e - x > bestFold.b - bestFold.a)) bestFold = { a: x, b: e };
    x = e + 1;
  }
  if (bestFold) {
    const c = (bestFold.a + bestFold.b) / 2;
    // Расширяем от складки в обе стороны до первой пустой полосы: тень у корешка с обеих сторон — не текст.
    const reach = Math.round(w * 0.08);
    const outward = (dir: -1 | 1) => {
      let x = dir < 0 ? bestFold!.a : bestFold!.b;
      let run = 0;
      for (let k = 0; k < reach; k++) {
        const xx = x + dir * k;
        if (xx < 0 || xx >= w) break;
        if (empty[xx]) {
          run++;
          if (run >= minGap) return xx - dir * Math.floor(run / 2);
        } else run = 0;
      }
      return x + dir * Math.round(w * 0.012);
    };
    const a = outward(-1);
    const b = outward(1);
    if (aspectOk(c) && textBoth(a, b)) return out(a, b, b - a, 0.9);
  }
  // 2. Пустая полоса посередине.
  let best: Spine | null = null;
  let bestScore = 0;
  for (let x = lo; x < hi; ) {
    if (!empty[x]) {
      x++;
      continue;
    }
    let e = x;
    while (e < w && empty[e]) e++;
    const gap = e - x;
    const centre = (x + e) / 2;
    // Заметная полоса: не меньше 2,5% ширины. Поля у корешка — обычно 5–12%.
    if (gap >= w * 0.025 && textBoth(x, e) && aspectOk(centre)) {
      const score = Math.min(1, gap / (w * 0.08)) * (1 - Math.abs(centre - w / 2) / (w * 0.2));
      if (score > bestScore) (bestScore = score), (best = out(x, e, gap, clamp(score, 0, 1)));
    }
    x = e + 1;
  }
  return best && bestScore >= 0.2 ? best : null;
}

// ---------- «Волна»: строки изогнуты по ширине страницы ----------

/** Шаг строк (px по вертикали) по автокорреляции профиля чернил. 0 — не нашли. */
export function linePitch(ink: Uint8Array, w: number, h: number): number {
  const prof = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += ink[y * w + x];
    prof[y] = n;
  }
  let mean = 0;
  for (let y = 0; y < h; y++) mean += prof[y];
  mean /= h;
  const ac = (lag: number) => {
    let s = 0;
    for (let y = 0; y + lag < h; y++) s += (prof[y] - mean) * (prof[y + lag] - mean);
    return s / (h - lag);
  };
  const a0 = ac(0);
  if (a0 <= 0) return 0;
  const maxLag = Math.max(8, Math.floor(h / 4));
  let best = 0;
  let bestV = 0.12 * a0;
  let prev = ac(3);
  let rising = false;
  for (let lag = 4; lag < maxLag; lag++) {
    const v = ac(lag);
    if (v > prev) rising = true;
    // Первая заметная вершина после спада.
    if (rising && v < prev && prev > bestV) {
      best = lag - 1;
      break;
    }
    prev = v;
  }
  return best;
}

export interface RowWarp {
  /** Смещение по вертикали для каждого столбца полноразмерной картинки (px): out[y][x] = in[y + dy[x]][x]. */
  dy: Float32Array;
  /** Наибольшее по модулю смещение, px. */
  amp: number;
}

/**
 * Находит «волну»: вертикальные полоски страницы сравниваются с соседними по профилю строк, и накопленные сдвиги
 * показывают, как строки гуляют вверх-вниз по ширине. Возвращает null, если строки и так ровные (меньше ~12% шага строк).
 */
export function estimateRowWarp(g: Gray): RowWarp | null {
  const { w, h, ink } = smallInk(g, 900);
  const pitch = linePitch(ink, w, h);
  if (pitch < 5) return null;
  const maxShift = Math.max(2, Math.round(pitch * 0.45));
  const stripW = Math.max(10, Math.round(w / 40));
  const n = Math.floor(w / stripW);
  if (n < 6) return null;
  const prof: Float32Array[] = [];
  const mass: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = new Float32Array(h);
    let m = 0;
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = i * stripW; x < (i + 1) * stripW; x++) s += ink[y * w + x];
      p[y] = s;
      m += s;
    }
    // Лёгкое сглаживание по вертикали.
    const q = new Float32Array(h);
    for (let y = 0; y < h; y++) q[y] = (p[Math.max(0, y - 1)] + 2 * p[y] + p[Math.min(h - 1, y + 1)]) / 4;
    prof.push(q);
    mass.push(m);
  }
  const ms = mass.filter((m) => m > 0).sort((a, b) => a - b);
  const medMass = ms.length ? ms[Math.floor(ms.length / 2)] : 0;
  if (!medMass) return null;
  const valid = mass.map((m) => m >= medMass * 0.3);
  const off = new Float32Array(n);
  const seg = new Int32Array(n);
  let segId = 0;
  let amp = 0;
  for (let i = 0; i < n; i++) {
    if (!valid[i]) {
      seg[i] = -1;
      continue;
    }
    if (i === 0 || !valid[i - 1]) {
      seg[i] = ++segId;
      off[i] = 0;
      continue;
    }
    // Лучший сдвиг s: P_i[y] ≈ P_{i-1}[y + s].
    let bestS = 0;
    let bestC = -1;
    let normA = 0;
    let normB = 0;
    for (let y = 0; y < h; y++) (normA += prof[i][y] * prof[i][y]), (normB += prof[i - 1][y] * prof[i - 1][y]);
    const den = Math.sqrt(normA * normB) || 1;
    for (let s = -maxShift; s <= maxShift; s++) {
      let c = 0;
      for (let y = Math.max(0, -s); y < Math.min(h, h - s); y++) c += prof[i][y] * prof[i - 1][y + s];
      c /= den;
      if (c > bestC) (bestC = c), (bestS = s);
    }
    if (bestC < 0.35) {
      // Совпадения нет — новый кусок (например, рисунок или другая колонка с другим «ритмом» строк).
      seg[i] = ++segId;
      off[i] = 0;
      continue;
    }
    seg[i] = seg[i - 1];
    off[i] = off[i - 1] - bestS;
  }
  // В каждом куске вычитаем среднее: «ровно» — это в среднем по куску.
  const d = new Float32Array(n);
  for (let sid = 1; sid <= segId; sid++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (seg[i] === sid) idx.push(i);
    if (idx.length < 3) continue;
    // Линейный наклон куска не вычитаем целиком: это наклон страницы, его убирает поворот. Но среднее — да.
    const mean = idx.reduce((a, i) => a + off[i], 0) / idx.length;
    for (const i of idx) d[i] = off[i] - mean;
  }
  // Сглаживание по соседним полоскам.
  const sm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let k = -1; k <= 1; k++) {
      const j = i + k;
      if (j >= 0 && j < n && seg[j] === seg[i] && seg[i] > 0) (s += d[j]), c++;
    }
    sm[i] = c ? s / c : 0;
    amp = Math.max(amp, Math.abs(sm[i]));
  }
  if (amp < Math.max(1.8, pitch * 0.12) || amp > pitch * 1.2) return null;
  const ky = g.h / h;
  const kx = w / g.w;
  const dy = new Float32Array(g.w);
  for (let x = 0; x < g.w; x++) {
    const f = x * kx / stripW - 0.5;
    const a = clamp(Math.floor(f), 0, n - 1);
    const b = clamp(a + 1, 0, n - 1);
    const t = clamp(f - a, 0, 1);
    dy[x] = (sm[a] * (1 - t) + sm[b] * t) * ky;
  }
  return { dy, amp: amp * ky };
}

/** Применяет «волну»: каждый столбец сдвигается по вертикали (билинейно), края повторяются. */
export function applyRowWarp(rgba: Uint8ClampedArray, w: number, h: number, dy: Float32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let x = 0; x < w; x++) {
    const sh = dy[Math.min(dy.length - 1, x)];
    for (let y = 0; y < h; y++) {
      const fy = clamp(y + sh, 0, h - 1);
      const y0 = Math.floor(fy);
      const y1 = Math.min(h - 1, y0 + 1);
      const t = fy - y0;
      const a = (y0 * w + x) * 4;
      const b = (y1 * w + x) * 4;
      const o = (y * w + x) * 4;
      out[o] = rgba[a] + (rgba[b] - rgba[a]) * t;
      out[o + 1] = rgba[a + 1] + (rgba[b + 1] - rgba[a + 1]) * t;
      out[o + 2] = rgba[a + 2] + (rgba[b + 2] - rgba[a + 2]) * t;
      out[o + 3] = 255;
    }
  }
  return out;
}

// ---------- Резкость, свет, мелкий текст: оценка снимка ----------

function gradEnergy(g: Gray): number {
  let s = 0;
  for (let y = 1; y < g.h - 1; y += 2)
    for (let x = 1; x < g.w - 1; x += 2) {
      const i = y * g.w + x;
      s += Math.abs(g.d[i + 1] - g.d[i - 1]) + Math.abs(g.d[i + g.w] - g.d[i - g.w]);
    }
  return s;
}

/**
 * Резкость текста: во сколько раз «край» теряет силу после лёгкого размытия.
 * Чёткий текст при размытии сильно слабеет (≈ 1.8–2.5), уже размытый — почти не меняется (≈ 1.0–1.3).
 * Считаем на картинке, приведённой к «размеру букв», поэтому число сравнимо между снимками.
 */
export function sharpness(g: Gray): number {
  const s = boxBlur(g, 1); // шум глушим сразу
  const a = gradEnergy(s);
  const b = gradEnergy(boxBlur(s, 2));
  return b > 0 ? a / b : 0;
}

/** Карта насыщения: доля «выбеленных» пикселей среди бумаги и яркость бумаги. */
export function lightStats(gray: Gray): { paper: number; clipped: number; inkDepth: number } {
  const v = gray.d;
  const sample: number[] = [];
  for (let i = 0; i < v.length; i += 7) sample.push(v[i]);
  sample.sort((a, b) => a - b);
  const at = (p: number) => sample[clamp(Math.floor(sample.length * p), 0, sample.length - 1)] ?? 0;
  let clipped = 0;
  for (const x of sample) if (x >= 252) clipped++;
  return { paper: at(0.8), clipped: clipped / Math.max(1, sample.length), inkDepth: at(0.02) };
}

export type AdviceCode = 'dark' | 'bright' | 'glare' | 'blur' | 'small' | 'tilt' | 'moire' | 'spread' | 'generic';
export interface Advice {
  code: AdviceCode;
  text: string;
}

export const ADVICE_TEXT: Record<AdviceCode, string> = {
  dark: 'На снимке темно: включи свет (лучше сбоку, чтобы не было тени от телефона) и сними страницу ещё раз.',
  bright: 'Снимок пересвечен, текст «выцвел»: отойди от лампы или солнца, выключи вспышку и сними ещё раз.',
  glare: 'На странице блик от лампы: чуть поверни страницу или лампу, чтобы блик ушёл с текста, и сними ещё раз.',
  blur: 'Снимок размытый: коснись экрана на тексте, чтобы навести фокус, держи телефон двумя руками и сними ещё раз.',
  small: 'Буквы на снимке очень мелкие: подойди ближе, чтобы страница занимала весь кадр, — или сними страницу по половинкам.',
  tilt: 'Страница снята сильно под углом: сними её прямо сверху, чтобы телефон был параллельно странице.',
  moire: 'Похоже на снимок с экрана: лучше сделай скриншот, а не фото монитора.',
  spread: 'На снимке разворот: страницы читаются по очереди — проверь, что порядок верный.',
  generic: 'Страница прочиталась неуверенно: сними ещё раз — ровнее, ближе и при хорошем свете.'
};

export interface PhotoFacts {
  /** Яркость бумаги до выравнивания света (0..255). */
  paper: number;
  clipped: number;
  inkDepth: number;
  sharp: number;
  /** Высота букв на снимке, px (как есть, до увеличения). */
  glyph: number;
  /** Наклон: во сколько раз одна сторона страницы длиннее противоположной (1 — прямо). */
  foreshorten: number;
  /** Часть выбеленной бумаги, собранная в одно пятно (блик). */
  glareShare: number;
  /** Признак «снимка с экрана». */
  moire: number;
  /** Уверенность чтения: средняя по словам и доля неуверенных. */
  conf: number;
  unsureShare: number;
  words: number;
}

/**
 * Что посоветовать: только если чтение действительно слабое (иначе не пугаем — снимки со слабым светом Мнема читает хорошо).
 * Возвращает от нуля до двух советов, самая вероятная причина — первой.
 */
export function adviceFor(f: PhotoFacts): Advice[] {
  const weak = f.conf < 66 || f.unsureShare > 0.3 || (f.words < 12 && f.conf < 80);
  if (!weak) return [];
  const out: AdviceCode[] = [];
  if (f.moire > 0.5) out.push('moire');
  if (f.glyph > 0 && f.glyph < 11.5) out.push('small');
  if (f.sharp > 0 && f.sharp < 1.55) out.push('blur');
  if (f.paper < 90) out.push('dark');
  if (f.paper > 245 && f.inkDepth > 110) out.push('bright');
  if (f.glareShare > 0.04) out.push('glare');
  if (f.foreshorten > 1.35) out.push('tilt');
  if (!out.length) out.push('generic');
  return out.slice(0, 2).map((code) => ({ code, text: ADVICE_TEXT[code] }));
}

/** «Муар»: на снимке экрана видна регулярная мелкая сетка — сильный пик автокорреляции яркости на малых сдвигах, не похожий на буквы. */
export function moireScore(g: Gray): number {
  // Берём однородный кусок бумаги: 9 окон, в каждом смотрим, как сильно яркость «звенит» по горизонтали.
  const win = 64;
  if (g.w < win * 3 || g.h < win * 3) return 0;
  let best = 0;
  for (let gy = 0; gy < 3; gy++)
    for (let gx = 0; gx < 3; gx++) {
      const x0 = Math.round(((gx + 0.5) / 3) * g.w - win / 2);
      const y0 = Math.round(((gy + 0.5) / 3) * g.h - win / 2);
      // Только окна без текста (ровная бумага): мало тёмных пикселей.
      let dark = 0;
      let sum = 0;
      for (let y = y0; y < y0 + win; y++) for (let x = x0; x < x0 + win; x++) (sum += g.d[y * g.w + x]), (dark += g.d[y * g.w + x] < 170 ? 1 : 0);
      if (dark > win * win * 0.01) continue;
      const mean = sum / (win * win);
      let v = 0;
      for (let y = y0; y < y0 + win; y++) for (let x = x0; x < x0 + win; x++) v += (g.d[y * g.w + x] - mean) ** 2;
      best = Math.max(best, Math.sqrt(v / (win * win)));
    }
  return best;
}

/** Нерезкость → чуть подтянуть края (нерезкая маска): усиливает разницу между картинкой и её размытием. */
export function unsharp(g: Gray, radius: number, amount: number): Gray {
  const b = boxBlur(g, radius);
  const d = new Uint8ClampedArray(g.d.length);
  for (let i = 0; i < d.length; i++) d[i] = g.d[i] + (g.d[i] - b.d[i]) * amount;
  return { w: g.w, h: g.h, d };
}

export { rgbaToGray };
