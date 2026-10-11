// Что показать на главной кнопке темы, предмета, папки, списка и «Сегодня»: учить, учить новые, «всё повторено», «нечего повторять» или «нет карточек».
// Правило простое: «Всё повторено» — только когда сегодня правда что-то повторяли и по расписанию больше ничего не осталось.
// «Повторить ещё раз» (окно выбора) — главная кнопка только в этом случае; пока есть что учить, главная кнопка — «Учить».
import { allItems, dayStart, logsSince, todayCounts, type QueueScope } from './srs';
import type { AppData } from './types';

export type StudyStatus =
  /** Карточек нет совсем. */
  | { kind: 'empty' }
  /** Есть что учить по расписанию: `due` — всего карточек на сегодня, `fresh` — из них новых. */
  | { kind: 'learn'; due: number; fresh: number }
  /** По расписанию пусто, но есть новые, которые ещё не учил (дневной лимит новых выбран): `fresh` — сколько можно начать сейчас. */
  | { kind: 'new'; fresh: number }
  /** Сегодня уже повторял, и по расписанию больше ничего нет. */
  | { kind: 'done' }
  /** Сегодня ничего не повторял, и повторять пока нечего. `next` — через сколько миллисекунд ближайший повтор (нет — null). */
  | { kind: 'idle'; next: number | null };

export function studyStatus(data: AppData, now: Date, scope: QueueScope = {}): StudyStatus {
  const items = allItems(data, scope);
  if (!items.length) return { kind: 'empty' };

  const c = todayCounts(data, now, scope);
  const due = c.learning + c.review + c.newCount;
  if (due > 0) return { kind: 'learn', due, fresh: c.newCount };

  const startToday = dayStart(now, data.settings.dayStartHour).getTime();
  const seenToday = new Set(logsSince(data, startToday).map((l) => l.cardId));

  // Новые, которые ещё не учили (остальные стороны карточек, которые отвечали сегодня, ждут завтра — как и в очереди).
  const freshCards = new Set<string>();
  for (const it of items) if (it.isNew && !seenToday.has(it.cardId)) freshCards.add(it.cardId);
  if (freshCards.size > 0) return { kind: 'new', fresh: Math.min(freshCards.size, Math.max(1, data.settings.newPerDay)) };

  if (items.some((it) => seenToday.has(it.cardId))) return { kind: 'done' };

  let next: number | null = null;
  for (const it of items) {
    const s = data.states[it.key];
    if (!s) continue;
    const t = new Date(s.due).getTime() - now.getTime();
    if (next === null || t < next) next = t;
  }
  return { kind: 'idle', next: next === null ? null : Math.max(0, next) };
}

/** «через 3 д», «завтра», «сегодня позже» — когда ближайший повтор. */
export function nextDueText(ms: number | null): string {
  if (ms === null) return '';
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 0) return 'сегодня позже';
  if (days === 1) return 'завтра';
  if (days < 14) return `через ${days} д`;
  if (days < 60) return `через ${Math.round(days / 7)} нед`;
  return `через ${Math.round(days / 30)} мес`;
}
