// 1.20.0: экран «Знания» — плитки предметов и поиск по темам.
import { describe, expect, it } from 'vitest';
import { findTopics, subjectTiles } from './screens/Knowledge';
import { itemKey } from './srs';
import { emptyData } from './store';
import type { AppData, Card, Topic } from './types';

const T0 = '2026-09-01T10:00:00.000Z';
const topic = (id: string, subjectId: string, name: string, extra: Partial<Topic> = {}): Topic => ({ id, subjectId, name, note: '', createdAt: T0, updatedAt: T0, ...extra });
const card = (id: string, topicId: string): Card => ({ id, topicId, type: 'basic', front: id, back: id, createdAt: T0, updatedAt: T0 });

function world(): AppData {
  const d = emptyData();
  d.subjects = [
    { id: 's1', name: 'Биология', color: '#0a0', createdAt: T0 },
    { id: 's2', name: 'История', color: '#a00', createdAt: T0 }
  ];
  d.topics = [topic('t1', 's1', 'Клетка'), topic('t1a', 's1', 'Ядро клетки', { parentId: 't1' }), topic('t2', 's1', 'Ткани'), topic('t3', 's2', 'Клеймо Руси'), topic('r1', 's1', 'Правило', { kind: 'rule' })];
  d.cards = [card('c1', 't1'), card('c2', 't1'), card('c3', 't1a'), card('c4', 't2')];
  // c1 и c2 хорошо запомнены, остальные ещё не начаты
  for (const id of ['c1', 'c2']) d.states[itemKey(id, 0)] = { due: '2099-01-01T00:00:00.000Z', stability: 10, difficulty: 5, elapsed_days: 1, scheduled_days: 10, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: T0 };
  return d;
}

describe('плитки предметов', () => {
  it('считают темы без правил и долю выученного вместе с подтемами', () => {
    const tiles = subjectTiles(world(), new Date('2026-10-05T10:00:00'));
    const bio = tiles.find((t) => t.subject.id === 's1')!;
    expect(bio.topics).toBe(3); // Клетка, Ядро клетки, Ткани — правило не считается
    expect(bio.pct).toBe(50); // 2 из 4 карточек
    expect(bio.due).toBeGreaterThan(0); // не начатые карточки ждут
  });
  it('предмет без карточек — без процента', () => {
    expect(subjectTiles(world(), new Date('2026-10-05T10:00:00')).find((t) => t.subject.id === 's2')!.pct).toBeNull();
  });
});

describe('поиск тем', () => {
  it('пустой запрос — пусто', () => expect(findTopics(world(), '  ')).toEqual([]));
  it('ищет без учёта регистра, сначала начинающиеся с запроса, правила не берёт', () => {
    expect(findTopics(world(), 'КЛЕ').map((t) => t.id)).toEqual(['t3', 't1', 't1a']);
    expect(findTopics(world(), 'правило')).toEqual([]);
  });
  it('не больше limit', () => expect(findTopics(world(), 'е', 2)).toHaveLength(2));
});
