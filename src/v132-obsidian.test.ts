// 1.32, экспорт для Obsidian: в свойствах — только полезное человеку, служебное — в скрытом блоке; старый формат читается.
import { describe, expect, it } from 'vitest';
import { buildMarkdownExport, zipExport } from './mdExport';
import { applyImportPlan } from './mdApply';
import { packFromEntries, packFromZip, planImport } from './mdImport';
import { emitHiddenMeta, obsidianDate, parseFrontmatter, takeHiddenMeta } from './mdPortable';
import { emptyData } from './store';
import type { AppData } from './types';

const T0 = '2026-10-08T21:52:49.415Z';
function data(): AppData {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'Биология', color: '#2BA36B', createdAt: T0 }];
  d.topics = [
    { id: 't1', subjectId: 's1', name: '§1. Зоология — наука о животных', note: 'Зоология изучает животных.', order: 1, lists: [{ id: 'e166c339', kind: 'terms', title: 'Термины %% --> <b>', cols: ['Термин', 'Определение', 'Пример'] } as never], createdAt: T0, updatedAt: T0 },
    { id: 't2', subjectId: 's1', name: '§2. Простейшие', note: 'Амёба.', order: 2, createdAt: T0, updatedAt: '2999-01-01T00:00:00.000Z' }
  ];
  d.cards = [
    { id: 'c1', topicId: 't1', type: 'reverse', front: 'Зоология', back: 'наука о животных', listId: 'e166c339', createdAt: T0, updatedAt: T0 },
    { id: 'c2', topicId: 't1', type: 'basic', front: 'Что изучает зоология?', back: 'Животных', createdAt: T0, updatedAt: T0 }
  ];
  return d;
}

const ALLOWED = ['title', 'subject', 'tags', 'created', 'updated', 'exam'];

describe('Obsidian: свойства', () => {
  it('в свойствах только title, subject, tags, created, updated (и контрольная); значения — не JSON-объекты', () => {
    const note = buildMarkdownExport(data(), { flavor: 'obsidian' }).find((f) => f.path.endsWith('Зоология — наука о животных.md'))!.content;
    const { meta, body } = parseFrontmatter(note);
    for (const k of Object.keys(meta)) expect(ALLOWED).toContain(k);
    for (const v of Object.values(meta)) expect(typeof v === 'object' && v !== null && !Array.isArray(v)).toBe(false);
    expect(meta.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(meta.tags).toEqual(['refrain', 'биология']);
    // Словарь — таблицей в тексте, служебное — одной скрытой строкой в самом конце.
    expect(body).toMatch(/\| Термин \| Определение \| Пример \|/);
    expect(note.trimEnd().split('\n').at(-1)).toMatch(/^%% refrain \{.*\} %%$/);
    expect(takeHiddenMeta(body).meta['refrain-id']).toBe('t1');
  });

  it('дата из будущего не пишется в свойства', () => {
    const now = Date.parse('2026-10-17T12:00:00Z');
    expect(Date.parse(obsidianDate('2999-01-01T00:00:00.000Z', now)!)).toBeLessThanOrEqual(now);
  });

  it('экспорт → импорт: id, порядок, словари и карточки на месте; «%%» и «-->» в названии не ломают блок', async () => {
    const files = buildMarkdownExport(data(), { flavor: 'obsidian' });
    const plan = planImport(await packFromZip(await zipExport(files)), { fallbackName: 'Импорт' });
    let n = 0;
    const r = applyImportPlan(emptyData(), plan, () => 'n' + ++n, '2026-10-17T10:00:00.000Z');
    expect(r).toMatchObject({ topics: 2, cards: 2 });
    const t1 = r.data.topics.find((t) => t.name.startsWith('§1'))!;
    expect(t1.lists?.[0]).toMatchObject({ kind: 'terms', title: 'Термины %% --> <b>' });
    expect(r.data.cards.find((c) => c.front === 'Зоология')?.listId).toBe(t1.lists![0].id);
    expect(t1.createdAt).toBe(T0);
    expect(t1.note.trim()).toBe('Зоология изучает животных.');
    expect(r.data.subjects[0].color).toBe('#2BA36B');
    // Второй круг даёт те же файлы.
    const again = buildMarkdownExport(r.data, { flavor: 'obsidian' }).map((f) => f.path).sort();
    expect(again).toEqual(files.map((f) => f.path).sort());
  });

  it('старый формат (до 1.32: refrain-lists прямо в свойствах) по-прежнему импортируется', async () => {
    const old = `---\ntitle: Тема\nsubject: Биология\nsubject-color: "#123456"\nrefrain-id: old1\nrefrain-lists: [{"id":"L","kind":"terms","title":"Термины","cols":["Термин","Определение","Пример"]}]\n---\n# Тема\n\nТекст\n\n## Термины\n\n| Термин | Определение | Пример |\n| --- | --- | --- |\n| A | B | C |\n`;
    const plan = planImport(packFromEntries([{ path: 'Биология/Тема.md', bytes: new TextEncoder().encode(old) }]), { fallbackName: 'Импорт' });
    const r = applyImportPlan(emptyData(), plan, () => Math.random().toString(36).slice(2), T0);
    expect(r.data.topics[0].lists?.[0]).toMatchObject({ kind: 'terms', title: 'Термины' });
    expect(r.data.subjects[0].color).toBe('#123456');
  });

  it('испорченный скрытый блок — текст остаётся, ничего не падает; чужие ключи не берутся', () => {
    expect(takeHiddenMeta('Текст\n\n%% refrain {oops %%')).toEqual({ meta: {}, body: 'Текст\n\n%% refrain {oops %%' });
    expect(takeHiddenMeta('Т\n<!-- refrain {"__proto__":{"x":1},"refrain-id":"a"} -->').meta).toEqual({ 'refrain-id': 'a' });
    expect(emitHiddenMeta({}, 'plain')).toBe('');
  });
});
