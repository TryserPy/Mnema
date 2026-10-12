// «Что учить» в теме, предмете и папке: всё, только обычные карточки, только строки списков (термины, словари, даты, формулы)
// или один конкретный список. Чистые функции; выбор запоминается в настройках (studyPick) отдельно для каждой темы, предмета и папки.
import { allItems, type QueueScope } from './srs';
import type { AppData, ListKind, StudySource } from './types';

export type StudyPick = 'all' | 'cards' | 'lists' | `list:${string}`;

const PICK = /^(all|cards|lists|list:[\w-]{1,60})$/;

/** Ключ запоминания: тема, предмет или папка. */
export const pickKeyOf = (where: { topicId?: string; subjectId?: string; folderId?: string }): string | null =>
  where.topicId ? 't:' + where.topicId : where.subjectId ? 's:' + where.subjectId : where.folderId ? 'f:' + where.folderId : null;

export function parsePick(v: unknown): StudyPick {
  return typeof v === 'string' && PICK.test(v) ? (v as StudyPick) : 'all';
}

/** Выбор из настроек (после загрузки из файла): только понятные записи, не больше 300 — чтобы не копился мусор. «Всё» не храним: это и так по умолчанию. */
export function cleanStudyPick(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= 300) break;
    if (!/^[tsf]:[\w-]{1,60}$/.test(k) || typeof v !== 'string' || v === 'all' || !PICK.test(v)) continue;
    out[k] = v;
    n++;
  }
  return n ? out : undefined;
}

/** Что дописать к области очереди, чтобы взять только выбранное. */
export function pickScope(pick: StudyPick): { source?: StudySource; listId?: string } {
  if (pick === 'cards' || pick === 'lists') return { source: pick };
  if (pick.startsWith('list:')) return { listId: pick.slice(5) };
  return {};
}

export interface PickOption {
  pick: StudyPick;
  label: string;
  hint?: string;
  /** Сколько всего элементов повторения (сторон карточек и строк) в этом выборе. */
  n: number;
}

const LIST_WORD: Record<ListKind, string> = { terms: 'термины', vocab: 'словари', custom: 'свои списки', dates: 'даты', formulas: 'формулы' };

/** Как назвать «только списки» по тому, что там есть. */
export function listsLabel(kinds: ListKind[]): string {
  const set = new Set(kinds);
  if (set.size === 1 && (set.has('terms') || set.has('vocab'))) return set.has('terms') ? 'Только термины' : 'Только словари';
  if (!set.has('dates') && !set.has('formulas')) return 'Только термины и словари';
  return 'Только списки';
}

/**
 * Какие варианты «что учить» есть в этой области. Пусто — выбирать не из чего (только карточки, или один список):
 * тогда меню не показываем, кнопка «Учить» остаётся одной, как раньше.
 */
export function pickOptions(data: AppData, base: QueueScope): PickOption[] {
  const items = allItems(data, base);
  if (!items.length) return [];
  const cardById = new Map(data.cards.map((c) => [c.id, c]));
  let nCards = 0;
  const byList = new Map<string, number>();
  for (const it of items) {
    const lid = cardById.get(it.cardId)?.listId;
    if (lid) byList.set(lid, (byList.get(lid) ?? 0) + 1);
    else nCards++;
  }
  const nLists = items.length - nCards;
  const mixed = nCards > 0 && nLists > 0;
  if (!mixed && byList.size < 2) return [];
  // Где лежат списки: чтобы назвать их и понять, какие виды в области.
  const info = new Map<string, { title: string; kind: ListKind; topic: string }>();
  for (const t of data.topics) for (const l of t.lists ?? []) if (byList.has(l.id)) info.set(l.id, { title: l.title, kind: l.kind, topic: t.name });
  const kinds = [...info.values()].map((x) => x.kind);
  const out: PickOption[] = [{ pick: 'all', label: 'Всё', hint: 'Карточки и списки вместе', n: items.length }];
  if (mixed) {
    out.push({ pick: 'cards', label: 'Только карточки', hint: 'Без строк терминов, словарей, дат и формул', n: nCards });
    out.push({ pick: 'lists', label: listsLabel(kinds), hint: [...new Set(kinds.map((k) => LIST_WORD[k]))].join(', '), n: nLists });
  }
  if (byList.size >= 2) {
    // В области несколько тем — к названию списка добавляем тему, иначе «Слова» из разных тем не отличить.
    const topics = new Set([...info.values()].map((x) => x.topic));
    const rows = [...byList.entries()].map(([id, n]) => ({ id, n, i: info.get(id) })).filter((x) => x.i);
    rows.sort((a, b) => (a.i!.topic + a.i!.title).localeCompare(b.i!.topic + b.i!.title, 'ru'));
    for (const r of rows.slice(0, 12)) out.push({ pick: `list:${r.id}`, label: topics.size > 1 ? `${r.i!.topic} · ${r.i!.title}` : r.i!.title, n: r.n });
  }
  return out;
}

/** Выбор, который можно применить: если списка уже нет или выбирать не из чего — «всё». */
export function validPick(pick: StudyPick, options: PickOption[]): StudyPick {
  return options.some((o) => o.pick === pick) ? pick : 'all';
}
