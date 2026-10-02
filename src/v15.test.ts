import { describe, expect, it } from 'vitest';
import { groupOf, nextLesson, notificationPlan, ymd } from './homework';
import { parseHeader } from './plugins/host';
import { emptyData } from './store';
import { mergeData } from './sync';
import type { AppData, Folder, Homework } from './types';
import { parseVideo } from './video';

const T0 = '2026-09-01T10:00:00.000Z';
const T1 = '2026-09-02T10:00:00.000Z';
const T2 = '2026-09-03T10:00:00.000Z';
const folder = (id: string, name: string, at = T0): Folder => ({ id, name, color: '#000', createdAt: T0, updatedAt: at });
const hw = (id: string, text: string, extra: Partial<Homework> = {}): Homework => ({ id, text, createdAt: T0, updatedAt: T0, ...extra });

function base(): AppData {
  const d = emptyData();
  d.subjects = [
    { id: 'alg', name: 'Алгебра', color: '#00f', createdAt: T0, updatedAt: T0, folderId: 'math' },
    { id: 'geo', name: 'Геометрия', color: '#0f0', createdAt: T0, updatedAt: T0, folderId: 'math' }
  ];
  d.folders = [folder('math', 'Математика')];
  return d;
}

describe('Слияние папок и домашки', () => {
  it('папку и задания с обеих сторон объединяет, более свежая правка побеждает', () => {
    const pc = base();
    const phone = base();
    pc.folders[0] = folder('math', 'Математика (7 класс)', T2);
    phone.folders[0] = folder('math', 'Матем.', T1);
    pc.homework = [hw('h1', '§ 5')];
    phone.homework = [hw('h2', 'упр. 3'), { ...hw('h1', '§ 5'), done: true, updatedAt: T1 }];
    const { data } = mergeData(pc, phone);
    expect(data.folders[0].name).toBe('Математика (7 класс)');
    expect(data.homework.map((h) => h.id).sort()).toEqual(['h1', 'h2']);
    expect(data.homework.find((h) => h.id === 'h1')!.done).toBe(true);
  });

  it('удалённая на другом устройстве папка исчезает, предметы остаются без папки', () => {
    const pc = base();
    const phone = base();
    phone.folders = [];
    phone.subjects = phone.subjects.map((s) => ({ ...s, folderId: undefined, updatedAt: T1 }));
    phone.deleted = { 'folder:math': T1, 'hw:h1': T1 };
    pc.homework = [hw('h1', 'старое')];
    const { data } = mergeData(pc, phone);
    expect(data.folders).toHaveLength(0);
    expect(data.homework).toHaveLength(0);
    expect(data.subjects.every((s) => !s.folderId)).toBe(true);
  });
});

describe('Домашка', () => {
  const now = new Date(2026, 8, 26, 15, 0); // суббота
  it('раскладывает по срокам', () => {
    const d = (n: number) => {
      const x = new Date(now);
      x.setDate(x.getDate() + n);
      return ymd(x);
    };
    expect(groupOf(hw('a', '', { due: d(-1) }), now)).toBe('overdue');
    expect(groupOf(hw('a', '', { due: d(0) }), now)).toBe('today');
    expect(groupOf(hw('a', '', { due: d(1) }), now)).toBe('tomorrow');
    expect(groupOf(hw('a', '', { due: d(5) }), now)).toBe('week');
    expect(groupOf(hw('a', '', { due: d(20) }), now)).toBe('later');
    expect(groupOf(hw('a', ''), now)).toBe('nodate');
    expect(groupOf(hw('a', '', { due: d(-3), done: true }), now)).toBe('done');
  });

  it('«к следующему уроку» берёт день из расписания', () => {
    const data = base();
    data.settings.schedule = { '1': ['alg'], '4': ['alg', 'geo'] };
    expect(nextLesson(data, 'alg', now)).toBe('2026-09-28'); // понедельник
    expect(nextLesson(data, 'geo', now)).toBe('2026-10-01'); // четверг
    expect(nextLesson(data, 'nope', now)).toBeNull();
  });

  it('план уведомлений: только будущие и несделанные, по порядку', () => {
    const data = base();
    const at = (h: number) => new Date(2026, 8, 26 + h, 18).toISOString();
    data.homework = [hw('late', 'b', { remind: at(2) }), hw('soon', 'a', { remind: at(1), subjectId: 'alg' }), hw('done', 'c', { remind: at(1), done: true }), hw('past', 'd', { remind: at(-1) })];
    const plan = notificationPlan(data, now);
    expect(plan.map((p) => p.id)).toEqual(['hw:soon', 'hw:late']);
    expect(plan[0].title).toContain('Алгебра');
    data.settings.reminder = '19:00';
    data.settings.features.tray = true;
    expect(notificationPlan(data, now, true).filter((p) => p.id.startsWith('daily:'))).toHaveLength(14);
  });
});

describe('Видео по ссылке', () => {
  it('YouTube: обычная, короткая, shorts, с временем', () => {
    expect(parseVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.embed).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(parseVideo('https://youtu.be/dQw4w9WgXcQ?t=1m30s')?.embed).toContain('start=90');
    expect(parseVideo('https://youtube.com/shorts/abcdefghijk')?.kind).toBe('youtube');
  });
  it('Rutube, VK, файл и не-видео', () => {
    expect(parseVideo('https://rutube.ru/video/0123456789abcdef0123456789abcdef/')?.kind).toBe('rutube');
    expect(parseVideo('https://vk.com/video-12345_67890')?.kind).toBe('vk');
    expect(parseVideo('https://example.com/lesson.mp4')?.kind).toBe('file');
    expect(parseVideo('https://example.com/page')).toBeNull();
    expect(parseVideo('javascript:alert(1)')).toBeNull();
  });
});

describe('Моды', () => {
  it('читает шапку мода', () => {
    const h = parseHeader('// @id my-mod\n// @name Мой мод\n// @version 1.2\n// @description Делает хорошо\nexport default { onload(app) {} }');
    expect(h).toMatchObject({ id: 'my-mod', name: 'Мой мод', version: '1.2', description: 'Делает хорошо' });
  });
});

describe('Правила: слова-подсказки', () => {
  it('находит слово в разных формах и не цепляет чужие слова', async () => {
    const { makeRuleMatcher, findRuleWords, rulePreview } = await import('./rules');
    const d = base();
    d.topics = [
      { id: 'r1', kind: 'rule', subjectId: 'alg', name: 'Причастие', note: 'Н и НН: $x = \\frac{a}{b}$', ruleWords: ['причастие'], createdAt: T0, updatedAt: T0 },
      { id: 't1', subjectId: 'alg', name: 'Тема', note: '', createdAt: T0, updatedAt: T0 }
    ];
    const m = makeRuleMatcher(d, 'alg')!;
    const text = 'Причастия и причастием — это части речи, а «непричастный» — нет.';
    const found = findRuleWords(text, m).map((r) => text.slice(r.from, r.to));
    expect(found).toEqual(['Причастия', 'причастием']);
    expect(makeRuleMatcher(d, 'geo')).toBeNull();
    expect(rulePreview(d.topics[0].note)).toBe('Н и НН: x = a/b');
  });
});
