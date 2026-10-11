// «Что учить» рядом с кнопкой «Учить»: всё / только карточки / только термины и словари / один список.
// Меню появляется, только если есть из чего выбирать; без него кнопка «Учить» одна, как и была.
import { useMemo } from 'react';
import { todayCounts, type QueueScope } from '../srs';
import { parsePick, pickKeyOf, pickOptions, pickScope, validPick, type PickOption, type StudyPick } from '../studyPick';
import { updateSettings, useData } from '../store';
import type { Route } from '../types';
import { MoreMenu, toast, type MenuItem } from './ui';

type ReviewRoute = Extract<Route, { name: 'review' }>;

export interface StudyWhere {
  topicId?: string;
  subjectId?: string;
  folderId?: string;
  subjectIds?: string[]; // предметы папки
}

/** Область очереди и поля маршрута «откуда запущено» для темы, предмета или папки. */
function baseOf(w: StudyWhere): { scope: QueueScope; route: Partial<ReviewRoute> } {
  if (w.topicId) return { scope: { topicId: w.topicId }, route: { topicId: w.topicId } };
  if (w.subjectId) return { scope: { subjectId: w.subjectId }, route: { subjectId: w.subjectId } };
  return { scope: { subjectIds: w.subjectIds ?? [] }, route: { subjectIds: w.subjectIds, folderId: w.folderId } };
}

export function useStudyPick(w: StudyWhere) {
  const data = useData();
  const base = useMemo(() => baseOf(w), [w.topicId, w.subjectId, w.folderId, (w.subjectIds ?? []).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => pickOptions(data, base.scope), [data.cards, data.topics, base]);
  const key = pickKeyOf(w);
  const pick = validPick(parsePick(key ? data.settings.studyPick?.[key] : undefined), options);
  const dueOf = (p: StudyPick) => {
    const c = todayCounts(data, new Date(), { ...base.scope, ...pickScope(p) });
    return c.learning + c.review + c.newCount;
  };
  /** Запомнить выбор для этой темы, предмета или папки («всё» не храним — это и так по умолчанию). */
  const remember = (p: StudyPick) => {
    if (!key) return;
    const all = { ...(data.settings.studyPick ?? {}) };
    if (p === 'all') delete all[key];
    else all[key] = p;
    updateSettings({ studyPick: Object.keys(all).length ? all : undefined });
  };
  return {
    options,
    pick,
    /** Сколько к повторению сейчас по выбранному. */
    due: dueOf(pick),
    dueOf,
    remember,
    /** Маршрут повторения для выбора (по умолчанию — для текущего). */
    route: (p: StudyPick = pick): ReviewRoute => ({ name: 'review', ...base.route, ...pickScope(p) }),
    /** Подпись выбора, когда он не «всё»: «Только карточки». */
    label: pick === 'all' ? '' : (options.find((o) => o.pick === pick)?.label ?? '')
  };
}

type Pick = ReturnType<typeof useStudyPick>;

/** Пункты меню: каждый запускает учёбу с этим выбором и запоминает его. */
export function pickItems(sp: Pick, go: (r: Route) => void): MenuItem[] {
  return sp.options.map((o: PickOption) => {
    const d = sp.dueOf(o.pick);
    return {
      label: o.label,
      icon: sp.pick === o.pick ? 'check' : undefined,
      hint: `${d ? `к повторению: ${d}` : 'на сегодня всё повторено'} · всего ${o.n}${o.hint && o.pick !== 'all' ? ` · ${o.hint}` : ''}`,
      onClick: () => {
        sp.remember(o.pick);
        if (d) go(sp.route(o.pick));
        else toast('Здесь на сегодня всё повторено. Выбор запомнен.');
      }
    };
  });
}

/** Маленькое меню рядом с кнопкой «Учить». Нет выбора — ничего не рисуем. */
export function StudyPickMenu({ sp, go }: { sp: Pick; go: (r: Route) => void }) {
  if (sp.options.length === 0) return null;
  return <MoreMenu label="Что учить" title="Что учить: всё, только карточки или только термины" icon="sliders" items={pickItems(sp, go)} />;
}
