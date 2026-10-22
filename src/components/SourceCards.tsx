// «Карточки из ссылки, видео или книги» (1.32, N2): статья по ссылке, субтитры YouTube, глава EPUB или свой текст →
// черновики карточек от ИИ → ученик отмечает и правит → карточки в эту тему (или в новую тему с названием источника).
import { useRef, useState } from 'react';
import { aiAvailable } from '../ai';
import { AiProblem, AiWorking, failureOf } from './AiRun';
import type { AiFailure } from '../aiFailure';
import type { AiCardDraft } from '../aiCards';
import type { EpubBook } from '../epub';
import { cardsFromSource, loadUrl, sourceParts, type Source } from '../sourceCards';
import { addCard, importTopics, useData } from '../store';
import { Icon, Modal, plural, Segmented, Skeleton, SUBJECT_COLORS, toast } from './ui';
import { PasteButton } from './PasteButton';

type Tab = 'link' | 'book' | 'text';
type Step = { name: 'input' } | { name: 'loading'; what: string; back: Step } | { name: 'source'; src: Source } | { name: 'drafts'; src: Source; drafts: (AiCardDraft & { on: boolean })[] };

/** Сразу отмечено: 15 новых карточек за раз — посильно; остальные можно добавить потом. */
const PRESET = 15;
const KIND_LABEL: Record<Source['kind'], string> = { article: 'Статья', youtube: 'Видео YouTube', book: 'Книга', text: 'Текст' };

