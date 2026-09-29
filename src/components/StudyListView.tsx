// Словарь / список в теме: таблица «что спрашиваем — ответ — пример». Каждая строка сама становится карточкой.
import { useEffect, useMemo, useRef, useState } from 'react';
import { canSpeak, speak, SPEAK_LANGS } from '../speak';
import { itemKey, itemOrds, normalizeAnswer, todayCounts } from '../srs';
import { addListRow, addListRows, deleteCardsUndoable, deleteList, getData, LIST_PRESETS, restoreRemoved, updateCard, updateList, useData } from '../store';
import { orderTabs, reorderTab } from '../tabs';
import type { AppData, Card, ListMode, Route, StudyList } from '../types';
import { Markdown } from './Markdown';
import { AnimText, Icon, Modal, motionOn, plural, Segmented, toast, touchUI } from './ui';

const MODE_LABEL: Record<ListMode, string> = { basic: 'Показать ответ', reverse: 'В обе стороны', typing: 'Вписать ответ' };

export type RowStatus = 'new' | 'learning' | 'known' | 'plain';
export function rowStatus(data: AppData, c: Card): RowStatus {
  const ords = itemOrds(c);
  if (!ords.length) return 'plain';
  const st = ords.map((o) => data.states[itemKey(c.id, o)]);
  if (st.some((s) => !s)) return st.every((s) => !s) ? 'new' : 'learning';
  return st.every((s) => s!.state === 2 && s!.stability >= 10) ? 'known' : 'learning';
}
const STATUS_LABEL: Record<RowStatus, string> = { new: 'новое', learning: 'учу', known: 'выучено', plain: 'без ответа — не учится, пока не допишешь' };
const DEFAULT_W: [number, number, number] = [1, 1.2, 1];

/** Разбор вставленного текста: «слово — перевод — пример», по строке на запись. */
export function parseListText(text: string): { a: string; b: string; c?: string }[] {
  const out: { a: string; b: string; c?: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:\d+[.)]|[-•*])\s+/, '').trim();
    if (!line) continue;
    let parts: string[] | null = null;
    for (const sep of ['\t', ' — ', ' – ', ' - ', ' = ', ' | ', ';', ': ']) {
      if (line.includes(sep)) {
        parts = line.split(sep).map((x) => x.trim());
        break;
      }
    }
    if (!parts || parts.length < 2 || !parts[0] || !parts[1]) continue;
    out.push({ a: parts[0], b: parts[1], c: parts.slice(2).join(' — ') || undefined });
  }
  return out;
}

