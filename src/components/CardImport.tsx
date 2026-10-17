// «Импорт карточек» (1.32, N1): Quizlet, таблица CSV/TSV, Brainscape, Knowt, RemNote, Mochi, Anki и готовые колоды.
// Шаги: откуда → вставить текст или выбрать файл → как разбить на карточки (разделители, столбцы) → куда добавить.
// Ничего не добавляется, пока не нажата кнопка «Добавить N карточек».
import { useEffect, useMemo, useRef, useState } from 'react';
import { guessRoles, guessTable, IMPORT_LIMITS, parseMochiFile, parseRemNote, rowsToDecks, SOURCES, splitTable, type ColRole, type ColSep, type ImportResult, type ImportSource, type RowSep, type TableOptions } from '../cardImport';
import { importTopics, useData } from '../store';
import { Icon, Modal, plural, Segmented, Switch, SUBJECT_COLORS, toast } from './ui';
import { Markdown } from './Markdown';

type Pick = ImportSource | 'anki' | 'decks';
type CardKind = 'basic' | 'reverse' | 'typing';

const ROLE_LABEL: Record<ColRole, string> = { front: 'Вопрос', back: 'Ответ', why: 'Пояснение', deck: 'Тема', skip: 'Не брать' };
const SOURCE_NAME: Record<ImportSource, string> = { quizlet: 'Quizlet', table: 'Таблица', brainscape: 'Brainscape', knowt: 'Knowt', remnote: 'RemNote', mochi: 'Mochi' };

