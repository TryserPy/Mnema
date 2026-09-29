// Термины всего предмета: общие (нужны везде) и из каждой темы — в одном месте, с разбивкой по темам.
import { useMemo, useState } from 'react';
import { normalizeAnswer, todayCounts } from '../srs';
import { childTopics, ensureGlossary, subjectGlossaries, useData } from '../store';
import type { AppData, Card, ListKind, Route, StudyList, Topic } from '../types';
import { ListRow, NewRow, rowStatus, StudyListView } from './StudyListView';
import { AnimText, Icon, plural } from './ui';

/** Какие списки считаем «терминами»: термины, словари и свои списки (даты и формулы живут отдельно). */
export const TERM_KINDS: ListKind[] = ['terms', 'vocab', 'custom'];

export interface TermGroup {
  key: string; // 'general' или id темы
  topic: Topic;
  title: string;
  lists: StudyList[];
  cards: Card[];
}

export function termGroups(data: AppData, subjectId: string): TermGroup[] {
  const byList = new Map<string, Card[]>();
  for (const c of data.cards) {
    if (!c.listId) continue;
    const k = c.topicId + '/' + c.listId;
    const a = byList.get(k);
    if (a) a.push(c);
    else byList.set(k, [c]);
  }
  const cardsOf = (t: Topic, lists: StudyList[]) => lists.flatMap((l) => (byList.get(t.id + '/' + l.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  const out: TermGroup[] = [];
  const glossaries = subjectGlossaries(data, subjectId);
  if (glossaries.length) {
    const lists = glossaries.flatMap((t) => (t.lists ?? []).filter((l) => TERM_KINDS.includes(l.kind)));
    out.push({ key: 'general', topic: glossaries[0], title: 'Общие', lists, cards: glossaries.flatMap((t) => cardsOf(t, (t.lists ?? []).filter((l) => TERM_KINDS.includes(l.kind)))) });
  }
  const walk = (parentId?: string) => {
    for (const t of childTopics(data, subjectId, parentId)) {
      const lists = (t.lists ?? []).filter((l) => TERM_KINDS.includes(l.kind));
      const cards = cardsOf(t, lists);
      if (cards.length) out.push({ key: t.id, topic: t, title: t.name, lists, cards });
      walk(t.id);
    }
  };
  walk();
  return out;
}

export function SubjectTerms({ subjectId, filter: initial, go }: { subjectId: string; filter?: string; go: (r: Route) => void }) {
  const data = useData();
  const groups = useMemo(() => termGroups(data, subjectId), [data, subjectId]);
  const [filter, setFilter] = useState<string>(initial ?? 'all');
  const [query, setQuery] = useState('');
  const [focusNew, setFocusNew] = useState(0);
  const general = groups.find((g) => g.key === 'general');
  const total = groups.reduce((n, g) => n + g.cards.length, 0);
  const q = normalizeAnswer(query);
  const listById = new Map(groups.flatMap((g) => g.lists.map((l) => [l.id, l] as const)));
  const listOf = (c: Card) => (c.listId ? listById.get(c.listId) : undefined);
  const current = filter === 'all' ? groups : groups.filter((g) => g.key === filter);
  const ids = current.flatMap((g) => g.cards.map((c) => c.id));
  const counts = useMemo(() => (ids.length ? todayCounts(data, new Date(), { cardIds: ids }) : { learning: 0, review: 0, newCount: 0 }), [data, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const due = counts.learning + counts.review + counts.newCount;
  const startGeneral = () => {
    ensureGlossary(subjectId);
    setFilter('general');
    setFocusNew((n) => n + 1);
  };

  if (total === 0 && !general)
    return (
      <div className="tab-pane">
        <div className="empty">
          <strong>Терминов пока нет</strong>
          <span>Здесь собираются термины всего предмета: общие — те, что нужны везде, — и из словарей каждой темы. Удобно повторять всё сразу или по одной теме.</span>
          <button className="btn primary" onClick={startGeneral}>
            Записать общие термины
          </button>
        </div>
      </div>
    );

  const chips: { key: string; label: string; n: number }[] = [{ key: 'all', label: 'Все', n: total }, { key: 'general', label: 'Общие', n: general?.cards.length ?? 0 }, ...groups.filter((g) => g.key !== 'general').map((g) => ({ key: g.key, label: g.title, n: g.cards.length }))];
  const showTable = filter === 'all';
  const rows = current.map((g) => ({ g, cards: q ? g.cards.filter((c) => normalizeAnswer(`${c.front} ${c.back} ${c.why ?? ''}`).includes(q)) : g.cards })).filter((x) => x.cards.length || (!q && x.g.key === 'general'));
  const found = rows.reduce((n, x) => n + x.cards.length, 0);

  return (
    <div className="stack gap12 tab-pane terms-pane">
      <div className="hw-filter terms-chips" role="tablist" aria-label="Чьи термины">
        {chips.map((c) => (
          <button key={c.key} role="tab" aria-selected={filter === c.key} className={'hw-fchip' + (filter === c.key ? ' on' : '')} onClick={() => (c.key === 'general' && !general ? startGeneral() : setFilter(c.key))}>
            <span className="clamp1">{c.label}</span>
            <span className="muted">{c.n}</span>
          </button>
        ))}
      </div>

      {showTable ? (
        <>
          <div className="row gap8 wrap">
            <button className="btn primary" disabled={!due} onClick={() => go({ name: 'review', cardIds: ids })}>
              <Icon name="play" size={16} /> <AnimText value={due ? `Учить · ${due}` : 'Всё повторено'} />
            </button>
            <button className="btn" disabled={!ids.length} onClick={() => go({ name: 'review', cardIds: ids, cram: true })} title="Пройти все термины предмета, не меняя расписания">
              <Icon name="repeat" size={16} /> Повторить все
            </button>
            <span className="grow" />
            {total > 8 && (
              <label className="search-field terms-search">
                <Icon name="search" size={16} />
                <input placeholder="Найти термин" aria-label="Найти термин" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            )}
          </div>
          <div className="list-table terms-table" role="table" aria-label="Термины предмета" style={{ ['--lt-cols' as string]: 'minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr) 34px' }}>
            <div className="list-tr list-th" role="row">
              <span role="columnheader">Термин</span>
              <span role="columnheader">Определение</span>
              <span role="columnheader">Пример</span>
              <span />
            </div>
            {rows.map(({ g, cards }) => (
              <div key={g.key} className="terms-group" role="rowgroup">
                <button className="terms-group-head" onClick={() => setFilter(g.key)} title="Показать только эти термины">
                  <Icon name={g.key === 'general' ? 'list' : 'book'} size={14} />
                  <strong className="clamp1">{g.title}</strong>
                  <span className="muted small">
                    {cards.length} {plural(cards.length, 'термин', 'термина', 'терминов')}
                  </span>
                </button>
                {cards.map((c) => {
                  const l = listOf(c);
                  return l ? <ListRow key={c.id} card={c} list={l} status={rowStatus(data, c)} speakable={false} isFormula={false} /> : null;
                })}
                {g.key === 'general' && !q && g.lists[0] && <NewRow key={'n' + focusNew} list={g.lists[0]} topicId={g.topic.id} autoFocus={focusNew > 0} onAdded={() => setFocusNew((n) => n + 1)} />}
              </div>
            ))}
          </div>
          {q && found === 0 && <div className="empty-soft">Ничего не нашлось</div>}
          {!general && (
            <button className="btn ghost small start-self" onClick={startGeneral}>
              <Icon name="plus" size={16} /> Общий термин — для всего предмета
            </button>
          )}
          <p className="small muted">Щёлкни по названию темы, чтобы учить только её термины. Новые термины темы добавляются в самой теме, во вкладке словаря.</p>
        </>
      ) : (
        current.map((g) =>
          g.lists.length === 0 ? (
            <div key={g.key} className="empty">
              <span>Общих терминов пока нет.</span>
              <button className="btn primary" onClick={startGeneral}>
                Начать
              </button>
            </div>
          ) : (
            g.lists.map((l) => {
              const owner = g.key === 'general' ? (subjectGlossaries(data, subjectId).find((t) => t.lists?.some((x) => x.id === l.id)) ?? g.topic) : g.topic;
              return (
                <section key={g.key + l.id} className="stack gap8 terms-section">
                  <div className="row between gap8">
                    <strong className="clamp1">{g.key === 'general' ? 'Общие термины предмета' : `${g.title} · ${l.title}`}</strong>
                    {g.key !== 'general' && (
                      <button className="link-btn small" onClick={() => go({ name: 'topic', id: g.topic.id, tab: 'list:' + l.id })}>
                        Открыть тему →
                      </button>
                    )}
                  </div>
                  <StudyListView key={l.id + focusNew} topicId={owner.id} list={l} go={go} />
                </section>
              );
            })
          )
        )
      )}
    </div>
  );
}
