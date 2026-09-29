import { describe, expect, it } from 'vitest';
import { createAiService } from '../shared/aiCore.mjs';
import { humanError } from './ai';
import { parseListText } from './components/StudyListView';
import { buildObsidianExport } from './obsidianExport';
import { buildQueue } from './srs';
import { addList, addListRow, addListRows, addTopic, childTopics, deleteList, deleteSubject, emptyData, getData, replaceData, restoreRemoved, subjectRules, updateList } from './store';

function fresh() {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'Английский', color: '#000', createdAt: '2026-01-01T00:00:00Z' }];
  d.topics = [{ id: 't1', subjectId: 's1', name: 'Unit 1', note: 'Текст', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }];
  replaceData(d);
}

describe('вставка списком', () => {
  it('понимает тире, табуляцию, двоеточие и нумерацию', () => {
    expect(parseListText('apple — яблоко — I eat an apple\n2) cat - кошка\nsun\tсолнце\nТермин: определение, длинное\n\nпусто')).toEqual([
      { a: 'apple', b: 'яблоко', c: 'I eat an apple' },
      { a: 'cat', b: 'кошка', c: undefined },
      { a: 'sun', b: 'солнце', c: undefined },
      { a: 'Термин', b: 'определение, длинное', c: undefined }
    ]);
  });
});

describe('словари и списки', () => {
  it('строки становятся карточками, режим меняет тип, удаление убирает карточки', () => {
    fresh();
    const l = addList('t1', 'vocab');
    expect(l.mode).toBe('reverse');
    expect(l.lang).toBe('en-US');
    addListRow('t1', l, { a: 'apple', b: 'яблоко' });
    expect(addListRows('t1', l, [{ a: 'cat', b: 'кошка' }, { a: 'dog', b: 'собака', c: 'a good dog' }])).toBe(2);
    let cards = getData().cards.filter((c) => c.listId === l.id);
    expect(cards.map((c) => c.type)).toEqual(['reverse', 'reverse', 'reverse']);
    // в обе стороны → 6 элементов повторения
    expect(buildQueue(getData(), new Date(), { cardIds: cards.map((c) => c.id) }).length).toBeGreaterThanOrEqual(3);
    updateList('t1', l.id, { mode: 'typing' });
    cards = getData().cards.filter((c) => c.listId === l.id);
    expect(cards.every((c) => c.type === 'typing')).toBe(true);
    const md = buildObsidianExport(getData()).find((f) => f.path.endsWith('Unit 1.md'))!.content;
    expect(md).toContain('## Словарь');
    expect(md).toContain('| dog | собака | a good dog |');
    deleteList('t1', l.id);
    expect(getData().cards.filter((c) => c.listId === l.id)).toHaveLength(0);
    expect(getData().topics[0].lists).toEqual([]);
    expect(Object.keys(getData().deleted ?? {}).filter((k) => k.startsWith('card:'))).toHaveLength(3);
  });
});

describe('правила предмета и удаление с возвратом', () => {
  it('правила не попадают в дерево тем, но экспортируются в папку «Правила»', () => {
    fresh();
    const r = addTopic('s1', 'Present Simple', undefined, 'rule');
    expect(childTopics(getData(), 's1').map((t) => t.id)).toEqual(['t1']);
    expect(subjectRules(getData(), 's1').map((t) => t.id)).toEqual([r.id]);
    const paths = buildObsidianExport(getData()).map((f) => f.path);
    expect(paths).toContain('Английский/Правила/Present Simple.md');
  });

  it('удалённый предмет возвращается целиком', () => {
    fresh();
    const l = addList('t1', 'terms');
    addListRow('t1', l, { a: 'noun', b: 'существительное' });
    const before = JSON.stringify({ s: getData().subjects, t: getData().topics.map((t) => t.id), c: getData().cards.map((c) => c.id) });
    const removed = deleteSubject('s1');
    expect(getData().subjects).toHaveLength(0);
    expect(getData().deleted?.['subj:s1']).toBeTruthy();
    restoreRemoved(removed);
    expect(getData().deleted?.['subj:s1']).toBeUndefined();
    expect(JSON.stringify({ s: getData().subjects.map((s) => ({ ...s, updatedAt: undefined })), t: getData().topics.map((t) => t.id), c: getData().cards.map((c) => c.id) })).toBe(
      before.replace(/"createdAt"/, '"createdAt"')
    );
  });
});

describe('OpenRouter: бесплатная модель занята', () => {
  it('просит запасную бесплатную модель, повторяет и показывает настоящую причину', async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    let n = 0;
    const store = { cfg: {} as Record<string, unknown>, read() { return this.cfg; }, write(c: unknown) { this.cfg = c as Record<string, unknown>; }, encrypt: (s: string) => 'e:' + s, decrypt: (s: string) => (s || '').slice(2), newId: () => 'x1' };
    const http = async (url: string, init: { body?: string }) => {
      sent.push({ url, body: JSON.parse(init.body || '{}') });
      n++;
      if (n <= 2) return { status: 429, text: JSON.stringify({ error: { message: 'Provider returned error', code: 429, metadata: { raw: 'deepseek/deepseek-r1:free is temporarily rate-limited upstream. Please retry shortly', provider_name: 'Chutes' } } }) };
      return { status: 200, text: JSON.stringify({ choices: [{ message: { content: 'готово' } }] }) };
    };
    const ai = createAiService({ http, store });
    ai.saveCustom({ name: 'OR', format: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-r1:free', auth: 'bearer', key: 'sk-or-v1-abc', select: true });
    const r1 = await ai.ask({ text: 'привет', noRetry: true });
    expect(r1.ok).toBe(false);
    expect(sent[0].body.models).toEqual(['deepseek/deepseek-r1:free', 'openrouter/free']);
    expect(humanError((r1 as { error: string }).error)).toMatch(/перегружена у поставщика/);
    expect((r1 as { error: string }).error).toContain('Chutes');
    const r2 = await ai.ask({ text: 'привет' });
    expect(r2).toEqual({ ok: true, text: 'готово' });
    expect(sent[2].body.model).toBe('openrouter/free');
  }, 10000);
});
