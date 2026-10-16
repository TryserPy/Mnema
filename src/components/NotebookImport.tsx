// «Создать → Из тетради»: Фото (почерк читает ИИ, проверка «фото ↔ текст», неуверенные слова правятся нажатием)
// и Файл (.docx, PDF, Markdown/Notion → разделы → темы, домашка, черновики карточек).
import '../notebook.css';
import { useEffect, useRef, useState } from 'react';
import { aiAvailable, askAi } from '../ai';
import { docSections, docxToMarkdown, fileKindOf, homeworkOf, homeworkText, markdownDoc, matchTopic, parseSplitAnswer, sectionNote, sectionsByStarts, SPLIT_SYSTEM, splitOutline, type FileDoc, type FileSection } from '../fileImport';
import { acceptUnsure, asInNotebook, cardDrafts, fixUnsure, hasAbbreviations, notebookRequest, parseNotebookAnswer, tidyRequest, unsureCount, unsurePieces, type CardDraft } from '../notebook';
import { pdfImageBlob, photoPages, type PagePhoto } from '../notebookPhoto';
import { promptSystem } from '../prompts';
import { logLine } from '../refrain';
import { addCard, addHomework, addTopic, getData, sortedSubjects, updateTopic, useData } from '../store';
import type { Route } from '../types';
import { Markdown } from './Markdown';
import { Modal, Segmented, Switch, toast } from './ui';

type Mode = 'photo' | 'file';
interface Page {
  photo: PagePhoto;
  md: string;
  empty?: boolean;
  error?: string;
}
interface Row {
  s: FileSection;
  take: boolean;
  match?: string;
  append: boolean;
  hw?: { due?: string };
  toHw: boolean;
}

const FILE_ACCEPT = '.docx,.pdf,.md,.markdown,.txt,.zip';

