// Итоги недели, цифры за период, слабые темы и достижения за регулярность.
import { dayKey, dayStart, DAY, streak } from './srs';
import type { AppData, ReviewLogEntry } from './types';

/** Единый порог выборки: меньше стольких ответов процент ничего не говорит (и для «Запоминания», и для слабых тем). */
export const MIN_SAMPLE = 5;
/** Тема считается слабой, если верных ответов за период меньше этой доли. */
export const WEAK_BELOW = 0.8;

/**
 * Запоминание: доля ответов «не Снова» среди карточек, которые уже были в долгом повторении (prevState === 2).
 * Если таких ответов меньше MIN_SAMPLE — процента нет (null), показывать надо «—».
 */
export function retentionOf(logs: ReviewLogEntry[]): { pct: number | null; n: number } {
  const matured = logs.filter((l) => l.prevState === 2);
  const n = matured.length;
  if (n < MIN_SAMPLE) return { pct: null, n };
  return { pct: Math.round((matured.filter((l) => l.rating > 1).length / n) * 100), n };
}

export interface PeriodStats {
  answers: number;
  minutes: number;
  retention: number | null; // % или null, если мало ответов
  retentionN: number; // сколько ответов легло в «Запоминание»
  overconf: number; // ошибки при высокой уверенности
  confN: number; // ответов с отметкой уверенности
}

/** Цифры за период: все ответы, начиная с момента since (мс). */
export function periodStats(data: AppData, since: number): PeriodStats {
  const logs = data.logs.filter((l) => new Date(l.at).getTime() >= since);
  const r = retentionOf(logs);
  return {
    answers: logs.length,
    minutes: Math.round(logs.reduce((a, l) => a + l.ms, 0) / 60_000),
    retention: r.pct,
    retentionN: r.n,
    overconf: logs.filter((l) => l.confidence === 2 && l.rating === 1).length,
    confN: logs.filter((l) => l.confidence !== undefined).length
  };
}

export interface TopicAccuracy {
  id: string;
  name: string;
  total: number; // ответов за период
  wrong: number; // из них «Снова»
  pct: number; // % верных, округлённый вниз (чтобы у слабой темы не вышло «80 %»)
  lastAt: number; // когда был последний ответ (мс)
}

/** Точность по каждой теме за период (только существующие темы). Без порога — его ставит вызывающий. */
export function topicAccuracy(data: AppData, since: number): TopicAccuracy[] {
  const by = new Map<string, { total: number; wrong: number; lastAt: number }>();
  for (const l of data.logs) {
    const t = new Date(l.at).getTime();
    if (t < since) continue;
    const x = by.get(l.topicId) ?? { total: 0, wrong: 0, lastAt: 0 };
    x.total++;
    if (l.rating === 1) x.wrong++;
    if (t > x.lastAt) x.lastAt = t;
    by.set(l.topicId, x);
  }
  const out: TopicAccuracy[] = [];
  for (const [id, v] of by) {
    const topic = data.topics.find((t) => t.id === id);
    if (!topic) continue;
    out.push({ id, name: topic.name, total: v.total, wrong: v.wrong, pct: Math.floor(((v.total - v.wrong) * 100) / v.total), lastAt: v.lastAt });
  }
  return out;
}

/**
 * Слабые темы: за период хотя бы minAnswers ответов и доля верных ниже below (80 %).
 * Сначала те, где больше всего ошибок; при равенстве — где процент ниже, затем где ответ был позже.
 * Сильные темы сюда не попадают никогда: если слабых нет, список пуст.
 */
export function weakTopics(data: AppData, since: number, opts: { minAnswers?: number; below?: number; limit?: number } = {}): TopicAccuracy[] {
  const { minAnswers = MIN_SAMPLE, below = WEAK_BELOW, limit = 5 } = opts;
  return topicAccuracy(data, since)
    .filter((t) => t.total >= minAnswers && (t.total - t.wrong) / t.total < below)
    .sort((a, b) => b.wrong - a.wrong || a.pct - b.pct || b.lastAt - a.lastAt)
    .slice(0, limit);
}

export interface WeekSummary {
  from: Date; // понедельник
  to: Date; // воскресенье
  answers: number;
  minutes: number;
  days: number; // в сколько дней занимался
  newLearned: number; // новых карточек впервые пройдено
  retention: number | null; // % «помню» среди давно выученных
  bestDay: { label: string; n: number } | null;
  topics: { id: string; name: string; n: number }[]; // больше всего занимался
  prev: { answers: number; minutes: number; days: number };
}

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];

function weekBounds(now: Date, hour: number, offsetWeeks: number) {
  const today = dayStart(now, hour);
  const dow = (today.getDay() + 6) % 7; // 0 = понедельник
  const from = new Date(today.getTime() - (dow + 7 * offsetWeeks) * DAY);
  const to = new Date(from.getTime() + 7 * DAY);
  return { from, to };
}

