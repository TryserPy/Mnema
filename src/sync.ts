// Синхронизация: слияние данных двух устройств без потерь.
// Правило простое: из двух версий одной вещи берём более новую; удалённое не «воскресает»,
// если его не меняли после удаления; история ответов объединяется.
import type { AppData, Folder, Homework, ItemState, Subject } from './types';

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
}

/** Слить remote в local. Настройки остаются как на этом устройстве, кроме расписания уроков (берётся объединение). */
export function mergeData(local: AppData, remote: AppData): { data: AppData; report: MergeReport } {
  const deleted: Record<string, string> = { ...(remote.deleted ?? {}) };
  for (const [k, v] of Object.entries(local.deleted ?? {})) if (!deleted[k] || t(v) > t(deleted[k])) deleted[k] = v;
  const report: MergeReport = { added: { subjects: 0, topics: 0, cards: 0, reviews: 0 }, updated: 0, removed: 0 };

  const mergeList = <T extends { id: string; updatedAt?: string; createdAt: string }>(a: T[], b: T[], prefix: string, key: 'subjects' | 'topics' | 'cards' | 'other'): T[] => {
    const map = new Map(a.map((x) => [x.id, x]));
    for (const x of b) {
      const mine = map.get(x.id);
      if (!mine) {
        map.set(x.id, x);
        if (key !== 'other') report.added[key]++;
      } else {
        const w = newer(mine, x);
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
  let topics = mergeList(local.topics, remote.topics, 'topic:', 'topics').filter((x) => subjectIds.has(x.subjectId));
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
  const more = [r.updated ? `обновлено: ${r.updated}` : '', r.removed ? `удалено: ${r.removed}` : ''].filter(Boolean).join(', ');
  return added + (more ? ` Ещё ${more}.` : '');
}
