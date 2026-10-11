// Куда вернуться после учёбы и «что учить»: возврат на ту же вкладку, фильтр «только карточки / только списки / один список».
import { describe, expect, it } from 'vitest';
import { buildQueue, inSource, todayCounts } from './srs';
import { buildRepeatQueue, repeatCounts } from './repeat';
import { emptyData } from './store';
import { backLabel, fillBack, reviewBack, testBack } from './studyBack';
import { cleanStudyPick, listsLabel, parsePick, pickKeyOf, pickOptions, pickScope, validPick } from './studyPick';
import type { AppData, Card, Route } from './types';

type Review = Extract<Route, { name: 'review' }>;
const review = (p: Partial<Review> = {}): Route => ({ name: 'review', ...p });

const card = (p: Partial<Card>): Card => ({ id: 'c1', topicId: 't1', type: 'basic', front: 'Q', back: 'A', createdAt: '', updatedAt: '', ...p });

/** Тема t1 со словарём (l1: три строки), термины (l2: две строки) и двумя обычными карточками; тема t2 — одни карточки. */
function sample(): AppData {
  const d = emptyData();
  d.folders = [{ id: 'f1', name: 'Папка', color: '#000', createdAt: '' } as AppData['folders'][number]];
  d.subjects = [{ id: 's1', name: 'S1', color: '#000', folderId: 'f1', createdAt: '' }];
  const t = (id: string, extra = {}) => ({ id, subjectId: 's1', name: id, note: '', createdAt: '', updatedAt: '', ...extra });
  d.topics = [
    t('t1', {
      lists: [
        { id: 'l1', kind: 'vocab', title: 'Слова', cols: ['a', 'b', 'c'], mode: 'basic' },
        { id: 'l2', kind: 'terms', title: 'Термины', cols: ['a', 'b', 'c'], mode: 'basic' }
      ]
    }),
    t('t2')
  ];
  d.cards = [
    card({ id: 'k1' }),
    card({ id: 'k2' }),
    card({ id: 'w1', listId: 'l1' }),
    card({ id: 'w2', listId: 'l1' }),
    card({ id: 'w3', listId: 'l1' }),
    card({ id: 'x1', listId: 'l2' }),
    card({ id: 'x2', listId: 'l2' }),
    card({ id: 'o1', topicId: 't2' })
  ];
  return d;
}

describe('fillBack: запоминаем, откуда запустили', () => {
  it('повторение из вкладки темы возвращает на эту вкладку', () => {
    const cur: Route = { name: 'topic', id: 't1', tab: 'list:l1' };
    expect(fillBack(review({ cardIds: ['w1'] }), cur)).toEqual(review({ cardIds: ['w1'], back: cur }));
  });
  it('своё место не затираем', () => {
    const own: Route = { name: 'folder', id: 'f1' };
    expect(fillBack(review({ back: own }), { name: 'topic', id: 't1' })).toEqual(review({ back: own }));
  });
  it('точное место экрана (термины предмета с фильтром) важнее маршрута', () => {
    const place: Route = { name: 'subject', id: 's1', view: 'terms', filter: 't1' };
    const r = fillBack(review({ cardIds: ['x1'] }), { name: 'subject', id: 's1' }, place) as Review;
    expect(r.back).toEqual(place);
  });
  it('место другого экрана не подходит', () => {
    const place: Route = { name: 'subject', id: 's9', view: 'terms' };
    const cur: Route = { name: 'subject', id: 's1' };
    expect((fillBack(review(), cur, place) as Review).back).toEqual(cur);
  });
  it('с экрана самого повторения берём то место, откуда оно началось', () => {
    const origin: Route = { name: 'topic', id: 't1', tab: 'cards' };
    expect((fillBack(review({ cram: true }), review({ back: origin })) as Review).back).toEqual(origin);
    // а если и у него места нет — не выдумываем
    expect(fillBack(review({ cram: true }), review())).toEqual(review({ cram: true }));
  });
  it('контрольная тоже запоминает вкладку', () => {
    const cur: Route = { name: 'topic', id: 't1', tab: 'cards' };
    expect(fillBack({ name: 'test', topicId: 't1' }, cur)).toEqual({ name: 'test', topicId: 't1', back: cur });
  });
  it('остальные маршруты не трогаем', () => {
    const r: Route = { name: 'topic', id: 't1' };
    expect(fillBack(r, { name: 'today' })).toBe(r);
  });
});

