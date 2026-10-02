// Интервальные повторения на FSRS (ts-fsrs) и всё, что связано с «элементами» карточек.
import { createEmptyCard, fsrs, Rating, type Card as FCard, type Grade } from 'ts-fsrs';
import { instantiate } from './problems';
import type { AppData, Card, ItemState, Settings } from './types';
import { examsOf } from './examList';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// ---------- Пропуски (cloze) ----------

export interface ClozePart {
  text: string;
  cloze?: { index: number; answer: string; hint?: string };
}

/**
 * Разбирает текст с пропусками {{ответ}} или {{ответ::подсказка}}.
 * Поддерживается и запись Anki {{c1::ответ::подсказка}}: пропуски с одинаковым номером
 * прячутся вместе (одна карточка на номер).
 */
export function parseCloze(text: string): ClozePart[] {
  const parts: ClozePart[] = [];
  const re = /\{\{(.+?)\}\}/g;
  const groups: string[] = [];
  let last = 0;
  let plain = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    let body = m[1];
    let group: string;
    const num = /^c(\d+)::/i.exec(body);
    if (num) {
      group = 'c' + Number(num[1]);
      body = body.slice(num[0].length);
    } else group = 'u' + plain++;
    let gi = groups.indexOf(group);
    if (gi < 0) gi = groups.push(group) - 1;
    const sep = body.indexOf('::');
    const answer = sep < 0 ? body : body.slice(0, sep);
    const hint = sep < 0 ? undefined : body.slice(sep + 2);
    parts.push({ text: m[0], cloze: { index: gi, answer: answer.trim(), hint: hint?.trim() || undefined } });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Номер Anki (c1, c2…) → номер элемента в Мнеме. */
export function clozeOrdForAnki(text: string, ankiNumber: number): number {
  const seen: number[] = [];
  const re = /\{\{c(\d+)::/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen.indexOf(ankiNumber);
}

export function clozeCount(text: string): number {
  return new Set(parseCloze(text).flatMap((p) => (p.cloze ? [p.cloze.index] : []))).size;
}

/** Номера «элементов» карточки: сторона для двусторонней, номер пропуска для cloze. */
export function itemOrds(card: Card): number[] {
  // Строка словаря без ответа («просто термин») не учится, пока не допишешь определение.
  if (card.listId && !card.back.trim()) return [];
  if (card.type === 'reverse') return [0, 1];
  if (card.type === 'cloze') {
    const n = clozeCount(card.front);
    return n > 0 ? Array.from({ length: n }, (_, i) => i) : [];
  }
  return [0];
}

export const itemKey = (cardId: string, ord: number) => `${cardId}:${ord}`;

export interface Prompt {
  question: string; // Markdown
  answer: string; // Markdown
  typed?: string; // для карточки с вводом — эталон
  numeric?: number[]; // для задачи — числа, которые надо получить
}

export function buildPrompt(card: Card, ord: number, seed = 1): Prompt {
  if (card.type === 'problem') {
    const p = instantiate(card.front, card.back, seed);
    return { question: p.question, answer: p.answer, numeric: p.expected };
  }
  if (card.type === 'reverse' && ord === 1) return { question: card.back, answer: card.front };
  if (card.type === 'cloze') {
    const parts = parseCloze(card.front);
    const q = parts
      .map((p) => (p.cloze ? (p.cloze.index === ord ? `**[${p.cloze.hint ?? '…'}]**` : p.cloze.answer) : p.text))
      .join('');
    const a = parts
      .map((p) => (p.cloze ? (p.cloze.index === ord ? `==${p.cloze.answer}==` : p.cloze.answer) : p.text))
      .join('');
    return { question: q, answer: card.back ? `${a}\n\n${card.back}` : a };
  }
  if (card.type === 'typing') return { question: card.front, answer: card.back, typed: card.back };
  return { question: card.front, answer: card.back };
}

/** Сравнение введённого ответа: без регистра, лишних пробелов, ё = е, без точки в конце. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.!?;,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkTyped(input: string, expected: string): boolean {
  const variants = expected.split('|').map(normalizeAnswer);
  return variants.includes(normalizeAnswer(input));
}

// ---------- FSRS ----------

const schedulers = new Map<number, ReturnType<typeof fsrs>>();
export function scheduler(settings: Pick<Settings, 'retention'>) {
  let f = schedulers.get(settings.retention);
  if (!f) {
    f = fsrs({ request_retention: settings.retention, enable_fuzz: true, maximum_interval: 3650 });
    schedulers.set(settings.retention, f);
  }
  return f;
}

export function toFsrs(s: ItemState | undefined, now: Date): FCard {
  if (!s) return createEmptyCard(now);
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined
  };
}

export function fromFsrs(c: FCard): ItemState {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : undefined
  };
}

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

/** Интервалы для четырёх кнопок (мс от now). */
export function previewIntervals(state: ItemState | undefined, now: Date, settings: Pick<Settings, 'retention'>): number[] {
  const f = scheduler(settings);
  const p = f.repeat(toFsrs(state, now), now);
  return GRADES.map((g) => p[g].card.due.getTime() - now.getTime());
}

export function gradeItem(state: ItemState | undefined, now: Date, rating: Grade, settings: Pick<Settings, 'retention'>): ItemState {
  const f = scheduler(settings);
  return fromFsrs(f.next(toFsrs(state, now), now, rating).card);
}

export function formatInterval(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} мин`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} ч`;
  const d = ms / DAY;
  if (d < 30) return `${Math.round(d)} д`;
  if (d < 365) return `${Math.round(d / 30)} мес`;
  return `${(d / 365).toFixed(1).replace('.0', '')} г`;
}

// ---------- Дни ----------

/** Начало «учебного дня» (день начинается в dayStartHour, например в 4:00). */
export function dayStart(date: Date, hour: number): Date {
  const d = new Date(date);
  if (d.getHours() < hour) d.setDate(d.getDate() - 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function dayEnd(date: Date, hour: number): Date {
  const s = dayStart(date, hour);
  return new Date(s.getTime() + DAY);
}

/** Ключ дня YYYY-MM-DD с учётом начала дня. */
export function dayKey(date: Date, hour: number): string {
  const s = dayStart(date, hour);
  const y = s.getFullYear();
  const m = String(s.getMonth() + 1).padStart(2, '0');
  const d = String(s.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------- Очередь ----------

export interface QueueItem {
  key: string;
  cardId: string;
  topicId: string;
  ord: number;
  isNew: boolean;
}

export interface QueueScope {
  topicId?: string;
  subjectId?: string;
  subjectIds?: string[];
  cardIds?: string[];
  cram?: boolean; // «Повторить всю тему»: все карточки, расписание не меняется
  /** «Заранее»: уже начатые карточки из cardIds в том порядке, как их передали (слабые — первыми), без учёта срока; ответы пишутся в расписание как обычно. */
  ahead?: boolean;
}

/** Тема вместе с подтемами (учить параграф = учить и его подтемы). */
function topicSubtree(data: AppData, id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of data.topics)
      if (t.parentId && out.has(t.parentId) && !out.has(t.id)) {
        out.add(t.id);
        grew = true;
      }
  }
  return out;
}

const byTopicCache = new WeakMap<object, Map<string, Card[]>>();
/** Карточки по темам (в исходном порядке); пересчитывается только когда меняются карточки. */
export function cardsByTopic(data: AppData): Map<string, Card[]> {
  let m = byTopicCache.get(data.cards);
  if (!m) {
    m = new Map();
    for (const c of data.cards) {
      const l = m.get(c.topicId);
      if (l) l.push(c);
      else m.set(c.topicId, [c]);
    }
    byTopicCache.set(data.cards, m);
  }
  return m;
}

export function allItems(data: AppData, scope: QueueScope = {}): QueueItem[] {
  const subjectSet = scope.subjectIds ? new Set(scope.subjectIds) : scope.subjectId ? new Set([scope.subjectId]) : null;
  const topicIds = scope.topicId
    ? topicSubtree(data, scope.topicId)
    : subjectSet
      ? new Set(data.topics.filter((t) => subjectSet.has(t.subjectId)).map((t) => t.id))
      : null;
  const cardSet = scope.cardIds ? new Set(scope.cardIds) : null;
  const out: QueueItem[] = [];
  // Для одной темы или предмета не перебираем все карточки — берём из указателя «тема → карточки».
  let source: Card[] = data.cards;
  if (topicIds && topicIds.size < data.topics.length / 2) {
    const idx = cardsByTopic(data);
    source = [];
    for (const id of topicIds) {
      const list = idx.get(id);
      if (list) for (const c of list) source.push(c);
    }
  }
  for (const c of source) {
    if (topicIds && !topicIds.has(c.topicId)) continue;
    if (cardSet && !cardSet.has(c.id)) continue;
    for (const ord of itemOrds(c)) {
      const key = itemKey(c.id, ord);
      out.push({ key, cardId: c.id, topicId: c.topicId, ord, isNew: !data.states[key] });
    }
  }
  return out;
}

/** Ответы, начиная с момента `since` (журнал идёт по времени — читаем с конца, пока не станет раньше). */
function logsSince(data: AppData, since: number): AppData['logs'] {
  const out: AppData['logs'] = [];
  const iso = new Date(since).toISOString();
  for (let i = data.logs.length - 1; i >= 0; i--) {
    const l = data.logs[i];
    if (l.at < iso) {
      // на случай, если журнал не отсортирован: проверим ещё немного назад
      let late = false;
      for (let j = i - 1; j >= Math.max(0, i - 50); j--) if (data.logs[j].at >= iso) late = true;
      if (!late) break;
      continue;
    }
    out.push(l);
  }
  return out;
}

export function newIntroducedToday(data: AppData, now: Date): number {
  const start = dayStart(now, data.settings.dayStartHour).getTime();
  const seen = new Set<string>();
  for (const l of logsSince(data, start)) if (l.prevState === 0) seen.add(l.key);
  return seen.size;
}

/** Перемешивание (детерминированное, если передан seed — для тестов). */
function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Чередование тем: по одной карточке из каждой темы по кругу (interleaving). */
function interleaveByTopic(items: QueueItem[]): QueueItem[] {
  const groups = new Map<string, QueueItem[]>();
  for (const it of items) {
    const g = groups.get(it.topicId) ?? [];
    g.push(it);
    groups.set(it.topicId, g);
  }
  const lists = [...groups.values()];
  const out: QueueItem[] = [];
  let added = true;
  for (let i = 0; added; i++) {
    added = false;
    for (const l of lists) {
      if (i < l.length) {
        out.push(l[i]);
        added = true;
      }
    }
  }
  return out;
}

export interface TodayCounts {
  learning: number;
  review: number;
  newCount: number;
}

export function buildQueue(data: AppData, now: Date, scope: QueueScope = {}, rnd: () => number = Math.random): QueueItem[] {
  const items = allItems(data, scope);
  if (scope.ahead) {
    const rank = new Map((scope.cardIds ?? []).map((id, i) => [id, i]));
    return items.filter((it) => data.states[it.key]).sort((a, b) => (rank.get(a.cardId) ?? 1e9) - (rank.get(b.cardId) ?? 1e9) || a.ord - b.ord);
  }
  if (scope.cram) return interleaveByTopic(shuffle(items, rnd));
  const end = dayEnd(now, data.settings.dayStartHour).getTime();
  const learning: QueueItem[] = [];
  const review: QueueItem[] = [];
  const fresh: QueueItem[] = [];
  for (const it of items) {
    const s = data.states[it.key];
    if (!s) {
      fresh.push(it);
      continue;
    }
    const due = new Date(s.due).getTime();
    if (due > end) continue;
    if (s.state === 1 || s.state === 3) learning.push(it);
    else review.push(it);
  }
  // Сиблинги (две стороны одной карточки, разные пропуски) не показываем в один день как новые.
  const newLeft = Math.max(0, data.settings.newPerDay - newIntroducedToday(data, now));
  // План до контрольной: новые карточки темы с контрольной — сверх дневного лимита, по плану;
  // в последние дни — повторение «заранее» того, что иначе забылось бы к контрольной.
  const boost = scope.cram ? new Map<string, 'new' | 'ahead'>() : examBoost(data, now);
  const examFirst: QueueItem[] = [];
  if (boost.size) {
    for (let i = fresh.length - 1; i >= 0; i--) if (boost.get(fresh[i].key) === 'new') examFirst.push(...fresh.splice(i, 1));
    examFirst.reverse();
    for (const it of items) if (boost.get(it.key) === 'ahead') examFirst.push(it);
  }
  // Карточки, которые уже повторялись сегодня: их остальные стороны/пропуски ждут до завтра.
  const startToday = dayStart(now, data.settings.dayStartHour).getTime();
  const seenCards = new Set<string>(logsSince(data, startToday).map((l) => l.cardId));
  const newPicked: QueueItem[] = [];
  const cardOrder = new Map(data.cards.map((c, i) => [c.id, i]));
  fresh.sort((a, b) => (cardOrder.get(a.cardId) ?? 0) - (cardOrder.get(b.cardId) ?? 0) || a.ord - b.ord);
  for (const it of fresh) {
    if (newPicked.length >= newLeft) break;
    if (seenCards.has(it.cardId)) continue;
    seenCards.add(it.cardId);
    newPicked.push(it);
  }
  learning.sort((a, b) => new Date(data.states[a.key].due).getTime() - new Date(data.states[b.key].due).getTime());
  // Расписание уроков: предметы, которые будут завтра, повторяем первыми.
  const tomorrow = data.settings.features.schedule ? new Set(tomorrowSubjects(data, now)) : new Set<string>();
  const topicSubject = new Map(data.topics.map((t) => [t.id, t.subjectId]));
  const isTomorrow = (it: QueueItem) => tomorrow.has(topicSubject.get(it.topicId) ?? '');
  const reviews = [
    ...interleaveByTopic(shuffle(review.filter(isTomorrow), rnd)),
    ...interleaveByTopic(shuffle(review.filter((x) => !isTomorrow(x)), rnd))
  ].slice(0, data.settings.maxReviews);
  // Новые вставляем между повторениями: каждое 4-е место.
  const mixed: QueueItem[] = [];
  let ni = 0;
  for (let i = 0; i < reviews.length; i++) {
    mixed.push(reviews[i]);
    if ((i + 1) % 4 === 0 && ni < newPicked.length) mixed.push(newPicked[ni++]);
  }
  while (ni < newPicked.length) mixed.push(newPicked[ni++]);
  const examKeys = new Set(examFirst.map((x) => x.key));
  return [...learning, ...interleaveByTopic(examFirst), ...mixed.filter((x) => !examKeys.has(x.key))];
}

// Счётчики «на сегодня» спрашивают из многих мест (панель, предметы, темы) — запоминаем результат,
// пока не изменились карточки, прогресс, журнал, настройки или структура тем.
const topicSig = new WeakMap<object, string>();
function topicsKey(data: AppData): string {
  let k = topicSig.get(data.topics);
  if (k === undefined) {
    k = data.topics.map((t) => t.id + '>' + t.subjectId + '>' + (t.parentId ?? '')).join('|');
    topicSig.set(data.topics, k);
  }
  return k;
}
let countsGen: { cards: unknown; states: unknown; logs: unknown; settings: unknown; topics: string; map: Map<string, TodayCounts> } | null = null;

export function todayCounts(data: AppData, now: Date, scope: QueueScope = {}): TodayCounts {
  const tk = topicsKey(data);
  if (!countsGen || countsGen.cards !== data.cards || countsGen.states !== data.states || countsGen.logs !== data.logs || countsGen.settings !== data.settings || countsGen.topics !== tk)
    countsGen = { cards: data.cards, states: data.states, logs: data.logs, settings: data.settings, topics: tk, map: new Map() };
  const key = Math.floor(now.getTime() / 60000) + '|' + JSON.stringify(scope);
  const hit = countsGen.map.get(key);
  if (hit) return hit;
  const res = countTodayRaw(data, now, scope);
  if (countsGen.map.size > 500) countsGen.map.clear();
  countsGen.map.set(key, res);
  return res;
}

function countTodayRaw(data: AppData, now: Date, scope: QueueScope): TodayCounts {
  const q = buildQueue(data, now, scope, () => 0.5);
  let learning = 0;
  let review = 0;
  let newCount = 0;
  for (const it of q) {
    if (it.isNew) newCount++;
    else if (data.states[it.key].state === 2) review++;
    else learning++;
  }
  return { learning, review, newCount };
}

/** Прогноз: сколько повторений придётся на каждый из следующих n дней (0 — сегодня). */
export function forecast(data: AppData, now: Date, days = 7): number[] {
  const hour = data.settings.dayStartHour;
  const start = dayStart(now, hour).getTime();
  const out = new Array(days).fill(0);
  for (const s of Object.values(data.states)) {
    const due = new Date(s.due).getTime();
    const idx = due < start ? 0 : Math.floor((due - start) / DAY);
    if (idx < days) out[idx]++;
  }
  return out;
}

/** Серия дней подряд с хотя бы одним повторением. Сегодня без повторений серию не обрывает. */
export function streak(data: AppData, now: Date): number {
  const hour = data.settings.dayStartHour;
  const days = new Set(data.logs.map((l) => dayKey(new Date(l.at), hour)));
  let n = 0;
  const cur = dayStart(now, hour);
  if (!days.has(dayKey(cur, hour))) cur.setDate(cur.getDate() - 1);
  while (days.has(dayKey(cur, hour))) {
    n++;
    cur.setDate(cur.getDate() - 1);
  }
  return n;
}

/** Доля выученного в теме: элементы в состоянии Review со стабильностью ≥ 3 дней. */
export function topicMastery(data: AppData, topicId: string): { total: number; learned: number; started: number; struggling: number } {
  const items = allItems(data, { topicId });
  let learned = 0;
  let started = 0;
  let struggling = 0; // забывается снова и снова или сейчас переучивается
  for (const it of items) {
    const s = data.states[it.key];
    if (!s || s.reps === 0) continue;
    started++;
    if (s.state === 2 && s.stability >= 3) learned++;
    if (s.state === 3 || s.lapses >= 2) struggling++;
  }
  return { total: items.length, learned, started, struggling };
}

export type TopicStatus = 'empty' | 'new' | 'weak' | 'progress' | 'learned';

/** Состояние темы для карты: не начата, слабое место, в процессе или выучена. */
export function topicStatus(m: ReturnType<typeof topicMastery>): TopicStatus {
  if (m.total === 0) return 'empty';
  if (m.started === 0) return 'new';
  if (m.struggling / m.started >= 0.3) return 'weak';
  if (m.learned / m.total >= 0.75) return 'learned';
  return 'progress';
}

// ---------- Расписание уроков ----------

/** Предметы по расписанию на следующий учебный день (воскресенье пропускается). */
export function tomorrowSubjects(data: AppData, now: Date): string[] {
  const d = dayStart(now, data.settings.dayStartHour);
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) return [];
  const ids = data.settings.schedule[String(d.getDay())] ?? [];
  return ids.filter((id) => data.subjects.some((s) => s.id === id));
}

// ---------- «Трудные» карточки (пиявки) ----------

export function cardLapses(data: AppData, card: Card): number {
  let max = 0;
  for (const ord of itemOrds(card)) {
    const s = data.states[itemKey(card.id, ord)];
    if (s && s.lapses > max) max = s.lapses;
  }
  return max;
}

export function isLeech(data: AppData, card: Card): boolean {
  return cardLapses(data, card) >= data.settings.leechThreshold;
}

// ---------- План до контрольной ----------

/** Вероятность вспомнить через t дней при стабильности S (кривая забывания FSRS). */
export function recallAfter(days: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (19 / 81) * (Math.max(0, days) / stability), -0.5);
}

interface ExamGroup {
  examId: string;
  topicId: string; // первая тема контрольной (опорная)
  topicIds: string[];
  examDay: number; // начало дня контрольной
  daysLeft: number; // 0 — сегодня, 1 — завтра
  items: QueueItem[];
}

function examGroups(data: AppData, now: Date): ExamGroup[] {
  const hour = data.settings.dayStartHour;
  const today = dayStart(now, hour).getTime();
  const out: ExamGroup[] = [];
  const taken = new Set<string>();
  // Контрольные: записанные (несколько тем) и старые даты у тем (examsOf их читает «на лету»); по порядку дат.
  for (const ex of examsOf(data)) {
    const d = new Date(ex.date + 'T12:00:00');
    const examDay = dayStart(d, 0).getTime() + hour * HOUR;
    const daysLeft = Math.round((examDay - today) / DAY);
    if (daysLeft < 0) continue;
    const items = ex.topicIds.flatMap((id) => allItems(data, { topicId: id })).filter((it) => !taken.has(it.key));
    const uniq = new Map(items.map((it) => [it.key, it]));
    const list = [...uniq.values()];
    list.forEach((it) => taken.add(it.key));
    if (list.length) out.push({ examId: ex.id, topicId: ex.topicIds[0], topicIds: ex.topicIds, examDay, daysLeft, items: list });
  }
  return out;
}

export interface ExamPlan {
  examId: string;
  topicId: string;
  daysLeft: number;
  total: number;
  learned: number;
  newLeft: number; // ещё не начатые
  todayNew: number; // новых сегодня по плану (осталось)
  todayAhead: number; // повторить заранее сегодня
  todayDue: number; // обычные повторения темы сегодня
  perDay: number[]; // сколько новых в каждый день до контрольной (с сегодняшнего)
  weak: number; // сколько карточек к контрольной, по прогнозу, будут помниться хуже 90 %
}

function planFor(data: AppData, now: Date, g: ExamGroup): { plan: ExamPlan; boost: Map<string, 'new' | 'ahead'> } {
  const hour = data.settings.dayStartHour;
  const start = dayStart(now, hour).getTime();
  const end = start + DAY;
  const keys = new Set(g.items.map((x) => x.key));
  const logsToday = logsSince(data, start).filter((l) => keys.has(l.key));
  const introducedToday = new Set(logsToday.filter((l) => l.prevState === 0).map((l) => l.key)).size;
  const reviewedToday = new Set(logsToday.map((l) => l.key));
  const cardOrder = new Map(data.cards.map((c, i) => [c.id, i]));
  const fresh = g.items.filter((it) => !data.states[it.key]).sort((a, b) => (cardOrder.get(a.cardId) ?? 0) - (cardOrder.get(b.cardId) ?? 0) || a.ord - b.ord);
  // Новые — поровну на дни до контрольной, закончить накануне (чтобы успеть повторить хотя бы раз).
  const spreadDays = Math.max(1, g.daysLeft);
  const quota = Math.ceil((fresh.length + introducedToday) / spreadDays);
  const todayNew = Math.max(0, Math.min(fresh.length, quota - introducedToday));
  const boost = new Map<string, 'new' | 'ahead'>();
  for (const it of fresh.slice(0, todayNew)) boost.set(it.key, 'new');
  // Заранее: в последние 2 дня — то, что до контрольной само не попадётся и к ней подзабудется.
  let ahead = 0;
  let due = 0;
  let weak = 0;
  let learned = 0;
  for (const it of g.items) {
    const s = data.states[it.key];
    if (!s) continue;
    if (s.state === 2 && s.stability >= 3) learned++;
    const dueAt = new Date(s.due).getTime();
    if (dueAt <= end) due++;
    const r = recallAfter((g.examDay + 2 * HOUR - new Date(s.last_review ?? s.due).getTime()) / DAY, s.stability);
    if (r < 0.9) weak++;
    if (g.daysLeft <= 2 && dueAt > end && dueAt >= g.examDay && r < 0.9 && !reviewedToday.has(it.key)) {
      boost.set(it.key, 'ahead');
      ahead++;
    }
  }
  const rest = fresh.length - todayNew;
  const perDay = [todayNew];
  for (let d = 1; d < g.daysLeft; d++) {
    const left = rest - perDay.slice(1).reduce((a, b) => a + b, 0);
    perDay.push(Math.ceil(left / (g.daysLeft - d)));
  }
  return {
    plan: { examId: g.examId, topicId: g.topicId, daysLeft: g.daysLeft, total: g.items.length, learned, newLeft: fresh.length, todayNew, todayAhead: ahead, todayDue: due, perDay, weak },
    boost
  };
}

/** Какие элементы сегодня добавить из-за контрольных. */
export function examBoost(data: AppData, now: Date): Map<string, 'new' | 'ahead'> {
  const out = new Map<string, 'new' | 'ahead'>();
  if (!data.topics.some((t) => t.examDate) && !data.exams?.length) return out;
  for (const g of examGroups(data, now)) for (const [k, v] of planFor(data, now, g).boost) out.set(k, v);
  return out;
}

/** План подготовки к контрольной по теме (для экранов). */
export function examPlan(data: AppData, now: Date, topicId: string): ExamPlan | null {
  const g = examGroups(data, now).find((x) => x.topicIds.includes(topicId));
  return g ? planFor(data, now, g).plan : null;
}

/** То же по контрольной (одна или несколько тем). */
export function examPlanOf(data: AppData, now: Date, examId: string): ExamPlan | null {
  const g = examGroups(data, now).find((x) => x.examId === examId);
  return g ? planFor(data, now, g).plan : null;
}

/** Разминка перед уроками: самые «подзабытые» карточки сегодняшних предметов (без изменения расписания). */
export function warmupCards(data: AppData, now: Date, n = 5): string[] {
  const dow = dayStart(now, data.settings.dayStartHour).getDay();
  const subj = new Set(data.settings.schedule[String(dow)] ?? []);
  if (!subj.size) return [];
  const topicSubject = new Map(data.topics.map((t) => [t.id, t.subjectId]));
  const scored: { cardId: string; r: number }[] = [];
  for (const c of data.cards) {
    if (!subj.has(topicSubject.get(c.topicId) ?? '')) continue;
    let worst = 1;
    let any = false;
    for (const ord of itemOrds(c)) {
      const s = data.states[itemKey(c.id, ord)];
      if (!s || s.reps === 0) continue;
      any = true;
      const days = (now.getTime() - new Date(s.last_review ?? s.due).getTime()) / DAY;
      worst = Math.min(worst, recallAfter(days, s.stability));
    }
    if (any) scored.push({ cardId: c.id, r: worst });
  }
  return scored
    .sort((a, b) => a.r - b.r)
    .slice(0, n)
    .map((x) => x.cardId);
}

// ---------- Счётчики сразу для всех тем (один проход) ----------
// Экран предмета спрашивал `todayCounts` и `topicMastery` отдельно на каждую тему: на 500 темах и 10 000 карточек это
// ≈0,6 с, на 2000 темах — ≈7–9 с. Здесь карточки каждой темы просматриваются один раз, а для темы с подтемами
// счётчики складываются. Результат ТОЧНО такой же, как у `todayCounts(data, now, { topicId })` и `topicMastery`
// (это проверяет src/v181-perf.test.ts); редкие случаи, где точный ответ зависит от порядка очереди, считаются старым путём.

/** Что набирается по карточкам одной темы (без подтем); подтемы потом складываются. */
interface TopicBucket {
  total: number; // все элементы (для topicMastery)
  started: number;
  learned: number;
  struggling: number;
  learn: number; // в очереди «учу»: срок наступил, состояние 1 или 3
  revTotal: number; // в очереди «повторение»: срок наступил, состояние не 1 и не 3
  rev2: number; // из них состояние 2 и не «контрольная»
  revOther: number; // из них другое состояние и не «контрольная»
  revExam: number; // из них те, что идут как «заранее» к контрольной
  examNew: number; // новые «по плану контрольной» (сверх дневного лимита)
  ahead2: number; // «заранее» к контрольной, состояние 2
  aheadOther: number; // «заранее», другое состояние
  aheadNew: number; // «заранее» без состояния (так не бывает, считаем для полноты)
  freshCards: number; // карточки с новым элементом, которого сегодня ещё не касались (кандидаты на «новые»)
  weird: number; // странности, при которых порядок очереди меняет ответ
}

const zeroBucket = (): TopicBucket => ({ total: 0, started: 0, learned: 0, struggling: 0, learn: 0, revTotal: 0, rev2: 0, revOther: 0, revExam: 0, examNew: 0, ahead2: 0, aheadOther: 0, aheadNew: 0, freshCards: 0, weird: 0 });

export interface TopicStats {
  counts: TodayCounts;
  mastery: ReturnType<typeof topicMastery>;
}

function topicPass(data: AppData, now: Date | null, ids: Iterable<string> | undefined, withCounts: boolean): Map<string, TopicStats> {
  const wanted = ids ? [...ids] : data.topics.map((t) => t.id);
  const children = new Map<string, string[]>();
  for (const t of data.topics)
    if (t.parentId) {
      const l = children.get(t.parentId);
      if (l) l.push(t.id);
      else children.set(t.parentId, [t.id]);
    }
  const byTopic = cardsByTopic(data);
  const hour = data.settings.dayStartHour;
  const at = now ?? new Date();
  const end = dayEnd(at, hour).getTime();
  const boost = withCounts ? examBoost(data, at) : new Map<string, 'new' | 'ahead'>();
  const seen = withCounts ? new Set(logsSince(data, dayStart(at, hour).getTime()).map((l) => l.cardId)) : new Set<string>();
  const newLeft = withCounts ? Math.max(0, data.settings.newPerDay - newIntroducedToday(data, at)) : 0;
  const cap = Number.isNaN(newLeft) ? Infinity : Math.ceil(newLeft);
  const lim = data.settings.maxReviews;
  const limOk = Number.isInteger(lim) && lim >= 0;

  const buckets = new Map<string, TopicBucket>();
  const bucketOf = (id: string): TopicBucket => {
    let b = buckets.get(id);
    if (b) return b;
    b = zeroBucket();
    for (const c of byTopic.get(id) ?? []) {
      let fresh = false;
      for (const ord of itemOrds(c)) {
        const key = itemKey(c.id, ord);
        const s = data.states[key];
        b.total++;
        if (s && s.reps !== 0) {
          b.started++;
          if (s.state === 2 && s.stability >= 3) b.learned++;
          if (s.state === 3 || s.lapses >= 2) b.struggling++;
        }
        if (!withCounts) continue;
        const bo = boost.get(key);
        if (!s) {
          if (bo === 'new') b.examNew++;
          else {
            if (bo === 'ahead') b.weird++;
            if (!seen.has(c.id)) fresh = true;
          }
        } else if (!(new Date(s.due).getTime() > end)) {
          if (s.state === 1 || s.state === 3) b.learn++;
          else {
            b.revTotal++;
            if (bo === 'ahead') b.revExam++;
            else if (s.state === 2) b.rev2++;
            else b.revOther++;
          }
        }
        if (bo === 'ahead') {
          if (!s) b.aheadNew++;
          else if (s.state === 2) b.ahead2++;
          else b.aheadOther++;
        }
      }
      if (fresh) b.freshCards++;
    }
    buckets.set(id, b);
    return b;
  };

  const out = new Map<string, TopicStats>();
  for (const id of wanted) {
    if (out.has(id)) continue;
    // тема вместе с подтемами — как topicSubtree
    const sum = zeroBucket();
    const sub = new Set([id]);
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const b = bucketOf(cur);
      for (const k in b) (sum as any)[k] += (b as any)[k];
      for (const ch of children.get(cur) ?? []) if (!sub.has(ch)) { sub.add(ch); stack.push(ch); }
    }
    const mastery = { total: sum.total, learned: sum.learned, started: sum.started, struggling: sum.struggling };
    let counts: TodayCounts = { learning: 0, review: 0, newCount: 0 };
    if (withCounts) {
      const truncated = limOk && sum.revTotal > lim;
      if (!limOk || sum.weird > 0 || (truncated && sum.revOther + sum.revExam > 0)) {
        // порядок очереди влияет на ответ — берём честный старый путь
        counts = todayCounts(data, at, { topicId: id });
      } else {
        const review = (truncated ? lim : sum.rev2) + sum.ahead2;
        const learning = sum.learn + (truncated ? 0 : sum.revOther) + sum.aheadOther;
        counts = { learning, review, newCount: sum.examNew + sum.aheadNew + Math.min(sum.freshCards, cap) };
      }
    }
    out.set(id, { counts, mastery });
  }
  return out;
}

/**
 * Счётчики «на сегодня» для каждой темы (вместе с подтемами) за один проход по карточкам.
 * Для темы совпадает с `todayCounts(data, now, { topicId })`. `topicIds` — какие темы нужны (по умолчанию все).
 */
export function todayCountsByTopic(data: AppData, now: Date, topicIds?: Iterable<string>): Map<string, TodayCounts> {
  const out = new Map<string, TodayCounts>();
  for (const [id, s] of topicPass(data, now, topicIds, true)) out.set(id, s.counts);
  return out;
}

/** Освоение каждой темы (вместе с подтемами) за один проход; для темы совпадает с `topicMastery(data, id)`. */
export function topicMasteryByTopic(data: AppData, topicIds?: Iterable<string>): Map<string, ReturnType<typeof topicMastery>> {
  const out = new Map<string, ReturnType<typeof topicMastery>>();
  for (const [id, s] of topicPass(data, null, topicIds, false)) out.set(id, s.mastery);
  return out;
}

/** И счётчики на сегодня, и освоение — за один проход (экран предмета). */
export function topicStatsByTopic(data: AppData, now: Date, topicIds?: Iterable<string>): Map<string, TopicStats> {
  return topicPass(data, now, topicIds, true);
}