export function StudyListView({ topicId, list, go, subjectId }: { topicId: string; list: StudyList; go: (r: Route) => void; subjectId?: string }) {
  const data = useData();
  const rows = useMemo(() => data.cards.filter((c) => c.topicId === topicId && c.listId === list.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [data.cards, topicId, list.id]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusNew, setFocusNew] = useState(0);
  const q = normalizeAnswer(query);
  const shown = q ? rows.filter((c) => normalizeAnswer(`${c.front} ${c.back} ${c.why ?? ''}`).includes(q)) : rows;
  const ids = rows.map((r) => r.id);
  const counts = useMemo(() => (ids.length ? todayCounts(data, new Date(), { cardIds: ids }) : { learning: 0, review: 0, newCount: 0 }), [data, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const due = counts.learning + counts.review + counts.newCount;
  const known = rows.filter((c) => rowStatus(data, c) === 'known').length;
  const speakable = Boolean(list.lang) && canSpeak();
  const isFormula = list.kind === 'formulas';
  const tableRef = useRef<HTMLDivElement>(null);
  const [dragW, setDragW] = useState<[number, number, number] | null>(null);
  const w = dragW ?? list.widths ?? DEFAULT_W;
  const plainRows = rows.filter((c) => rowStatus(data, c) === 'plain').length;

  return (
    <div className="stack gap12 tab-pane list-view">
      <div className="row gap8 wrap list-head">
        <button className="btn primary" disabled={!due} onClick={() => go({ name: 'review', cardIds: ids })}>
          <Icon name="play" size={16} /> <AnimText value={due ? `Учить · ${due}` : rows.length ? 'Всё повторено' : 'Учить'} />
        </button>
        {rows.length > 0 && (
          <button className="btn" onClick={() => go({ name: 'review', cardIds: ids, cram: true })} title="Пройти все строки без изменения расписания">
            <Icon name="repeat" size={16} /> Повторить все
          </button>
        )}
        <button className="btn" onClick={() => setPasteOpen(true)}>
          <Icon name="plus" size={16} /> Вставить списком
        </button>
        <span className="grow" />
        {subjectId && (
          <button className="link-btn small subj-terms-link" onClick={() => go({ name: 'subject', id: subjectId, view: 'terms', filter: topicId })} title="Общие термины и термины всех тем предмета">
            Все термины предмета →
          </button>
        )}
        {rows.length > 12 && <input className="input search" placeholder="Поиск" aria-label="Поиск по списку" value={query} onChange={(e) => setQuery(e.target.value)} />}
        <button className="icon-btn bordered" aria-label="Настройки списка" title="Настройки списка" onClick={() => setSettingsOpen(true)}>
          <Icon name="sliders" size={18} />
        </button>
      </div>
      {rows.length > 0 && (
        <div className="small muted">
          {rows.length} {plural(rows.length, 'строка', 'строки', 'строк')} · выучено {known} · учу: {MODE_LABEL[list.mode].toLowerCase()}
          {plainRows > 0 && ` · без ответа: ${plainRows} (не учатся)`}
        </div>
      )}

      <div ref={tableRef} className={'list-table' + (speakable ? ' with-speak' : '') + (dragW ? ' resizing' : '')} role="table" aria-label={list.title} style={{ ['--lt-cols' as string]: `minmax(0, ${w[0]}fr) minmax(0, ${w[1]}fr) minmax(0, ${w[2]}fr) 34px` }}>
        <div className="list-tr list-th" role="row">
          <span role="columnheader">{list.cols[0]}</span>
          <span role="columnheader">{list.cols[1]}</span>
          <span role="columnheader">{list.cols[2]}</span>
          <span />
          {[0, 1].map((k) => (
            <span
              key={k}
              className="col-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label={`Ширина столбцов «${list.cols[k]}» и «${list.cols[k + 1]}»`}
              title="Потяни, чтобы изменить ширину. Двойной щелчок — как было"
              style={(() => {
                const f = w.slice(0, k + 1).reduce((a, b) => a + b, 0) / (w[0] + w[1] + w[2]);
                return { left: `calc(${f * 100}% - ${f * 34}px)` };
              })()}
              onDoubleClick={() => updateList(topicId, list.id, { widths: undefined })}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as Element).setPointerCapture(e.pointerId);
                const box = tableRef.current!.getBoundingClientRect();
                const total = box.width - 34;
                const start = e.clientX;
                const base = [...w] as [number, number, number];
                const sum = base[0] + base[1] + base[2];
                let cur = base;
                const moveH = (ev: PointerEvent) => {
                  const dx = ((ev.clientX - start) / total) * sum;
                  const min = sum * 0.12;
                  let a = base[k] + dx;
                  let b = base[k + 1] - dx;
                  if (a < min) (b -= min - a), (a = min);
                  if (b < min) (a -= min - b), (b = min);
                  cur = base.map((x, i) => (i === k ? a : i === k + 1 ? b : x)) as [number, number, number];
                  setDragW(cur);
                };
                const upH = () => {
                  window.removeEventListener('pointermove', moveH);
                  window.removeEventListener('pointerup', upH);
                  setDragW(null);
                  updateList(topicId, list.id, { widths: cur.map((x) => Math.round(x * 100) / 100) as [number, number, number] });
                };
                window.addEventListener('pointermove', moveH);
                window.addEventListener('pointerup', upH);
              }}
            />
          ))}
        </div>
        {shown.map((c) => (
          <ListRow key={c.id} card={c} list={list} status={rowStatus(data, c)} speakable={speakable} isFormula={isFormula} />
        ))}
        {!q && <NewRow key={focusNew} list={list} topicId={topicId} autoFocus={focusNew > 0 || rows.length === 0} onAdded={() => setFocusNew((n) => n + 1)} />}
      </div>
      {rows.length === 0 && <p className="small muted">{LIST_PRESETS[list.kind].hint} {touchUI() ? 'Можно записать просто термин без определения.' : 'Enter — следующая клетка, Shift+Enter — новая строка в клетке. Можно записать просто термин без определения. Ширину столбцов меняй, потянув за границу в заголовке.'}</p>}

      {settingsOpen && <ListSettings topicId={topicId} list={list} rows={rows.length} onClose={() => setSettingsOpen(false)} onDeleted={() => go({ name: 'topic', id: topicId, tab: 'note' })} />}
      {pasteOpen && <PasteRows topicId={topicId} list={list} onClose={() => setPasteOpen(false)} />}
    </div>
  );
}

