// Куда вернуться после повторения или контрольной: туда, откуда ученика отправили учиться, — с той же вкладкой.
// Чистые функции (кроме маленького «где я сейчас» внизу), чтобы это можно было проверить тестами.
import { examById } from './examList';
import type { AppData, Route } from './types';

type Review = Extract<Route, { name: 'review' }>;
type Test = Extract<Route, { name: 'test' }>;

/** Маршруты, из которых не возвращаются (сами занятия): запоминать их как «откуда» нельзя. */
export const isStudyRoute = (r: Route): r is Review | Test => r.name === 'review' || r.name === 'test';

/**
 * Дописать к запуску занятия «откуда запустили». Если место уже указано — оставляем.
 * Если запуск идёт с экрана самого занятия (например, «Повторить ошибки») — берём то место, откуда началось оно.
 * `place` — точное место на экране, когда оно шире маршрута (вкладка «Термины» у предмета и выбранный там фильтр).
 */
export function fillBack(r: Route, current: Route, place?: Route | null): Route {
  if (!isStudyRoute(r) || r.back) return r;
  const from = isStudyRoute(current) ? current.back : place && samePage(place, current) ? place : current;
  return from && !isStudyRoute(from) ? { ...r, back: from } : r;
}

/** Это то же самое окно (тот же предмет, та же тема…), просто с подробностями? */
export function samePage(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false;
  const ida = 'id' in a ? a.id : undefined;
  const idb = 'id' in b ? b.id : undefined;
  return ida === idb;
}

/** Есть ли ещё то, куда хотим вернуться (тему могли удалить, пока шло занятие). */
function exists(data: AppData, r: Route): boolean {
  switch (r.name) {
    case 'topic':
      return data.topics.some((t) => t.id === r.id);
    case 'subject':
      return data.subjects.some((s) => s.id === r.id);
    case 'folder':
      return data.folders.some((f) => f.id === r.id);
    case 'exam':
      return Boolean(examById(data, r.id));
    case 'review':
    case 'test':
      return false;
    default:
      return true;
  }
}

/** Как было раньше, когда место не записали: тема → папка → предмет → «Сегодня». */
function legacyBack(r: Review): Route {
  return r.topicId ? { name: 'topic', id: r.topicId } : r.folderId ? { name: 'folder', id: r.folderId } : r.subjectId ? { name: 'subject', id: r.subjectId } : { name: 'today' };
}

/** Куда вернуться из повторения. */
export function reviewBack(data: AppData, r: Review): Route {
  if (r.back && exists(data, r.back)) return r.back;
  const old = legacyBack(r);
  return exists(data, old) ? old : { name: 'today' };
}

/** Куда вернуться из контрольной. */
export function testBack(data: AppData, r: Test): Route {
  if (r.back && exists(data, r.back)) return r.back;
  const old: Route = r.examId ? { name: 'exam', id: r.examId } : { name: 'topic', id: r.topicId };
  return exists(data, old) ? old : { name: 'today' };
}

/** Подпись кнопки «вернуться»: человек видит, куда попадёт. */
export function backLabel(b: Route): string {
  switch (b.name) {
    case 'topic':
      return b.tab === 'cards' ? 'К карточкам' : b.tab?.startsWith('list:') ? 'К списку' : b.tab === 'note' ? 'К конспекту' : 'К теме';
    case 'subject':
      return b.view === 'terms' ? 'К терминам' : b.view === 'rules' ? 'К правилам' : 'К предмету';
    case 'folder':
      return 'К папке';
    case 'exam':
      return 'К подготовке';
    case 'homework':
      return 'К домашке';
    case 'stats':
      return 'К статистике';
    case 'knowledge':
      return 'К карте';
    default:
      return 'На главную';
  }
}

// ---------- Где я сейчас ----------
// Экраны, у которых вкладка живёт у них внутри (предмет → «Термины» → тема), сообщают точное место сюда.
// Берём его только пока этот экран открыт: уйдя с него, он убирает запись.

let place: Route | null = null;
export function setPlace(r: Route | null) {
  place = r;
}
export function getPlace(): Route | null {
  return place;
}

/** Точное место на экране r: запись экрана, если она про него, иначе сам r. */
export function exactPlace(r: Route): Route {
  return place && samePage(place, r) ? place : r;
}
