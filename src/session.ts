// «Учиться»: один план на сегодня вместо шести кнопок запуска. Берёт готовую очередь дня (`buildQueue` уже ставит срочное первым:
// то, что учится прямо сейчас, подготовку к контрольной, предметы на завтра, повторения, потом новое), размечает её по шагам
// с понятной причиной, режет по времени (5/10/20 минут) и по шагам, которые пропустили сегодня. Чистые функции, без интерфейса.
import { daysLeftTo } from './exams';
import { examsOf } from './examList';
import { buildQueue, dayStart, examBoost, MINUTE, tomorrowSubjects, type QueueItem } from './srs';
import type { AppData } from './types';

export type StepKind = 'learning' | 'exam' | 'tomorrow' | 'review' | 'new';

/** Порядок шагов в плане. */
export const STEP_ORDER: StepKind[] = ['learning', 'exam', 'tomorrow', 'review', 'new'];
export const STEP_KINDS = new Set<string>(STEP_ORDER);

export interface SessionOpts {
  /** Сколько минут есть. Не задано или 0 — всё, что на сегодня. */
  minutes?: number;
  /** Шаги, которые пропустили сегодня. */
  skip?: string[];
}

export interface SessionStep {
  kind: StepKind;
  title: string;
  why: string;
  /** Сколько карточек из шага попадёт в сегодняшнюю учёбу (с учётом времени). */
  count: number;
  /** Сколько их было бы без ограничения по времени. */
  total: number;
  skipped: boolean;
}

export interface Session {
  items: QueueItem[];
  steps: SessionStep[];
  /** Примерно сколько минут займёт (по тому, как быстро ты обычно отвечаешь). */
  minutes: number;
  /** Что не поместилось по времени: останется на потом, ничего не теряется. */
  later: number;
  perItemMs: number;
}

/** Склонение по числу: 1 карточка, 2 карточки, 5 карточек. */
function pl(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}
const days = (n: number) => (n === 0 ? 'сегодня' : n === 1 ? 'завтра' : `через ${n} ${pl(n, 'день', 'дня', 'дней')}`);

/** Сколько в среднем уходит на один ответ: по последним ответам, без них — 10 секунд; с запасом на чтение. */
export function perItemMs(data: AppData): number {
  const recent = data.logs.slice(-200);
  const avg = recent.length ? recent.reduce((a, l) => a + l.ms, 0) / recent.length : 10_000;
  return Math.max(2_000, avg * 1.1);
}

/** Какого рода элемент очереди (для шага плана). */
function kindOf(data: AppData, it: QueueItem, boost: Map<string, 'new' | 'ahead'>, tomorrow: Set<string>, topicSubject: Map<string, string>): StepKind {
  if (boost.has(it.key)) return 'exam';
  const s = data.states[it.key];
  if (!s) return 'new';
  if (s.state === 1 || s.state === 3) return 'learning';
  return tomorrow.has(topicSubject.get(it.topicId) ?? '') ? 'tomorrow' : 'review';
}

