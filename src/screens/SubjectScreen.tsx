import { makeCopy } from '../components/copyUi';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { RulesList } from '../components/Rules';
import { exportForAi } from '../components/ChangesDialog';
import { SubjectTerms, termGroups } from '../components/SubjectTerms';
import { AnkiExportDialog, PrintDialog } from '../components/ExportDialogs';
import { Timeline, timelineEvents } from '../components/Timeline';
import { ObsidianImport } from '../components/ObsidianImport';
import { DeleteSubject, EditSubject } from '../components/SubjectDialogs';
import { Icon, MoreMenu, plural, Segmented, SubjectMark } from '../components/ui';
import { openExamDialog } from '../components/ExamDialog';
import { openRepeatDialog } from '../components/RepeatDialog';
import { cardsByTopic, topicStatsByTopic } from '../srs';
import { pickItems, useStudyPick } from '../components/StudyPick';
import { pickScope } from '../studyPick';
import { setPlace } from '../studyBack';
import { addTopic, childTopics, subjectRules, updateSubject, useData } from '../store';
import type { Route, Topic } from '../types';
import { ScreenTip } from '../components/ScreenTip';

/** «5 карточек» — сколько возьмёт действие, видно в меню до нажатия. */
const cardsWord = (n: number) => `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}`;

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
  const creating = useRef(false);
  const [view, setView] = useState<View>(initialView ?? 'topics');
  useEffect(() => {
    if (initialView) setView(initialView);
  }, [initialView]);
  // Где я сейчас (вкладка и выбранные термины): с этого места начнётся учёба и сюда она вернёт.
  const [termsFilter, setTermsFilter] = useState(filter);
  useEffect(() => setTermsFilter(filter), [filter]);
  useEffect(() => {
    setPlace({ name: 'subject', id, view, ...(view === 'terms' && termsFilter ? { filter: termsFilter } : {}) });
    return () => setPlace(null);
  }, [id, view, termsFilter]);
  const sp = useStudyPick({ subjectId: id }); // что учить: всё / только карточки / только списки (помнится для предмета)
  const events = useMemo(() => (subject ? timelineEvents(data, id).length : 0), [data, id, subject]);
  const termCount = useMemo(() => termGroups(data, id).reduce((n, g) => n + g.cards.length, 0), [data, id]);
  // Счётчики и освоение всех тем предмета — за один проход по карточкам (раньше считались на каждую тему отдельно:
  // на 500 темах это ≈0,6 с, на 2000 — до 9 с). Пересчёт — при изменении данных и раз в минуту.
  const minute = Math.floor(Date.now() / 60000);
  const stats = useMemo(
    () => (subject ? topicStatsByTopic(data, new Date(), data.topics.filter((t) => t.subjectId === id && !t.kind).map((t) => t.id)) : null),
    [data, id, subject, minute]
  );
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
  const byTopic = cardsByTopic(data);
  const due = sp.due;
  const study = sp.status;
  const hasCards = data.topics.some((t) => t.subjectId === id && (byTopic.get(t.id)?.length ?? 0) > 0);

  return (
    <div className="page narrow">
      <ScreenTip id="subject" />
      <div className="row between end-align gap12">
        <div className="row gap12">
          <SubjectMark color={subject.color} icon={subject.icon} img={subject.iconImg} size="big" />
          <nav className="stack gap2" aria-label="Где я">
            {folder && (
              <button className="crumb" onClick={() => go({ name: 'folder', id: folder.id })}>
                {folder.iconImg ? <SubjectMark color={folder.color} img={folder.iconImg} /> : folder.icon ?? '📁'} {folder.name}
              </button>
            )}
            <h1 className="display">{subject.name}</h1>
          </nav>
          <button className="icon-btn small subtle" aria-label="Изменить предмет" title="Изменить название и цвет" onClick={() => setEditing(true)}>
            <Icon name="edit" size={18} />
          </button>
        </div>
        <div className="row gap8">
          <button
            className="btn primary"
            onClick={() => {
              creating.current = false;
              setAdding(true);
            }}
          >
            <Icon name="plus" size={18} /> Тема
          </button>
          <MoreMenu
            label="Действия с предметом"
            items={[
              { section: 'Учить', label: 'Учить весь предмет', icon: 'play', hint: `${cardsWord(due)} на сегодня${sp.label ? ` · ${sp.label}` : ''}`, onClick: () => go(sp.route()), hidden: due === 0 },
              { section: 'Учить', label: 'Учить новые', icon: 'play', hint: `${cardsWord(study.kind === 'new' ? study.fresh : 0)} сверх плана на сегодня`, onClick: () => go(sp.route(sp.pick, study.kind === 'new' ? study.fresh : 0)), hidden: study.kind !== 'new' },
              { section: 'Учить', label: 'Что учить', icon: 'sliders', hint: sp.label || 'Сейчас: всё — карточки и термины', items: pickItems(sp, go), hidden: sp.options.length === 0 },
              { section: 'Учить', label: 'Повторить ещё раз', icon: 'repeat', hint: 'Без изменения расписания', onClick: () => openRepeatDialog({ subjectId: id, ...pickScope(sp.pick) }), hidden: !hasCards },
              { section: 'Подготовка', label: 'Новая контрольная', icon: 'test', hint: 'Выбери темы и дату — будет план', onClick: () => openExamDialog({ subjectId: id }), hidden: topics.length === 0 },
              { section: 'Управление', label: 'Изменить название и цвет', icon: 'edit', onClick: () => setEditing(true) },
              { section: 'Управление', label: 'Сделать копию', icon: 'copy', hint: 'Темы, конспекты и карточки', onClick: () => makeCopy('subject', id, go) },
              subject.topicSort !== 'manual'
                ? { section: 'Управление', label: 'Темы — в своём порядке', icon: 'sort', hint: 'Можно будет перетаскивать', onClick: () => updateSubject(id, { topicSort: 'manual' }) }
                : { section: 'Управление', label: 'Темы — по названию', icon: 'sort', hint: '§1, §2 … §10 — по номерам', onClick: () => updateSubject(id, { topicSort: 'name' }) },
              { section: 'Управление', label: 'Импорт из Obsidian', icon: 'folder', onClick: () => setObsidian(true), hidden: !data.settings.features.obsidian },
              { section: 'Экспорт', label: 'Распечатать карточки', icon: 'print', hint: 'Для вырезания или списком', onClick: () => setExportKind('print') },
              { section: 'Экспорт', label: 'Экспорт в Anki', icon: 'share', hint: 'Файл .apkg вместе с прогрессом', onClick: () => setExportKind('anki') },
              { section: 'Экспорт', label: 'Выгрузить для нейросети', icon: 'bot', hint: 'Нейросеть поправит и вернёт файл', onClick: () => exportForAi({ subjectId: id }) },
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
            if (!newName.trim() || creating.current) return;
            creating.current = true; // двойное касание «Создать» — одна тема
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
        <div className="tabs-narrow wide-tabs">
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
        <SubjectTerms key={'terms' + (filter ?? '')} subjectId={id} filter={filter} onFilter={setTermsFilter} go={go} />
      ) : view === 'rules' && rulesOn ? (
        <RulesList subjectId={id} go={go} />
      ) : view === 'timeline' && events >= 3 ? (
        <div className="tab-pane" key="timeline">
          <Timeline data={data} subjectId={id} color={subject.color} go={go} />
        </div>
      ) : (
      <div className="topic-list tab-pane" data-part="topic-list" key="topics">
        {topics.length === 0 && !adding && (
          <div className="empty">
            <strong>Тем пока нет</strong>
            <span>Тема — это параграф или раздел учебника. В ней будет конспект и карточки.</span>
            <button
              className="btn primary"
              onClick={() => {
                creating.current = false;
                setAdding(true);
              }}
            >
              Добавить первую тему
            </button>
          </div>
        )}
        {flat.map(({ t, depth }, i) => {
          const m = stats!.get(t.id)!.mastery;
          const c = stats!.get(t.id)!.counts;
          const cardCount = byTopic.get(t.id)?.length ?? 0;
          const pct = m.total ? Math.round((m.learned / m.total) * 100) : 0;
          const dueT = c.review + c.learning;
          return (
            <button key={t.id} className={'topic-row' + (depth ? ' nested' : '')} style={{ '--depth': depth, animationDelay: Math.min(i, 12) * 30 + 'ms' } as CSSProperties} onClick={() => go({ name: 'topic', id: t.id })}>
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
                  {cardCount === 0 ? 'нет карточек' : `${cardCount} ${plural(cardCount, 'карточка', 'карточки', 'карточек')} · выучено ${pct}%`}
                  {t.examDate && ` · контрольная ${new Date(t.examDate + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`}
                </span>
              </span>
              {/* Сколько карточек темы повторить сегодня — словами, а не голым числом в кружке. */}
              {dueT > 0 && (
                <span className="badge soft" title={`Повторить сегодня: ${dueT}`}>
                  {dueT} сегодня
                </span>
              )}
              {cardCount > 0 && (
                <span className="progress" aria-hidden="true" title={`Выучено ${pct}%`}>
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