export function ListRow({ card, list, status, speakable, isFormula }: { card: Card; list: StudyList; status: RowStatus; speakable: boolean; isFormula: boolean }) {
  const [a, setA] = useState(card.front);
  const [b, setB] = useState(card.back);
  const [c, setC] = useState(card.why ?? '');
  const [editB, setEditB] = useState(false);
  useEffect(() => setA(card.front), [card.front]);
  useEffect(() => setB(card.back), [card.back]);
  useEffect(() => setC(card.why ?? ''), [card.why]);
  const save = () => {
    const patch: Partial<Card> = {};
    if (a.trim() && a.trim() !== card.front) patch.front = a.trim();
    if (b.trim() !== card.back) patch.back = b.trim();
    if ((c.trim() || undefined) !== (card.why || undefined)) patch.why = c.trim() || undefined;
    if (Object.keys(patch).length) updateCard(card.id, patch);
  };
  const nextOnEnter = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    save();
    const cells = [...document.querySelectorAll<HTMLElement>('.list-table .cell:is(input, textarea)')];
    const i = cells.indexOf(e.currentTarget);
    cells[i + 1]?.focus();
  };
  const [removing, setRemoving] = useState(false);
  const remove = () => {
    setRemoving(true);
    setTimeout(
      () => {
        const removed = deleteCardsUndoable([card.id]);
        toast('Строка удалена', { label: 'Вернуть', run: () => restoreRemoved(removed) });
      },
      motionOn('hover') ? 170 : 0
    );
  };
  return (
    <div className={'list-tr ' + status + (removing ? ' removing' : '')} role="row">
      <span className="cell-wrap a" role="cell">
        <i className={'st-dot ' + status} title={STATUS_LABEL[status]} />
        <textarea rows={1} className="cell cell-a" aria-label={list.cols[0]} value={a} onChange={(e) => setA(e.target.value)} onBlur={save} onKeyDown={nextOnEnter} />
        {speakable && (
          <button type="button" className="icon-btn tiny speak-btn" tabIndex={-1} aria-label="Послушать" title="Послушать" onClick={() => speak(a, list.lang!)}>
            <Icon name="speaker" size={16} />
          </button>
        )}
      </span>
      <span className="cell-wrap" role="cell">
        {isFormula && !editB && /\$/.test(b) ? (
          <button type="button" className="cell cell-math" onClick={() => setEditB(true)} title="Изменить формулу">
            <Markdown text={b} />
          </button>
        ) : (
          <textarea
            rows={1}
            className="cell"
            aria-label={list.cols[1]}
            placeholder={status === 'plain' ? 'допиши — и строка начнёт учиться' : undefined}
            value={b}
            autoFocus={editB}
            onChange={(e) => setB(e.target.value)}
            onBlur={() => {
              save();
              setEditB(false);
            }}
            onKeyDown={nextOnEnter}
          />
        )}
      </span>
      <span className="cell-wrap c" role="cell">
        <textarea rows={1} className="cell muted-cell" aria-label={list.cols[2]} placeholder="—" value={c} onChange={(e) => setC(e.target.value)} onBlur={save} onKeyDown={nextOnEnter} />
      </span>
      <span role="cell" className="row-x">
        <button type="button" className="icon-btn tiny" tabIndex={-1} aria-label="Удалить строку" title="Удалить строку" onClick={remove}>
          <Icon name="x" size={15} />
        </button>
      </span>
    </div>
  );
}

