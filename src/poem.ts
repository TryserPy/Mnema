// Стихи наизусть. Учим «нарастающими частями» (часть → часть → обе вместе → следующая…) и с исчезающими
// подсказками: сначала весь текст, потом половина слов, потом только первые буквы, потом ничего.
// Проверка: вслух (Мнема сравнивает сказанное с текстом) или самому — открыть и отметить строки с ошибками.
import type { AppData, Poem, Topic } from './types';

export interface PoemLine {
  text: string;
  stanza: number;
}

export function poemLines(text: string): PoemLine[] {
  const out: PoemLine[] = [];
  let stanza = 0;
  let gap = false;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const t = raw.replace(/\s+$/g, '').replace(/^\s+/, '');
    if (!t) {
      gap = out.length > 0;
      continue;
    }
    if (gap) stanza++;
    gap = false;
    out.push({ text: t, stanza });
  }
  return out;
}

/** Сколько строк в части по умолчанию: четверостишия — по строфе, иначе по две строки. */
export function autoChunk(text: string): number {
  const lines = poemLines(text);
  const sizes = new Map<number, number>();
  for (const l of lines) sizes.set(l.stanza, (sizes.get(l.stanza) ?? 0) + 1);
  const max = Math.max(0, ...sizes.values());
  return sizes.size > 1 && max <= 4 ? 0 : 2;
}

export interface PoemPart {
  from: number; // индекс первой строки
  to: number; // индекс после последней
}

/** Части стиха: по строфам (chunk = 0) или по N строк, не перескакивая через границу строфы. */
export function poemParts(text: string, chunk: number): PoemPart[] {
  const lines = poemLines(text);
  const out: PoemPart[] = [];
  let i = 0;
  while (i < lines.length) {
    const st = lines[i].stanza;
    let end = i;
    while (end < lines.length && lines[end].stanza === st) end++;
    const size = chunk > 0 ? chunk : end - i > 6 ? 4 : end - i;
    for (let a = i; a < end; a += size) out.push({ from: a, to: Math.min(end, a + size) });
    i = end;
  }
  return out;
}

/* ---------- Подсказки ---------- */

export type CueLevel = 0 | 1 | 2 | 3; // 0 — весь текст, 1 — половина слов, 2 — первые буквы, 3 — ничего

export interface CueToken {
  text: string; // как показать
  word: boolean;
  hidden: boolean; // слово спрятано (показана подсказка)
  full: string; // полное слово
}

const WORD = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

export function tokenize(line: string): { text: string; word: boolean }[] {
  const out: { text: string; word: boolean }[] = [];
  let last = 0;
  for (const m of line.matchAll(WORD)) {
    if (m.index! > last) out.push({ text: line.slice(last, m.index), word: false });
    out.push({ text: m[0], word: true });
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), word: false });
  return out;
}

/** Строка с подсказкой нужного уровня. На уровне 1 прячется каждое второе слово (первое в строке — видно). */
export function cueLine(line: string, level: CueLevel, lineIndex = 0): CueToken[] {
  let wi = 0;
  return tokenize(line).map((t) => {
    if (!t.word) return { text: t.text, word: false, hidden: false, full: t.text };
    const i = wi++;
    const hide = level === 3 || (t.text.length > 1 && (level === 2 || (level === 1 && (i + lineIndex) % 2 === 1)));
    if (!hide) return { text: t.text, word: true, hidden: false, full: t.text };
    if (level === 3) return { text: '', word: true, hidden: true, full: t.text };
    return { text: t.text[0] + '·'.repeat(Math.min(6, Math.max(1, t.text.length - 1))), word: true, hidden: true, full: t.text };
  });
}

/* ---------- Сравнение сказанного с текстом ---------- */

export const normWord = (w: string) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');

export function wordsOf(text: string): string[] {
  return [...text.matchAll(WORD)].map((m) => m[0]);
}

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let d = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, d + (a[i - 1] === b[j - 1] ? 0 : 1));
      d = t;
    }
  }
  return prev[b.length];
}

