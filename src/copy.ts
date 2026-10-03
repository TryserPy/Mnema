// Копии: папка, предмет, тема (с подтемами), карточка. Копируется всё содержимое — конспекты, карточки, словари, стихи, фото страниц;
// личный прогресс (повторения, журнал) не копируется — копия начинается с чистого листа.
import type { AppData, Card, Folder, Subject, Topic } from './types';

type Uid = () => string;

/** «Тема» → «Тема (копия)», дальше «Тема (копия 2)» — первое свободное имя среди соседей. */
export function copyName(name: string, taken: Iterable<string>): string {
  const set = new Set([...taken].map((x) => x.trim().toLowerCase()));
  const base = name.replace(/\s*\(копия(?: \d+)?\)$/, '').trim() || name;
  let n = 1;
  for (;;) {
    const candidate = n === 1 ? `${base} (копия)` : `${base} (копия ${n})`;
    if (!set.has(candidate.toLowerCase())) return candidate;
    n++;
  }
}

/** Темы-корни и все их подтемы (того же предмета). */
function branch(d: AppData, rootIds: string[]): Topic[] {
  const out: Topic[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return; // защита от зацикленных parentId в чужих данных
    seen.add(id);
    const t = d.topics.find((x) => x.id === id);
    if (!t) return;
    out.push(t);
    for (const k of d.topics.filter((x) => x.parentId === id && x.subjectId === t.subjectId)) walk(k.id);
  };
  rootIds.forEach(walk);
  return out;
}

export interface CopyPlan {
  topics: Topic[];
  cards: Card[];
  /** id копии корневой темы (для первой из rootIds). */
  firstRootId?: string;
}

/** Копия веток тем в предмет `target.subjectId`. Корни получают `target.parentId` и имя `rootName`, если оно задано. */
export function cloneTopics(d: AppData, rootIds: string[], target: { subjectId: string; parentId?: string; rootName?: (t: Topic) => string }, uid: Uid, stamp: string): CopyPlan {
  const src = branch(d, rootIds);
  const map = new Map<string, string>(src.map((t) => [t.id, uid()]));
  const roots = new Set(rootIds);
  const cards: Card[] = [];
  const maxOrder = Math.max(0, ...d.topics.filter((t) => t.subjectId === target.subjectId && (t.parentId ?? null) === (target.parentId ?? null)).map((t) => t.order ?? 0));
  let rootN = 0;
  const topics = src.map((t) => {
    const id = map.get(t.id)!;
    const isRoot = roots.has(t.id);
    const listMap = new Map<string, string>((t.lists ?? []).map((l) => [l.id, uid()]));
    const poemMap = new Map<string, string>((t.poems ?? []).map((p) => [p.id, uid()]));
    for (const c of d.cards.filter((x) => x.topicId === t.id)) {
      const { leechSeen: _l, ...rest } = c;
      cards.push({ ...rest, id: uid(), topicId: id, ...(c.listId ? { listId: listMap.get(c.listId) ?? c.listId } : {}), createdAt: stamp, updatedAt: stamp });
    }
    const { noteAt: _a, noteFrom: _f, noteBy: _b, source: _s, ...keep } = t;
    const copy: Topic = {
      ...keep,
      id,
      subjectId: target.subjectId,
      parentId: isRoot ? target.parentId : t.parentId ? map.get(t.parentId) : undefined,
      name: isRoot && target.rootName ? target.rootName(t) : t.name,
      ...(isRoot ? { order: maxOrder + 1 + rootN++ } : {}),
      createdAt: stamp,
      updatedAt: stamp
    };
    if (t.lists) copy.lists = t.lists.map((l) => ({ ...l, id: listMap.get(l.id)! }));
    if (t.poems) copy.poems = t.poems.map((p) => ({ id: poemMap.get(p.id)!, title: p.title, author: p.author, text: p.text, chunk: p.chunk, learned: 0, createdAt: stamp, updatedAt: stamp }));
    if (t.tabOrder) copy.tabOrder = t.tabOrder.map((x) => (x.startsWith('list:') ? 'list:' + (listMap.get(x.slice(5)) ?? x.slice(5)) : x.startsWith('poem:') ? 'poem:' + (poemMap.get(x.slice(5)) ?? x.slice(5)) : x));
    if (copy.pages) copy.pages = copy.pages.map((p) => ({ ...p }));
    delete copy.examDate; // дата контрольной — у оригинала, копия её не наследует
    return copy;
  });
  return { topics, cards, firstRootId: rootIds.length ? map.get(rootIds[0]) : undefined };
}

