// 1.28.0: знакомство засчитывает короткий конспект и не зависит от того, «заметит» ли оно созданное при пропуске шага.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./components/Tutorial.tsx', import.meta.url), 'utf8');

describe('Знакомство: шаги засчитываются', () => {
  it('короткий конспект годится (порог не больше 10 знаков)', () => {
    const m = src.match(/export const NOTE_MIN = (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(10);
  });
  it('«Пропустить шаг» запоминает пройденный шаг, а не надеется на проверку данных', () => {
    expect(src).toMatch(/setSt\(\{ skipped: \[\.\.\.st\.skipped, major\] \}\)/);
  });
});