describe('reviewBack / testBack: куда вернуться', () => {
  it('записанное место, если оно ещё есть', () => {
    const d = sample();
    const back: Route = { name: 'topic', id: 't1', tab: 'list:l1' };
    expect(reviewBack(d, review({ back }) as Review)).toEqual(back);
    const terms: Route = { name: 'subject', id: 's1', view: 'terms', filter: 't1' };
    expect(reviewBack(d, review({ back: terms }) as Review)).toEqual(terms);
  });
  it('без записи — как раньше: тема, папка, предмет, «Сегодня»', () => {
    const d = sample();
    expect(reviewBack(d, review({ topicId: 't1' }) as Review)).toEqual({ name: 'topic', id: 't1' });
    expect(reviewBack(d, review({ folderId: 'f1' }) as Review)).toEqual({ name: 'folder', id: 'f1' });
    expect(reviewBack(d, review({ subjectId: 's1' }) as Review)).toEqual({ name: 'subject', id: 's1' });
    expect(reviewBack(d, review() as Review)).toEqual({ name: 'today' });
  });
  it('если тему удалили, пока шло занятие, — на «Сегодня», а не в пустоту', () => {
    const d = sample();
    expect(reviewBack(d, review({ back: { name: 'topic', id: 'gone' } }) as Review)).toEqual({ name: 'today' });
    expect(reviewBack(d, review({ back: { name: 'folder', id: 'gone' } }) as Review)).toEqual({ name: 'today' });
    expect(reviewBack(d, review({ topicId: 'gone' }) as Review)).toEqual({ name: 'today' });
  });
  it('контрольная: записанное место, иначе тема или подготовка', () => {
    const d = sample();
    const back: Route = { name: 'topic', id: 't1', tab: 'cards' };
    expect(testBack(d, { name: 'test', topicId: 't1', back })).toEqual(back);
    expect(testBack(d, { name: 'test', topicId: 't1' })).toEqual({ name: 'topic', id: 't1' });
    expect(testBack(d, { name: 'test', topicId: 'gone' })).toEqual({ name: 'today' });
  });
  it('подписи кнопок называют место', () => {
    expect(backLabel({ name: 'topic', id: 'a', tab: 'list:x' })).toBe('К списку');
    expect(backLabel({ name: 'topic', id: 'a', tab: 'cards' })).toBe('К карточкам');
    expect(backLabel({ name: 'topic', id: 'a' })).toBe('К теме');
    expect(backLabel({ name: 'subject', id: 'a', view: 'terms' })).toBe('К терминам');
    expect(backLabel({ name: 'subject', id: 'a' })).toBe('К предмету');
    expect(backLabel({ name: 'folder', id: 'a' })).toBe('К папке');
    expect(backLabel({ name: 'today' })).toBe('На главную');
  });
});

describe('«Что учить»: карточки отдельно от списков', () => {
  const now = new Date('2026-09-25T12:00:00');
  const ids = (q: { cardId: string }[]) => [...new Set(q.map((x) => x.cardId))].sort();

  it('inSource: обычные карточки, строки списков, один список', () => {
    expect(inSource({}, {})).toBe(true);
    expect(inSource({}, { source: 'cards' })).toBe(true);
    expect(inSource({ listId: 'l1' }, { source: 'cards' })).toBe(false);
    expect(inSource({ listId: 'l1' }, { source: 'lists' })).toBe(true);
    expect(inSource({}, { source: 'lists' })).toBe(false);
    expect(inSource({ listId: 'l1' }, { listId: 'l1' })).toBe(true);
    expect(inSource({ listId: 'l2' }, { listId: 'l1' })).toBe(false);
    expect(inSource({}, { listId: 'l1' })).toBe(false);
  });
  it('очередь темы: только карточки / только списки / один список', () => {
    const d = sample();
    expect(ids(buildQueue(d, now, { topicId: 't1' }))).toEqual(['k1', 'k2', 'w1', 'w2', 'w3', 'x1', 'x2']);
    expect(ids(buildQueue(d, now, { topicId: 't1', source: 'cards' }))).toEqual(['k1', 'k2']);
    expect(ids(buildQueue(d, now, { topicId: 't1', source: 'lists' }))).toEqual(['w1', 'w2', 'w3', 'x1', 'x2']);
    expect(ids(buildQueue(d, now, { topicId: 't1', listId: 'l2' }))).toEqual(['x1', 'x2']);
  });
  it('очередь предмета и папки тоже фильтруется', () => {
    const d = sample();
    expect(ids(buildQueue(d, now, { subjectId: 's1', source: 'cards' }))).toEqual(['k1', 'k2', 'o1']);
    expect(ids(buildQueue(d, now, { subjectIds: ['s1'], source: 'lists' }))).toEqual(['w1', 'w2', 'w3', 'x1', 'x2']);
  });
  it('счётчики «к повторению» учитывают выбор', () => {
    const d = sample();
    const n = (scope: object) => {
      const c = todayCounts(d, now, scope);
      return c.learning + c.review + c.newCount;
    };
    expect(n({ topicId: 't1' })).toBe(7);
    expect(n({ topicId: 't1', source: 'cards' })).toBe(2);
    expect(n({ topicId: 't1', source: 'lists' })).toBe(5);
    expect(n({ topicId: 't1', listId: 'l1' })).toBe(3);
  });
  it('«Повторить ещё раз» тоже понимает выбор, в том числе для выбранных тем', () => {
    const d = sample();
    expect(repeatCounts(d, now, { topicId: 't1', source: 'cards' }).all).toBe(2);
    expect(repeatCounts(d, now, { topicIds: ['t1', 't2'], source: 'cards' }).all).toBe(3);
    expect(repeatCounts(d, now, { topicIds: ['t1', 't2'], listId: 'l1' }).all).toBe(3);
    expect(ids(buildRepeatQueue(d, now, { topicId: 't1', source: 'lists' }, 'all'))).toEqual(['w1', 'w2', 'w3', 'x1', 'x2']);
  });
});

