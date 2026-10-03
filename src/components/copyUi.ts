// Общий жест «Сделать копию»: копируем и сразу говорим, что получилось, — с кнопкой «Открыть».
import { duplicateCard, duplicateFolder, duplicateSubject, duplicateTopic } from '../store';
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
