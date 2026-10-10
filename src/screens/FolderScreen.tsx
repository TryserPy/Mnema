// Папка предметов: предметы внутри, общее повторение по всей папке.
import { useState } from 'react';
import { makeCopy } from '../components/copyUi';
import { EditFolder } from '../components/SubjectDialogs';
import { openRepeatDialog } from '../components/RepeatDialog';
import { Icon, plural, SubjectMark } from '../components/ui';
import { hasRepeatable } from '../repeat';
import { todayCounts, topicMastery } from '../srs';
import { childTopics, sortedSubjects, useData } from '../store';
import type { Route } from '../types';

export function FolderScreen({ id, go, onNewSubject }: { id: string; go: (r: Route) => void; onNewSubject: (o: { folderId: string }) => void }) {
  const data = useData();
  const f = data.folders.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  if (!f) return <div className="page">Папка не найдена.</div>;
  const subjects = sortedSubjects(data).filter((s) => s.folderId === id);
  const now = new Date();
  const counts = subjects.length ? todayCounts(data, now, { subjectIds: subjects.map((s) => s.id) }) : { learning: 0, review: 0, newCount: 0 };
  const due = counts.learning + counts.review + counts.newCount;
  const canRepeat = subjects.length > 0 && hasRepeatable(data, { subjectIds: subjects.map((s) => s.id) });
  return (
    <div className="page narrow">
      <div className="row between end-align gap12 wrap">
        <div className="row gap12">
          {f.icon ? <SubjectMark color={f.color} icon={f.icon} size="big" /> : <span className="folder-badge" style={{ color: f.color }}><Icon name="folder" size={30} /></span>}
          <h1 className="display">{f.name}</h1>
          <button className="icon-btn small subtle" aria-label="Изменить папку" title="Изменить или удалить папку" onClick={() => setEditing(true)}>
            <Icon name="edit" size={18} />
          </button>
        </div>
        <div className="row gap8">
          {due > 0 && (
            <button className="btn primary" onClick={() => go({ name: 'review', subjectIds: subjects.map((s) => s.id), folderId: id })}>
              <Icon name="play" size={16} /> Учить всю папку · {due}
            </button>
          )}
          {canRepeat && (
            <button className={'btn' + (due > 0 ? '' : ' primary')} onClick={() => openRepeatDialog({ folderId: id })} title={due > 0 ? 'Повторить ещё раз: повторённое сегодня, всё начатое, слабые места' : 'На сегодня всё повторено — можно повторить ещё раз'}>
              <Icon name="repeat" size={16} /> Повторить ещё раз
            </button>
          )}
          <button className="btn ghost" onClick={() => makeCopy('folder', id, go)} title="Копия папки вместе со всеми предметами">
            <Icon name="copy" size={16} /> Копия
          </button>
          <button className="btn" onClick={() => onNewSubject({ folderId: id })}>
            <Icon name="plus" size={18} /> Предмет
          </button>
        </div>
      </div>
      <div className="folder-subjects tab-pane">
        {subjects.length === 0 && (
          <div className="empty">
            <strong>В папке пока нет предметов</strong>
            <span>Добавь предмет кнопкой «+ Предмет» или перетащи его в папку в левой панели.</span>
          </div>
        )}
        {subjects.map((s, i) => {
          const topics = childTopics(data, s.id);
          const c = todayCounts(data, now, { subjectId: s.id });
          const d = c.learning + c.review + c.newCount;
          let total = 0;
          let learned = 0;
          for (const t of topics) {
            const m = topicMastery(data, t.id);
            total += m.total;
            learned += m.learned;
          }
          const pct = total ? Math.round((learned / total) * 100) : 0;
          return (
            <button key={s.id} className="folder-subject" style={{ ['--c' as string]: s.color, animationDelay: i * 40 + 'ms' }} onClick={() => go({ name: 'subject', id: s.id })}>
              <SubjectMark color={s.color} icon={s.icon} size="big" />
              <span className="grow stack gap4">
                <strong>{s.name}</strong>
                <span className="small muted">
                  {topics.length} {plural(topics.length, 'тема', 'темы', 'тем')} · выучено {pct}%
                </span>
                <span className="progress full">
                  <span style={{ width: pct + '%', background: s.color }} />
                </span>
              </span>
              {d > 0 && <span className="badge soft">{d}</span>}
            </button>
          );
        })}
      </div>
      {editing && <EditFolder id={id} onClose={() => setEditing(false)} />}
    </div>
  );
}
