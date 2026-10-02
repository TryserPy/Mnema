// 1.8.1 — быстрые счётчики по всем темам: ответ тот же, что у старого пути «на каждую тему», только за один проход.
import { forceSimulation } from 'd3-force';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildGraph, planGraph } from './components/KnowledgeMap';
import { clearLayouts, firstLinks, FORCE_LIMIT, getLayout, layoutCacheSize, layoutKey, LIVE_LIMIT, needsOneSubject, physicsPlan, putLayout, SUBJECT_LIMIT, termsVerdict, TERMS_LIMIT, ticksToCool } from './mapLod';
import { cardsByTopic, DAY, HOUR, itemKey, itemOrds, todayCounts, todayCountsByTopic, topicMastery, topicMasteryByTopic, topicStatsByTopic, topicStatus } from './srs';
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

// ---------- Карта знаний: уровни детализации, шаги физики, кэш раскладки ----------

// Слово только из букв и разное для разных n (цифры и конец слова карта отбрасывает при сравнении «понятий»).
const word = (n: number) => {
  const L = 'абвгдежзиклмнопрстуфхцчшэюя';
  let w = '';
  let x = n;
  do {
    w += L[x % L.length];
    x = Math.floor(x / L.length);
  } while (x > 0);
  return w + 'ние';
};

/** Данные для карты: S предметов, T тем, у каждой темы `terms` жирных понятий (из них `shared` — общие на всех). */
function graphData(S: number, T: number, terms: number, shared = 0): AppData {
  const d = emptyData();
  d.subjects = Array.from({ length: S }, (_, i) => ({ id: 's' + i, name: 'Предмет ' + i, color: '#' + (100000 + i * 7919).toString(16).slice(0, 6), createdAt: '' }));
  d.topics = Array.from({ length: T }, (_, i) => {
    const bold = Array.from({ length: terms }, (_, k) => `**${k < shared ? word(900000 + k) : word(i * 20 + k)}** — определение`).join('\n\n');
    return { id: 't' + i, subjectId: 's' + (i % S), name: 'Тема ' + i, note: bold, createdAt: '', updatedAt: '', ...(i > 3 && i % 5 === 0 ? { parentId: 't' + (i - 4) } : {}) } as Topic;
  });
  d.cards = Array.from({ length: T * 2 }, (_, i) => ({ id: 'c' + i, topicId: 't' + (i % T), type: 'basic' as const, front: 'q' + i, back: 'a', createdAt: '', updatedAt: '' }));
  return d;
}

describe('карта: уровни детализации', () => {
  it('пороги и решения', () => {
    expect(TERMS_LIMIT).toBe(700);
    expect(SUBJECT_LIMIT).toBe(1500);
    expect(termsVerdict(false, 99999, false)).toEqual({ show: false, hidden: false, canForce: false }); // пользователь сам выключил
    expect(termsVerdict(true, 700, false).show).toBe(true);
    expect(termsVerdict(true, 701, false)).toEqual({ show: false, hidden: true, canForce: true });
    expect(termsVerdict(true, 2000, true).show).toBe(true); // «Все понятия» нажато вручную
    expect(termsVerdict(true, FORCE_LIMIT + 1, true)).toEqual({ show: false, hidden: true, canForce: false }); // слишком тяжело даже по просьбе
    expect(needsOneSubject(1501, 5, false)).toBe(true);
    expect(needsOneSubject(1500, 5, false)).toBe(false);
    expect(needsOneSubject(5000, 1, false)).toBe(false); // предмет один — делить нечего
    expect(needsOneSubject(5000, 5, true)).toBe(false); // предмет уже выбран
  });

  it('мало узлов — всё как раньше, без строки', () => {
    const d = graphData(3, 20, 3, 1);
    const p = planGraph(d, true, null, false);
    expect(p.termsHidden).toBe(false);
    expect(p.shown).toBeNull();
    expect(p.graph.nodes.length).toBe(buildGraph(d, true, null).nodes.length);
    expect(p.graph.nodes.some((n) => n.kind === 'term' && n.color === '#8A8F9C')).toBe(true); // одиночные понятия на месте
  });

  it('много узлов — понятия скрыты, настройка в данных не тронута', () => {
    const d = graphData(4, 150, 6, 1);
    d.settings.graph.showTerms = true;
    const full = buildGraph(d, true, null).nodes.length;
    expect(full).toBeGreaterThan(TERMS_LIMIT);
    const p = planGraph(d, true, null, false);
    expect(p.termsHidden).toBe(true);
    expect(p.canForce).toBe(true);
    expect(p.shown).toBeNull();
    expect(p.graph.nodes.length).toBe(buildGraph(d, false, null).nodes.length); // как при showTerms=false
    expect(p.graph.nodes.some((n) => n.kind === 'term' && n.color === '#8A8F9C')).toBe(false);
    expect(d.settings.graph.showTerms).toBe(true); // только ограничили показ
    // вручную «Все понятия» — показываем всё
    expect(planGraph(d, true, null, true).graph.nodes.length).toBe(full);
    // выбрал предмет — узлов стало меньше порога, понятия вернулись сами
    const one = planGraph(d, true, 's0', false);
    expect(one.graph.nodes.length).toBe(buildGraph(d, true, 's0').nodes.length);
    expect(one.termsHidden).toBe(buildGraph(d, true, 's0').nodes.length > TERMS_LIMIT);
    // выключил сам — понятий нет и строки про «скрыты» нет
    const off = planGraph(d, false, null, false);
    expect(off.termsHidden).toBe(false);
    expect(off.graph.nodes.length).toBe(buildGraph(d, false, null).nodes.length);
  });

  it('очень много узлов — один предмет, остальные кружками', () => {
    const d = graphData(5, 1700, 1, 0);
    expect(buildGraph(d, false, null).nodes.length).toBeGreaterThan(SUBJECT_LIMIT);
    const p = planGraph(d, true, null, false);
    expect(p.shown).toBe('Предмет 0');
    const lone = p.graph.nodes.filter((n) => n.lone);
    expect(lone.map((n) => n.label)).toEqual(['Предмет 1', 'Предмет 2', 'Предмет 3', 'Предмет 4']);
    expect(lone.every((n) => n.kind === 'subject')).toBe(true);
    // тем из других предметов на карте нет
    const topicIds = new Set(p.graph.nodes.filter((n) => n.kind === 'topic').map((n) => n.topicId));
    expect([...topicIds].every((id) => d.topics.find((t) => t.id === id)!.subjectId === 's0')).toBe(true);
    expect(p.graph.nodes.length).toBeLessThan(SUBJECT_LIMIT);
    // выбранный предмет показывается целиком, без кружков
    const sel = planGraph(d, true, 's2', false);
    expect(sel.shown).toBeNull();
    expect(sel.graph.nodes.some((n) => n.lone)).toBe(false);
    expect(sel.graph.nodes.filter((n) => n.kind === 'subject').length).toBe(1);
  });

  it('первый предмет без тем пропускается', () => {
    const d = graphData(5, 1700, 1, 0);
    d.topics = d.topics.filter((t) => t.subjectId !== 's0');
    const p = planGraph(d, false, null, false);
    if (p.shown) expect(p.shown).toBe('Предмет 1');
  });

  it('buildGraph: размер, статус и связи те же, что давала старая формула', () => {
    const d = randomData(5, { topics: 40, cards: 500 });
    d.topics = d.topics.filter((t) => !t.kind);
    const g = buildGraph(d, true, null);
    for (const n of g.nodes.filter((x) => x.kind === 'topic')) {
      const cards = d.cards.filter((c) => c.topicId === n.topicId).length;
      expect(n.size).toBeCloseTo(6 + Math.min(5, Math.sqrt(cards) * 1.2), 10);
      expect(n.status).toBe(topicStatus(topicMastery(d, n.topicId!)));
    }
    expect(g.links.filter((l) => l.kind === 'st').length).toBe(d.topics.length);
  });

  it('firstLinks == links.find для каждого узла', () => {
    const d = graphData(3, 60, 4, 2);
    const g = buildGraph(d, true, null);
    const first = firstLinks(g.links);
    for (const n of g.nodes) expect(first.get(n.id)).toBe(g.links.find((l) => l.target === n.id || l.source === n.id));
  });
});

