// Тесты «Статистики» 1.8.1: единый порог выборки, цифры за период, слабые темы.
import { describe, expect, it } from 'vitest';
import { MIN_SAMPLE, periodStats, retentionOf, topicAccuracy, WEAK_BELOW, weakTopics, weekSummary } from './progress';
import { emptyData } from './store';
import type { AppData, ReviewLogEntry } from './types';

const NOW = new Date('2026-09-30T12:00:00Z'); // среда
const DAY_MS = 24 * 3600 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS).toISOString();

let seq = 0;
const log = (p: Partial<ReviewLogEntry> & { topicId: string }): ReviewLogEntry => ({
  key: 'c' + ++seq + ':0',
  cardId: 'c' + seq,
  rating: 3,
  prevState: 2,
  at: daysAgo(1),
  ms: 6000,
  ...p
});

/** Несколько ответов в одной теме: ok верных и bad «Снова». */
const answers = (topicId: string, ok: number, bad: number, at = daysAgo(1)): ReviewLogEntry[] => [
  ...Array.from({ length: ok }, () => log({ topicId, rating: 3, at })),
  ...Array.from({ length: bad }, () => log({ topicId, rating: 1, at }))
];

function dataWith(logs: ReviewLogEntry[], topics = ['t1', 't2', 't3', 't4']): AppData {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'S', color: '#000', createdAt: '' }];
  d.topics = topics.map((id) => ({ id, subjectId: 's1', name: 'Тема ' + id, note: '', createdAt: '', updatedAt: '' }));
  d.logs = logs;
  return d;
}

const since = (days: number) => NOW.getTime() - days * DAY_MS;

describe('1.8.1: «Запоминание» — один порог выборки', () => {
  it('порог один и равен 5', () => {
    expect(MIN_SAMPLE).toBe(5);
  });

  it('меньше 5 ответов на давно выученные — процента нет, а не «100 %» по одной карточке', () => {
    expect(retentionOf(answers('t1', 1, 0)).pct).toBeNull();
    expect(retentionOf(answers('t1', 4, 0)).pct).toBeNull();
    expect(retentionOf(answers('t1', 4, 0)).n).toBe(4);
  });

  it('ровно 5 — процент считается', () => {
    expect(retentionOf(answers('t1', 4, 1)).pct).toBe(80);
    expect(retentionOf(answers('t1', 5, 0)).pct).toBe(100);
  });

  it('новые и учебные карточки в «Запоминание» не входят', () => {
    const logs = [...answers('t1', 4, 1), log({ topicId: 't1', prevState: 0, rating: 1 }), log({ topicId: 't1', prevState: 1, rating: 1 })];
    expect(retentionOf(logs)).toEqual({ pct: 80, n: 5 });
  });

  it('«Итоги недели» используют тот же порог, что и цифры за период', () => {
    // Прошлая неделя: пн 21 – вс 27 сентября. По 4 и по 5 ответов на давно выученные.
    const few = dataWith(answers('t1', 4, 0, '2026-09-23T10:00:00Z'));
    const enough = dataWith(answers('t1', 4, 1, '2026-09-23T10:00:00Z'));
    expect(weekSummary(few, NOW, 1).retention).toBeNull();
    expect(weekSummary(enough, NOW, 1).retention).toBe(80);
    expect(periodStats(few, since(30)).retention).toBeNull();
    expect(periodStats(enough, since(30)).retention).toBe(80);
  });
});

