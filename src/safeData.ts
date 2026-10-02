// Защита от кривых данных: файл, облако и Wi-Fi-обмен могут принести что угодно, а одна плохая запись не должна вешать приложение.
// Чистые функции без интерфейса.
import type { Exam, NoteVersion, Removed, Topic, TrashEntry } from './types';

/** Контрольные дальше этого числа дней вперёд в планы не берём (годовой план бессмыслен, а считать его дорого). */
export const MAX_PLAN_DAYS = 400;

/** Настоящая дата ГГГГ-ММ-ДД в разумных пределах (2000–2100): 9999-12-31 или 31 февраля — не дата. */
export function validExamDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  if (y < 2000 || y > 2100) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Подтемы без петель. Если на одном устройстве тему A перенесли под B, а на другом B под A, после слияния получается петля A→B→A,
 * и всё, что идёт вверх по родителям, никогда не заканчивалось. Петлю рвём в одном месте — у темы с наименьшим id (на всех устройствах одинаково).
 */
export function breakTopicCycles<T extends Pick<Topic, 'id' | 'parentId'>>(topics: T[]): T[] {
  const parent = new Map<string, string | undefined>(topics.map((t) => [t.id, t.parentId]));
  let changed = false;
  for (const t of topics) {
    const path: string[] = [];
    const at = new Map<string, number>();
    let cur: string | undefined = t.id;
    while (cur !== undefined) {
      const seen = at.get(cur);
      if (seen !== undefined) {
        const loop = path.slice(seen);
        const cut = loop.reduce((a, b) => (b < a ? b : a));
        parent.set(cut, undefined);
        changed = true;
        break;
      }
      at.set(cur, path.length);
      path.push(cur);
      const next: string | undefined = parent.get(cur);
      cur = next && parent.has(next) ? next : undefined;
    }
  }
  if (!changed) return topics;
  return topics.map((t) => {
    if (t.parentId === undefined || parent.get(t.id) === t.parentId) return t;
    const { parentId: _drop, ...rest } = t;
    void _drop;
    return rest as T;
  });
}

/** Контрольная из чужих данных: только строки там, где нужны строки, и настоящая дата; иначе null (запись выбрасывается). */
export function cleanExam(raw: unknown): Exam | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id || e.id.startsWith('topic:')) return null; // «topic:…» — это дата у темы, настоящим id быть не может
  if (typeof e.subjectId !== 'string' || !validExamDate(e.date) || !Array.isArray(e.topicIds)) return null;
  const topicIds = [...new Set(e.topicIds.filter((x): x is string => typeof x === 'string'))];
  if (!topicIds.length) return null;
  const stamp = typeof e.updatedAt === 'string' ? e.updatedAt : typeof e.createdAt === 'string' ? e.createdAt : new Date(0).toISOString();
  return {
    id: e.id,
    subjectId: e.subjectId,
    name: typeof e.name === 'string' && e.name.trim() ? e.name : 'Контрольная',
    date: e.date,
    topicIds,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : stamp,
    updatedAt: stamp
  };
}

/** Дата контрольной у темы: если она не настоящая — убираем (иначе такая дата ломала бы план). */
export function cleanTopics<T extends Pick<Topic, 'id' | 'parentId' | 'examDate'>>(topics: T[]): T[] {
  const fixed = topics.map((t) => (t.examDate !== undefined && !validExamDate(t.examDate) ? { ...t, examDate: undefined } : t));
  return breakTopicCycles(fixed);
}

const isObj = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const withId = (arr: unknown): arr is { id: string }[] => Array.isArray(arr) && arr.every((x) => isObj(x) && typeof x.id === 'string');

/** Корзина из файла: только записи правильной формы, не больше 30; всё остальное выбрасывается. */
export function cleanTrash(raw: unknown): TrashEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: TrashEntry[] = [];
  for (const e of raw) {
    if (!isObj(e) || typeof e.id !== 'string' || typeof e.at !== 'string' || typeof e.label !== 'string' || !isObj(e.removed)) continue;
    const r = e.removed;
    if (!withId(r.subjects) || !withId(r.topics) || !withId(r.cards) || !Array.isArray(r.logs) || !Array.isArray(r.marks) || !isObj(r.states)) continue;
    if (!r.marks.every((m) => typeof m === 'string')) continue;
    out.push({ id: e.id, at: e.at, label: e.label.slice(0, 200), removed: r as unknown as Removed });
    if (out.length >= 30) break;
  }
  return out;
}

/** История конспектов из файла: только для существующих тем (или тех, что в корзине), версии правильной формы, до 15 на тему. */
export function cleanNoteHistory(raw: unknown, topicIds: Set<string>): Record<string, NoteVersion[]> | undefined {
  if (!isObj(raw)) return undefined;
  const out: Record<string, NoteVersion[]> = {};
  for (const [id, list] of Object.entries(raw)) {
    if (!topicIds.has(id) || !Array.isArray(list)) continue;
    const ok = list.filter((v): v is NoteVersion => isObj(v) && typeof v.at === 'string' && typeof v.note === 'string').slice(0, 15);
    if (ok.length) out[id] = ok.map((v) => ({ at: v.at, note: v.note }));
  }
  return Object.keys(out).length ? out : undefined;
}
