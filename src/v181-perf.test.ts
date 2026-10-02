// 1.8.1 — быстрые счётчики по всем темам: ответ тот же, что у старого пути «на каждую тему», только за один проход.
import { describe, expect, it } from 'vitest';
import { cardsByTopic, DAY, HOUR, itemKey, itemOrds, todayCounts, todayCountsByTopic, topicMastery, topicMasteryByTopic, topicStatsByTopic } from './srs';
import { emptyData } from './store';
import type { AppData, Card, ItemState, Topic } from './types';

// Детерминированный генератор случайных чисел.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = new Date('2026-10-02T10:00:00');
const dayStartMs = new Date('2026-10-02T04:00:00').getTime();

interface Opts {
  topics: number;
  cards: number;
  newPerDay?: number;
  maxReviews?: number;
  exams?: number; // сколько тем с контрольной
  oddStates?: boolean; // состояния 0 (и другие странные) среди повторений
  startedShare?: number;
  logsToday?: number;
}

/** Случайные данные: подтемы, разные типы карточек, разные состояния, сегодняшние ответы, контрольные. */
function randomData(seed: number, o: Opts): AppData {
  const R = rng(seed);
  const d = emptyData();
  d.settings.newPerDay = o.newPerDay ?? 15;
  d.settings.maxReviews = o.maxReviews ?? 200;
  d.subjects = [
    { id: 's1', name: 'А', color: '#000', createdAt: '' },
    { id: 's2', name: 'Б', color: '#111', createdAt: '' }
  ];
  const topics: Topic[] = [];
  for (let i = 0; i < o.topics; i++) {
    const parent = topics.length && R() > 0.3 ? topics[Math.floor(R() * topics.length)] : undefined;
    const t: Topic = { id: 't' + i, subjectId: parent ? parent.subjectId : R() < 0.5 ? 's1' : 's2', name: 'Тема ' + i, note: '', createdAt: '', updatedAt: '' };
    if (parent) t.parentId = parent.id;
    if (R() < 0.05) t.kind = 'glossary';
    topics.push(t);
  }
  // контрольные: сегодня, завтра, через 2 дня, через неделю, вчера (уже прошла)
  for (let i = 0; i < (o.exams ?? 0); i++) {
    const t = topics[Math.floor(R() * topics.length)];
    const shift = [0, 1, 2, 2, 7, -1][Math.floor(R() * 6)];
    t.examDate = new Date(NOW.getTime() + shift * DAY).toISOString().slice(0, 10);
  }
  d.topics = topics;
  const cards: Card[] = [];
  const states: Record<string, ItemState> = {};
  const logs: AppData['logs'] = [];
  const started = o.startedShare ?? 0.65;
  for (let i = 0; i < o.cards; i++) {
    // немного карточек «в никуда» (тема удалена) — как бывает после сбоев
    const topicId = R() < 0.02 ? 'нет-такой' : topics[Math.floor(R() * topics.length)].id;
    const r = R();
    const type = r < 0.5 ? 'basic' : r < 0.75 ? 'cloze' : r < 0.85 ? 'typing' : 'reverse';
    const c: Card = { id: 'c' + i, topicId, type, front: 'Вопрос ' + i, back: 'Ответ', createdAt: '', updatedAt: '' };
    if (type === 'cloze') c.front = Array.from({ length: Math.floor(R() * 4) }, (_, j) => `{{п${j}}} и текст`).join(' ') || 'без пропусков';
    if (R() < 0.04) {
      c.listId = 'l1';
      if (R() < 0.5) c.back = ''; // строка словаря без ответа — не учится
    }
    cards.push(c);
    for (const ord of itemOrds(c)) {
      if (R() > started) continue;
      const lastDaysAgo = Math.floor(R() * 40);
      const stab = Math.exp(R() * 5);
      const sched = Math.max(1, Math.round(stab));
      const dueAt = NOW.getTime() - lastDaysAgo * DAY + sched * DAY + (R() < 0.15 ? (R() - 0.5) * 20 * HOUR : 0);
      const rr = R();
      const state = o.oddStates ? (rr < 0.1 ? 0 : rr < 0.2 ? 1 : rr < 0.28 ? 3 : 2) : rr < 0.06 ? 3 : rr < 0.1 ? 1 : 2;
      states[itemKey(c.id, ord)] = {
        due: new Date(dueAt).toISOString(),
        stability: stab,
        difficulty: 1 + R() * 9,
        elapsed_days: sched,
        scheduled_days: sched,
        learning_steps: 0,
        reps: R() < 0.08 ? 0 : 1 + Math.floor(R() * 8),
        lapses: R() < 0.15 ? 2 + Math.floor(R() * 3) : 0,
        state,
        last_review: new Date(NOW.getTime() - lastDaysAgo * DAY).toISOString()
      };
    }
  }
  // ответы сегодня: часть — «первый раз» (prevState 0), часть — повторения
  const n = o.logsToday ?? Math.round(o.cards / 20);
  for (let i = 0; i < n; i++) {
    const c = cards[Math.floor(R() * cards.length)];
    const ords = itemOrds(c);
    if (!ords.length) continue;
    const ord = ords[Math.floor(R() * ords.length)];
    logs.push({ key: itemKey(c.id, ord), cardId: c.id, topicId: c.topicId, rating: 3, prevState: R() < 0.5 ? 0 : 2, at: new Date(dayStartMs + Math.floor(R() * 5 * HOUR)).toISOString(), ms: 3000 });
  }
  logs.sort((a, b) => (a.at < b.at ? -1 : 1));
  d.cards = cards;
  d.states = states;
  d.logs = logs;
  return d;
}

