// Стихи «под себя»: какие строки учить, что уже знаю, повторять чаще, свои подсказки, старт с любого места, срок.
import { describe, expect, it } from 'vitest';
import { activeLines, daysLeft, deadlinePlan, effCue, enabledSteps, knownSet, learnTargets, learnUnits, learnedCount, nextReview, pickStarts, poemLearned, remapPatch, setCue, setFocus, setKnown, setSkip, togetherWindow, togglePin } from './poem';
import type { Poem } from './types';

const TEXT = `Один
Два
Три
Четыре

Пять
Шесть
Семь
Восемь`;
const base: Poem = { id: 'p', title: '', text: TEXT, chunk: 0, learned: 0, createdAt: '', updatedAt: '' };
const apply = (p: Poem, patch: Partial<Poem>): Poem => ({ ...p, ...patch });

describe('Стих: выученные строки', () => {
  it('старый счётчик частей читается как выученные строки', () => {
    expect([...knownSet({ ...base, learned: 1 })]).toEqual([0, 1, 2, 3]);
    expect(poemLearned({ ...base, learned: 2 })).toBe(true);
    expect(poemLearned({ ...base, learned: 1 })).toBe(false);
  });
  it('«уже знаю» выбранные строки — не учим их, остальное по порядку', () => {
    const p = apply(base, setKnown(base, [0, 1, 2, 3], true));
    expect(learnTargets(p)).toEqual([4, 5, 6, 7]);
    expect(p.learned).toBe(1);
    expect(learnUnits(p, learnTargets(p))).toEqual([[4, 5, 6, 7]]);
  });
  it('учить можно с любой строки: от неё и до конца', () => {
    expect(learnTargets(base, 2)).toEqual([2, 3, 4, 5, 6, 7]);
    // выбранные строки из разных частей — каждая часть отдельно
    expect(learnUnits(base, [1, 2, 5])).toEqual([[1, 2], [5]]);
  });
  it('«не учу»: строки обходятся, стих считается выученным без них, повтор назначается', () => {
    let p = apply(base, setKnown(base, [0, 1, 2, 3, 4, 5, 6], true));
    expect(poemLearned(p)).toBe(false);
    p = apply(p, setSkip(p, [7], true));
    expect(activeLines(p)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(poemLearned(p)).toBe(true);
    expect(p.review).toBeDefined();
    // вернули строку — стих снова недоучен, повтор не нужен
    p = apply(p, setSkip(p, [7], false));
    expect(poemLearned(p)).toBe(false);
    expect(p.review).toBeUndefined();
  });
  it('снять «знаю» с части — она снова в списке; счётчик частей идёт по подряд выученным', () => {
    let p = apply(base, setKnown(base, [0, 1, 2, 3, 4, 5, 6, 7], true));
    expect(learnedCount(p)).toBe(2);
    p = apply(p, setKnown(p, [1], false));
    expect(learnTargets(p)).toEqual([1]);
    expect(learnedCount(p)).toBe(0);
  });
});

describe('Стих: свои подсказки и отметки', () => {
  it('своя подсказка строки не бывает скрытее общей', () => {
    const p = apply(base, setCue(base, [1], 0));
    expect(effCue(p, 1, 3)).toBe(0); // открыта
    expect(effCue(p, 0, 3)).toBe(3); // как обычно
    const q = apply(base, setCue(base, [2], 1));
    expect(effCue(q, 2, 3)).toBe(1);
    expect(effCue(q, 2, 2)).toBe(1); // «первые буквы» не отменяют половину слов
    expect(effCue(apply(base, setCue(base, [2], 2)), 2, 1)).toBe(1);
    expect(apply(q, setCue(q, [2], null)).lineCue).toBeUndefined();
  });
  it('слова-подсказки включаются и выключаются', () => {
    const p = apply(base, togglePin(base, 0, 0));
    expect(p.pinWords).toEqual(['0:0']);
    expect(apply(p, togglePin(p, 0, 0)).pinWords).toBeUndefined();
  });
  it('«повторять чаще» повышает шанс строки в «С любого места»', () => {
    const p = apply(base, setFocus(base, [5], true));
    let hits = 0;
    for (let s = 0; s < 200; s++) {
      let x = s * 7919 + 13;
      const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      if (pickStarts(p, 1, rnd).includes(5)) hits++;
    }
    expect(hits).toBeGreaterThan(70); // без отметки было бы ≈ 29 из 200 (1 из 7)
  });
  it('«С любого места» выбирает только из заданных строк и возвращает их номера', () => {
    const pool = [2, 3, 6, 7];
    for (let s = 0; s < 50; s++) {
      const st = pickStarts(base, 4, Math.random, pool);
      expect(st.every((i) => pool.slice(0, -1).includes(i))).toBe(true);
      expect(new Set(st).size).toBe(st.length);
    }
  });
});

describe('Стих: правка текста не стирает личное', () => {
  const known = apply(base, setKnown(base, [0, 1, 2, 3], true));
  const p0 = apply(known, { ...setSkip(known, [7], true), lineCue: { '5': 0 }, pinWords: ['6:0'], focusLines: [4], lineMiss: [0, 0, 0, 0, 3, 0, 0, 0] });
  it('исправил слово в одной строке — остальное на месте', () => {
    const edited = TEXT.replace('Семь', 'Семеро');
    const patch = remapPatch(p0, edited);
    expect(patch.knownLines).toEqual([0, 1, 2, 3]);
    expect(patch.skipLines).toEqual([7]);
    expect(patch.lineCue).toEqual({ '5': 0 });
    expect(patch.focusLines).toEqual([4]);
    expect(patch.pinWords).toBeUndefined(); // правленая строка — слова-подсказки сброшены
    expect(patch.lineMiss![4]).toBe(3);
  });
  it('добавил строку в начало — номера сдвинулись вместе со строками', () => {
    const patch = remapPatch(p0, 'Ноль\n' + TEXT);
    expect(patch.knownLines).toEqual([1, 2, 3, 4]);
    expect(patch.skipLines).toEqual([8]);
    expect(patch.lineCue).toEqual({ '6': 0 });
    expect(patch.pinWords).toEqual(['7:0']);
  });
  it('знаки, регистр и «ё» не считаются правкой', () => {
    const patch = remapPatch(apply(base, setKnown(base, [0], true)), TEXT.replace('Один', 'один!'));
    expect(patch.knownLines).toEqual([0]);
  });
  it('если стих перестал быть выученным — повтор сбрасывается', () => {
    const full = apply(base, setKnown(base, [0, 1, 2, 3, 4, 5, 6, 7], true));
    expect(full.review).toBeDefined();
    const patch = remapPatch(full, TEXT + '\nДевять');
    expect(patch.review).toBeUndefined();
  });
  it('смена размера частей не трогает выученное (всё по строкам)', () => {
    const p = apply(base, setKnown(base, [0, 1, 2, 3], true));
    const rechunked = { ...p, chunk: 2 };
    expect([...knownSet(rechunked)]).toEqual([0, 1, 2, 3]);
    expect(learnedCount(rechunked)).toBe(2);
  });
});

describe('Стих: шаги и срок', () => {
  it('шаги по умолчанию — все; «по памяти» есть всегда', () => {
    expect([...enabledSteps(base)].sort()).toEqual(['half', 'letters', 'read', 'recall', 'together']);
    expect([...enabledSteps({ ...base, steps: ['letters'] })].sort()).toEqual(['letters', 'recall']);
    expect(togetherWindow(base)).toBe(4);
    expect(togetherWindow({ ...base, window: 99 })).toBe(8);
  });
  it('срок: сколько дней и по сколько строк в день', () => {
    const now = new Date('2026-10-01T12:00:00');
    const p = { ...base, deadline: '2026-10-05' };
    expect(daysLeft(p, now)).toBe(4);
    expect(deadlinePlan(p, now)).toEqual({ days: 4, left: 8, perDay: 2 });
    expect(daysLeft({ ...p, deadline: '2026-09-30' }, now)).toBe(-1);
    expect(deadlinePlan(base, now)).toBeNull();
  });
  it('повтор не позже дня перед сроком', () => {
    const now = new Date('2026-10-01T12:00:00');
    const learned = { ...base, learned: 2, review: { due: '2026-10-01', interval: 17, reps: 4 }, deadline: '2026-10-06' };
    expect(nextReview(learned, 1, now).interval).toBe(4);
    expect(nextReview({ ...learned, deadline: undefined }, 1, now).interval).toBeGreaterThan(30);
  });
});
