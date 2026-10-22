// «Назад» на телефоне (1.34): вверх по тому, где ты находишься, а не сразу на «Сегодня».
// Тема → родительская тема → предмет → папка → «Знания» → «Учусь»; разделы профиля → «Профиль» → «Учусь».
// Повторение и тест решают сами (App.tsx), на «Учусь» — выход с подтверждением.
import type { AppData, Route } from './types';

export function backRoute(r: Route, d: Pick<AppData, 'topics' | 'subjects' | 'folders'>): Route | null {
  switch (r.name) {
    case 'today':
      return null;
    case 'topic': {
      const t = d.topics.find((x) => x.id === r.id);
      if (!t) return { name: 'knowledge' };
      if (t.parentId && d.topics.some((x) => x.id === t.parentId)) return { name: 'topic', id: t.parentId };
      if (d.subjects.some((s) => s.id === t.subjectId)) return t.kind === 'rule' ? { name: 'subject', id: t.subjectId, view: 'rules' } : { name: 'subject', id: t.subjectId };
      return { name: 'knowledge' };
    }
    case 'subject': {
      if (r.view && r.view !== 'topics') return { name: 'subject', id: r.id };
      const s = d.subjects.find((x) => x.id === r.id);
      return s?.folderId && d.folders.some((f) => f.id === s.folderId) ? { name: 'folder', id: s.folderId } : { name: 'knowledge' };
    }
    case 'folder':
    case 'exam':
      return { name: 'knowledge' };
    case 'settings':
      return r.section ? { name: 'settings' } : { name: 'profile' };
    case 'stats':
    case 'trash':
    case 'features':
    case 'help':
      return { name: 'profile' };
    default:
      return { name: 'today' };
  }
}

/** Второе «Назад» на «Учусь» в течение этого времени закрывает приложение. */
export const EXIT_WINDOW_MS = 2500;

export function confirmExit(lastPress: number | null, now: number): boolean {
  return lastPress !== null && now - lastPress <= EXIT_WINDOW_MS;
}
