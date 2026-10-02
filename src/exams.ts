// Подготовка к контрольной: готовность (прогноз вспоминания на дату), охват конспекта карточками, слабые места и план по дням.
// Чистые функции. Всё это ПРОГНОЗ ПО КАРТОЧКАМ, а не оценка за контрольную: так и подписано на экране.
import { findImportant } from './important';
import { allItems, DAY, dayStart, HOUR } from './srs';
import type { ExamView } from './examList';
import { weakCards, weakItems, type WeakCard } from './weakness';
import type { AppData, Topic } from './types';

/** Через сколько дней контрольная: 0 — сегодня, 1 — завтра; меньше нуля — уже прошла. Так же считает и план новых карточек в srs.ts. */
export function daysLeftTo(exam: Pick<ExamView, 'date'>, now: Date, dayStartHour: number): number {
  const examDay = dayStart(new Date(exam.date + 'T12:00:00'), 0).getTime() + dayStartHour * HOUR;
  return Math.round((examDay - dayStart(now, dayStartHour).getTime()) / DAY);
}

/** Момент, на который строится прогноз: утро дня контрольной. */
export function examMoment(exam: Pick<ExamView, 'date'>): Date {
  return new Date(exam.date + 'T09:00:00');
}

/** Тема вместе с подтемами. */
function subtree(topics: Topic[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of topics)
      if (t.parentId && out.has(t.parentId) && !out.has(t.id)) {
        out.add(t.id);
        grew = true;
      }
  }
  return out;
}

// ---------- охват: сколько важных мест конспекта закрыто карточками ----------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// Слова длиннее трёх букв, обрезанные до корня: «фотосинтез» и «фотосинтеза» — одно слово.
const stems = (s: string) => norm(s).split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, 5));

/** Важные места конспекта темы и сколько из них упоминается в карточках темы. null — в конспекте нечего считать. */
export function topicCoverage(data: AppData, topicId: string): { covered: number; places: number } | null {
  const topic = data.topics.find((t) => t.id === topicId);
  if (!topic || !topic.note.trim()) return null;
  const places = findImportant(topic.note, data.settings.highlight);
  if (!places.length) return null;
  const ids = subtree(data.topics, topicId);
  const cards = data.cards
    .filter((c) => ids.has(c.topicId))
    .map((c) => {
      const text = norm(c.front + ' ' + c.back);
      return { text, set: new Set(stems(text)) };
    });
  let covered = 0;
  for (const p of places) {
    const t = norm(p.text);
    const need = stems(p.text);
    const hit = cards.some((c) => (t.length >= 3 && c.text.includes(t)) || (need.length > 0 && need.every((w) => c.set.has(w))));
    const sent = stems(p.sentence);
    if (hit || (sent.length >= 3 && cards.some((c) => sent.filter((w) => c.set.has(w)).length / sent.length >= 0.6))) covered++;
  }
  return { covered, places: places.length };
}

// ---------- готовность ----------

export interface TopicReadiness {
  topicId: string;
  name: string;
  items: number;
  started: number;
  /** Прогноз вспоминания на день контрольной, 0…1: ещё не начатое считается как 0. */
  recall: number;
  coverage: { covered: number; places: number } | null;
}

export interface ExamReadiness {
  daysLeft: number;
  items: number;
  started: number;
  /** Прогноз вспоминания на день контрольной по всем карточкам (не начатые — 0). */
  recallOnDate: number;
  /** Охват: сколько важных мест конспекта закрыто карточками; null — в конспектах нечего считать. */
  coverage: { covered: number; places: number } | null;
  /** Слабые места к этой дате — самые слабые первыми. */
  weak: WeakCard[];
  perTopic: TopicReadiness[];
  cardIds: string[];
}

export function readiness(data: AppData, exam: ExamView, now: Date): ExamReadiness {
  const at = examMoment(exam);
  const all = new Map<string, { topicId: string }>();
  const perTopic: TopicReadiness[] = [];
  const weakAll = weakItems(data, now, { topicIds: exam.topicIds, at });
  const recallByKey = new Map(weakAll.map((w) => [w.key, w.recall]));
  let covered = 0;
  let places = 0;
  for (const id of exam.topicIds) {
    const topic = data.topics.find((t) => t.id === id);
    if (!topic) continue;
    const items = allItems(data, { topicId: id });
    let sum = 0;
    let started = 0;
    for (const it of items) {
      all.set(it.key, { topicId: it.topicId });
      const r = recallByKey.get(it.key);
      if (r !== undefined) {
        sum += r;
        started++;
      }
    }
    const cov = topicCoverage(data, id);
    if (cov) {
      covered += cov.covered;
      places += cov.places;
    }
    perTopic.push({ topicId: id, name: topic.name, items: items.length, started, recall: items.length ? sum / items.length : 0, coverage: cov });
  }
  const items = all.size;
  let sum = 0;
  for (const k of all.keys()) sum += recallByKey.get(k) ?? 0;
  const cardIds = [...new Set([...all.keys()].map((k) => k.split(':')[0]))];
  return {
    daysLeft: daysLeftTo(exam, now, data.settings.dayStartHour),
    items,
    started: recallByKey.size,
    recallOnDate: items ? sum / items : 0,
    coverage: places ? { covered, places } : null,
    weak: weakCards(data, now, { topicIds: exam.topicIds, at }),
    perTopic,
    cardIds
  };
}

// ---------- план по дням ----------

export interface PlanDay {
  offset: number; // 0 — сегодня
  date: string; // YYYY-MM-DD
  kind: 'new' | 'weak' | 'rest';
  /** new — сколько новых карточек; weak — сколько слабых повторить (прогноз на сегодня). */
  n: number;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Что делать каждый день до контрольной: новые — поровну и заканчиваем за два дня до даты; последние два дня — только слабое (последний проход, не ночью накануне). */
export function dayPlan(data: AppData, exam: ExamView, now: Date): PlanDay[] {
  const hour = data.settings.dayStartHour;
  const D = daysLeftTo(exam, now, hour);
  if (D <= 0) return [];
  const items = new Map<string, true>();
  for (const id of exam.topicIds) for (const it of allItems(data, { topicId: id })) items.set(it.key, true);
  let fresh = [...items.keys()].filter((k) => !data.states[k]).length;
  const weakCount = weakCards(data, now, { topicIds: exam.topicIds, at: examMoment(exam) }).length;
  const spread = D >= 4 ? D - 2 : D; // на новое — все дни, кроме последних двух (если дней хватает)
  const base = dayStart(now, hour);
  const out: PlanDay[] = [];
  for (let d = 0; d < D; d++) {
    const date = new Date(base.getTime() + d * DAY + 12 * HOUR);
    if (d < spread && fresh > 0) {
      const n = Math.ceil(fresh / (spread - d));
      fresh -= n;
      out.push({ offset: d, date: ymd(date), kind: 'new', n });
    } else if (d >= D - 2 && weakCount > 0) out.push({ offset: d, date: ymd(date), kind: 'weak', n: weakCount });
    else out.push({ offset: d, date: ymd(date), kind: 'rest', n: 0 });
  }
  return out;
}
