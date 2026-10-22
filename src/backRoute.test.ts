import { describe, expect, it } from 'vitest';
import { backRoute, confirmExit, EXIT_WINDOW_MS } from './backRoute';
import type { AppData } from './types';

const d = {
  folders: [{ id: 'f', name: 'Естественные' }],
  subjects: [
    { id: 'geo', name: 'Геометрия' },
    { id: 'bio', name: 'Биология', folderId: 'f' },
    { id: 'chem', name: 'Химия', folderId: 'gone' }
  ],
  topics: [
    { id: 'g1', subjectId: 'geo', name: 'Четырёхугольники' },
    { id: 'g2', subjectId: 'geo', name: 'Параллелограмм', parentId: 'g1' },
    { id: 'g3', subjectId: 'geo', name: 'Сирота', parentId: 'нет' },
    { id: 'r1', subjectId: 'geo', name: 'Правило', kind: 'rule' },
    { id: 'x', subjectId: 'нет', name: 'Без предмета' }
  ]
} as unknown as Pick<AppData, 'topics' | 'subjects' | 'folders'>;

describe('backRoute — куда ведёт «Назад»', () => {
  it.each([
    [{ name: 'today' }, null],
    [{ name: 'topic', id: 'g2' }, { name: 'topic', id: 'g1' }],
    [{ name: 'topic', id: 'g1', tab: 'cards' }, { name: 'subject', id: 'geo' }],
    [{ name: 'topic', id: 'g3' }, { name: 'subject', id: 'geo' }],
    [{ name: 'topic', id: 'r1' }, { name: 'subject', id: 'geo', view: 'rules' }],
    [{ name: 'topic', id: 'x' }, { name: 'knowledge' }],
    [{ name: 'topic', id: 'удалена' }, { name: 'knowledge' }],
    [{ name: 'subject', id: 'geo' }, { name: 'knowledge' }],
    [{ name: 'subject', id: 'geo', view: 'terms' }, { name: 'subject', id: 'geo' }],
    [{ name: 'subject', id: 'bio' }, { name: 'folder', id: 'f' }],
    [{ name: 'subject', id: 'chem' }, { name: 'knowledge' }],
    [{ name: 'folder', id: 'f' }, { name: 'knowledge' }],
    [{ name: 'exam', id: 'e1' }, { name: 'knowledge' }],
    [{ name: 'knowledge' }, { name: 'today' }],
    [{ name: 'profile' }, { name: 'today' }],
    [{ name: 'homework' }, { name: 'today' }],
    [{ name: 'settings', section: 'look' }, { name: 'settings' }],
    [{ name: 'settings' }, { name: 'profile' }],
    [{ name: 'stats' }, { name: 'profile' }],
    [{ name: 'trash' }, { name: 'profile' }],
    [{ name: 'help' }, { name: 'profile' }],
    [{ name: 'features' }, { name: 'profile' }],
    [{ name: 'plugin', id: 'p' }, { name: 'today' }]
  ])('%o → %o', (from, to) => {
    expect(backRoute(from as never, d)).toEqual(to);
  });
});

describe('confirmExit — выход вторым «Назад»', () => {
  it('первое нажатие — нет', () => expect(confirmExit(null, 1000)).toBe(false));
  it('второе вскоре — да', () => expect(confirmExit(1000, 1000 + EXIT_WINDOW_MS)).toBe(true));
  it('второе слишком поздно — нет', () => expect(confirmExit(1000, 1001 + EXIT_WINDOW_MS)).toBe(false));
});
