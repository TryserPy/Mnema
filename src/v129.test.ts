// Версия 1.29.0: подписи интервалов на кнопках оценки и прочие исправления этапа 1.
import { describe, expect, it } from 'vitest';
import { DAY, formatInterval, gradeItem, previewIntervals } from './srs';

describe('подписи интервалов на кнопках оценки', () => {
  it('коротко и по-русски', () => {
    expect(formatInterval(20_000)).toBe('<1 мин');
    expect(formatInterval(10 * 60_000)).toBe('10 мин');
    expect(formatInterval(3 * 3600_000)).toBe('3 ч');
    expect(formatInterval(DAY)).toBe('1 д');
    expect(formatInterval(3 * DAY)).toBe('3 д');
    expect(formatInterval(14 * DAY)).toBe('2 нед');
    expect(formatInterval(21 * DAY)).toBe('3 нед');
    expect(formatInterval(45 * DAY)).toBe('1,5 мес');
    expect(formatInterval(60 * DAY)).toBe('2 мес');
    expect(formatInterval(200 * DAY)).toBe('6,5 мес');
    expect(formatInterval(800 * DAY)).toBe('2,2 г');
  });
  it('показывает ровно то, что применит планировщик', () => {
    const now = new Date('2026-10-01T10:00:00');
    const s = gradeItem(undefined, now, 3, { retention: 0.9 });
    const later = new Date(s.due);
    const preview = previewIntervals(s, later, { retention: 0.9 });
    expect(preview).toHaveLength(4);
    // «Хорошо» из preview совпадает по порядку величины с реальным результатом (разница только в разбросе fuzz)
    const real = new Date(gradeItem(s, later, 3, { retention: 0.9 }).due).getTime() - later.getTime();
    expect(Math.abs(real - preview[2]) / Math.max(real, preview[2])).toBeLessThan(0.35);
    // чем лучше оценка, тем дальше повтор
    expect(preview[0]).toBeLessThan(preview[1]);
    expect(preview[1]).toBeLessThanOrEqual(preview[2]);
    expect(preview[2]).toBeLessThan(preview[3]);
  });
});
