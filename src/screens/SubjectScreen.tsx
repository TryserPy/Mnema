import { useEffect, useMemo, useState } from 'react';
import { RulesList } from '../components/Rules';
import { exportForAi } from '../components/ChangesDialog';
import { SubjectTerms, termGroups } from '../components/SubjectTerms';
import { AnkiExportDialog, PrintDialog } from '../components/ExportDialogs';
import { Timeline, timelineEvents } from '../components/Timeline';
import { ObsidianImport } from '../components/ObsidianImport';
import { DeleteSubject, EditSubject } from '../components/SubjectDialogs';
import { Icon, MoreMenu, plural, Segmented, SubjectMark } from '../components/ui';
import { todayCounts, topicMastery } from '../srs';
import { addTopic, childTopics, subjectRules, updateSubject, useData } from '../store';
import type { Route, Topic } from '../types';

type View = 'topics' | 'rules' | 'terms' | 'timeline';

export function SubjectScreen({ id, view: initialView, filter, go }: { id: string; view?: View; filter?: string; go: (r: Route) => void }) {
  const data = useData();
  const subject = data.subjects.find((s) => s.id === id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [obsidian, setObsidian] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportKind, setExportKind] = useState<'print' | 'anki' | null>(null);
  const [newName, setNewName] = useState('');
  const [view, setView] = useState<View>(initialView ?? 'topics');
  useEffect(() => {
    if (initialView) setView(initialView);
  }, [initialView]);
  const events = useMemo(() => (subject ? timelineEvents(data, id).length : 0), [data, id, subject]);
  const termCount = useMemo(() => termGroups(data, id).reduce((n, g) => n + g.cards.length, 0), [data, id]);
  if (!subject) return <div className="page">Предмет не найден.</div>;
  const folder = subject.folderId ? data.folders.find((f) => f.id === subject.folderId) : undefined;
  const topics = data.topics.filter((t) => t.subjectId === id && !t.kind);
  const rulesOn = data.settings.features.rules;
  const termsOn = data.settings.features.lists;
  const ruleCount = subjectRules(data, id).length;
  const flat: { t: Topic; depth: number }[] = [];
  const walk = (parentId: string | undefined, depth: number) => {
    for (const t of childTopics(data, id, parentId)) {
      flat.push({ t, depth });
      walk(t.id, depth + 1);
    }
  };
  if (subject) walk(undefined, 0);
  const now = new Date();
  const counts = todayCounts(data, now, { subjectId: id });
  const due = counts.learning + counts.review + counts.newCount;

  return (
    <div className="page narrow">
      <div className="row between end-align gap12">
        <div className="row gap12">
          <SubjectMark color={subject.color} icon={subject.icon} size="big" />
          <div className="stack gap2">
            {folder && (
              <button className="crumb" onClick={() => go({ name: 'folder', id: folder.id })}>
                {folder.icon ?? '📁'} {folder.name}
              </button>
            )}
            <h1 className="display">{subject.name}</h1>
          </div>
          <button className="icon-btn small subtle" aria-label="Изменить предмет" title="Изменить название и цвет" onClick={() => setEditing(true)}>
            <Icon name="edit" size={18} />
          </button>
        </div>
        <div className="row gap8">
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Тема
          </button>
          <MoreMenu
            label="Действия с предметом"
            items={[
              { label: `Учить весь предмет · ${due}`, icon: 'play', onClick: () => go({ name: 'review', subjectId: id }), hidden: due === 0 },
              { label: 'Изменить название и цвет', icon: 'edit', onClick: () => setEditing(true) },
              { label: 'Импорт из Obsidian', icon: 'folder', onClick: () => setObsidian(true), hidden: !data.settings.features.obsidian },
              { label: 'Распечатать карточки', icon: 'print', onClick: () => setExportKind('print') },
              subject.topicSort !== 'manual'
                ? { label: 'Темы — в своём порядке', icon: 'sort', hint: 'Тогда их можно расставить перетаскиванием', onClick: () => updateSubject(id, { topicSort: 'manual' }) }
                : { label: 'Темы — по названию', icon: 'sort', hint: '§1, §2 … §10 — по номерам и алфавиту', onClick: () => updateSubject(id, { topicSort: 'name' }) },
              { label: 'Экспорт в Anki', icon: 'share', onClick: () => setExportKind('anki') },
              { label: 'Выгрузить для нейросети', icon: 'bot', hint: 'Нейросеть поправит и вернёт файл изменений', onClick: () => exportForAi({ subjectId: id }) },
              { label: 'Удалить предмет', icon: 'trash', danger: true, onClick: () => setConfirmDelete(true) }
            ]}
          />
        </div>
      </div>

      {adding && (
        <form
          className="card row gap8"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            const t = addTopic(id, newName);
            setNewName('');
            setAdding(false);
            go({ name: 'topic', id: t.id });
          }}
        >
          <input className="input grow" autoFocus placeholder="Название темы, например: §12 Фотосинтез" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
          <button className="btn primary" type="submit" disabled={!newName.trim()}>
            Создать
          </button>
        </form>
      )}

      {(events >= 3 || rulesOn || termsOn) && (
        <div className="tabs-narrow">
          <Segmented
            ariaLabel="Вид"
            value={view}
            onChange={setView}
            options={[
              { value: 'topics', label: `Темы · ${topics.filter((t) => !t.parentId).length}` },
              ...(termsOn ? [{ value: 'terms' as const, label: `Термины · ${termCount}` }] : []),
              ...(rulesOn ? [{ value: 'rules' as const, label: `Правила · ${ruleCount}` }] : []),
              ...(events >= 3 ? [{ value: 'timeline' as const, label: 'Лента времени' }] : [])
            ]}
          />
        </div>
      )}

      {view === 'terms' && termsOn ? (
        <SubjectTerms key={'terms' + (filter ?? '')} subjectId={id} filter={filter} go={go} />
      ) : view === 'rules' && rulesOn ? (
        <RulesList subjectId={id} go={go} />
      ) : view === 'timeline' && events >= 3 ? (
        <div className="tab-pane" key="timeline">
          <Timeline data={data} subjectId={id} color={subject.color} go={go} />
        </div>
      ) : (
      <div className="topic-list tab-pane" key="topics">
        {topics.length === 0 && !adding && (
          <div className="empty">
            <strong>Тем пока нет</strong>
            <span>Тема — это параграф или раздел учебника. В ней будет конспект и карточки.</span>
            <button className="btn primary" onClick={() => setAdding(true)}>
              Добавить первую тему
            </button>
          </div>
        )}
        {flat.map(({ t, depth }, i) => {
          const m = topicMastery(data, t.id);
          const c = todayCounts(data, now, { topicId: t.id });
          const cardCount = data.cards.filter((x) => x.topicId === t.id).length;
          const pct = m.total ? Math.round((m.learned / m.total) * 100) : 0;
          const dueT = c.review + c.learning;
          return (
            <button key={t.id} className={'topic-row' + (depth ? ' nested' : '')} style={{ marginLeft: depth * 28, animationDelay: Math.min(i, 12) * 30 + 'ms' }} onClick={() => go({ name: 'topic', id: t.id })}>
              <span className="grow stack gap4">
                <strong className="row gap6">
                  {depth > 0 && <span className="sub-mark">↳</span>}
                  {t.name}
                  {t.important && (
                    <span className="star-mark" title="Важная тема">
                      <Icon name="starFill" size={16} />
                    </span>
                  )}
                </strong>
                <span className="muted small">
                  {cardCount === 0 ? 'нет карточек' : `${cardCount} ${plural(cardCount, 'карточка', 'карточки', 'карточек')}`}
                  {t.examDate && ` · контрольная ${new Date(t.examDate + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`}
                </span>
              </span>
              {dueT > 0 && <span className="badge soft">{dueT}</span>}
              {cardCount > 0 && (
                <span className="progress" title={`Выучено ${pct}%`}>
                  <span style={{ width: pct + '%', background: subject.color }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      )}

      {editing && (
        <EditSubject
          id={id}
          onClose={() => setEditing(false)}
          onDelete={() => {
            setEditing(false);
            setConfirmDelete(true);
          }}
        />
      )}
      {obsidian && (
        <ObsidianImport
          subjectId={id}
          onClose={() => setObsidian(false)}
          onDone={() => {
            setObsidian(false);
          }}
        />
      )}
      {exportKind === 'print' && <PrintDialog subjectId={id} onClose={() => setExportKind(null)} />}
      {exportKind === 'anki' && <AnkiExportDialog subjectId={id} onClose={() => setExportKind(null)} />}
      {confirmDelete && <DeleteSubject id={id} onClose={() => setConfirmDelete(false)} onDeleted={() => go({ name: 'today' })} />}
    </div>
  );
}
