// Этап 4 (2.0): «Учиться» — один план на сегодня: шаги с причинами, время 5/10/20 минут, пропуск шага.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSession, perItemMs, sessionLine, STEP_ORDER } from './session';
import { buildQueue, DAY, itemKey } from './srs';
import { emptyData } from './store';
import type { AppData, Card, ItemState, ReviewLogEntry, Topic } from './types';

const NOW = new Date('2026-10-05T10:00:00'); // понедельник
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const T0 = '2026-09-01T10:00:00.000Z';
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const topic = (id: string, subjectId = 's1', extra: Partial<Topic> = {}): Topic => ({ id, subjectId, name: 'Тема ' + id, note: '', createdAt: T0, updatedAt: T0, ...extra });
const card = (id: string, topicId: string): Card => ({ id, topicId, type: 'basic', front: 'В ' + id, back: 'О ' + id, createdAt: T0, updatedAt: T0 });
const due = (daysAgo: number, o: Partial<ItemState> = {}): ItemState => ({ due: ago(daysAgo), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: ago(daysAgo + 5), ...o });
const log = (cardId: string, ms: number): ReviewLogEntry => ({ key: itemKey(cardId, 0), cardId, topicId: 't1', rating: 3, prevState: 2, at: ago(1), ms });

function world(): AppData {
  const d = emptyData();
  d.subjects = [
    { id: 's1', name: 'Биология', color: '#0a0', createdAt: T0 },
    { id: 's2', name: 'Физика', color: '#00a', createdAt: T0 }
  ];
  d.topics = [topic('t1'), topic('t2', 's2')];
  d.settings.newPerDay = 5;
  return d;
}

/** 50 просроченных повторений, 3 «в изучении», 20 новых (из них в день — 5). */
function busy(): AppData {
  const d = world();
  for (let i = 0; i < 50; i++) {
    d.cards.push(card('r' + i, i % 2 ? 't1' : 't2'));
    d.states[itemKey('r' + i, 0)] = due(2 + (i % 3));
  }
  for (let i = 0; i < 3; i++) {
    d.cards.push(card('l' + i, 't1'));
    d.states[itemKey('l' + i, 0)] = due(0.01, { state: 1, learning_steps: 1 });
  }
  for (let i = 0; i < 20; i++) d.cards.push(card('n' + i, 't1'));
  return d;
}

const rnd = () => 0.5;

describe('buildSession: те же карточки, что и «Начать», но разложенные по шагам', () => {
  it('без ограничений — ровно очередь дня, порядок тот же', () => {
    const d = busy();
    const q = buildQueue(d, NOW, {}, rnd).map((x) => x.key);
    const s = buildSession(d, NOW, {}, rnd);
    expect(s.items.map((x) => x.key)).toEqual(q);
    expect(s.later).toBe(0);
    expect(s.steps.reduce((a, x) => a + x.count, 0)).toBe(q.length);
  });

  it('шаги идут в одном порядке: учится сейчас → повторения → новое; у каждого есть причина', () => {
    const s = buildSession(busy(), NOW, {}, rnd);
    expect(s.steps.map((x) => x.kind)).toEqual(['learning', 'review', 'new']);
    for (const st of s.steps) {
      expect(st.title.length).toBeGreaterThan(3);
      expect(st.why.length).toBeGreaterThan(10);
      expect(st.skipped).toBe(false);
    }
    expect(s.steps.find((x) => x.kind === 'learning')!.count).toBe(3);
    expect(s.steps.find((x) => x.kind === 'new')!.count).toBe(5); // лимит новых в день
    expect(s.steps.map((x) => x.kind).every((k) => STEP_ORDER.includes(k))).toBe(true);
  });

  it('пустой день: нет карточек — нет шагов и 0 минут', () => {
    const s = buildSession(world(), NOW, {}, rnd);
    expect(s.items).toEqual([]);
    expect(s.steps).toEqual([]);
    expect(s.minutes).toBe(0);
    expect(sessionLine(s)).toContain('нечего повторять');
  });
});