/** Одно и то же слово? Распознавание речи путает окончания и буквы — прощаем мелочи. */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const n = Math.max(a.length, b.length);
  if (n >= 5 && lev(a, b) <= 1) return true;
  if (n >= 8 && lev(a, b) <= 2) return true;
  const k = Math.max(4, Math.min(a.length, b.length) - 2);
  return a.length >= 5 && b.length >= 5 && a.slice(0, k) === b.slice(0, k);
}

export type WordMark = 'ok' | 'miss' | 'wrong';
export interface RecitalWord {
  word: string; // как в тексте
  line: number;
  mark: WordMark;
  said?: string; // что прозвучало вместо
  stumble?: boolean; // запнулся перед этим словом (пауза или повтор)
}
export interface Recital {
  words: RecitalWord[];
  extra: number; // лишних слов
  accuracy: number; // доля верно сказанных слов, 0..1
  stumbles: number;
  badLines: number[]; // строки с ошибками или запинками
}

/**
 * Сравнить сказанное с текстом (по словам, как «разница» двух текстов).
 * times — когда прозвучало каждое сказанное слово (мс); пауза дольше pauseMs перед словом = запинка.
 */
export function compareRecital(lines: string[], spoken: string, times?: number[], pauseMs = 3000): Recital {
  const exp: { word: string; n: string; line: number }[] = [];
  lines.forEach((l, li) => wordsOf(l).forEach((w) => exp.push({ word: w, n: normWord(w), line: li })));
  const said = wordsOf(spoken).map(normWord).filter(Boolean);
  const n = exp.length;
  const m = said.length;
  // Выравнивание: цена пропуска и лишнего слова — 1, замены — 1.
  const W = m + 1;
  const dp = new Float64Array((n + 1) * W);
  for (let i = 0; i <= n; i++) dp[i * W] = i;
  for (let j = 0; j <= m; j++) dp[j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const eq = sameWord(exp[i - 1].n, said[j - 1]);
      dp[i * W + j] = Math.min(dp[(i - 1) * W + j - 1] + (eq ? 0 : 1), dp[(i - 1) * W + j] + 1, dp[i * W + j - 1] + (j >= 2 && said[j - 1] === said[j - 2] ? 0.6 : 1));
    }
  const words: RecitalWord[] = exp.map((e) => ({ word: e.word, line: e.line, mark: 'miss' as WordMark }));
  const matchedAt: number[] = new Array(n).fill(-1);
  let extra = 0;
  const stumbleAt = new Set<number>(); // где запнулся: повторил слово или вставил лишнее («э-э»)
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const eq = sameWord(exp[i - 1].n, said[j - 1]);
      if (dp[i * W + j] === dp[(i - 1) * W + j - 1] + (eq ? 0 : 1)) {
        words[i - 1].mark = eq ? 'ok' : 'wrong';
        if (!eq) words[i - 1].said = said[j - 1];
        matchedAt[i - 1] = j - 1;
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i * W + j] === dp[(i - 1) * W + j] + 1) {
      i--;
      continue;
    }
    extra++;
    // Повтор только что сказанного слова — запинка на нём; другое лишнее слово — перед следующим.
    if (i > 0 && sameWord(exp[i - 1].n, said[j - 1])) stumbleAt.add(i - 1);
    else if (i < n) stumbleAt.add(i);
    j--;
  }
  // Запинки: повтор слова / лишнее слово перед словом текста или долгая пауза.
  let stumbles = 0;
  for (let k = 0; k < n; k++) {
    let st = stumbleAt.has(k);
    const at = matchedAt[k];
    if (times && at > 0 && times[at] != null && times[at - 1] != null && times[at] - times[at - 1] > pauseMs) st = true;
    if (st && words[k].mark !== 'miss') {
      words[k].stumble = true;
      stumbles++;
    }
  }
  const ok = words.filter((w) => w.mark === 'ok').length;
  const bad = new Set<number>();
  for (const w of words) if (w.mark !== 'ok' || w.stumble) bad.add(w.line);
  return { words, extra, accuracy: n ? ok / n : 0, stumbles, badLines: [...bad].sort((a, b) => a - b) };
}

