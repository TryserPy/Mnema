import { describe, expect, it } from 'vitest';
import { notificationPlan, widgetState } from './homework';
import { buildQueue, examPlan, recallAfter, warmupCards } from './srs';
import { emptyData } from './store';
import type { AppData, Card, ItemState } from './types';
import { newer, parseRepo } from './update';

const T0 = '2026-09-01T10:00:00.000Z';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const card = (id: string, topicId: string): Card => ({ id, topicId, type: 'basic', front: 'Q' + id, back: 'A', createdAt: T0, updatedAt: T0 });
const st = (dueDays: number, stability: number, now: Date): ItemState => ({ due: new Date(now.getTime() + dueDays * 864e5).toISOString(), stability, difficulty: 5, elapsed_days: 1, scheduled_days: 1, reps: 3, lapses: 0, state: 2, last_review: new Date(now.getTime() - 864e5).toISOString() } as ItemState);

function withExam(days: number, n: number, now: Date): AppData {
  const d = emptyData();
  d.subjects = [{ id: 's', name: 'Физика', color: '#000', createdAt: T0, updatedAt: T0 }];
  const ex = new Date(now);
  ex.setDate(ex.getDate() + days);
  d.topics = [{ id: 't', subjectId: 's', name: 'Ток', note: '', examDate: ymd(ex), createdAt: T0, updatedAt: T0 }];
  d.cards = Array.from({ length: n }, (_, i) => card('c' + i, 't'));
  d.settings.newPerDay = 0; // даже без обычного лимита план добавит новые
  return d;
}

describe('План до контрольной', () => {
  const now = new Date(2026, 8, 27, 12);
  it('раскладывает новые карточки поровну до дня перед контрольной', () => {
    const d = withExam(4, 12, now);
    const p = examPlan(d, now, 't')!;
    expect(p.daysLeft).toBe(4);
    expect(p.todayNew).toBe(3);
    expect(p.perDay.reduce((a, b) => a + b, 0)).toBe(12);
    const q = buildQueue(d, now, {}, () => 0.5);
    expect(q.filter((x) => x.isNew)).toHaveLength(3);
  });
  it('контрольная завтра — все новые сегодня; в последние дни — освежить то, что забудется', () => {
    const d = withExam(1, 4, now);
    d.cards.push(card('old', 't'));
    d.states['old:0'] = st(10, 1, now); // повторение через 10 дней, а к контрольной уже подзабудется
    const p = examPlan(d, now, 't')!;
    expect(p.todayNew).toBe(4);
    expect(p.todayAhead).toBe(1);
    expect(buildQueue(d, now, {}, () => 0.5).map((x) => x.key)).toContain('old:0');
  });
  it('без контрольной очередь прежняя; кривая забывания убывает', () => {
    const d = withExam(4, 5, now);
    d.topics[0].examDate = undefined;
    expect(buildQueue(d, now, {}, () => 0.5)).toHaveLength(0);
    expect(recallAfter(0, 5)).toBe(1);
    expect(recallAfter(10, 5)).toBeLessThan(recallAfter(1, 5));
  });
});

describe('Уроки: разминка и вечернее напоминание', () => {
  const now = new Date(2026, 8, 28, 8); // понедельник, утро
  it('разминка берёт самые подзабытые карточки сегодняшних предметов', () => {
    const d = withExam(4, 3, now);
    d.topics[0].examDate = undefined;
    d.settings.schedule = { '1': ['s'] };
    d.states['c0:0'] = st(5, 30, now);
    d.states['c1:0'] = st(5, 1, now);
    expect(warmupCards(d, now, 5)).toEqual(['c1', 'c0']);
  });
  it('вечером напоминает о завтрашних уроках', () => {
    const d = withExam(4, 1, now);
    d.settings.features.schedule = true;
    d.settings.schedule = { '2': ['s'] };
    const plan = notificationPlan(d, now).filter((p) => p.open === 'lessons');
    expect(plan[0].title).toBe('Завтра: Физика');
    expect(new Date(plan[0].at).getDay()).toBe(1);
  });
});

describe('Виджет и обновления', () => {
  it('виджет: дни вперёд и домашка', () => {
    const now = new Date(2026, 8, 27, 12);
    const d = withExam(4, 1, now);
    d.homework = [{ id: 'h', text: '§ 5', subjectId: 's', due: '2026-09-28', createdAt: T0, updatedAt: T0 }];
    const w = widgetState(d, now, 7, [7, 3, 0, 0, 0, 0, 0, 0], 0, 2);
    expect(w.days[0]).toEqual({ date: '2026-09-27', cards: 7 });
    expect(w.days[1].cards).toBe(3);
    expect(w.hw[0]).toMatchObject({ due: '2026-09-28', subject: 'Физика' });
  });
  it('сравнение версий и адрес репозитория', () => {
    expect(newer('1.10.0', '1.9.3')).toBe(true);
    expect(newer('v1.6.0', '1.6.0')).toBe(false);
    expect(parseRepo('https://github.com/masha/mnema')).toEqual({ owner: 'masha', repo: 'mnema' });
    expect(parseRepo('masha/mnema')).toEqual({ owner: 'masha', repo: 'mnema' });
  });
});
