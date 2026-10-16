// 1.31, поток B: выноски «> [!def] Термин», плашка [стр. N], {?слово?} — просмотр, редактор (Markdown ↔ узлы TipTap), импорт и экспорт.
import { describe, expect, it, vi } from 'vitest';
// В тестах нет DOM: очистка HTML проверяется в e2e (e2e/v131-callouts.mjs), здесь — разметка до неё.
vi.mock('dompurify', () => ({ default: { isSupported: false, sanitize: (h: string) => h, addHook() {} } }));
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import { Table, TableKit } from '@tiptap/extension-table';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { CALLOUTS } from '../shared/prompts/markup';
import { calloutLook, calloutsToLegacyFrames, legacyFramesToCallouts, matchCallout } from './callout';
import { Callout, PageChip, UnsureWords } from './calloutEditor';
import { renderMarkdown } from './components/Markdown';
import { buildMarkdownExport } from './mdExport';
import { packFromEntries, planImport } from './mdImport';
import { canonNote } from './noteText';
import { convertObsidian } from './obsidian';
import type { AppData } from './types';

// Те же узлы, что в NoteEditor.tsx (без интерфейсных настроек).
const md = new MarkdownManager({ extensions: [StarterKit, Highlight, TableKit.configure({ table: false }), Table, InlineMath, BlockMath, Image, Callout, PageChip, UnsureWords] });
const viaEditor = (s: string) => md.serialize(md.parse(s));

const NOTE = [
  '## Фотосинтез',
  '',
  '*Растения делают органику из света.*',
  '',
  '> [!def] **Фотосинтез**',
  '> образование ==органических веществ== из $CO_2$ и воды на свету',
  '>',
  '> - в хлоропластах [стр. 12]',
  '> - нужен {?хлорофилл?}',
  '',
  '> [!tip]- Запомни',
  '> свет → энергия',
  '',
  '> [!warn]',
  '',
  '> [!note] Чужая выноска',
  '> из Obsidian',
  '',
  '> **Запомните:** старая рамка учебника',
  '',
  '| Орган | Роль |',
  '| --- | --- |',
  '| лист | фотосинтез |',
  '',
  '$$',
  'E = h\\nu',
  '$$',
  '',
  'Текст на [стр. 13].',
  '',
  '- список',
  '  > [!ex] Пример',
  '  > в списке'
].join('\n');

describe('разбор выноски', () => {
  it('заголовок, тип, свёртка и текст', () => {
    expect(matchCallout('> [!DEF]- Термин\n> строка 1\n>\n> строка 2\n\nдальше')).toMatchObject({ kind: 'def', fold: '-', title: 'Термин', body: 'строка 1\n\nстрока 2' });
    expect(matchCallout('> обычная цитата\n> [!tip] не выноска')).toBeNull();
    expect(matchCallout('текст\n> [!tip]')).toBeNull();
  });
  it('вид — из справочника разметки; чужие типы — обычная рамка', () => {
    for (const c of CALLOUTS) expect(calloutLook(c.type)).toEqual({ kind: c.type, icon: c.icon, title: c.title, known: true });
    expect(calloutLook('Info')).toEqual({ kind: 'info', icon: '', title: 'Информация', known: false });
    expect(calloutLook('xyz').title).toBe('xyz');
  });
});

describe('просмотр (Markdown.tsx)', () => {
  const html = renderMarkdown(NOTE);
  it('известные типы — со значком и заголовком по умолчанию', () => {
    expect(html).toContain('<div data-callout="def"><div data-callout-title=""><span data-callout-icon="" aria-hidden="true">📘</span><span><strong>Фотосинтез</strong></span></div>');
    expect(html).toMatch(/data-callout="warn"><div data-callout-title=""><span data-callout-icon="" aria-hidden="true">⚠️<\/span><span>Внимание<\/span>/);
  });
  it('«-» — свёрнутая выноска, чужой тип — рамка без значка', () => {
    expect(html).toMatch(/<details data-callout="tip"><summary data-callout-title="">.*Запомни.*<\/summary><div data-callout-body=""><p>свет → энергия<\/p>/s);
    expect(html).toContain('<div data-callout="note" data-callout-other=""><div data-callout-title=""><span>Чужая выноска</span>');
  });
  it('внутри выноски работают маркер, формулы, списки, плашки и {?слово?}', () => {
    const body = html.slice(html.indexOf('data-callout="def"'), html.indexOf('data-callout="tip"'));
    expect(body).toContain('<mark>органических веществ</mark>');
    expect(body).toContain('katex');
    expect(body).toContain('<span class="page-ref" data-page="12">стр. 12</span>');
    expect(body).toContain('<span data-unsure="" title="Неуверенно прочитано">хлорофилл</span>');
  });
  it('старые рамки и выноски в списке', () => {
    expect(html).toContain('<blockquote>\n<p><strong>Запомните:</strong> старая рамка учебника</p>');
    expect(html).toMatch(/<li>.*data-callout="ex".*<p>в списке<\/p>/s);
  });
  it('тип выноски попадает в атрибут только из букв, цифр, «-» и «_»', () => {
    expect(renderMarkdown('> [!x"onclick="y]\n> т')).not.toContain('data-callout');
    expect(renderMarkdown('> [!my-Type_2]\n> т')).toContain('<div data-callout="my-type_2" data-callout-other=""><div data-callout-title=""><span>my-type_2</span>');
  });
  it('[стр. N] и записанное прежним редактором \\[стр. N\\] — плашкой', () => {
    expect(renderMarkdown('а \\[стр. 4\\] б [стр. 5]')).toBe('<p>а <span class="page-ref" data-page="4">стр. 4</span> б <span class="page-ref" data-page="5">стр. 5</span></p>\n');
  });
});

