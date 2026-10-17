// 1.32, N5: «Закрыть часть картинки» — данные, вопросы, файл .mnema и обмен с Anki Image Occlusion.
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { parseAnki } from './anki';
import { buildApkg } from './ankiExport';
import { cleanOcclusion, fromAnkiOcclusion, occlAnswer, occlFront, occlGroups, occlImage, occlTarget, toAnkiOcclusion, type Occlusion } from './occlusion';
import { buildPrompt, itemOrds } from './srs';
import { emptyData, normalizeData } from './store';
import type { AppData, Card } from './types';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const OCC: Occlusion = {
  all: true,
  masks: [
    { x: 0.1, y: 0.1, w: 0.2, h: 0.1, label: 'ядро' },
    { x: 0.5, y: 0.5, w: 0.2, h: 0.1, label: 'митохондрия', g: 7 },
    { x: 0.5, y: 0.7, w: 0.2, h: 0.1, label: 'митохондрия', g: 7 }
  ]
};
const at = '2026-10-01T00:00:00Z';
const card: Card = { id: 'k1', topicId: 't1', type: 'occlusion', front: occlFront(PNG), back: 'Строение клетки', occl: OCC, createdAt: at, updatedAt: at };

describe('рамки', () => {
  it('группы: рамки с одной группой спрашиваются вместе; ответ — подписи', () => {
    expect(occlGroups(OCC)).toEqual([1000, 7]);
    expect([...occlTarget(OCC, 1)]).toEqual([1, 2]);
    expect(occlAnswer(OCC, 1)).toBe('митохондрия, митохондрия');
    expect(itemOrds(card)).toEqual([0, 1]);
    expect(buildPrompt(card, 0)).toMatchObject({ question: 'Что под рамкой?', answer: 'ядро\n\nСтроение клетки', occlusion: 0 });
  });
  it('из чужих данных — только числа 0…1, не больше 80 рамок, без пустых', () => {
    expect(cleanOcclusion({ masks: [{ x: -1, y: 0.5, w: 2, h: 0.3, label: 'a'.repeat(500) }, { x: 'x' }, { x: 0.1, y: 0.1, w: 0, h: 0.1 }], all: false })).toEqual({ masks: [{ x: 0, y: 0.5, w: 1, h: 0.3, label: 'a'.repeat(200) }], all: false });
    expect(cleanOcclusion({ masks: Array.from({ length: 200 }, () => ({ x: 0, y: 0, w: 0.1, h: 0.1 })) })!.masks).toHaveLength(80);
    expect(cleanOcclusion({ masks: [] })).toBeUndefined();
    expect(occlImage('![](javascript:alert(1))')).toBeNull();
    expect(occlImage(card.front)).toBe(PNG);
  });
  it('загрузка данных: рамки проверяются, без рамок карточка не спрашивается', () => {
    const d = normalizeData({ ...emptyData(), cards: [{ ...card, occl: { masks: [{ x: 5, y: 5, w: 5, h: 5 }] } }] } as unknown as AppData);
    expect(d.cards[0].occl).toBeUndefined();
    expect(itemOrds(d.cards[0])).toEqual([]);
  });
});

describe('файл .mnema', () => {
  it('рамки уходят в файл и возвращаются', async () => {
    const { buildPack, readPack } = await import('./mnemaPack');
    const d = emptyData();
    d.subjects = [{ id: 's1', name: 'Биология', color: '#000', createdAt: at }];
    d.topics = [
      { id: 't1', subjectId: 's1', name: 'Клетка', note: '', createdAt: at, updatedAt: at },
      { id: 't2', subjectId: 's1', name: 'Ткани', note: 'x', createdAt: at, updatedAt: at }
    ];
    d.cards = [card];
    const p = await buildPack(d, { kind: 'all' });
    const r = await readPack(p.text);
    expect(r.ok && r.items[0].cards[0]).toMatchObject({ type: 'occlusion', occl: OCC });
  });
});

describe('Anki Image Occlusion', () => {
  it('поле Occlusion туда и обратно; «спрятать все» — oi=1', () => {
    const f = toAnkiOcclusion(OCC);
    expect(f).toBe('{{c1::image-occlusion:rect:left=.1:top=.1:width=.2:height=.1:oi=1}}<br>{{c2::image-occlusion:rect:left=.5:top=.5:width=.2:height=.1:oi=1}}<br>{{c2::image-occlusion:rect:left=.5:top=.7:width=.2:height=.1:oi=1}}');
    const back = fromAnkiOcclusion(f)!;
    expect(back.all).toBe(true);
    expect(back.masks.map((m) => m.g)).toEqual([0, 1, 1]);
    expect(occlGroups(back)).toHaveLength(2);
  });
  it('эллипс и многоугольник — описанный прямоугольник; пиксели старых заметок — пропуск', () => {
    const o = fromAnkiOcclusion('{{c1::image-occlusion:ellipse:left=.2:top=.3:rx=.1:ry=.05}}{{c2::image-occlusion:polygon:points=.1,.1 .3,.2 .2,.4}}{{c3::image-occlusion:rect:left=120:top=40:width=50:height=20}}')!;
    expect(o.all).toBe(false);
    expect(o.masks).toHaveLength(2);
    expect(o.masks[0]).toMatchObject({ x: 0.2, y: 0.3, w: 0.2, h: 0.1 });
    expect(o.masks[1].x).toBeCloseTo(0.1);
    expect(o.masks[1].h).toBeCloseTo(0.3);
  });
  it('экспорт в .apkg — родная заметка Image Occlusion, импорт обратно — та же карточка с картинкой', async () => {
    const SQL = await initSqlJs();
    const d = emptyData();
    d.subjects = [{ id: 's1', name: 'Биология', color: '#000', createdAt: at }];
    d.topics = [{ id: 't1', subjectId: 's1', name: 'Клетка', note: '', createdAt: at, updatedAt: at }];
    d.cards = [card];
    const r = await buildApkg(d, SQL, { progress: false });
    expect(r.cards).toBe(2);
    const back = parseAnki('refrain.apkg', r.bytes, SQL, { progress: false, settings: { retention: 0.9 } });
    const c = back.decks[0].cards[0];
    expect(c.type).toBe('occlusion');
    expect(occlImage(c.front)).toBe(PNG);
    expect(c.occl!.masks.map(({ x, y, w, h }) => [x, y, w, h])).toEqual(OCC.masks.map(({ x, y, w, h }) => [x, y, w, h]));
    expect(c.back).toContain('Строение клетки');
  });
});
