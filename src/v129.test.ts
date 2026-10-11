// Версия 1.29.0: подписи интервалов на кнопках оценки и прочие исправления этапа 1.
import { describe, expect, it } from 'vitest';
import { DAY, formatInterval, gradeItem, previewIntervals } from './srs';

describe('подписи интервалов на кнопках оценки', () => {
  it('коротко и по-русски', () => {
    expect(formatInterval(20_000)).toBe('<1 мин');
    expect(formatInterval(10 * 60_000)).toBe('10 мин');
    expect(formatInterval(3 * 3600_000)).toBe('3 ч');
    expect(formatInterval(DAY)).toBe('1 д');
    expect(formatInterval(3 * DAY)).toBe('3 д');
    expect(formatInterval(14 * DAY)).toBe('2 нед');
    expect(formatInterval(21 * DAY)).toBe('3 нед');
    expect(formatInterval(45 * DAY)).toBe('1,5 мес');
    expect(formatInterval(60 * DAY)).toBe('2 мес');
    expect(formatInterval(200 * DAY)).toBe('6,5 мес');
    expect(formatInterval(800 * DAY)).toBe('2,2 г');
  });
  it('показывает ровно то, что применит планировщик', () => {
    const now = new Date('2026-10-01T10:00:00');
    const s = gradeItem(undefined, now, 3, { retention: 0.9 });
    const later = new Date(s.due);
    const preview = previewIntervals(s, later, { retention: 0.9 });
    expect(preview).toHaveLength(4);
    // «Хорошо» из preview совпадает по порядку величины с реальным результатом (разница только в разбросе fuzz)
    const real = new Date(gradeItem(s, later, 3, { retention: 0.9 }).due).getTime() - later.getTime();
    expect(Math.abs(real - preview[2]) / Math.max(real, preview[2])).toBeLessThan(0.35);
    // чем лучше оценка, тем дальше повтор
    expect(preview[0]).toBeLessThan(preview[1]);
    expect(preview[1]).toBeLessThanOrEqual(preview[2]);
    expect(preview[2]).toBeLessThan(preview[3]);
  });
});

// ---------- Что показывать на главной кнопке: «Учить», «Учить новые», «Всё повторено», «Нечего повторять», «Нет карточек» ----------
import { buildQueue, itemKey } from './srs';
import { emptyData } from './store';
import { nextDueText, studyStatus } from './studyStatus';
import type { AppData, Card, ItemState } from './types';

const NOW = new Date('2026-10-11T12:00:00');
const card = (id: string, topicId = 't1'): Card => ({ id, topicId, type: 'basic', front: 'Q' + id, back: 'A' + id, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' });
const state = (dueInDays: number): ItemState => ({ due: new Date(NOW.getTime() + dueInDays * DAY).toISOString(), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: new Date(NOW.getTime() - 3 * DAY).toISOString() });
function world(cards: Card[], states: Record<string, ItemState> = {}): AppData {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'S', color: '#000', createdAt: '' }];
  d.topics = [
    { id: 't1', subjectId: 's1', name: 'T1', note: '', createdAt: '', updatedAt: '' },
    { id: 't2', subjectId: 's1', parentId: 't1', name: 'T2', note: '', createdAt: '', updatedAt: '' }
  ];
  d.cards = cards;
  d.states = Object.fromEntries(Object.entries(states).map(([id, s]) => [itemKey(id, 0), s]));
  return d;
}
const logToday = (d: AppData, id: string) => d.logs.push({ key: itemKey(id, 0), cardId: id, topicId: 't1', rating: 3, prevState: 2, at: new Date(NOW.getTime() - 3600_000).toISOString(), ms: 3000 });

describe('studyStatus: честная подпись главной кнопки', () => {
  it('нет карточек — «empty», а не «всё повторено»', () => {
    expect(studyStatus(world([]), NOW, { topicId: 't1' }).kind).toBe('empty');
  });
  it('пора повторять — «learn» с числом', () => {
    const d = world([card('a'), card('b')], { a: state(-1), b: state(-2) });
    expect(studyStatus(d, NOW, { topicId: 't1' })).toEqual({ kind: 'learn', due: 2, fresh: 0 });
  });
  it('только новые карточки в пределах дневного лимита — «learn»; когда лимит выбран — «new»', () => {
    const d = world([card('a'), card('b')]);
    expect(studyStatus(d, NOW, { topicId: 't1' }).kind).toBe('learn');
    d.settings = { ...d.settings, newPerDay: 0 };
    expect(studyStatus(d, NOW, { topicId: 't1' })).toEqual({ kind: 'new', fresh: 1 });
  });
  it('ничего не повторял, по расписанию пусто — «idle» со сроком следующего повтора, не «Всё повторено»', () => {
    const d = world([card('a')], { a: state(5) });
    const s = studyStatus(d, NOW, { topicId: 't1' });
    expect(s.kind).toBe('idle');
    if (s.kind === 'idle') expect(nextDueText(s.next)).toBe('через 5 д');
  });
  it('сегодня повторял и больше ничего нет — «done»', () => {
    const d = world([card('a')], { a: state(5) });
    logToday(d, 'a');
    expect(studyStatus(d, NOW, { topicId: 't1' }).kind).toBe('done');
  });
  it('повторял, но остались новые — «new», а не «done»', () => {
    const d = world([card('a'), card('n')], { a: state(5) });
    d.settings = { ...d.settings, newPerDay: 0 };
    logToday(d, 'a');
    expect(studyStatus(d, NOW, { topicId: 't1' }).kind).toBe('new');
  });
  it('карточки подтем считаются вместе с темой', () => {
    const d = world([card('a', 't2')], { a: state(-1) });
    expect(studyStatus(d, NOW, { topicId: 't1' }).kind).toBe('learn');
  });
  it('«Учить новые» действительно даёт новые карточки сверх дневного лимита', () => {
    const d = world([card('a'), card('b'), card('c')]);
    d.settings = { ...d.settings, newPerDay: 0 };
    expect(buildQueue(d, NOW, { topicId: 't1' }).length).toBe(0);
    const s = studyStatus(d, NOW, { topicId: 't1' });
    expect(s.kind).toBe('new');
    if (s.kind === 'new') expect(buildQueue(d, NOW, { topicId: 't1', extraNew: s.fresh }).length).toBe(s.fresh);
  });
  it('список по cardIds (термины) работает так же', () => {
    const d = world([card('a'), card('b')], { a: state(3), b: state(4) });
    expect(studyStatus(d, NOW, { cardIds: ['a', 'b'] }).kind).toBe('idle');
    expect(studyStatus(d, NOW, { cardIds: [] }).kind).toBe('empty');
  });
});

describe('nextDueText', () => {
  it('коротко', () => {
    expect(nextDueText(null)).toBe('');
    expect(nextDueText(3600_000)).toBe('завтра');
    expect(nextDueText(2 * DAY)).toBe('через 2 д');
    expect(nextDueText(21 * DAY)).toBe('через 3 нед');
  });
});
