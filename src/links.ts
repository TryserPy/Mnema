// Ссылки внутри Мнемы: из конспекта на другую тему, правило или термин из словаря.
// В Markdown это обычная ссылка: [причастный оборот](mnema://topic/<id>) или [фагоцитоз](mnema://card/<id>).
import { normalizeAnswer } from './srs';
import { rulePreview } from './rules';
import type { AppData, Card, Route, Topic } from './types';

export const LINK_SCHEME = 'mnema://';

export type LinkTarget = { kind: 'topic'; topic: Topic } | { kind: 'card'; card: Card; topic?: Topic };

export function topicHref(id: string) {
  return `${LINK_SCHEME}topic/${id}`;
}
export function cardHref(id: string) {
  return `${LINK_SCHEME}card/${id}`;
}

export function parseHref(href: string): { kind: 'topic' | 'card'; id: string } | null {
  const m = /^mnema:\/\/(topic|card)\/([\w-]+)/.exec(href);
  return m ? { kind: m[1] as 'topic' | 'card', id: m[2] } : null;
}

export function resolveLink(data: AppData, href: string): LinkTarget | null {
  const p = parseHref(href);
  if (!p) return null;
  if (p.kind === 'topic') {
    const topic = data.topics.find((t) => t.id === p.id);
    return topic ? { kind: 'topic', topic } : null;
  }
  const card = data.cards.find((c) => c.id === p.id);
  return card ? { kind: 'card', card, topic: data.topics.find((t) => t.id === card.topicId) } : null;
}

export function routeFor(t: LinkTarget): Route {
  if (t.kind === 'topic') return { name: 'topic', id: t.topic.id, tab: 'note' };
  return { name: 'topic', id: t.card.topicId, tab: t.card.listId ? 'list:' + t.card.listId : 'cards' };
}

export interface LinkOption {
  href: string;
  kind: 'topic' | 'rule' | 'term' | 'card';
  title: string;
  sub: string;
  score: number;
}

const plain = (s: string) => s.replace(/\$[^$]*\$/g, ' ').replace(/[*_=`#>]/g, '').replace(/\s+/g, ' ').trim();

/** Куда можно сослаться: темы, правила, термины из словарей и карточки — по близости к тексту. */
export function linkOptions(data: AppData, query: string, exceptTopicId?: string, limit = 40): LinkOption[] {
  const q = normalizeAnswer(query.trim());
  const words = q.split(' ').filter((w) => w.length > 1);
  const stem = (w: string) => (w.length > 5 ? w.slice(0, -2) : w);
  const score = (text: string) => {
    if (!q) return 1;
    const t = normalizeAnswer(text);
    if (t === q) return 100;
    if (t.startsWith(q)) return 80;
    if (t.includes(q)) return 60;
    if (words.length && words.every((w) => t.includes(stem(w)))) return 40;
    if (words.some((w) => w.length > 3 && t.includes(stem(w)))) return 15;
    return 0;
  };
  const subj = new Map(data.subjects.map((s) => [s.id, s.name]));
  const out: LinkOption[] = [];
  for (const t of data.topics) {
    if (t.id === exceptTopicId) continue;
    const sc = score(t.name);
    if (sc) out.push({ href: topicHref(t.id), kind: t.kind === 'rule' ? 'rule' : 'topic', title: t.name, sub: (subj.get(t.subjectId) ?? '') + (t.note.trim() ? ' · ' + rulePreview(t.note, 70) : ''), score: sc + (t.kind === 'rule' ? 2 : 3) });
  }
  const topics = new Map(data.topics.map((t) => [t.id, t]));
  for (const c of data.cards) {
    const front = plain(c.front.replace(/\{\{(?:c\d+::)?([^}:]+)(?:::[^}]*)?\}\}/g, '$1'));
    const sc = score(front);
    if (!sc) continue;
    const t = topics.get(c.topicId);
    const list = c.listId ? t?.lists?.find((l) => l.id === c.listId) : undefined;
    out.push({ href: cardHref(c.id), kind: list ? 'term' : 'card', title: front.slice(0, 90), sub: [list?.title ?? 'Карточка', t?.name, plain(c.back).slice(0, 60)].filter(Boolean).join(' · '), score: sc + (list ? 4 : 0) });
  }
  return out.sort((a, b) => b.score - a.score || a.title.length - b.title.length).slice(0, limit);
}

/** Для экспорта в Obsidian: [текст](mnema://…) → [[Тема|текст]]. */
export function linksToWiki(md: string, data: AppData, titleOf: (topicId: string) => string | undefined): string {
  return md.replace(/\[([^\]]+)\]\((mnema:\/\/(?:topic|card)\/[\w-]+)\)/g, (_m, text: string, href: string) => {
    const t = resolveLink(data, href);
    const topicId = t ? (t.kind === 'topic' ? t.topic.id : t.card.topicId) : undefined;
    const title = topicId ? titleOf(topicId) : undefined;
    return title ? `[[${title}|${text}]]` : text;
  });
}
