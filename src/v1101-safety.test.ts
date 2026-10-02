// 1.10.1: находки независимой проверки — зависание на кривых данных, моды из чужой копии, подделка окна через class, обход экранирования CSS.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ankiHtmlToMarkdown } from './anki';
import { examsOf } from './examList';
import { KATEX_CLASSES, safeClassList } from './katexClasses';
import { sanitizeCss } from './mods';
import { breakTopicCycles, cleanExam, validExamDate } from './safeData';
import { decodeCssEscapes } from './safeCss';
import { CATALOG_PLUGINS } from './plugins/catalog';
import { examBoost } from './srs';
import { emptyData, neutralizeForeign, normalizeData } from './store';
import type { AppData, PluginRec, Topic } from './types';

const T = (id: string, parentId?: string, extra: Partial<Topic> = {}): Topic => ({ id, subjectId: 's1', name: id, note: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...(parentId ? { parentId } : {}), ...extra });

function dataWith(topics: Topic[]): AppData {
  const d = emptyData();
  d.subjects.push({ id: 's1', name: 'Предмет', color: '#3F51D8', createdAt: '2026-01-01T00:00:00Z' });
  d.topics = topics;
  return d;
}

describe('петли в родителях тем', () => {
  it('рвёт петлю A→B→A в одном месте — у темы с наименьшим id', () => {
    const out = breakTopicCycles([T('b', 'a'), T('a', 'b')]);
    expect(out.find((t) => t.id === 'a')!.parentId).toBeUndefined();
    expect(out.find((t) => t.id === 'b')!.parentId).toBe('a');
  });
  it('тема, которая сама себе родитель, и длинная петля', () => {
    expect(breakTopicCycles([T('x', 'x')])[0].parentId).toBeUndefined();
    const out = breakTopicCycles([T('a', 'b'), T('b', 'c'), T('c', 'd'), T('d', 'a'), T('e', 'a')]);
    // дальше вверх по родителям доходим до корня из любой темы
    const byId = new Map(out.map((t) => [t.id, t]));
    for (const t of out) {
      let p = t.parentId;
      for (let i = 0; p && i < 10; i++) p = byId.get(p)?.parentId;
      expect(p).toBeUndefined();
    }
  });
  it('нормальное дерево не трогает (тот же массив)', () => {
    const topics = [T('a'), T('b', 'a'), T('c', 'b')];
    expect(breakTopicCycles(topics)).toBe(topics);
  });
  it('examsOf с петлёй и старой датой не зависает', () => {
    const d = dataWith([T('a', 'b', { examDate: '2030-01-10' }), T('b', 'a', { examDate: '2030-01-11' })]);
    const t0 = Date.now();
    expect(examsOf(d).length).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it('normalizeData рвёт петлю при загрузке', () => {
    const d = dataWith([T('a', 'b'), T('b', 'a')]);
    const n = normalizeData(JSON.parse(JSON.stringify(d)));
    const roots = n.topics.filter((t) => !t.parentId);
    expect(roots.length).toBe(1);
  });
});

describe('кривые контрольные из чужих данных', () => {
  it('настоящая дата', () => {
    expect(validExamDate('2026-10-09')).toBe(true);
    for (const bad of ['9999-12-31', '2026-02-31', '26-10-09', '2026/10/09', '', null, 5, '1999-12-31']) expect(validExamDate(bad)).toBe(false);
  });
  it('cleanExam: имя не строка, id «topic:», дата не дата, темы не строки', () => {
    const ok = { id: 'e1', subjectId: 's1', name: 'К', date: '2026-10-09', topicIds: ['a'], createdAt: 'x', updatedAt: 'y' };
    expect(cleanExam(ok)).not.toBeNull();
    expect(cleanExam({ ...ok, name: null })!.name).toBe('Контрольная');
    expect(cleanExam({ ...ok, id: 'topic:a' })).toBeNull();
    expect(cleanExam({ ...ok, date: '9999-12-31' })).toBeNull();
    expect(cleanExam({ ...ok, topicIds: [1, null, {}] })).toBeNull();
    expect(cleanExam({ ...ok, subjectId: 5 })).toBeNull();
    expect(cleanExam({ ...ok, createdAt: undefined, updatedAt: undefined })!.updatedAt).toMatch(/^1970/);
  });
  it('normalizeData: контрольная с name: null не роняет examsOf; далёкая дата у темы убирается', () => {
    const d = dataWith([T('a', undefined, { examDate: '9999-12-31' }), T('b')]);
    d.exams = [
      { id: 'e1', subjectId: 's1', name: null as unknown as string, date: '2026-10-09', topicIds: ['b'], createdAt: 'x', updatedAt: 'y' },
      { id: 'e2', subjectId: 's1', name: 'Б', date: '2026-10-09', topicIds: ['b'], createdAt: 'x', updatedAt: 'y' }
    ];
    const n = normalizeData(JSON.parse(JSON.stringify(d)));
    expect(n.topics.find((t) => t.id === 'a')!.examDate).toBeUndefined();
    expect(() => examsOf(n)).not.toThrow();
  });
  it('далёкая дата не вешает подсчёт (до 2100 года)', () => {
    const d = dataWith([T('a')]);
    d.cards.push({ id: 'c1', topicId: 'a', type: 'basic', front: 'в', back: 'о', createdAt: 'x', updatedAt: 'x' } as AppData['cards'][number]);
    d.exams = [{ id: 'e1', subjectId: 's1', name: 'Далеко', date: '2100-12-31', topicIds: ['a'], createdAt: 'x', updatedAt: 'y' }];
    const t0 = Date.now();
    examBoost(d, new Date('2026-10-02T10:00:00Z'));
    expect(Date.now() - t0).toBeLessThan(300);
  });
});

describe('моды из чужой копии', () => {
  const mod = (over: Partial<PluginRec>): PluginRec => ({ id: 'pomodoro', name: 'Помодоро', version: '1', description: '', code: 'export default {}', enabled: true, fromCatalog: true, ...over });
  it('чужой код под знакомым id приходит выключенным и без метки «из каталога»', () => {
    const local = emptyData();
    const theirs = emptyData();
    theirs.settings.plugins = [mod({ code: 'export default { onload(){ document.title = "ВЗЛОМ" } }' })];
    theirs.settings.pluginsSafe = true; // копия сама говорит «всё безопасно»
    const { data, notes } = neutralizeForeign(theirs, local);
    expect(data.settings.plugins[0].enabled).toBe(false);
    expect(data.settings.plugins[0].fromCatalog).toBe(false);
    expect(data.settings.pluginsSafe).toBe(true);
    expect(notes.join(' ')).toContain('Помодоро');
  });
  it('мод с тем же кодом, что уже стоит здесь, сохраняет здешнюю включённость', () => {
    const local = emptyData();
    local.settings.plugins = [mod({ enabled: true, fromCatalog: false })];
    const theirs = emptyData();
    theirs.settings.plugins = [mod({ enabled: false })];
    const { data, notes } = neutralizeForeign(theirs, local);
    expect(data.settings.plugins[0].enabled).toBe(true);
    expect(notes.join(' ')).not.toContain('моды');
  });
  it('мод, совпадающий с каталогом по коду, остаётся выключенным, но подписан «из каталога»', () => {
    const c = CATALOG_PLUGINS[0];
    const theirs = emptyData();
    theirs.settings.plugins = [mod({ id: c.id, name: c.name, code: c.code, enabled: true, fromCatalog: false })];
    const { data } = neutralizeForeign(theirs, emptyData());
    expect(data.settings.plugins[0]).toMatchObject({ enabled: false, fromCatalog: true });
  });
});

describe('CSS из файла: двойное экранирование', () => {
  it('«\\5c \\5c 75rl(» не превращается в url(', () => {
    const out = sanitizeCss('body{background-image:\\5c \\5c 75rl(https://evil.example/x.png)}');
    expect(out).not.toMatch(/url\s*\(\s*['"]?https?:/i);
    expect(out).not.toContain('evil.example/x.png)');
    expect(decodeCssEscapes('\\\\75rl(')).not.toContain('\\');
  });
  it('обычный CSS и content с кодом знака не портятся', () => {
    expect(sanitizeCss('.a:before{content:"\\2022"}')).toContain('•');
    expect(sanitizeCss('.btn{min-height:48px}')).toBe('.btn{min-height:48px}');
  });
});

describe('class из текста', () => {
  it('оставляет свои классы и классы KaTeX, остальное выбрасывает', () => {
    expect(safeClassList('modal-back modal')).toBe('');
    expect(safeClassList('photo-view')).toBe('');
    expect(safeClassList('math-block katex-display evil')).toBe('math-block katex-display');
    expect(safeClassList('language-js')).toBe('language-js');
  });
  it('список классов KaTeX совпадает с katex.min.css установленной версии', () => {
    const css = readFileSync('node_modules/katex/dist/katex.min.css', 'utf8').replace(/url\([^)]*\)/g, '');
    const used = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^(woff2?|ttf|eot)$/.test(c)));
    for (const c of used) expect(KATEX_CLASSES.has(c), 'нет в списке: ' + c).toBe(true);
  });
});

describe('Anki: сущности не становятся тегами', () => {
  it('&lt;div class="modal-back"&gt; остаётся текстом', () => {
    const md = ankiHtmlToMarkdown('&lt;div class="modal-back"&gt;окно&lt;/div&gt;');
    expect(md).not.toMatch(/(^|[^\\])<div/);
    expect(md).toContain('\\<div');
  });
  it('обычный текст и формулы не портятся', () => {
    expect(ankiHtmlToMarkdown('<b>да</b> и нет')).toBe('**да** и нет');
  });
});
