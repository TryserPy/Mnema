import { describe, expect, it } from 'vitest';
import { checkNumber, evaluate, formatNumber, instantiate, problemErrors, problemVars } from './problems';
import { cardDraft, findImportant, findInText, sentences, yearOf, DEFAULT_HIGHLIGHT } from './important';

describe('Задачи с числами', () => {
  it('разбирает переменные и считает', () => {
    expect(problemVars('U={U=10..220} В, m={m=0,5..5:0,5}')).toEqual([
      { name: 'U', min: 10, max: 220, step: 1 },
      { name: 'm', min: 0.5, max: 5, step: 0.5 }
    ]);
    expect(evaluate('U/R', { U: 12, R: 4 })).toBe(3);
    expect(evaluate('2U^2 + sqrt(16)', { U: 3 })).toBe(22);
    expect(evaluate('m*g', { m: 2 })).toBeCloseTo(19.6);
    expect(evaluate('sin(30)', {})).toBeCloseTo(0.5);
    expect(formatNumber(3.14159)).toBe('3,14');
    expect(formatNumber(0.012345)).toBe('0,012');
  });
  it('каждый раз новые числа, ответ совпадает с формулой', () => {
    const f = 'Напряжение {U=10..220} В, сопротивление {R=2..50} Ом. Найди ток.';
    const b = 'I = U/R = {=U/R} А';
    const a = instantiate(f, b, 1);
    const c = instantiate(f, b, 999);
    expect(a.question).not.toContain('{');
    expect(a.question).not.toBe(c.question);
    const [U, R] = [...a.question.matchAll(/(\d+(?:,\d+)?)/g)].map((m) => Number(m[1].replace(',', '.')));
    expect(a.expected[0]).toBeCloseTo(U / R);
    expect(checkNumber(String(a.expected[0]).replace('.', ','), a.expected)).toBe(true);
    expect(checkNumber('100500', a.expected)).toBe(false);
    expect(problemErrors(f, 'нет формулы').length).toBeGreaterThan(0);
    expect(problemErrors(f, '{=U/X}')[0]).toMatch(/X/);
    expect(problemErrors(f, b)).toEqual([]);
  });
});

describe('Автовыделение', () => {
  const note = `## § 7. Отмена крепостного права

[стр. 47]

Поражение в **Крымской войне** (1853–1856) показало, что прежние порядки мешают развитию страны.

**19 февраля 1861 г.** император **Александр II** подписал **Манифест** об отмене крепостного права.

**Временнообязанными** называли крестьян, которые до заключения выкупной сделки несли повинности.

*Выкупная операция* — это покупка крестьянами земли у помещиков при помощи государства.

> **Запомните:** реформа 1861 г. освободила около 23 млн крестьян.

Сила тока $I = \\frac{U}{R}$, в сети 220 В. Реформы М. М. Сперанского в XIX веке.`;
  const items = findImportant(note, DEFAULT_HIGHLIGHT);
  const of = (t: string) => items.filter((i) => i.type === t).map((i) => i.text);
  it('находит все виды', () => {
    expect(of('bold')).toEqual(expect.arrayContaining(['Крымской войне', '19 февраля 1861 г.', 'Александр II', 'Манифест', 'Временнообязанными']));
    expect(of('date')).toEqual(expect.arrayContaining(['1853–1856', '19 февраля 1861 г.', 'XIX веке']));
    expect(of('name')).toEqual(expect.arrayContaining(['Александр II', 'М. М. Сперанского']));
    expect(of('definition')).toEqual(expect.arrayContaining(['Выкупная операция', 'Временнообязанными']));
    expect(of('formula')).toEqual(expect.arrayContaining(['220 В']));
    expect(of('box')[0]).toMatch(/^реформа 1861/);
    expect(items.every((i) => i.page === 47)).toBe(true);
  });
  it('предложения не режутся на «г.» и инициалах', () => {
    expect(sentences('В 1861 г. отменили право. Реформы М. М. Сперанского шли долго.').map((s) => s.text)).toEqual(['В 1861 г. отменили право.', 'Реформы М. М. Сперанского шли долго.']);
  });
  it('строгий режим не ловит голые годы', () => {
    const t = 'В 1861 отменили крепостное право.';
    expect(findInText(t, DEFAULT_HIGHLIGHT).some((r) => r.type === 'date')).toBe(true);
    expect(findInText(t, { ...DEFAULT_HIGHLIGHT, strict: 'strict' }).some((r) => r.type === 'date')).toBe(false);
  });
  it('черновики карточек', () => {
    const def = items.find((i) => i.type === 'definition' && i.text === 'Выкупная операция')!;
    expect(cardDraft(def)).toEqual({ type: 'basic', front: 'Что такое «выкупная операция»?', back: 'Покупка крестьянами земли у помещиков при помощи государства.' });
    const date = items.find((i) => i.type === 'date' && i.text === '19 февраля 1861 г.')!;
    expect(cardDraft(date).type).toBe('cloze');
    expect(cardDraft(date).front).toContain('{{19 февраля 1861 г.}}');
  });
  it('год для ленты времени', () => {
    expect(yearOf('19 февраля 1861 г.')).toBe(1861);
    expect(yearOf('XIX веке')).toBe(1850);
    expect(yearOf('1853–1856')).toBe(1853);
  });
});

describe('Метки страниц', () => {
  it('понимает экранированные скобки после редактора', () => {
    const items = findImportant('\\[стр. 48\\]\n\n**Манифест** подписан в 1861 г.', DEFAULT_HIGHLIGHT);
    expect(items.every((i) => i.page === 48)).toBe(true);
  });
  it('«называли» → вопрос «Кого или что называли»', () => {
    const it = findImportant('**Временнообязанными** называли крестьян, которые несли повинности.', DEFAULT_HIGHLIGHT).find((i) => i.type === 'definition')!;
    expect(cardDraft(it).front).toBe('Кого или что называли «временнообязанными»?');
  });
});
