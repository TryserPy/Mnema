// Навигация 1.31: повторное нажатие на кнопку экрана (Настройки, Статистика, Справка…) возвращает туда, где был;
// после перезапуска приложение открывается там же, где его закрыли (если прошло не больше 12 часов); вкладка темы помнится.
import { exists } from './studyBack';
import { recall, remember } from './uiMemory';
import type { AppData, Route } from './types';

/** Экраны-«кнопки»: второе нажатие на такую кнопку — назад. */
const TOGGLES = new Set<Route['name']>(['settings', 'features', 'stats', 'help', 'trash', 'homework', 'knowledge', 'profile']);
const FRESH_MS = 12 * 3600 * 1000;

/** Нажали кнопку экрана, на котором уже стоим, — куда вернуться (или null: обычный переход). */
export function toggleBack(r: Route, cur: Route, last: Route | null): Route | null {
  if (!last || r.name !== cur.name || !TOGGLES.has(r.name) || last.name === cur.name) return null;
  // Переход с параметром («Настройки → ИИ» из подсказки) — это не кнопка, а ссылка: не назад.
  if (('section' in r && r.section) || ('tab' in r && r.tab)) return null;
  return last;
}

/** Где ученик был: повторение и тест не восстанавливаем (только экран, откуда их запустили). */
export function placeToSave(r: Route): Route | null {
  if (r.name === 'review' || r.name === 'test') return r.back ?? null;
  if (r.name === 'plugin') return null;
  return r;
}

export function saveRoute(r: Route, now = Date.now()): void {
  const p = placeToSave(r);
  if (p) remember('route', { r: p, at: now });
  if (r.name === 'topic' && r.tab) remember('tab:' + r.id, r.tab);
}

/** Экран при запуске: сохранённый (свежий и существующий) или «Сегодня». */
export function startRoute(data: AppData, now = Date.now()): Route {
  const saved = recall<{ r?: Route; at?: number } | null>('route', null);
  const r = saved?.r;
  if (!r || typeof r !== 'object' || typeof r.name !== 'string' || !saved?.at || now - saved.at > FRESH_MS) return { name: 'today' };
  return exists(data, r) ? r : { name: 'today' };
}

/** Тема без вкладки — та вкладка, что была открыта в прошлый раз. */
export function withTab(r: Route): Route {
  if (r.name !== 'topic' || r.tab) return r;
  const tab = recall<string | null>('tab:' + r.id, null);
  return tab ? { ...r, tab } : r;
}
