import { describe, expect, it } from 'vitest';
import { defaultPicks, draftQuality, groupOf, type SetGroup } from './noteSet';

describe('Набор из конспекта', () => {
  it('группы по виду найденного', () => {
    expect(groupOf('definition')).toBe('defs');
    expect(groupOf('date')).toBe('dates');
    expect(groupOf('bold')).toBe('terms');
    expect(groupOf('term')).toBe('terms');
    expect(groupOf('mine')).toBe('terms');
    expect(groupOf('box')).toBe('boxes');
    expect(groupOf('name')).toBe('names');
    expect(groupOf('formula')).toBe('formulas');
  });

  it('качество: короткий ответ и один факт — хорошо', () => {
    expect(draftQuality({ type: 'basic', front: 'Что такое клетка?', back: 'Единица живого.' }).ok).toBe(true);
    expect(draftQuality({ type: 'cloze', front: 'ДНК хранится в {{ядре}}.', back: '' }).ok).toBe(true);
  });

  it('качество: длинно, несколько фактов, пусто — плохо и с причиной', () => {
    expect(draftQuality({ type: 'basic', front: 'Q', back: 'x'.repeat(200) }).why).toMatch(/Длинный/);
    expect(draftQuality({ type: 'basic', front: 'Q', back: 'Ядро хранит ДНК. Рибосомы собирают белок.' }).why).toMatch(/несколько фактов/);
    expect(draftQuality({ type: 'basic', front: '', back: 'a' }).ok).toBe(false);
    expect(draftQuality({ type: 'cloze', front: 'без пропуска', back: '' }).ok).toBe(false);
  });

  it('сокращения не считаются отдельными фактами', () => {
    expect(draftQuality({ type: 'basic', front: 'Когда?', back: 'В 1861 г. при Александре II' }).ok).toBe(true);
  });

  it('порция: не больше лимита, сначала определения и даты, имена и формулы сами не отмечаются', () => {
    const d = (group: SetGroup, back = 'Коротко.') => ({ type: 'basic' as const, front: 'Q', back, group });
    const drafts = [d('terms'), d('names'), d('formulas'), d('defs'), d('dates'), d('defs', 'x'.repeat(200)), d('terms'), d('boxes')];
    expect([...defaultPicks(drafts)].sort()).toEqual([0, 3, 4, 6, 7]);
    expect([...defaultPicks(drafts, 2)].sort()).toEqual([3, 4]);
  });

  it('порция по очереди из групп: много определений не вытесняют даты', () => {
    const d = (group: SetGroup) => ({ type: 'basic' as const, front: 'Q', back: 'Коротко.', group });
    const drafts = [...Array.from({ length: 10 }, () => d('defs')), d('dates'), d('dates'), d('terms')];
    const picks = defaultPicks(drafts, 6);
    expect(picks.has(10) && picks.has(11) && picks.has(12)).toBe(true);
    expect(picks.size).toBe(6);
  });
});