describe('редактор: Markdown → узлы → Markdown', () => {
  it('выноски, ==факт==, таблицы, формулы, плашки и {?слово?} сохраняются', () => {
    const out = viaEditor(NOTE);
    // Редактор выравнивает столбцы таблицы пробелами и может оставить лишнюю пустую строку — на экране этого не видно.
    const norm = (t: string) => canonNote(t.replace(/^\|[ |-]+\|$/gm, '|-|').replace(/ {2,}/g, ' '));
    expect(norm(out)).toBe(norm(NOTE));
    expect(viaEditor(out)).toBe(out);
  });
  it('выноска — узел с типом, заголовком и свёрткой; [стр. N] — плашка-узел', () => {
    const doc = md.parse('> [!tip]+ Главное\n> текст [стр. 3]');
    expect(doc.content?.[0]).toMatchObject({ type: 'callout', attrs: { kind: 'tip', fold: '+', title: 'Главное' } });
    expect(JSON.stringify(doc)).toContain('{"type":"pageRef","attrs":{"page":3}}');
    expect(md.serialize(doc)).toBe('> [!tip]+ Главное\n> текст [стр. 3]');
  });
  it('пустая выноска — одна строка; прежняя запись \\[стр. N\\] становится [стр. N]', () => {
    expect(viaEditor('> [!def] Термин')).toBe('> [!def] Термин');
    expect(viaEditor('см. \\[стр. 7\\]')).toBe('см. [стр. 7]');
  });
  it('старые заметки с «> **Запомните:**» открываются как прежде — рамкой', () => {
    expect(viaEditor('> **Запомните:** реформа 1861 г.')).toBe('> **Запомните:** реформа 1861 г.');
  });
});

describe('импорт и экспорт', () => {
  const callouts = '> [!def] Термин\n> определение\n\n> [!note]- Своё\n> текст';
  it('импорт из Obsidian и обратно — тот же текст выносок', () => {
    expect(convertObsidian(callouts)).toBe(callouts);
    const pack = packFromEntries([{ path: 'Био/Клетка.md', bytes: new TextEncoder().encode(callouts) }]);
    const note = planImport(pack).topics[0].note;
    expect(note).toBe(callouts);
    expect(legacyFramesToCallouts(note)).toBe(callouts);
  });
  it('рамки учебника: экспорт — выноской Obsidian, импорт заметки Refrain — снова рамкой', () => {
    const old = '> **Запомните:** ток течёт\n\n> [!def] Ток\n> **Запомните:** внутри выноски не трогаем';
    const out = legacyFramesToCallouts(old);
    expect(out).toBe('> [!important] Запомните\n> ток течёт\n\n> [!def] Ток\n> **Запомните:** внутри выноски не трогаем');
    expect(calloutsToLegacyFrames(out)).toBe(old);
    expect(legacyFramesToCallouts('```\n> **Запомните:** код\n```')).toBe('```\n> **Запомните:** код\n```');
  });
  it('полный круг через папку Markdown сохраняет выноски', () => {
    const T0 = 1_700_000_000_000;
    const data = {
      folders: [],
      subjects: [{ id: 's1', name: 'Биология', color: '#2F8F5B', icon: '🌿', order: 0, createdAt: T0 }],
      topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note: `${callouts}\n\n> **Запомните:** клетка — единица жизни`, order: 0, createdAt: T0, updatedAt: T0 }],
      cards: [],
      settings: {}
    } as unknown as AppData;
    for (const flavor of ['plain', 'obsidian'] as const) {
      const files = buildMarkdownExport(data, { flavor });
      const file = files.find((f) => f.path.endsWith('Клетка.md'))!;
      expect(file.content).toContain(callouts);
      expect(file.content).toContain('> [!important] Запомните\n> клетка — единица жизни');
      const pack = packFromEntries(files.map((f) => ({ path: f.path, bytes: f.base64 ? Uint8Array.from(Buffer.from(f.content, 'base64')) : new TextEncoder().encode(f.content) })));
      const back = planImport(pack).topics.find((t) => t.name === 'Клетка')!;
      expect(back.note).toBe(data.topics[0].note);
    }
  });
});
