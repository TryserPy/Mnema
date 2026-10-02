// Этап 7 (2.0): корзина — недавно удалённое лежит на этом устройстве и возвращается; в обмен (облако, Wi-Fi, копия) не уходит.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { itemKey } from './srs';
import { deleteCard, deleteCardsUndoable, deleteMany, deleteSubject, deleteTopic, emptyData, exportJson, forSync, getData, normalizeData, purgeTrash, replaceData, restoreFromTrash, restoreRemoved } from './store';
import { mergeData } from './sync';
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
  d.topics = [topic('t1'), topic('t2'), topic('t1a', { parentId: 't1' })];
  d.cards = [card('c1', 't1'), card('c2', 't1'), card('c3', 't2'), card('c4', 't1a')];
  for (const c of d.cards) d.states[itemKey(c.id, 0)] = { due: T0, stability: 4, difficulty: 5, elapsed_days: 1, scheduled_days: 3, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: T0 };
  d.logs = d.cards.map((c) => ({ key: itemKey(c.id, 0), cardId: c.id, topicId: c.topicId, rating: 3 as const, prevState: 2, at: T0, ms: 3000 }));
  return d;
}

describe('удаление кладёт в корзину, возврат возвращает всё', () => {
  it('тема с подтемой и карточками: запись в корзине, возврат — конспект, карточки, прогресс', () => {
    replaceData(world());
    deleteTopic('t1');
    let d = getData();
    expect(d.topics.map((t) => t.id)).toEqual(['t2']);
    expect(d.trash).toHaveLength(1);
    expect(d.trash![0].label).toBe('Тема «Тема t1» · 2 темы, 3 карточки');
    expect(d.cards.map((c) => c.id)).toEqual(['c3']);
    expect(restoreFromTrash(d.trash![0].id)).toBe(true);
    d = getData();
    expect(d.topics.map((t) => t.id).sort()).toEqual(['t1', 't1a', 't2']);
    expect(d.topics.find((t) => t.id === 't1')!.note).toBe('Конспект t1');
    expect(d.cards.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(Object.keys(d.states)).toHaveLength(4);
    expect(d.logs).toHaveLength(4);
    expect(d.trash ?? []).toHaveLength(0);
    expect(Object.keys(d.deleted ?? {}).filter((k) => k.startsWith('topic:t1') || k.startsWith('card:c'))).toEqual([]);
  });

  it('предмет целиком', () => {
    replaceData(world());
    deleteSubject('s1');
    expect(getData().subjects).toEqual([]);
    expect(getData().trash![0].label).toBe('Предмет «Биология» · 3 темы, 4 карточки');
    expect(restoreFromTrash(getData().trash![0].id)).toBe(true);
    expect(getData().subjects).toHaveLength(1);
    expect(getData().topics).toHaveLength(3);
    expect(getData().cards).toHaveLength(4);
  });

  it('одна карточка и несколько карточек — понятные подписи', () => {
    replaceData(world());
    deleteCard('c3');
    expect(getData().trash![0].label).toBe('Карточка «Вопрос c3»');
    deleteCardsUndoable(['c1', 'c2']);
    expect(getData().trash![0].label).toBe('Карточки: 2');
    expect(getData().cards.map((c) => c.id)).toEqual(['c4']);
  });

  it('несколько сразу (deleteMany): одна запись, возврат из корзины и кнопкой «Вернуть» одинаково', () => {
    replaceData(world());
    const undo = deleteMany({ topics: ['t1', 't2'] });
    expect(getData().trash).toHaveLength(1);
    expect(getData().topics).toEqual([]);
    undo(); // нажал «Вернуть» сразу
    expect(getData().topics).toHaveLength(3);
    expect(getData().trash ?? []).toHaveLength(0); // запись из корзины ушла — двойников нет
  });

  it('«Вернуть» сразу после удаления тоже убирает запись из корзины; повторное возвращение не двоит', () => {
    replaceData(world());
    const removed = deleteTopic('t2');
    restoreRemoved(removed);
    expect(getData().trash ?? []).toHaveLength(0);
    restoreRemoved(removed);
    expect(getData().topics.filter((t) => t.id === 't2')).toHaveLength(1);
    expect(getData().cards.filter((c) => c.id === 'c3')).toHaveLength(1);
    expect(getData().logs.filter((l) => l.cardId === 'c3')).toHaveLength(1);
  });
});

describe('осторожно с «сиротами»', () => {
  it('тему нельзя вернуть, пока нет её предмета: запись остаётся в корзине, ничего не меняется', () => {
    replaceData(world());
    deleteTopic('t2');
    const topicEntry = getData().trash![0].id;
    deleteSubject('s1'); // предмет ушёл (в корзине — без темы t2)
    expect(restoreFromTrash(topicEntry)).toBe(false);
    expect(getData().topics).toEqual([]);
    expect(getData().trash).toHaveLength(2);
    // вернули предмет — теперь тему можно
    const subjectEntry = getData().trash!.find((t) => t.label.startsWith('Предмет'))!.id;
    expect(restoreFromTrash(subjectEntry)).toBe(true);
    expect(restoreFromTrash(topicEntry)).toBe(true);
    expect(getData().topics.map((t) => t.id).sort()).toEqual(['t1', 't1a', 't2']);
  });

  it('подтема, у которой родителя больше нет, становится обычной темой', () => {
    replaceData(world());
    deleteTopic('t1a');
    const e = getData().trash![0].id;
    deleteTopic('t1');
    expect(restoreFromTrash(e)).toBe(true);
    expect(getData().topics.find((t) => t.id === 't1a')!.parentId).toBeUndefined();
  });
});

describe('срок и размер корзины', () => {
  it('записи старше 30 дней и сверх 30 штук не копятся', () => {
    replaceData(world());
    deleteCard('c1');
    vi.setSystemTime(new Date('2026-11-20T10:00:00')); // через 46 дня
    deleteCard('c2');
    expect(getData().trash).toHaveLength(1); // старая запись ушла
    for (let i = 0; i < 40; i++) {
      replaceData({ ...getData(), cards: [...getData().cards, card('x' + i, 't2')] });
      deleteCard('x' + i);
    }
    expect(getData().trash!.length).toBeLessThanOrEqual(30);
  });

  it('очистка: одна запись и вся корзина', () => {
    replaceData(world());
    deleteCard('c1');
    deleteCard('c2');
    purgeTrash(getData().trash![0].id);
    expect(getData().trash).toHaveLength(1);
    purgeTrash();
    expect(getData().trash).toEqual([]);
  });
});

describe('корзина остаётся на этом устройстве', () => {
  it('forSync и резервная копия — без корзины', () => {
    replaceData(world());
    deleteTopic('t2');
    expect(forSync(getData()).trash).toBeUndefined();
    expect(JSON.parse(exportJson()).trash).toBeUndefined();
    expect(getData().trash).toHaveLength(1); // сами данные не тронуты
  });

  it('слияние сохраняет свою корзину и не берёт чужую', () => {
    replaceData(world());
    deleteTopic('t2');
    const local = getData();
    const remote = JSON.parse(JSON.stringify(world())) as AppData;
    remote.trash = [{ id: 'чужая', at: new Date().toISOString(), label: 'Чужая запись', removed: { subjects: [], topics: [], cards: [], states: {}, logs: [], marks: [] } }];
    const merged = mergeData(local, normalizeData(remote)).data;
    expect(merged.trash).toEqual(local.trash);
  });

  it('normalizeData: правильные записи остаются, мусор выбрасывается', () => {
    const d = world();
    d.trash = [
      { id: 'ok', at: T0, label: 'Тема', removed: { subjects: [], topics: [topic('z')], cards: [], states: {}, logs: [], marks: ['topic:z'] } },
      { id: 'bad1' } as never,
      { id: 'bad2', at: T0, label: 'x', removed: { subjects: [], topics: [{ name: 'без id' }], cards: [], states: {}, logs: [], marks: [] } } as never,
      { id: 'bad3', at: T0, label: 'x', removed: { subjects: [], topics: [], cards: [], states: {}, logs: [], marks: [1, 2] } } as never,
      5 as never
    ];
    const n = normalizeData(JSON.parse(JSON.stringify(d)));
    expect(n.trash!.map((t) => t.id)).toEqual(['ok']);
    expect(normalizeData(JSON.parse(JSON.stringify(world()))).trash).toBeUndefined();
  });
});