export function SourceCards({ topicId, onClose, onOpenTopic }: { topicId?: string; onClose: () => void; onOpenTopic?: (id: string) => void }) {
  const data = useData();
  const topic = topicId ? data.topics.find((t) => t.id === topicId) : undefined;
  const subject = topic ? data.subjects.find((s) => s.id === topic.subjectId) : undefined;
  const [tab, setTab] = useState<Tab>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [book, setBook] = useState<EpubBook | null>(null);
  const [chapter, setChapter] = useState(0);
  const [part, setPart] = useState(0);
  const [step, setStep] = useState<Step>({ name: 'input' });
  const [error, setError] = useState('');
  // Ошибка ИИ (а не ссылки или файла): причина и повтор — «Повторить», «Настройки ИИ», «Войти».
  const [aiFail, setAiFail] = useState<{ failure: AiFailure; retry: () => void } | null>(null);
  // Номер действия: после «Отменить» ответ уже ушедшего запроса не применяется.
  const runId = useRef(0);
  const [target, setTarget] = useState(data.subjects[0]?.id ?? '__new');
  const fileRef = useRef<HTMLInputElement>(null);
  const canAi = aiAvailable(data);

  async function openLink() {
    setError('');
    setAiFail(null);
    const id = ++runId.current;
    setStep({ name: 'loading', what: /youtu/i.test(url) ? 'Достаю субтитры видео…' : 'Открываю страницу…', back: { name: 'input' } });
    try {
      const src = await loadUrl(url);
      if (id !== runId.current) return;
      setPart(0);
      setStep({ name: 'source', src });
    } catch (e) {
      if (id !== runId.current) return;
      setError((e as Error).message);
      setStep({ name: 'input' });
    }
  }

  async function openBook(f: File) {
    setError('');
    setAiFail(null);
    setStep({ name: 'loading', what: 'Открываю книгу…', back: { name: 'input' } });
    try {
      const { parseEpub } = await import('../epub');
      const b = await parseEpub(new Uint8Array(await f.arrayBuffer()));
      setBook(b);
      setChapter(0);
      setStep({ name: 'input' });
    } catch (e) {
      setError((e as Error).message || 'Не получилось открыть книгу.');
      setStep({ name: 'input' });
    }
  }

  function useChapter() {
    if (!book) return;
    const ch = book.chapters[chapter];
    setPart(0);
    setStep({ name: 'source', src: { kind: 'book', title: `${book.title} — ${ch.title}`, text: ch.text } });
  }

  function useText() {
    setPart(0);
    setStep({ name: 'source', src: { kind: 'text', title: textTitle.trim() || topic?.name || 'Мой текст', text: text.trim() } });
  }

  async function makeCards(src: Source) {
    setError('');
    setAiFail(null);
    const id = ++runId.current;
    setStep({ name: 'loading', what: 'ИИ читает и придумывает вопросы…', back: { name: 'source', src } });
    try {
      const parts = sourceParts(src.text);
      const have = topic ? data.cards.filter((c) => c.topicId === topic.id).map((c) => c.front) : [];
      const list = await cardsFromSource({ title: src.title, text: parts[Math.min(part, parts.length - 1)], subject: subject?.name, have });
      if (id !== runId.current) return;
      setStep({ name: 'drafts', src, drafts: list.map((d, i) => ({ ...d, on: i < PRESET })) });
    } catch (e) {
      if (id !== runId.current) return;
      setError((e as Error).message || 'Не получилось.');
      setAiFail({ failure: failureOf(e), retry: () => void makeCards(src) });
      setStep({ name: 'source', src });
    }
  }

  function add(src: Source, chosen: AiCardDraft[]) {
    if (topic) {
      for (const d of chosen) addCard({ topicId: topic.id, type: 'basic', front: d.front, back: d.back });
      toast(`Готово: ${chosen.length} ${plural(chosen.length, 'новая карточка', 'новые карточки', 'новых карточек')}`);
      return onClose();
    }
    const link = src.url ? `[${src.title.replace(/[[\]]/g, '')}](${src.url})` : src.title;
    const r = importTopics(
      [{ subjectName: target === '__new' ? 'Из источников' : '', subjectColor: SUBJECT_COLORS[data.subjects.length % SUBJECT_COLORS.length], topic: { name: src.title.slice(0, 200), note: `Источник: ${link}\n`, source: src.url ?? src.kind }, cards: chosen.map((d) => ({ type: 'basic' as const, front: d.front, back: d.back })) }],
      target === '__new' ? undefined : target
    );
    toast(`Готово: ${r.cards} ${plural(r.cards, 'карточка', 'карточки', 'карточек')}`);
    if (r.firstTopicId) onOpenTopic?.(r.firstTopicId);
    onClose();
  }

  const busy = step.name === 'loading';
  return (
    <Modal title="Карточки из ссылки, видео или книги" onClose={onClose} width={720} sticky={busy || step.name === 'drafts'}>
      <div className="stack gap12">
        {!canAi && <div className="hint warn">Сначала подключи ИИ: войди в Refrain ИИ или добавь свой ключ (Настройки → ИИ). Без ИИ карточки по тексту не сделать.</div>}
        {error && aiFail && <AiProblem error={error} failure={aiFail.failure} onRetry={aiFail.retry} />}
        {error && !aiFail && (
          <div className="hint warn" role="alert">
            {error}
          </div>
        )}

        {step.name === 'input' && (
          <>
            <Segmented<Tab>
              ariaLabel="Откуда"
              value={tab}
              onChange={(t) => (setTab(t), setError(''), setAiFail(null))}
              options={[
                { value: 'link', label: 'Ссылка' },
                { value: 'book', label: 'Книга EPUB' },
                { value: 'text', label: 'Текст' }
              ]}
            />
            {tab === 'link' && (
              <form
                className="stack gap8"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (url.trim()) void openLink();
                }}
              >
                <input className="input" type="url" inputMode="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… или ссылка на YouTube" aria-label="Ссылка на статью или видео" />
                <p className="small muted">Статья, страница учебника в интернете или видео YouTube с субтитрами. Платные и закрытые страницы не откроются — тогда скопируй текст во вкладку «Текст».</p>
                <div className="row end">
                  <button className="btn primary" disabled={!url.trim() || !canAi}>
                    Открыть
                  </button>
                </div>
              </form>
            )}
            {tab === 'book' && (
              <div className="stack gap8">
                {!book ? (
                  <>
                    <p className="small muted">Выбери книгу .epub без защиты от копирования. Она разбирается здесь, на устройстве; ИИ получит только выбранную главу.</p>
                    <div className="row end">
                      <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={!canAi}>
                        <Icon name="upload" size={16} /> Выбрать книгу
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="row gap8">
                      <strong className="grow clamp1">{book.title}</strong>
                      {book.author && <span className="small muted clamp1">{book.author}</span>}
                    </div>
                    <label className="imp-opt">
                      <span className="small muted">Глава</span>
                      <select className="input" value={chapter} onChange={(e) => setChapter(Number(e.target.value))}>
                        {book.chapters.map((c, i) => (
                          <option key={i} value={i}>
                            {c.title} · {Math.max(1, Math.round(c.text.length / 1800))} стр.
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="row end gap8">
                      <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                        Другая книга
                      </button>
                      <button className="btn primary" onClick={useChapter}>
                        Дальше
                      </button>
                    </div>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept=".epub,application/epub+zip"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void openBook(f);
                  }}
                />
              </div>
            )}
            {tab === 'text' && (
              <div className="stack gap8">
                <input className="input" value={textTitle} onChange={(e) => setTextTitle(e.target.value)} placeholder="О чём текст (необязательно)" aria-label="Название" />
                <PasteButton value={text} onChange={setText} className="btn small self-start" />
                <textarea className="input" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Вставь статью, расшифровку видео или главу" aria-label="Текст" />
                <div className="row end">
                  <button className="btn primary" disabled={text.trim().length < 80 || !canAi} onClick={useText}>
                    Дальше
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {step.name === 'loading' && (
          <AiWorking
            label={step.what}
            via={step.back.name === 'source'}
            onCancel={() => {
              runId.current++;
              setStep(step.back);
            }}
          >
            <Skeleton lines={4} label={step.what} />
          </AiWorking>
        )}

        {step.name === 'source' && <SourceView src={step.src} part={part} setPart={setPart} onBack={() => setStep({ name: 'input' })} onMake={() => void makeCards(step.src)} />}

        {step.name === 'drafts' && (
          <Drafts
            drafts={step.drafts}
            setDrafts={(d) => setStep({ ...step, drafts: d })}
            onAgain={() => void makeCards(step.src)}
            where={
              topic ? null : (
                <label className="imp-opt">
                  <span className="small muted">Куда — новая тема «{step.src.title.slice(0, 60)}»</span>
                  <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                    {data.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        В предмет «{s.name}»
                      </option>
                    ))}
                    <option value="__new">Новый предмет «Из источников»</option>
                  </select>
                </label>
              )
            }
            onAdd={(chosen) => add(step.src, chosen)}
          />
        )}
      </div>
    </Modal>
  );
}

function SourceView({ src, part, setPart, onBack, onMake }: { src: Source; part: number; setPart: (n: number) => void; onBack: () => void; onMake: () => void }) {
  const parts = sourceParts(src.text);
  return (
    <div className="stack gap8">
      <div className="row gap8 wrap">
        <span className="chip neutral">{KIND_LABEL[src.kind]}</span>
        <strong className="grow">{src.title}</strong>
      </div>
      <p className="small muted">
        {Math.max(1, Math.round(src.text.length / 1800))} стр. текста{src.cut ? ' — источник длинный, взято начало' : ''}.
      </p>
      {parts.length > 1 && (
        <label className="imp-opt">
          <span className="small muted">Текст длинный — ИИ читает по частям. Какую часть взять?</span>
          <select className="input" value={part} onChange={(e) => setPart(Number(e.target.value))}>
            {parts.map((p, i) => (
              <option key={i} value={i}>
                Часть {i + 1} из {parts.length}: {p.replace(/^## /, '').slice(0, 50).replace(/\s+/g, ' ')}…
              </option>
            ))}
          </select>
        </label>
      )}
      <blockquote className="src-preview small">{(parts[part] ?? '').slice(0, 600)}…</blockquote>
      <p className="small muted">ИИ получит этот текст (без твоих данных) и предложит карточки. Добавишь только те, что отметишь.</p>
      <div className="row end gap8 wrap">
        <button className="btn ghost" onClick={onBack}>
          Назад
        </button>
        <button className="btn primary" onClick={onMake}>
          <Icon name="sparkle" size={16} /> Сделать карточки
        </button>
      </div>
    </div>
  );
}

function Drafts({ drafts, setDrafts, onAgain, onAdd, where }: { drafts: (AiCardDraft & { on: boolean })[]; setDrafts: (d: (AiCardDraft & { on: boolean })[]) => void; onAgain: () => void; onAdd: (c: AiCardDraft[]) => void; where: React.ReactNode }) {
  const chosen = drafts.filter((d) => d.on && d.front.trim() && d.back.trim()).map((d) => ({ front: d.front.trim(), back: d.back.trim() }));
  const patch = (i: number, p: Partial<AiCardDraft & { on: boolean }>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...p } : d)));
  return (
    <div className="stack gap12">
      <p className="small muted">
        Это черновики: ИИ мог ошибиться. Сверь с источником и поправь своими словами.{drafts.length > PRESET && ` Отмечено ${PRESET} из ${drafts.length} — для начала хватит.`}
      </p>
      <div className="bulk-list">
        {drafts.map((d, i) => (
          <div key={i} className={'bulk-row' + (d.on ? '' : ' off')}>
            <input type="checkbox" checked={d.on} onChange={(e) => patch(i, { on: e.target.checked })} aria-label="Взять карточку" />
            <div className="grow stack gap4">
              <textarea rows={1} value={d.front} onChange={(e) => patch(i, { front: e.target.value })} aria-label="Вопрос" disabled={!d.on} />
              <textarea rows={1} value={d.back} onChange={(e) => patch(i, { back: e.target.value })} aria-label="Ответ" disabled={!d.on} />
            </div>
          </div>
        ))}
      </div>
      {where}
      <div className="row end gap8 wrap">
        <button className="btn" onClick={onAgain}>
          <Icon name="repeat" size={16} /> Ещё варианты
        </button>
        <button className="btn primary" disabled={!chosen.length} onClick={() => onAdd(chosen)}>
          Добавить {chosen.length} {plural(chosen.length, 'карточку', 'карточки', 'карточек')}
        </button>
      </div>
    </div>
  );
}
