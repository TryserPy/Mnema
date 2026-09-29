import { describe, expect, it } from 'vitest';
import { exportChanges, parseChangeFile, planChanges } from './changes';
import { MNEMA_TEXT_GUIDE, parseMnemaText, splitDash, toMnemaText } from './mnemaText';
import { emptyData } from './store';
import type { AppData } from './types';

let n = 0;
const env = { now: new Date('2026-09-29T10:00:00Z'), uid: () => 'x' + ++n };
const T0 = '2026-09-01T10:00:00.000Z';

describe('1.8: Мнема-текст — простой формат для нейросети', () => {
  it('пример из инструкции читается без предупреждений', () => {
    const example = MNEMA_TEXT_GUIDE.split('ПРИМЕР:\n')[1].split('\n\nОтветь только')[0];
    const r = parseChangeFile(example);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.warnings).toEqual([]);
    const p = planChanges(emptyData(), r.pack, env);
    const t = p.data.topics.find((x) => x.name === '§12. Имя прилагательное')!;
    expect(t.note).toContain('> **Запомни:**');
    expect(t.note).toContain('| Разряд |');
    expect(t.important).toBeUndefined(); // «важная» — только если попросили
    expect(p.data.cards.filter((c) => c.topicId === t.id && c.listId)).toHaveLength(2);
    expect(p.data.cards.filter((c) => c.topicId === t.id && !c.listId)).toHaveLength(2);
    expect(p.touched).toContain(t.id);
  });

  it('конспект может содержать свои ## и ###, а @-строки делят разделы', () => {
    const pack = parseMnemaText('@предмет История\n@тема Реформы | контрольная: 2026-10-20\n## Причины\n### Экономика\nтекст\n@карточки\nКогда отменили крепостное право? — 1861\nЛишняя строка без разделителя\n@даты\n1861 :: Отмена крепостного права\n1864 — Земская реформа');
    const topic = pack.changes.find((c) => c.do === 'topic')!;
    expect(topic.note).toBe('## Причины\n### Экономика\nтекст');
    expect(topic.examDate).toBe('2026-10-20');
    expect((pack.changes.find((c) => c.do === 'cards')!.cards as unknown[])).toEqual([{ front: 'Когда отменили крепостное право?', back: '1861' }]);
    expect(pack.warnings).toHaveLength(1);
    expect(pack.changes.find((c) => c.do === 'list')).toMatchObject({ kind: 'dates', rows: [['1861', 'Отмена крепостного права'], ['1864', 'Земская реформа']] });
  });

  it('в определении может быть тире: делим только по первому', () => {
    const pack = parseMnemaText('@предмет Русский\n@тема Синтаксис\n@термины\nПодлежащее — главный член предложения — отвечает на вопрос «кто? что?»');
    expect(pack.changes.find((c) => c.do === 'list')!.rows).toEqual([['Подлежащее', 'главный член предложения — отвечает на вопрос «кто? что?»']]);
  });

  it('папка, общие термины, правило, стих со строфами, домашка, расписание, удаление', () => {
    const pack = parseMnemaText(['@папка 7 класс', '@предмет Литература | цвет: зелёный', '@общие термины', 'Эпитет :: образное определение', '@правило Рифма | слова: рифма', 'Созвучие окончаний строк.', '@тема Пушкин', '@стих Зимнее утро | автор: А. С. Пушкин', 'Мороз и солнце; день чудесный!', 'Ещё ты дремлешь, друг прелестный —', '', 'Пора, красавица, проснись:', '@домашка', 'Выучить стих :: 2026-10-02', '@расписание', 'пн: Литература', '@удалить тему Старая тема'].join('\n'));
    const kinds = pack.changes.map((c) => c.do);
    expect(kinds).toEqual(['folder', 'subject', 'glossary', 'rule', 'topic', 'poem', 'homework', 'schedule', 'delete']);
    expect(pack.changes[1]).toMatchObject({ folder: '7 класс', color: 'зелёный' });
    expect(pack.changes[5].text).toBe('Мороз и солнце; день чудесный!\nЕщё ты дремлешь, друг прелестный —\n\nПора, красавица, проснись:');
    expect(pack.changes[8]).toMatchObject({ what: 'topic', subject: 'Литература', name: 'Старая тема' });
  });

  it('ответ нейросети с ``` и текстом вокруг тоже читается', () => {
    const r = parseChangeFile('Вот файл:\n```\n@предмет Химия\n@тема Атомы\nтекст\n```\nУдачи!');
    expect(r.ok && r.pack.changes.map((c) => c.do)).toEqual(['subject', 'topic']);
  });

  it('выгрузка текстом и загрузка обратно ничего не меняют', () => {
    const d: AppData = emptyData();
    d.subjects = [{ id: 's1', name: 'Биология', color: '#2F9E5B', createdAt: T0 }];
    d.topics = [
      { id: 't1', subjectId: 's1', name: '§12 Фотосинтез', note: '## Фотосинтез\n**Фотосинтез** — процесс.\n\n> **Запомни:** на свету.', lists: [{ id: 'l1', kind: 'terms', title: 'Термины', cols: ['Термин', 'Определение', 'Пример'], mode: 'basic' }], createdAt: T0, updatedAt: T0 },
      { id: 'r1', subjectId: 's1', kind: 'rule', name: 'Правило', note: 'Текст', ruleWords: ['клетка'], createdAt: T0, updatedAt: T0 }
    ];
    d.cards = [
      { id: 'c1', topicId: 't1', type: 'basic', front: 'Где идёт?', back: 'В хлоропластах', createdAt: T0, updatedAt: T0 },
      { id: 'c2', topicId: 't1', listId: 'l1', type: 'basic', front: 'хлорофилл', back: 'пигмент', createdAt: T0, updatedAt: T0 }
    ];
    const text = toMnemaText(exportChanges(d, { subjectId: 's1' }));
    expect(text).toContain('@тема §12 Фотосинтез');
    const r = parseChangeFile(text);
    expect(r.ok).toBe(true);
    const p = planChanges(d, r.ok ? r.pack : { changes: [] }, env);
    expect(p.lines).toEqual([]);
    expect(p.data.cards).toEqual(d.cards);
  });

  it('строки с @ в конспекте и «|» в названии переживают выгрузку и загрузку', () => {
    const d: AppData = emptyData();
    d.subjects = [{ id: 's1', name: 'Информатика', color: '#2F9E5B', createdAt: T0 }];
    d.topics = [{ id: 't1', subjectId: 's1', name: 'A | B', note: 'Почта:\n@удалить тему Всё\n  \\@уже с чертой', createdAt: T0, updatedAt: T0 }];
    const text = toMnemaText(exportChanges(d, { subjectId: 's1' }));
    expect(text).toContain('@тема A \\| B');
    const r = parseChangeFile(text);
    expect(r.ok && r.pack.changes.some((c) => c.do === 'delete')).toBe(false);
    const p = planChanges(d, r.ok ? r.pack : { changes: [] }, env);
    expect(p.lines).toEqual([]);
    expect(p.data.topics).toEqual(d.topics);
  });

  it('карточка-пропуск с подсказкой не портится и не удваивается при выгрузке и загрузке', () => {
    const d: AppData = emptyData();
    d.subjects = [{ id: 's1', name: 'История', color: '#2F9E5B', createdAt: T0 }];
    d.topics = [{ id: 't1', subjectId: 's1', name: 'Пётр I', note: '', createdAt: T0, updatedAt: T0 }];
    d.cards = [
      { id: 'c1', topicId: 't1', type: 'cloze', front: 'Правил {{49 лет::сколько лет?}}', back: '', createdAt: T0, updatedAt: T0 },
      { id: 'c2', topicId: 't1', type: 'basic', front: 'Кто — «a::b»?', back: 'x', createdAt: T0, updatedAt: T0 }
    ];
    const text = toMnemaText(exportChanges(d, { subjectId: 's1' }));
    expect(text).toContain('Правил {{49 лет::сколько лет?}}\n');
    const r = parseChangeFile(text);
    const p = planChanges(d, r.ok ? r.pack : { changes: [] }, env);
    expect(p.data.cards.filter((c) => c.topicId === 't1')).toHaveLength(2);
    expect(p.data.cards.find((c) => c.id === 'c1')?.front).toBe('Правил {{49 лет::сколько лет?}}');
  });

  it('служебные слова объекта не становятся командой удаления', () => {
    const pack = parseMnemaText('@предмет X\n@удалить constructor Y\n@удалить __proto__ Z');
    expect(pack.changes.filter((c) => c.do === 'delete')).toEqual([]);
    expect(pack.warnings?.length).toBe(2);
  });

  it('длинная строка без тире разбирается быстро', () => {
    const t = Date.now();
    expect(splitDash('a' + ' '.repeat(80000) + 'b')).toBeNull();
    parseMnemaText('@предмет X\n@тема Y\n@термины\n' + 'a' + ' '.repeat(80000) + 'b');
    expect(Date.now() - t).toBeLessThan(500);
    expect(splitDash('кот — животное — домашнее')).toEqual(['кот', 'животное — домашнее']);
    expect(splitDash('северо-запад')).toBeNull();
  });

  it('слишком большой файл не разбирается', () => {
    const r = parseChangeFile('@предмет X\n' + 'x'.repeat(3_000_001));
    expect(r.ok).toBe(false);
  });
});
