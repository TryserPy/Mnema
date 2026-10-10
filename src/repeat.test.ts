import { describe, expect, it } from 'vitest';
import { buildRepeatQueue, defaultRepeatKind, repeatCounts, repeatTopicTree } from './repeat';
import { DAY } from './srs';
import { emptyData } from './store';
import type { AppData, Card, ItemState } from './types';

const now = new Date('2026-09-25T12:00:00');
const card = (p: Partial<Card>): Card => ({ id: 'c1', topicId: 't1', type: 'basic', front: 'Q', back: 'A', createdAt: '', updatedAt: '', ...p });
const state = (p: Partial<ItemState> = {}): ItemState => {
  const due = new Date(now.getTime() + 5 * DAY).toISOString();
  return { due, stability: 20, difficulty: 5, elapsed_days: 1, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: new Date(now.getTime() - DAY).toISOString(), ...p };
};
const log = (cardId: string, at: Date, rating: 1 | 2 | 3 | 4 = 3) => ({ key: cardId + ':0', cardId, topicId: 't1', rating, prevState: 2, at: at.toISOString(), ms: 1000 });

/**
 * Папка f1: предметы s1 (темы t1 → подтема t1a → t1aa) и s2 (тема t3); предмет s3 лежит вне папки.
 * Карточки: a (в t1), b (в t1a), c (в t1aa), d (в t3), e (в s3).
 */
function sample(): AppData {
  const d = emptyData();
  d.folders = [{ id: 'f1', name: 'Папка', color: '#000', createdAt: '' } as AppData['folders'][number]];
  d.subjects = [
    { id: 's1', name: 'S1', color: '#000', folderId: 'f1', createdAt: '' },
    { id: 's2', name: 'S2', color: '#000', folderId: 'f1', createdAt: '' },
    { id: 's3', name: 'S3', color: '#000', createdAt: '' }
  ];
  const t = (id: string, subjectId: string, parentId?: string) => ({ id, subjectId, parentId, name: id, note: '', createdAt: '', updatedAt: '' });
  d.topics = [t('t1', 's1'), t('t1a', 's1', 't1'), t('t1aa', 's1', 't1a'), t('t3', 's2'), t('t4', 's3')];
  d.cards = [card({ id: 'a', topicId: 't1' }), card({ id: 'b', topicId: 't1a' }), card({ id: 'c', topicId: 't1aa' }), card({ id: 'd', topicId: 't3' }), card({ id: 'e', topicId: 't4' })];
  return d;
}

describe('«Повторить ещё раз»: области', () => {
  it('тема берёт и подтемы, и подтемы подтем', () => {
    const d = sample();
    expect(repeatCounts(d, now, { topicId: 't1' }).all).toBe(3);
    expect(repeatCounts(d, now, { topicId: 't1a' }).all).toBe(2);
    expect(repeatCounts(d, now, { topicId: 't1aa' }).all).toBe(1);
  });
  it('предмет — все его темы, папка — предметы папки без чужих', () => {
    const d = sample();
    expect(repeatCounts(d, now, { subjectId: 's1' }).all).toBe(3);
    expect(repeatCounts(d, now, { subjectIds: ['s1', 's2'] }).all).toBe(4);
  });
  it('без области — всё, пустая папка — ничего', () => {
    const d = sample();
    expect(repeatCounts(d, now).all).toBe(5);
    expect(repeatCounts(d, now, { subjectIds: [] }).all).toBe(0);
  });
});

