// Микробенчмарки чистых функций Мнемы на синтетических данных (Node). Ничего в проекте не меняет.
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
// @ts-ignore
import { TIERS, makeData, sizeReport } from './gen.mjs';
import { normalizeData, childTopics, sortedSubjects, topicWithDescendants } from '/home/user/Mnema/src/store';
import { allItems, buildQueue, todayCounts, topicMastery, topicStatus, forecast, streak, dayKey, dayStart, DAY } from '/home/user/Mnema/src/srs';
import { boldTerms } from '/home/user/Mnema/src/noteTools';
import { achievements, weekSummary, bestStreak } from '/home/user/Mnema/src/progress';
import { notificationPlan } from '/home/user/Mnema/src/homework';
import { buildGraph } from './graph_copy';

const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(TIERS);
const ms = (f: () => unknown, n = 3) => {
  const t: number[] = [];
  let r;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    r = f();
    t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  return { first: +t[0].toFixed(1), med: +t[Math.floor(t.length / 2)].toFixed(1), r };
};
const fmt = (x: { med: number }) => x.med;

for (const k of only) {
  const cfg = (TIERS as any)[k];
  const raw = makeData({ ...cfg, exams: Number(process.env.EXAMS ?? 5) });
  const out: Record<string, unknown> = { tier: k, ...cfg };
  const sz = sizeReport(raw);
  out.jsonMB = +(sz.total / 1e6).toFixed(2);
  const json = JSON.stringify(raw);
  out.stringify_ms = fmt(ms(() => JSON.stringify(raw), 3));
  out.parse_ms = fmt(ms(() => JSON.parse(json), 3));
  const data = normalizeData(JSON.parse(json));
  out.normalize_ms = fmt(ms(() => normalizeData(JSON.parse(json)), 2)); // parse + normalize

  // ---- граф ----
  for (const terms of [true, false]) {
    const r = ms(() => buildGraph(data, terms, null), 3);
    const g = r.r as ReturnType<typeof buildGraph>;
    out[`buildGraph_terms${terms}_ms`] = r.med;
    out[`graph_terms${terms}_nodes`] = g.nodes.length;
    out[`graph_terms${terms}_links`] = g.links.length;
  }
  // составные части buildGraph
  out.part_cardsFilterPerTopic_ms = fmt(ms(() => { let s = 0; for (const t of data.topics) s += data.cards.filter((c) => c.topicId === t.id).length; return s; }, 2));
  out.part_topicMasteryAll_ms = fmt(ms(() => { let s = 0; for (const t of data.topics) s += topicMastery(data, t.id).total; return s; }, 2));
  out.part_boldTermsAll_ms = fmt(ms(() => { let s = 0; for (const t of data.topics) s += boldTerms(t.note).length; return s; }, 2));
  // «links.find» из эффекта создания симуляции (каждому новому узлу ищут связь перебором)
  const g1 = buildGraph(data, true, null);
  out.part_linksFindPerNode_ms = fmt(ms(() => { let c = 0; for (const n of g1.nodes) { const l = g1.links.find((l) => l.target === 'x' + n.id || l.source === n.id); if (l) c++; } return c; }, 1));
  // ---- симуляция (как в KnowledgeMap.applyForces) ----
  const simOnce = (nodesN: any[], linksN: any[]) => {
    const nodes = nodesN.map((n) => ({ ...n, x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 30 }));
    const links = linksN.map((l) => ({ ...l }));
    const sim = forceSimulation(nodes).alphaDecay(0.018).velocityDecay(0.32).stop();
    sim.force('charge', forceManyBody<any>().strength((n: any) => (n.kind === 'subject' ? -520 : n.kind === 'topic' ? -200 : -70)).distanceMax(700));
    sim.force('link', forceLink<any, any>(links).id((n: any) => n.id).distance((l: any) => (l.kind === 'st' ? 70 : 46)).strength((l: any) => (l.kind === 'st' ? 0.8 : 0.35)));
    sim.force('collide', forceCollide<any>((n: any) => n.size + 6));
    sim.force('x', forceX(0).strength(0.035));
    sim.force('y', forceY(0).strength(0.035));
    sim.alpha(1);
    // замер первых 30 тиков (самые дорогие — всё в куче) и числа тиков до остановки
    let ticks = 0;
    const t0 = performance.now();
    let tFirst30 = 0;
    while (sim.alpha() > sim.alphaMin() && ticks < 2000) {
      sim.tick();
      ticks++;
      if (ticks === 30) tFirst30 = performance.now() - t0;
    }
    const total = performance.now() - t0;
    return { ticks, total: +total.toFixed(0), msPerTickEarly: +(tFirst30 / Math.min(30, ticks)).toFixed(2), msPerTickAvg: +(total / ticks).toFixed(2) };
  };
  out.sim_terms_true = simOnce(g1.nodes, g1.links);
  const g2 = buildGraph(data, false, null);
  out.sim_terms_false = simOnce(g2.nodes, g2.links);

  // ---- «Сегодня» / очередь ----
  const now = new Date();
  out.allItems_ms = fmt(ms(() => allItems(data), 3));
  out.buildQueue_ms = fmt(ms(() => buildQueue(data, now, {}, () => 0.5), 3));
  // todayCounts без кэша (каждый раз новый data → сбрасывается)
  out.todayCounts_cold_ms = fmt(ms(() => todayCounts({ ...data, cards: [...data.cards] }, new Date(Date.now() + Math.random() * 1e6), {}), 3));
  // после каждого ответа в повторении: states новый → todayCounts пересчитывается
  out.todayCounts_afterAnswer_ms = fmt(ms(() => todayCounts({ ...data, states: { ...data.states } }, new Date(Date.now() + Math.random() * 1e6), {}), 3));
  // предмет с ~T/S темами: счётчик на каждую тему (как SubjectScreen.tsx:144)
  const subj = data.subjects[0];
  const subTopics = data.topics.filter((t) => t.subjectId === subj.id);
  out.subjectScreen_topics = subTopics.length;
  out.subjectScreen_todayCountsPerTopic_ms = fmt(ms(() => { const d = { ...data, states: { ...data.states } }; let s = 0; for (const t of subTopics) { const c = todayCounts(d, now, { topicId: t.id }); s += c.review; } return s; }, 2));
  out.subjectScreen_topicMasteryPerTopic_ms = fmt(ms(() => { let s = 0; for (const t of subTopics) s += topicMastery(data, t.id).total; return s; }, 2));
  // buildQueue для одной темы
  out.buildQueue_oneTopic_ms = fmt(ms(() => buildQueue(data, now, { topicId: subTopics[0].id }, () => 0.5), 5));
  // Сегодня: важные темы (map → slice(0,6) после вычисления для всех)
  const impN = data.topics.filter((t) => t.important).length;
  out.today_importantTopics = impN;
  out.today_importantCounts_ms = fmt(ms(() => { const d = { ...data, states: { ...data.states } }; let s = 0; for (const t of data.topics.filter((t) => t.important)) s += todayCounts(d, now, { topicId: t.id }).review + topicMastery(d, t.id).total; return s; }, 2));

  // ---- Сад: beds useMemo ----
  out.garden_beds_ms = fmt(ms(() => {
    const q = buildQueue(data, now, {}, () => 0.5);
    const due = new Map<string, number>();
    for (const it of q) if (!it.isNew) due.set(it.topicId, (due.get(it.topicId) ?? 0) + 1);
    let n = 0;
    return sortedSubjects(data).map((s) => {
      const walk = (parent?: string) => {
        for (const t of childTopics(data, s.id, parent)) { topicMastery(data, t.id); n++; walk(t.id); }
      };
      walk();
      return n;
    });
  }, 2));

  // ---- Левая панель: childTopics для каждой строки (Sidebar.renderTopic вызывает childTopics для КАЖДОЙ темы, даже в свёрнутых) ----
  out.sidebar_childTopics_allRows_ms = fmt(ms(() => { let n = 0; for (const s of sortedSubjects(data)) { const walk = (id?: string) => { for (const t of childTopics(data, s.id, id)) { n++; walk(t.id); } }; walk(); } return n; }, 3));
  out.sidebar_topicWithDescendants_ms = fmt(ms(() => topicWithDescendants(data, data.topics[0].id), 20));

  // ---- Статистика («Цифры») ----
  out.stats_numbers_ms = fmt(ms(() => {
    const hour = data.settings.dayStartHour;
    const n = new Date();
    const since = dayStart(n, hour).getTime() - 3649 * DAY;
    const logs = data.logs.filter((l) => new Date(l.at).getTime() >= since);
    const perDay = new Map<string, number>();
    for (const l of data.logs) { const kk = dayKey(new Date(l.at), hour); perDay.set(kk, (perDay.get(kk) ?? 0) + 1); }
    const byTopic = new Map<string, { total: number; ok: number }>();
    for (const l of logs) { const x = byTopic.get(l.topicId) ?? { total: 0, ok: 0 }; x.total++; byTopic.set(l.topicId, x); }
    const weak = [...byTopic.entries()].map(([id]) => data.topics.find((t) => t.id === id));
    const fc = forecast(data, n, 14);
    const learned = Object.values(data.states).filter((s) => s.state === 2).length;
    return [logs.length, perDay.size, weak.length, fc.length, learned];
  }, 3));
  out.stats_weekSummary_ms = fmt(ms(() => weekSummary(data, new Date(), 1), 3));
  out.streak_ms = fmt(ms(() => streak(data, new Date()), 3));
  out.achievements_ms = fmt(ms(() => achievements(data, new Date()), 3));
  out.bestStreak_ms = fmt(ms(() => bestStreak(data), 3));
  out.notificationPlan_ms = fmt(ms(() => JSON.stringify(notificationPlan(data, new Date(), false)), 3));

  // ---- commit-пути ----
  const key = Object.keys(data.states)[0];
  out.recordReview_spread_ms = fmt(ms(() => { const st = { ...data.states, [key]: data.states[key] }; const lg = [...data.logs, data.logs[0]]; return st && lg; }, 5));
  out.updateTopic_map_ms = fmt(ms(() => data.topics.map((t) => (t.id === data.topics[5].id ? { ...t, important: true } : t)), 5));
  out.updateCard_statesCopy_ms = fmt(ms(() => { const states = { ...data.states }; for (const kk of Object.keys(states)) if (kk.startsWith('abc:')) delete states[kk]; return states; }, 3));
  out.removeCards_ms = fmt(ms(() => { const ids = new Set([data.cards[3].id]); const states = { ...data.states }; for (const kk of Object.keys(states)) if (ids.has(kk.split(':')[0])) delete states[kk]; return [states, data.cards.filter((c) => !ids.has(c.id)), data.logs.filter((l) => !ids.has(l.cardId))]; }, 3));

  console.log(JSON.stringify(out, null, 0));
}
