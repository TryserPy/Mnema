// «Повторить ещё раз»: повторение без изменения расписания по теме (вместе с подтемами), предмету, папке или по всему сразу.
// Берёт не то, что «пора по расписанию», а то, что выбрал человек: повторённое сегодня, всё начатое, слабые места или вообще всё.
// Чистые функции, без интерфейса.
import { allItems, cardsByTopic, dayStart, interleaveByTopic, logsSince, shuffle, type QueueItem, type QueueScope } from './srs';
import { childTopics, sortedFolders, sortedSubjects } from './store';
import { WEAK_FROM, weakItems } from './weakness';
import type { AppData, Folder, RepeatKind, Subject, Topic } from './types';

export type { RepeatKind };

/** Порядок в окне. */
export const REPEAT_KINDS: RepeatKind[] = ['today', 'started', 'weak', 'all'];

export const REPEAT_TEXT: Record<RepeatKind, { title: string; hint: string; short: string }> = {
  today: { title: 'Повторённые сегодня', hint: 'Всё, что ты сегодня уже отвечал, — закрепить ещё раз', short: 'повторённые сегодня' },
  started: { title: 'Все начатые', hint: 'Всё, на что ты уже хоть раз отвечал, даже если ещё рано', short: 'все начатые' },
  weak: { title: 'Слабые места', hint: 'Ошибки, трудные карточки и то, что скоро забудется', short: 'слабые места' },
  all: { title: 'Все карточки', hint: 'Подряд, в том числе ещё не начатые', short: 'все карточки' }
};

/**
 * Где брать карточки: тема (с подтемами), предмет, несколько предметов (папка) или всё (пусто).
 * `topicIds` — выбранные темы «как есть», каждая только со своими карточками (подтемы берутся, только если выбраны тоже):
 * так можно взять карточки из разных тем и предметов. Если задан, остальные поля места не нужны (`cardIds` по-прежнему сужает).
 */
export type RepeatScope = Pick<QueueScope, 'topicId' | 'subjectId' | 'subjectIds' | 'cardIds'> & { topicIds?: string[] };

/** Элементы области: выбранные темы — только их собственные карточки, иначе — как в очереди. */
function scoped(data: AppData, scope: RepeatScope): QueueItem[] {
  if (!scope.topicIds) return allItems(data, scope);
  const topics = new Set(scope.topicIds);
  const only = scope.cardIds ? new Set(scope.cardIds) : null;
  const cardIds: string[] = [];
  for (const c of data.cards) if (topics.has(c.topicId) && (!only || only.has(c.id))) cardIds.push(c.id);
  return allItems(data, { cardIds });
}

/** Все четыре набора за один проход по карточкам области. Слабые идут от самых слабых; остальные — как в очереди. */
function pools(data: AppData, now: Date, scope: RepeatScope): Record<RepeatKind, QueueItem[]> {
  const all = scoped(data, scope);
  const today = new Set(logsSince(data, dayStart(now, data.settings.dayStartHour).getTime()).map((l) => l.key));
  const started = all.filter((it) => (data.states[it.key]?.reps ?? 0) > 0);
  const byKey = new Map(started.map((it) => [it.key, it]));
  const weak: QueueItem[] = [];
  if (started.length) {
    // Оценку слабых мест берём ту же, что в плане к контрольной: риск забыть, ошибки, трудность.
    for (const w of weakItems(data, now, { cardIds: [...new Set(started.map((it) => it.cardId))] })) {
      const it = byKey.get(w.key);
      if (it && w.score >= WEAK_FROM) weak.push(it);
    }
  }
  return { today: all.filter((it) => today.has(it.key)), started, weak, all };
}

/** Сколько карточек в каждом наборе — для окна выбора. */
export function repeatCounts(data: AppData, now: Date, scope: RepeatScope = {}): Record<RepeatKind, number> {
  const p = pools(data, now, scope);
  return { today: p.today.length, started: p.started.length, weak: p.weak.length, all: p.all.length };
}

/** Есть ли в области хоть что-то повторять (дёшево: без журнала и оценки слабых мест) — для кнопок. */
export function hasRepeatable(data: AppData, scope: RepeatScope = {}): boolean {
  return scoped(data, scope).length > 0;
}

/** Что выбрано заранее: повторённое сегодня, а если сегодня ещё ничего не было — всё начатое, а если и его нет — всё. */
export function defaultRepeatKind(c: Record<RepeatKind, number>): RepeatKind {
  return c.today ? 'today' : c.started ? 'started' : 'all';
}

/** Очередь «Повторить ещё раз». Все, кроме слабых, перемешаны и чередуются по темам; слабые — от самых слабых, чтобы «первые N» были самыми нужными. */
export function buildRepeatQueue(data: AppData, now: Date, scope: RepeatScope, kind: RepeatKind, rnd: () => number = Math.random): QueueItem[] {
  const list = pools(data, now, scope)[kind];
  return kind === 'weak' ? list : interleaveByTopic(shuffle(list, rnd));
}

// ---------- Список тем для выбора ----------

export interface RepeatRow {
  t: Topic;
  depth: number;
  /** Карточек в самой теме (без подтем). */
  own: number;
  /** Карточек в теме вместе с подтемами: темы, где их нет совсем, в списке не показываем. */
  deep: number;
  /** Правило или общие термины предмета — не обычная тема. */
  tag?: string;
}
export interface RepeatSubject {
  subject: Subject;
  rows: RepeatRow[];
}
export interface RepeatGroup {
  folder?: Folder;
  subjects: RepeatSubject[];
}

/** Папки → предметы → темы (подтемы с отступом), только то, где есть карточки. Предметы вне папок — в конце, без заголовка. */
export function repeatTopicTree(data: AppData): RepeatGroup[] {
  const byTopic = cardsByTopic(data);
  const ownOf = (id: string) => byTopic.get(id)?.length ?? 0;
  const subjectRows = (subject: Subject): RepeatSubject | null => {
    const all: RepeatRow[] = [];
    const walk = (parentId: string | undefined, depth: number) => {
      for (const t of childTopics(data, subject.id, parentId)) {
        all.push({ t, depth, own: ownOf(t.id), deep: 0 });
        walk(t.id, depth + 1);
      }
    };
    walk(undefined, 0);
    for (const t of data.topics) if (t.subjectId === subject.id && t.kind) all.push({ t, depth: 0, own: ownOf(t.id), deep: 0, tag: t.kind === 'rule' ? 'правило' : 'термины' });
    // Подтемы идут сразу за своей темой, поэтому «вместе с подтемами» — это она сама и все следующие строки глубже неё.
    for (let i = 0; i < all.length; i++) {
      let deep = all[i].own;
      for (let j = i + 1; j < all.length && all[j].depth > all[i].depth; j++) deep += all[j].own;
      all[i].deep = deep;
    }
    const rows = all.filter((r) => r.deep > 0);
    return rows.length ? { subject, rows } : null;
  };
  const subjects = sortedSubjects(data);
  const groups: RepeatGroup[] = [];
  for (const folder of sortedFolders(data)) {
    const list = subjects.filter((s) => s.folderId === folder.id).map(subjectRows).filter((x): x is RepeatSubject => x !== null);
    if (list.length) groups.push({ folder, subjects: list });
  }
  const loose = subjects.filter((s) => !s.folderId || !data.folders.some((f) => f.id === s.folderId)).map(subjectRows).filter((x): x is RepeatSubject => x !== null);
  if (loose.length) groups.push({ subjects: loose });
  return groups;
}
