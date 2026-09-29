// Домашние задания: сроки, «к следующему уроку», напоминания.
import type { AppData, Homework } from './types';

export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromYmd = (s: string) => new Date(s + 'T12:00:00');

/** Дата следующего урока предмета по расписанию (завтра или позже), иначе null. */
export function nextLesson(data: AppData, subjectId: string, from = new Date()): string | null {
  const sched = data.settings.schedule;
  if (!Object.values(sched).some((ids) => ids.includes(subjectId))) return null;
  const d = new Date(from);
  for (let i = 1; i <= 14; i++) {
    d.setDate(d.getDate() + 1);
    if ((sched[String(d.getDay())] ?? []).includes(subjectId)) return ymd(d);
  }
  return null;
}

/** Когда напомнить по умолчанию: накануне срока в выбранное время. */
export function defaultRemind(data: AppData, due?: string): string | undefined {
  const r = data.settings.homeworkRemind;
  if (!due || !r.on) return undefined;
  const d = fromYmd(due);
  if (r.when === 'dayBefore') d.setDate(d.getDate() - 1);
  const [h, m] = r.time.split(':').map(Number);
  d.setHours(h || 18, m || 0, 0, 0);
  return d.getTime() > Date.now() ? d.toISOString() : undefined;
}

export type HwGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'nodate' | 'done';
export const GROUP_LABEL: Record<HwGroup, string> = {
  overdue: 'Просрочено',
  today: 'На сегодня',
  tomorrow: 'На завтра',
  week: 'На этой неделе',
  later: 'Позже',
  nodate: 'Без срока',
  done: 'Сделано'
};

export function groupOf(h: Homework, now = new Date()): HwGroup {
  if (h.done) return 'done';
  if (!h.due) return 'nodate';
  const today = ymd(now);
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  const tomorrow = ymd(t);
  if (h.due < today) return 'overdue';
  if (h.due === today) return 'today';
  if (h.due === tomorrow) return 'tomorrow';
  const w = new Date(now);
  w.setDate(w.getDate() + 7);
  return h.due <= ymd(w) ? 'week' : 'later';
}

export function dueLabel(due?: string, now = new Date()): string {
  if (!due) return 'без срока';
  const g = groupOf({ due } as Homework, now);
  if (g === 'today') return 'на сегодня';
  if (g === 'tomorrow') return 'на завтра';
  const d = fromYmd(due);
  const s = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
  return g === 'overdue' ? 'срок был ' + s : 'к ' + s;
}

/** Все уведомления, которые должны сработать: напоминания о ДЗ и (на телефоне) ежедневное «пора повторить». */
export function notificationPlan(data: AppData, now = new Date(), withDaily = false): { id: string; at: number; title: string; body: string; open: string }[] {
  const out: { id: string; at: number; title: string; body: string; open: string }[] = [];
  if (data.settings.features.homework) {
    for (const h of data.homework) {
      if (h.done || !h.remind) continue;
      const at = Date.parse(h.remind);
      if (!(at > now.getTime() - 60000)) continue;
      const subj = data.subjects.find((s) => s.id === h.subjectId);
      out.push({ id: 'hw:' + h.id, at, title: `Домашка${subj ? ': ' + subj.name : ''} — ${dueLabel(h.due, new Date(at))}`, body: h.text.slice(0, 200), open: 'homework' });
    }
  }
  // Вечером перед учебным днём: какие завтра уроки — повтори их.
  const lr = data.settings.lessonsRemind;
  if (data.settings.features.schedule && lr?.on && /^\d{2}:\d{2}$/.test(lr.time)) {
    const [lh, lm] = lr.time.split(':').map(Number);
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      d.setHours(lh, lm, 0, 0);
      if (d.getTime() <= now.getTime()) continue;
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      if (next.getDay() === 0) continue;
      const names = [...new Set((data.settings.schedule[String(next.getDay())] ?? []).map((id) => data.subjects.find((s) => s.id === id)?.name).filter(Boolean))];
      if (!names.length) continue;
      out.push({ id: 'lessons:' + ymd(d), at: d.getTime(), title: 'Завтра: ' + names.join(', '), body: '10 минут повторения сейчас — и на уроке всё вспомнишь.', open: 'lessons' });
    }
  }
  const time = data.settings.reminder;
  if (withDaily && data.settings.features.tray && time && /^\d{2}:\d{2}$/.test(time)) {
    const [hh, mm] = time.split(':').map(Number);
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      d.setHours(hh, mm, 0, 0);
      if (d.getTime() <= now.getTime()) continue;
      out.push({ id: 'daily:' + ymd(d), at: d.getTime(), title: 'Мнема: пора повторить', body: 'Карточки ждут — хватит 10–15 минут. Повторять понемногу каждый день надёжнее всего.', open: 'review' });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Данные для виджета телефона: карточки по дням на неделю вперёд и ближайшая домашка. */
export function widgetState(data: AppData, now: Date, todayTotal: number, fc: number[], newRemaining: number, streakDays: number) {
  const hour = data.settings.dayStartHour;
  const start = new Date(now);
  if (start.getHours() < hour) start.setDate(start.getDate() - 1);
  const days: { date: string; cards: number }[] = [];
  let left = newRemaining;
  for (let i = 0; i < 8; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (i === 0) {
      days.push({ date: ymd(d), cards: todayTotal });
      left = Math.max(0, left - Math.min(left, data.settings.newPerDay));
      continue;
    }
    const fresh = Math.min(left, data.settings.newPerDay);
    left -= fresh;
    days.push({ date: ymd(d), cards: Math.min(data.settings.maxReviews, fc[i] ?? 0) + fresh });
  }
  const until = new Date(start);
  until.setDate(until.getDate() + 9);
  const hw = data.settings.features.homework
    ? data.homework
        .filter((h) => !h.done && (!h.due || h.due <= ymd(until)))
        .slice(0, 40)
        .map((h) => ({ due: h.due ?? '', text: h.text.slice(0, 80), subject: data.subjects.find((s) => s.id === h.subjectId)?.name ?? '' }))
    : [];
  return { dayStartHour: hour, days, hw, streak: streakDays };
}
