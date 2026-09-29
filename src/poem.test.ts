import { describe, expect, it } from 'vitest';
import { autoChunk, compareRecital, cueLine, nextReview, pickStarts, poemLines, poemParts } from './poem';
import type { Poem } from './types';

const TEXT = `Мороз и солнце; день чудесный!
Ещё ты дремлешь, друг прелестный —
Пора, красавица, проснись:
Открой сомкнуты негой взоры

Навстречу северной Авроры,
Звездою севера явись!
Вечор, ты помнишь, вьюга злилась,
На мутном небе мгла носилась;`;

describe('Стих: части и подсказки', () => {
  it('строфы по 4 строки — части по строфам; иначе по 2', () => {
    expect(poemLines(TEXT).map((l) => l.stanza)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(autoChunk(TEXT)).toBe(0);
    expect(poemParts(TEXT, 0)).toEqual([{ from: 0, to: 4 }, { from: 4, to: 8 }]);
    expect(poemParts(TEXT, 2).length).toBe(4);
    expect(autoChunk('одна\nдве\nтри\nчетыре\nпять\nшесть')).toBe(2);
  });
  it('половина слов → первые буквы → ничего', () => {
    const l = 'Мороз и солнце; день чудесный!';
    expect(cueLine(l, 1).filter((t) => t.hidden).map((t) => t.full)).toEqual(['день']);
    expect(cueLine(l, 2).filter((t) => t.word).map((t) => t.text[0])).toEqual(['М', 'и', 'с', 'д', 'ч']);
    expect(cueLine(l, 3).filter((t) => t.word).every((t) => t.text === '')).toBe(true);
  });
});

describe('Стих: сверка сказанного', () => {
  const lines = ['Мороз и солнце; день чудесный!', 'Ещё ты дремлешь, друг прелестный —'];
  it('всё верно (ё, регистр, знаки не мешают)', () => {
    const r = compareRecital(lines, 'мороз и солнце день чудесный еще ты дремлешь друг прелестный');
    expect(r.accuracy).toBe(1);
    expect(r.badLines).toEqual([]);
  });
  it('пропуск, замена и запинка-повтор', () => {
    const r = compareRecital(lines, 'мороз и солнце день прекрасный еще ты ты дремлешь друг');
    const byWord = Object.fromEntries(r.words.map((w) => [w.word, w]));
    expect(byWord['чудесный'].mark).toBe('wrong');
    expect(byWord['прелестный'].mark).toBe('miss');
    expect(r.words.filter((w) => w.stumble).map((w) => w.word)).toEqual(['ты']);
    expect(r.badLines).toEqual([0, 1]);
    expect(r.accuracy).toBeCloseTo(8 / 10);
  });
  it('распознавание перепутало окончание — прощаем', () => {
    expect(compareRecital(['Звездою севера явись'], 'звездой севера явись').accuracy).toBe(1);
  });
  it('долгая пауза — запинка', () => {
    const r = compareRecital(['Пора красавица проснись'], 'пора красавица проснись', [0, 500, 5000]);
    expect(r.words[2].stumble).toBe(true);
    expect(r.stumbles).toBe(1);
  });
});

describe('Стих: повторение', () => {
  const p: Poem = { id: 'p', title: '', text: TEXT, chunk: 0, learned: 2, createdAt: '', updatedAt: '' };
  const now = new Date('2026-10-01T12:00:00');
  it('хорошо — промежуток растёт, плохо — завтра снова', () => {
    const r1 = nextReview(p, 0.95, now);
    expect(r1.interval).toBe(1);
    const r2 = nextReview({ ...p, review: r1 }, 1, now);
    expect(r2.interval).toBe(3);
    const r3 = nextReview({ ...p, review: r2 }, 1, now);
    expect(r3.interval).toBe(7);
    expect(nextReview({ ...p, review: r3 }, 0.5, now)).toMatchObject({ interval: 1, reps: 0 });
  });
  it('с любого места: трудные строки выпадают чаще, места не повторяются', () => {
    const hard = { ...p, lineMiss: [0, 0, 0, 0, 0, 9, 0, 0] };
    let hits = 0;
    for (let s = 0; s < 200; s++) {
      let x = s * 9301 + 49297;
      const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      const st = pickStarts(hard, 3, rnd);
      expect(new Set(st).size).toBe(st.length);
      if (st.includes(5)) hits++;
    }
    expect(hits).toBeGreaterThan(150);
  });
});

describe('Стих: напоминание на «Сегодня»', () => {
  it('выученный стих с наступившей датой — в списке; недоученный — нет', async () => {
    const { duePoems } = await import('./poem');
    const { emptyData } = await import('./store');
    const d = emptyData();
    const base = { title: 'З', text: TEXT, chunk: 0, createdAt: '', updatedAt: '' };
    d.topics = [{ id: 't', subjectId: 's', name: 'Лит', note: '', createdAt: '', updatedAt: '', poems: [
      { ...base, id: 'a', learned: 2, review: { due: '2026-10-01', interval: 1, reps: 0 } },
      { ...base, id: 'b', learned: 1, review: { due: '2026-10-01', interval: 1, reps: 0 } },
      { ...base, id: 'c', learned: 2, review: { due: '2026-10-05', interval: 3, reps: 1 } }
    ] }];
    expect(duePoems(d, new Date('2026-10-02T10:00:00')).map((x) => x.poem.id)).toEqual(['a']);
  });
});