describe('карта: шаги физики и кэш раскладки', () => {
  beforeEach(() => clearLayouts());

  it('чем больше узлов, тем меньше шагов; маленькие карты — как раньше', () => {
    const small = physicsPlan(120);
    expect(small).toMatchObject({ alphaDecay: 0.018, live: true });
    expect(ticksToCool(0.018)).toBe(381);
    let prev = Infinity;
    for (const n of [100, 500, 1000, 3000]) {
      const p = physicsPlan(n);
      expect(p.maxTicks).toBeLessThanOrEqual(prev);
      prev = p.maxTicks;
    }
    expect(physicsPlan(LIVE_LIMIT).live).toBe(true);
    expect(physicsPlan(LIVE_LIMIT + 1).live).toBe(false);
    expect(physicsPlan(3000).maxTicks).toBeLessThan(130);
  });

  it('d3-force с этим alphaDecay действительно успокаивается не дольше maxTicks', () => {
    for (const n of [100, 500, 1000, 3000]) {
      const p = physicsPlan(n);
      const sim = forceSimulation([{}, {}, {}]).alphaDecay(p.alphaDecay).stop();
      let ticks = 0;
      while (sim.alpha() > sim.alphaMin() && ticks < 5000) {
        sim.tick();
        ticks++;
      }
      expect(ticks).toBeLessThanOrEqual(p.maxTicks);
    }
  });

  it('ключ раскладки не зависит от порядка и чувствителен к составу, связям и настройкам', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const edges: [string, string][] = [['a', 'b'], ['b', 'c'], ['c', 'd']];
    const k = layoutKey(ids, edges, [1, 1, 1]);
    expect(layoutKey([...ids].reverse(), [...edges].reverse(), [1, 1, 1])).toBe(k);
    expect(layoutKey([...ids, 'e'], edges, [1, 1, 1])).not.toBe(k);
    expect(layoutKey(ids, [['a', 'b'], ['b', 'c'], ['b', 'd']], [1, 1, 1])).not.toBe(k); // тему перенесли
    expect(layoutKey(ids, edges, [1.5, 1, 1])).not.toBe(k);
  });

  it('кэш: берём то, что положили; старые вытесняются', () => {
    const pos = new Map([['a', [1, 2] as [number, number]]]);
    putLayout('k0', pos, true);
    expect(getLayout('k0')).toEqual({ pos, done: true });
    expect(getLayout('нет')).toBeUndefined();
    for (let i = 1; i <= 8; i++) putLayout('k' + i, pos, false);
    expect(layoutCacheSize()).toBe(6);
    expect(getLayout('k0')).toBeUndefined();
    expect(getLayout('k8')?.done).toBe(false);
  });
});
