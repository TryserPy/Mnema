import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { buildPrompt, buildQueue, checkTyped, dayKey, formatInterval, gradeItem, itemOrds, parseCloze, previewIntervals, streak, DAY } from './srs';
import { DEFAULT_SETTINGS, emptyData, normalizeData } from './store';
import type { AppData, Card } from './types';

const card = (p: Partial<Card>): Card => ({ id: 'c1', topicId: 't1', type: 'basic', front: 'Q', back: 'A', createdAt: '', updatedAt: '', ...p });

function dataWith(cards: Card[]): AppData {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'S', color: '#000', createdAt: '' }];
  d.topics = [
    { id: 't1', subjectId: 's1', name: 'T1', note: '', createdAt: '', updatedAt: '' },
    { id: 't2', subjectId: 's1', name: 'T2', note: '', createdAt: '', updatedAt: '' }
  ];
  d.cards = cards;
  return d;
}

describe('пропуски', () => {
  it('разбирает пропуски и подсказки', () => {
    const parts = parseCloze('Ток {{пропорционален::как?}} {{напряжению}}.');
    expect(parts.filter((p) => p.cloze).map((p) => p.cloze)).toEqual([
      { index: 0, answer: 'пропорционален', hint: 'как?' },
      { index: 1, answer: 'напряжению', hint: undefined }
    ]);
  });
  it('каждый пропуск — отдельный элемент', () => {
    const c = card({ type: 'cloze', front: 'a {{b}} c {{d}}', back: '' });
    expect(itemOrds(c)).toEqual([0, 1]);
    expect(buildPrompt(c, 1).question).toBe('a b c **[…]**');
    expect(buildPrompt(c, 1).answer).toBe('a b c ==d==');
  });
  it('двусторонняя даёт две стороны', () => {
    const c = card({ type: 'reverse', front: 'term', back: 'def' });
    expect(itemOrds(c)).toEqual([0, 1]);
    expect(buildPrompt(c, 1)).toEqual({ question: 'def', answer: 'term' });
  });
});

describe('ввод ответа', () => {
  it('не учитывает регистр, ё и точку', () => {
    expect(checkTyped('Кислород.', 'кислород')).toBe(true);
    expect(checkTyped('ёж', 'Еж')).toBe(true);
    expect(checkTyped('O2', 'кислород|O2')).toBe(true);
    expect(checkTyped('азот', 'кислород')).toBe(false);
  });
});

describe('FSRS', () => {
  const now = new Date('2026-09-25T10:00:00');
  it('интервалы растут от «Снова» к «Легко»', () => {
    const iv = previewIntervals(undefined, now, DEFAULT_SETTINGS);
    expect(iv[0]).toBeLessThan(iv[1]);
    expect(iv[1]).toBeLessThanOrEqual(iv[2]);
    expect(iv[2]).toBeLessThan(iv[3]);
  });
  it('после нескольких «Хорошо» интервал становится больше дня', () => {
    let s = gradeItem(undefined, now, Rating.Good, DEFAULT_SETTINGS);
    let t = new Date(s.due);
    for (let i = 0; i < 3; i++) {
      s = gradeItem(s, t, Rating.Good, DEFAULT_SETTINGS);
      t = new Date(s.due);
    }
    expect(s.state).toBe(2);
    expect(new Date(s.due).getTime() - now.getTime()).toBeGreaterThan(DAY);
  });
  it('более высокое желаемое запоминание даёт более короткие интервалы', () => {
    const s = gradeItem(gradeItem(undefined, now, Rating.Good, DEFAULT_SETTINGS), new Date(now.getTime() + 10 * 60_000), Rating.Good, DEFAULT_SETTINGS);
    const t = new Date(s.due);
    const lo = previewIntervals(s, t, { retention: 0.8 })[2];
    const hi = previewIntervals(s, t, { retention: 0.95 })[2];
    expect(hi).toBeLessThan(lo);
  });
  it('форматирует интервалы', () => {
    expect(formatInterval(10 * 60_000)).toBe('10 мин');
    expect(formatInterval(3 * DAY)).toBe('3 д');
    expect(formatInterval(60 * DAY)).toBe('2 мес');
  });
});

describe('очередь', () => {
  const now = new Date('2026-09-25T10:00:00');
  it('ограничивает число новых и не берёт две стороны одной карточки в один день', () => {
    const cards = Array.from({ length: 30 }, (_, i) => card({ id: 'c' + i, type: i === 0 ? 'reverse' : 'basic' }));
    const d = dataWith(cards);
    d.settings.newPerDay = 10;
    const q = buildQueue(d, now, {}, () => 0.3);
    expect(q.length).toBe(10);
    expect(q.filter((x) => x.cardId === 'c0').length).toBe(1);
  });
  it('берёт карточки к повторению и чередует темы', () => {
    const cards = [card({ id: 'a1', topicId: 't1' }), card({ id: 'a2', topicId: 't1' }), card({ id: 'b1', topicId: 't2' }), card({ id: 'b2', topicId: 't2' })];
    const d = dataWith(cards);
    d.settings.newPerDay = 0;
    const past = new Date(now.getTime() - DAY).toISOString();
    for (const c of cards) d.states[c.id + ':0'] = { due: past, stability: 5, difficulty: 5, elapsed_days: 5, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: past };
    const q = buildQueue(d, now, {}, () => 0.1);
    expect(q.length).toBe(4);
    expect(q[0].topicId).not.toBe(q[1].topicId);
  });
  it('в режиме «перед контрольной» берёт все карточки темы', () => {
    const d = dataWith([card({ id: 'a1' }), card({ id: 'a2', type: 'reverse' }), card({ id: 'b1', topicId: 't2' })]);
    expect(buildQueue(d, now, { topicId: 't1', cram: true }).length).toBe(3);
  });
});

describe('дни и серия', () => {
  it('до 4 утра — ещё вчера', () => {
    expect(dayKey(new Date('2026-09-25T03:30:00'), 4)).toBe('2026-09-24');
    expect(dayKey(new Date('2026-09-25T04:30:00'), 4)).toBe('2026-09-25');
  });
  it('считает серию дней', () => {
    const d = dataWith([]);
    const mk = (iso: string) => ({ key: 'x', cardId: 'x', topicId: 't1', rating: 3 as const, prevState: 2, at: iso, ms: 1000 });
    d.logs = [mk('2026-09-22T12:00:00'), mk('2026-09-23T12:00:00'), mk('2026-09-24T12:00:00')];
    expect(streak(d, new Date('2026-09-25T10:00:00'))).toBe(3);
    d.logs.push(mk('2026-09-25T09:00:00'));
    expect(streak(d, new Date('2026-09-25T10:00:00'))).toBe(4);
  });
});

describe('данные', () => {
  it('отклоняет чужие файлы и дополняет настройки', () => {
    expect(() => normalizeData({ foo: 1 })).toThrow();
    const d = normalizeData({ version: 1, subjects: [], topics: [], cards: [], settings: { newPerDay: 5 } });
    expect(d.settings.newPerDay).toBe(5);
    expect(d.settings.retention).toBe(0.9);
  });
});