describe('«Повторить ещё раз»: что брать', () => {
  it('«все начатые» — только то, на что уже отвечали, хоть срок и не пришёл', () => {
    const d = sample();
    d.states['a:0'] = state();
    d.states['b:0'] = state();
    const c = repeatCounts(d, now, { topicId: 't1' });
    expect(c).toMatchObject({ all: 3, started: 2, today: 0 });
    expect(buildRepeatQueue(d, now, { topicId: 't1' }, 'started').map((x) => x.cardId).sort()).toEqual(['a', 'b']);
  });
  it('«повторённые сегодня» — по журналу с начала учебного дня, вчерашнее не считается', () => {
    const d = sample();
    d.states['a:0'] = state();
    d.states['b:0'] = state();
    d.logs = [log('a', new Date(now.getTime() - 2 * 3600_000)), log('b', new Date(now.getTime() - DAY))];
    const q = buildRepeatQueue(d, now, { topicId: 't1' }, 'today');
    expect(q.map((x) => x.cardId)).toEqual(['a']);
    expect(repeatCounts(d, now, { topicId: 't1' }).today).toBe(1);
  });
  it('учебный день начинается в dayStartHour: ответ в 3 часа ночи ещё «вчерашний»', () => {
    const d = sample();
    d.settings.dayStartHour = 4;
    d.states['a:0'] = state();
    d.logs = [log('a', new Date('2026-09-25T03:00:00'))];
    expect(repeatCounts(d, new Date('2026-09-25T10:00:00')).today).toBe(0);
    d.logs = [log('a', new Date('2026-09-25T05:00:00'))];
    expect(repeatCounts(d, new Date('2026-09-25T10:00:00')).today).toBe(1);
  });
  it('«слабые места» — начатые и непрочные, самые слабые первыми', () => {
    const d = sample();
    d.states['a:0'] = state(); // надёжная
    d.states['b:0'] = state({ lapses: 3, stability: 1, difficulty: 9, state: 3 }); // забывал не раз
    d.states['c:0'] = state({ lapses: 6, stability: 0.5, difficulty: 10, state: 3 }); // ещё слабее
    const q = buildRepeatQueue(d, now, { topicId: 't1' }, 'weak');
    expect(q.map((x) => x.cardId)).toEqual(['c', 'b']);
    // новая карточка без ответов слабой не бывает
    expect(repeatCounts(d, now, { subjectId: 's3' }).weak).toBe(0);
  });
  it('«все карточки» — и ещё не начатые, как раньше «Повторить всю тему»', () => {
    const d = sample();
    expect(buildRepeatQueue(d, now, { topicId: 't1' }, 'all')).toHaveLength(3);
  });
  it('стороны двусторонней карточки и пропуски — отдельные элементы', () => {
    const d = sample();
    d.cards.push(card({ id: 'r', topicId: 't1', type: 'reverse' }));
    d.cards.push(card({ id: 'z', topicId: 't1', type: 'cloze', front: '{{раз}} и {{два}}', back: '' }));
    expect(repeatCounts(d, now, { topicId: 't1' }).all).toBe(3 + 2 + 2);
  });
  it('строка словаря без ответа не попадает в повторение', () => {
    const d = sample();
    d.cards.push(card({ id: 'w', topicId: 't1', listId: 'l1', back: '' }));
    expect(repeatCounts(d, now, { topicId: 't1' }).all).toBe(3);
  });
});

