// Синхронизация: слияние данных двух устройств без потерь.
// Правило простое: из двух версий одной вещи берём более новую; удалённое не «воскресает»,
// если его не меняли после удаления; история ответов объединяется.
// Исключение — тема: её текст конспекта сливается отдельно от остальных полей (по noteAt), а если текст правили на двух
// устройствах независимо, проигравший не пропадает, а остаётся копией темы.
import { canonNote, noteHash, sameNote } from './noteText';
import type { AppData, Folder, Homework, ItemState, Subject, Topic } from './types';

const t = (s?: string) => (s ? Date.parse(s) || 0 : 0);

function newer<T extends { updatedAt?: string; createdAt: string }>(a: T, b: T): T {
  return t(b.updatedAt ?? b.createdAt) > t(a.updatedAt ?? a.createdAt) ? b : a;
}

function stateNewer(a: ItemState, b: ItemState): ItemState {
  const la = t(a.last_review);
  const lb = t(b.last_review);
  if (lb !== la) return lb > la ? b : a;
  return b.reps > a.reps ? b : a;
}

export interface MergeReport {
  added: { subjects: number; topics: number; cards: number; reviews: number };
  updated: number;
  removed: number;
  conflicts?: number; // сколько копий тем сделано, потому что текст конспекта правили на двух устройствах независимо
}

export const CONFLICT_SUFFIX = ' (копия с другого устройства)';

/**
 * Правили ли текст на двух устройствах независимо (тогда проигравший текст нельзя просто выбросить).
 * Не независимо, если: тексты одинаковы по смыслу; один — начало другого (дописали или отрезали хвост);
 * правки с одного устройства (одна цепочка); проигравший текст — это то, от чего победитель начал править
 * (lose.noteAt не позже win.noteFrom — обычное «правил на телефоне, потом на компьютере»).
 * Пустой текст «началом» не считается: стёрли всё — а другая сторона писала независимо.
 */
export function independentNotes(win: Topic, lose: Topic): boolean {
  if (sameNote(win.note, lose.note)) return false;
  const a = canonNote(win.note);
  const b = canonNote(lose.note);
  if (!b) return false; // у проигравшего нечего сохранять
  if (a && (a.startsWith(b) || b.startsWith(a))) return false;
  if (win.noteBy && win.noteBy === lose.noteBy) return false;
  return t(lose.noteAt) > t(win.noteFrom);
}

/**
 * Слить две версии одной темы по полям. Всё, кроме текста конспекта, — от версии с более новым updatedAt (w).
 * Текст — от версии с более новым noteAt: иначе ★ или дата, поставленные на телефоне позже (updatedAt новее),
 * молча затирали бы текст, который на компьютере правили раньше. Правила выбора текста:
 *  • noteAt нет ни у кого (старые данные) — текст от w, как было всегда;
 *  • noteAt только у одной — берём её: это точно правка текста, а у другой текст после этой версии не менялся,
 *    свежий updatedAt там — от других полей (две версии приложения вперемешку — редкий случай, риск принят);
 *  • у обеих — новее noteAt; при равенстве — новее updatedAt, затем больший текст (чтобы итог не зависел от порядка слияния).
 * noteAt, noteFrom и noteBy итога — те же, что у выбранного текста (то есть noteAt — наибольший).
 * Если правки независимы (independentNotes), проигравший текст отдаётся в conflicts — для копии темы.
 */