describe('время: 5 / 10 / 20 минут', () => {
  it('по умолчанию ответ занимает ~11 секунд: за 5 минут — около 27 карточек, остальное «на потом»', () => {
    const d = busy();
    const per = perItemMs(d);
    expect(per).toBeCloseTo(11_000, -2);
    const s5 = buildSession(d, NOW, { minutes: 5 }, rnd);
    expect(s5.items.length).toBe(Math.floor((5 * 60_000) / per));
    expect(s5.later).toBe(buildQueue(d, NOW, {}, rnd).length - s5.items.length);
    expect(s5.minutes).toBeLessThanOrEqual(5);
  });

  it('быстрые ответы — больше карточек за те же минуты', () => {
    const d = busy();
    d.logs = Array.from({ length: 50 }, (_, i) => log('r' + (i % 50), 2000));
    const fast = buildSession(d, NOW, { minutes: 5 }, rnd).items.length;
    const slow = buildSession(busy(), NOW, { minutes: 5 }, rnd).items.length;
    expect(fast).toBeGreaterThan(slow);
  });

  it('срез идёт с начала очереди: срочное (учится сейчас) не отрезается', () => {
    const d = busy();
    const s = buildSession(d, NOW, { minutes: 1 }, rnd);
    expect(s.items.length).toBeGreaterThanOrEqual(1);
    const first = s.items.slice(0, 3).map((x) => d.states[x.key]?.state);
    expect(first.every((x) => x === 1 || x === 3)).toBe(true);
  });

  it('20 минут и «всё» дают больше, чем 5; ничего не теряется (later считается)', () => {
    const d = busy();
    const a = buildSession(d, NOW, { minutes: 5 }, rnd);
    const b = buildSession(d, NOW, { minutes: 20 }, rnd);
    const c = buildSession(d, NOW, {}, rnd);
    expect(a.items.length).toBeLessThanOrEqual(b.items.length);
    expect(b.items.length).toBeLessThanOrEqual(c.items.length);
    expect(a.items.length + a.later).toBe(c.items.length);
  });
});

describe('пропустить шаг', () => {
  it('убирает карточки шага, оставляет шаг в списке со значком «пропущен» и числом', () => {
    const d = busy();
    const s = buildSession(d, NOW, { skip: ['new'] }, rnd);
    expect(s.items.some((x) => d.states[x.key] === undefined)).toBe(false);
    const step = s.steps.find((x) => x.kind === 'new')!;
    expect(step.skipped).toBe(true);
    expect(step.total).toBe(5);
    expect(step.count).toBe(0);
    expect(sessionLine(s)).toContain('2 шага');
  });

  it('пропуск всех шагов даёт пустую учёбу, но не падает; неизвестные шаги игнорируются', () => {
    const d = busy();
    const s = buildSession(d, NOW, { skip: ['learning', 'review', 'new', 'exam', 'tomorrow', 'мусор'] }, rnd);
    expect(s.items).toEqual([]);
    expect(s.minutes).toBe(0);
  });
});

describe('контрольная и расписание', () => {
  it('подготовка к контрольной — отдельный шаг с названием и сроком', () => {
    const d = busy();
    d.exams = [{ id: 'e1', subjectId: 's1', name: 'Клетка', date: '2026-10-08', topicIds: ['t1'], createdAt: T0, updatedAt: T0 }];
    const s = buildSession(d, NOW, {}, rnd);
    const ex = s.steps.find((x) => x.kind === 'exam');
    expect(ex).toBeTruthy();
    expect(ex!.title).toContain('Клетка');
    expect(ex!.why).toContain('через 3 дня');
    expect(s.steps[0].kind === 'learning' || s.steps[0].kind === 'exam').toBe(true);
  });

  it('предметы на завтра — свой шаг, если включено расписание; без расписания — обычные повторения', () => {
    const d = busy();
    d.settings.features = { ...d.settings.features, schedule: true };
    d.settings.schedule = { '2': ['s2'] }; // завтра — вторник, физика
    const on = buildSession(d, NOW, {}, rnd);
    const tm = on.steps.find((x) => x.kind === 'tomorrow');
    expect(tm).toBeTruthy();
    expect(tm!.why).toContain('Физика');
    expect(on.steps.find((x) => x.kind === 'review')).toBeTruthy();
    const off = buildSession(busy(), NOW, {}, rnd);
    expect(off.steps.find((x) => x.kind === 'tomorrow')).toBeUndefined();
  });
});
