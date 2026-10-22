import { describe, expect, it } from 'vitest';
import { GLOSSARY } from './glossary';
import { helpMatch, nodeText, norm } from './helpSearch';

describe('поиск по справке', () => {
  it('norm: регистр, ё, пробелы', () => expect(norm('  Ёлка   ПОВТОР ')).toBe('елка повтор'));
  it('пустой запрос — всё подходит', () => expect(helpMatch('  ', 'что угодно')).toBe(true));
  it('часть слова и несколько слов', () => {
    expect(helpMatch('контрол', 'Новая контрольная')).toBe(true);
    expect(helpMatch('повторить раз', 'Повторить ещё раз')).toBe(true);
    expect(helpMatch('повторить завтра', 'Повторить ещё раз')).toBe(false);
  });
  it('ё и е одинаковы', () => expect(helpMatch('еще', 'Повторить ещё раз')).toBe(true));
  it('ищет по всем переданным текстам', () => expect(helpMatch('apkg', 'Экспорт в Anki', 'Файл .apkg')).toBe(true));
  it('nodeText вытаскивает текст из разметки', () => {
    expect(nodeText(<>Нажми <b>«Учиться»</b> — и {3} карточки</>)).toBe('Нажми  «Учиться»  — и  3  карточки');
    expect(nodeText(null)).toBe('');
    expect(nodeText(false)).toBe('');
    expect(nodeText(['а', <i key="x">б</i>])).toBe('а б');
  });
});

describe('словарь', () => {
  it('каждый термин объяснён одной-двумя фразами, без повторов', () => {
    const terms = GLOSSARY.map((g) => g.term);
    expect(new Set(terms).size).toBe(terms.length);
    for (const g of GLOSSARY) {
      expect(g.means.length).toBeGreaterThan(15);
      expect(g.means.length).toBeLessThan(160);
    }
  });
  it('есть главные понятия из меню и экранов', () => {
    for (const t of ['Предмет', 'Тема', 'Карточка', 'Термин', 'Правило', 'Конспект', 'Повторить ещё раз', 'Что учить', 'Контрольная', 'Выгрузить для нейросети']) expect(GLOSSARY.some((g) => g.term === t)).toBe(true);
  });
  it('находится по синонимам', () => {
    const hit = GLOSSARY.filter((g) => helpMatch('параграф', g.term, g.means, g.also ?? ''));
    expect(hit.map((g) => g.term)).toContain('Тема');
  });
});
