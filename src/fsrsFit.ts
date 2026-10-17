// «Подогнать расписание под меня» (1.32, N4): параметры FSRS по журналу повторений ученика (data.logs).
// Без новых зависимостей: история каждой карточки прогоняется через формулы ts-fsrs (FSRSAlgorithm.next_state),
// ошибка прогноза — логистическая (вспомнил или нет при предсказанной вероятности), оптимизация — Adam по численному
// градиенту с ограничениями параметров (CLAMP_PARAMETERS) и притяжением к стандартным (чем меньше данных, тем сильнее).
// Новые параметры принимаются, только если на последних 20 % повторений (их подгонка не видела) прогноз стал точнее.
import { CLAMP_PARAMETERS, default_w, FSRSAlgorithm, forgetting_curve, W17_W18_Ceiling, type FSRSState } from 'ts-fsrs';
import type { ReviewLogEntry } from './types';

const DAY = 86400000;
/** Сколько прогнозов (повторений через день и больше) нужно, чтобы подгонка имела смысл. */
export const FIT_MIN_REVIEWS = 300;

export interface FitParams {
  w: number[];
  /** Когда подогнано (ISO). */
  at: string;
  /** По скольким прогнозам. */
  reviews: number;
  /** Средняя ошибка прогноза «вспомню или нет» до и после, доли (RMSE по корзинам). */
  before: number;
  after: number;
}

/** Повторение для обучения: через сколько дней после прошлого (0 — в тот же день) и с какой оценкой. */
interface Step {
  t: number;
  g: 1 | 2 | 3 | 4;
  at: number;
}

/** Истории карточек из журнала: по ключу элемента, по времени; «первое знакомство» — первая запись. */
export function histories(logs: ReviewLogEntry[]): Step[][] {
  const by = new Map<string, ReviewLogEntry[]>();
  for (const l of logs) {
    if (!l || typeof l.key !== 'string' || ![1, 2, 3, 4].includes(l.rating)) continue;
    const at = Date.parse(l.at);
    if (!Number.isFinite(at)) continue;
    if (!by.has(l.key)) by.set(l.key, []);
    by.get(l.key)!.push(l);
  }
  const out: Step[][] = [];
  for (const list of by.values()) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    // История, начатая не с нуля (перенос из Anki без первых ответов), подгонку бы обманула — берём только с «новой».
    if (list[0].prevState !== 0) continue;
    let prev = 0;
    const steps: Step[] = list.map((l, i) => {
      const at = Date.parse(l.at);
      const t = i === 0 ? 0 : Math.max(0, (at - prev) / DAY);
      prev = at;
      return { t, g: l.rating, at };
    });
    if (steps.length >= 2) out.push(steps);
  }
  return out;
}

/** Сколько прогнозов (ответов через день и больше после прошлого) в историях. */
export function countPredictions(hs: Step[][]): number {
  let n = 0;
  for (const h of hs) for (let i = 1; i < h.length; i++) if (h[i].t >= 1) n++;
  return n;
}

const bounds = CLAMP_PARAMETERS(W17_W18_Ceiling, true);
const clampW = (w: number[]) => w.map((x, i) => Math.min(bounds[i][1], Math.max(bounds[i][0], x)));

/** Прогнозы «вспомню» и что было на самом деле — для каждой истории по порядку. */
function predictions(w: number[], hs: Step[][], from = 0, to = Infinity): { p: number; y: number }[] {
  const algo = new FSRSAlgorithm({ w, enable_short_term: true });
  const out: { p: number; y: number }[] = [];
  for (const h of hs) {
    let s: FSRSState | null = null;
    for (let i = 0; i < h.length; i++) {
      const st = h[i];
      if (s && st.t >= 1 && st.at >= from && st.at < to) {
        const p = forgetting_curve(w, Math.floor(st.t), s.stability);
        out.push({ p: Math.min(1 - 1e-4, Math.max(1e-4, p)), y: st.g > 1 ? 1 : 0 });
      }
      // В тот же день — краткосрочная память (t = 0); дни — целые, как у планировщика.
      s = algo.next_state(s, s ? Math.floor(st.t) : 0, st.g);
    }
  }
  return out;
}

const logLoss = (ps: { p: number; y: number }[]) => (ps.length ? -ps.reduce((a, { p, y }) => a + (y ? Math.log(p) : Math.log(1 - p)), 0) / ps.length : 0);

/** Ошибка прогноза по корзинам вероятности (как «RMSE (bins)» в Anki): насколько прогноз «90 %» расходится с тем, как было. */
export function binnedRmse(ps: { p: number; y: number }[]): number {
  if (!ps.length) return 0;
  const bins = new Map<number, { p: number; y: number; n: number }>();
  for (const x of ps) {
    const k = Math.min(19, Math.floor(x.p * 20));
    const b = bins.get(k) ?? { p: 0, y: 0, n: 0 };
    b.p += x.p;
    b.y += x.y;
    b.n++;
    bins.set(k, b);
  }
  let se = 0;
  for (const b of bins.values()) se += b.n * ((b.p - b.y) / b.n) ** 2;
  return Math.sqrt(se / ps.length);
}

/** Целевая функция: ошибка прогноза + притяжение к стандартным параметрам (меньше данных — сильнее притяжение). */
function objective(w: number[], hs: Step[][], n: number, from?: number, to?: number): number {
  const reg = 0.5 / Math.sqrt(Math.max(1, n));
  let pen = 0;
  for (let i = 0; i < w.length; i++) {
    const scale = Math.max(0.05, Math.abs(default_w[i]));
    pen += ((w[i] - default_w[i]) / scale) ** 2;
  }
  return logLoss(predictions(w, hs, from, to)) + (reg * pen) / w.length;
}