describe('pickOptions: когда есть из чего выбирать', () => {
  it('тема с карточками и списками: всё / карточки / списки / каждый список', () => {
    const o = pickOptions(sample(), { topicId: 't1' });
    expect(o.map((x) => x.pick)).toEqual(['all', 'cards', 'lists', 'list:l1', 'list:l2']);
    expect(o.map((x) => x.n)).toEqual([7, 2, 5, 3, 2]);
    expect(o[2].label).toBe('Только термины и словари');
  });
  it('в предмете с несколькими темами к названию списка добавляется тема', () => {
    const d = sample();
    d.topics[1].lists = [{ id: 'l3', kind: 'dates', title: 'Даты', cols: ['a', 'b', 'c'], mode: 'basic' }];
    d.cards.push(card({ id: 'dd', topicId: 't2', listId: 'l3' }));
    const o = pickOptions(d, { subjectId: 's1' });
    expect(o.find((x) => x.pick === 'list:l3')?.label).toBe('t2 · Даты');
    expect(o.find((x) => x.pick === 'lists')?.label).toBe('Только списки'); // есть даты — не «термины и словари»
  });
  it('одни карточки или один список — выбирать не из чего', () => {
    const d = sample();
    expect(pickOptions(d, { topicId: 't2' })).toEqual([]);
    d.cards = d.cards.filter((c) => c.listId !== 'l2' && c.topicId === 't1' && c.listId); // остался только словарь l1
    expect(pickOptions(d, { topicId: 't1' })).toEqual([]);
    expect(pickOptions(emptyData(), {})).toEqual([]);
  });
  it('одни списки, но их два — можно выбрать список', () => {
    const d = sample();
    d.cards = d.cards.filter((c) => c.listId);
    expect(pickOptions(d, { topicId: 't1' }).map((x) => x.pick)).toEqual(['all', 'list:l1', 'list:l2']);
  });
  it('названия «только списков»', () => {
    expect(listsLabel(['terms'])).toBe('Только термины');
    expect(listsLabel(['vocab', 'vocab'])).toBe('Только словари');
    expect(listsLabel(['terms', 'vocab', 'custom'])).toBe('Только термины и словари');
    expect(listsLabel(['formulas'])).toBe('Только списки');
  });
});

describe('выбор в настройках', () => {
  it('parsePick и validPick: мусор и пропавший список — «всё»', () => {
    expect(parsePick('cards')).toBe('cards');
    expect(parsePick('list:abc_1')).toBe('list:abc_1');
    expect(parsePick('list:')).toBe('all');
    expect(parsePick('что-то')).toBe('all');
    expect(parsePick(undefined)).toBe('all');
    const o = pickOptions(sample(), { topicId: 't1' });
    expect(validPick('list:l1', o)).toBe('list:l1');
    expect(validPick('list:gone', o)).toBe('all');
    expect(validPick('cards', [])).toBe('all');
  });
  it('pickScope превращает выбор в область очереди', () => {
    expect(pickScope('all')).toEqual({});
    expect(pickScope('cards')).toEqual({ source: 'cards' });
    expect(pickScope('lists')).toEqual({ source: 'lists' });
    expect(pickScope('list:l9')).toEqual({ listId: 'l9' });
  });
  it('ключи и чистка из файла', () => {
    expect(pickKeyOf({ topicId: 'a' })).toBe('t:a');
    expect(pickKeyOf({ subjectId: 'a' })).toBe('s:a');
    expect(pickKeyOf({ folderId: 'a' })).toBe('f:a');
    expect(pickKeyOf({})).toBeNull();
    expect(cleanStudyPick({ 't:a': 'cards', 's:b': 'all', 'x:c': 'cards', 'f:d': 'evil<script>', 't:e': 5 })).toEqual({ 't:a': 'cards' });
    expect(cleanStudyPick('строка')).toBeUndefined();
    expect(cleanStudyPick({})).toBeUndefined();
    const big = Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['t:' + i, 'cards']));
    expect(Object.keys(cleanStudyPick(big)!).length).toBe(300);
  });
});