export function buildSession(data: AppData, now: Date, opts: SessionOpts = {}, rnd: () => number = Math.random): Session {
  const queue = buildQueue(data, now, {}, rnd);
  const boost = examBoost(data, now);
  const tomorrowIds = data.settings.features.schedule ? tomorrowSubjects(data, now) : [];
  const tomorrow = new Set(tomorrowIds);
  const topicSubject = new Map(data.topics.map((t) => [t.id, t.subjectId]));
  const skip = new Set(opts.skip ?? []);
  const per = perItemMs(data);

  const kinds = new Map<string, StepKind>();
  const kept: QueueItem[] = [];
  const total: Record<StepKind, number> = { learning: 0, exam: 0, tomorrow: 0, review: 0, new: 0 };
  const skippedTotal: Record<StepKind, number> = { learning: 0, exam: 0, tomorrow: 0, review: 0, new: 0 };
  for (const it of queue) {
    const k = kindOf(data, it, boost, tomorrow, topicSubject);
    kinds.set(it.key, k);
    if (skip.has(k)) {
      skippedTotal[k]++;
      continue;
    }
    total[k]++;
    kept.push(it);
  }

  const budget = opts.minutes && opts.minutes > 0 ? Math.max(1, Math.floor((opts.minutes * MINUTE) / per)) : Infinity;
  const items = kept.slice(0, budget);
  const count: Record<StepKind, number> = { learning: 0, exam: 0, tomorrow: 0, review: 0, new: 0 };
  for (const it of items) count[kinds.get(it.key)!]++;

  // Ближайшая контрольная — для причины шага «к контрольной».
  const nextExam = examsOf(data)
    .map((e) => ({ e, d: daysLeftTo(e, now, data.settings.dayStartHour) }))
    .filter((x) => x.d >= 0)[0];
  const subjectNames = tomorrowIds.map((id) => data.subjects.find((s) => s.id === id)?.name).filter(Boolean) as string[];

  const text: Record<StepKind, { title: string; why: string }> = {
    learning: { title: 'Закрепить только что выученное', why: 'Эти карточки ты ещё учишь — их нужно повторить прямо сейчас, пока они свежие.' },
    exam: {
      title: nextExam ? `К контрольной «${nextExam.e.name}»` : 'К контрольной',
      why: nextExam ? `Контрольная ${days(nextExam.d)}: новые карточки по плану и слабые места — чтобы всё успело закрепиться.` : 'Подготовка к контрольной: новые карточки по плану и слабые места.'
    },
    tomorrow: { title: 'Предметы на завтра', why: `${subjectNames.length ? subjectNames.join(', ') : 'Предметы'} — завтра уроки, поэтому их повторения идут раньше остальных.` },
    review: { title: 'Повторения', why: 'Пора повторить, пока ты не начал забывать: так запоминается надолго и за меньшее время.' },
    new: { title: 'Новое', why: `Понемногу каждый день: до ${data.settings.newPerDay} новых карточек, чтобы не перегружаться.` }
  };

  const steps: SessionStep[] = [];
  for (const kind of STEP_ORDER) {
    const isSkipped = skippedTotal[kind] > 0 && total[kind] === 0;
    if (total[kind] === 0 && !isSkipped) continue;
    steps.push({ kind, title: text[kind].title, why: text[kind].why, count: count[kind], total: isSkipped ? skippedTotal[kind] : total[kind], skipped: isSkipped });
  }

  return { items, steps, minutes: items.length ? Math.max(1, Math.round((items.length * per) / MINUTE)) : 0, later: kept.length - items.length, perItemMs: per };
}

/** Строка «≈ 8 минут · 4 шага» для кнопки. */
export function sessionLine(s: Session): string {
  const n = s.steps.filter((x) => !x.skipped).length;
  return `${s.items.length ? `около ${s.minutes} мин` : 'нечего повторять'} · ${n} ${pl(n, 'шаг', 'шага', 'шагов')}`;
}

// ---------- что выбрал человек: время и пропущенные сегодня шаги ----------

/** День по границе «начала дня» из настроек (ГГГГ-ММ-ДД): пропуск шага действует до его конца. */
export function dayKey(data: AppData, now: Date): string {
  const d = dayStart(now, data.settings.dayStartHour);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const SESSION_MINUTES = [5, 10, 20] as const;

/** Выбор для «Учиться»: минуты (0 — всё) и шаги, пропущенные именно сегодня (вчерашний пропуск не действует). */
export function sessionPrefs(data: AppData, now: Date): { minutes: number; skip: string[] } {
  const s = data.settings;
  const minutes = s.sessionMinutes && (SESSION_MINUTES as readonly number[]).includes(s.sessionMinutes) ? s.sessionMinutes : 0;
  const skip = s.sessionSkip && s.sessionSkip.day === dayKey(data, now) ? s.sessionSkip.kinds.filter((k) => STEP_KINDS.has(k)) : [];
  return { minutes, skip };
}

/** Пропустить шаг или вернуть его: новое значение для `settings.sessionSkip`. */
export function toggledSkip(data: AppData, now: Date, kind: StepKind): { day: string; kinds: string[] } {
  const cur = sessionPrefs(data, now).skip;
  return { day: dayKey(data, now), kinds: cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind] };
}
