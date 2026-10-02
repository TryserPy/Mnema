// Карта знаний: уровни детализации, число шагов физики и кэш раскладки.
// Чистые функции без React и d3 — их проверяет src/v181-perf.test.ts.
//
// Замеры (Node, шаг d3-force на главном потоке; бюджет кадра — 16 мс):
//   130 узлов — 0,6 мс · 616 узлов (500 тем без понятий) — 3,4 мс · 651 узел (100 тем с понятиями) — 3,2 мс
//   2453 узла — 19,5 мс · 3168 узлов (500 тем с понятиями) — 22,8 мс · 12648 узлов (2000 тем с понятиями) — 132 мс.

/** Больше стольких узлов — «понятия» из конспектов не показываем (сама настройка пользователя не меняется). */
export const TERMS_LIMIT = 700;
/** Больше стольких узлов даже без понятий — показываем один предмет, остальные кружками. */
export const SUBJECT_LIMIT = 1500;
/** Выше этого «Все понятия» нельзя включить вручную: карта зависнет. */
export const FORCE_LIMIT = 4000;
/** Пока узлов не больше — физика «живая» (узел тянут, остальные подстраиваются). Дальше узел просто двигается. */
export const LIVE_LIMIT = TERMS_LIMIT;

const ALPHA_MIN = 0.001; // как у d3-force по умолчанию

export interface PhysicsPlan {
  alphaDecay: number; // чем больше узлов, тем быстрее остывает
  live: boolean; // оживлять физику при перетаскивании
  maxTicks: number; // предел шагов после нагрева (страховка)
}

/** Сколько шагов нужно остыть от alpha=1 до порога при заданном alphaDecay. */
export const ticksToCool = (alphaDecay: number) => Math.ceil(Math.log(ALPHA_MIN) / Math.log(1 - alphaDecay));

export function physicsPlan(nodes: number): PhysicsPlan {
  // до 300 узлов — как было всегда (381 шаг); дальше физика заканчивается быстрее
  const alphaDecay = nodes <= 300 ? 0.018 : nodes <= LIVE_LIMIT ? 0.03 : nodes <= SUBJECT_LIMIT ? 0.045 : 0.06;
  return { alphaDecay, live: nodes <= LIVE_LIMIT, maxTicks: ticksToCool(alphaDecay) + 10 };
}

/** Показывать ли один предмет (остальные — кружками): узлов очень много даже без понятий. */
export function needsOneSubject(baseNodes: number, subjects: number, filtered: boolean): boolean {
  return !filtered && subjects > 1 && baseNodes > SUBJECT_LIMIT;
}

export interface TermsVerdict {
  show: boolean; // рисовать «понятия»
  hidden: boolean; // пользователь их хочет, но карта слишком большая
  canForce: boolean; // можно показать всё равно («Все понятия»)
}

/** Решение про «понятия». fullNodes — сколько было бы узлов со всеми понятиями. */
export function termsVerdict(showTerms: boolean, fullNodes: number, forced: boolean): TermsVerdict {
  if (!showTerms) return { show: false, hidden: false, canForce: false };
  if (fullNodes <= TERMS_LIMIT) return { show: true, hidden: false, canForce: false };
  const canForce = fullNodes <= FORCE_LIMIT;
  if (forced && canForce) return { show: true, hidden: false, canForce };
  return { show: false, hidden: true, canForce };
}

/** Первая в списке связь каждого узла (где он — начало или конец): один проход вместо `links.find` на каждый узел. */
export function firstLinks<L extends { source: unknown; target: unknown }>(links: L[]): Map<string, L> {
  const out = new Map<string, L>();
  for (const l of links) {
    const a = l.source as string;
    const b = l.target as string;
    if (!out.has(a)) out.set(a, l);
    if (!out.has(b)) out.set(b, l);
  }
  return out;
}

// ---------- Кэш раскладки (в памяти окна, пропадает при перезапуске) ----------

export type Layout = Map<string, [number, number]>;

const cache = new Map<string, { pos: Layout; done: boolean }>();
const CACHE_MAX = 6;

function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Ключ раскладки: набор узлов, связи между ними и настройки физики. От порядка не зависит.
 * Если тему перенесли в другую, связи меняются — ключ другой, и раскладка считается заново.
 */
export function layoutKey(ids: Iterable<string>, edges: Iterable<[string, string]>, params: number[]): string {
  let n = 0;
  let sum = 0;
  let mix = 0;
  for (const id of ids) {
    const h = fnv(id);
    n++;
    sum = (sum + h) >>> 0;
    mix = (mix ^ Math.imul(h, 0x9e3779b1)) >>> 0;
  }
  let m = 0;
  let esum = 0;
  let emix = 0;
  for (const [a, b] of edges) {
    const h = fnv(a + '\u0001' + b);
    m++;
    esum = (esum + h) >>> 0;
    emix = (emix ^ Math.imul(h, 0x85ebca6b)) >>> 0;
  }
  return `${n}.${sum.toString(36)}.${mix.toString(36)}|${m}.${esum.toString(36)}.${emix.toString(36)}|${params.join(',')}`;
}

export function getLayout(key: string): { pos: Layout; done: boolean } | undefined {
  const e = cache.get(key);
  if (e) {
    cache.delete(key); // «свежие» — в конец
    cache.set(key, e);
  }
  return e;
}

/** done — раскладка успокоилась (повторно физику гонять не нужно). */
export function putLayout(key: string, pos: Layout, done: boolean) {
  cache.delete(key);
  cache.set(key, { pos, done });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

export function clearLayouts() {
  cache.clear();
}

export const layoutCacheSize = () => cache.size;
