// Пробная контрольная: вопросы с вариантами ответа из карточек темы.
import { allItems, buildPrompt, normalizeAnswer, parseCloze } from './srs';
import type { AppData, Card } from './types';

export interface TestQuestion {
  key: string;
  cardId: string;
  question: string; // Markdown
  answer: string; // верный ответ (Markdown)
  kind: 'choice' | 'typed' | 'self';
  options?: string[];
  expected?: string; // для ввода
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

/** Вопросы теста по теме или (если дан `topicIds`) по нескольким темам — для пробной контрольной. */
export function buildTest(data: AppData, topicId: string, count: number, rnd: () => number = Math.random, topicIds?: string[]): TestQuestion[] {
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

/** Примерная школьная оценка по доле верных ответов. */
export function schoolGrade(correct: number, total: number): 2 | 3 | 4 | 5 {
  const p = total ? correct / total : 0;
  if (p >= 0.9) return 5;
  if (p >= 0.7) return 4;
  if (p >= 0.5) return 3;
  return 2;
}
