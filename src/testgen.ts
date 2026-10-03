// Пробная контрольная: вопросы с вариантами ответа из карточек темы, а ещё «Соедини пары» и «Расставь по порядку».
// Это проверка, а не повторение: расписание карточек она не меняет (узнать легче, чем вспомнить, — интервалы бы завысились).
import { yearOf } from './important';
import { allItems, buildPrompt, normalizeAnswer, parseCloze } from './srs';
import type { AppData, Card } from './types';

export interface TestQuestion {
  key: string;
  cardId: string;
  question: string; // Markdown
  answer: string; // верный ответ (Markdown)
  kind: 'choice' | 'typed' | 'self' | 'match' | 'order';
  options?: string[];
  expected?: string; // для ввода
  cardIds?: string[]; // все карточки задания — для «Повторить ошибки» («Соедини пары», «По порядку» из дат)
  pairs?: { left: string; right: string }[]; // «Соедини пары»: верные пары
  rights?: string[]; // «Соедини пары»: правый столбец в том порядке, как показать
  steps?: string[]; // «По порядку»: верный порядок
  shuffled?: string[]; // «По порядку»: как показать
}

/** Короткий «ответ» элемента карточки — то, что будет вариантом в тесте. */
export function itemAnswer(card: Card, ord: number): string {
  if (card.type === 'reverse') return ord === 1 ? card.front : card.back;
  if (card.type === 'typing') return card.back.split('|')[0].trim();
  if (card.type === 'problem') return '';
  if (card.type === 'cloze')
    return parseCloze(card.front)
      .flatMap((p) => (p.cloze && p.cloze.index === ord ? [p.cloze.answer] : []))
      .join(', ');
  return card.back;
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Вопросы теста по теме или (если дан `topicIds`) по нескольким темам — для пробной контрольной.
 *  `extras` — добавить «Соедини пары» и «Расставь по порядку» (по одному, если есть из чего; вместо обычных вопросов, число вопросов то же). */
export function buildTest(data: AppData, topicId: string, count: number, rnd: () => number = Math.random, topicIds?: string[], opts: { extras?: boolean } = {}): TestQuestion[] {
  const regular = regularQuestions(data, topicId, count, rnd, topicIds);
  if (!opts.extras || regular.length < 5) return regular;
  const ids = topicIds?.length ? topicIds : [topicId];
  const cards = data.cards.filter((c) => ids.includes(c.topicId));
  const extra = [matchQuestion(cards, rnd), orderQuestion(data, ids, cards, rnd)].filter((q): q is TestQuestion => Boolean(q));
  const out = regular.slice(0, regular.length - extra.length);
  // Не подряд и не в самом начале: примерно на трети и двух третях теста.
  const base = out.length;
  extra.forEach((q, k) => out.splice(Math.round(((k + 1) * base) / (extra.length + 1)) + k, 0, q));
  return out;
}

function regularQuestions(data: AppData, topicId: string, count: number, rnd: () => number, topicIds?: string[]): TestQuestion[] {
  const topic = data.topics.find((t) => t.id === topicId);
  if (!topic) return [];
  const cardsById = new Map(data.cards.map((c) => [c.id, c]));
  const own = topicIds?.length ? [...new Map(topicIds.flatMap((id) => allItems(data, { topicId: id })).map((it) => [it.key, it])).values()] : allItems(data, { topicId });
  const subjectItems = allItems(data, { subjectId: topic.subjectId });

  const answerOf = (it: { cardId: string; ord: number }) => itemAnswer(cardsById.get(it.cardId)!, it.ord);
  // Вид ответа: пропуск, термин (короткое название) или определение — варианты берём того же вида.
  const kindOf = (it: { cardId: string; ord: number }) => {
    const c = cardsById.get(it.cardId)!;
    if (c.type === 'cloze') return 'cloze';
    if (c.type === 'typing' || (c.type === 'reverse' && it.ord === 1)) return 'term';
    return 'def';
  };

  const picked = shuffle(own, rnd).slice(0, count);
  return picked.map((it) => {
    const card = cardsById.get(it.cardId)!;
    const p = buildPrompt(card, it.ord);
    const answer = answerOf(it);
    const base = { key: it.key, cardId: it.cardId, question: p.question, answer: card.type === 'cloze' ? answer : p.answer };
    if (card.type === 'typing') return { ...base, kind: 'typed' as const, expected: card.back };
    if (answer.length > 140 || !answer.trim()) return { ...base, kind: 'self' as const };
    // Неверные варианты: ответы других карточек той же темы, потом предмета, того же вида.
    const seen = new Set([normalizeAnswer(answer)]);
    const distractors: string[] = [];
    const kind = kindOf(it);
    const similarLength = (a: string) => a.length >= answer.length / 3 && a.length <= answer.length * 3 + 10;
    for (const pool of [own, subjectItems]) {
      // Сначала варианты похожей длины — чтобы верный ответ не выделялся.
      const candidates = shuffle(pool, rnd)
        .filter((o) => o.cardId !== it.cardId && kindOf(o) === kind)
        .map((o) => answerOf(o))
        .filter((a) => a.trim() && a.length <= 140 && similarLength(a));
      for (const a of candidates) {
        if (distractors.length >= 3) break;
        const n = normalizeAnswer(a);
        if (seen.has(n)) continue;
        seen.add(n);
        distractors.push(a);
      }
    }
    if (distractors.length < 3) return { ...base, kind: 'self' as const };
    return { ...base, kind: 'choice' as const, options: shuffle([answer, ...distractors], rnd) };
  });
}

// ---------- «Соедини пары» ----------

/** Сторона карточки годится в короткую плитку: одна строка, без картинок и пропусков. */
const shortSide = (x: string) => Boolean(x.trim()) && x.length <= 90 && !x.includes('\n') && !/!\[|<img|\{\{/.test(x);

/** «Соедини пары» из 4 коротких карточек «вопрос — ответ». Меньше 4 подходящих — задания нет. */
export function matchQuestion(cards: Card[], rnd: () => number = Math.random): TestQuestion | null {
  const seenL = new Set<string>();
  const seenR = new Set<string>();
  const ok: { id: string; left: string; right: string }[] = [];
  for (const c of shuffle(cards, rnd)) {
    if (c.type !== 'basic' && c.type !== 'reverse' && c.type !== 'typing') continue;
    const left = c.front.trim();
    const right = (c.type === 'typing' ? c.back.split('|')[0] : c.back).trim();
    if (!shortSide(left) || !shortSide(right)) continue;
    const l = normalizeAnswer(left);
    const r = normalizeAnswer(right);
    if (seenL.has(l) || seenR.has(r) || seenL.has(r) || seenR.has(l)) continue;
    seenL.add(l);
    seenR.add(r);
    ok.push({ id: c.id, left, right });
    if (ok.length === 4) break;
  }
  if (ok.length < 4) return null;
  const pairs = ok.map(({ left, right }) => ({ left, right }));
  let rights = shuffle(pairs.map((p) => p.right), rnd);
  // Перемешано так, что всё уже на местах, — сдвинуть, иначе задание решается само.
  if (rights.every((r, i) => r === pairs[i].right)) rights = [...rights.slice(1), rights[0]];
  return {
    key: 'match:' + ok.map((x) => x.id).join(','),
    cardId: ok[0].id,
    cardIds: ok.map((x) => x.id),
    kind: 'match',
    question: 'Соедини пары: что к чему подходит',
    answer: pairs.map((p) => `- ${p.left} — ${p.right}`).join('\n'),
    pairs,
    rights
  };
}

// ---------- «Расставь по порядку» ----------

/** Сторона карточки — дата: «1861», «1853–1856 гг.», «19 февраля 1861 г.», «XIX век». Просто число (скорость света 300 000) — не дата. */
export function isDate(x: string): boolean {
  const t = x.trim();
  return /^(?:\d{1,2}\s+[а-яё]+\s+)?\d{3,4}(?:\s*[–—-]\s*\d{3,4})?\s*(?:г\.?|гг\.?|года?|годы)?$/i.test(t) || /^[IVXLC]{1,6}\s+(?:век|в\.)/.test(t);
}

/** Пункты по порядку из конспекта: нумерованные списки (1. 2. 3.) и цепочки «А → Б → В». Только где порядок настоящий. */
export function noteSequences(note: string): { title?: string; steps: string[] }[] {
  const out: { title?: string; steps: string[] }[] = [];
  const lines = note.split('\n');
  const plain = (x: string) => x.replace(/[*_`#>]/g, '').trim();
  const fits = (x: string, max: number) => Boolean(plain(x)) && plain(x).length <= max;
  let i = 0;
  while (i < lines.length) {
    const m = /^(\d+)[.)]\s+(.+)$/.exec(lines[i]);
    if (!m || m[1] !== '1') {
      // Цепочка через стрелки в одной строке.
      const line = lines[i].replace(/^\s*[-*+]\s+/, '');
      if (/→|->/.test(line)) {
        const colon = line.indexOf(':');
        const head = colon > 0 && colon < 60 && !/→|->/.test(line.slice(0, colon)) ? plain(line.slice(0, colon)) : undefined;
        const parts = (head ? line.slice(colon + 1) : line).split(/\s*(?:→|->)\s*/).map((x) => x.trim().replace(/[.;]$/, ''));
        if (parts.length >= 3 && parts.every((x) => fits(x, 60))) out.push({ title: head, steps: parts });
      }
      i++;
      continue;
    }
    // Нумерованный список: 1, 2, 3… подряд.
    let prev = i - 1;
    while (prev >= 0 && !lines[prev].trim()) prev--;
    const before = prev >= 0 ? plain(lines[prev]).replace(/:$/, '') : '';
    const steps: string[] = [];
    let n = 1;
    while (i < lines.length) {
      const k = /^(\d+)[.)]\s+(.+)$/.exec(lines[i]);
      if (!k || Number(k[1]) !== n) break;
      steps.push(k[2].trim());
      n++;
      i++;
    }
    if (steps.length >= 3 && steps.every((x) => fits(x, 120))) out.push({ title: before && before.length <= 80 && !/^\d+[.)]/.test(before) ? before : undefined, steps });
  }
  return out;
}

function distinctTexts(xs: string[]) {
  return new Set(xs.map((x) => normalizeAnswer(x))).size === xs.length;
}

/** «Расставь по порядку»: события с датами из карточек (список «Даты» и любые карточки «дата — событие») или шаги из конспекта. */
export function orderQuestion(data: AppData, topicIds: string[], cards: Card[], rnd: () => number = Math.random): TestQuestion | null {
  const variants: TestQuestion[] = [];
  // 1. Даты.
  const dated: { id: string; year: number; label: string; event: string }[] = [];
  const years = new Set<number>();
  for (const c of shuffle(cards, rnd)) {
    if (c.type !== 'basic' && c.type !== 'reverse' && c.type !== 'typing') continue;
    const [d, e] = isDate(c.front) ? [c.front, c.back] : isDate(c.back) ? [c.back, c.front] : [null, null];
    if (!d || !e || !shortSide(e) || isDate(e)) continue;
    const year = yearOf(d);
    if (year == null || years.has(year)) continue;
    years.add(year);
    dated.push({ id: c.id, year, label: d.trim(), event: e.trim() });
    if (dated.length === 4) break;
  }
  if (dated.length >= 3 && distinctTexts(dated.map((x) => x.event))) {
    dated.sort((a, b) => a.year - b.year);
    variants.push(orderOf(dated.map((x) => x.event), 'Расставь события по времени — от раннего к позднему', 'order:dates:' + dated.map((x) => x.id).join(','), dated.map((x) => x.id), rnd, dated.map((x) => `${x.label} — ${x.event}`)));
  }
  // 2. Шаги из конспекта.
  for (const id of topicIds) {
    const t = data.topics.find((x) => x.id === id);
    if (!t?.note) continue;
    noteSequences(t.note).forEach((sq, k) => {
      let steps = sq.steps;
      // Длинный список — кусок из 5 пунктов подряд.
      if (steps.length > 5) {
        const from = Math.floor(rnd() * (steps.length - 4));
        steps = steps.slice(from, from + 5);
      }
      if (!distinctTexts(steps)) return;
      const q = sq.title ? `Расставь по порядку: ${sq.title}` : `Расставь по порядку (тема «${t.name}»)`;
      variants.push(orderOf(steps, q, `order:note:${id}:${k}`, [], rnd));
    });
  }
  if (!variants.length) return null;
  return variants[Math.floor(rnd() * variants.length)];
}

function orderOf(steps: string[], question: string, key: string, ids: string[], rnd: () => number, answerLines = steps): TestQuestion {
  let shuffled = shuffle(steps, rnd);
  if (shuffled.every((x, i) => x === steps[i])) shuffled = [...shuffled].reverse();
  return {
    key,
    cardId: ids[0] ?? '',
    cardIds: ids,
    kind: 'order',
    question,
    answer: answerLines.map((x, i) => `${i + 1}. ${x}`).join('\n'),
    steps,
    shuffled
  };
}

/** Примерная школьная оценка по доле верных ответов. */
export function schoolGrade(correct: number, total: number): 2 | 3 | 4 | 5 {
  const p = total ? correct / total : 0;
  if (p >= 0.9) return 5;
  if (p >= 0.7) return 4;
  if (p >= 0.5) return 3;
  return 2;
}
