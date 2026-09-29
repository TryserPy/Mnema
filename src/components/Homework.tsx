// Домашние задания: быстрая запись, список по срокам, отметка «сделано», напоминания.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { defaultRemind, dueLabel, fromYmd, GROUP_LABEL, groupOf, nextLesson, ymd, type HwGroup } from '../homework';
import { addHomework, deleteHomework, sortedSubjects, toggleHomework, updateHomework, useData } from '../store';
import type { Homework, Route } from '../types';
import { AnimText, Collapse, Icon, Modal, plural, SubjectMark, Switch, toast, usePresence, touchUI } from './ui';

const ORDER: HwGroup[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'nodate', 'done'];

function localDateTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}


/** Фото задания: уменьшить до 1400 px по длинной стороне и сжать в JPEG. */
async function photoToData(file: File): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

/** Картинки из буфера обмена (Ctrl+V): скриншот, фото, скопированная картинка. */
export async function pastedPhotos(e: ClipboardEvent | React.ClipboardEvent, room: number): Promise<string[]> {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room));
  if (!files.length) return [];
  e.preventDefault();
  return Promise.all(files.map(photoToData));
}

/** Фото во весь экран: нажал — закрылось; стрелки — листать. */
export function PhotoView({ photos, start = 0, onClose }: { photos: string[]; start?: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => Math.min(photos.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [photos.length, onClose]);
  return createPortal(
    <div className="photo-view" onClick={onClose} role="dialog" aria-label="Фото задания">
      <img src={photos[i]} alt={`Фото ${i + 1}`} />
      {photos.length > 1 && (
        <div className="photo-dots" onClick={(e) => e.stopPropagation()}>
          {photos.map((_, k) => (
            <button key={k} className={k === i ? 'on' : ''} aria-label={`Фото ${k + 1}`} onClick={() => setI(k)} />
          ))}
        </div>
      )}
      <button className="photo-close" aria-label="Закрыть">
        <Icon name="x" size={22} />
      </button>
    </div>,
    document.body
  );
}

/** Миниатюры фото с «убрать» и кнопкой «добавить». */
function PhotoStrip({ photos, onChange, compact = false }: { photos: string[]; onChange: (p: string[]) => void; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className={'photo-strip' + (compact ? ' compact' : '')}>
      {photos.map((p, i) => (
        <span key={i} className="photo-thumb">
          <img src={p} alt={`Фото ${i + 1}`} onClick={() => setView(i)} />
          <button type="button" aria-label="Убрать фото" onClick={() => onChange(photos.filter((_, k) => k !== i))}>
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      {photos.length < 4 && (
        <button type="button" className={compact ? 'icon-btn small' : 'photo-add'} title="Фото задания: доска, дневник, страница" aria-label="Добавить фото" disabled={busy} onClick={() => ref.current?.click()}>
          <Icon name="camera" size={compact ? 18 : 20} />
          {!compact && <span>{busy ? 'Загружаю…' : 'Фото'}</span>}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])].slice(0, 4 - photos.length);
          e.target.value = '';
          if (!files.length) return;
          setBusy(true);
          try {
            const out = await Promise.all(files.map(photoToData));
            onChange([...photos, ...out]);
          } catch {
            toast('Не получилось открыть фото');
          }
          setBusy(false);
        }}
      />
      {view !== null && <PhotoView photos={photos} start={view} onClose={() => setView(null)} />}
    </div>
  );
}

/** Форма: что задали, по какому предмету, к какому дню, когда напомнить. */
export function HomeworkForm({ initial, subjectId: presetSubject, onDone }: { initial?: Homework; subjectId?: string; onDone: () => void }) {
  const data = useData();
  const subjects = sortedSubjects(data);
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? presetSubject ?? subjects[0]?.id ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const next = subjectId ? nextLesson(data, subjectId) : null;
  const t = new Date();
  t.setDate(t.getDate() + 1);
  const [due, setDue] = useState<string | undefined>(initial ? initial.due : next ?? ymd(t));
  // Пока срок не выбран руками, он следует за предметом: «к следующему уроку» по расписанию.
  const [dueTouched, setDueTouched] = useState(Boolean(initial));
  const pickSubject = (id: string) => {
    setSubjectId(id);
    if (!dueTouched) {
      setDue(nextLesson(data, id) ?? ymd(t));
      setRemind(undefined);
    }
  };
  const [remindOn, setRemindOn] = useState(initial ? Boolean(initial.remind) : data.settings.homeworkRemind.on);
  const [remind, setRemind] = useState<string | undefined>(initial?.remind);
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const autoRemind = defaultRemind(data, due);
  const shownRemind = remind ?? autoRemind;
  const chips: [string, string | undefined][] = [];
  if (next) chips.push(['К следующему уроку', next]);
  chips.push(['Завтра', ymd(t)]);
  const t2 = new Date();
  t2.setDate(t2.getDate() + 2);
  chips.push(['Послезавтра', ymd(t2)]);
  const t7 = new Date();
  t7.setDate(t7.getDate() + 7);
  chips.push(['Через неделю', ymd(t7)]);
  chips.push(['Без срока', undefined]);

  return (
    <form
      className="stack gap12"
      onPaste={async (e) => {
        const got = await pastedPhotos(e, 4 - photos.length);
        if (got.length) setPhotos((p) => [...p, ...got].slice(0, 4));
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() && !photos.length) return;
        const r = remindOn ? shownRemind : undefined;
        if (r && window.mnemaApi?.notifyPermission) await window.mnemaApi.notifyPermission();
        const patch = { subjectId: subjectId || undefined, text: text.trim() || 'Задание на фото', due, remind: r, photos: photos.length ? photos : undefined };
        if (initial) updateHomework(initial.id, patch);
        else addHomework(patch);
        onDone();
      }}
    >
      <label className="field">
        <span>Что задали</span>
        <textarea className="input hw-text" autoFocus rows={3} placeholder="Например: § 12, упр. 3 и 5; выучить правило на с. 40" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="field">
        <span>Фото</span>
        <PhotoStrip photos={photos} onChange={setPhotos} />
      </div>
      {subjects.length > 0 && (
        <div className="field">
          <span>Предмет</span>
          <div className="hw-subjects">
            {subjects.map((s) => (
              <button type="button" key={s.id} className={'hw-subj' + (s.id === subjectId ? ' on' : '')} style={{ ['--c' as string]: s.color }} onClick={() => pickSubject(s.id)}>
                <SubjectMark color={s.color} icon={s.icon} /> {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <span>Когда сдавать</span>
        <div className="look-row">
          {chips.map(([label, v]) => (
            <button key={label} type="button" className={'look-chip' + (due === v ? ' on' : '')} onClick={() => (setDue(v), setDueTouched(true), setRemind(undefined))}>
              {label}
              {v && <small className="muted"> · {fromYmd(v).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })}</small>}
            </button>
          ))}
          <input className="input date" type="date" aria-label="Своя дата" value={due ?? ''} onChange={(e) => (setDue(e.target.value || undefined), setDueTouched(true), setRemind(undefined))} />
        </div>
      </div>
      <div className="row gap12 wrap hw-remind">
        <Switch label="Напомнить" checked={remindOn} onChange={setRemindOn} />
        <span className="grow">Напомнить</span>
        {remindOn && <input className="input" type="datetime-local" aria-label="Когда напомнить" value={localDateTime(shownRemind)} onChange={(e) => setRemind(e.target.value ? new Date(e.target.value).toISOString() : undefined)} />}
      </div>
      {remindOn && !shownRemind && <span className="small muted">Выбери дату — и Мнема напомнит накануне в {data.settings.homeworkRemind.time}.</span>}
      <div className="row end gap8">
        <button type="button" className="btn ghost" onClick={onDone}>
          Отмена
        </button>
        <button className="btn primary" type="submit" disabled={!text.trim() && !photos.length}>
          {initial ? 'Сохранить' : 'Записать'}
        </button>
      </div>
    </form>
  );
}

/** Одна строка задания: кружок «сделано», текст, предмет и срок. Нажал на текст — изменить. */
function HwRow({ h, go, i = 0 }: { h: Homework; go?: (r: Route) => void; i?: number }) {
  const data = useData();
  const [edit, setEdit] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const s = data.subjects.find((x) => x.id === h.subjectId);
  const g = groupOf(h);
  const remind = h.remind && !h.done && Date.parse(h.remind) > Date.now();
  return (
    <div className={'hw-row' + (h.done ? ' done' : '') + (g === 'overdue' ? ' overdue' : '')} style={{ animationDelay: Math.min(i, 10) * 25 + 'ms' }}>
      <button className={'hw-circle' + (h.done ? ' on' : '')} role="checkbox" aria-checked={Boolean(h.done)} aria-label={h.done ? 'Не сделано' : 'Сделано'} onClick={() => toggleHomework(h.id)} style={{ ['--c' as string]: s?.color ?? 'var(--accent)' }}>
        <Icon name="check" size={13} />
      </button>
      <button className="hw-main" onClick={() => setEdit(true)}>
        <span className="hw-text-line">{h.text}</span>
        <span className="hw-meta">
          {s && (
            <span className="hw-subj-name">
              <span className="dot" style={{ background: s.color }} />
              {s.name}
            </span>
          )}
          <span className={g === 'overdue' ? 'hw-late' : ''}>{dueLabel(h.due)}</span>
        </span>
      </button>
      {h.photos?.length ? (
        <button className="hw-photo" title="Фото задания" aria-label="Открыть фото задания" onClick={() => setPhotoOpen(true)}>
          <img src={h.photos[0]} alt="" />
          {h.photos.length > 1 && <span>{h.photos.length}</span>}
        </button>
      ) : null}
      {photoOpen && h.photos && <PhotoView photos={h.photos} onClose={() => setPhotoOpen(false)} />}
      {remind && (
        <span className="hw-bell" title={'Напомню ' + new Date(h.remind!).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}>
          <Icon name="bell" size={15} />
        </span>
      )}
      {go && s && !h.done && (
        <button className="icon-btn tiny hw-go" title={`Открыть «${s.name}»`} aria-label={`Открыть ${s.name}`} onClick={() => go({ name: 'subject', id: s.id })}>
          <Icon name="right" size={16} />
        </button>
      )}
      {edit && (
        <Modal title="Задание" onClose={() => setEdit(false)} width={560}>
          <HomeworkForm initial={h} onDone={() => setEdit(false)} />
          <div className="row mt12 top-line">
            <button
              className="btn ghost danger-text small"
              onClick={() => {
                deleteHomework(h.id);
                setEdit(false);
                toast('Задание удалено');
              }}
            >
              <Icon name="trash" size={16} /> Удалить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Кнопка-«таблетка» с выпадающим списком (предмет, срок). */
function Pill({ label, children, open, setOpen }: { label: React.ReactNode; children: React.ReactNode; open: boolean; setOpen: (v: boolean) => void }) {
  const pres = usePresence(open, 140);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open, setOpen]);
  return (
    <div className="pill-menu" ref={ref}>
      <button type="button" className={'pill-btn' + (open ? ' open' : '')} aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
        <Icon name="chevron" size={12} />
      </button>
      {pres.mounted && (
        <div className={'menu' + (pres.closing ? ' closing' : '')} role="menu">
          {children}
        </div>
      )}
    </div>
  );
}

/** Быстрая запись: текст, предмет и срок — и Enter. */
function QuickAdd({ presetSubject }: { presetSubject?: string }) {
  const data = useData();
  const subjects = sortedSubjects(data);
  const [text, setText] = useState('');
  const [subjectId, setSubjectId] = useState<string | undefined>(presetSubject);
  const [due, setDue] = useState<string | undefined | null>(null); // null — «по расписанию/завтра»
  const [menu, setMenu] = useState<'s' | 'd' | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setSubjectId(presetSubject), [presetSubject]);
  // Ctrl+V с картинкой в любом месте экрана «Домашка» (не в поле ввода) — фото к новому заданию.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('form, .modal, input, textarea, [contenteditable="true"]')) return;
      const got = await pastedPhotos(e, 4);
      if (got.length) {
        setPhotos((p) => [...p, ...got].slice(0, 4));
        toast('Фото добавлено — допиши, что задали, и нажми Enter');
        inputRef.current?.focus();
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);
  const t1 = new Date();
  t1.setDate(t1.getDate() + 1);
  const next = subjectId ? nextLesson(data, subjectId) : null;
  const autoDue = next ?? ymd(t1);
  const realDue = due === null ? autoDue : due;
  const s = subjects.find((x) => x.id === subjectId);
  const dueName = due === null ? (next ? 'к следующему уроку' : 'на завтра') : dueLabel(realDue);
  const opts: [string, string | undefined][] = [];
  if (next) opts.push(['К следующему уроку', next]);
  const add = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return ymd(d);
  };
  opts.push(['Завтра', add(1)], ['Послезавтра', add(2)], ['Через неделю', add(7)], ['Без срока', undefined]);
  const submit = async () => {
    if (!text.trim() && !photos.length) return;
    const remind = defaultRemind(data, realDue);
    if (remind && window.mnemaApi?.notifyPermission) await window.mnemaApi.notifyPermission();
    addHomework({ text: text.trim() || 'Задание на фото', subjectId, due: realDue, remind, photos: photos.length ? photos : undefined });
    toast('Записано' + (remind ? ' — напомню ' + new Date(remind).toLocaleString('ru-RU', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''));
    setText('');
    setDue(null);
    setPhotos([]);
    setSubjectId(presetSubject);
    inputRef.current?.focus();
  };
  return (
    <form
      className="hw-quick"
      onPaste={async (e) => {
        const got = await pastedPhotos(e, 4 - photos.length);
        if (got.length) {
          setPhotos((p) => [...p, ...got].slice(0, 4));
          toast('Фото добавлено — допиши, что задали, и нажми Enter');
          inputRef.current?.focus();
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Icon name="plus" size={18} />
      <input ref={inputRef} className="hw-quick-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={touchUI() ? 'Что задали? Например: § 12, упр. 3' : 'Что задали? Можно вставить фото — Ctrl+V'} aria-label="Что задали" />
      <div className="hw-quick-pills">
        <Pill
          open={menu === 's'}
          setOpen={(v) => setMenu(v ? 's' : null)}
          label={
            s ? (
              <>
                <span className="dot" style={{ background: s.color }} /> {s.name}
              </>
            ) : (
              'Предмет'
            )
          }
        >
          <button type="button" role="menuitem" onClick={() => (setSubjectId(undefined), setMenu(null))}>
            <span className="grow muted">Без предмета</span>
          </button>
          {subjects.map((x) => (
            <button type="button" role="menuitem" key={x.id} onClick={() => (setSubjectId(x.id), setMenu(null))}>
              <SubjectMark color={x.color} icon={x.icon} /> <span className="grow clamp1">{x.name}</span>
            </button>
          ))}
        </Pill>
        <Pill open={menu === 'd'} setOpen={(v) => setMenu(v ? 'd' : null)} label={<>{dueName}</>}>
          {opts.map(([label, v]) => (
            <button type="button" role="menuitem" key={label} onClick={() => (setDue(v), setMenu(null))}>
              <span className="grow">{label}</span>
              {v && <span className="small muted">{fromYmd(v).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })}</span>}
            </button>
          ))}
          <label className="menu-date" onMouseDown={(e) => e.stopPropagation()}>
            <span className="grow">Другой день</span>
            <input type="date" className="input date" value={realDue ?? ''} onChange={(e) => (setDue(e.target.value || undefined), setMenu(null))} />
          </label>
        </Pill>
        <PhotoStrip photos={photos} onChange={setPhotos} compact />
        <button className="btn primary small" type="submit" disabled={!text.trim() && !photos.length}>
          Записать
        </button>
      </div>
    </form>
  );
}

/** Экран «Домашка». */
export function HomeworkScreen({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const [showDone, setShowDone] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const groups = useMemo(() => {
    const m = new Map<HwGroup, Homework[]>();
    for (const h of data.homework) {
      if (filter && h.subjectId !== filter) continue;
      const g = groupOf(h);
      m.set(g, [...(m.get(g) ?? []), h]);
    }
    for (const [g, list] of m) list.sort((a, b) => (g === 'done' ? (b.doneAt ?? '').localeCompare(a.doneAt ?? '') : (a.due ?? '9').localeCompare(b.due ?? '9')));
    return m;
  }, [data.homework, filter]);
  const open = data.homework.filter((h) => !h.done);
  const r = data.settings.homeworkRemind;
  const usedSubjects = sortedSubjects(data).filter((s) => data.homework.some((h) => !h.done && h.subjectId === s.id));
  const nearest = open.filter((h) => h.due).sort((a, b) => a.due!.localeCompare(b.due!))[0];
  const doneList = groups.get('done') ?? [];

  return (
    <div className="page narrow hw-page">
      <div className="stack gap4">
        <h1 className="display">Домашка</h1>
        <span className="muted">
          <AnimText value={open.length ? `${open.length} ${plural(open.length, 'задание', 'задания', 'заданий')}${nearest ? ' · ближайшее ' + dueLabel(nearest.due) : ''}` : data.homework.length ? 'Всё сделано 🎉' : 'Записывай задания прямо на уроке — это 10 секунд'} />
        </span>
      </div>
      <QuickAdd presetSubject={filter ?? undefined} />
      {usedSubjects.length > 1 && (
        <div className="hw-filter">
          <button className={'hw-fchip' + (filter === null ? ' on' : '')} onClick={() => setFilter(null)}>
            Все
          </button>
          {usedSubjects.map((s) => (
            <button key={s.id} className={'hw-fchip' + (filter === s.id ? ' on' : '')} onClick={() => setFilter(filter === s.id ? null : s.id)}>
              <span className="dot" style={{ background: s.color }} /> {s.name}
            </button>
          ))}
        </div>
      )}
      {ORDER.filter((g) => g !== 'done').map((g) =>
        groups.get(g)?.length ? (
          <section key={g} className={'hw-sec g-' + g}>
            <div className="hw-sec-title">
              {GROUP_LABEL[g]} <span>{groups.get(g)!.length}</span>
            </div>
            <div className="hw-list">
              {groups.get(g)!.map((h, i) => (
                <HwRow key={h.id} h={h} go={go} i={i} />
              ))}
            </div>
          </section>
        ) : null
      )}
      {open.length === 0 && data.homework.length > 0 && !filter && <div className="hw-alldone">Все задания сделаны. Отдыхай — или повтори карточки 🙂</div>}
      {doneList.length > 0 && (
        <section className="hw-sec">
          <button className="hw-sec-title hw-done-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            Сделано <span>{doneList.length}</span>
            <span className={'chev' + (showDone ? ' open' : '')}>›</span>
          </button>
          <Collapse open={showDone}>
            <div className="hw-list">
              {doneList.slice(0, 50).map((h) => (
                <HwRow key={h.id} h={h} />
              ))}
            </div>
          </Collapse>
        </section>
      )}
      <button className="hw-remind-line" onClick={() => go({ name: 'settings', section: 'reminders' })}>
        <Icon name="bell" size={16} />
        <span className="grow">{r.on ? `Напоминаю ${r.when === 'dayBefore' ? 'накануне' : 'в день сдачи'} в ${r.time}` : 'Напоминания выключены'}</span>
        <span className="small">Изменить ›</span>
      </button>
    </div>
  );
}

/** Карточка на «Сегодня»: что сдавать сегодня и завтра, просроченное. */
export function HomeworkToday({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const [adding, setAdding] = useState(false);
  const soon = data.homework.filter((h) => !h.done && ['overdue', 'today', 'tomorrow'].includes(groupOf(h)));
  const later = data.homework.filter((h) => !h.done).length - soon.length;
  return (
    <div className="card hw-today">
      <div className="hw-today-head">
        <h3>Домашка</h3>
        <button className="icon-btn small" title="Записать задание" aria-label="Записать задание" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} />
        </button>
        <span className="grow" />
        <button className="link-btn small" onClick={() => go({ name: 'homework' })}>
          Вся домашка ›
        </button>
      </div>
      {soon.length === 0 ? (
        <span className="small muted">На сегодня и завтра ничего{later ? ` · дальше ${later} ${plural(later, 'задание', 'задания', 'заданий')}` : ''}.</span>
      ) : (
        <div className="hw-list flat">
          {soon
            .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
            .map((h, i) => (
              <HwRow key={h.id} h={h} go={go} i={i} />
            ))}
        </div>
      )}
      {adding && (
        <Modal title="Новое задание" onClose={() => setAdding(false)} width={560}>
          <HomeworkForm onDone={() => setAdding(false)} />
        </Modal>
      )}
    </div>
  );
}
