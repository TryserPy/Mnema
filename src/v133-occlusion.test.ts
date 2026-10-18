// 1.33, №1: «Закрыть часть картинки» — каждая рамка своя карточка: вторая открывается в тот же день,
// ответ — только подпись спрашиваемой рамки, оценка пишется в её ключ; метка {?формула?} рисуется формулой.
import { describe, expect, it, vi } from 'vitest';

// В тестах без браузера DOMPurify — заглушка (как в v131-callouts.test.ts).
vi.mock('dompurify', () => ({ default: { isSupported: false, sanitize: (h: string) => h, addHook() {} } }));
import { occlFront, type Occlusion } from './occlusion';
import { buildPrompt, buildQueue, gradeItem, itemKey } from './srs';
import { buildRepeatQueue } from './repeat';
import { emptyData } from './store';
import { renderMarkdown } from './components/Markdown';
import type { AppData, Card } from './types';
import { Rating } from 'ts-fsrs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const OCC: Occlusion = { all: true, masks: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.2, label: 'ааа' }, { x: 0.1, y: 0.5, w: 0.3, h: 0.2, label: 'ббб' }] };
const at = '2026-10-18T08:00:00.000Z';
const card: Card = { id: 'oc', topicId: 't1', type: 'occlusion', front: occlFront(PNG), back: 'ааааа', occl: OCC, createdAt: at, updatedAt: at };

function data(): AppData {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'Алгебра', color: '#333', createdAt: at } as AppData['subjects'][number]];
  d.topics = [{ id: 't1', subjectId: 's1', name: 'Дроби', note: '', createdAt: at, updatedAt: at } as AppData['topics'][number]];
  d.cards = [card];
  return d;
}

describe('карточка «Закрыть часть картинки»', () => {
  const now = new Date('2026-10-18T12:00:00.000Z');

  it('новая карточка: обе рамки в очереди сегодня, и после ответа на первую вторая остаётся', () => {
    const d = data();
    expect(buildQueue(d, now).map((x) => x.ord)).toEqual([0, 1]);
    const k0 = itemKey('oc', 0);
    d.states[k0] = gradeItem(undefined, now, Rating.Good, d.settings);
    d.logs.push({ key: k0, cardId: 'oc', topicId: 't1', rating: 3, prevState: 0, at: now.toISOString(), ms: 1000 });
    const q = buildQueue(d, new Date(now.getTime() + 60000));
    expect(q.some((x) => x.key === itemKey('oc', 1))).toBe(true);
    // Оценка записана только первой рамке.
    expect(d.states[itemKey('oc', 1)]).toBeUndefined();
  });

  it('ответ — только подпись своей рамки; общее пояснение — отдельно', () => {
    expect(buildPrompt(card, 0)).toMatchObject({ answer: 'ааа', note: 'ааааа', occlusion: 0 });
    expect(buildPrompt(card, 1)).toMatchObject({ answer: 'ббб', occlusion: 1 });
  });

  it('«повторённые сегодня» — обе рамки, когда обе отвечены', () => {
    const d = data();
    for (const o of [0, 1]) {
      const k = itemKey('oc', o);
      d.states[k] = gradeItem(undefined, now, Rating.Good, d.settings);
      d.logs.push({ key: k, cardId: 'oc', topicId: 't1', rating: 3, prevState: 0, at: now.toISOString(), ms: 1000 });
    }
    expect(buildRepeatQueue(d, now, {}, 'today').map((x) => x.ord).sort()).toEqual([0, 1]);
  });
});

describe('метка неуверенности вокруг формулы', () => {
  it('{?=\\frac{…}{4}?} — формула с подсветкой, без сырой разметки', () => {
    const html = renderMarkdown('д) $\\frac{a+b}{4}$ {?=\\frac{a+b-4a+4b}{4}?}');
    expect(html).not.toContain('{?');
    expect(html).toContain('data-unsure');
    expect(html).toContain('katex');
  });
  it('обычное {?слово?} — как раньше', () => {
    expect(renderMarkdown('это {?слово?} тут')).toContain('<span data-unsure="" title="Неуверенно прочитано">слово</span>');
  });
});
