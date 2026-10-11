// План импорта (src/mdImport.ts) → данные приложения: папки, предметы, темы с подтемами, словари, стихи, карточки.
// Чистая функция: берёт данные и возвращает новые; запись и сохранение делает store.importTree.
import { cleanIconImg } from './iconImage';
import { noteEdit } from './noteText';
import type { ImportPlan } from './mdImport';
import type { AppData, Card, Folder, Poem, StudyList, Subject, Topic } from './types';

export interface ApplyResult {
  data: AppData;
  folders: number;
  subjects: number;
  topics: number;
  cards: number;
  firstTopicId?: string;
}

const LINK = /mnema:\/\/topic\/(pk-\d+)/g;

export function applyImportPlan(d: AppData, plan: ImportPlan, uid: () => string, stamp: string, targetSubjectId?: string): ApplyResult {
  let folders = d.folders ?? [];
  let subjects = d.subjects;
  let nFolders = 0;
  let nSubjects = 0;
  const treeOpen: string[] = [];

  const folderIds = new Map<string, string>(); // имя папки (строчные) → id
  const subjectIds = new Map<string, string>(); // «папка/предмет» → id
  const lc = (s: string) => s.trim().toLowerCase();

  const folderFor = (t: ImportPlan['topics'][number]): string | undefined => {
    if (!t.folderName || targetSubjectId) return undefined;
    const k = lc(t.folderName);
    let id = folderIds.get(k) ?? folders.find((f) => lc(f.name) === k)?.id;
    if (!id) {
      const f: Folder = {
        id: uid(),
        name: t.folderName.trim() || 'Папка',
        color: t.folderColor ?? '#3A3F4E',
        ...(t.folderIcon ? { icon: t.folderIcon } : {}),
        ...(cleanIconImg(t.folderIconImg) ? { iconImg: t.folderIconImg } : {}),
        order: Math.max(0, ...folders.map((x) => x.order ?? 0)) + 1,
        createdAt: stamp,
        updatedAt: stamp
      };
      folders = [...folders, f];
      treeOpen.push(f.id);
      nFolders++;
      id = f.id;
    }
    folderIds.set(k, id);
    return id;
  };

  const subjectFor = (t: ImportPlan['topics'][number]): string => {
    if (targetSubjectId) return targetSubjectId;
    const folderId = folderFor(t);
    const k = lc(t.subjectName);
    const cached = subjectIds.get(k);
    if (cached) return cached;
    let s: Subject | undefined = subjects.find((x) => lc(x.name) === k);
    if (!s) {
      s = {
        id: uid(),
        name: t.subjectName.trim() || 'Без предмета',
        color: t.subjectColor ?? '#3A3F4E',
        ...(t.subjectIcon ? { icon: t.subjectIcon } : {}),
        ...(cleanIconImg(t.subjectIconImg) ? { iconImg: t.subjectIconImg } : {}),
        ...(folderId ? { folderId } : {}),
        order: Math.max(0, ...subjects.map((x) => x.order ?? 0)) + 1,
        createdAt: stamp
      };
      subjects = [...subjects, s];
      nSubjects++;
    }
    subjectIds.set(k, s.id);
    return s.id;
  };

  // Сначала id всех тем — ссылки между ними заменяются на настоящие
  const ids = new Map(plan.topics.map((t) => [t.key, uid()]));
  const subjectOf = new Map(plan.topics.map((t) => [t.key, subjectFor(t)]));
  const siblingN = new Map<string, number>();
  const topics: Topic[] = [];
  const cards: Card[] = [];

  for (const t of plan.topics) {
    const id = ids.get(t.key)!;
    const subjectId = subjectOf.get(t.key)!;
    const parent = t.parentKey && subjectOf.get(t.parentKey) === subjectId ? ids.get(t.parentKey) : undefined;
    const group = `${subjectId}|${parent ?? ''}|${t.kind ?? ''}`;
    const order = (siblingN.get(group) ?? 0) + 1 + d.topics.filter((x) => x.subjectId === subjectId && (x.parentId ?? '') === (parent ?? '') && (x.kind ?? '') === (t.kind ?? '')).length;
    siblingN.set(group, (siblingN.get(group) ?? 0) + 1);

    // Старые id словарей заменяются новыми
    const listMap = new Map<string, string>();
    const lists: StudyList[] | undefined = t.lists?.map((l) => {
      const nid = uid().slice(0, 8);
      listMap.set(l.id, nid);
      return { ...l, id: nid };
    });
    const note = t.note.replace(LINK, (_m, key: string) => (ids.has(key) ? `mnema://topic/${ids.get(key)}` : '#'));
    const poems: Poem[] | undefined = t.poems?.map((p) => ({ id: uid(), title: p.title, ...(p.author ? { author: p.author } : {}), text: p.text, chunk: 0, learned: 0, createdAt: stamp, updatedAt: stamp }));
    topics.push({
      id,
      subjectId,
      name: t.name,
      note,
      ...(note.trim() ? noteEdit({}, d.deviceId, stamp) : {}),
      source: `markdown:${t.path}`,
      ...(parent ? { parentId: parent } : {}),
      ...(t.kind ? { kind: t.kind } : {}),
      ...(t.examDate ? { examDate: t.examDate } : {}),
      ...(t.important ? { important: true } : {}),
      order,
      ...(lists?.length ? { lists } : {}),
      ...(poems?.length ? { poems } : {}),
      ...(t.pages?.length ? { pages: t.pages } : {}),
      createdAt: t.createdAt ?? stamp,
      updatedAt: stamp
    });
    for (const c of t.cards) {
      cards.push({ id: uid(), topicId: id, type: c.type, front: c.front, back: c.back, ...(c.why ? { why: c.why } : {}), ...(c.listId && listMap.has(c.listId) ? { listId: listMap.get(c.listId) } : {}), createdAt: stamp, updatedAt: stamp });
    }
  }

  const out: AppData = {
    ...d,
    folders,
    subjects,
    topics: [...d.topics, ...topics],
    cards: [...d.cards, ...cards],
    settings: treeOpen.length ? { ...d.settings, treeOpen: [...d.settings.treeOpen, ...treeOpen] } : d.settings
  };
  return { data: out, folders: nFolders, subjects: nSubjects, topics: topics.length, cards: cards.length, firstTopicId: topics[0]?.id };
}