/* ---------- Повторение ---------- */

const DAY = 86400000;
export const dayKey = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Следующий повтор стиха целиком: хорошо рассказал — промежуток растёт (1, 3, 7, 17… дней), плохо — завтра снова. */
export function nextReview(p: Poem, accuracy: number, now: Date): NonNullable<Poem['review']> {
  const cur = p.review;
  let reps = cur?.reps ?? 0;
  let interval: number;
  if (accuracy >= 0.9) {
    reps++;
    interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.min(120, Math.round((cur?.interval ?? 3) * 2.4));
  } else if (accuracy >= 0.7) {
    interval = Math.max(1, Math.round((cur?.interval ?? 1) * 0.6));
  } else {
    reps = 0;
    interval = 1;
  }
  // Свой срок: повтор не позже дня перед нужной датой.
  const left = daysLeft(p, now);
  if (left !== null && left >= 1) interval = Math.min(interval, Math.max(1, left - 1));
  return { due: dayKey(new Date(now.getTime() + interval * DAY)), interval, reps };
}

/** Сколько дней до «выучить к…» (0 — сегодня, меньше нуля — срок прошёл); null — срока нет. */
export function daysLeft(p: Poem, now: Date): number | null {
  if (!p.deadline) return null;
  const a = new Date(dayKey(now) + 'T12:00:00').getTime();
  const b = new Date(p.deadline + 'T12:00:00').getTime();
  return Number.isFinite(b) ? Math.round((b - a) / DAY) : null;
}

/** План к сроку: сколько строк осталось и сколько в день. */
export function deadlinePlan(p: Poem, now: Date): { days: number; left: number; perDay: number } | null {
  const days = daysLeft(p, now);
  if (days === null) return null;
  const left = learnTargets(p).length;
  return { days, left, perDay: left ? Math.ceil(left / Math.max(1, days)) : 0 };
}

/* ---------- Свои строки: выучено / не учу / повторять чаще / подсказки ---------- */

const sorted = (s: Iterable<number>) => [...new Set(s)].sort((a, b) => a - b);
const keyOf = (line: number, word: number) => `${line}:${word}`;

/** Какие строки выучены. Нет своего списка — по счётчику частей (так хранили раньше). */
export function knownSet(p: Poem): Set<number> {
  if (p.knownLines) return new Set(p.knownLines);
  const s = new Set<number>();
  const parts = poemParts(p.text, p.chunk);
  for (let k = 0; k < Math.min(p.learned, parts.length); k++) for (let i = parts[k].from; i < parts[k].to; i++) s.add(i);
  return s;
}
export const skipSet = (p: Poem) => new Set(p.skipLines ?? []);
export const focusSet = (p: Poem) => new Set(p.focusLines ?? []);
export const pinSet = (p: Poem) => new Set(p.pinWords ?? []);
export const isPinned = (p: Poem, line: number, word: number) => (p.pinWords ?? []).includes(keyOf(line, word));

/** Строки, которые учим (всё, кроме «не учу»). */
export function activeLines(p: Poem): number[] {
  const skip = skipSet(p);
  return poemLines(p.text).flatMap((_, i) => (skip.has(i) ? [] : [i]));
}
/** Выученные из тех, что учим. */
export function learnedLines(p: Poem): number[] {
  const k = knownSet(p);
  return activeLines(p).filter((i) => k.has(i));
}
/** Что ещё не выучено (с какой-то строки — «начать с неё»). */
export function learnTargets(p: Poem, from = 0): number[] {
  const k = knownSet(p);
  return activeLines(p).filter((i) => i >= from && !k.has(i));
}

export function poemLearned(p: Poem): boolean {
  const act = activeLines(p);
  if (!act.length) return false;
  const k = knownSet(p);
  return act.every((i) => k.has(i));
}

