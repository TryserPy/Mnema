// 1.34: «Сделать копию» можно отменить из тоста — копия исчезает совсем, в корзину не попадает, оригинал не трогается.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { itemKey } from './srs';
import { duplicateSubject, duplicateTopic, emptyData, getData, replaceData, undoCopy } from './store';
import type { AppData, Card, Topic } from './types';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T10:00:00'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const T0 = '2026-09-01T10:00:00.000Z';
const topic = (id: string, extra: Partial<Topic> = {}): Topic => ({ id, subjectId: 's1', name: 'Тема ' + id, note: 'Конспект ' + id, createdAt: T0, updatedAt: T0, ...extra });
const card = (id: string, topicId: string): Card => ({ id, topicId, type: 'basic', front: 'Вопрос ' + id, back: 'Ответ ' + id, createdAt: T0, updatedAt: T0 });

function world(): AppData {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'Биология', color: '#0a0', createdAt: T0 }];
  d.topics = [topic('t1'), topic('t1a', { parentId: 't1' })];
  d.cards = [card('c1', 't1'), card('c2', 't1a')];
  d.states[itemKey('c1', 0)] = { due: T0, stability: 4, difficulty: 5, elapsed_days: 1, scheduled_days: 3, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: T0 };
  return d;
}

describe('отмена копии', () => {
  it('предмет: копия со всеми темами и карточками исчезает, корзина пуста, оригинал цел', () => {
    replaceData(world());
    const before = JSON.stringify({ s: getData().subjects, t: getData().topics, c: getData().cards });
    const copy = duplicateSubject('s1')!;
    expect(getData().subjects).toHaveLength(2);
    expect(getData().topics.length).toBeGreaterThan(2);
    undoCopy('subject', copy.id);
    expect(JSON.stringify({ s: getData().subjects, t: getData().topics, c: getData().cards })).toBe(before);
    expect(getData().trash ?? []).toHaveLength(0);
    expect(getData().states[itemKey('c1', 0)]).toBeTruthy();
  });

  it('тема с подтемой: копия исчезает целиком', () => {
    replaceData(world());
    const copy = duplicateTopic('t1')!;
    const n = getData().topics.length;
    expect(n).toBe(4);
    undoCopy('topic', copy.id);
    expect(getData().topics.map((t) => t.id).sort()).toEqual(['t1', 't1a']);
    expect(getData().cards.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(getData().trash ?? []).toHaveLength(0);
  });

  it('прежние записи корзины не теряются', () => {
    const d = world();
    d.trash = [{ id: 'old', at: '2026-10-04T10:00:00.000Z', label: 'Тема «Старое»', removed: { subjects: [], topics: [topic('z')], cards: [], states: {}, logs: [], marks: ['topic:z'] } }];
    replaceData(d);
    const copy = duplicateTopic('t1')!;
    undoCopy('topic', copy.id);
    expect((getData().trash ?? []).map((t) => t.id)).toEqual(['old']);
  });
});
