// Итоги недели и достижения за регулярность.
import { dayKey, dayStart, DAY, streak } from './srs';
import type { AppData } from './types';

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
  const matured = cur.logs.filter((l) => l.prevState === 2);
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
    retention: matured.length >= 5 ? Math.round((matured.filter((l) => l.rating > 1).length / matured.length) * 100) : null,
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
