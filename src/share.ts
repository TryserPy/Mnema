// Обмен темами: файл .mnema с конспектом и карточками (без личного прогресса).
import { importTopics } from './store';
import type { AppData, Card, Topic } from './types';

export const SHARE_EXT = '.mnema';

interface TopicPackage {
  kind: 'mnema-topic';
  version: 1;
  exportedAt: string;
  subject: { name: string; color: string };
  topic: Pick<Topic, 'name' | 'note'> & Partial<Pick<Topic, 'lists' | 'kind' | 'poems'>>;
  cards: (Pick<Card, 'type' | 'front' | 'back' | 'why'> & Partial<Pick<Card, 'listId'>>)[];
}

/** Сохранить двоичный файл (колода Anki и т. п.). */
export async function downloadBytes(name: string, bytes: Uint8Array, type = 'application/octet-stream'): Promise<boolean> {
  if (window.mnemaApi?.saveFile) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return window.mnemaApi.saveFile(name, btoa(s), type);
  }
  const blob = new Blob([bytes as BlobPart], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}

export function downloadFile(name: string, text: string, type = 'application/json') {
  // На телефоне скачивание из окна не работает — сохраняем через системный диалог.
  if (window.mnemaApi?.saveFile) {
    const bytes = new TextEncoder().encode(text);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    void window.mnemaApi.saveFile(name, btoa(s), type);
    return;
  }
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportTopic(data: AppData, topicId: string) {
  const topic = data.topics.find((t) => t.id === topicId);
  if (!topic) return;
  const subject = data.subjects.find((s) => s.id === topic.subjectId);
  const pkg: TopicPackage = {
    kind: 'mnema-topic',
    version: 1,
    exportedAt: new Date().toISOString(),
    subject: { name: subject?.name ?? 'Без предмета', color: subject?.color ?? '#3A3F4E' },
    topic: { name: topic.name, note: topic.note, ...(topic.lists?.length ? { lists: topic.lists } : {}), ...(topic.kind ? { kind: topic.kind } : {}), ...(topic.poems?.length ? { poems: topic.poems.map((p) => ({ id: p.id, title: p.title, author: p.author, text: p.text, chunk: p.chunk, learned: 0, createdAt: p.createdAt, updatedAt: p.updatedAt })) } : {}) },
    cards: data.cards.filter((c) => c.topicId === topicId).map(({ type, front, back, why, listId }) => ({ type, front, back, why, ...(listId ? { listId } : {}) }))
  };
  const safe = topic.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'тема';
  downloadFile(`${safe}${SHARE_EXT}`, JSON.stringify(pkg, null, 1));
}

export function isTopicPackage(x: unknown): x is TopicPackage {
  const p = x as TopicPackage;
  return Boolean(p && p.kind === 'mnema-topic' && p.topic && typeof p.topic.name === 'string' && Array.isArray(p.cards));
}

const TYPES = new Set(['basic', 'reverse', 'cloze', 'typing', 'problem']);

/** Добавляет тему из файла. Предмет ищется по названию, иначе создаётся. */
export function importTopicPackage(pkg: TopicPackage) {
  const cards = pkg.cards
    .filter((c) => c && TYPES.has(c.type) && typeof c.front === 'string')
    .map((c) => ({ type: c.type, front: String(c.front), back: String(c.back ?? ''), why: c.why ? String(c.why) : undefined, listId: typeof c.listId === 'string' ? c.listId : undefined }));
  const lists = Array.isArray(pkg.topic.lists) ? pkg.topic.lists.filter((l) => l && typeof l.id === 'string' && typeof l.title === 'string' && Array.isArray(l.cols)) : undefined;
  return importTopics([{ subjectName: String(pkg.subject?.name ?? 'Без предмета'), subjectColor: pkg.subject?.color, topic: { name: pkg.topic.name, note: String(pkg.topic.note ?? ''), lists, kind: pkg.topic.kind === 'rule' ? 'rule' : undefined, poems: Array.isArray(pkg.topic.poems) ? pkg.topic.poems.filter((p) => p && typeof p.text === 'string').map((p) => ({ id: String(p.id || Math.random().toString(36).slice(2, 10)), title: String(p.title ?? ''), author: p.author ? String(p.author) : undefined, text: p.text, chunk: Number(p.chunk) || 0, learned: 0, createdAt: String(p.createdAt ?? new Date().toISOString()), updatedAt: new Date().toISOString() })) : undefined }, cards }]);
}
