// Карта знаний в духе графа Obsidian: живая физика, узлы можно таскать, плавный зум,
// подсветка соседей. Предметы → темы → подтемы → главные понятия (жирное в конспектах).
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { useEffect, useMemo, useRef, useState } from 'react';
import { boldTerms } from '../noteTools';
import { firstLinks, getLayout, layoutKey, needsOneSubject, physicsPlan, putLayout, termsVerdict, type Layout } from '../mapLod';
import { cardsByTopic, normalizeAnswer, topicMasteryByTopic, topicStatus, type TopicStatus } from '../srs';
import { updateSettings } from '../store';
import type { AppData, GraphSettings, Topic } from '../types';
import { Icon, Segmented, Switch, usePresence } from './ui';
import '../map-lod.css';

interface MapNode extends SimulationNodeDatum {
  id: string;
  kind: 'subject' | 'topic' | 'term';
  label: string;
  color: string;
  size: number; // базовый радиус
  status?: TopicStatus;
  important?: boolean;
  topicId?: string;
  degree: number;
  lone?: boolean; // предмет, свёрнутый в кружок (когда тем слишком много): нажатие открывает его целиком
}
type MapLink = SimulationLinkDatum<MapNode> & { kind: 'st' | 'tt' | 'tk' };

const termKey = (t: string) =>
  normalizeAnswer(t)
    .split(/\s+/)
    .map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w))
    .join(' ');

// Жирное в конспекте разбираем один раз на тему: объект темы заменяется при правке, так что кэш не устаревает.
const termCache = new WeakMap<Topic, string[]>();
function termsOf(t: Topic): string[] {
  let r = termCache.get(t);
  if (!r) {
    r = boldTerms(t.note);
    termCache.set(t, r);
  }
  return r;
}

/** extraTerms — сколько одиночных «понятий» не попало в карту (их показывает allTerms). */
export function buildGraph(data: AppData, allTerms: boolean, subjectFilter: string | null) {
  const nodes: MapNode[] = [];
  const links: MapLink[] = [];
  const subjects = data.subjects.filter((s) => !subjectFilter || s.id === subjectFilter);
  const subjectSet = new Set(subjects.map((s) => s.id));
  const subjectById = new Map(data.subjects.map((s) => [s.id, s]));
  const scoped = data.topics.filter((t) => subjectSet.has(t.subjectId));
  const topicIds = new Set(scoped.map((t) => t.id));
  // Карточки и освоение всех тем — одним проходом, а не заново на каждую тему.
  const cardsOf = cardsByTopic(data);
  const mastery = topicMasteryByTopic(data, topicIds);
  const termTopics = new Map<string, { label: string; topics: Set<string> }>();
  for (const s of subjects) nodes.push({ id: 's:' + s.id, kind: 'subject', label: s.name, color: s.color, size: 11, degree: 0 });
  for (const t of scoped) {
    const subj = subjectById.get(t.subjectId)!;
    const cards = cardsOf.get(t.id)?.length ?? 0;
    nodes.push({
      id: 't:' + t.id,
      kind: 'topic',
      label: t.name,
      color: subj.color,
      size: 6 + Math.min(5, Math.sqrt(cards) * 1.2),
      status: topicStatus(mastery.get(t.id)!),
      important: t.important,
      topicId: t.id,
      degree: 0
    });
    const parent = t.parentId && topicIds.has(t.parentId) ? 't:' + t.parentId : 's:' + t.subjectId;
    links.push({ source: parent, target: 't:' + t.id, kind: 'st' });
    for (const term of termsOf(t)) {
      if (term.length > 40) continue;
      const k = termKey(term);
      const e = termTopics.get(k) ?? { label: term, topics: new Set<string>() };
      e.topics.add(t.id);
      termTopics.set(k, e);
    }
  }
  let extraTerms = 0;
  for (const [k, e] of termTopics) {
    const shared = e.topics.size > 1;
    if (!shared && !allTerms) {
      extraTerms++;
      continue;
    }
    nodes.push({ id: 'k:' + k, kind: 'term', label: e.label, color: shared ? '#C9A227' : '#8A8F9C', size: shared ? 4.5 : 3.2, degree: 0 });
    for (const tid of e.topics) links.push({ source: 't:' + tid, target: 'k:' + k, kind: shared ? 'tt' : 'tk' });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const l of links) {
    byId.get(l.source as string)!.degree++;
    byId.get(l.target as string)!.degree++;
  }
  return { nodes, links, extraTerms };
}

