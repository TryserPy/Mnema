// Контрольная: создать или изменить — название, предмет, дата и темы (можно несколько).
import { useEffect, useMemo, useState } from 'react';
import { examById, type ExamView } from '../examList';
import { childTopics, deleteExam, saveExam, sortedSubjects, useData } from '../store';
import type { AppData, Route, Topic } from '../types';
import { Icon, Modal, toast } from './ui';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Темы предмета по порядку, подтемы с отступом. */
function flatTopics(data: AppData, subjectId: string): { t: Topic; depth: number }[] {
  const out: { t: Topic; depth: number }[] = [];
  const walk = (parentId: string | undefined, depth: number) => {
    for (const t of childTopics(data, subjectId, parentId)) {
      out.push({ t, depth });
      walk(t.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

export function ExamDialog({ examId, subjectId, topicId, onClose, onSaved }: { examId?: string; subjectId?: string; topicId?: string; onClose: () => void; onSaved?: (id: string) => void }) {
  const data = useData();
  const existing: ExamView | null = examId ? examById(data, examId) : null;
  const startTopic = topicId ? data.topics.find((t) => t.id === topicId) : undefined;
  const subjects = sortedSubjects(data);
  const [subject, setSubject] = useState(existing?.subjectId ?? subjectId ?? startTopic?.subjectId ?? subjects[0]?.id ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [date, setDate] = useState(existing?.date ?? ymd(new Date(Date.now() + 7 * 86400000)));
  const [picked, setPicked] = useState<Set<string>>(new Set(existing?.topicIds ?? (startTopic ? [startTopic.id] : [])));
  const list = useMemo(() => flatTopics(data, subject), [data, subject]);
  const subj = data.subjects.find((s) => s.id === subject);
  const canSave = Boolean(subject && date && picked.size > 0);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function save() {
    if (!canSave) return;
    const topicIds = list.filter(({ t }) => picked.has(t.id)).map(({ t }) => t.id);
    const e = saveExam({ id: existing?.id, subjectId: subject, name: name.trim() || `Контрольная: ${subj?.name ?? ''}`.trim(), date, topicIds });
    onSaved?.(e.id);
    onClose();
  }

  return (
    <Modal title={existing ? 'Изменить контрольную' : 'Новая контрольная'} onClose={onClose} width={560}>
      <div className="stack gap12">
        <label className="stack gap4">
          <span className="small muted">Название</span>
          <input className="input" autoFocus value={name} placeholder={subj ? `Например: контрольная по предмету «${subj.name}»` : 'Название'} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row gap12 wrap">
          <label className="stack gap4 grow">
            <span className="small muted">Предмет</span>
            <select
              className="input"
              value={subject}
              disabled={Boolean(existing)}
              onChange={(e) => {
                setSubject(e.target.value);
                setPicked(new Set());
              }}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="stack gap4">
            <span className="small muted">Когда</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="stack gap6">
          <div className="row between gap8">
            <span className="small muted">Какие темы будут ({picked.size})</span>
            <span className="row gap6">
              <button type="button" className="btn small ghost" onClick={() => setPicked(new Set(list.map(({ t }) => t.id)))}>
                Все
              </button>
              <button type="button" className="btn small ghost" onClick={() => setPicked(new Set())}>
                Снять
              </button>
            </span>
          </div>
          <div className="exam-topics">
            {list.length === 0 && <span className="muted small pad-note">В этом предмете пока нет тем.</span>}
            {list.map(({ t, depth }) => (
              <label key={t.id} className="exam-topic-pick" style={{ paddingLeft: 8 + depth * 18 }}>
                <input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} />
                <span className="clamp1">
                  {depth > 0 && <span className="sub-mark">↳ </span>}
                  {t.name}
                </span>
              </label>
            ))}
          </div>
          <span className="small muted">Подтемы входят вместе с темой.</span>
        </div>
        <div className="row between gap8 wrap">
          {existing ? (
            <button
              className="btn ghost danger-text"
              onClick={() => {
                const undo = deleteExam(existing.id);
                toast('Контрольная удалена', { label: 'Вернуть', run: undo });
                onClose();
              }}
            >
              <Icon name="trash" size={16} /> Удалить
            </button>
          ) : (
            <span />
          )}
          <span className="row gap8">
            <button className="btn ghost" onClick={onClose}>
              Отмена
            </button>
            <button className="btn primary" disabled={!canSave} onClick={save}>
              Сохранить
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}

// Открыть окно «Новая контрольная» из любого места (поиск, меню предмета и темы, «Сегодня»): окно живёт один раз, в App.
interface Opener {
  subjectId?: string;
  topicId?: string;
  examId?: string;
}
let opener: ((o: Opener) => void) | null = null;
export const openExamDialog = (o: Opener = {}) => opener?.(o);

export function ExamDialogHost({ go }: { go: (r: Route) => void }) {
  const [o, setO] = useState<Opener | null>(null);
  useEffect(() => {
    opener = setO;
    return () => {
      opener = null;
    };
  }, []);
  if (!o) return null;
  return <ExamDialog {...o} onClose={() => setO(null)} onSaved={(id) => go({ name: 'exam', id })} />;
}
