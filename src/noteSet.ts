// «Набор из конспекта»: черновики карточек из найденного в конспекте — по группам, с проверкой качества и разумной порцией.
// Ребёнок не станет разбирать 40 черновиков: по умолчанию отмечено только хорошее (короткий ответ, один факт) и не больше порции.
import type { ImportantType } from './types';

export type SetGroup = 'defs' | 'dates' | 'terms' | 'boxes' | 'names' | 'formulas';

export const SET_GROUPS: { id: SetGroup; title: string }[] = [
  { id: 'defs', title: 'Определения' },
  { id: 'dates', title: 'Даты' },
  { id: 'terms', title: 'Термины и главное' },
  { id: 'boxes', title: 'Запомни' },
  { id: 'names', title: 'Имена' },
  { id: 'formulas', title: 'Формулы и числа' }
];

export function groupOf(type: ImportantType): SetGroup {
  if (type === 'definition') return 'defs';
  if (type === 'date') return 'dates';
  if (type === 'box') return 'boxes';
  if (type === 'name') return 'names';
  if (type === 'formula') return 'formulas';
  return 'terms'; // жирное, курсив, свои слова
}

export interface DraftLike {
  type: 'basic' | 'reverse' | 'cloze' | 'typing' | 'problem';
  front: string;
  back: string;
}

/** Сколько предложений в тексте (грубо: по точке, «!» или «?» перед заглавной буквой или концом). */
function sentenceCount(s: string): number {
  return (s.trim().match(/[.!?…](?=\s+[А-ЯЁA-Z]|\s*$)/g) ?? []).length || 1;
}

/** Хороший ли черновик: один факт и короткий ответ. Если нет — почему (простыми словами). */
export function draftQuality(d: DraftLike): { ok: boolean; why?: string } {
  if (d.type === 'cloze') {
    if (!/\{\{.+?\}\}/.test(d.front)) return { ok: false, why: 'Нет пропуска' };
    if (d.front.length > 220) return { ok: false, why: 'Длинно — лучше сократить до одного факта' };
    return { ok: true };
  }
  if (!d.front.trim() || !d.back.trim()) return { ok: false, why: 'Нет вопроса или ответа' };
  if (d.back.length > 160) return { ok: false, why: 'Длинный ответ — лучше сократить до одного факта' };
  if (sentenceCount(d.back) > 1) return { ok: false, why: 'В ответе несколько фактов — лучше разделить' };
  return { ok: true };
}

/** Порция по умолчанию: не больше `limit` хороших черновиков, по очереди из групп (определение, дата, термин, «Запомни», снова…),
 *  чтобы в порцию попало всего понемногу. Имена и формулы сами не отмечаются (из них редко выходит хороший вопрос). Возвращает номера. */
export function defaultPicks(drafts: (DraftLike & { group: SetGroup })[], limit = 12): Set<number> {
  const order: SetGroup[] = ['defs', 'dates', 'terms', 'boxes'];
  const queues = order.map((g) => drafts.flatMap((d, i) => (d.group === g && draftQuality(d).ok ? [i] : [])));
  const picks = new Set<number>();
  while (picks.size < limit && queues.some((q) => q.length))
    for (const q of queues) if (q.length && picks.size < limit) picks.add(q.shift()!);
  return picks;
}
