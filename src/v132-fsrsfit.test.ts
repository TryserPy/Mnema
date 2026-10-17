// 1.32, N4: «Подогнать расписание под меня» — подгонка параметров FSRS по журналу повторений.
import { describe, expect, it } from 'vitest';
import { default_w, FSRSAlgorithm, forgetting_curve } from 'ts-fsrs';
import { cleanFitParams, countPredictions, FIT_MIN_REVIEWS, fitParameters, histories, intervalShift } from './fsrsFit';
import { gradeItem, scheduler } from './srs';
import type { ReviewLogEntry } from './types';

const DAY = 86400000;

/** Ученик, который на самом деле забывает по «правде» trueW, а повторяет по стандартному расписанию. */
function simulate(trueW: number[], cards: number, days: number, seed = 1): ReviewLogEntry[] {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const truth = new FSRSAlgorithm({ w: trueW });
  const sched = new FSRSAlgorithm({ w: [...default_w], request_retention: 0.9 });
  const logs: ReviewLogEntry[] = [];
  const t0 = Date.parse('2026-01-01T09:00:00Z');
  for (let c = 0; c < cards; c++) {
    const start = Math.floor((c / cards) * days * 0.5);
    let day = start;
    let trueS: ReturnType<FSRSAlgorithm['next_state']> | null = null;
    let schedS: ReturnType<FSRSAlgorithm['next_state']> | null = null;
    let last = day;
    let prevState = 0;
    while (day < days) {
      const t = schedS ? day - last : 0;
      const p = trueS ? forgetting_curve(trueW, t, trueS.stability) : 0.5;
      const g = (!trueS ? (rnd() < 0.7 ? 3 : 1) : rnd() < p ? (rnd() < 0.15 ? 4 : 3) : 1) as 1 | 3 | 4;
      logs.push({ key: `c${c}:0`, cardId: `c${c}`, topicId: 't', rating: g, prevState, at: new Date(t0 + day * DAY + c * 1000).toISOString(), ms: 3000 });
      trueS = truth.next_state(trueS, t, g);
      schedS = sched.next_state(schedS, t, g);
      prevState = 2;
      last = day;
      day += Math.max(1, sched.next_interval(schedS.stability, t));
    }
  }
  return logs;
}

describe('подгонка расписания', () => {
  it('мало повторений — честно говорит, сколько нужно', async () => {
    const r = await fitParameters(simulate([...default_w], 20, 30), { pause: async () => undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.need).toBe(FIT_MIN_REVIEWS);
  });

  it('история без первого знакомства (перенос из Anki) не учитывается', () => {
    const logs = simulate([...default_w], 5, 60).map((l) => ({ ...l, prevState: 2 }));
    expect(histories(logs)).toHaveLength(0);
  });

  it('ученик забывает быстрее стандарта — прогноз точнее, интервалы короче', async () => {
    // «Правда»: начальная стабильность и рост стабильности вдвое ниже стандартных.
    const trueW = [...default_w];
    for (const i of [0, 1, 2, 3]) trueW[i] = default_w[i] * 0.35;
    trueW[8] = default_w[8] - 0.7;
    const logs = simulate(trueW, 260, 180);
    expect(countPredictions(histories(logs))).toBeGreaterThan(FIT_MIN_REVIEWS);
    const r = await fitParameters(logs, { pause: async () => undefined, steps: 40 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.better).toBe(true);
    expect(r.params.after).toBeLessThan(r.params.before);
    expect(intervalShift(r.params.w)).toBeLessThan(0.9);
    expect(cleanFitParams(r.params)).toEqual(r.params);
  }, 60000);

  it('настройки: чужие и испорченные параметры — стандартные; свои — в планировщике', () => {
    expect(cleanFitParams({ w: [1, 2, 3] })).toBeUndefined();
    expect(cleanFitParams({ w: default_w.map(() => NaN) })).toBeUndefined();
    expect(cleanFitParams({ w: default_w.map((x, i) => (i === 0 ? 1e6 : x)) })).toBeUndefined();
    const w = [...default_w];
    w[0] = 0.5;
    w[2] = 1;
    const p = { w, at: '2026-10-17T00:00:00.000Z', reviews: 400, before: 0.08, after: 0.05 };
    expect(cleanFitParams(p)).toEqual(p);
    expect(scheduler({ retention: 0.9, fsrsParams: p }).parameters.w).toEqual(w);
    const now = new Date('2026-10-17T10:00:00Z');
    const mine = gradeItem(undefined, now, 3, { retention: 0.9, fsrsParams: p });
    const std = gradeItem(undefined, now, 3, { retention: 0.9 });
    expect(mine.stability).toBeLessThan(std.stability);
  });
});
