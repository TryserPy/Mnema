import { deleteTopicWithUndo } from '../components/SubjectDialogs';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { exportForAi } from '../components/ChangesDialog';
import { ImportantPanel, NoteToCards } from '../components/ImportantPanel';
import { PageViewer } from '../components/PageViewer';
import { TextbookImport } from '../components/lazy';
import { findImportant } from '../important';
import { CardEditor } from '../components/CardEditor';
import { Markdown } from '../components/Markdown';
import { NoteEditor, type NoteApi } from '../components/NoteEditor';
import { ConfirmButton, Icon, Modal, MoreMenu, OverflowTabs, plural, selHow, usePresence, AnimText } from '../components/ui';
import { boldTerms, mentioned, suggestFromSelection } from '../noteTools';
import { exportTopic } from '../share';
import { examsOf } from '../examList';
import { buildPrompt, examPlan, formatInterval, isLeech, itemKey, itemOrds, normalizeAnswer, todayCounts } from '../srs';
import { addList, addPoem, addTopic, childTopics, deleteCard, LIST_PRESETS, resetCardProgress, subjectRules, topicWithDescendants, updateTopic, useData, getData } from '../store';
import { StudyListView } from '../components/StudyListView';
import { PoemView } from '../components/PoemView';
import { usePlugins } from '../plugins/host';
import { AddToRule, RulesDrawer, RuleWordsEditor, useRuleTips } from '../components/Rules';
import { useLinkTips } from '../components/Links';
import { makeRuleMatcher } from '../rules';
import { sameLook } from '../notePhantom';
import { orderTabs, reorderTab } from '../tabs';
import { ExamPlanLine } from './Today';
import { PrintDialog } from '../components/ExportDialogs';
import { keyFor, matches, prettyCombo } from '../keys';
import type { Card, CardType, ListKind, Route } from '../types';
import { openExamDialog } from '../components/ExamDialog';

const TYPE_LABEL: Record<CardType, string> = {
  basic: 'Вопрос — ответ',
  reverse: 'В обе стороны',
  cloze: 'С пропуском',
  typing: 'Ввести ответ',
  problem: 'Задача с числами'
};