export interface CopyResult {
  data: AppData;
  id: string;
  name: string;
  what: 'topic' | 'subject' | 'folder' | 'card';
}

const withPlan = (d: AppData, plan: CopyPlan): AppData => ({ ...d, topics: [...d.topics, ...plan.topics], cards: [...d.cards, ...plan.cards] });

export function copyTopic(d: AppData, topicId: string, uid: Uid, stamp: string, to?: { subjectId: string; parentId?: string }): CopyResult | null {
  const t = d.topics.find((x) => x.id === topicId);
  if (!t) return null;
  const target = to ?? { subjectId: t.subjectId, parentId: t.parentId };
  if (!d.subjects.some((s) => s.id === target.subjectId)) return null;
  if (target.parentId && !d.topics.some((x) => x.id === target.parentId && x.subjectId === target.subjectId)) return null;
  const siblings = d.topics.filter((x) => x.subjectId === target.subjectId && (x.parentId ?? null) === (target.parentId ?? null) && x.kind === t.kind).map((x) => x.name);
  // В то же место — «(копия)»; в другое место — то же имя, если там такого ещё нет.
  const samePlace = target.subjectId === t.subjectId && (target.parentId ?? null) === (t.parentId ?? null);
  const name = !samePlace && !siblings.some((n) => n.trim().toLowerCase() === t.name.trim().toLowerCase()) ? t.name : copyName(t.name, siblings);
  const plan = cloneTopics(d, [topicId], { subjectId: target.subjectId, parentId: target.parentId, rootName: () => name }, uid, stamp);
  return { data: withPlan(d, plan), id: plan.firstRootId!, name, what: 'topic' };
}

function copySubjectInto(d: AppData, s: Subject, uid: Uid, stamp: string, name: string, folderId: string | undefined): { data: AppData; subject: Subject } {
  const { updatedAt: _u, ...keep } = s;
  const order = Math.max(0, ...d.subjects.map((x) => x.order ?? 0)) + 1;
  const subject: Subject = { ...keep, id: uid(), name, folderId, order, createdAt: stamp, updatedAt: stamp };
  const rootIds = d.topics.filter((t) => t.subjectId === s.id && !t.parentId).map((t) => t.id);
  const plan = cloneTopics(d, rootIds, { subjectId: subject.id }, uid, stamp);
  return { data: { ...withPlan(d, plan), subjects: [...d.subjects, subject] }, subject };
}

export function copySubject(d: AppData, subjectId: string, uid: Uid, stamp: string, to?: { folderId?: string }): CopyResult | null {
  const s = d.subjects.find((x) => x.id === subjectId);
  if (!s) return null;
  const folderId = to ? (to.folderId && d.folders.some((f) => f.id === to.folderId) ? to.folderId : undefined) : s.folderId;
  const siblings = d.subjects.filter((x) => (x.folderId ?? null) === (folderId ?? null)).map((x) => x.name);
  const samePlace = (folderId ?? null) === (s.folderId ?? null);
  const name = !samePlace && !siblings.some((n) => n.trim().toLowerCase() === s.name.trim().toLowerCase()) ? s.name : copyName(s.name, siblings);
  const r = copySubjectInto(d, s, uid, stamp, name, folderId);
  return { data: r.data, id: r.subject.id, name, what: 'subject' };
}

export function copyFolder(d: AppData, folderId: string, uid: Uid, stamp: string): CopyResult | null {
  const f = d.folders.find((x) => x.id === folderId);
  if (!f) return null;
  const name = copyName(f.name, d.folders.map((x) => x.name));
  const { updatedAt: _u, ...keep } = f;
  const folder: Folder = { ...keep, id: uid(), name, order: Math.max(0, ...d.folders.map((x) => x.order ?? 0)) + 1, createdAt: stamp, updatedAt: stamp };
  let out: AppData = { ...d, folders: [...d.folders, folder] };
  for (const s of d.subjects.filter((x) => x.folderId === folderId)) out = copySubjectInto(out, s, uid, stamp, s.name, folder.id).data;
  return { data: out, id: folder.id, name, what: 'folder' };
}

export function copyCard(d: AppData, cardId: string, uid: Uid, stamp: string): CopyResult | null {
  const c = d.cards.find((x) => x.id === cardId);
  if (!c) return null;
  const { leechSeen: _l, ...rest } = c;
  const card: Card = { ...rest, id: uid(), createdAt: stamp, updatedAt: stamp };
  return { data: { ...d, cards: [...d.cards, card] }, id: card.id, name: c.front, what: 'card' };
}
