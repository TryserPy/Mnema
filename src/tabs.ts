// Порядок вкладок темы (Конспект, Карточки, словари и списки) — можно менять.
import { getData, updateTopic } from './store';

/** Вкладки темы в своём порядке (новые — в конце, как по умолчанию). */
export function orderTabs<T extends { value: string }>(items: T[], order?: string[]): T[] {
  if (!order?.length) return items;
  const pos = (v: string) => {
    const i = order.indexOf(v);
    return i < 0 ? order.length + items.findIndex((x) => x.value === v) : i;
  };
  return [...items].sort((a, b) => pos(a.value) - pos(b.value));
}

/** Переставить вкладку темы: from встаёт на место to. */
export function reorderTab(topicId: string, all: string[], from: string, to: string) {
  const t = getData().topics.find((x) => x.id === topicId);
  const cur = orderTabs(all.map((value) => ({ value })), t?.tabOrder).map((x) => x.value);
  const i = cur.indexOf(from);
  const j = cur.indexOf(to);
  if (i < 0 || j < 0) return;
  cur.splice(i, 1);
  cur.splice(j, 0, from);
  updateTopic(topicId, { tabOrder: cur });
}

