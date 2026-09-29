import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { ankiHtmlToMarkdown, parseAnki, type AnkiParsed } from './anki';
import { buildPrompt, itemOrds } from './srs';
import type { Card } from './types';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => {
  SQL = await initSqlJs();
});

const load = (name: string, progress = true): AnkiParsed =>
  parseAnki(name, new Uint8Array(readFileSync(new URL('../test-fixtures/' + name, import.meta.url))), SQL, { progress, settings: { retention: 0.9 } });

const asCard = (c: { type: Card['type']; front: string; back: string }): Card => ({ ...c, id: 'x', topicId: 't', createdAt: '', updatedAt: '' });

describe('HTML Anki → Markdown', () => {
  it('жирный, переносы, сущности, формулы', () => {
    expect(ankiHtmlToMarkdown('Что такое <b> митоз</b>?')).toBe('Что такое **митоз**?');
    expect(ankiHtmlToMarkdown('A<br>B&nbsp;&amp;&nbsp;C')).toBe('A\nB & C');
    expect(ankiHtmlToMarkdown('Закон \\(I = \\frac{U}{R}\\) [sound:a.mp3]')).toBe('Закон $I = \\frac{U}{R}$');
    expect(ankiHtmlToMarkdown('<div>Мощность</div><div>\\[P = UI\\]</div>')).toBe('Мощность\n\n$$P = UI$$');
    expect(ankiHtmlToMarkdown('<ul><li>раз</li><li>два</li></ul>')).toBe('- раз\n- два');
  });
});

for (const file of ['new.apkg', 'legacy.apkg', 'all.colpkg']) {
  describe('Импорт ' + file, () => {
    it('колоды, типы карточек, картинки и звук', () => {
      const r = load(file);
      expect(r.decks.map((d) => d.path.join('::'))).toEqual(['Биология::Клетка', 'Физика']);
      expect(r.report.notes).toBe(6);
      expect(r.report.cards).toBe(6);
      expect(r.report.sounds).toBe(1);
      expect(r.report.images).toBe(1);
      const bio = r.decks[0].cards;
      const phys = r.decks[1].cards;
      expect(bio.map((c) => c.type)).toEqual(['basic', 'reverse', 'cloze']);
      expect(phys.map((c) => c.type)).toEqual(['typing', 'basic', 'basic']);
      expect(bio[0].front).toBe('Что такое **митоз**?');
      expect(bio[0].back).toMatch(/!\[\]\(data:image\/png;base64,/);
      expect(phys[0].back).toBe('ампер');
      expect(phys[1].back).toBe('$I = \\frac{U}{R}$');
      expect(phys[2].back).toBe('$$P = UI$$');
    });
    it('пропуски c1 объединяются, прогресс переносится', () => {
      const r = load(file);
      const cloze = r.decks[0].cards[2];
      const card = asCard(cloze);
      expect(itemOrds(card)).toEqual([0, 1, 2]);
      const p0 = buildPrompt(card, 0);
      expect(p0.question.match(/\*\*\[/g)?.length).toBe(2); // оба c1 скрыты вместе
      expect(buildPrompt(card, 2).question).toContain('**[фаза?]**');
      expect(Object.keys(cloze.states)).toEqual(['0']); // в Anki отвечали только на c1
      expect(r.report.withProgress).toBe(6);
      const rev = r.decks[0].cards[1];
      expect(Object.keys(rev.states)).toEqual(['0']);
      expect(rev.logs.length).toBe(1);
      expect(rev.logs[0].rating).toBe(3);
    });
    it('без прогресса — всё новое', () => {
      const r = load(file, false);
      expect(r.decks.flatMap((d) => d.cards).every((c) => Object.keys(c.states).length === 0 && c.logs.length === 0)).toBe(true);
    });
  });
}

describe('Текстовый экспорт', () => {
  it('разбирает заголовки, кавычки и колоды', () => {
    const r = load('notes.txt');
    expect(r.decks.map((d) => d.path.join('::'))).toEqual(['Биология::Клетка', 'Физика']);
    expect(r.decks[0].cards.map((c) => c.type)).toEqual(['basic', 'reverse', 'cloze']);
    expect(r.decks[1].cards.map((c) => c.type)).toEqual(['typing', 'basic', 'basic']);
    expect(r.decks[0].cards[0].back).toContain('Деление клетки,\nпри котором');
    expect(r.report.missingMedia).toBe(1);
  });
});

describe('Состояние темы для карты', () => {
  it('новая тема — не слабое место', async () => {
    const { topicStatus } = await import('./srs');
    expect(topicStatus({ total: 5, learned: 0, started: 0, struggling: 0 })).toBe('new');
    expect(topicStatus({ total: 5, learned: 0, started: 3, struggling: 1 })).toBe('weak');
    expect(topicStatus({ total: 5, learned: 4, started: 5, struggling: 0 })).toBe('learned');
    expect(topicStatus({ total: 5, learned: 1, started: 2, struggling: 0 })).toBe('progress');
    expect(topicStatus({ total: 0, learned: 0, started: 0, struggling: 0 })).toBe('empty');
  });
});
