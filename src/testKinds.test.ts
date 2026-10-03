import { describe, expect, it } from 'vitest';
import { buildTest, isDate, matchQuestion, noteSequences, orderQuestion } from './testgen';
import type { AppData, Card } from './types';

const at = '2026-01-01T00:00:00.000Z';
const card = (id: string, front: string, back: string, type: Card['type'] = 'basic', topicId = 't1'): Card => ({ id, topicId, type, front, back, createdAt: at, updatedAt: at });
// Предсказуемая «случайность».
const seq = (seed = 1) => {
  let x = seed;
  return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
};
const data = (cards: Card[], note = ''): AppData =>
  ({ subjects: [{ id: 's1', name: 'История', color: '#000', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Россия XIX века', note, createdAt: at, updatedAt: at }], cards, states: {}, logs: [], tests: [], settings: {} }) as unknown as AppData;

describe('«Соедини пары»', () => {
  it('4 пары из коротких карточек, правый столбец перемешан, но те же ответы', () => {
    const cards = [card('a', 'Ядро', 'Хранит ДНК'), card('b', 'Рибосома', 'Собирает белок'), card('c', 'Митохондрия', 'Даёт энергию'), card('d', 'Хлоропласт', 'Фотосинтез'), card('e', 'Вакуоль', 'Запас воды')];
    const q = matchQuestion(cards, seq())!;
    expect(q.kind).toBe('match');
    expect(q.pairs).toHaveLength(4);
    expect([...q.rights!].sort()).toEqual(q.pairs!.map((p) => p.right).sort());
    expect(q.rights!.every((r, i) => r === q.pairs![i].right)).toBe(false);
    expect(q.cardIds).toHaveLength(4);
  });

  it('длинные, многострочные, с пропусками и одинаковые ответы не берутся; меньше 4 — задания нет', () => {
    const cards = [card('a', 'Ядро', 'Хранит ДНК'), card('b', 'Ядро клетки', 'хранит днк'), card('c', 'Длинный', 'x'.repeat(120)), card('d', '{{c1::Ядро}} хранит ДНК', '', 'cloze'), card('e', 'Две\nстроки', 'да')];
    expect(matchQuestion(cards, seq())).toBeNull();
  });
});

describe('«Расставь по порядку»', () => {
  it('что считается датой', () => {
    for (const d of ['1861', '1853–1856 гг.', '19 февраля 1861 г.', 'XIX век', '988 год']) expect(isDate(d)).toBe(true);
    for (const d of ['300 000 км/с', 'Отмена крепостного права', '46 хромосом', '2+2']) expect(isDate(d)).toBe(false);
  });

  it('события с датами — по времени, без повторов года', () => {
    const cards = [card('a', '1861', 'Отмена крепостного права', 'reverse'), card('b', 'Отечественная война', '1812'), card('c', '1825', 'Восстание декабристов', 'reverse'), card('d', '1853–1856 гг.', 'Крымская война'), card('e', 'Скорость света', '300 000 км/с')];
    const q = orderQuestion(data(cards), ['t1'], cards, seq())!;
    expect(q.kind).toBe('order');
    expect(q.steps).toEqual(['Отечественная война', 'Восстание декабристов', 'Крымская война', 'Отмена крепостного права']);
    expect(q.shuffled).not.toEqual(q.steps);
    expect([...q.shuffled!].sort()).toEqual([...q.steps!].sort());
    expect(q.answer).toContain('1. 1812 — Отечественная война');
  });

  it('шаги из конспекта: нумерованный список и цепочка со стрелками', () => {
    const note = 'Этапы митоза:\n1. **Профаза** — хромосомы спирализуются\n2. Метафаза\n3. Анафаза\n4. Телофаза\n\nПищевая цепь: трава → заяц → лиса\nПросто текст с 1861 годом.';
    const s = noteSequences(note);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ title: 'Этапы митоза', steps: ['**Профаза** — хромосомы спирализуются', 'Метафаза', 'Анафаза', 'Телофаза'] });
    expect(s[1]).toEqual({ title: 'Пищевая цепь', steps: ['трава', 'заяц', 'лиса'] });
  });

  it('список не с 1, с пропуском номера или из двух пунктов — не порядок', () => {
    expect(noteSequences('2. a\n3. b\n4. c')).toEqual([]);
    expect(noteSequences('1. a\n2. b')).toEqual([]);
    expect(noteSequences('1. a\n3. b\n4. c')).toEqual([]);
  });

  it('нет ни дат, ни шагов — задания нет', () => {
    const cards = [card('a', 'Ядро', 'Хранит ДНК')];
    expect(orderQuestion(data(cards, 'Просто конспект.'), ['t1'], cards, seq())).toBeNull();
  });
});

describe('buildTest с новыми заданиями', () => {
  const cards = [
    card('a', '1861', 'Отмена крепостного права', 'reverse'),
    card('b', '1812', 'Отечественная война', 'reverse'),
    card('c', '1825', 'Восстание декабристов', 'reverse'),
    card('d', '1853–1856 гг.', 'Крымская война', 'reverse'),
    card('e', 'Кто отменил крепостное право?', 'Александр II'),
    card('f', 'Кто правил в 1812 году?', 'Александр I')
  ];
  it('число вопросов то же, одно «пары» и одно «по порядку», не первыми', () => {
    const q = buildTest(data(cards), 't1', 8, seq(), undefined, { extras: true });
    expect(q).toHaveLength(8);
    expect(q.filter((x) => x.kind === 'match')).toHaveLength(1);
    expect(q.filter((x) => x.kind === 'order')).toHaveLength(1);
    expect(['match', 'order']).not.toContain(q[0].kind);
  });

  it('без extras и в коротком тесте — только обычные вопросы', () => {
    expect(buildTest(data(cards), 't1', 8, seq()).some((x) => x.kind === 'match' || x.kind === 'order')).toBe(false);
    expect(buildTest(data(cards), 't1', 4, seq(), undefined, { extras: true }).some((x) => x.kind === 'match' || x.kind === 'order')).toBe(false);
  });
});