export interface GraphPlan {
  graph: ReturnType<typeof buildGraph>;
  termsHidden: boolean; // «понятия» скрыты из-за размера карты (настройка пользователя не тронута)
  canForce: boolean; // можно показать их всё равно
  shown: string | null; // имя предмета, если показан только он, а остальные — кружками
}

/**
 * Что рисовать: автоматический уровень детализации. Много узлов — прячем «понятия»; ещё больше — один предмет
 * (выбранный или первый с темами), остальные — кружками. Настройку showTerms в данных не трогаем.
 */
export function planGraph(data: AppData, showTerms: boolean, filter: string | null, forced: boolean): GraphPlan {
  let scope = filter;
  let base = buildGraph(data, false, scope);
  let lone: AppData['subjects'] = [];
  let shown: AppData['subjects'][number] | undefined;
  if (needsOneSubject(base.nodes.length, data.subjects.length, filter !== null)) {
    shown = data.subjects.find((s) => data.topics.some((t) => t.subjectId === s.id)) ?? data.subjects[0];
    lone = data.subjects.filter((s) => s !== shown);
    scope = shown.id;
    base = buildGraph(data, false, scope);
  }
  const v = termsVerdict(showTerms, base.nodes.length + base.extraTerms + lone.length, forced);
  const graph = v.show ? buildGraph(data, true, scope) : base;
  for (const s of lone) graph.nodes.push({ id: 's:' + s.id, kind: 'subject', label: s.name, color: s.color, size: 11, degree: 0, lone: true });
  return { graph, termsHidden: v.hidden, canForce: v.canForce, shown: shown?.name ?? null };
}

function statusColor(s: TopicStatus | undefined, css: Record<string, string>) {
  if (s === 'weak') return css.again;
  if (s === 'progress') return css.hard;
  if (s === 'learned') return css.good;
  return '';
}