export interface FitProgress {
  (frac: number): void;
}

/** Подогнать параметры: Adam по численному градиенту. pause — отдать кадр интерфейсу между шагами. */
async function optimize(start: number[], hs: Step[][], n: number, o: { to?: number; steps: number; onStep?: (i: number) => void; pause: () => Promise<void> }): Promise<number[]> {
  let w = clampW(start);
  const m = new Array(w.length).fill(0);
  const v = new Array(w.length).fill(0);
  const lr = 0.04;
  let best = w;
  let bestF = objective(w, hs, n, 0, o.to);
  for (let it = 1; it <= o.steps; it++) {
    const f0 = objective(w, hs, n, 0, o.to);
    // Численный градиент; между параметрами — пауза для кадра: на большом журнале один прогон — десятки миллисекунд.
    const grad: number[] = [];
    for (let i = 0; i < w.length; i++) {
      const h = Math.max(1e-3, Math.abs(w[i]) * 1e-2);
      const wp = w.slice();
      wp[i] = w[i] + h;
      grad.push((objective(clampW(wp), hs, n, 0, o.to) - f0) / h);
      if (i % 4 === 3) await o.pause();
    }
    w = clampW(
      w.map((x, i) => {
        m[i] = 0.9 * m[i] + 0.1 * grad[i];
        v[i] = 0.999 * v[i] + 0.001 * grad[i] ** 2;
        const mh = m[i] / (1 - 0.9 ** it);
        const vh = v[i] / (1 - 0.999 ** it);
        const scale = Math.max(0.05, Math.abs(default_w[i]));
        return x - (lr * scale * mh) / (Math.sqrt(vh) + 1e-8);
      })
    );
    const f = objective(w, hs, n, 0, o.to);
    if (f < bestF) {
      bestF = f;
      best = w;
    }
    o.onStep?.(it);
    await o.pause();
  }
  return best;
}

export type FitResult = { ok: true; params: FitParams; better: boolean; reviews: number } | { ok: false; reviews: number; need: number };

/**
 * Подгонка по журналу. Сначала — на первых 80 % повторений по времени, проверка — на последних 20 %: если прогноз
 * там не стал точнее, better: false (оставляем стандартные). Иначе — подгонка на всём журнале от найденного.
 */
export async function fitParameters(logs: ReviewLogEntry[], o: { onProgress?: FitProgress; pause?: () => Promise<void>; steps?: number; now?: Date } = {}): Promise<FitResult> {
  const hs = histories(logs);
  const n = countPredictions(hs);
  if (n < FIT_MIN_REVIEWS) return { ok: false, reviews: n, need: FIT_MIN_REVIEWS };
  const pause = o.pause ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  const steps = o.steps ?? 60;
  // Граница по времени: 80 % прогнозов раньше неё.
  const times = hs.flatMap((h) => h.filter((s, i) => i > 0 && s.t >= 1).map((s) => s.at)).sort((a, b) => a - b);
  const cut = times[Math.floor(times.length * 0.8)];
  const total = steps * 2;
  const trained = await optimize([...default_w], hs, n, { to: cut, steps, pause, onStep: (i) => o.onProgress?.(i / total) });
  const test = (w: number[]) => logLoss(predictions(w, hs, cut));
  const better = test(trained) < test([...default_w]) * 0.995;
  const final = better ? await optimize(trained, hs, n, { steps, pause, onStep: (i) => o.onProgress?.((steps + i) / total) }) : [...default_w];
  o.onProgress?.(1);
  const all = (w: number[]) => binnedRmse(predictions(w, hs));
  const r6 = (x: number) => Math.round(x * 1e4) / 1e4;
  return { ok: true, better, reviews: n, params: { w: final.map(r6), at: (o.now ?? new Date()).toISOString(), reviews: n, before: r6(all([...default_w])), after: r6(all(final)) } };
}

/** Параметры из настроек (из чужой копии может прийти что угодно): 21 число в допустимых пределах — иначе стандартные. */
export function cleanFitParams(raw: unknown): FitParams | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.w) || r.w.length !== default_w.length || !r.w.every((x) => typeof x === 'number' && Number.isFinite(x))) return undefined;
  const w = r.w as number[];
  if (w.some((x, i) => x < bounds[i][0] - 1e-9 || x > bounds[i][1] + 1e-9)) return undefined;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
  return { w: [...w], at: typeof r.at === 'string' ? r.at.slice(0, 40) : '', reviews: Math.round(num(r.reviews)), before: num(r.before), after: num(r.after) };
}

/** Как изменятся интервалы: отношение интервала после «Хорошо» с новыми параметрами к стандартному (по типичной карточке). */
export function intervalShift(w: number[], retention = 0.9): number {
  const a = new FSRSAlgorithm({ w, request_retention: retention, enable_fuzz: false });
  const d = new FSRSAlgorithm({ w: [...default_w], request_retention: retention, enable_fuzz: false });
  // Типичная история: новая → «Хорошо» → через день «Хорошо» → через неделю «Хорошо».
  const run = (al: FSRSAlgorithm) => {
    let s = al.next_state(null, 0, 3);
    s = al.next_state(s, 1, 3);
    s = al.next_state(s, 7, 3);
    return al.next_interval(s.stability, 7);
  };
  return run(a) / Math.max(1, run(d));
}