function mergeTopic(a: Topic, b: Topic, conflicts: { of: string; copy: Topic }[]): Topic {
  const w = newer(a, b);
  const hasA = Boolean(a.noteAt);
  const hasB = Boolean(b.noteAt);
  if (!hasA && !hasB) return w;
  let src: Topic;
  if (hasA !== hasB) src = hasA ? a : b;
  else if (t(a.noteAt) !== t(b.noteAt)) src = t(a.noteAt) > t(b.noteAt) ? a : b;
  else src = t(a.updatedAt ?? a.createdAt) === t(b.updatedAt ?? b.createdAt) ? (b.note > a.note ? b : a) : w;
  const lose = src === a ? b : a;
  if (hasA && hasB && independentNotes(src, lose)) conflicts.push({ of: w.id, copy: conflictCopy(w, lose) });
  if (src === w || (src.note === w.note && src.noteAt === w.noteAt && src.noteFrom === w.noteFrom && src.noteBy === w.noteBy)) return w;
  return { ...w, note: src.note, noteAt: src.noteAt, noteFrom: src.noteFrom, noteBy: src.noteBy };
}

/**
 * Копия темы с проигравшим текстом. id зависит только от темы и текста — на обоих устройствах получится одна и та же
 * тема, и повторная синхронизация не плодит дубли; время — время самой правки (не «сейчас»), поэтому удалённую
 * ученицей копию слияние не воскресит (метка удаления новее).
 */
function conflictCopy(base: Topic, lose: Topic): Topic {
  const at = lose.noteAt!;
  return {
    id: `conflict-${base.id}-${noteHash(lose.note)}`,
    subjectId: base.subjectId,
    ...(base.parentId ? { parentId: base.parentId } : {}),
    ...(base.kind === 'rule' ? { kind: 'rule' as const } : {}),
    name: base.name.endsWith(CONFLICT_SUFFIX) ? base.name : base.name + CONFLICT_SUFFIX,
    note: lose.note,
    noteAt: at,
    ...(lose.noteFrom ? { noteFrom: lose.noteFrom } : {}),
    ...(lose.noteBy ? { noteBy: lose.noteBy } : {}),
    ...(base.order !== undefined ? { order: base.order } : {}),
    createdAt: at,
    updatedAt: at
  };
}

