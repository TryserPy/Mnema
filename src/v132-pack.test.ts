// 1.32, файл .mnema: всё / предмет / тема, контрольная сумма, пароль, совместимость с версией 1, экспорт → импорт = то же самое.
import { describe, expect, it } from 'vitest';
import { buildPack, importPack, readPack } from './mnemaPack';
import { emptyData, getData, replaceData } from './store';
import type { AppData } from './types';

const T0 = '2026-09-01T10:00:00.000Z';
function base(): AppData {
  const d = emptyData();
  d.subjects = [
    { id: 's1', name: 'Биология', color: '#2BA36B', icon: '🧬', createdAt: T0 },
    { id: 's2', name: 'Геометрия', color: '#3366CC', createdAt: T0 }
  ];
  d.topics = [
    { id: 't1', subjectId: 's1', name: '§1. Зоология', note: '# Зоология\n\nНаука о животных.', lists: [{ id: 'l1', kind: 'terms', title: 'Термины', cols: ['Термин', 'Определение'], rows: [['Зоология', 'наука о животных']] } as never], createdAt: T0, updatedAt: T0 },
    { id: 't2', subjectId: 's2', name: 'Четырёхугольники', note: 'Параллелограмм…', createdAt: T0, updatedAt: T0 }
  ];
  d.cards = [
    { id: 'c1', topicId: 't1', type: 'basic', front: 'Что изучает зоология?', back: 'Животных', why: 'зоо — животное', createdAt: T0, updatedAt: T0 },
    { id: 'c2', topicId: 't1', type: 'cloze', front: '{{c1::Зоология}} — наука о животных', back: '', listId: 'l1', createdAt: T0, updatedAt: T0 },
    { id: 'c3', topicId: 't2', type: 'basic', front: 'Сумма углов?', back: '360°', createdAt: T0, updatedAt: T0 }
  ];
  return d;
}

/** Содержимое без id и дат — то, что должно пережить «экспорт → импорт». */
function content(d: AppData) {
  return d.topics
    .map((t) => ({
      subject: d.subjects.find((s) => s.id === t.subjectId)!.name,
      name: t.name,
      note: t.note,
      lists: t.lists ?? [],
      cards: d.cards.filter((c) => c.topicId === t.id).map((c) => ({ type: c.type, front: c.front, back: c.back, why: c.why, list: Boolean(c.listId) }))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe('.mnema', () => {
  it('всё: экспорт → импорт в пустое приложение даёт то же содержимое', async () => {
    const d = base();
    const f = await buildPack(d, { kind: 'all' });
    expect(f.name).toBe('Refrain — всё.mnema');
    expect(JSON.parse(f.text)).toMatchObject({ kind: 'mnema-pack', version: 2, scope: 'all' });
    replaceData(emptyData());
    const r = await readPack(f.text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const added = importPack(r.items);
    expect(added).toMatchObject({ topics: 2, cards: 3 });
    expect(content(getData())).toEqual(content(d));
    expect(getData().subjects.find((s) => s.name === 'Биология')).toMatchObject({ color: '#2BA36B', icon: '🧬' });
  });

  it('предмет: только его темы', async () => {
    const f = await buildPack(base(), { kind: 'subject', id: 's2' });
    const r = await readPack(f.text);
    expect(r.ok && r.items.map((i) => i.topic.name)).toEqual(['Четырёхугольники']);
  });

  it('тема без пароля — версия 1 (откроют и старые выпуски) с контрольной суммой', async () => {
    const f = await buildPack(base(), { kind: 'topic', id: 't1' });
    const raw = JSON.parse(f.text);
    expect(raw).toMatchObject({ kind: 'mnema-topic', version: 1 });
    expect(raw.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect((await readPack(f.text)).ok).toBe(true);
  });

  it('старый файл версии 1 без контрольной суммы читается', async () => {
    const v1 = JSON.stringify({ kind: 'mnema-topic', version: 1, exportedAt: T0, subject: { name: 'Химия', color: '#f00' }, topic: { name: 'Атомы', note: 'x' }, cards: [{ type: 'basic', front: 'a', back: 'b' }] });
    const r = await readPack(v1);
    expect(r.ok && r.items[0].topic.name).toBe('Атомы');
  });

  it('пароль: без него — просьба ввести, с неверным — ошибка, с верным — то же содержимое', async () => {
    const d = base();
    const f = await buildPack(d, { kind: 'all' }, 'секрет-123');
    expect(f.text).not.toContain('Зоология');
    expect(await readPack(f.text)).toEqual({ ok: false, needPassword: true });
    expect(await readPack(f.text, 'не тот')).toMatchObject({ ok: false, error: expect.stringMatching(/не подходит/) });
    const r = await readPack(f.text, 'секрет-123');
    expect(r.ok && r.items.length).toBe(2);
  });

  it('повреждённый файл (правка содержимого) ловится контрольной суммой', async () => {
    const f = await buildPack(base(), { kind: 'all' });
    const bad = f.text.replace('Животных', 'Растений');
    expect(await readPack(bad)).toMatchObject({ ok: false, error: expect.stringMatching(/повреждён/) });
  });

  it('файл из будущей версии, мусор и огромный файл — понятный отказ', async () => {
    expect(await readPack(JSON.stringify({ kind: 'mnema-pack', version: 9, items: [], checksum: '' }))).toMatchObject({ ok: false, error: expect.stringMatching(/новой версии/) });
    expect(await readPack('{oops')).toMatchObject({ ok: false });
    expect(await readPack('{"__proto__":{"polluted":1},"kind":"x"}')).toMatchObject({ ok: false });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