/** Старый путь на новой копии данных (чтобы кэш todayCounts не подставил чужой ответ). */
function oldCounts(d: AppData, id: string) {
  const fresh: AppData = { ...d, cards: [...d.cards] };
  return todayCounts(fresh, NOW, { topicId: id });
}

function expectSame(d: AppData) {
  const ids = d.topics.map((t) => t.id);
  const fast = todayCountsByTopic(d, NOW);
  const mast = topicMasteryByTopic(d);
  const both = topicStatsByTopic(d, NOW, ids);
  const fresh: AppData = { ...d, cards: [...d.cards] }; // один «свежий» объект на все темы — старый путь, как в экране предмета
  for (const id of ids) {
    const old = todayCounts(fresh, NOW, { topicId: id });
    expect(fast.get(id), 'счётчики темы ' + id).toEqual(old);
    expect(both.get(id)!.counts, 'счётчики темы ' + id + ' (общий проход)').toEqual(old);
    const m = topicMastery(d, id);
    expect(mast.get(id), 'освоение темы ' + id).toEqual(m);
    expect(both.get(id)!.mastery, 'освоение темы ' + id + ' (общий проход)').toEqual(m);
  }
}

describe('todayCountsByTopic / topicMasteryByTopic: тот же ответ, что у старого пути', () => {
  it('случайные данные: подтемы, cloze, двусторонние, словарь, лишние карточки', () => {
    for (let seed = 1; seed <= 6; seed++) expectSame(randomData(seed, { topics: 40, cards: 600 }));
  });

  it('контрольные: новые сверх лимита и «заранее»', () => {
    for (let seed = 10; seed <= 17; seed++) expectSame(randomData(seed, { topics: 30, cards: 700, exams: 6, startedShare: 0.5 }));
  });

  it('маленький дневной лимит новых и разные значения (0, 1, 3, 100)', () => {
    for (const newPerDay of [0, 1, 3, 100]) expectSame(randomData(20 + newPerDay, { topics: 30, cards: 500, newPerDay, startedShare: 0.3, logsToday: 60 }));
  });

  it('обрезка повторений (maxReviews меньше, чем наступило)', () => {
    for (const maxReviews of [0, 1, 5, 20, 60]) expectSame(randomData(30 + maxReviews, { topics: 30, cards: 800, maxReviews, startedShare: 0.9 }));
  });

  it('обрезка вместе со странными состояниями и контрольными (честный старый путь)', () => {
    for (let seed = 40; seed <= 45; seed++) expectSame(randomData(seed, { topics: 25, cards: 700, maxReviews: 15, exams: 4, oddStates: true, startedShare: 0.85 }));
  });

  it('странные состояния без обрезки', () => {
    for (let seed = 50; seed <= 53; seed++) expectSame(randomData(seed, { topics: 25, cards: 500, oddStates: true }));
  });

  it('одна тема, пустые данные, неизвестная тема', () => {
    const empty = emptyData();
    expect(todayCountsByTopic(empty, NOW).size).toBe(0);
    expect(topicMasteryByTopic(empty).size).toBe(0);
    const d = randomData(60, { topics: 5, cards: 50 });
    const some = todayCountsByTopic(d, NOW, ['t1', 'нет-такой']);
    expect(some.get('t1')).toEqual(oldCounts(d, 't1'));
    expect(some.get('нет-такой')).toEqual(oldCounts(d, 'нет-такой'));
    expect(topicMasteryByTopic(d, ['нет-такой']).get('нет-такой')).toEqual(topicMastery(d, 'нет-такой'));
  });

  it('цикл в подтемах не зависает', () => {
    const d = randomData(70, { topics: 6, cards: 80 });
    d.topics = d.topics.map((t, i) => (i === 0 ? { ...t, parentId: d.topics[3].id } : i === 3 ? { ...t, parentId: d.topics[0].id } : t));
    expectSame(d);
  });

  it('невалидные настройки (maxReviews/newPerDay не числа) — всё равно как раньше', () => {
    const d = randomData(80, { topics: 15, cards: 300 });
    (d.settings as any).maxReviews = undefined;
    (d.settings as any).newPerDay = undefined;
    expectSame(d);
  });

  it('подтемы складываются в тему-родителя', () => {
    const d = emptyData();
    d.subjects = [{ id: 's', name: 'S', color: '#000', createdAt: '' }];
    const mk = (id: string, parentId?: string): Topic => ({ id, subjectId: 's', name: id, note: '', createdAt: '', updatedAt: '', ...(parentId ? { parentId } : {}) });
    d.topics = [mk('a'), mk('b', 'a'), mk('c', 'b'), mk('z')];
    d.cards = ['a', 'b', 'c', 'z'].flatMap((t) => [0, 1, 2].map((k) => ({ id: `${t}${k}`, topicId: t, type: 'basic' as const, front: 'q', back: 'a', createdAt: '', updatedAt: '' })));
    const m = todayCountsByTopic(d, NOW);
    expect(m.get('a')!.newCount).toBe(9); // a + b + c
    expect(m.get('b')!.newCount).toBe(6);
    expect(m.get('c')!.newCount).toBe(3);
    expect(m.get('z')!.newCount).toBe(3);
    expect(topicMasteryByTopic(d).get('a')!.total).toBe(9);
    expect(cardsByTopic(d).get('a')!.length).toBe(3);
  });
});

describe('быстрее старого пути', () => {
  it('на 200 темах и 4000 карточках — заметно быстрее, ответ тот же', () => {
    const d = randomData(90, { topics: 200, cards: 4000, exams: 5 });
    const ids = d.topics.map((t) => t.id);
    const t0 = performance.now();
    const fast = topicStatsByTopic(d, NOW, ids);
    const tFast = performance.now() - t0;
    const fresh: AppData = { ...d, cards: [...d.cards] };
    const t1 = performance.now();
    const old = new Map(ids.map((id) => [id, { counts: todayCounts(fresh, NOW, { topicId: id }), mastery: topicMastery(fresh, id) }]));
    const tOld = performance.now() - t1;
    for (const id of ids) expect(fast.get(id)).toEqual(old.get(id));
    expect(tFast).toBeLessThan(tOld / 2);
  });
});
