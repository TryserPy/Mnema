// «＋ Создать»: одно место, откуда создаётся всё — карточка, тема, предмет, домашка, контрольная, файл изменений.
// На компьютере — кнопка в левой панели, на телефоне — ячейка нижней панели; из поиска — команда «Создать…».
import { useEffect, useState } from 'react';
import { addCard, addTopic, sortedSubjects, useData } from '../store';
import type { Route } from '../types';
import { openChanges } from './ChangesDialog';
import { openExamDialog } from './ExamDialog';
import { Icon, Modal, toast } from './ui';

type Sheet = null | 'menu' | 'card' | 'topic';
let opener: ((s: Sheet) => void) | null = null;
/** Открыть «Создать» из любого места (кнопки оболочки, поиск). */
export const openCreate = () => opener?.('menu');

/** Куда по умолчанию кладём новое: тема, которая открыта сейчас, или предмет открытого экрана. */
function here(route: Route, data: ReturnType<typeof useData>): { topicId?: string; subjectId?: string } {
  if (route.name === 'topic') {
    const t = data.topics.find((x) => x.id === route.id);
    return { topicId: t?.id, subjectId: t?.subjectId };
  }
  if (route.name === 'subject') return { subjectId: route.id };
  return {};
}

export function CreateHost({ route, go, onNewSubject }: { route: Route; go: (r: Route) => void; onNewSubject: (o?: { as?: 'subject' | 'folder' }) => void }) {
  const data = useData();
  const [sheet, setSheet] = useState<Sheet>(null);
  useEffect(() => {
    opener = setSheet;
    return () => {
      opener = null;
    };
  }, []);
  if (!sheet) return null;
  const close = () => setSheet(null);
  const at = here(route, data);
  if (sheet === 'card') return <QuickCardDialog at={at} onClose={close} />;
  if (sheet === 'topic') return <QuickTopicDialog at={at} go={go} onClose={close} />;

  const items: { icon: string; title: string; hint: string; run: () => void; hidden?: boolean }[] = [
    { icon: 'cardPlus', title: 'Быстрая карточка', hint: 'Вопрос и ответ — в любую тему', run: () => setSheet('card'), hidden: data.topics.length === 0 },
    { icon: 'book', title: 'Новая тема', hint: 'Название — конспект допишешь потом', run: () => setSheet('topic'), hidden: data.subjects.length === 0 },
    { icon: 'folderPlus', title: 'Новый предмет', hint: 'Например, «Биология»', run: () => (close(), onNewSubject()) },
    { icon: 'folder', title: 'Новая папка', hint: 'Собрать предметы вместе, например «Естественные науки»', run: () => (close(), onNewSubject({ as: 'folder' })) },
    { icon: 'homework', title: 'Домашка', hint: 'Что задали и к какому сроку', run: () => (close(), go({ name: 'homework' })), hidden: !data.settings.features.homework },
    { icon: 'calendar', title: 'Контрольная', hint: 'Дата и темы — Мнема составит план', run: () => (close(), openExamDialog(at)), hidden: data.topics.length === 0 },
    { icon: 'upload', title: 'Файл изменений', hint: 'Загрузить конспекты и карточки от нейросети', run: () => (close(), openChanges()) }
  ];
  return (
    <Modal title="Создать" onClose={close} width={460}>
      <div className="create-list" role="menu">
        {items
          .filter((i) => !i.hidden)
          .map((i) => (
            <button key={i.title} type="button" role="menuitem" className="create-item" onClick={i.run}>
              <span className="create-ico">
                <Icon name={i.icon} size={22} />
              </span>
              <span className="create-text">
                <strong>{i.title}</strong>
                <span className="small muted">{i.hint}</span>
              </span>
            </button>
          ))}
      </div>
    </Modal>
  );
}

function TopicSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const data = useData();
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Тема">
      {sortedSubjects(data).map((s) => (
        <optgroup key={s.id} label={s.name}>
          {data.topics
            .filter((t) => t.subjectId === s.id && !t.kind)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.parentId ? '↳ ' : ''}
                {t.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

function QuickCardDialog({ at, onClose }: { at: { topicId?: string; subjectId?: string }; onClose: () => void }) {
  const data = useData();
  const firstTopic = data.topics.find((t) => !t.kind && (!at.subjectId || t.subjectId === at.subjectId)) ?? data.topics.find((t) => !t.kind);
  const [topicId, setTopicId] = useState(at.topicId ?? firstTopic?.id ?? '');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [added, setAdded] = useState(0);
  const ok = Boolean(topicId && front.trim() && back.trim());
  function save(more: boolean) {
    if (!ok) return;
    addCard({ topicId, type: 'basic', front: front.trim(), back: back.trim() });
    if (more) {
      setAdded(added + 1);
      setFront('');
      setBack('');
    } else {
      toast(added ? `Добавлено карточек: ${added + 1}` : 'Карточка добавлена');
      onClose();
    }
  }
  return (
    <Modal title="Быстрая карточка" onClose={onClose} width={520}>
      <form
        className="stack gap12"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        <label className="stack gap4">
          <span className="small muted">В какую тему</span>
          <TopicSelect value={topicId} onChange={setTopicId} />
        </label>
        <label className="stack gap4">
          <span className="small muted">Вопрос</span>
          <textarea className="input" rows={2} autoFocus value={front} onChange={(e) => setFront(e.target.value)} />
        </label>
        <label className="stack gap4">
          <span className="small muted">Ответ</span>
          <textarea className="input" rows={2} value={back} onChange={(e) => setBack(e.target.value)} />
        </label>
        {added > 0 && <span className="small muted">Уже добавлено: {added}</span>}
        <div className="row between gap8 wrap">
          <button type="button" className="btn" disabled={!ok} onClick={() => save(true)}>
            Сохранить и ещё одну
          </button>
          <span className="row gap8">
            <button type="button" className="btn ghost" onClick={onClose}>
              {added ? 'Готово' : 'Отмена'}
            </button>
            <button className="btn primary" type="submit" disabled={!ok}>
              Сохранить
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

function QuickTopicDialog({ at, go, onClose }: { at: { subjectId?: string }; go: (r: Route) => void; onClose: () => void }) {
  const data = useData();
  const subjects = sortedSubjects(data);
  const [subjectId, setSubjectId] = useState(at.subjectId ?? subjects[0]?.id ?? '');
  const [name, setName] = useState('');
  const ok = Boolean(subjectId && name.trim());
  return (
    <Modal title="Новая тема" onClose={onClose} width={460}>
      <form
        className="stack gap12"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          const t = addTopic(subjectId, name);
          onClose();
          go({ name: 'topic', id: t.id });
        }}
      >
        <label className="stack gap4">
          <span className="small muted">В каком предмете</span>
          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="stack gap4">
          <span className="small muted">Название</span>
          <input className="input" autoFocus placeholder="Например, §12 Фотосинтез" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row end gap8">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" type="submit" disabled={!ok}>
            Создать
          </button>
        </div>
      </form>
    </Modal>
  );
}
