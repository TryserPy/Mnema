// 1.23.0: копии папки, предмета, темы (с подтемами) и карточки — всё содержимое, без прогресса, без пересечений id.
import { describe, expect, it } from 'vitest';
import { copyCard, copyFolder, copyName, copySubject, copyTopic } from './copy';
import { itemKey } from './srs';
import { emptyData } from './store';
import type { AppData, Card, Topic } from './types';

let n = 0;
const uid = () => 'n' + ++n;
const T0 = '2026-09-01T10:00:00.000Z';
const STAMP = '2026-10-05T10:00:00.000Z';
const topic = (id: string, extra: Partial<Topic> = {}): Topic => ({ id, subjectId: 's1', name: 'Тема ' + id, note: 'Конспект ' + id, createdAt: T0, updatedAt: T0, ...extra });
const card = (id: string, topicId: string, extra: Partial<Card> = {}): Card => ({ id, topicId, type: 'basic', front: 'В ' + id, back: 'О ' + id, createdAt: T0, updatedAt: T0, ...extra });

function world(): AppData {
  const d = emptyData();
  d.folders = [{ id: 'f1', name: 'Естественные', color: '#0a0', order: 1, createdAt: T0 }];
  d.subjects = [
    { id: 's1', name: 'Биология', color: '#0a0', folderId: 'f1', order: 1, createdAt: T0 },
    { id: 's2', name: 'Физика', color: '#00a', folderId: 'f1', order: 2, createdAt: T0 }
  ];
  d.topics = [
    topic('t1', { examDate: '2026-12-01', noteAt: T0, lists: [{ id: 'L1', kind: 'vocab', title: 'Слова', cols: ['a', 'b', 'c'], mode: 'basic' }], tabOrder: ['note', 'list:L1', 'cards'], poems: [{ id: 'P1', title: 'Стих', text: 'a\nb', chunk: 0, learned: 2, createdAt: T0, updatedAt: T0 }] }),
    topic('t1a', { parentId: 't1' }),
    topic('t2'),
    topic('p1', { subjectId: 's2' })
  ];
  d.cards = [card('c1', 't1'), card('c2', 't1', { listId: 'L1' }), card('c3', 't1a'), card('c4', 't2'), card('c5', 'p1')];
  for (const c of d.cards) d.states[itemKey(c.id, 0)] = { due: T0, stability: 4, difficulty: 5, elapsed_days: 1, scheduled_days: 3, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: T0 };
  return d;
}

describe('имя копии', () => {
  it('«(копия)», потом «(копия 2)»; копия копии не растёт', () => {
    expect(copyName('Тема', ['Тема'])).toBe('Тема (копия)');
    expect(copyName('Тема', ['Тема', 'Тема (копия)'])).toBe('Тема (копия 2)');
    expect(copyName('Тема (копия)', ['Тема', 'Тема (копия)'])).toBe('Тема (копия 2)');
  });
});

describe('копия темы', () => {
  it('тема с подтемой, карточками, словарём и стихом; прогресс не копируется', () => {
    const d = world();
    const r = copyTopic(d, 't1', uid, STAMP)!;
    expect(r.name).toBe('Тема t1 (копия)');
    const out = r.data;
    const copy = out.topics.find((t) => t.id === r.id)!;
    expect(copy.note).toBe('Конспект t1');
    expect(copy.subjectId).toBe('s1');
    expect(copy.examDate).toBeUndefined();
    expect(copy.noteAt).toBeUndefined();
    // подтема приехала и смотрит на копию родителя
    const kid = out.topics.find((t) => t.parentId === r.id)!;
    expect(kid.name).toBe('Тема t1a');
    // словарь и стих — со своими id, строка списка перепривязана
    expect(copy.lists![0].id).not.toBe('L1');
    expect(copy.tabOrder).toEqual(['note', 'list:' + copy.lists![0].id, 'cards']);
    expect(copy.poems![0].id).not.toBe('P1');
    expect(copy.poems![0].learned).toBe(0);
    const row = out.cards.find((c) => c.topicId === r.id && c.listId)!;
    expect(row.listId).toBe(copy.lists![0].id);
    // карточки: 2 в теме + 1 в подтеме; у оригинала всё осталось
    expect(out.cards.length).toBe(d.cards.length + 3);
    expect(out.cards.filter((c) => c.topicId === 't1').length).toBe(2);
    // прогресс: только у оригинальных карточек
    expect(Object.keys(out.states).length).toBe(Object.keys(d.states).length);
    // id не пересекаются
    expect(new Set(out.topics.map((t) => t.id)).size).toBe(out.topics.length);
    expect(new Set(out.cards.map((c) => c.id)).size).toBe(out.cards.length);
  });
  it('копия подтемы остаётся подтемой того же родителя', () => {
    const r = copyTopic(world(), 't1a', uid, STAMP)!;
    expect(r.data.topics.find((t) => t.id === r.id)!.parentId).toBe('t1');
  });
  it('зацикленные parentId не вешают копирование', () => {
    const d = world();
    d.topics = d.topics.map((t) => (t.id === 't1' ? { ...t, parentId: 't1a' } : t));
    expect(copyTopic(d, 't1', uid, STAMP)).not.toBeNull();
  });
  it('несуществующая тема — null', () => expect(copyTopic(world(), 'нет', uid, STAMP)).toBeNull());
});

describe('копия предмета и папки', () => {
  it('предмет: все темы, подтемы и карточки, в той же папке', () => {
    const d = world();
    const r = copySubject(d, 's1', uid, STAMP)!;
    expect(r.name).toBe('Биология (копия)');
    const s = r.data.subjects.find((x) => x.id === r.id)!;
    expect(s.folderId).toBe('f1');
    const topics = r.data.topics.filter((t) => t.subjectId === r.id);
    expect(topics.map((t) => t.name).sort()).toEqual(['Тема t1', 'Тема t1a', 'Тема t2']);
    expect(r.data.cards.filter((c) => topics.some((t) => t.id === c.topicId)).length).toBe(4);
    expect(topics.find((t) => t.name === 'Тема t1a')!.parentId).toBe(topics.find((t) => t.name === 'Тема t1')!.id);
  });
  it('папка: копии всех предметов внутри, имена предметов те же', () => {
    const d = world();
    const r = copyFolder(d, 'f1', uid, STAMP)!;
    expect(r.name).toBe('Естественные (копия)');
    const inside = r.data.subjects.filter((s) => s.folderId === r.id);
    expect(inside.map((s) => s.name).sort()).toEqual(['Биология', 'Физика']);
    expect(r.data.subjects.length).toBe(4);
    expect(r.data.topics.length).toBe(d.topics.length * 2);
  });
});

describe('копия карточки', () => {
  it('в той же теме, без прогресса', () => {
    const d = world();
    const r = copyCard(d, 'c1', uid, STAMP)!;
    const c = r.data.cards.find((x) => x.id === r.id)!;
    expect(c.topicId).toBe('t1');
    expect(c.front).toBe('В c1');
    expect(r.data.states[itemKey(r.id, 0)]).toBeUndefined();
  });
});