/** file — уже выбранный файл (перетащили в окно): сразу читается как источник start. */
export function CardImport({ onClose, onOpenTopic, onAnki, onDecks, start, file }: { onClose: () => void; onOpenTopic: (id: string) => void; onAnki: () => void; onDecks: () => void; start?: ImportSource; file?: File }) {
  const data = useData();
  const [source, setSource] = useState<ImportSource | null>(start ?? null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [opts, setOpts] = useState<TableOptions>({ col: 'tab', row: 'newline', header: false });
  const [roles, setRoles] = useState<ColRole[] | null>(null);
  const [kind, setKind] = useState<CardKind>('basic');
  const [mochi, setMochi] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [subject, setSubject] = useState('__new');
  const [newSubject, setNewSubject] = useState('');
  const [topicName, setTopicName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const info = SOURCES.find((s) => s.id === source);
  const table = source !== null && source !== 'remnote' && source !== 'mochi';

  /** Новый текст: угадать разделители и столбцы заново. */
  function takeText(t: string, name = '') {
    setError('');
    if (t.length > IMPORT_LIMITS.text) {
      setError('Текст слишком большой (больше 8 МБ). Раздели набор на части.');
      return;
    }
    setText(t);
    setFileName(name);
    if (table) {
      const g = guessTable(t);
      setOpts(g);
      setRoles(guessRoles(splitTable(t, g).rows, g.header));
    }
  }

  async function readFile(f: File) {
    setError('');
    try {
      if (f.size > IMPORT_LIMITS.text * 4) throw new Error('Файл слишком большой.');
      if (source === 'mochi') {
        const r = await parseMochiFile(f.name, new Uint8Array(await f.arrayBuffer()));
        if (!r.decks.length) throw new Error('В файле не нашлось карточек.');
        setMochi(r);
        setFileName(f.name);
        return;
      }
      takeText(await f.text(), f.name);
    } catch (e) {
      setError('Не получилось прочитать файл: ' + ((e as Error).message || 'неизвестная ошибка') + ' Попробуй скопировать текст и вставить его.');
    }
  }

  useEffect(() => {
    if (file) void readFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deckName = topicName.trim() || (fileName ? fileName.replace(/\.[^.]+$/, '') : `Карточки из ${source ? SOURCE_NAME[source] : 'импорта'}`);
  const tableRows = useMemo(() => (table && text ? splitTable(text, opts) : null), [table, text, opts]);
  const result: ImportResult | null = useMemo(() => {
    if (!source) return null;
    if (source === 'mochi') return mochi;
    if (!text.trim()) return null;
    if (source === 'remnote') return parseRemNote(text, deckName);
    const r = tableRows!;
    const rl = roles ?? guessRoles(r.rows, opts.header);
    const d = rowsToDecks(r.rows, rl, { header: opts.header, type: kind, deck: deckName });
    return { format: SOURCE_NAME[source], ...d, cut: r.cut };
  }, [source, mochi, text, tableRows, roles, opts.header, kind, deckName]);
  const count = result?.decks.reduce((n, d) => n + d.cards.length, 0) ?? 0;
  const sample = result?.decks.flatMap((d) => d.cards).slice(0, 4) ?? [];

  function run() {
    if (!result || !count) return;
    const many = result.decks.length > 1;
    const name = newSubject.trim() || (source ? SOURCE_NAME[source] : 'Импорт');
    const r = importTopics(
      result.decks.map((d, i) => ({
        subjectName: name,
        subjectColor: SUBJECT_COLORS[(data.subjects.length + i) % SUBJECT_COLORS.length],
        topic: { name: (many || source === 'mochi' ? d.name : deckName).slice(0, 300), note: '', source: source ?? undefined },
        cards: d.cards
      })),
      subject === '__new' ? undefined : subject
    );
    toast(`Готово: ${r.cards} ${plural(r.cards, 'карточка', 'карточки', 'карточек')}`);
    if (r.firstTopicId) onOpenTopic(r.firstTopicId);
    onClose();
  }

  const pickSource = (p: Pick) => {
    if (p === 'anki') return onAnki();
    if (p === 'decks') return onDecks();
    setSource(p);
    setText('');
    setMochi(null);
    setRoles(null);
    setError('');
    setFileName('');
  };

  if (!source)
    return (
      <Modal title="Импорт карточек" onClose={onClose} width={620}>
        <div className="stack gap12">
          <p className="small muted">Откуда перенести карточки? Ничего не добавится, пока ты не проверишь, что получилось.</p>
          <div className="imp-sources">
            {[...SOURCES.map((s) => ({ id: s.id as Pick, title: s.title, hint: s.hint })), { id: 'anki' as Pick, title: 'Anki', hint: '.apkg, .colpkg, текст' }, { id: 'decks' as Pick, title: 'Готовые колоды', hint: 'Химия, история, английский…' }].map((s) => (
              <button key={s.id} type="button" className="imp-source" onClick={() => pickSource(s.id)}>
                <strong>{s.title}</strong>
                <span className="small muted">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal title={`Импорт: ${info?.title ?? ''}`} onClose={onClose} width={720} sticky={Boolean(text || mochi)}>
      <div className="stack gap12">
        <button type="button" className="link-btn small self-start" onClick={() => setSource(null)}>
          <Icon name="left" size={14} /> Другой источник
        </button>
        <ol className="imp-how small">
          {info?.how.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>

        {info?.paste && (
          <textarea
            className="input imp-paste"
            rows={5}
            value={text}
            placeholder={source === 'remnote' ? 'Митохондрия >> энергетическая станция клетки' : 'dog\tсобака\ncat\tкошка'}
            aria-label="Текст карточек"
            onChange={(e) => takeText(e.target.value)}
          />
        )}
        <div className="row gap8 wrap">
          <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> {info?.paste ? 'Или выбрать файл' : 'Выбрать файл'}
          </button>
          {fileName && <span className="small muted clamp1">{fileName}</span>}
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={info?.accept}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void readFile(f);
            }}
          />
        </div>
        {error && <div className="hint warn">{error}</div>}

        {table && text.trim() && (
          <div className="stack gap8 imp-opts">
            <div className="imp-opt">
              <span className="small muted">Между вопросом и ответом</span>
              <SepPicker value={opts.col} onChange={(col) => setOpts({ ...opts, col })} options={[['tab', 'Таб'], ['semicolon', '«;»'], ['comma', '«,»'], ['dash', '« - »']]} />
            </div>
            <div className="imp-opt">
              <span className="small muted">Между карточками</span>
              <SepPicker value={opts.row} onChange={(row) => setOpts({ ...opts, row })} options={[['newline', 'Новая строка'], ['semicolon', '«;»']]} />
            </div>
            <div className="row gap12">
              <span className="grow small">Первая строка — названия столбцов</span>
              <Switch label="Первая строка — названия столбцов" checked={opts.header} onChange={(header) => setOpts({ ...opts, header })} />
            </div>
            <div className="imp-opt">
              <span className="small muted">Какие карточки</span>
              <Segmented<CardKind>
                ariaLabel="Какие карточки"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'basic', label: 'Вопрос → ответ' },
                  { value: 'reverse', label: 'В обе стороны' },
                  { value: 'typing', label: 'Вписать ответ' }
                ]}
              />
            </div>
            {tableRows && tableRows.rows.length > 0 && <ColumnTable rows={tableRows.rows} header={opts.header} roles={roles ?? guessRoles(tableRows.rows, opts.header)} onRoles={setRoles} />}
          </div>
        )}

        {result && (
          <div className="stack gap8">
            <div className="row gap8 wrap">
              <strong>
                {count} {plural(count, 'карточка', 'карточки', 'карточек')}
              </strong>
              {result.decks.length > 1 && <span className="small muted">в {result.decks.length} {plural(result.decks.length, 'теме', 'темах', 'темах')}</span>}
              {result.skipped > 0 && <span className="small muted">· пропущено строк без вопроса или ответа: {result.skipped}</span>}
            </div>
            {result.cut && <div className="hint warn">Взяты первые {IMPORT_LIMITS.rows} карточек — остальное раздели на несколько файлов.</div>}
            {count === 0 && <div className="hint warn">Не нашлось ни одной карточки. Проверь разделители выше: вопрос и ответ должны попасть в разные столбцы.</div>}
            {sample.length > 0 && (
              <div className="imp-sample" aria-label="Как будут выглядеть карточки">
                {sample.map((c, i) => (
                  <div key={i} className="imp-card">
                    <Markdown text={c.front} />
                    <span className="imp-arrow" aria-hidden>
                      {c.type === 'reverse' ? '⇄' : '→'}
                    </span>
                    <Markdown text={c.back || '—'} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {count > 0 && (
          <div className="stack gap8 imp-where">
            <label className="imp-opt">
              <span className="small muted">Куда</span>
              <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="__new">Новый предмет</option>
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    В предмет «{s.name}»
                  </option>
                ))}
              </select>
            </label>
            {subject === '__new' && (
              <label className="imp-opt">
                <span className="small muted">Название предмета</span>
                <input className="input" value={newSubject} placeholder={SOURCE_NAME[source]} onChange={(e) => setNewSubject(e.target.value)} />
              </label>
            )}
            {result!.decks.length === 1 && source !== 'mochi' && (
              <label className="imp-opt">
                <span className="small muted">Название темы</span>
                <input className="input" value={topicName} placeholder={deckName} onChange={(e) => setTopicName(e.target.value)} />
              </label>
            )}
          </div>
        )}

        <div className="row end gap8 wrap">
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!count} onClick={run}>
            Добавить {count || ''} {plural(count, 'карточку', 'карточки', 'карточек')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Выбор разделителя: готовые варианты и «свой». */
function SepPicker<T extends ColSep | RowSep>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [string, string][] }) {
  const custom = typeof value === 'object' ? value.custom : null;
  return (
    <div className="row gap6 wrap">
      {options.map(([v, l]) => (
        <button key={v} type="button" className={'chip-btn neutral' + (value === v ? ' on' : '')} aria-pressed={value === v} onClick={() => onChange(v as T)}>
          {l}
        </button>
      ))}
      <input
        className={'input tiny imp-custom' + (custom !== null ? ' on' : '')}
        aria-label="Свой разделитель"
        placeholder="свой"
        maxLength={8}
        value={custom ?? ''}
        onChange={(e) => onChange((e.target.value ? { custom: e.target.value } : options[0][0]) as T)}
      />
    </div>
  );
}

/** Первые строки таблицы и выбор, что взять из каждого столбца. */
function ColumnTable({ rows, header, roles, onRoles }: { rows: string[][]; header: boolean; roles: ColRole[]; onRoles: (r: ColRole[]) => void }) {
  const show = rows.slice(0, header ? 5 : 4);
  const n = roles.length;
  return (
    <div className="imp-table scroll-x" data-hscroll>
      <table>
        <thead>
          <tr>
            {roles.map((r, i) => (
              <th key={i}>
                <select className="input tiny" aria-label={`Столбец ${i + 1}`} value={r} onChange={(e) => onRoles(roles.map((x, j) => (j === i ? (e.target.value as ColRole) : x)))}>
                  {(Object.keys(ROLE_LABEL) as ColRole[]).map((k) => (
                    <option key={k} value={k}>
                      {ROLE_LABEL[k]}
                    </option>
                  ))}
                </select>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {show.map((row, i) => (
            <tr key={i} className={header && i === 0 ? 'imp-head-row' : undefined}>
              {Array.from({ length: n }, (_, j) => (
                <td key={j}>{(row[j] ?? '').slice(0, 80)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
