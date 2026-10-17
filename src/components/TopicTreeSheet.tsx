// «Все темы списком» на телефоне (1.32): нижний лист с поиском и сворачиваемым деревом «предмет → темы → подтемы».
// Раньше открывалась боковая панель компьютера — мелкие кнопки, наложения. Закрывается жестом вниз, «Назад» и крестиком.
import { useMemo, useState, type CSSProperties, type JSX } from 'react';
import { childTopics, sortedSubjects, useData } from '../store';
import type { AppData, Route, Subject, Topic } from '../types';
import { Icon, Modal, haptic } from './ui';

const lc = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

function countCards(d: AppData): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of d.cards) m.set(c.topicId, (m.get(c.topicId) ?? 0) + 1);
  return m;
}

export function TopicTreeSheet({ go, onClose }: { go: (r: Route) => void; onClose: () => void }) {
  const data = useData();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set(data.subjects.length <= 3 ? data.subjects.map((s) => s.id) : []));
  const cards = useMemo(() => countCards(data), [data]);
  const subjects = sortedSubjects(data);
  const query = lc(q.trim());

  const toggle = (id: string) => {
    haptic(6);
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const pick = (r: Route) => {
    onClose();
    go(r);
  };

  /** Тема и её подтемы; при поиске — только совпавшие ветки, раскрытые. */
  const branch = (s: Subject, parent: string | undefined, depth: number): JSX.Element[] =>
    childTopics(data, s.id, parent).flatMap((t: Topic) => {
      const kids = branch(s, t.id, depth + 1);
      const hit = !query || lc(t.name).includes(query);
      if (!hit && !kids.length) return [];
      const hasKids = childTopics(data, s.id, t.id).length > 0;
      const shown = Boolean(query) || open.has(t.id);
      const n = cards.get(t.id) ?? 0;
      return [
        <div key={t.id} className="tt-row" style={{ '--depth': depth } as CSSProperties} role="treeitem" aria-level={depth + 2} aria-expanded={hasKids ? shown : undefined}>
          {hasKids ? (
            <button className="tt-twisty" aria-label={shown ? 'Свернуть' : 'Развернуть'} onClick={() => toggle(t.id)}>
              <span className={'tt-chev' + (shown ? ' rot' : '')}>
                <Icon name="chevron" size={16} />
              </span>
            </button>
          ) : (
            <span className="tt-twisty" aria-hidden="true" />
          )}
          <button className="tt-name" onClick={() => pick({ name: 'topic', id: t.id })}>
            <span className="tt-label">{t.name}</span>
            {n > 0 && <span className="tt-count">{n}</span>}
          </button>
        </div>,
        ...(shown ? kids : [])
      ];
    });

  return (
    <Modal title="Все темы" onClose={onClose} width={560}>
      <div className="stack gap8 tt" data-part="topic-tree">
        <label className="know-search">
          <Icon name="search" size={18} />
          <input className="input" type="search" placeholder="Найти тему" aria-label="Найти тему" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="tt-list" role="tree" aria-label="Темы">
          {subjects.map((s) => {
            const rows = branch(s, undefined, 1);
            if (query && !rows.length && !lc(s.name).includes(query)) return null;
            const shown = Boolean(query) || open.has(s.id);
            return (
              <div key={s.id} className="tt-subject" role="treeitem" aria-level={1} aria-expanded={shown}>
                <div className="tt-row tt-subj" style={{ '--depth': 0 } as CSSProperties}>
                  <button className="tt-twisty" aria-label={shown ? `Свернуть «${s.name}»` : `Развернуть «${s.name}»`} onClick={() => toggle(s.id)}>
                    <span className={'tt-chev' + (shown ? ' rot' : '')}>
                <Icon name="chevron" size={16} />
              </span>
                  </button>
                  <button className="tt-name" onClick={() => pick({ name: 'subject', id: s.id })}>
                    <span className="tt-ico" style={{ background: s.color }} aria-hidden="true">
                      {s.icon ?? s.name.slice(0, 1)}
                    </span>
                    <span className="tt-label">{s.name}</span>
                  </button>
                </div>
                {shown && <div role="group">{rows.length ? rows : <span className="small muted tt-empty">Тем пока нет</span>}</div>}
              </div>
            );
          })}
          {query && !subjects.some((s) => lc(s.name).includes(query) || branch(s, undefined, 1).length) && <p className="muted small">Такой темы нет. Поищи другое слово.</p>}
        </div>
      </div>
    </Modal>
  );
}
