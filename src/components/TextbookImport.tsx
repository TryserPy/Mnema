// «Добавить из учебника»: фото страниц → проверка → конспект с метками страниц, рисунками и «Важным».
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { aiAvailable } from '../ai';
import { findImportant, IMPORTANT_TYPES } from '../important';
import { updateSettings, useData } from '../store';
import { assemble, recognizeOffline, recognizeWithAi, recropFigure, type Box, type PageInput, type PageResult } from '../textbook';
import type { PagePhoto } from '../types';
import { CameraCapture } from './CameraCapture';
import { Markdown } from './Markdown';
import { Icon, Modal, plural, Segmented, AnimText } from './ui';

type Step = 'pages' | 'reading' | 'review';
let uidN = 0;
const uid = () => 'p' + ++uidN + Date.now().toString(36);

export function TextbookImport({
  initialFiles,
  hasNote,
  onClose,
  onDone
}: {
  initialFiles?: File[];
  hasNote: boolean;
  onClose: () => void;
  onDone: (markdown: string, photos: PagePhoto[], mode: 'append' | 'replace') => void;
}) {
  const data = useData();
  const ts = data.settings.textbook;
  const ai = aiAvailable(data);
  const offlineOk = Boolean(window.mnemaApi?.ocrRecognize);
  const [pages, setPages] = useState<PageInput[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>('pages');
  const [mode, setMode] = useState<'ai' | 'offline'>(ts.mode === 'offline' || !ai ? 'offline' : ts.mode === 'ai' ? 'ai' : ai ? 'ai' : 'offline');
  const [progress, setProgress] = useState({ i: 0, text: '' });
  const [results, setResults] = useState<PageResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const [where, setWhere] = useState<'append' | 'replace'>('append');
  const [keep, setKeep] = useState(ts.keepPhotos);
  const [cropFor, setCropFor] = useState<string | null>(null);
  const [figEdit, setFigEdit] = useState<{ page: number; idx: number } | null>(null);
  const [view, setView] = useState(0);
  const [editText, setEditText] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [camera, setCamera] = useState(false);
  const hasCamera = Boolean(navigator.mediaDevices?.getUserMedia) && window.mnemaApi?.platform === 'android';
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  function addFiles(files: File[]) {
    const imgs = files.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|bmp)$/i.test(f.name));
    if (!imgs.length) return;
    imgs.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
    setPages((cur) => {
      const start = cur.length ? cur[cur.length - 1].n + 1 : guessPage(imgs[0].name) ?? 1;
      const add = imgs.map((f, i) => ({ id: uid(), file: f, name: f.name, n: start + i, rotate: 0 as const }));
      for (const p of add) void makeThumb(p);
      return [...cur, ...add];
    });
  }

  async function makeThumb(p: PageInput) {
    const { renderPage } = await import('../textbook');
    const c = await renderPage(p, 420);
    const uri = c.toDataURL('image/jpeg', 0.75);
    setThumbs((t) => ({ ...t, [p.id]: uri }));
  }

  useEffect(() => {
    if (initialFiles?.length) addFiles(initialFiles);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function patch(id: string, p: Partial<PageInput>) {
    setPages((cur) =>
      cur.map((x) => {
        if (x.id !== id) return x;
        const nx = { ...x, ...p };
        if (p.rotate !== undefined || p.crop !== undefined) void makeThumb(nx);
        return nx;
      })
    );
  }

  function renumber(from: number) {
    setPages((cur) => cur.map((x, i) => ({ ...x, n: from + i })));
  }

  async function run() {
    setStep('reading');
    cancelRef.current = false;
    updateSettings({ textbook: { ...ts, mode: mode === 'ai' ? 'ai' : 'offline' } });
    const out: PageResult[] = [];
    const errs: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      if (cancelRef.current) return;
      const p = pages[i];
      setProgress({ i, text: 'Готовлю фото…' });
      try {
        const onP = (text: string) => setProgress({ i, text });
        const r = mode === 'ai' ? await recognizeWithAi(p, onP) : await recognizeOffline(p, onP);
        out.push(r);
      } catch (e) {
        errs.push(`Стр. ${p.n}: ${(e as Error).message}`);
      }
    }
    if (cancelRef.current) return;
    // Если на фото виден другой номер страницы — предлагаем его (только когда все номера нашлись и идут подряд).
    const detected = out.map((r) => r.detectedPage);
    if (detected.every((d) => d !== undefined) && detected.every((d, i) => i === 0 || d === detected[i - 1]! + 1)) out.forEach((r, i) => (r.n = detected[i]!));
    setResults(out);
    setErrors(errs);
    setView(0);
    setStep('review');
  }

  const markdown = useMemo(() => (editText !== null ? editText : assemble(results, fixes)), [results, fixes, editText]);
  const important = useMemo(() => findImportant(markdown, data.settings.highlight), [markdown, data.settings.highlight]);
  const doubts = results.flatMap((r) => r.doubts.map((d) => ({ ...d, key: `${r.n}:${d.id}`, page: r.n })));
  const figures = results.flatMap((r, pi) => r.figures.map((f, idx) => ({ f, pi, idx })));
  const cur = results[view];

  function finish() {
    const photos: PagePhoto[] = keep ? results.map((r) => ({ n: r.n, img: r.photo })) : [];
    if (keep !== ts.keepPhotos) updateSettings({ textbook: { ...ts, keepPhotos: keep } });
    onDone(markdown, photos, where);
  }

  const busy = step === 'reading';
  return (
    <Modal title="Добавить из учебника" onClose={() => {
        cancelRef.current = true;
        onClose();
      }} width={step === 'review' ? 1180 : 900} sticky={busy || step === 'review'}>
      {step === 'pages' && (
        <div
          className={'stack gap12 tb-drop' + (dragOver ? ' over' : '')}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            addFiles([...e.dataTransfer.files]);
          }}
          onPaste={(e) => addFiles([...e.clipboardData.files])}
        >
          {pages.length === 0 ? (
            <div className="stack gap8">
              <button className="tb-empty" onClick={() => inputRef.current?.click()}>
                <Icon name="book" size={40} />
                <strong>Выбери фото страниц</strong>
                <span className="muted">{window.mnemaApi?.platform === 'android' ? 'из галереи или файлов телефона.' : 'или перетащи их сюда, или вставь Ctrl+V.'} Снимай страницу целиком, ровно и при хорошем свете.</span>
              </button>
              {hasCamera && (
                <button className="btn big" onClick={() => setCamera(true)}>
                  <Icon name="camera" size={20} /> Снять камерой
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="row gap8 wrap">
                <span className="small muted">
                  {pages.length} {plural(pages.length, 'страница', 'страницы', 'страниц')}. Номер первой:
                </span>
                <input className="input tiny num" type="number" min={1} value={pages[0].n} onChange={(e) => renumber(Math.max(1, Number(e.target.value) || 1))} aria-label="Номер первой страницы" />
                <span className="grow" />
                {hasCamera && (
                  <button className="btn small" onClick={() => setCamera(true)}>
                    <Icon name="camera" size={16} /> Снять
                  </button>
                )}
                <button className="btn small" onClick={() => inputRef.current?.click()}>
                  <Icon name="plus" size={16} /> Ещё страницы
                </button>
              </div>
              <div className="tb-pages">
                {pages.map((p, i) => (
                  <div key={p.id} className="tb-page" style={{ animationDelay: i * 50 + 'ms' }}>
                    <div className="tb-thumb">{thumbs[p.id] ? <img src={thumbs[p.id]} alt={`Страница ${p.n}`} /> : <div className="spinner" />}</div>
                    <div className="row gap4 center-row">
                      <span className="small muted">стр.</span>
                      <input className="input tiny num" type="number" value={p.n} onChange={(e) => patch(p.id, { n: Number(e.target.value) || p.n })} aria-label="Номер страницы" />
                    </div>
                    <div className="row gap4 center-row">
                      <button className="icon-btn small" title="Повернуть" aria-label="Повернуть" onClick={() => patch(p.id, { rotate: (((p.rotate + 90) % 360) as PageInput['rotate']) })}>
                        <Icon name="rotate" size={17} />
                      </button>
                      <button className="icon-btn small" title="Обрезать" aria-label="Обрезать" onClick={() => setCropFor(p.id)}>
                        <Icon name="crop" size={17} />
                      </button>
                      <button className="icon-btn small" title="Раньше" aria-label="Переставить раньше" disabled={i === 0} onClick={() => setPages((c) => swap(c, i, i - 1))}>
                        <Icon name="left" size={17} />
                      </button>
                      <button className="icon-btn small" title="Убрать" aria-label="Убрать страницу" onClick={() => setPages((c) => c.filter((x) => x.id !== p.id))}>
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <div className="tb-mode">
            <Segmented
              ariaLabel="Как распознавать"
              value={mode}
              onChange={(v) => setMode(v)}
              options={[
                { value: 'ai', label: 'Точно (ИИ)' },
                { value: 'offline', label: 'Без интернета' }
              ]}
            />
            <span className="small muted">
              {mode === 'ai'
                ? ai
                  ? 'ИИ восстановит заголовки, жирный, таблицы, формулы и вырежет рисунки. Фото уходит только выбранному ИИ.'
                  : 'Для точного режима включи «ИИ-помощник» в «Возможностях».'
                : offlineOk
                  ? 'Читает прямо на устройстве, без интернета. Жирный и рисунки находятся по картинке — примерно; сомнительные слова покажу для проверки.'
                  : 'Работает в приложении для Windows.'}
            </span>
          </div>
          <div className="row end gap8">
            <button className="btn ghost" onClick={onClose}>
              Отмена
            </button>
            <button className="btn primary" disabled={!pages.length || (mode === 'ai' ? !ai : !offlineOk)} onClick={() => void run()}>
              Распознать {pages.length > 1 ? `${pages.length} ${plural(pages.length, 'страницу', 'страницы', 'страниц')}` : ''}
            </button>
          </div>
        </div>
      )}

      {step === 'reading' && (
        <div className="stack gap16 center tb-reading">
          <div className="tb-scan">
            {thumbs[pages[progress.i]?.id] && <img src={thumbs[pages[progress.i].id]} alt="" />}
            <span className="scan-line" />
          </div>
          <strong>
            <AnimText value={`Страница ${progress.i + 1} из ${pages.length}`} />
          </strong>
          <span className="muted">{progress.text}</span>
          <div className="progress wide">
            <span style={{ width: `${((progress.i + 0.5) / pages.length) * 100}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="tb-review">
          <div className="tb-left">
            {results.length > 1 && (
              <div className="row gap4 wrap">
                {results.map((r, i) => (
                  <button key={i} className={'chip-btn neutral' + (i === view ? ' on' : '')} onClick={() => setView(i)}>
                    стр. {r.n}
                  </button>
                ))}
              </div>
            )}
            {cur && (
              <div className="tb-photo">
                <div className="tb-photo-inner">
                <img src={cur.photo} alt={`Страница ${cur.n}`} />
                {cur.figures.map((f, idx) => (
                  <button
                    key={idx}
                    className="tb-figbox"
                    title="Поправить рамку рисунка"
                    style={{ left: f.box.x * 100 + '%', top: f.box.y * 100 + '%', width: f.box.w * 100 + '%', height: f.box.h * 100 + '%' }}
                    onClick={() => setFigEdit({ page: view, idx })}
                  />
                ))}
                </div>
              </div>
            )}
            {errors.length > 0 && <div className="hint warn">{errors.join('. ')}</div>}
          </div>
          <div className="tb-right">
            <div className="row gap8">
              <strong className="grow">Конспект</strong>
              <button className="btn small ghost" onClick={() => setEditText(editText === null ? markdown : null)}>
                {editText === null ? 'Править текст' : 'Как было'}
              </button>
            </div>
            {editText !== null ? <textarea className="tb-edit mono" value={editText} onChange={(e) => setEditText(e.target.value)} /> : <Markdown text={markdown} className="tb-preview note-md" onPage={(n) => setView(Math.max(0, results.findIndex((r) => r.n === n)))} />}
            {doubts.length > 0 && editText === null && (
              <div className="stack gap6">
                <span className="label">Проверь слова ({doubts.length}) — распознавание в них не уверено</span>
                <div className="tb-doubts">
                  {doubts.map((d) => (
                    <label key={d.key} className="tb-doubt">
                      <img src={d.crop} alt="Кусочек страницы" />
                      <input className="input tiny" value={fixes[d.key] ?? d.text} onChange={(e) => setFixes({ ...fixes, [d.key]: e.target.value })} aria-label="Исправить слово" />
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="tb-found">
              <span className="label">Найдено важного: {important.length}</span>
              <div className="row gap6 wrap">
                {IMPORTANT_TYPES.map((t) => {
                  const n = important.filter((x) => x.type === t.id).length;
                  return n ? (
                    <span key={t.id} className="imp-chip" style={{ ['--c' as string]: t.color }}>
                      {t.plural} · {n}
                    </span>
                  ) : null;
                })}
                {figures.length > 0 && <span className="imp-chip" style={{ ['--c' as string]: '#5B6070' }}>Рисунки · {figures.length}</span>}
              </div>
            </div>
            <div className="row gap12 wrap tb-options">
              {hasNote && (
                <Segmented
                  ariaLabel="Куда добавить"
                  value={where}
                  onChange={setWhere}
                  options={[
                    { value: 'append', label: 'В конец конспекта' },
                    { value: 'replace', label: 'Заменить конспект' }
                  ]}
                />
              )}
              <label className="row gap6 small">
                <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Сохранить фото страниц в теме
              </label>
            </div>
            <div className="row end gap8">
              <button className="btn ghost" onClick={() => setStep('pages')}>
                Назад
              </button>
              <button className="btn primary" disabled={!markdown.trim()} onClick={finish}>
                Добавить в конспект
              </button>
            </div>
          </div>
        </div>
      )}

      {camera && <CameraCapture onShot={(f) => addFiles([f])} onClose={() => setCamera(false)} />}
      {cropFor && (
        <CropModal
          load={() => thumbsFull(pages.find((p) => p.id === cropFor)!)}
          box={pages.find((p) => p.id === cropFor)!.crop}
          onClose={() => setCropFor(null)}
          onSave={(box) => {
            patch(cropFor, { crop: box });
            setCropFor(null);
          }}
        />
      )}
      {figEdit && results[figEdit.page] && (
        <CropModal
          title="Рамка рисунка"
          load={() => Promise.resolve(results[figEdit.page].photo)}
          box={results[figEdit.page].figures[figEdit.idx].box}
          onClose={() => setFigEdit(null)}
          onRemove={() => {
            setResults((rs) => rs.map((r, i) => (i !== figEdit.page ? r : { ...r, markdown: r.markdown.replace(`⟦РИС:${figEdit.idx}⟧`, ''), figures: r.figures })));
            setFigEdit(null);
          }}
          onSave={async (box) => {
            const r = results[figEdit.page];
            const uri = await recropFigure(r.photo, box);
            setResults((rs) => rs.map((x, i) => (i !== figEdit.page ? x : { ...x, figures: x.figures.map((f, j) => (j === figEdit.idx ? { ...f, box, uri } : f)) })));
            setFigEdit(null);
          }}
        />
      )}
    </Modal>
  );
}

function swap<T>(a: T[], i: number, j: number): T[] {
  const r = a.slice();
  [r[i], r[j]] = [r[j], r[i]];
  return r;
}

function guessPage(name: string): number | undefined {
  const m = /(?:стр|page|p)[._ -]?(\d{1,4})/i.exec(name);
  return m ? Number(m[1]) : undefined;
}

/** Страница без обрезки (но с поворотом) — для окна обрезки. */
async function thumbsFull(p: PageInput): Promise<string> {
  const { renderPage } = await import('../textbook');
  const c = await renderPage({ ...p, crop: undefined }, 1400);
  return c.toDataURL('image/jpeg', 0.85);
}

/** Окно с рамкой: двигать и тянуть за углы. */
function CropModal({ load, box, title = 'Обрезать страницу', onClose, onSave, onRemove }: { load: () => Promise<string>; box?: Box; title?: string; onClose: () => void; onSave: (b: Box) => void; onRemove?: () => void }) {
  const [uri, setUri] = useState('');
  const [b, setB] = useState<Box>(box ?? { x: 0.03, y: 0.03, w: 0.94, h: 0.94 });
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: string; sx: number; sy: number; b: Box } | null>(null);
  useEffect(() => {
    void load().then(setUri);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function down(kind: string) {
    return (e: RPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      drag.current = { kind, sx: e.clientX, sy: e.clientY, b };
    };
  }
  function move(e: RPointerEvent) {
    const d = drag.current;
    const r = ref.current?.getBoundingClientRect();
    if (!d || !r) return;
    const dx = (e.clientX - d.sx) / r.width;
    const dy = (e.clientY - d.sy) / r.height;
    let { x, y, w, h } = d.b;
    const k = d.kind;
    if (k === 'move') {
      x = Math.min(1 - w, Math.max(0, x + dx));
      y = Math.min(1 - h, Math.max(0, y + dy));
    } else {
      if (k.includes('w')) {
        const nx = Math.min(x + w - 0.05, Math.max(0, x + dx));
        w += x - nx;
        x = nx;
      }
      if (k.includes('e')) w = Math.min(1 - x, Math.max(0.05, w + dx));
      if (k.includes('n')) {
        const ny = Math.min(y + h - 0.05, Math.max(0, y + dy));
        h += y - ny;
        y = ny;
      }
      if (k.includes('s')) h = Math.min(1 - y, Math.max(0.05, h + dy));
    }
    setB({ x, y, w, h });
  }
  return (
    <Modal title={title} onClose={onClose} width={720} sticky>
      <div className="stack gap12">
        <div className="crop-area" ref={ref} onPointerMove={move} onPointerUp={() => (drag.current = null)}>
          {uri ? <img src={uri} alt="" draggable={false} /> : <div className="spinner" />}
          <div className="crop-box" style={{ left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%' }} onPointerDown={down('move')}>
            {['nw', 'ne', 'sw', 'se'].map((k) => (
              <span key={k} className={'crop-h ' + k} onPointerDown={down(k)} />
            ))}
          </div>
        </div>
        <div className="row end gap8">
          {onRemove && (
            <button className="btn ghost danger" onClick={onRemove}>
              Это не рисунок
            </button>
          )}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={() => onSave(b)}>
            Готово
          </button>
        </div>
      </div>
    </Modal>
  );
}