export function NewRow({ list, topicId, autoFocus, onAdded }: { list: StudyList; topicId: string; autoFocus: boolean; onAdded: () => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [c, setC] = useState('');
  const bRef = useRef<HTMLTextAreaElement>(null);
  const cRef = useRef<HTMLTextAreaElement>(null);
  // Можно добавить и «просто термин» — без определения и примера (такая строка не учится).
  const commit = () => {
    if (!a.trim()) return false;
    let back = b.trim();
    if (list.kind === 'formulas' && back && !/\$/.test(back) && /[\\^_=]/.test(back)) back = `$${back}$`;
    addListRow(topicId, list, { a: a.trim(), b: back, c: c.trim() || undefined });
    onAdded();
    return true;
  };
  const enter = (e: React.KeyboardEvent<HTMLTextAreaElement>, next: () => void) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    next();
  };
  return (
    <div className="list-tr new-row" role="row">
      <span className="cell-wrap a" role="cell">
        <i className="st-dot add">+</i>
        <textarea
          rows={1}
          className="cell cell-a"
          autoFocus={autoFocus}
          aria-label={`Новая строка: ${list.cols[0]}`}
          placeholder={list.cols[0]}
          value={a}
          onChange={(e) => setA(e.target.value)}
          onKeyDown={(e) => enter(e, () => a.trim() && (b.trim() ? commit() : bRef.current?.focus()))}
        />
      </span>
      <span className="cell-wrap" role="cell">
        <textarea rows={1} ref={bRef} className="cell" aria-label={`Новая строка: ${list.cols[1]}`} placeholder={list.cols[1]} value={b} onChange={(e) => setB(e.target.value)} onKeyDown={(e) => enter(e, () => (b.trim() ? commit() : cRef.current?.focus()))} />
      </span>
      <span className="cell-wrap c" role="cell">
        <textarea rows={1} ref={cRef} className="cell muted-cell" aria-label={`Новая строка: ${list.cols[2]}`} placeholder={`${list.cols[2]} (не обязательно)`} value={c} onChange={(e) => setC(e.target.value)} onKeyDown={(e) => enter(e, () => commit())} />
      </span>
      <span role="cell" className="row-x">
        <button type="button" className="icon-btn tiny" aria-label="Добавить строку" title={b.trim() ? 'Добавить (Enter)' : 'Добавить просто термин — без ответа он не учится'} disabled={!a.trim()} onClick={commit}>
          <Icon name="plus" size={15} />
        </button>
      </span>
    </div>
  );
}