/** Сколько частей подряд с начала выучено целиком — для старого счётчика `learned`. */
export function learnedCount(p: Poem): number {
  return leadingParts(p, knownSet(p));
}

function leadingParts(p: Poem, known: Set<number>): number {
  const skip = skipSet(p);
  let n = 0;
  for (const pt of poemParts(p.text, p.chunk)) {
    for (let i = pt.from; i < pt.to; i++) if (!skip.has(i) && !known.has(i)) return n;
    n++;
  }
  return n;
}

function withKnown(p: Poem, known: Set<number>): Partial<Poem> {
  return { knownLines: sorted(known), learned: leadingParts(p, known) };
}

/** Если после изменения всё, что учим, выучено — завтра первый повтор; если нет — прежний повтор не нужен. */
function settle(p: Poem, patch: Partial<Poem>): Partial<Poem> {
  if (poemLearned({ ...p, ...patch })) {
    if (!p.review) patch.review = { due: dayKey(new Date(Date.now() + DAY)), interval: 1, reps: 0 };
  } else if (p.review) patch.review = undefined;
  return patch;
}

/** Отметить строки выученными («уже знаю») или снова учимыми. */
export function setKnown(p: Poem, idx: number[], on: boolean): Partial<Poem> {
  const k = knownSet(p);
  for (const i of idx) on ? k.add(i) : k.delete(i);
  return settle(p, withKnown(p, k));
}

/** «Не учу» / «Вернуть в учёбу». */
export function setSkip(p: Poem, idx: number[], on: boolean): Partial<Poem> {
  const sk = new Set(p.skipLines ?? []);
  for (const i of idx) on ? sk.add(i) : sk.delete(i);
  const next: Poem = { ...p, skipLines: sk.size ? sorted(sk) : undefined };
  return settle(p, { skipLines: next.skipLines, ...withKnown(next, knownSet(p)) });
}

export function setFocus(p: Poem, idx: number[], on: boolean): Partial<Poem> {
  const f = new Set(p.focusLines ?? []);
  for (const i of idx) on ? f.add(i) : f.delete(i);
  return { focusLines: f.size ? sorted(f) : undefined };
}

/** Своя подсказка для строк по памяти; null — как обычно. */
export function setCue(p: Poem, idx: number[], level: 0 | 1 | 2 | null): Partial<Poem> {
  const c = { ...(p.lineCue ?? {}) };
  for (const i of idx) level === null ? delete c[i] : (c[i] = level);
  return { lineCue: Object.keys(c).length ? c : undefined };
}

/** Слово «всегда открыто» ↔ как обычно. */
export function togglePin(p: Poem, line: number, word: number): Partial<Poem> {
  const s = new Set(p.pinWords ?? []);
  const k = keyOf(line, word);
  s.has(k) ? s.delete(k) : s.add(k);
  return { pinWords: s.size ? [...s] : undefined };
}

/** Какая подсказка у строки по памяти: свой уровень не бывает «скрытее» общего. */
export function effCue(p: Poem, line: number, base: CueLevel): CueLevel {
  const own = p.lineCue?.[line];
  return own === undefined ? base : (Math.min(base, own) as CueLevel);
}

/** Строки, по которым идёт тренировка: части по порядку, но только нужные строки. */
export function learnUnits(p: Poem, target: number[]): number[][] {
  const t = new Set(target);
  return poemParts(p.text, p.chunk)
    .map((pt) => Array.from({ length: pt.to - pt.from }, (_, i) => pt.from + i).filter((i) => t.has(i)))
    .filter((u) => u.length);
}

/** Какие шаги учёбы включены (по памяти — всегда). */
export type LearnStep = 'read' | 'half' | 'letters' | 'recall' | 'together';
export function enabledSteps(p: Poem): Set<LearnStep> {
  return new Set<LearnStep>(['recall', ...(p.steps ?? ['read', 'half', 'letters', 'together'])]);
}
export const togetherWindow = (p: Poem) => Math.max(1, Math.min(8, p.window ?? 4));

