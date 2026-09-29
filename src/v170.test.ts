import { describe, expect, it } from 'vitest';
import { readRelease, UPDATE_REPO } from './update';

describe('1.7: обновления из выпусков GitHub', () => {
  const rel = {
    tag_name: 'v1.7.0',
    body: '  Новое: окно обновления  ',
    assets: [
      { name: 'latest.yml', browser_download_url: 'https://github.com/x/latest.yml', size: 300 },
      { name: 'Mnema-Setup-1.7.0.exe', browser_download_url: 'https://github.com/x/setup.exe', size: 90e6 },
      { name: 'Mnema-1.7.0-Android.apk', browser_download_url: 'https://github.com/x/m.apk', size: 13e6 }
    ]
  };

  it('находит APK для телефона и понимает, что версия новее', () => {
    const r = readRelease(rel, '1.6.4');
    expect(r).toMatchObject({ ok: true, latest: '1.7.0', available: true, apk: 'https://github.com/x/m.apk', size: 13e6, notes: 'Новое: окно обновления' });
  });

  it('та же или старая версия — обновления нет', () => {
    expect(readRelease(rel, '1.7.0').available).toBe(false);
    expect(readRelease({ ...rel, tag_name: 'v1.6.9' }, '1.7.0').available).toBe(false);
  });

  it('выпуск без APK — ссылки нет', () => {
    expect(readRelease({ tag_name: 'v2.0.0', assets: [] }, '1.7.0').apk).toBeUndefined();
  });

  it('репозиторий зашит в код', () => {
    expect(UPDATE_REPO).toEqual({ owner: 'TryserPy', repo: 'Mnema' });
  });
});

import { childTopics, emptyData } from './store';
describe('1.8: порядок тем', () => {
  const T0 = '2026-09-01T10:00:00.000Z';
  const d = emptyData();
  d.subjects = [{ id: 's', name: 'Русский', color: '#000', createdAt: T0 }];
  const t = (id: string, name: string, order: number) => ({ id, subjectId: 's', name, note: '', order, createdAt: T0, updatedAt: T0 });
  d.topics = [t('a', '§10. Наречие', 1), t('b', '§2. Глагол', 2), t('c', '1. Введение', 3), t('d', 'Ёж и ель', 4), t('e', '§1. Имя', 5)];
  it('по умолчанию — по названию с учётом чисел', () => {
    // «1. Введение» — рядом с «§1», а не после всех «§»; «§ 3» с пробелом — как «§3».
    expect(childTopics(d, 's').map((x) => x.name)).toEqual(['1. Введение', '§1. Имя', '§2. Глагол', '§10. Наречие', 'Ёж и ель']);
    const withSpace = { ...d, topics: [...d.topics, t('f', '§ 3. Союз', 6)] };
    expect(childTopics(withSpace, 's').map((x) => x.id)).toEqual(['c', 'e', 'b', 'f', 'a', 'd']);
  });
  it('«в своём порядке» — как расставил, и только в своём предмете', () => {
    const two = { ...d, subjects: [{ ...d.subjects[0], topicSort: 'manual' as const }, { id: 's2', name: 'Физика', color: '#000', createdAt: T0 }], topics: [...d.topics, { ...t('x', '§10. Сила', 1), subjectId: 's2' }, { ...t('y', '§2. Масса', 2), subjectId: 's2' }] };
    expect(childTopics(two, 's').map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(childTopics(two, 's2').map((x) => x.id)).toEqual(['y', 'x']);
  });
  it('перетаскивание темы включает «свой порядок» только в этом предмете', () => {
    const two = { ...d, subjects: [d.subjects[0], { id: 's2', name: 'Физика', color: '#000', createdAt: T0 }], topics: [...d.topics, { ...t('x', '§10. Сила', 1), subjectId: 's2' }, { ...t('y', '§2. Масса', 2), subjectId: 's2' }] };
    replaceData(two);
    moveTopic('a', { subjectId: 's', beforeId: 'c' });
    const after = getData();
    expect(after.subjects.find((x) => x.id === 's')?.topicSort).toBe('manual');
    expect(after.subjects.find((x) => x.id === 's2')?.topicSort).toBeUndefined();
    expect(childTopics(after, 's2').map((x) => x.id)).toEqual(['y', 'x']);
  });
});

import { deleteMany, getData, moveTopic, replaceData } from './store';
describe('1.8: удалить несколько сразу', () => {
  const T0 = '2026-09-01T10:00:00.000Z';
  it('папка, предмет и тема удаляются разом и возвращаются', () => {
    const d = emptyData();
    d.folders = [{ id: 'f', name: '7 класс', color: '#000', createdAt: T0 }];
    d.subjects = [
      { id: 's1', name: 'Русский', color: '#000', folderId: 'f', createdAt: T0 },
      { id: 's2', name: 'Физика', color: '#000', createdAt: T0 }
    ];
    d.topics = [
      { id: 't1', subjectId: 's1', name: 'А', note: '', createdAt: T0, updatedAt: T0 },
      { id: 't2', subjectId: 's2', name: 'Б', note: '', createdAt: T0, updatedAt: T0 },
      { id: 't3', subjectId: 's2', name: 'В', parentId: 't2', note: '', createdAt: T0, updatedAt: T0 }
    ];
    d.cards = [{ id: 'c3', topicId: 't3', type: 'basic', front: 'q', back: 'a', createdAt: T0, updatedAt: T0 }];
    replaceData(d);
    const undo = deleteMany({ folders: ['f'], topics: ['t2'] });
    const after = getData();
    expect(after.folders).toHaveLength(0);
    expect(after.subjects.find((x) => x.id === 's1')?.folderId).toBeUndefined(); // предмет остался, просто без папки
    expect(after.topics.map((t) => t.id)).toEqual(['t1']); // Б удалена вместе с подтемой В
    expect(after.cards).toHaveLength(0);
    expect(after.deleted?.['folder:f'] && after.deleted?.['topic:t3'] && after.deleted?.['card:c3']).toBeTruthy();
    undo();
    const back = getData();
    expect(back.folders.map((f) => f.id)).toEqual(['f']);
    expect(back.subjects.find((x) => x.id === 's1')?.folderId).toBe('f');
    expect(back.topics.map((t) => t.id).sort()).toEqual(['t1', 't2', 't3']);
    expect(back.cards).toHaveLength(1);
    expect(back.deleted?.['folder:f']).toBeUndefined();
  });
});