function ListSettings({ topicId, list, rows, onClose, onDeleted }: { topicId: string; list: StudyList; rows: number; onClose: () => void; onDeleted: () => void }) {
  const [title, setTitle] = useState(list.title);
  const [cols, setCols] = useState<[string, string, string]>([...list.cols]);
  const [mode, setMode] = useState<ListMode>(list.mode);
  const [lang, setLang] = useState(list.lang ?? '');
  const [armed, setArmed] = useState(false);
  const shiftTab = (dir: -1 | 1) => {
    const t = getData().topics.find((x) => x.id === topicId);
    if (!t) return;
    const all = orderTabs(['note', 'cards', ...(t.lists ?? []).map((l) => 'list:' + l.id), ...(t.poems ?? []).map((p) => 'poem:' + p.id)].map((value) => ({ value })), t.tabOrder).map((x) => x.value);
    const i = all.indexOf('list:' + list.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return;
    reorderTab(topicId, all, all[i], all[j]);
  };
  return (
    <Modal title="Настройки списка" onClose={onClose}>
      <form
        className="stack gap12"
        onSubmit={(e) => {
          e.preventDefault();
          updateList(topicId, list.id, { title: title.trim() || list.title, cols: cols.map((c, i) => c.trim() || list.cols[i]) as [string, string, string], mode, lang: lang || undefined });
          onClose();
        }}
      >
        <label className="field">
          <span>Название</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="field">
          <span>Столбцы</span>
          <div className="row gap6 wrap">
            {cols.map((c, i) => (
              <input key={i} className="input grow" aria-label={`Столбец ${i + 1}`} value={c} onChange={(e) => setCols(cols.map((x, j) => (j === i ? e.target.value : x)) as [string, string, string])} />
            ))}
          </div>
        </div>
        <div className="field">
          <span>Как учить</span>
          <Segmented
            ariaLabel="Как учить"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'basic', label: MODE_LABEL.basic },
              { value: 'reverse', label: MODE_LABEL.reverse },
              { value: 'typing', label: MODE_LABEL.typing }
            ]}
          />
          <small className="muted">
            {mode === 'basic' && `Показывается «${cols[0]}», вспоминаешь «${cols[1]}».`}
            {mode === 'reverse' && `Две карточки на строку: «${cols[0]}» → «${cols[1]}» и обратно.`}
            {mode === 'typing' && `Видишь «${cols[0]}» и вписываешь «${cols[1]}». Несколько верных ответов — через «|».`}
          </small>
        </div>
        <div className="field">
          <span>Место вкладки</span>
          <div className="row gap8">
            <button type="button" className="btn small" onClick={() => shiftTab(-1)}>
              ← Левее
            </button>
            <button type="button" className="btn small" onClick={() => shiftTab(1)}>
              Правее →
            </button>
            <span className="small muted">На компьютере вкладки можно просто перетаскивать</span>
          </div>
        </div>
        {canSpeak() && (
          <label className="field">
            <span>Озвучка столбца «{cols[0]}»</span>
            <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
              {SPEAK_LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="row between">
          <button
            type="button"
            className="btn ghost danger-text"
            onClick={() => {
              if (!armed && rows > 0) return setArmed(true);
              deleteList(topicId, list.id);
              onClose();
              onDeleted();
            }}
          >
            {armed ? `Точно? Удалятся ${rows} ${plural(rows, 'строка', 'строки', 'строк')}` : 'Удалить список'}
          </button>
          <button className="btn primary" type="submit">
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PasteRows({ topicId, list, onClose }: { topicId: string; list: StudyList; onClose: () => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseListText(text), [text]);
  const example = list.kind === 'vocab' ? 'apple — яблоко — I eat an apple.\ncat — кошка' : list.kind === 'dates' ? '1861 — Отмена крепостного права\n1812 — Отечественная война' : list.kind === 'formulas' ? 'Закон Ома — $I = U/R$\nСила тяжести — $F = mg$' : `${list.cols[0]} — ${list.cols[1]}`;
  return (
    <Modal title="Вставить списком" onClose={onClose} width={620}>
      <div className="stack gap12">
        <p className="muted small">По строке на запись. Раздели столбцы тире, двоеточием, «;» или табуляцией (так копируется из таблицы).</p>
        <textarea className="recall-input paste-area" autoFocus placeholder={example} value={text} onChange={(e) => setText(e.target.value)} />
        {parsed.length > 0 && (
          <div className="paste-preview">
            {parsed.slice(0, 6).map((r, i) => (
              <div key={i} className="row gap8 small">
                <strong>{r.a}</strong>
                <span className="muted">→</span>
                <span>{r.b}</span>
                {r.c && <span className="muted">· {r.c}</span>}
              </div>
            ))}
            {parsed.length > 6 && <div className="small muted">и ещё {parsed.length - 6}…</div>}
          </div>
        )}
        <div className="row end gap8">
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn primary"
            disabled={!parsed.length}
            onClick={() => {
              const n = addListRows(topicId, list, list.kind === 'formulas' ? parsed.map((r) => ({ ...r, b: !/\$/.test(r.b) && /[\\^_=/]/.test(r.b) ? `$${r.b}$` : r.b })) : parsed);
              toast(`Добавлено ${n} ${plural(n, 'строка', 'строки', 'строк')}`);
              onClose();
            }}
          >
            Добавить {parsed.length || ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}
