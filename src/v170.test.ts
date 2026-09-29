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
    expect(childTopics(d, 's').map((x) => x.name)).toEqual(['§1. Имя', '§2. Глагол', '§10. Наречие', '1. Введение', 'Ёж и ель']);
  });
  it('«в своём порядке» — как расставил', () => {
    expect(childTopics({ ...d, settings: { ...d.settings, topicSort: 'manual' } }, 's').map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