/** onInsert — окно открыто из конспекта («Вставить → Фото тетради»): прочитанное вставляется туда, где курсор. */
export function NotebookImport({ at, go, onClose, onInsert }: { at: { subjectId?: string; topicId?: string }; go: (r: Route) => void; onClose: () => void; onInsert?: (md: string) => void }) {
  const data = useData();
  const subjects = sortedSubjects(data);
  const [mode, setMode] = useState<Mode>('photo');
  const [subjectId, setSubjectId] = useState(at.subjectId ?? subjects[0]?.id ?? '');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  // Фото
  const [pages, setPages] = useState<Page[]>([]);
  const [split, setSplit] = useState<'auto' | 'yes' | 'no'>('auto');
  const [whiten, setWhiten] = useState(true);
  const [topicId, setTopicId] = useState(at.topicId && data.topics.find((t) => t.id === at.topicId)?.subjectId === subjectId ? at.topicId : '');
  const [topicName, setTopicName] = useState('');
  const [how, setHow] = useState<'verbatim' | 'tidy'>('verbatim');
  const [drafts, setDrafts] = useState<(CardDraft & { on: boolean })[] | null>(null);
  const [tidyFailed, setTidyFailed] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (err) errRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [err]);
  // Файл
  const [doc, setDoc] = useState<FileDoc | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileCards, setFileCards] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const subject = subjects.find((s) => s.id === subjectId);
  const topics = data.topics.filter((t) => t.subjectId === subjectId && !t.kind);
  const canAi = aiAvailable(data);
  const homework = data.settings.features.homework;

  if (!subjects.length)
    return (
      <Modal title="Из тетради" onClose={onClose}>
        <p className="small">Сначала создай предмет — темы из тетради лягут в него.</p>
      </Modal>
    );

  // ---------- Фото ----------

  const topicLabel = () => (topicId ? data.topics.find((t) => t.id === topicId)?.name : topicName.trim());

  /** Одна страница → текст. Ошибка остаётся у страницы (её можно прочитать ещё раз), а не ломает остальные. */
  async function readOne(photo: PagePhoto): Promise<Page> {
    const topic = topicLabel();
    const req = notebookRequest({ mime: 'image/jpeg', data: photo.data }, { subject: subject?.name, topic });
    try {
      const raw = await askAi('textbook', { ...req, system: promptSystem('notebook.read', { vars: { subject: subject?.name, topic } }) });
      const p = parseNotebookAnswer(raw);
      return { photo, md: p.markdown, empty: p.empty };
    } catch (e) {
      logLine(`Тетрадь: страница не прочитана — ${(e as Error).message}`);
      return { photo, md: '', error: (e as Error).message };
    }
  }

  async function readPhotos(files: Blob[]) {
    setErr('');
    setDrafts(null);
    const out: Page[] = [];
    try {
      setBusy('Готовлю фото…');
      const photos: PagePhoto[] = [];
      for (const f of files) photos.push(...(await photoPages(f, { split, whiten })));
      for (let i = 0; i < photos.length; i++) {
        setBusy(`Читаю страницу ${i + 1} из ${photos.length}…`);
        out.push(await readOne(photos[i]));
        setPages([...out]);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function retryPage(i: number) {
    const p = pages[i];
    if (!p) return;
    setBusy(`Читаю страницу ${i + 1} ещё раз…`);
    const next = await readOne(p.photo);
    setPages((ps) => ps.map((x, k) => (k === i ? next : x)));
    setBusy('');
  }

  const setPage = (i: number, md: string) => setPages((ps) => ps.map((p, k) => (k === i ? { ...p, md } : p)));
  const allMd = () => pages.map((p) => acceptUnsure(p.md).trim()).filter(Boolean).join('\n\n');

  async function finishPhotos(asIs = false) {
    let md = allMd();
    if (!md) return setErr('На фото не нашлось записей.');
    setErr('');
    setTidyFailed(false);
    if (how === 'tidy' && !asIs) {
      setBusy('Свожу в конспект…');
      try {
        const topic = topicLabel();
        md = parseNotebookAnswer(await askAi('textbook', { ...tidyRequest(md, { subject: subject?.name, topic }), system: promptSystem('textbook.merge', { vars: { subject: subject?.name, topic } }) })).markdown || md;
      } catch (e) {
        setBusy('');
        logLine(`Тетрадь: не свёл в конспект — ${(e as Error).message}`);
        setTidyFailed(true);
        return setErr(`Не получилось свести в конспект: ${(e as Error).message}`);
      }
      setBusy('');
    }
    const chosen = (drafts ?? []).filter((d) => d.on);
    if (onInsert && at.topicId) {
      onInsert(md);
      for (const d of chosen) addCard({ topicId: at.topicId, type: d.type, front: d.front, back: d.back });
      toast(chosen.length ? `Текст вставлен, карточек: ${chosen.length}` : 'Текст из тетради вставлен в конспект');
      return onClose();
    }
    let id: string;
    try {
      id = saveNote(md);
    } catch (e) {
      logLine(`Тетрадь: не сохранил — ${(e as Error).message}`);
      return setErr(`Не получилось сохранить: ${(e as Error).message}`);
    }
    for (const d of chosen) addCard({ topicId: id, type: d.type, front: d.front, back: d.back });
    const skipped = pages.filter((p) => p.error).length;
    toast([chosen.length ? `Конспект сохранён, карточек: ${chosen.length}` : 'Конспект сохранён', skipped ? `непрочитанных страниц: ${skipped}` : ''].filter(Boolean).join(' · '));
    onClose();
    go({ name: 'topic', id, tab: 'note' });
  }

  /** В выбранную тему (дописать в конец) или в новую. */
  function saveNote(md: string): string {
    if (topicId) {
      const t = getData().topics.find((x) => x.id === topicId)!;
      updateTopic(topicId, { note: t.note.trim() ? `${t.note.trimEnd()}\n\n${md}` : md });
      return topicId;
    }
    const t = addTopic(subjectId, topicName.trim() || 'Из тетради');
    updateTopic(t.id, { note: md });
    return t.id;
  }

  // ---------- Файл ----------

  async function openFile(f: File) {
    setErr('');
    setDoc(null);
    const kind = fileKindOf(f.name);
    if (!kind) return setErr('Подойдут .docx, PDF, Markdown или архив Notion (.zip). Фото — во вкладке «Фото».');
    setBusy('Читаю файл…');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const name = f.name.replace(/\.[^.]+$/, '') || 'Файл';
      let d: FileDoc;
      if (kind === 'docx') {
        const r = docxToMarkdown(bytes);
        d = { name, kind, markdown: r.markdown, stats: r.stats, warnings: r.warnings };
      } else if (kind === 'pdf') {
        const { pdfToMarkdown } = await import('../fileImportPdf');
        const r = pdfToMarkdown(bytes);
        if (!r.markdown.trim() && r.scans.length) {
          // Скан без текста — это фото страниц.
          setMode('photo');
          setBusy('');
          await readPhotos(await Promise.all(r.scans.map(pdfImageBlob)));
          return;
        }
        d = { name, kind, markdown: r.markdown, stats: r.stats, warnings: r.warnings };
      } else d = await markdownDoc(f.name, bytes);
      if (!d.markdown.trim()) throw new Error('В файле нет текста.');
      setDoc(d);
      setRows(toRows(docSections(d)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  function toRows(ss: FileSection[]): Row[] {
    return ss.map((s) => {
      const hw = homework ? homeworkOf(s.title, s.body) : null;
      const match = matchTopic(s.title, topics);
      return { s, take: true, match, append: Boolean(match), ...(hw ? { hw } : {}), toHw: Boolean(hw) };
    });
  }

  async function splitWithAi() {
    if (!doc) return;
    setBusy('ИИ раскладывает по темам…');
    setErr('');
    try {
      const outline = splitOutline(doc.markdown);
      const starts = parseSplitAnswer(await askAi('other', { system: SPLIT_SYSTEM, text: outline, maxTokens: 800, refrain: { task: 'file.split', text: outline } }));
      if (!starts.length) throw new Error('ИИ не нашёл границ тем. Попробуй «По заголовкам».');
      setRows(toRows(sectionsByStarts(doc.markdown, starts, doc.name)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const setTitle = (i: number, title: string) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, s: { ...r.s, title } } : r)));

  function saveFile() {
    let made = 0;
    let hws = 0;
    let cards = 0;
    let first: string | undefined;
    for (const r of rows) {
      if (!r.take || !r.s.title.trim()) continue;
      if (r.hw && r.toHw) {
        addHomework({ subjectId, text: homeworkText(r.s.title, r.s.body), ...(r.hw.due ? { due: r.hw.due } : {}) });
        hws++;
        continue;
      }
      const note = sectionNote(r.s);
      let id: string;
      if (r.match && r.append) {
        const t = getData().topics.find((x) => x.id === r.match)!;
        updateTopic(t.id, { note: t.note.trim() ? `${t.note.trimEnd()}\n\n${note}` : note });
        id = t.id;
      } else {
        id = addTopic(subjectId, r.s.title.trim()).id;
        updateTopic(id, { note });
      }
      made++;
      first ??= id;
      if (fileCards) for (const d of cardDrafts(r.s.body)) (addCard({ topicId: id, type: d.type, front: d.front, back: d.back }), cards++);
    }
    if (!made && !hws) return setErr('Не выбрано ни одного раздела.');
    toast([made && `Тем: ${made}`, hws && `в домашку: ${hws}`, cards && `карточек: ${cards}`].filter(Boolean).join(', '));
    onClose();
    if (first) go({ name: 'topic', id: first, tab: 'note' });
  }

  // ---------- Вид ----------

  const ready = pages.length > 0 && !busy;
  const unsure = pages.reduce((n, p) => n + unsureCount(p.md), 0);

  return (
    <Modal title={onInsert ? 'Фото тетради в конспект' : 'Из тетради'} onClose={onClose} width={820} sticky>
      <div className="stack gap12 nb" data-part="notebook">
        {!onInsert && (
          <Segmented
            ariaLabel="Откуда"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setErr('');
            }}
            options={[
              { value: 'photo', label: 'Фото' },
              { value: 'file', label: 'Файл' }
            ]}
          />
        )}
        {onInsert && <span className="small muted">Сфотографируй страницу тетради — ИИ перепишет почерк, а ты проверишь текст рядом с фото. Текст встанет туда, где был курсор.</span>}
        {!onInsert && (
          <label className="row gap8">
            <span className="small muted nowrap">Предмет</span>
            <select className="input grow" value={subjectId} onChange={(e) => (setSubjectId(e.target.value), setTopicId(''), setRows([]), setDoc(null))}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === 'photo' && (
          <>
            {!onInsert && (
              <div className="row gap8 wrap">
                <select className="input grow" value={topicId} onChange={(e) => setTopicId(e.target.value)} aria-label="Тема">
                  <option value="">Новая тема</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      Дописать в «{t.name}»
                    </option>
                  ))}
                </select>
                {!topicId && <input className="input grow" value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="Название темы" aria-label="Название темы" />}
              </div>
            )}
            {!pages.length && (
              <>
                <div className="row gap8 wrap nb-opts">
                  <span className="small muted">Разворот</span>
                  <Segmented
                    ariaLabel="Разворот"
                    value={split}
                    onChange={setSplit}
                    options={[
                      { value: 'auto', label: 'Сам' },
                      { value: 'yes', label: 'Делить' },
                      { value: 'no', label: 'Одна страница' }
                    ]}
                  />
                </div>
                <div className="row gap8">
                  <span className="grow small">Убрать клетку и поля — останутся только записи</span>
                  <Switch label="Убрать клетку" checked={whiten} onChange={setWhiten} />
                </div>
                {!canAi && <div className="hint warn">Почерк читает ИИ: включи ИИ-помощника в настройках (Refrain ИИ или свой ключ).</div>}
                <div className="row gap8 wrap">
                  <button className="btn primary" disabled={!canAi || Boolean(busy)} onClick={() => cameraInput.current?.click()}>
                    Снять
                  </button>
                  <button className="btn" disabled={!canAi || Boolean(busy)} onClick={() => photoInput.current?.click()}>
                    Выбрать фото
                  </button>
                </div>
                <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.length && void readPhotos([...e.target.files])} />
                <input ref={photoInput} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => e.target.files?.length && void readPhotos([...e.target.files])} data-testid="nb-photos" />
              </>
            )}
            {pages.map((p, i) => (
              <PageCheck key={i} n={i + 1} page={p} onChange={(md) => setPage(i, md)} onRetry={busy ? undefined : () => void retryPage(i)} />
            ))}
            {ready && (
              <div className="stack gap8 nb-finish">
                <div className="row gap8 wrap">
                  {unsure > 0 && (
                    <button className="btn small" onClick={() => setPages((ps) => ps.map((p) => ({ ...p, md: acceptUnsure(p.md) })))}>
                      Всё верно ({unsure})
                    </button>
                  )}
                  {pages.some((p) => hasAbbreviations(p.md)) && (
                    <button className="btn small" onClick={() => setPages((ps) => ps.map((p) => ({ ...p, md: asInNotebook(p.md) })))}>
                      Как в тетради
                    </button>
                  )}
                  <button className="btn small ghost" onClick={() => (setPages([]), setDrafts(null))}>
                    Другие фото
                  </button>
                </div>
                {!onInsert && (
                  <Segmented
                    ariaLabel="Как сохранить"
                    value={how}
                    onChange={setHow}
                    options={[
                      { value: 'verbatim', label: 'Дословно' },
                      { value: 'tidy', label: 'Конспектом' }
                    ]}
                  />
                )}
                {drafts === null ? (
                  <button className="btn small ghost" onClick={() => setDrafts(cardDrafts(allMd()).map((d) => ({ ...d, on: true })))}>
                    Черновики карточек
                  </button>
                ) : drafts.length ? (
                  <div className="stack gap4 nb-drafts">
                    <span className="small muted">Черновики — отметь, какие оставить, и поправь потом своими словами.</span>
                    {drafts.map((d, k) => (
                      <label key={k} className="row gap8 nb-draft">
                        <input type="checkbox" checked={d.on} onChange={(e) => setDrafts(drafts.map((x, j) => (j === k ? { ...x, on: e.target.checked } : x)))} />
                        <span className="grow small">
                          <strong>{d.front}</strong> — {d.back}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <span className="small muted">Определений и дат для карточек не нашлось.</span>
                )}
                {!pages.some((p) => p.md.trim()) && <span className="small muted">Сохранять пока нечего: ни одна страница не прочитана. Нажми «Прочитать ещё раз» у страницы или выбери другие фото.</span>}
                {pages.some((p) => p.error) && pages.some((p) => p.md.trim()) && <span className="small muted">Непрочитанные страницы не попадут в конспект — их можно прочитать ещё раз.</span>}
                <div className="row gap8 end wrap">
                  {tidyFailed && (
                    <button className="btn" onClick={() => void finishPhotos(true)}>
                      Сохранить дословно
                    </button>
                  )}
                  <button className="btn primary" onClick={() => void finishPhotos()} disabled={!pages.some((p) => p.md.trim())}>
                    {onInsert ? 'Вставить в конспект' : 'Сохранить конспект'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {mode === 'file' && (
          <>
            {!doc && (
              <>
                <span className="small muted">Конспект, который уже набран: Word (.docx), PDF, Markdown или экспорт Notion (.zip). PDF-скан без текста прочитаю как фото.</span>
                <div>
                  <button className="btn primary" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>
                    Выбрать файл
                  </button>
                </div>
                <input ref={fileInput} hidden type="file" accept={FILE_ACCEPT} onChange={(e) => e.target.files?.[0] && void openFile(e.target.files[0])} data-testid="nb-file" />
              </>
            )}
            {doc && (
              <>
                <div className="row gap8 wrap">
                  <span className="grow small">
                    <strong>{doc.name}</strong> · разделов: {rows.length}
                    {doc.stats.tables ? ` · таблиц: ${doc.stats.tables}` : ''}
                    {doc.stats.images ? ` · картинок: ${doc.stats.images}` : ''}
                  </span>
                  <button className="btn small" disabled={Boolean(busy)} onClick={() => setRows(toRows(docSections(doc)))}>
                    По заголовкам
                  </button>
                  {canAi && (
                    <button className="btn small" disabled={Boolean(busy)} onClick={() => void splitWithAi()}>
                      Разбить по темам с ИИ
                    </button>
                  )}
                </div>
                {doc.warnings.length > 0 && <div className="hint small">{doc.warnings.join(' · ')}</div>}
                <div className="stack gap8 nb-rows">
                  {rows.map((r, i) => (
                    <div key={r.s.id} className={'nb-row' + (r.take ? '' : ' off')}>
                      <div className="row gap8">
                        <input type="checkbox" checked={r.take} onChange={(e) => setRow(i, { take: e.target.checked })} aria-label={r.take ? 'Пропустить' : 'Взять'} />
                        <input className="input grow" value={r.s.title} onChange={(e) => setTitle(i, e.target.value)} aria-label="Название темы" />
                      </div>
                      {r.take && (
                        <div className="row gap8 wrap nb-row-opts">
                          <span className="small muted">{r.s.body.length} знаков</span>
                          {r.hw && (
                            <Segmented
                              ariaLabel="Похоже на ДЗ"
                              value={r.toHw ? 'hw' : 'note'}
                              onChange={(v) => setRow(i, { toHw: v === 'hw' })}
                              options={[
                                { value: 'hw', label: r.hw.due ? `В домашку · ${r.hw.due.slice(5).split('-').reverse().join('.')}` : 'В домашку' },
                                { value: 'note', label: 'В конспект' }
                              ]}
                            />
                          )}
                          {r.match && !(r.hw && r.toHw) && (
                            <Segmented
                              ariaLabel="Такая тема есть"
                              value={r.append ? 'append' : 'new'}
                              onChange={(v) => setRow(i, { append: v === 'append' })}
                              options={[
                                { value: 'append', label: `Дописать в «${topics.find((t) => t.id === r.match)?.name ?? ''}»` },
                                { value: 'new', label: 'Отдельно' }
                              ]}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="row gap8">
                  <span className="grow small">Черновики карточек — определения и даты, до 12 на тему</span>
                  <Switch label="Черновики карточек" checked={fileCards} onChange={setFileCards} />
                </div>
                <div className="row gap8 end">
                  <button className="btn ghost" onClick={() => (setDoc(null), setRows([]))}>
                    Другой файл
                  </button>
                  <button className="btn primary" disabled={Boolean(busy) || !rows.some((r) => r.take)} onClick={saveFile}>
                    Добавить
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {busy && (
          <div className="hint" role="status">
            {busy}
          </div>
        )}
        {err && (
          <div className="hint warn" role="alert" ref={errRef}>
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Страница: фото рядом с текстом (как в конспекте: заголовки, формулы, выноски); неуверенное слово подсвечено —
 *  нажал → под текстом поле, поправил или «Так и есть». */
function PageCheck({ n, page, onChange, onRetry }: { n: number; page: Page; onChange: (md: string) => void; onRetry?: () => void }) {
  const [edit, setEdit] = useState(false);
  const [fix, setFix] = useState<{ i: number; word: string; was: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Подсветку рисует Markdown (span[data-unsure]); здесь она становится кнопкой. Номер — порядок меток в тексте.
  useEffect(() => {
    box.current?.querySelectorAll<HTMLElement>('[data-unsure]').forEach((el, i) => {
      el.classList.add('nb-unsure');
      el.classList.toggle('on', fix?.i === i);
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.title = 'ИИ не уверен — нажми, чтобы поправить';
    });
  });
  const pick = (t: EventTarget | null) => {
    const el = (t as HTMLElement | null)?.closest?.('[data-unsure]');
    if (!el || !box.current) return false;
    const i = [...box.current.querySelectorAll('[data-unsure]')].indexOf(el);
    const word = unsurePieces(page.md).find((p) => 'unsure' in p && p.i === i);
    if (word && 'unsure' in word) setFix({ i, word: word.unsure, was: word.unsure });
    return true;
  };
  const apply = (word: string) => {
    if (fix) onChange(fixUnsure(page.md, fix.i, word));
    setFix(null);
  };
  return (
    <div className="nb-page" data-page={n}>
      <img className="nb-photo" src={page.photo.url} alt={`Страница ${n}`} />
      <div className="stack gap8 nb-text">
        <div className="row gap8">
          <strong className="grow small">Страница {n}</strong>
          {!page.error && !page.empty && (
            <button className="btn small ghost" onClick={() => (setEdit(!edit), setFix(null))}>
              {edit ? 'Готово' : 'Править текст'}
            </button>
          )}
        </div>
        {page.error ? (
          <div className="hint warn small stack gap6">
            <span>Эту страницу ИИ не прочитал: {page.error}</span>
            {onRetry && (
              <div>
                <button type="button" className="btn small" onClick={onRetry}>
                  Прочитать ещё раз
                </button>
              </div>
            )}
          </div>
        ) : page.empty ? (
          <span className="small muted">На этой странице записей нет.</span>
        ) : edit ? (
          <textarea className="input mono" rows={10} value={page.md} onChange={(e) => onChange(e.target.value)} aria-label={`Текст страницы ${n}`} />
        ) : (
          <>
            {unsureCount(page.md) > 0 && !fix && <span className="small muted">Жёлтым — слова, в которых ИИ не уверен. Нажми, чтобы поправить.</span>}
            <div
              ref={box}
              className="nb-read"
              onClick={(e) => pick(e.target)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && pick(e.target)) e.preventDefault();
              }}
            >
              <Markdown text={page.md} />
            </div>
            {fix && (
              <div className="row gap8 wrap nb-fixbar">
                <input
                  className="input nb-fix grow"
                  autoFocus
                  value={fix.word}
                  onChange={(e) => setFix({ ...fix, word: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.preventDefault(), apply(fix.word));
                    if (e.key === 'Escape') setFix(null);
                  }}
                  aria-label="Правильное слово"
                />
                <button type="button" className="btn small primary" onClick={() => apply(fix.word)}>
                  Поправить
                </button>
                <button type="button" className="btn small" onClick={() => apply(fix.was)}>
                  Так и есть
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
