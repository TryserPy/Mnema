import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { parseAnki } from './anki';
import { buildApkg, toAnkiCloze, toAnkiHtml } from './ankiExport';
import { emptyData } from './store';
import type { AppData } from './types';

function data(): AppData {
  const d = emptyData();
  const at = '2026-01-01T00:00:00Z';
  d.subjects = [{ id: 's1', name: 'Физика', color: '#000', createdAt: at }];
  d.topics = [{ id: 't1', subjectId: 's1', name: '§8 Закон Ома', note: '', createdAt: at, updatedAt: at }];
  d.cards = [
    { id: 'c1', topicId: 't1', type: 'basic', front: 'Закон **Ома**?', back: '$I = \\frac{U}{R}$', why: 'Больше напряжение — больше ток', createdAt: at, updatedAt: at },
    { id: 'c2', topicId: 't1', type: 'reverse', front: 'Ом', back: 'единица сопротивления', createdAt: at, updatedAt: at },
    { id: 'c3', topicId: 't1', type: 'cloze', front: 'Сила тока {{прямо}} пропорциональна {{напряжению}}', back: '', createdAt: at, updatedAt: at },
    { id: 'c4', topicId: 't1', type: 'typing', front: 'Единица тока', back: 'ампер|А', createdAt: at, updatedAt: at }
  ];
  d.states['c2:0'] = { due: new Date(Date.now() + 5 * 86400000).toISOString(), stability: 12, difficulty: 5, elapsed_days: 3, scheduled_days: 8, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: new Date().toISOString() };
  return d;
}

describe('экспорт в Anki', () => {
  it('разметка и пропуски', () => {
    expect(toAnkiHtml('**Ж** и $x^2$ <3\nстрока')).toBe('<b>Ж</b> и \\(x^2\\) &lt;3<br>строка');
    expect(toAnkiCloze('{{a}} и {{c3::b}} и {{c::d}}')).toBe('{{c1::a}} и {{c3::b}} и {{c2::c::d}}');
  });
  it('колода читается обратно тем же импортом', async () => {
    const SQL = await initSqlJs();
    const r = await buildApkg(data(), SQL, { progress: true });
    expect(r.notes).toBe(4);
    expect(r.cards).toBe(1 + 2 + 2 + 1);
    const back = parseAnki('mnema.apkg', r.bytes, SQL, { progress: true, settings: { retention: 0.9 } });
    const deck = back.decks.find((x) => x.path.join('::') === 'Мнема::Физика::§8 Закон Ома')!;
    expect(deck).toBeTruthy();
    expect(deck.cards.map((c) => c.type).sort()).toEqual(['basic', 'cloze', 'reverse', 'typing']);
    const basic = deck.cards.find((c) => c.type === 'basic')!;
    expect(basic.front).toContain('**Ома**');
    expect(basic.back).toContain('$I = \\frac{U}{R}$');
    const cloze = deck.cards.find((c) => c.type === 'cloze')!;
    expect(cloze.front).toMatch(/\{\{(c1::)?прямо\}\}/);
    const rev = deck.cards.find((c) => c.type === 'reverse')!;
    expect(back.report.withProgress).toBeGreaterThanOrEqual(1);
    expect(Object.keys(rev.states).length).toBeGreaterThanOrEqual(1);
  });
});