describe('1.8.1: цифры за период', () => {
  it('считает только ответы с момента since', () => {
    const d = dataWith([...answers('t1', 3, 0, daysAgo(2)), ...answers('t1', 4, 0, daysAgo(20))]);
    expect(periodStats(d, since(7)).answers).toBe(3);
    expect(periodStats(d, since(30)).answers).toBe(7);
  });

  it('минуты, ошибки «с уверенностью» и число ответов с оценкой уверенности', () => {
    const d = dataWith([
      log({ topicId: 't1', ms: 90_000, confidence: 2, rating: 1 }), // уверен — и ошибся
      log({ topicId: 't1', ms: 30_000, confidence: 2, rating: 3 }),
      log({ topicId: 't1', ms: 30_000, confidence: 0, rating: 1 }), // не уверен и ошибся — не в счёт
      log({ topicId: 't1', ms: 0 }) // без оценки уверенности
    ]);
    const s = periodStats(d, since(30));
    expect(s.answers).toBe(4);
    expect(s.minutes).toBe(3);
    expect(s.overconf).toBe(1);
    expect(s.confN).toBe(3);
  });

  it('без ответов — нули и «—» вместо запоминания', () => {
    expect(periodStats(dataWith([]), since(30))).toEqual({ answers: 0, minutes: 0, retention: null, retentionN: 0, overconf: 0, confN: 0 });
  });
});

describe('1.8.1: слабые темы', () => {
  it('порог слабости — 80 %', () => {
    expect(WEAK_BELOW).toBe(0.8);
  });

  it('сильные темы (88–90 %) не попадают в слабые — списка «лучших из сильных» нет', () => {
    const d = dataWith([...answers('t1', 22, 3), ...answers('t2', 9, 1)]); // 88 % и 90 %
    expect(weakTopics(d, since(30))).toEqual([]);
  });

  it('ровно 80 % — ещё не слабая, 60 % — слабая', () => {
    const d = dataWith([...answers('t1', 4, 1), ...answers('t2', 3, 2)]);
    expect(weakTopics(d, since(30)).map((t) => t.id)).toEqual(['t2']);
  });

  it('меньше 5 ответов за период — тема не оценивается', () => {
    const d = dataWith([...answers('t1', 0, 4), ...answers('t2', 2, 3)]);
    expect(weakTopics(d, since(30)).map((t) => t.id)).toEqual(['t2']);
    expect(weakTopics(d, since(30), { minAnswers: 4 }).map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('сначала больше ошибок, потом ниже процент, потом свежее', () => {
    const d = dataWith([
      ...answers('t1', 6, 4), // 4 ошибки, 60 %
      ...answers('t2', 0, 5), // 5 ошибок, 0 %
      ...answers('t3', 12, 4, daysAgo(3)), // 4 ошибки, 75 %
      ...answers('t4', 6, 4, daysAgo(2)) // 4 ошибки, 60 %, но ответ раньше, чем у t1
    ]);
    // t2 (5 ошибок) → затем 4 ошибки: t1 и t4 по 60 % (t1 свежее: вчера против позавчера) → t3 (75 %)
    expect(weakTopics(d, since(30)).map((t) => t.id)).toEqual(['t2', 't1', 't4', 't3']);
  });

  it('ограничивает длину списка', () => {
    const topics = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const d = dataWith(topics.flatMap((t) => answers(t, 0, 5)), topics);
    expect(weakTopics(d, since(30))).toHaveLength(5);
    expect(weakTopics(d, since(30), { limit: 2 })).toHaveLength(2);
  });

  it('смотрит только на выбранный период', () => {
    const d = dataWith(answers('t1', 0, 6, daysAgo(20)));
    expect(weakTopics(d, since(7))).toEqual([]);
    expect(weakTopics(d, since(30)).map((t) => t.id)).toEqual(['t1']);
  });

  it('ответы удалённой темы пропускаются', () => {
    const d = dataWith(answers('gone', 0, 6));
    expect(weakTopics(d, since(30))).toEqual([]);
    expect(topicAccuracy(d, since(30))).toEqual([]);
  });

  it('процент округляется вниз: 79,6 % не превращается в «80 %» у слабой темы', () => {
    const d = dataWith(answers('t1', 39, 10)); // 39 из 49 = 79,59 %
    const [w] = weakTopics(d, since(30));
    expect(w.pct).toBe(79);
    expect(w.wrong).toBe(10);
    expect(w.total).toBe(49);
  });

  it('без логов — пусто', () => {
    expect(weakTopics(dataWith([]), since(30))).toEqual([]);
  });
});
