// Папка предметов: предметы внутри, общее повторение по всей папке.
import { useState } from 'react';
import { makeCopy } from '../components/copyUi';
import { EditFolder } from '../components/SubjectDialogs';
import { openRepeatDialog } from '../components/RepeatDialog';
import { Icon, plural, SubjectMark } from '../components/ui';
import { hasRepeatable } from '../repeat';
import { StudyPickMenu, useStudyPick } from '../components/StudyPick';
import { pickScope } from '../studyPick';
import { todayCounts, topicMastery } from '../srs';
import { nextDueText } from '../studyStatus';
import { childTopics, sortedSubjects, useData } from '../store';
import type { Route } from '../types';

export function FolderScreen({ id, go, onNewSubject }: { id: string; go: (r: Route) => void; onNewSubject: (o: { folderId: string }) => void }) {
  const data = useData();
  const f = data.folders.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const sp = useStudyPick({ folderId: id, subjectIds: data.subjects.filter((s) => s.folderId === id).map((s) => s.id) }); // что учить в папке
  if (!f) return <div className="page">Папка не найдена.</div>;
  const subjects = sortedSubjects(data).filter((s) => s.folderId === id);
  const now = new Date();
  const study = subjects.length ? sp.status : ({ kind: 'empty' } as const);
  const canRepeat = subjects.length > 0 && hasRepeatable(data, { subjectIds: subjects.map((s) => s.id) });
  return (
    <div className="page narrow">
      <div className="row between end-align gap12 wrap">
        <div className="row gap12">
          {f.icon || f.iconImg ? <SubjectMark color={f.color} icon={f.icon} img={f.iconImg} size="big" /> : <span className="folder-badge" style={{ color: f.color }}><Icon name="folder" size={30} /></span>}
          <h1 className="display">{f.name}</h1>
          <button className="icon-btn small subtle" aria-label="Изменить папку" title="Изменить или удалить папку" onClick={() => setEditing(true)}>
            <Icon name="edit" size={18} />
          </button>
        </div>
        <div className="row gap8 wrap">
          {study.kind === 'done' && <span className="study-note small muted">Всё повторено ✓</span>}
          {study.kind === 'idle' && <span className="study-note small muted">Сегодня повторять нечего{study.next !== null ? ` · ${nextDueText(study.next)}` : ''}</span>}
          {study.kind === 'learn' && (
            <button className="btn primary" onClick={() => go(sp.route())}>
              <Icon name="play" size={16} /> Учить всю папку · {study.due}
            </button>
          )}
          {study.kind === 'new' && (
            <button className="btn primary" onClick={() => go(sp.route(sp.pick, study.fresh))}>
              <Icon name="play" size={16} /> Учить новые · {study.fresh}
            </button>
          )}
          {sp.label && <span className="chip neutral">{sp.label}</span>}
          <StudyPickMenu sp={sp} go={go} />
          {canRepeat && (
            <button className={'btn' + (study.kind === 'done' ? ' primary' : '')} onClick={() => openRepeatDialog({ folderId: id, ...pickScope(sp.pick) })} title={study.kind === 'done' ? 'На сегодня всё повторено — можно повторить ещё раз' : 'Повторить ещё раз: повторённое сегодня, всё начатое, слабые места'}>
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
              <SubjectMark color={s.color} icon={s.icon} img={s.iconImg} size="big" />
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