function summarize(data: AppData, from: Date, to: Date) {
  const hour = data.settings.dayStartHour;
  const logs = data.logs.filter((l) => {
    const t = new Date(l.at).getTime();
    return t >= from.getTime() && t < to.getTime();
  });
  const perDay = new Map<string, number>();
  for (const l of logs) perDay.set(dayKey(new Date(l.at), hour), (perDay.get(dayKey(new Date(l.at), hour)) ?? 0) + 1);
  return { logs, perDay, minutes: Math.round(logs.reduce((a, l) => a + l.ms, 0) / 60000) };
}

/** Итоги недели: offset 0 — текущая неделя, 1 — прошлая. */
export function weekSummary(data: AppData, now: Date, offset = 1): WeekSummary {
  const hour = data.settings.dayStartHour;
  const { from, to } = weekBounds(now, hour, offset);
  const cur = summarize(data, from, to);
  const pb = weekBounds(now, hour, offset + 1);
  const prev = summarize(data, pb.from, pb.to);
  let bestDay: WeekSummary['bestDay'] = null;
  for (const [k, n] of cur.perDay) {
    if (!bestDay || n > bestDay.n) {
      const d = new Date(k + 'T12:00:00');
      bestDay = { label: WEEKDAYS[d.getDay()], n };
    }
  }
  const byTopic = new Map<string, number>();
  for (const l of cur.logs) byTopic.set(l.topicId, (byTopic.get(l.topicId) ?? 0) + 1);
  const topics = [...byTopic.entries()]
    .map(([id, n]) => ({ id, n, name: data.topics.find((t) => t.id === id)?.name ?? '' }))
    .filter((t) => t.name)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  return {
    from,
    to: new Date(to.getTime() - DAY),
    answers: cur.logs.length,
    minutes: cur.minutes,
    days: cur.perDay.size,
    newLearned: cur.logs.filter((l) => l.prevState === 0).length,
    retention: retentionOf(cur.logs).pct,
    bestDay,
    topics,
    prev: { answers: prev.logs.length, minutes: prev.minutes, days: prev.perDay.size }
  };
}

/** Самая длинная серия дней подряд за всё время. */
export function bestStreak(data: AppData): number {
  const hour = data.settings.dayStartHour;
  const days = [...new Set(data.logs.map((l) => dayKey(new Date(l.at), hour)))].sort();
  let best = 0;
  let run = 0;
  let prev = 0;
  for (const k of days) {
    const t = new Date(k + 'T12:00:00').getTime();
    run = prev && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

export interface Achievement {
  id: string;
  icon: string; // эмодзи
  title: string;
  text: string;
  got: boolean;
  progress?: [number, number];
}

export function achievements(data: AppData, now: Date): Achievement[] {
  const cur = streak(data, now);
  const best = Math.max(bestStreak(data), cur);
  const answers = data.logs.length;
  const learned = Object.values(data.states).filter((s) => s.state === 2 && s.stability >= 21).length;
  const topicsWithNote = data.topics.filter((t) => t.note.trim().length > 200).length;
  const listRows = data.cards.filter((c) => c.listId).length;
  const tests = data.tests.length;
  const hour = data.settings.dayStartHour;
  const earlyDays = new Set(data.logs.filter((l) => new Date(l.at).getHours() < 9 && new Date(l.at).getHours() >= 5).map((l) => dayKey(new Date(l.at), hour))).size;
  const a = (id: string, icon: string, title: string, text: string, have: number, need: number): Achievement => ({ id, icon, title, text, got: have >= need, progress: [Math.min(have, need), need] });
  return [
    a('streak3', '🔥', 'Три дня подряд', 'Занимался три дня без пропусков', best, 3),
    a('streak7', '🗓️', 'Неделя подряд', 'Семь дней подряд — привычка начинается', best, 7),
    a('streak14', '⚡', 'Две недели', '14 дней подряд без пропусков', best, 14),
    a('streak30', '🏆', 'Месяц подряд', '30 дней подряд — это уже привычка', best, 30),
    a('streak100', '💎', 'Сто дней', '100 дней подряд', best, 100),
    a('answers100', '✅', 'Первая сотня', '100 ответов на карточки', answers, 100),
    a('answers1000', '🎯', 'Тысяча ответов', '1000 ответов на карточки', answers, 1000),
    a('learned50', '🧠', 'Надёжная память', '50 карточек помнишь дольше трёх недель', learned, 50),
    a('notes5', '📝', 'Конспектист', '5 подробных конспектов', topicsWithNote, 5),
    a('words50', '🔤', 'Словарный запас', '50 строк в словарях и списках', listRows, 50),
    a('tests3', '📋', 'Проверил себя', '3 пробные контрольные', tests, 3),
    a('early5', '🌅', 'Ранняя пташка', 'Пять дней занимался до 9 утра', earlyDays, 5)
  ];
}
