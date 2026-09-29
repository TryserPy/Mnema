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
  return { due: dayKey(new Date(now.getTime() + interval * DAY)), interval, reps };
}

export function poemLearned(p: Poem): boolean {
  return p.learned >= poemParts(p.text, p.chunk).length && poemLines(p.text).length > 0;
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

/** Случайные места для «С любого места»: трудные строки попадаются чаще. */
export function pickStarts(p: Poem, count: number, rnd = Math.random): number[] {
  const lines = poemLines(p.text);
  if (lines.length < 2) return [];
  const w = lines.slice(0, -1).map((_, i) => 1 + 2 * (p.lineMiss?.[i] ?? 0));
  const out: number[] = [];
  for (let k = 0; k < Math.min(count, lines.length - 1); k++) {
    const total = w.reduce((a, b) => a + b, 0);
    let r = rnd() * total;
    let i = 0;
    while (i < w.length - 1 && r >= w[i]) r -= w[i++];
    out.push(i);
    w[i] = 0; // не повторять одно место
    if (!w.some((x) => x > 0)) break;
  }
  return out;
}
