import { describe, expect, it } from 'vitest';
import { termGroups } from './components/SubjectTerms';
import { childTopics, emptyData } from './store';
import type { Card } from './types';

const T0 = '2026-09-01T10:00:00.000Z';
const L = (id: string, kind: 'terms' | 'dates' = 'terms') => ({ id, kind, title: kind === 'terms' ? 'Термины' : 'Даты', cols: ['a', 'b', 'c'] as [string, string, string], mode: 'basic' as const });

describe('Термины предмета', () => {
  const d = emptyData();
  d.subjects = [{ id: 's', name: 'Русский', color: '#000', createdAt: T0, updatedAt: T0 }];
  d.topics = [
    { id: 'g', kind: 'glossary', subjectId: 's', name: 'Общие термины', note: '', lists: [L('lg')], createdAt: T0, updatedAt: T0 },
    { id: 'p', subjectId: 's', name: 'Причастие', note: '', order: 1, lists: [L('lp'), L('ld', 'dates')], createdAt: T0, updatedAt: T0 },
    { id: 'n', subjectId: 's', name: 'Части речи', note: '', order: 2, lists: [L('ln')], createdAt: T0, updatedAt: T0 },
    { id: 'e', subjectId: 's', name: 'Пустая', note: '', order: 3, createdAt: T0, updatedAt: T0 }
  ];
  const c = (id: string, topicId: string, listId: string): Card => ({ id, topicId, listId, type: 'basic', front: id, back: 'x', createdAt: T0, updatedAt: T0 });
  d.cards = [c('g1', 'g', 'lg'), c('p1', 'p', 'lp'), c('p2', 'p', 'lp'), c('d1', 'p', 'ld'), c('n1', 'n', 'ln')];
  it('общие первыми, потом темы по порядку; даты не считаются терминами; пустые темы не показываются', () => {
    const g = termGroups(d, 's');
    expect(g.map((x) => x.key)).toEqual(['general', 'p', 'n']);
    expect(g.map((x) => x.cards.map((c) => c.id))).toEqual([['g1'], ['p1', 'p2'], ['n1']]);
  });
  it('словарь предмета не виден как тема в дереве', () => {
    d.settings = { ...d.settings, topicSort: 'manual' };
    expect(childTopics(d, 's').map((t) => t.id)).toEqual(['p', 'n', 'e']);
  });
});