/** Слить remote в local. Настройки остаются как на этом устройстве, кроме расписания уроков (берётся объединение). */
export function mergeData(local: AppData, remote: AppData): { data: AppData; report: MergeReport } {
  const deleted: Record<string, string> = { ...(remote.deleted ?? {}) };
  for (const [k, v] of Object.entries(local.deleted ?? {})) if (!deleted[k] || t(v) > t(deleted[k])) deleted[k] = v;
  const report: MergeReport = { added: { subjects: 0, topics: 0, cards: 0, reviews: 0 }, updated: 0, removed: 0 };

  const mergeList = <T extends { id: string; updatedAt?: string; createdAt: string }>(a: T[], b: T[], prefix: string, key: 'subjects' | 'topics' | 'cards' | 'other', combine?: (mine: T, theirs: T) => T): T[] => {
    const map = new Map(a.map((x) => [x.id, x]));
    for (const x of b) {
      const mine = map.get(x.id);
      if (!mine) {
        map.set(x.id, x);
        if (key !== 'other') report.added[key]++;
      } else {
        const w = combine ? combine(mine, x) : newer(mine, x);
        if (w !== mine) report.updated++;
        map.set(x.id, w);
      }
    }
    const out: T[] = [];
    for (const x of map.values()) {
      const del = deleted[prefix + x.id];
      if (del && t(del) >= t(x.updatedAt ?? x.createdAt)) {
        if (a.some((y) => y.id === x.id)) report.removed++;
        continue;
      }
      out.push(x);
    }
    return out;
  };

  const folders = mergeList<Folder>(local.folders ?? [], remote.folders ?? [], 'folder:', 'other');
  const folderIds = new Set(folders.map((f) => f.id));
  const subjects = mergeList<Subject>(local.subjects, remote.subjects, 'subj:', 'subjects').map((s) => (s.folderId && !folderIds.has(s.folderId) ? { ...s, folderId: undefined } : s));
  const subjectIds = new Set(subjects.map((s) => s.id));
  const homework = mergeList<Homework>(local.homework ?? [], remote.homework ?? [], 'hw:', 'other');
  const conflicts: { of: string; copy: Topic }[] = [];
  let topics = mergeList<Topic>(local.topics, remote.topics, 'topic:', 'topics', (a, b) => mergeTopic(a, b, conflicts)).filter((x) => subjectIds.has(x.subjectId));
  // Текст, проигравший при независимых правках, — отдельной темой рядом (если такой копии ещё нет и её не удаляли).
  const haveTopic = new Set(topics.map((x) => x.id));
  for (const { of, copy } of conflicts) {
    const del = deleted['topic:' + copy.id];
    if (haveTopic.has(copy.id) || !haveTopic.has(of) || (del && t(del) >= t(copy.updatedAt))) continue;
    topics.push(copy);
    haveTopic.add(copy.id);
    report.conflicts = (report.conflicts ?? 0) + 1;
  }
  // Подтема без родителя (родителя удалили) становится обычной темой.
  const topicIds = new Set(topics.map((x) => x.id));
  topics = topics.map((x) => (x.parentId && !topicIds.has(x.parentId) ? { ...x, parentId: undefined } : x));
  const cards = mergeList(local.cards, remote.cards, 'card:', 'cards').filter((c) => topicIds.has(c.topicId));
  const cardIds = new Set(cards.map((c) => c.id));

  const states: Record<string, ItemState> = { ...local.states };
  for (const [k, v] of Object.entries(remote.states)) states[k] = states[k] ? stateNewer(states[k], v) : v;
  for (const k of Object.keys(states)) {
    const del = deleted['state:' + k];
    if (!cardIds.has(k.split(':')[0]) || (del && t(del) >= t(states[k].last_review))) delete states[k];
  }

  const seen = new Set(local.logs.map((l) => l.key + '|' + l.at));
  const logs = [...local.logs];
  for (const l of remote.logs)
    if (!seen.has(l.key + '|' + l.at)) {
      logs.push(l);
      seen.add(l.key + '|' + l.at);
      report.added.reviews++;
    }
  logs.sort((a, b) => a.at.localeCompare(b.at));

  const testIds = new Set(local.tests.map((x) => x.id));
  const tests = [...local.tests, ...remote.tests.filter((x) => !testIds.has(x.id))];

  const schedule: Record<string, string[]> = { ...local.settings.schedule };
  // Уроки дня: к своим добавляем с другого устройства те, которых у нас меньше (предмет может стоять дважды).
  for (const [d, ids] of Object.entries(remote.settings?.schedule ?? {})) {
    const out = [...(schedule[d] ?? [])];
    const count = (arr: string[], id: string) => arr.filter((x) => x === id).length;
    for (const id of ids) if (count(ids, id) > count(out, id)) out.push(id);
    schedule[d] = out.filter((id) => subjectIds.has(id));
  }

  // Старые отметки об удалении (больше 180 дней) можно забыть.
  const cutoff = Date.now() - 180 * 86400000;
  for (const [k, v] of Object.entries(deleted)) if (t(v) < cutoff) delete deleted[k];

  return {
    data: { ...local, folders, homework, subjects, topics, cards, states, logs: logs.filter((l) => cardIds.has(l.cardId)), tests, deleted, settings: { ...local.settings, schedule } },
    report
  };
}

export function reportText(r: MergeReport): string {
  const parts: string[] = [];
  const a = r.added;
  if (a.subjects) parts.push(`предметов: ${a.subjects}`);
  if (a.topics) parts.push(`тем: ${a.topics}`);
  if (a.cards) parts.push(`карточек: ${a.cards}`);
  if (a.reviews) parts.push(`повторений: ${a.reviews}`);
  const added = parts.length ? `Добавлено — ${parts.join(', ')}.` : 'Нового не было.';
  const more = [r.updated ? `обновлено: ${r.updated}` : '', r.removed ? `удалено: ${r.removed}` : '', r.conflicts ? `копий при конфликте: ${r.conflicts}` : ''].filter(Boolean).join(', ');
  return added + (more ? ` Ещё ${more}.` : '');
}