/**
 * Текст стиха поменяли — перенести личное (выучено, не учу, подсказки, трудные места) на те же строки в новом тексте.
 * Строки сопоставляются по смыслу (без знаков, регистра и «ё»), поэтому правка опечатки в одном месте не стирает всё остальное.
 */
export function remapPatch(old: Poem, text: string): Partial<Poem> {
  const a = poemLines(old.text).map((l) => wordsOf(l.text).map(normWord).join(' '));
  const b = poemLines(text).map((l) => wordsOf(l.text).map(normWord).join(' '));
  const W = b.length + 1;
  const dp = new Uint16Array((a.length + 1) * W);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i * W + j] = a[i] === b[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
  const map = new Map<number, number>(); // было → стало
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) map.set(i++, j++);
    else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
    else j++;
  }
  const moved = (xs: number[]) => sorted(xs.flatMap((i) => (map.has(i) ? [map.get(i)!] : [])));
  const known = moved([...knownSet(old)]);
  const lineMiss: number[] = [];
  (old.lineMiss ?? []).forEach((v, i) => map.has(i) && (lineMiss[map.get(i)!] = v));
  for (let i = 0; i < lineMiss.length; i++) lineMiss[i] ??= 0;
  const cue: Record<string, 0 | 1 | 2> = {};
  for (const [k, v] of Object.entries(old.lineCue ?? {})) if (map.has(+k)) cue[map.get(+k)!] = v;
  const pins = (old.pinWords ?? []).flatMap((k) => {
    const [l, w] = k.split(':').map(Number);
    return map.has(l) ? [keyOf(map.get(l)!, w)] : [];
  });
  const skip = moved(old.skipLines ?? []);
  const focus = moved(old.focusLines ?? []);
  const next: Poem = { ...old, text, knownLines: known, skipLines: skip.length ? skip : undefined };
  const patch: Partial<Poem> = {
    knownLines: known,
    skipLines: skip.length ? skip : undefined,
    focusLines: focus.length ? focus : undefined,
    lineMiss,
    lineCue: Object.keys(cue).length ? cue : undefined,
    pinWords: pins.length ? pins : undefined
  };
  patch.learned = leadingParts({ ...next, chunk: old.chunk }, new Set(known));
  if (!poemLearned({ ...next, ...patch })) patch.review = undefined;
  return patch;
}

/** Стихи, которые пора повторить сегодня. */
export function duePoems(data: AppData, now: Date): { topic: Topic; poem: Poem }[] {
  const today = dayKey(now);
  const out: { topic: Topic; poem: Poem }[] = [];
  for (const t of data.topics) for (const p of t.poems ?? []) if (p.review && p.review.due <= today && poemLearned(p)) out.push({ topic: t, poem: p });
  return out;
}

/** Строки, на которых чаще всего ошибаешься (для «С любого места» и подсветки). */
export function hardLines(p: Poem, min = 2): Set<number> {
  const s = new Set<number>();
  (p.lineMiss ?? []).forEach((v, i) => v >= min && s.add(i));
  return s;
}

/**
 * Случайные места для «С любого места»: трудные и отмеченные «повторять чаще» строки попадаются чаще.
 * pool — из каких строк выбирать (по умолчанию все); возвращает номера строк.
 */
export function pickStarts(p: Poem, count: number, rnd = Math.random, pool?: number[]): number[] {
  const seq = pool ?? poemLines(p.text).map((_, i) => i);
  if (seq.length < 2) return [];
  const focus = focusSet(p);
  const w = seq.slice(0, -1).map((line) => 1 + 2 * (p.lineMiss?.[line] ?? 0) + (focus.has(line) ? 4 : 0));
  const out: number[] = [];
  for (let k = 0; k < Math.min(count, seq.length - 1); k++) {
    const total = w.reduce((a, b) => a + b, 0);
    let r = rnd() * total;
    let i = 0;
    while (i < w.length - 1 && r >= w[i]) r -= w[i++];
    out.push(seq[i]);
    w[i] = 0; // не повторять одно место
    if (!w.some((x) => x > 0)) break;
  }
  return out;
}
