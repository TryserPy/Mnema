import { describe, expect, it } from 'vitest';
import { clampPage, pageIndexFor, parsePageInput, plainNumbers } from './pageNumber';

describe('parsePageInput — номер страницы, введённый руками', () => {
  it.each([
    ['7', 1, 12, 7],
    [' 5 ', 1, 12, 5],
    ['12', 3, 12, 12],
    ['99', 3, 12, 12],
    ['0', 3, 12, 1],
    ['-3', 3, 12, 1],
    ['+4', 3, 12, 4],
    ['007', 3, 12, 7]
  ])('целое «%s» (сейчас %i из %i) → %i', (raw, cur, total, want) => {
    expect(parsePageInput(raw, cur, total)).toBe(want);
  });

  it.each(['', '   ', '2.5', '2,5', 'abc', '1e3', '٣', '５', '3 4', '--1', 'NaN', 'Infinity', '1234567890'])('некорректное «%s» → прежняя страница', (raw) => {
    expect(parsePageInput(raw, 3, 12)).toBe(3);
  });

  it('прежняя страница сама за границей — тоже ограничивается', () => {
    expect(parsePageInput('x', 40, 12)).toBe(12);
    expect(parsePageInput('x', 0, 12)).toBe(1);
  });

  it('странный total не даёт NaN', () => {
    expect(parsePageInput('5', 1, 0)).toBe(1);
    expect(parsePageInput('5', 1, NaN)).toBe(1);
    expect(parsePageInput('5', 1, -4)).toBe(1);
    expect(parsePageInput('2', 1, 3.9)).toBe(2);
    expect(parsePageInput('9', 1, Infinity)).toBe(1);
  });
});

describe('clampPage', () => {
  it('держит в 1..total', () => {
    expect(clampPage(5, 3)).toBe(3);
    expect(clampPage(-1, 3)).toBe(1);
    expect(clampPage(2.7, 3)).toBe(2);
    expect(clampPage(NaN, 3)).toBe(1);
    expect(clampPage(1, 0)).toBe(1);
  });
});


describe('pageIndexFor — страницы учебника со своими номерами', () => {
  const nums = [45, 46, 48, 52];
  it.each([
    ['46', 0, 1],
    ['48', 0, 2],
    ['47', 3, 1],
    ['50', 0, 2],
    ['1', 2, 0],
    ['999', 0, 3],
    ['-5', 2, 0]
  ])('«%s» (сейчас %i) → индекс %i', (raw, cur, want) => {
    expect(pageIndexFor(raw, cur, nums)).toBe(want);
  });
  it.each(['', 'abc', '4.5', '1e2'])('некорректное «%s» → прежний индекс', (raw) => {
    expect(pageIndexFor(raw, 2, nums)).toBe(2);
  });
  it('пустой список и странный индекс', () => {
    expect(pageIndexFor('3', 0, [])).toBe(0);
    expect(pageIndexFor('x', 99, nums)).toBe(3);
    expect(pageIndexFor('x', NaN, nums)).toBe(0);
  });
  it('plainNumbers', () => {
    expect(plainNumbers([1, 2, 3])).toBe(true);
    expect(plainNumbers([2, 3])).toBe(false);
    expect(plainNumbers([])).toBe(true);
  });
});
