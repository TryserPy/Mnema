import { describe, expect, it } from 'vitest';
import { linkOptions, linksToWiki, parseHref, resolveLink } from './links';
import { itemOrds } from './srs';
import { emptyData } from './store';
import { orderTabs } from './tabs';
import type { Card } from './types';

const T0 = '2026-09-01T10:00:00.000Z';
function data() {
  const d = emptyData();
  d.subjects = [{ id: 's', name: 'Биология', color: '#000', createdAt: T0, updatedAt: T0 }];
  d.topics = [
    { id: 't1', subjectId: 's', name: 'Клетка', note: 'См. [пищеварение](mnema://card/c1) и [правило](mnema://topic/r1).', lists: [{ id: 'l', kind: 'terms', title: 'Термины', cols: ['Термин', 'Определение', 'Пример'], mode: 'basic' }], createdAt: T0, updatedAt: T0 },
    { id: 'r1', kind: 'rule', subjectId: 's', name: 'Причастный оборот', note: 'Выделяется запятыми', createdAt: T0, updatedAt: T0 }
  ];
  const c = (id: string, front: string, back: string): Card => ({ id, topicId: 't1', listId: 'l', type: 'basic', front, back, createdAt: T0, updatedAt: T0 });
  d.cards = [c('c1', 'Внутриклеточное пищеварение', 'Переваривание внутри клетки'), c('c2', 'Хлоропласт', '')];
  return d;
}

describe('Ссылки', () => {
  it('разбор адреса и поиск цели', () => {
    const d = data();
    expect(parseHref('mnema://card/c1')).toEqual({ kind: 'card', id: 'c1' });
    expect(resolveLink(d, 'mnema://topic/r1')).toMatchObject({ kind: 'topic' });
    expect(resolveLink(d, 'mnema://topic/nope')).toBeNull();
  });
  it('варианты для ссылки: термин по слову в другой форме, правило по названию', () => {
    const d = data();
    expect(linkOptions(d, 'пищеварения')[0]).toMatchObject({ kind: 'term', title: 'Внутриклеточное пищеварение' });
    expect(linkOptions(d, 'причастный')[0]).toMatchObject({ kind: 'rule' });
  });
  it('в Obsidian ссылки становятся вики-ссылками', () => {
    const d = data();
    const out = linksToWiki(d.topics[0].note, d, (id) => d.topics.find((t) => t.id === id)?.name);
    expect(out).toBe('См. [[Клетка|пищеварение]] и [[Причастный оборот|правило]].');
  });
});

describe('Словари и вкладки', () => {
  it('термин без определения не учится', () => {
    const d = data();
    expect(itemOrds(d.cards[0])).toEqual([0]);
    expect(itemOrds(d.cards[1])).toEqual([]);
  });
  it('свой порядок вкладок, новые — в конце', () => {
    const items = ['note', 'cards', 'list:a', 'list:b'].map((value) => ({ value }));
    expect(orderTabs(items, ['list:a', 'note']).map((x) => x.value)).toEqual(['list:a', 'note', 'cards', 'list:b']);
  });
});
