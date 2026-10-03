// «Знания»: все предметы плитками — сколько помнишь и что на очереди — и быстрый поиск по темам.
// Создаётся всё через «＋ Создать»; здесь только смотрим и открываем.
import { useMemo, useState } from 'react';
import { Icon, plural, SubjectMark } from '../components/ui';
import { topicStatsByTopic } from '../srs';
import { childTopics, sortedFolders, sortedSubjects, useData } from '../store';
import type { AppData, Route, Subject } from '../types';
import { openCreate } from '../components/CreateMenu';

export interface SubjectTile {
  subject: Subject;
  topics: number;
  /** Доля карточек, которые уже хорошо запомнены (0–100). null — карточек ещё нет. */
  pct: number | null;
  due: number;
}

/** Плитки предметов за один проход по данным. */
export function subjectTiles(data: AppData, now: Date): SubjectTile[] {
  const stats = topicStatsByTopic(data, now);
  return sortedSubjects(data).map((subject) => {
    const roots = childTopics(data, subject.id);
    let total = 0;
    let learned = 0;
    let due = 0;
    for (const t of roots) {
      const s = stats.get(t.id);
      if (!s) continue;
      total += s.mastery.total;
      learned += s.mastery.learned;
      due += s.counts.learning + s.counts.review + s.counts.newCount;
    }
    return { subject, topics: data.topics.filter((t) => t.subjectId === subject.id && !t.kind).length, pct: total ? Math.round((learned / total) * 100) : null, due };
  });
}

/** Темы, в названии которых есть запрос (без учёта регистра); сначала те, что начинаются с него. */
export function findTopics(data: AppData, query: string, limit = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits = data.topics
    .filter((t) => !t.kind && t.name.toLowerCase().includes(q))
    .map((t) => ({ t, first: t.name.toLowerCase().startsWith(q) ? 0 : 1 }))
    .sort((a, b) => a.first - b.first || a.t.name.localeCompare(b.t.name, 'ru', { numeric: true }));
  return hits.slice(0, limit).map((h) => h.t);
}

function Tile({ tile, go }: { tile: SubjectTile; go: (r: Route) => void }) {
  const { subject: s } = tile;
  return (
    <button className="know-tile" style={{ ['--c' as string]: s.color }} onClick={() => go({ name: 'subject', id: s.id })}>
      <span className="row gap12 know-tile-head">
        <SubjectMark color={s.color} icon={s.icon} size="big" />
        <strong className="clamp2 grow">{s.name}</strong>
        {tile.due > 0 && <span className="badge soft" title="Ждёт повторения">{tile.due}</span>}
      </span>
      <span className="small muted">
        {tile.topics} {plural(tile.topics, 'тема', 'темы', 'тем')}
        {tile.pct === null ? ' · карточек пока нет' : tile.pct === 0 ? ' · пока ничего не выучено' : ` · помнишь ${tile.pct}%`}
      </span>
      <span className="progress full">
        <span style={{ width: (tile.pct ?? 0) + '%', background: s.color }} />
      </span>
    </button>
  );
}

export function Knowledge({ go, onTree }: { go: (r: Route) => void; onTree?: () => void }) {
  const data = useData();
  const [q, setQ] = useState('');
  const tiles = useMemo(() => subjectTiles(data, new Date()), [data]);
  const found = useMemo(() => findTopics(data, q), [data, q]);
  const subjectOf = (id: string) => data.subjects.find((s) => s.id === id);
  const folders = sortedFolders(data).filter((f) => tiles.some((t) => t.subject.folderId === f.id));
  const loose = tiles.filter((t) => !t.subject.folderId || !data.folders.some((f) => f.id === t.subject.folderId));
  return (
    <div className="page know-page">
      <div className="row between gap8 wrap">
        <h1 className="display">Знания</h1>
        {onTree && tiles.length > 0 && (
          <button className="btn small ghost" onClick={onTree}>
            <Icon name="list" size={16} /> Все темы списком
          </button>
        )}
      </div>
      {tiles.length === 0 ? (
        <div className="empty">
          <strong>Здесь появятся твои предметы</strong>
          <span>Нажми «Создать» и выбери «Новый предмет» — например, «Биология».</span>
          <button className="btn primary" onClick={openCreate}>
            <Icon name="plus" size={18} /> Создать
          </button>
        </div>
      ) : (
        <>
          <label className="know-search">
            <Icon name="search" size={18} />
            <input className="input" type="search" placeholder="Найти тему" aria-label="Найти тему" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {q.trim() ? (
            found.length === 0 ? (
              <p className="muted">Такой темы нет. Поищи другое слово.</p>
            ) : (
              <ul className="know-found">
                {found.map((t) => (
                  <li key={t.id}>
                    <button className="know-found-row" onClick={() => go({ name: 'topic', id: t.id })}>
                      <span className="clamp1 grow">{t.name}</span>
                      <span className="small muted clamp1">{subjectOf(t.subjectId)?.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              {folders.map((f) => (
                <section key={f.id} className="know-group">
                  <h2 className="know-group-title">
                    <button className="link-btn row gap8" onClick={() => go({ name: 'folder', id: f.id })}>
                      <Icon name="folder" size={18} /> {f.name}
                    </button>
                  </h2>
                  <div className="know-grid">
                    {tiles.filter((t) => t.subject.folderId === f.id).map((t) => (
                      <Tile key={t.subject.id} tile={t} go={go} />
                    ))}
                  </div>
                </section>
              ))}
              {loose.length > 0 && (
                <section className="know-group">
                  {folders.length > 0 && <h2 className="know-group-title">Без папки</h2>}
                  <div className="know-grid">
                    {loose.map((t) => (
                      <Tile key={t.subject.id} tile={t} go={go} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