export function TopicScreen({ id, tab, go }: { id: string; tab?: string; go: (r: Route) => void }) {
  const data = useData();
  const topic = data.topics.find((t) => t.id === id);
  const [recall, setRecall] = useState(false);
  const [pickDate, setPickDate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [dropped, setDropped] = useState<File[] | null>(null);
  const [subName, setSubName] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const plugins = usePlugins();
  const [noteCards, setNoteCards] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  if (!topic) return <div className="page">Тема не найдена.</div>;
  const subject = data.subjects.find((s) => s.id === topic.subjectId);
  const allCards = data.cards.filter((c) => c.topicId === id);
  const cards = allCards.filter((c) => !c.listId);
  const lists = topic.lists ?? [];
  const counts = todayCounts(data, new Date(), { topicId: id });
  const due = counts.learning + counts.review + counts.newCount;
  const ancestors: { id: string; name: string }[] = [];
  for (let p = data.topics.find((t) => t.id === topic.parentId); p; p = data.topics.find((t) => t.id === p!.parentId)) ancestors.unshift({ id: p.id, name: p.name });
  const kids = childTopics(data, topic.subjectId, id);
  const subCount = topicWithDescendants(data, id).size - 1;
  const listTab = tab?.startsWith('list:') ? lists.find((l) => 'list:' + l.id === tab) : undefined;
  const poems = topic.poems ?? [];
  const poemTab = tab?.startsWith('poem:') ? poems.find((p) => tab.split(':')[1] === p.id) : undefined;
  const current = listTab ? tab! : poemTab ? 'poem:' + poemTab.id : tab === 'note' || tab === 'cards' ? tab : topic.note.trim() || cards.length === 0 ? 'note' : 'cards';
  const f = data.settings.features;
  const examInfo = topic.examDate ? examPlan(data, new Date(), topic.id) : null;
  // Тема уже входит в записанную контрольную (сама или через родителя) — показываем её, а не предлагаем поставить вторую дату.
  const inExam = examsOf(data).find((e) => !e.virtual && (e.topicIds.includes(topic.id) || ancestors.some((a) => e.topicIds.includes(a.id))));
  const tabValues = ['note', 'cards', ...lists.map((l) => 'list:' + l.id), ...poems.map((p) => 'poem:' + p.id)];
  const moveTab = (from: string, to: string) => reorderTab(id, tabValues, from, to);

  return (
    <div
      className="page wide"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        const imgs = [...e.dataTransfer.files].filter((f) => /^image\//.test(f.type));
        if (!imgs.length) return;
        e.preventDefault();
        e.stopPropagation();
        setDropped(imgs);
        go({ name: 'topic', id, tab: 'note' });
        setImportOpen(true);
      }}
    >
      <div className="topic-head">
        <div className="stack gap4 grow">
          <div className="crumbs">
            <button className="crumb" onClick={() => subject && go({ name: 'subject', id: subject.id })}>
              <span className="dot" style={{ background: subject?.color }} /> {subject?.name}
            </button>
            {topic.kind === 'rule' && (
              <span className="row gap4">
                <span className="crumb-sep">›</span>
                <button className="crumb" onClick={() => subject && go({ name: 'subject', id: subject.id, view: 'rules' })}>
                  Правила
                </button>
              </span>
            )}
            {ancestors.map((a) => (
              <span key={a.id} className="row gap4">
                <span className="crumb-sep">›</span>
                <button className="crumb" onClick={() => go({ name: 'topic', id: a.id })}>
                  {a.name}
                </button>
              </span>
            ))}
          </div>
          <div className="row gap8 title-row">
            <input className="title-input" aria-label="Название темы" value={topic.name} onChange={(e) => updateTopic(id, { name: e.target.value })} />
            <button
              className={'star-big' + (topic.important ? ' on' : '')}
              aria-pressed={Boolean(topic.important)}
              aria-label={topic.important ? 'Убрать из важных' : 'Отметить важной'}
              title={(topic.important ? 'Важная тема' : 'Отметить важной') + (keyFor(data.settings, 'toggleImportant') ? ` (${prettyCombo(keyFor(data.settings, 'toggleImportant')).join('+')})` : '')}
              onClick={() => updateTopic(id, { important: !topic.important })}
            >
              <Icon name={topic.important ? 'starFill' : 'star'} size={24} />
            </button>
          </div>
          {topic.kind === 'rule' ? (
            <div className="rule-words-row" title="Где в конспектах предмета встретятся эти слова, всплывёт это правило">
              <span className="small muted">Всплывает на словах</span>
              <RuleWordsEditor words={topic.ruleWords ?? []} onChange={(w) => updateTopic(id, { ruleWords: w })} />
            </div>
          ) : (
          <div className="row gap8 small muted">
            {inExam ? (
              <span className="row gap6 wrap">
                <Icon name="calendar" size={16} /> Контрольная «{inExam.name}», {new Date(inExam.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                <button className="link-btn small" onClick={() => go({ name: 'exam', id: inExam.id })}>
                  открыть
                </button>
              </span>
            ) : topic.examDate && !pickDate ? (
              <span className="row gap6">
                <Icon name="calendar" size={16} /> Контрольная {new Date(topic.examDate + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                <button className="link-btn small" onClick={() => setPickDate(true)}>
                  изменить
                </button>
              </span>
            ) : pickDate ? (
              <span className="row gap6">
                <input
                  className="input date"
                  type="date"
                  autoFocus
                  value={topic.examDate ?? ''}
                  onChange={(e) => updateTopic(id, { examDate: e.target.value || undefined })}
                  onBlur={() => setPickDate(false)}
                />
                {topic.examDate && (
                  <button className="link-btn small" onMouseDown={(e) => e.preventDefault()} onClick={() => { updateTopic(id, { examDate: undefined }); setPickDate(false); }}>
                    убрать
                  </button>
                )}
              </span>
            ) : (
              <button className="link-btn small muted-link" onClick={() => setPickDate(true)}>
                + Дата контрольной
              </button>
            )}
          </div>
          )}
          {topic.examDate && topic.kind !== 'rule' && examInfo && examInfo.total > 0 && <ExamPlanLine plan={examInfo} />}
        </div>
        <div className="row gap8">
          <button className="btn primary big-ish" disabled={due === 0} onClick={() => go({ name: 'review', topicId: id })}>
            <AnimText value={due === 0 ? (allCards.length ? 'Всё повторено' : 'Нет карточек') : `Учить · ${due}`} />
          </button>
          <MoreMenu
            label="Действия с темой"
            items={[
              { label: 'Карточки из конспекта', icon: 'sparkle', onClick: () => setNoteCards(true), hidden: !topic.note.trim() },
              { label: 'Добавить из учебника (фото)', icon: 'camera', onClick: () => { go({ name: 'topic', id, tab: 'note' }); setImportOpen(true); } },
              { label: 'Добавить подтему', icon: 'subtopic', onClick: () => setAddingSub(true), hidden: topic.kind === 'rule' },
              { label: topic.important ? 'Убрать из важных' : 'Отметить важной', icon: 'star', onClick: () => updateTopic(id, { important: !topic.important }) },
              { label: 'Закрой и перескажи', icon: 'eyeOff', onClick: () => setRecall(true), hidden: !topic.note.trim() },
              { label: 'Проверь себя до чтения', icon: 'bulb', onClick: () => go({ name: 'test', topicId: id, pretest: true }), hidden: cards.length < 2 || cards.some((c) => itemOrds(c).some((o) => data.states[itemKey(c.id, o)])) },
              { label: 'Пробная контрольная', icon: 'test', onClick: () => go({ name: 'test', topicId: id }), hidden: cards.length < 2 },
              { label: 'Назначить контрольную', icon: 'calendar', hint: 'Дата и темы — Мнема составит план', onClick: () => openExamDialog({ topicId: id }) },
              { label: 'Повторить всю тему', icon: 'repeat', onClick: () => go({ name: 'review', topicId: id, cram: true }), hidden: cards.length === 0 },
              { label: 'Поделиться темой (файл)', icon: 'share', onClick: () => exportTopic(data, id) },
              { label: 'Выгрузить для нейросети', icon: 'bot', hint: 'Нейросеть поправит и вернёт файл изменений', onClick: () => exportForAi({ topicId: id }) },
              { label: 'Распечатать карточки', icon: 'print', onClick: () => setPrintOpen(true), hidden: allCards.length === 0 },
              ...plugins.topicActions.map((a) => ({ label: a.title, icon: 'puzzle', onClick: () => a.run({ id: topic.id, name: topic.name, note: topic.note, subjectId: topic.subjectId }) })),
              { label: 'Удалить тему', icon: 'trash', danger: true, onClick: () => setConfirmDelete(true) }
            ]}
          />
        </div>
      </div>

      {(kids.length > 0 || addingSub) && (
        <div className="subtopics">
          <span className="label">Подтемы</span>
          <div className="row gap8 wrap">
            {kids.map((k) => {
              const n = data.cards.filter((c) => c.topicId === k.id).length;
              return (
                <button key={k.id} className="subtopic-chip" onClick={() => go({ name: 'topic', id: k.id })}>
                  {k.important && (
                    <span className="star-mark">
                      <Icon name="starFill" size={14} />
                    </span>
                  )}
                  {k.name}
                  {n > 0 && <span className="muted small">{n}</span>}
                </button>
              );
            })}
            {addingSub ? (
              <form
                className="row gap6"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!subName.trim()) return;
                  const t = addTopic(topic.subjectId, subName, id);
                  setSubName('');
                  setAddingSub(false);
                  go({ name: 'topic', id: t.id });
                }}
              >
                <input className="input tiny" autoFocus placeholder="Название подтемы" value={subName} onChange={(e) => setSubName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAddingSub(false)} onBlur={() => !subName.trim() && setAddingSub(false)} />
              </form>
            ) : (
              <button className="subtopic-chip add" onClick={() => setAddingSub(true)}>
                <Icon name="plus" size={14} /> подтема
              </button>
            )}
          </div>
        </div>
      )}

      <div className="topic-tabs">
        <OverflowTabs
          ariaLabel="Раздел темы"
          value={current}
          items={orderTabs(
            [
              { value: 'note', label: 'Конспект' },
              { value: 'cards', label: 'Карточки', count: cards.length },
              ...lists.map((l) => ({ value: 'list:' + l.id, label: l.title, count: allCards.filter((c) => c.listId === l.id).length })),
              ...poems.map((p) => ({ value: 'poem:' + p.id, label: ((p.title || 'Стих').length > 26 ? (p.title || 'Стих').slice(0, 25) + '…' : p.title || 'Стих') }))
            ],
            topic.tabOrder
          )}
          onChange={(v) => go({ name: 'topic', id, tab: v })}
          onReorder={(from, to) => moveTab(from, to)}
        />
        {(f.lists || f.poems) && (
          <MoreMenu
            label="Добавить словарь или список"
            icon="plus"
            title={f.poems ? 'Добавить словарь, термины, даты, стихотворение…' : 'Добавить словарь, термины, даты, формулы…'}
            items={[
              ...(f.lists
                ? (Object.keys(LIST_PRESETS) as ListKind[]).map((k) => ({
                    label: LIST_PRESETS[k].title,
                    hint: LIST_PRESETS[k].hint,
                    icon: 'list',
                    onClick: () => {
                      const l = addList(id, k);
                      go({ name: 'topic', id, tab: 'list:' + l.id });
                    }
                  }))
                : []),
              ...(f.poems
                ? [
                    {
                      label: 'Стихотворение',
                      hint: 'Выучить наизусть по частям — голосом или про себя.',
                      icon: 'book',
                      onClick: () => {
                        const p = addPoem(id);
                        go({ name: 'topic', id, tab: 'poem:' + p.id });
                      }
                    }
                  ]
                : [])
            ]}
          />
        )}
        {f.rules && topic.kind !== 'rule' && subjectRules(data, topic.subjectId).length > 0 && (
          <button className="btn small rules-btn" onClick={() => setRulesOpen(true)} title="Правила предмета">
            <Icon name="rules" size={16} /> Правила
          </button>
        )}
      </div>

      {poemTab ? (
        <PoemView key={poemTab.id + (tab?.endsWith(':whole') ? 'w' : '')} topicId={id} poem={poemTab} start={tab?.endsWith(':whole') ? 'whole' : undefined} go={go} />
      ) : listTab ? (
        <StudyListView key={listTab.id} topicId={id} list={listTab} go={go} subjectId={data.settings.features.lists && ['terms', 'vocab', 'custom'].includes(listTab.kind) ? topic.subjectId : undefined} />
      ) : current === 'note' ? (
        <NoteTab go={go} topicId={id} importOpen={importOpen} setImportOpen={(v) => { setImportOpen(v); if (!v) setDropped(null); }} droppedFiles={dropped} />
      ) : (
        <div className="tab-pane">
          <CardsTab topicId={id} cards={cards} />
        </div>
      )}
      {printOpen && <PrintDialog topicId={id} onClose={() => setPrintOpen(false)} />}
      {noteCards && <NoteToCards topicId={id} onClose={() => setNoteCards(false)} />}
      {rulesOpen && <RulesDrawer subjectId={topic.subjectId} go={go} onClose={() => setRulesOpen(false)} />}

      {recall && <RecallModal note={topic.note} onClose={() => setRecall(false)} />}
      {confirmDelete && (
        <Modal title="Удалить тему?" onClose={() => setConfirmDelete(false)}>
          <div className="stack gap12">
            <p>
              Тема «{topic.name}», её конспект и {cards.length} {plural(cards.length, 'карточка', 'карточки', 'карточек')}
              {subCount > 0 && ` и ${subCount} ${plural(subCount, 'подтема', 'подтемы', 'подтем')} со всем содержимым`} будут удалены. Сразу после удаления тему можно вернуть кнопкой внизу экрана.
            </p>
            <div className="row end gap8">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                Отмена
              </button>
              <button
                className="btn danger-solid"
                onClick={() => {
                  deleteTopicWithUndo(id);
                  go(subject ? { name: 'subject', id: subject.id, ...(topic.kind === 'rule' ? { view: 'rules' as const } : {}) } : { name: 'today' });
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Конспект ----------

function NoteTab({ topicId, importOpen, setImportOpen, droppedFiles, go }: { topicId: string; importOpen: boolean; setImportOpen: (v: boolean) => void; droppedFiles: File[] | null; go: (r: Route) => void }) {
  const data = useData();
  const topic = data.topics.find((t) => t.id === topicId)!;
  // Правила предмета: слова-подсказки в конспекте и «Правило» из выделения.
  const rulesOn = data.settings.features.rules;
  const ruleKey = rulesOn ? data.topics.filter((t) => t.subjectId === topic.subjectId && t.kind === 'rule' && t.ruleWords?.length).map((t) => t.id + ':' + t.ruleWords!.join(',')).join('|') : '';
  const ruleMatcher = useMemo(() => (ruleKey ? makeRuleMatcher(getData(), topic.subjectId, topic.id) : null), [ruleKey, topic.subjectId, topic.id]);
  const { onRuleHover, tip: ruleTip } = useRuleTips(go);
  const { onLinkHover, tip: linkTip } = useLinkTips(go);
  const [ruleFrom, setRuleFrom] = useState<string | null>(null);
  const [draft, setDraft] = useState<null | { type: CardType; front: string; back: string }>(null);
  const [panel, setPanel] = useState(() => {
    try {
      return localStorage.getItem('mnema-important-open') === '1';
    } catch {
      return false;
    }
  });
  const [page, setPage] = useState<number | null>(null);
  const panelPres = usePresence(panel, 180);
  const [version, setVersion] = useState(0);
  const api = useRef<NoteApi | null>(null);
  const hs = data.settings.highlight;
  // Тяжёлый подсчёт «Важного» — не мешает печатать (считается, когда есть свободное время).
  const noteLater = useDeferredValue(topic.note);
  const count = useMemo(() => findImportant(noteLater, hs).filter((i) => !(topic.hiddenImportant ?? []).includes(i.id)).length, [noteLater, hs, topic.hiddenImportant]);
  const highlight = useMemo(() => (panel || hs.show ? { ...hs, show: hs.show } : null), [panel, hs]);
  // Редактор появляется на следующем кадре: сама страница темы открывается сразу, без задержки.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const r = requestAnimationFrame(() => (t = setTimeout(() => setReady(true), 0)));
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(t);
    };
  }, []);
  const togglePanel = (v: boolean) => {
    setPanel(v);
    try {
      localStorage.setItem('mnema-important-open', v ? '1' : '0');
    } catch {
      /* не страшно */
    }
  };
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matches(e, data.settings, 'noteFull')) {
        e.preventDefault();
        setFull((v) => !v);
      } else if (e.key === 'Escape' && full && !document.querySelector('.modal-back, .menu')) setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, data.settings]);
  const fullKey = keyFor(data.settings, 'noteFull');
  const tools = (
    <>
      <button type="button" className={'btn small' + (full ? ' on-tool' : '')} aria-pressed={full} title={(full ? 'Выйти из полноэкранного режима' : 'Конспект на весь экран') + (fullKey ? ` (${prettyCombo(fullKey).join('+')})` : '')} onClick={() => setFull(!full)}>
        <Icon name={full ? 'shrink' : 'expand'} size={16} /> <span className="tl">{full ? 'Свернуть' : 'На весь экран'}</span>
      </button>
      <button type="button" className="btn small" title="Добавить страницы учебника по фото" onClick={() => setImportOpen(true)}>
        <Icon name="camera" size={16} /> <span className="tl">Из учебника</span>
      </button>
      <button type="button" className={'btn small' + (panel ? ' on-tool' : '')} aria-pressed={panel} title="Меню «Важное»" onClick={() => togglePanel(!panel)}>
        <Icon name="important" size={16} /> Важное{count ? ` · ${count}` : ''}
      </button>
    </>
  );
  return (
    <div className={'note-layout tab-pane' + (panelPres.mounted ? ' with-panel' : '') + (full ? ' full' : '')}>
      {full && (
        <div key="full-bar" className="note-full-bar">
          <strong className="clamp1 grow">{topic.name}</strong>
          <button className="btn small" onClick={() => setFull(false)}>
            <Icon name="shrink" size={16} /> Свернуть <span className="muted small key-hint">Esc</span>
          </button>
        </div>
      )}
      <div key="col" className="note-col">
        {!ready ? (
          <div className="note-page note-skeleton" aria-busy="true">
            <i style={{ width: '42%' }} />
            <i />
            <i style={{ width: '88%' }} />
            <i style={{ width: '64%' }} />
          </div>
        ) : (
        <NoteEditor
          key={topicId + ':' + version}
          markdown={topic.note}
          // Редактор при закрытии темы отдаёт текст в своей записи (отступы, «-» вместо «*»…) — если выглядит так же, это не правка.
          onChange={(md) => md !== topic.note && !sameLook(md, topic.note) && updateTopic(topicId, { note: md })}
          onMakeCard={(t) => t.trim() && setDraft(suggestFromSelection(t))}
          highlight={highlight}
          onPage={setPage}
          tools={tools}
          onReady={(a) => (api.current = a)}
          rules={ruleMatcher}
          onRuleHover={onRuleHover}
          onAddRule={rulesOn ? setRuleFrom : undefined}
          onLinkHover={onLinkHover}
          topicId={topicId}
        />
        )}
        {!topic.note.trim() && (
          <button className="tb-hint" onClick={() => setImportOpen(true)}>
            <Icon name="camera" size={22} />
            <span>
              <strong>Есть параграф в учебнике?</strong> Сфотографируй страницы — Мнема сделает из них конспект, выделит важное и сохранит ссылки на страницы.
            </span>
          </button>
        )}
      </div>
      {panelPres.mounted && (
        <div className={'imp-wrap' + (panelPres.closing ? ' closing' : '')}>
          <ImportantPanel topicId={topicId} onShow={(t) => api.current?.showText(t)} onPage={setPage} onClose={() => togglePanel(false)} />
        </div>
      )}
      {draft && (
        <Modal title="Новая карточка" onClose={() => setDraft(null)} width={620}>
          <CardEditor topicId={topicId} initial={draft} onDone={() => setDraft(null)} />
        </Modal>
      )}
      {page !== null && <PageViewer pages={topic.pages ?? []} page={page} onClose={() => setPage(null)} />}
      {ruleTip}
      {linkTip}
      {ruleFrom && <AddToRule subjectId={topic.subjectId} text={ruleFrom} onClose={() => setRuleFrom(null)} />}
      {importOpen && (
        <TextbookImport
          initialFiles={droppedFiles ?? undefined}
          hasNote={Boolean(topic.note.trim())}
          onClose={() => setImportOpen(false)}
          onDone={(md, photos, mode) => {
            const note = mode === 'replace' || !topic.note.trim() ? md : topic.note.trimEnd() + '\n\n' + md;
            const keep = (topic.pages ?? []).filter((p) => !photos.some((x) => x.n === p.n));
            updateTopic(topicId, { note, pages: [...keep, ...photos].sort((a, b) => a.n - b.n) });
            setImportOpen(false);
            setVersion((v) => v + 1);
            togglePanel(true);
          }}
        />
      )}
    </div>
  );
}

// ---------- «Закрой и перескажи» ----------

function RecallModal({ note, onClose }: { note: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [compare, setCompare] = useState(false);
  const terms = useMemo(() => boldTerms(note), [note]);
  const missed = compare ? terms.filter((t) => !mentioned(t, text)) : [];
  return (
    <Modal title="Закрой и перескажи" onClose={onClose} width={compare ? 980 : 640} sticky>
      {!compare ? (
        <div className="stack gap12">
          <p className="muted">Конспект спрятан. Напиши всё, что помнишь по теме, своими словами. Вспоминать полезнее, чем перечитывать.</p>
          <textarea className="recall-input" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Что я помню…" />
          <div className="row end gap8">
            <button className="btn ghost" onClick={onClose}>
              Отмена
            </button>
            <button className="btn primary" disabled={!text.trim()} onClick={() => setCompare(true)}>
              Сравнить с конспектом
            </button>
          </div>
        </div>
      ) : (
        <div className="stack gap12">
          {terms.length > 0 && (
            <div className={'hint ' + (missed.length ? 'warn' : 'ok')}>
              {missed.length === 0 ? `Ты вспомнил все ${terms.length} главных понятий. Отлично!` : `Вспомнил ${terms.length - missed.length} из ${terms.length} главных понятий. Не вспомнил: ${missed.join(', ')}.`}
            </div>
          )}
          <div className="compare">
            <div className="stack gap6">
              <span className="label">Мой пересказ</span>
              <div className="compare-box">{text}</div>
            </div>
            <div className="stack gap6">
              <span className="label">Конспект</span>
              <div className="compare-box">
                <Markdown text={note} />
              </div>
            </div>
          </div>
          <div className="row end gap8">
            <button className="btn ghost" onClick={() => setCompare(false)}>
              Дописать
            </button>
            <button className="btn primary" onClick={onClose}>
              Готово
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Карточки ----------

function CardsTab({ topicId, cards }: { topicId: string; cards: Card[] }) {
  const data = useData();
  const [editing, setEditing] = useState<string | null>(null);
  const [fromNote, setFromNote] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [onlyHard, setOnlyHard] = useState(false);
  const now = Date.now();
  const q = normalizeAnswer(query);
  const hard = cards.filter((c) => isLeech(data, c));
  const shown = cards.filter((c) => (!q || normalizeAnswer(c.front + ' ' + c.back).includes(q)) && (!onlyHard || isLeech(data, c)));
  const editingCard = cards.find((c) => c.id === editing);

  function nextDue(c: Card): string {
    const keys = itemOrds(c).map((o) => itemKey(c.id, o));
    const states = keys.map((k) => data.states[k]).filter(Boolean);
    if (states.length < keys.length) return 'новая';
    const due = Math.min(...states.map((s) => new Date(s.due).getTime()));
    return due <= now ? 'сегодня' : 'через ' + formatInterval(due - now);
  }

  if (cards.length === 0) {
    return (
      <div className="empty">
        <strong>Карточек пока нет</strong>
        <span>Мнема может сама сделать черновики из конспекта: жирное, определения, даты, «Запомни». Или {selHow('В карточку')}.</span>
        <div className="row gap8 wrap">
          <button className="btn primary" onClick={() => setFromNote(true)}>
            <Icon name="sparkle" size={18} /> Сделать из конспекта
          </button>
          <button className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Вручную
          </button>
        </div>
        {fromNote && <NoteToCards topicId={topicId} onClose={() => setFromNote(false)} />}
        {adding && (
          <Modal title="Новая карточка" onClose={() => setAdding(false)} width={620}>
            <CardEditor topicId={topicId} onDone={() => setAdding(false)} />
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="stack gap12">
      <div className="row gap8 wrap">
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Карточка
        </button>
        <button className="btn" onClick={() => setFromNote(true)} title="Черновики карточек из жирного, определений и дат конспекта">
          <Icon name="sparkle" size={16} /> Из конспекта
        </button>
        {fromNote && <NoteToCards topicId={topicId} onClose={() => setFromNote(false)} />}
        {hard.length > 0 && (
          <button className={'chip-btn' + (onlyHard ? ' on' : '')} onClick={() => setOnlyHard(!onlyHard)} title="Карточки, которые долго не запоминаются">
            Трудные · {hard.length}
          </button>
        )}
        <span className="grow" />
        {cards.length > 8 && <input className="input search" placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />}
      </div>
      {onlyHard && <div className="hint warn">Эти карточки не запоминаются уже несколько раз. Скорее всего, их стоит переписать: разбить на части, сократить ответ или добавить объяснение «почему».</div>}
      <div className="card-list">
        {shown.map((c) => (
          <button key={c.id} className="card-row" onClick={() => setEditing(c.id)}>
            <span className="row between small muted">
              <span>
                {TYPE_LABEL[c.type]}
                {isLeech(data, c) && <span className="tag warn">трудная</span>}
              </span>
              <span>{nextDue(c)}</span>
            </span>
            <Markdown className="card-row-q" text={c.type === 'cloze' ? buildPrompt(c, 0).question.replace(/\*\*/g, '') : c.front} />
            {c.type !== 'cloze' && <Markdown className="muted small clamp" text={c.type === 'typing' ? c.back.split('|').join(' или ') : c.back} />}
          </button>
        ))}
        {shown.length === 0 && <div className="muted small">Ничего не найдено.</div>}
      </div>
      {adding && (
        <Modal title="Новая карточка" onClose={() => setAdding(false)} width={620}>
          <CardEditor topicId={topicId} onDone={() => setAdding(false)} />
        </Modal>
      )}
      {editingCard && (
        <Modal title="Карточка" onClose={() => setEditing(null)} width={620}>
          <CardEditor topicId={topicId} card={editingCard} onDone={() => setEditing(null)} />
          <div className="row gap8 mt12 top-line">
            <button className="btn ghost small" onClick={() => resetCardProgress(editingCard.id)}>
              <Icon name="undo" size={16} /> Начать заново
            </button>
            <span className="grow" />
            <ConfirmButton
              className="btn ghost danger small"
              onConfirm={() => {
                deleteCard(editingCard.id);
                setEditing(null);
              }}
            >
              <Icon name="trash" size={16} /> Удалить карточку
            </ConfirmButton>
          </div>
        </Modal>
      )}
    </div>
  );
}
