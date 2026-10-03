// Общий жест «Сделать копию»: копируем и сразу говорим, что получилось, — с кнопкой «Открыть».
import { duplicateCard, duplicateFolder, duplicateSubject, duplicateTopic, getData, pasteCopies, type ClipItem, type PastePlace } from '../store';
import { plural } from './ui';
import type { Route } from '../types';
import { toast } from './ui';

export type CopyKind = 'topic' | 'subject' | 'folder' | 'card';

export function makeCopy(kind: CopyKind, id: string, go: (r: Route) => void) {
  const r = kind === 'topic' ? duplicateTopic(id) : kind === 'subject' ? duplicateSubject(id) : kind === 'folder' ? duplicateFolder(id) : duplicateCard(id);
  if (!r) {
    toast('Не получилось сделать копию');
    return;
  }
  const open: Route | null = kind === 'topic' ? { name: 'topic', id: r.id } : kind === 'subject' ? { name: 'subject', id: r.id } : kind === 'folder' ? { name: 'folder', id: r.id } : null;
  const label = kind === 'card' ? 'Карточка скопирована' : `Копия готова: «${r.name}»`;
  toast(label, open ? { label: 'Открыть', run: () => go(open) } : undefined);
}

// ---------- Ctrl+C / Ctrl+V ----------
// Буфер — внутри Мнемы (в системный буфер уходит только текст при обычном копировании).
let clip: ClipItem[] = [];

const what = (items: ClipItem[]) => {
  if (items.length === 1) {
    const d = getData();
    const it = items[0];
    const name = it.kind === 'folder' ? d.folders.find((x) => x.id === it.id)?.name : it.kind === 'subject' ? d.subjects.find((x) => x.id === it.id)?.name : d.topics.find((x) => x.id === it.id)?.name;
    return `«${name ?? ''}»`;
  }
  return `${items.length} ${plural(items.length, 'вещь', 'вещи', 'вещей')}`;
};

/** Убираем лишнее: тему, если скопирован её родитель, предмет — если скопирована его папка (иначе получилось бы две копии). */
export function cleanClip(items: ClipItem[]): ClipItem[] {
  const d = getData();
  const has = new Set(items.map((i) => i.kind[0] + ':' + i.id));
  return items.filter((it) => {
    if (it.kind === 'subject') {
      const f = d.subjects.find((s) => s.id === it.id)?.folderId;
      return !(f && has.has('f:' + f));
    }
    if (it.kind === 'topic') {
      const t = d.topics.find((x) => x.id === it.id);
      if (!t || has.has('s:' + t.subjectId)) return false;
      const sf = d.subjects.find((s) => s.id === t.subjectId)?.folderId;
      if (sf && has.has('f:' + sf)) return false;
      for (let p = t.parentId, g = 0; p && g < 500; g++) {
        if (has.has('t:' + p)) return false;
        p = d.topics.find((x) => x.id === p)?.parentId;
      }
    }
    return true;
  });
}

export function copyToClip(items: ClipItem[]) {
  clip = cleanClip(items);
  if (clip.length) toast(`Скопировано: ${what(clip)}. Вставить — Ctrl+V`);
}

export const hasClip = () => clip.length > 0;

export function pasteClip(place: PastePlace, go: (r: Route) => void) {
  if (!clip.length) return;
  const done = pasteCopies(clip, place);
  if (!done.length) {
    toast('Нечего вставить: скопированное уже удалено');
    return;
  }
  const one = done.length === 1 ? done[0] : null;
  const open: Route | null = one ? (one.what === 'topic' ? { name: 'topic', id: one.id } : one.what === 'subject' ? { name: 'subject', id: one.id } : one.what === 'folder' ? { name: 'folder', id: one.id } : null) : null;
  toast(one ? `Вставлено: «${one.name}»` : `Вставлено: ${done.length} ${plural(done.length, 'копия', 'копии', 'копий')}`, open ? { label: 'Открыть', run: () => go(open) } : undefined);
}