/** Названия через запятую; на большой карте — первые 12 и «и ещё N» (иначе под картой вырастает огромный абзац). */
function namesList(nodes: { label: string }[], max = 12) {
  const shown = nodes.slice(0, max).map((n) => n.label).join(', ');
  return nodes.length > max ? `${shown} и ещё ${nodes.length - max}` : shown;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function KnowledgeMap({ data, onOpenTopic }: { data: AppData; onOpenTopic: (id: string) => void }) {
  if (data.topics.length === 0)
    return (
      <div className="empty map-empty">
        <Icon name="map" size={40} />
        <strong>Карта пока пустая</strong>
        <span>Здесь появится карта, когда будут темы. Предметы, темы и главные понятия (то, что выделено жирным в конспектах) соединятся линиями — и будет видно, что с чем связано.</span>
      </div>
    );
  return <KnowledgeGraph data={data} onOpenTopic={onOpenTopic} />;
}

function KnowledgeGraph({ data, onOpenTopic }: { data: AppData; onOpenTopic: (id: string) => void }) {
  const gs = data.settings.graph;
  const [filter, setFilter] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [query, setQuery] = useState('');
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [forced, setForced] = useState(false); // «Все понятия» нажато на большой карте: показать, хоть и тяжело
  const panelPres = usePresence(panel, 150);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const plan = useMemo(
    () => planGraph(data, gs.showTerms, filter, forced),
    [data.topics, data.subjects, data.cards, data.states, gs.showTerms, filter, forced] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const graph = plan.graph;
  const pick = (f: string | null) => {
    setFilter(f);
    setForced(false);
  };

  // Всё, что меняется каждый кадр, живёт в ref — React не перерисовывается.
  const st = useRef({
    sim: null as Simulation<MapNode, MapLink> | null,
    nodes: [] as MapNode[],
    links: [] as MapLink[],
    neighbors: new Map<string, Set<string>>(),
    cam: { x: 0, y: 0, k: 1 },
    target: { x: 0, y: 0, k: 1 },
    autoFit: true,
    hover: null as MapNode | null,
    focus: null as MapNode | null, // что подсвечено (держится, пока гаснет)
    fade: 0,
    alpha: new Map<string, number>(), // плавная прозрачность узлов
    drag: null as null | { node?: MapNode; sx: number; sy: number; cx: number; cy: number; moved: boolean },
    raf: 0,
    running: false,
    w: 800,
    h: 500,
    css: {} as Record<string, string>,
    positions: new Map<string, { x: number; y: number; vx: number; vy: number }>(),
    gs,
    query: '',
    appear: 1,
    phys: physicsPlan(0), // сколько шагов физики и «живая» ли она — зависит от числа узлов
    ticks: 0, // шагов с последнего нагрева
    settled: false, // раскладка остыла (её можно запомнить)
    sig: '' // с какими настройками физики считали последний раз
  });
  const S = st.current;
  S.gs = gs;
  S.query = query.trim().toLowerCase();

  function readCss() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    S.css = { ink: v('--ink'), muted: v('--muted'), line: v('--line-2'), surface: v('--surface'), accent: v('--accent'), again: v('--again-ink'), hard: v('--hard-ink'), good: v('--good-ink'), body: v('--body') || 'sans-serif' };
  }

  /** Физика закончилась: раскладку запоминаем, больше шагов не будет, пока не нагреют снова. */
  function settle() {
    S.settled = true;
    saveLayout();
  }

  /** Нагреть физику: считаем заново не больше phys.maxTicks шагов (у больших карт — меньше). */
  function heat(a: number) {
    if (!S.sim) return;
    S.sim.alpha(a);
    S.ticks = 0;
    S.settled = false;
  }

  const layoutParams = () => [S.gs.repel, S.gs.linkDistance, S.gs.nodeSize];
  const idOf = (x: string | number | MapNode) => (typeof x === 'object' ? x.id : String(x));
  /** Запомнить раскладку в памяти окна: повторное открытие карты не пересчитывает физику. */
  function saveLayout() {
    if (!S.nodes.length) return;
    const pos: Layout = new Map();
    for (const n of S.nodes) pos.set(n.id, [n.x ?? 0, n.y ?? 0]);
    putLayout(
      layoutKey(
        S.nodes.map((n) => n.id),
        S.links.map((l) => [idOf(l.source), idOf(l.target)] as [string, string]),
        layoutParams()
      ),
      pos,
      S.settled
    );
  }

  function applyForces() {
    const sim = S.sim;
    if (!sim) return;
    const g = S.gs;
    sim.force('charge', forceManyBody<MapNode>().strength((n) => (n.kind === 'subject' ? -520 : n.kind === 'topic' ? -200 : -70) * g.repel).distanceMax(700));
    sim.force(
      'link',
      forceLink<MapNode, MapLink>(S.links)
        .id((n) => n.id)
        .distance((l) => (l.kind === 'st' ? 70 : 46) * g.linkDistance)
        .strength((l) => (l.kind === 'st' ? 0.8 : 0.35))
    );
    sim.force('collide', forceCollide<MapNode>((n) => n.size * g.nodeSize + 6));
    sim.force('x', forceX(0).strength(0.035));
    sim.force('y', forceY(0).strength(0.035));
  }

  // Новая симуляция при смене графа; позиции знакомых узлов сохраняются.
  useEffect(() => {
    const old = S.positions;
    for (const n of S.nodes) old.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, vx: n.vx ?? 0, vy: n.vy ?? 0 });
    const nodes = graph.nodes.map((n) => ({ ...n }));
    const fresh = S.nodes.length === 0;
    const phys = physicsPlan(nodes.length);
    // Раскладка этой же карты уже считалась (и успокоилась) — берём её и физику не гоняем.
    const cached = getLayout(
      layoutKey(
        graph.nodes.map((n) => n.id),
        graph.links.map((l) => [l.source as string, l.target as string] as [string, string]),
        layoutParams()
      )
    );
    // Первая связь каждого узла — один проход вместо поиска перебором на каждый новый узел.
    const firstLink = cached ? new Map<string, MapLink>() : firstLinks(graph.links);
    for (const n of nodes) {
      const c = cached?.pos.get(n.id);
      const p = old.get(n.id);
      if (c) {
        n.x = c[0];
        n.y = c[1];
        n.vx = 0;
        n.vy = 0;
      } else if (p) Object.assign(n, p);
      else {
        // Новые узлы появляются рядом с соседом (или в центре) — и «разлетаются».
        const link = firstLink.get(n.id);
        const other = link ? old.get((link.source === n.id ? link.target : link.source) as string) : undefined;
        n.x = (other?.x ?? 0) + (Math.random() - 0.5) * 30;
        n.y = (other?.y ?? 0) + (Math.random() - 0.5) * 30;
      }
    }
    const links = graph.links.map((l) => ({ ...l }));
    const neighbors = new Map<string, Set<string>>();
    for (const l of links) {
      const a = l.source as string;
      const b = l.target as string;
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
    S.sim?.stop();
    S.nodes = nodes;
    S.links = links;
    S.neighbors = neighbors;
    S.phys = phys;
    S.sim = forceSimulation<MapNode>(nodes).alphaDecay(phys.alphaDecay).velocityDecay(0.32).stop();
    applyForces();
    S.sig = layoutParams().join(',');
    if (cached?.done) {
      S.sim.alpha(0);
      S.ticks = 0;
      S.settled = true;
    } else heat(cached ? (fresh ? 0.6 : 0.4) : fresh ? 1 : 0.5);
    if (fresh) S.appear = 0;
    kick();
    return () => {
      saveLayout();
      S.sim?.stop();
    };
  }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!S.sim || S.sig === layoutParams().join(',')) return; // при открытии карты ничего не пересчитываем
    S.sig = layoutParams().join(',');
    applyForces();
    heat(Math.max(S.sim.alpha(), 0.4));
    kick();
  }, [gs.repel, gs.linkDistance, gs.nodeSize]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => kick(), [gs.labels, query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Размер холста и тема.
  useEffect(() => {
    const box = boxRef.current!;
    const ro = new ResizeObserver(() => {
      const r = box.getBoundingClientRect();
      S.w = r.width;
      S.h = r.height;
      const c = canvasRef.current!;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      kick();
    });
    ro.observe(box);
    const mo = new MutationObserver(() => {
      readCss();
      kick();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    readCss();
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(S.raf);
      S.running = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function kick() {
    if (S.running) return;
    S.running = true;
    S.raf = requestAnimationFrame(frame);
  }

  function bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; // prettier-ignore
    for (const n of S.nodes) {
      x0 = Math.min(x0, n.x!);
      y0 = Math.min(y0, n.y!);
      x1 = Math.max(x1, n.x!);
      y1 = Math.max(y1, n.y!);
    }
    return { x0, y0, x1, y1 };
  }

  function fitTarget() {
    if (!S.nodes.length) return;
    const b = bounds();
    const pad = 70;
    const k = Math.min(2, Math.max(0.2, Math.min(S.w / (b.x1 - b.x0 + pad * 2), S.h / (b.y1 - b.y0 + pad * 2))));
    S.target = { k, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  }

  function frame() {
    const sim = S.sim;
    let busy = false;
    if (sim && sim.alpha() > sim.alphaMin()) {
      // У больших карт число шагов ограничено: остыла (или шаги кончились) — физика останавливается совсем.
      if (S.phys.live || S.ticks < S.phys.maxTicks) {
        sim.tick();
        S.ticks++;
        busy = true;
      } else {
        sim.alpha(0);
        settle();
      }
    } else if (sim && !S.settled && !S.drag?.node) settle();
    if (S.appear < 1) {
      S.appear = Math.min(1, S.appear + 0.025);
      busy = true;
    }
    if (S.autoFit) fitTarget();
    const c = S.cam;
    const t = S.target;
    c.x = lerp(c.x, t.x, 0.18);
    c.y = lerp(c.y, t.y, 0.18);
    c.k = lerp(c.k, t.k, 0.18);
    if (Math.abs(c.k - t.k) > 0.0005 || Math.abs(c.x - t.x) > 0.05 || Math.abs(c.y - t.y) > 0.05) busy = true;
    // Подсветка: плавно появляется и гаснет.
    const wantFade = S.hover || S.drag?.node ? 1 : 0;
    if (S.hover || S.drag?.node) S.focus = S.drag?.node ?? S.hover;
    S.fade = lerp(S.fade, wantFade, 0.2);
    if (Math.abs(S.fade - wantFade) > 0.01) busy = true;
    else if (!wantFade) S.focus = null;
    busy = draw() || busy;
    if (busy || S.drag) S.raf = requestAnimationFrame(frame);
    else S.running = false;
  }

  function toScreen(x: number, y: number): [number, number] {
    const c = S.cam;
    return [(x - c.x) * c.k + S.w / 2, (y - c.y) * c.k + S.h / 2];
  }
  function toWorld(sx: number, sy: number): [number, number] {
    const c = S.cam;
    return [(sx - S.w / 2) / c.k + c.x, (sy - S.h / 2) / c.k + c.y];
  }

  /** Рисует кадр; true — если ещё идут переходы прозрачности. */
  function draw(): boolean {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S.w, S.h);
    const css = S.css;
    const k = S.cam.k;
    const g = S.gs;
    const focus = S.focus;
    const lit = focus ? new Set([focus.id, ...(S.neighbors.get(focus.id) ?? [])]) : null;
    const q = S.query;
    const matchQ = (n: MapNode) => !q || n.label.toLowerCase().includes(q);
    let moving = false;

    // Плавная прозрачность каждого узла.
    const alphaOf = (n: MapNode) => {
      let want = 1;
      if (lit) want = lit.has(n.id) ? 1 : lerp(1, 0.12, S.fade);
      if (q && !matchQ(n)) want = Math.min(want, 0.15);
      const cur = S.alpha.get(n.id) ?? want;
      const next = lerp(cur, want, 0.25);
      if (Math.abs(next - want) > 0.005) moving = true;
      S.alpha.set(n.id, next);
      return next * S.appear;
    };
    const alpha = new Map(S.nodes.map((n) => [n.id, alphaOf(n)]));

    // Связи.
    ctx.lineCap = 'round';
    for (const l of S.links) {
      const a = l.source as MapNode;
      const b = l.target as MapNode;
      const hot = lit && focus && (a.id === focus.id || b.id === focus.id);
      const al = Math.min(alpha.get(a.id)!, alpha.get(b.id)!);
      const [x1, y1] = toScreen(a.x!, a.y!);
      const [x2, y2] = toScreen(b.x!, b.y!);
      ctx.globalAlpha = hot ? lerp(0.5, 0.95, S.fade) : 0.5 * al;
      ctx.strokeStyle = hot ? css.accent : css.line;
      ctx.lineWidth = (l.kind === 'st' ? 1.4 : 1) * Math.max(0.6, Math.min(1.6, k)) * (hot ? 1.5 : 1);
      if (l.kind === 'tk') ctx.setLineDash([2 * k, 4 * k]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Узлы.
    for (const n of S.nodes) {
      const [x, y] = toScreen(n.x!, n.y!);
      const al = alpha.get(n.id)!;
      const hovered = focus?.id === n.id;
      const r = n.size * g.nodeSize * Math.max(0.55, Math.min(2.2, k)) * (hovered ? lerp(1, 1.25, S.fade) : 1) * (0.4 + 0.6 * S.appear);
      ctx.globalAlpha = al;
      if (n.kind === 'topic') {
        const sc = statusColor(n.status, css);
        if (sc) {
          ctx.beginPath();
          ctx.arc(x, y, r + 3.2, 0, Math.PI * 2);
          ctx.strokeStyle = sc;
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }
        if (n.important) {
          ctx.beginPath();
          ctx.arc(x, y, r + 6.5, 0, Math.PI * 2);
          ctx.strokeStyle = '#E0A100';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.kind === 'term' ? n.color : n.color;
      ctx.fill();
      if (hovered) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = css.surface;
        ctx.stroke();
      }
    }

    // Подписи: при приближении, у подсвеченных и найденных.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const n of S.nodes) {
      const base = alpha.get(n.id)!;
      let la: number;
      if (g.labels === 'never') la = 0;
      else if (g.labels === 'always') la = 1;
      else la = n.kind === 'subject' ? 1 : n.kind === 'topic' ? clamp01((k - 0.55) / 0.35) : clamp01((k - 1.05) / 0.35);
      if (lit?.has(n.id) && S.fade > 0.05) la = Math.max(la, S.fade);
      if (q && matchQ(n)) la = 1;
      la *= base;
      if (la < 0.03) continue;
      const [x, y] = toScreen(n.x!, n.y!);
      const r = n.size * g.nodeSize * Math.max(0.55, Math.min(2.2, k));
      const fs = n.kind === 'subject' ? 14 : n.kind === 'topic' ? 12.5 : 11;
      ctx.font = `${n.kind === 'subject' ? 700 : n.kind === 'topic' ? 500 : 400} ${fs}px ${css.body}`;
      const text = n.label.length > 32 ? n.label.slice(0, 31) + '…' : n.label;
      ctx.globalAlpha = la;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = css.surface;
      ctx.strokeText(text, x, y + r + 5);
      ctx.fillStyle = n.kind === 'term' ? css.muted : css.ink;
      ctx.fillText(text, x, y + r + 5);
    }
    ctx.globalAlpha = 1;
    return moving;
  }

  function nodeAt(sx: number, sy: number): MapNode | null {
    const [wx, wy] = toWorld(sx, sy);
    let best: MapNode | null = null;
    let bestD = Infinity;
    for (const n of S.nodes) {
      const d = Math.hypot(n.x! - wx, n.y! - wy);
      const r = (n.size * S.gs.nodeSize * Math.max(0.55, Math.min(2.2, S.cam.k))) / S.cam.k + 5 / S.cam.k;
      if (d < r && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  function local(e: React.PointerEvent | React.WheelEvent | React.MouseEvent): [number, number] {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // Пальцы на экране: двумя — приблизить/отдалить и сдвинуть (как в картах).
  const fingers = useRef(new Map<number, [number, number]>()).current;
  const pinch = useRef<{ d0: number; k0: number; wx: number; wy: number } | null>(null);
  function startPinch() {
    const [[ax, ay], [bx, by]] = [...fingers.values()];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const t = S.target;
    pinch.current = { d0: Math.max(10, Math.hypot(ax - bx, ay - by)), k0: t.k, wx: (mx - S.w / 2) / t.k + t.x, wy: (my - S.h / 2) / t.k + t.y };
    // Второй палец — это уже не перетаскивание узла и не нажатие на тему.
    if (S.drag?.node) {
      S.drag.node.fx = null;
      S.drag.node.fy = null;
      S.sim?.alphaTarget(0);
    }
    S.drag = null;
    S.autoFit = false;
  }
  function movePinch() {
    const p = pinch.current;
    if (!p || fingers.size < 2) return;
    const [[ax, ay], [bx, by]] = [...fingers.values()];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const k2 = Math.min(5, Math.max(0.15, (p.k0 * Math.hypot(ax - bx, ay - by)) / p.d0));
    // Точка между пальцами остаётся под пальцами.
    S.target = { k: k2, x: p.wx - (mx - S.w / 2) / k2, y: p.wy - (my - S.h / 2) / k2 };
    S.cam = { ...S.target };
    kick();
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const [sx, sy] = local(e);
    if (e.pointerType === 'touch') {
      fingers.set(e.pointerId, [sx, sy]);
      if (fingers.size >= 2) {
        startPinch();
        return;
      }
    }
    const node = nodeAt(sx, sy) ?? undefined;
    S.drag = { node, sx, sy, cx: S.target.x, cy: S.target.y, moved: false };
    if (node) {
      const [wx, wy] = toWorld(sx, sy);
      node.fx = wx;
      node.fy = wy;
      if (S.phys.live) S.sim?.alphaTarget(0.25).restart().stop(); // у больших карт физику не будим: узел просто двигается
    }
    kick();
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const [sx, sy] = local(e);
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, [sx, sy]);
    if (pinch.current) return movePinch();
    const d = S.drag;
    if (d) {
      if (Math.hypot(sx - d.sx, sy - d.sy) > 3) d.moved = true;
      if (d.node) {
        const [wx, wy] = toWorld(sx, sy);
        d.node.fx = wx;
        d.node.fy = wy;
        d.node.x = wx; // если физика уже остановилась, шагов нет — узел двигаем сами
        d.node.y = wy;
        if (S.phys.live && S.sim && S.sim.alpha() < 0.25) heat(0.25);
      } else if (d.moved) {
        S.autoFit = false;
        S.target.x = d.cx - (sx - d.sx) / S.cam.k;
        S.target.y = d.cy - (sy - d.sy) / S.cam.k;
        S.cam.x = S.target.x;
        S.cam.y = S.target.y;
      }
      kick();
      return;
    }
    const n = nodeAt(sx, sy);
    if (n !== S.hover) {
      S.hover = n;
      setHoverLabel(n ? (n.kind === 'topic' ? 'Открыть тему' : n.kind === 'subject' ? 'Предмет' : 'Понятие') : null);
      e.currentTarget.style.cursor = n ? (n.kind === 'topic' || n.lone ? 'pointer' : 'grab') : 'default';
      kick();
    }
  }
  function onUp(e?: React.PointerEvent<HTMLCanvasElement>) {
    if (e) fingers.delete(e.pointerId);
    if (pinch.current) {
      // Убрали один палец — масштаб закончен; оставшийся палец не считается нажатием.
      // Было три пальца, стало два — щипок продолжается с новой парой (без скачка).
      if (fingers.size >= 2) startPinch();
      else pinch.current = null;
      S.drag = null;
      return;
    }
    const d = S.drag;
    S.drag = null;
    if (d?.node) {
      d.node.fx = null;
      d.node.fy = null;
      S.sim?.alphaTarget(0);
      if (!d.moved && d.node.kind === 'topic') onOpenTopic(d.node.topicId!);
      else if (!d.moved && d.node.lone) pick(d.node.id.slice(2)); // предмет-кружок: показать его целиком
      if (d.moved) {
        S.autoFit = false;
        if (S.settled) saveLayout(); // перетащил на остывшей карте — запомнить
      }
    }
    kick();
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault(); // иначе вместе с масштабом прокручивается вся страница
    const r = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    S.autoFit = false;
    const t = S.target;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
    const k2 = Math.min(5, Math.max(0.15, t.k * factor));
    // Точка под курсором остаётся на месте.
    const wx = (sx - S.w / 2) / t.k + t.x;
    const wy = (sy - S.h / 2) / t.k + t.y;
    S.target = { k: k2, x: wx - (sx - S.w / 2) / k2, y: wy - (sy - S.h / 2) / k2 };
    kick();
  }
  // Колесо слушаем напрямую: у React оно «пассивное», и страницу не остановить.
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    c.addEventListener('wheel', h, { passive: false });
    return () => c.removeEventListener('wheel', h);
  }, [data.topics.length === 0]);
  function zoomBy(f: number) {
    S.autoFit = false;
    S.target = { ...S.target, k: Math.min(5, Math.max(0.15, S.target.k * f)) };
    kick();
  }
  function fit() {
    S.autoFit = true;
    kick();
    setTimeout(() => (S.autoFit = false), 600);
  }
  function shake() {
    for (const n of S.nodes) {
      n.vx = (Math.random() - 0.5) * 40;
      n.vy = (Math.random() - 0.5) * 40;
    }
    heat(0.9);
    kick();
  }
  function replay() {
    for (const n of S.nodes) {
      n.x = (Math.random() - 0.5) * 20;
      n.y = (Math.random() - 0.5) * 20;
      n.vx = 0;
      n.vy = 0;
    }
    S.appear = 0;
    S.autoFit = true;
    heat(1);
    kick();
    setTimeout(() => (S.autoFit = false), 2500);
  }
  const setG = (patch: Partial<GraphSettings>) => updateSettings({ graph: { ...gs, ...patch } });

  const weak = graph.nodes.filter((n) => n.kind === 'topic' && n.status === 'weak');
  const important = graph.nodes.filter((n) => n.kind === 'topic' && n.important);


  return (
    <div className="stack gap12">
      <div className="row gap8 wrap">
        <button className={'chip-btn neutral' + (filter === null ? ' on' : '')} onClick={() => pick(null)}>
          Все предметы
        </button>
        {data.subjects.map((s) => (
          <button key={s.id} className={'chip-btn neutral' + (filter === s.id ? ' on' : '')} onClick={() => pick(filter === s.id ? null : s.id)}>
            <span className="dot" style={{ background: s.color }} /> {s.name}
          </button>
        ))}
      </div>
      <div className="map-box graph" ref={boxRef}>
        <canvas
          ref={canvasRef}
          className="map-canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => {
            if (!S.drag && S.hover) {
              S.hover = null;
              setHoverLabel(null);
              kick();
            }
          }}
          onDoubleClick={(e) => {
            const [sx, sy] = local(e);
            if (!nodeAt(sx, sy)) fit();
          }}
          role="img"
          aria-label="Карта знаний: предметы, темы и понятия"
        />
        <div className="graph-search">
          <input className="input tiny" placeholder="Найти на карте" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Найти на карте" />
        </div>
        <div className="graph-tools">
          <button className="icon-btn small" aria-label="Приблизить" title="Приблизить" onClick={() => zoomBy(1.35)}>
            <Icon name="plus" size={18} />
          </button>
          <button className="icon-btn small" aria-label="Отдалить" title="Отдалить" onClick={() => zoomBy(1 / 1.35)}>
            <span className="minus">−</span>
          </button>
          <button className="icon-btn small" aria-label="Показать всё" title="Показать всё (двойной щелчок по пустому месту)" onClick={fit}>
            <Icon name="expand" size={18} />
          </button>
          <button className={'icon-btn small' + (panel ? ' on' : '')} aria-label="Настройки карты" title="Настройки карты" aria-expanded={panel} onClick={() => setPanel(!panel)}>
            <Icon name="sliders" size={18} />
          </button>
        </div>
        {(plan.shown || plan.termsHidden) && (
          <div className="map-lod-note" role="status">
            {plan.shown
              ? `Тем очень много — показан предмет «${plan.shown}», остальные — кружками. Нажми на кружок.${plan.termsHidden ? ' Термины скрыты.' : ''}`
              : filter !== null
                ? plan.canForce
                  ? 'Тем много — термины скрыты. Включи «Все понятия», если они нужны.'
                  : 'Тем в предмете очень много — термины скрыты.'
                : plan.canForce
                  ? 'Тем много — термины скрыты. Выбери предмет или включи «Все понятия».'
                  : 'Тем много — термины скрыты. Выбери предмет.'}
          </div>
        )}
        {panelPres.mounted && (
          <div className={'graph-panel' + (panelPres.closing ? ' closing' : '')}>
            <strong>Карта</strong>
            <label className="gp-row">
              <span>Отталкивание</span>
              <input type="range" min={0.3} max={2.5} step={0.05} value={gs.repel} onChange={(e) => setG({ repel: Number(e.target.value) })} />
            </label>
            <label className="gp-row">
              <span>Длина связей</span>
              <input type="range" min={0.5} max={2.5} step={0.05} value={gs.linkDistance} onChange={(e) => setG({ linkDistance: Number(e.target.value) })} />
            </label>
            <label className="gp-row">
              <span>Размер кружков</span>
              <input type="range" min={0.5} max={2} step={0.05} value={gs.nodeSize} onChange={(e) => setG({ nodeSize: Number(e.target.value) })} />
            </label>
            <div className="gp-row">
              <span>Подписи</span>
              <Segmented
                ariaLabel="Подписи"
                value={gs.labels}
                onChange={(v) => setG({ labels: v })}
                options={[
                  { value: 'auto', label: 'Авто' },
                  { value: 'always', label: 'Все' },
                  { value: 'never', label: 'Нет' }
                ]}
              />
            </div>
            <div className={'gp-row' + (plan.termsHidden && !plan.canForce ? ' map-lod-off' : '')}>
              <span>Все понятия из конспектов</span>
              <Switch
                label="Все понятия"
                checked={gs.showTerms && !plan.termsHidden}
                onChange={(v) => {
                  // Карта большая и понятия скрыты сами: «включить» = показать всё равно (настройка в данных уже включена).
                  if (v && plan.termsHidden) setForced(true);
                  else {
                    setForced(false);
                    setG({ showTerms: v });
                  }
                }}
              />
            </div>
            <div className="row gap8">
              <button className="btn small" onClick={shake}>
                Встряхнуть
              </button>
              <button className="btn small" onClick={replay}>
                Собрать заново
              </button>
              <button className="btn small ghost" onClick={() => setG({ repel: 1, linkDistance: 1, nodeSize: 1, labels: 'auto' })}>
                Сбросить
              </button>
            </div>
          </div>
        )}
        {hoverLabel === 'Открыть тему' && <div className="graph-hint">Нажми — откроется тема. Потяни — сдвинешь.</div>}
      </div>
      <div className="row gap16 wrap small muted">
        <span className="row gap6">
          <span className="legend-ring" style={{ borderColor: 'var(--good-ink)' }} /> выучено
        </span>
        <span className="row gap6">
          <span className="legend-ring" style={{ borderColor: 'var(--hard-ink)' }} /> в процессе
        </span>
        <span className="row gap6">
          <span className="legend-ring" style={{ borderColor: 'var(--again-ink)' }} /> слабое место
        </span>
        <span className="row gap6">
          <span className="legend-ring" style={{ borderColor: '#E0A100', borderWidth: 2 }} /> важная тема
        </span>
        <span className="row gap6">
          <span className="term-legend" style={{ background: '#C9A227' }} /> общее понятие — связывает темы
        </span>
        <span>Колесо — масштаб, перетаскивание — двигать.</span>
      </div>
      {weak.length > 0 && <div className="hint warn">Слабые места: {namesList(weak)}. Здесь карточки забываются снова и снова — перечитай конспект и перепиши трудные карточки своими словами.</div>}
      {important.length > 0 && weak.length === 0 && <p className="small muted">Важные темы обведены золотым: {namesList(important)}.</p>}
    </div>
  );
}