describe('«Повторить ещё раз»: очередь', () => {
  it('перемешивает и не теряет и не дублирует карточки', () => {
    const d = sample();
    const q = buildRepeatQueue(d, now, { subjectIds: ['s1', 's2'] }, 'all', () => 0.4);
    expect(q.map((x) => x.key).sort()).toEqual(['a:0', 'b:0', 'c:0', 'd:0']);
    expect(new Set(q.map((x) => x.key)).size).toBe(q.length);
  });
  it('чередует темы, а не идёт подряд по одной', () => {
    const d = sample();
    const q = buildRepeatQueue(d, now, { subjectIds: ['s1', 's2'] }, 'all', () => 0.4);
    expect(q[0].topicId).not.toBe(q[1].topicId);
  });
  it('не меняет данные', () => {
    const d = sample();
    d.states['a:0'] = state();
    const before = JSON.stringify(d);
    buildRepeatQueue(d, now, {}, 'started');
    repeatCounts(d, now, {});
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('«Повторить ещё раз»: выбор по умолчанию', () => {
  it('сначала повторённое сегодня, потом начатое, потом всё', () => {
    expect(defaultRepeatKind({ today: 2, started: 5, weak: 1, all: 9 })).toBe('today');
    expect(defaultRepeatKind({ today: 0, started: 5, weak: 1, all: 9 })).toBe('started');
    expect(defaultRepeatKind({ today: 0, started: 0, weak: 0, all: 9 })).toBe('all');
  });
});

describe('«Повторить ещё раз»: выбранные темы', () => {
  it('берёт только карточки выбранных тем — подтемы входят, только если выбраны тоже', () => {
    const d = sample();
    expect(repeatCounts(d, now, { topicIds: ['t1'] }).all).toBe(1);
    expect(repeatCounts(d, now, { topicIds: ['t1', 't1a', 't1aa'] }).all).toBe(3);
    expect(buildRepeatQueue(d, now, { topicIds: ['t1aa', 't3'] }, 'all').map((x) => x.cardId).sort()).toEqual(['c', 'd']);
  });
  it('темы из разных предметов и папок — вместе', () => {
    const d = sample();
    expect(repeatCounts(d, now, { topicIds: ['t1', 't3', 't4'] }).all).toBe(3); // s1, s2 (папка) и s3 (вне папки)
  });
  it('пустой выбор — ничего, а не «всё»', () => {
    const d = sample();
    expect(repeatCounts(d, now, { topicIds: [] }).all).toBe(0);
    expect(buildRepeatQueue(d, now, { topicIds: [] }, 'all')).toEqual([]);
  });
  it('наборы считаются внутри выбранных тем', () => {
    const d = sample();
    d.states['a:0'] = state();
    d.states['d:0'] = state();
    d.logs = [log('a', new Date(now.getTime() - 3600_000)), log('d', new Date(now.getTime() - 3600_000))];
    expect(repeatCounts(d, now, { topicIds: ['t1'] })).toMatchObject({ all: 1, started: 1, today: 1 });
    expect(repeatCounts(d, now, { topicIds: ['t1', 't3'] })).toMatchObject({ all: 2, started: 2, today: 2 });
    expect(repeatCounts(d, now, { topicIds: ['t1a'] })).toMatchObject({ all: 1, started: 0, today: 0 });
  });
  it('cardIds дополнительно сужает выбор', () => {
    const d = sample();
    expect(repeatCounts(d, now, { topicIds: ['t1', 't1a'], cardIds: ['b', 'd'] }).all).toBe(1);
  });
});

describe('«Повторить ещё раз»: дерево тем для выбора', () => {
  it('папки → предметы → темы, предметы вне папок — в конце', () => {
    const d = sample();
    const g = repeatTopicTree(d);
    expect(g.map((x) => x.folder?.id)).toEqual(['f1', undefined]);
    expect(g[0].subjects.map((s) => s.subject.id)).toEqual(['s1', 's2']);
    expect(g[1].subjects.map((s) => s.subject.id)).toEqual(['s3']);
  });
  it('подтемы идут за своей темой с отступом и считаются «вместе с подтемами»', () => {
    const d = sample();
    const rows = repeatTopicTree(d)[0].subjects[0].rows;
    expect(rows.map((r) => [r.t.id, r.depth, r.own, r.deep])).toEqual([['t1', 0, 1, 3], ['t1a', 1, 1, 2], ['t1aa', 2, 1, 1]]);
  });
  it('темы без карточек не показывает, а тему без своих, но с карточками в подтемах — показывает', () => {
    const d = sample();
    d.cards = d.cards.filter((c) => c.id !== 'a' && c.id !== 'd'); // в t1 и t3 своих карточек нет; у t1 они остались в подтемах
    const g = repeatTopicTree(d);
    expect(g[0].subjects.map((s) => s.subject.id)).toEqual(['s1']); // s2 пуст — пропущен
    expect(g[0].subjects[0].rows.map((r) => [r.t.id, r.own, r.deep])).toEqual([['t1', 0, 2], ['t1a', 1, 2], ['t1aa', 1, 1]]);
  });
  it('правила и термины предмета — отдельными строками с пометкой', () => {
    const d = sample();
    d.topics.push({ id: 'r1', subjectId: 's3', name: 'Правило', note: '', kind: 'rule', createdAt: '', updatedAt: '' } as AppData['topics'][number]);
    d.cards.push(card({ id: 'rc', topicId: 'r1' }));
    const rows = repeatTopicTree(d)[1].subjects[0].rows;
    expect(rows.map((r) => [r.t.id, r.tag])).toEqual([['t4', undefined], ['r1', 'правило']]);
  });
  it('предмет с потерянной папкой не пропадает', () => {
    const d = sample();
    d.subjects[2].folderId = 'нет-такой';
    expect(repeatTopicTree(d)[1].subjects.map((s) => s.subject.id)).toEqual(['s3']);
  });
});
