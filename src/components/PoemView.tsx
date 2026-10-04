// Стих наизусть: текст по частям, тренажёр «нарастающими частями» с исчезающими подсказками,
// рассказ целиком (голосом или самопроверкой) и «с любого места».
import { useEffect, useMemo, useRef, useState } from 'react';
import { aiAvailable } from '../ai';
import {
  activeLines,
  autoChunk,
  compareRecital,
  cueLine,
  dayKey,
  deadlinePlan,
  effCue,
  enabledSteps,
  focusSet,
  hardLines,
  isPinned,
  knownSet,
  learnedCount,
  learnedLines,
  learnTargets,
  learnUnits,
  nextReview,
  pickStarts,
  poemLearned,
  poemLines,
  poemParts,
  remapPatch,
  setCue,
  setFocus,
  setKnown,
  setSkip,
  skipSet,
  togetherWindow,
  togglePin,
  tokenize,
  type CueLevel,
  type CueToken,
  type LearnStep,
  type Recital
} from '../poem';
import { canSpeak, speak, stopSpeaking, useSpeaking } from '../speak';
import { deletePoem, getData, restorePoem, updatePoem, useData } from '../store';
import type { Poem, Route } from '../types';
import { recitalVoice, startRecital, type RecitalSession } from '../voice';
import { ConfirmButton, Icon, MoreMenu, plural, Segmented, toast, type MenuItem } from './ui';

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const nLines = (n: number) => `${n} ${plural(n, 'строка', 'строки', 'строк')}`;

function save(topicId: string, poemId: string, patch: Partial<Poem>) {
  updatePoem(topicId, poemId, patch);
}
/** Свежий стих из хранилища: экран мог перерисоваться, а замыкание — остаться со старым. */
const fresh = (topicId: string, poem: Poem): Poem => getData().topics.find((t) => t.id === topicId)?.poems?.find((x) => x.id === poem.id) ?? poem;

/** Записать итог проверки: трудные строки, история, и (если стих выучен и рассказан целиком) — следующий повтор. */
function record(topicId: string, poemId: string, r: { acc: number; lines: number[]; bad: number[]; mode: 'learn' | 'whole' | 'random' | 'pick' }) {
  const p = getData().topics.find((t) => t.id === topicId)?.poems?.find((x) => x.id === poemId);
  if (!p) return;
  const miss = [...(p.lineMiss ?? [])];
  for (const i of r.lines) {
    const bad = r.bad.includes(i);
    miss[i] = bad ? (miss[i] ?? 0) + 1 : Math.max(0, (miss[i] ?? 0) - 0.5);
  }
  for (let i = 0; i < miss.length; i++) miss[i] ??= 0;
  const history = [...(p.history ?? []), { at: new Date().toISOString(), acc: Math.round(r.acc * 100) / 100, mode: r.mode }].slice(-40);
  const patch: Partial<Poem> = { lineMiss: miss, history };
  if (r.mode === 'whole' && poemLearned(p)) patch.review = nextReview(p, r.acc, new Date());
  save(topicId, poemId, patch);
}

/* ---------- Главный экран вкладки ---------- */

type Job =
  | { kind: 'learn'; target: number[] }
  | { kind: 'whole'; idx: number[]; pick?: string } // pick — подпись, если это не «весь стих», а выбранное
  | { kind: 'random'; pool: number[]; starts?: number[]; span: number };

const CUE_OPTIONS: { value: 'auto' | '0' | '1' | '2'; label: string }[] = [
  { value: 'auto', label: 'Как обычно' },
  { value: '0', label: 'Открыта' },
  { value: '1', label: 'Половина слов' },
  { value: '2', label: 'Первые буквы' }
];
const CUE_TAG: Record<number, string> = { 0: 'открыта', 1: '½ слов', 2: 'буквы' };

export function PoemView({ topicId, poem, start, go }: { topicId: string; poem: Poem; start?: 'whole'; go: (r: Route) => void }) {
  const lines = useMemo(() => poemLines(poem.text), [poem.text]);
  const parts = useMemo(() => poemParts(poem.text, poem.chunk), [poem.text, poem.chunk]);
  const known = knownSet(poem);
  const skip = skipSet(poem);
  const focus = focusSet(poem);
  const hard = hardLines(poem);
  const active = activeLines(poem);
  const done = learnedLines(poem);
  const targets = learnTargets(poem);
  const all = poemLearned(poem);
  const today = dayKey(new Date());
  const plan = deadlinePlan(poem, new Date());

  const [job, setJob] = useState<Job | 'edit' | null>(start === 'whole' && done.length ? { kind: 'whole', idx: done } : poem.text.trim() ? null : 'edit');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const speaking = useSpeaking(poem.text);
  useEffect(() => setSel(new Set()), [poem.text]);
  useEffect(() => () => stopSpeaking(), []);

  if (job === 'edit')
    return (
      <PoemEditor
        topicId={topicId}
        poem={poem}
        onDone={() => setJob(null)}
        onDeleted={() => {
          const removed = deletePoem(topicId, poem.id);
          go({ name: 'topic', id: topicId, tab: 'note' });
          if (removed) toast('Стих удалён', { label: 'Вернуть', run: () => restorePoem(topicId, removed) });
        }}
      />
    );
  if (job?.kind === 'learn') return <LearnFlow topicId={topicId} poem={poem} target={job.target} onExit={() => setJob(null)} />;
  if (job?.kind === 'whole') return <WholeCheck topicId={topicId} poem={poem} idx={job.idx} pick={job.pick} onExit={() => setJob(null)} />;
  if (job?.kind === 'random') return <RandomFlow topicId={topicId} poem={poem} pool={job.pool} starts={job.starts} span={job.span} onExit={() => setJob(null)} />;

  const patch = (p: Partial<Poem>) => save(topicId, poem.id, p);
  const selArr = [...sel].sort((a, b) => a - b);
  const selActive = selArr.filter((i) => !skip.has(i));
  const toggleLine = (i: number, range: boolean) => {
    setSel((cur) => {
      const next = new Set(cur);
      if (range && anchor !== null) for (let k = Math.min(anchor, i); k <= Math.max(anchor, i); k++) next.add(k);
      else next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
    setAnchor(i);
  };
  const togglePart = (from: number, to: number) => {
    const idx = Array.from({ length: to - from }, (_, i) => from + i);
    setSel((cur) => {
      const next = new Set(cur);
      const every = idx.every((i) => next.has(i));
      idx.forEach((i) => (every ? next.delete(i) : next.add(i)));
      return next;
    });
  };
  const learnFrom = () => {
    const from = selActive[0] ?? selArr[0];
    const t = learnTargets(poem, from);
    if (!t.length) return toast('С этого места всё уже выучено');
    setJob({ kind: 'learn', target: t });
  };
  const continueFrom = () => {
    const s0 = selActive[0];
    if (s0 === undefined || active.indexOf(s0) >= active.length - 1) return toast('Выбери строку, после которой есть ещё строки');
    setJob({ kind: 'random', pool: active, starts: [s0], span: 4 });
  };
  const cueNow = (() => {
    const v = new Set(selArr.map((i) => String(poem.lineCue?.[i] ?? 'auto')));
    return v.size === 1 ? ([...v][0] as 'auto' | '0' | '1' | '2') : null;
  })();
  const allIn = (set: Set<number>) => selArr.length > 0 && selArr.every((i) => set.has(i));

  const partState = (pt: { from: number; to: number }) => {
    const idx = Array.from({ length: pt.to - pt.from }, (_, i) => pt.from + i).filter((i) => !skip.has(i));
    return idx.length === 0 ? 'skip' : idx.every((i) => known.has(i)) ? 'learned' : 'todo';
  };
  const nextPart = parts.findIndex((pt) => partState(pt) === 'todo');

  const cueItem = (o: (typeof CUE_OPTIONS)[number]): MenuItem => ({ label: (cueNow === o.value ? '✓ ' : '') + o.label, onClick: () => patch(setCue(poem, selArr, o.value === 'auto' ? null : (Number(o.value) as 0 | 1 | 2))) });
  const selMenu: MenuItem[] = [
    { label: 'Начать с этой строки', icon: 'play', hint: 'и до конца стиха', onClick: learnFrom },
    { label: 'Рассказать выбранное', icon: 'mic', hidden: !selActive.length, onClick: () => setJob({ kind: 'whole', idx: selActive, pick: 'Выбранное' }) },
    { label: 'Продолжить с этой строки', icon: 'repeat', hidden: !selActive.length, hint: 'Мнема покажет строку, ты продолжишь', onClick: continueFrom },
    { label: 'Подсказка для строк', icon: 'bulb', items: CUE_OPTIONS.map(cueItem) },
    { label: allIn(focus) ? 'Не повторять чаще' : 'Повторять чаще', icon: 'star', onClick: () => patch(setFocus(poem, selArr, !allIn(focus))) },
    { label: allIn(skip) ? 'Вернуть в учёбу' : 'Не учу эти строки', icon: 'x', hint: allIn(skip) ? undefined : 'останутся в тексте', onClick: () => patch(setSkip(poem, selArr, !allIn(skip))) }
  ];
  const topMenu: MenuItem[] = [
    { label: 'С любого места', icon: 'repeat', hidden: done.length < 2, onClick: () => setJob({ kind: 'random', pool: done, span: 2 }) },
    { label: 'Повторить отмеченное', icon: 'star', hidden: focus.size === 0, onClick: () => setJob({ kind: 'whole', idx: [...focus].filter((i) => !skip.has(i)).sort((a, b) => a - b), pick: 'Отмеченное ★' }) },
    { label: speaking ? 'Остановить' : 'Послушать', icon: 'speaker', hidden: !canSpeak(), onClick: () => (speaking ? stopSpeaking() : speak(poem.text, 'ru-RU')) },
    { label: 'Слова, которые не прячутся', icon: 'pen', onClick: () => setPinMode(true) },
    { label: 'Настройки стиха', icon: 'sliders', hint: 'текст, части, шаги, срок', onClick: () => setJob('edit') }
  ];

  return (
    <div className="stack gap12 tab-pane poem-view">
      <div className="row gap8 wrap">
        {!all ? (
          <button className="btn primary" disabled={!targets.length} onClick={() => setJob({ kind: 'learn', target: targets })}>
            <Icon name="play" size={16} /> {done.length === 0 ? 'Начать учить' : 'Учить дальше'}
          </button>
        ) : (
          <button className="btn primary" onClick={() => setJob({ kind: 'whole', idx: done })}>
            <Icon name="mic" size={16} /> Рассказать наизусть
          </button>
        )}
        {!all && done.length > 0 && (
          <button className="btn" onClick={() => setJob({ kind: 'whole', idx: done })} title="Рассказать то, что уже выучено">
            <Icon name="mic" size={16} /> Рассказать
          </button>
        )}
        <span className="grow" />
        <MoreMenu items={topMenu} title="Ещё" />
      </div>

      <div className="small muted poem-status">
        {all ? 'Выучен целиком' : `Выучено ${done.length} из ${nLines(active.length)}`}
        {poem.review && all && (poem.review.due <= today ? ' · пора повторить' : ` · повторить ${fmtDay(poem.review.due)}`)}
      </div>
      {plan && !all && (
        <div className="small poem-plan">
          {plan.days < 0
            ? `Срок (${fmtDay(poem.deadline!)}) прошёл — осталось ${nLines(plan.left)}.`
            : plan.days === 0
              ? `Срок — сегодня: осталось ${nLines(plan.left)}.`
              : `К ${fmtDay(poem.deadline!)}: осталось ${nLines(plan.left)}, примерно по ${plan.perDay} в день.`}
        </div>
      )}

      {pinMode ? (
        <div className="poem-bar">
          <span className="small">Нажимай на слова, которые должны быть всегда видны, когда рассказываешь по памяти.</span>
          <span className="row gap8">
            {(poem.pinWords?.length ?? 0) > 0 && (
              <button className="btn small ghost" onClick={() => patch({ pinWords: undefined })}>
                Сбросить
              </button>
            )}
            <button className="btn small primary" onClick={() => setPinMode(false)}>
              Готово
            </button>
          </span>
        </div>
      ) : (
        selArr.length > 0 && (
          <div className="poem-bar" role="toolbar" aria-label="Что сделать с выбранными строками">
            <strong className="small">Выбрано: {selArr.length}</strong>
            <span className="row gap8 wrap">
              <button className="btn small primary" disabled={!selActive.length} onClick={() => setJob({ kind: 'learn', target: selActive })}>
                Учить
              </button>
              <button className={'btn small' + (allIn(known) ? ' on' : '')} onClick={() => patch(setKnown(poem, selArr, !allIn(known)))} title="Тренажёр такие строки пропустит">
                {allIn(known) ? 'Ещё учу' : 'Уже знаю'}
              </button>
              <MoreMenu items={selMenu} title="Ещё с выбранными строками" />
              <button className="icon-btn bordered" aria-label="Снять выбор" title="Снять выбор" onClick={() => (setSel(new Set()), setAnchor(null))}>
                <Icon name="x" size={16} />
              </button>
            </span>
          </div>
        )
      )}

      <div className="poem-card">
        {(poem.title || poem.author) && (
          <div className="poem-head">
            {poem.title && <strong>{poem.title}</strong>}
            {poem.author && <span className="muted">{poem.author}</span>}
          </div>
        )}
        {parts.map((pt, k) => {
          const st = partState(pt);
          return (
            <div key={k} className={'poem-part' + (st === 'learned' ? ' learned' : k === nextPart ? ' next' : '') + (st === 'skip' ? ' skipped' : '')}>
              <button type="button" className="poem-part-mark" title="Выбрать всю часть" aria-label={`Выбрать часть ${k + 1}`} onClick={() => togglePart(pt.from, pt.to)} disabled={pinMode}>
                {st === 'learned' ? <Icon name="check" size={14} /> : k + 1}
              </button>
              <div className="poem-part-lines">
                {lines.slice(pt.from, pt.to).map((l, i) => {
                  const li = pt.from + i;
                  const cls = (known.has(li) && !skip.has(li) ? ' known' : '') + (skip.has(li) ? ' skip' : '') + (hard.has(li) ? ' hard' : '');
                  const words = tokenize(l.text);
                  let wk = 0;
                  const badges = (
                    <span className="pl-badges">
                      {poem.lineCue?.[li] !== undefined && <span className="pl-tag">{CUE_TAG[poem.lineCue[li]]}</span>}
                      {focus.has(li) && <span className="pl-star" title="Повторять чаще"><Icon name="star" size={13} /></span>}
                      {known.has(li) && !skip.has(li) && <span className="pl-ok" title="Выучено"><Icon name="check" size={13} /></span>}
                    </span>
                  );
                  if (pinMode)
                    return (
                      <div key={li} className={'poem-line pickrow' + cls}>
                        <span className="pl-text">
                          {words.map((t, w) => {
                            if (!t.word) return <span key={w}>{t.text}</span>;
                            const idx = wk++;
                            const on = isPinned(poem, li, idx);
                            return (
                              <button key={w} type="button" className={'pw-pick' + (on ? ' on' : '')} aria-pressed={on} onClick={() => patch(togglePin(poem, li, idx))}>
                                {t.text}
                              </button>
                            );
                          })}
                        </span>
                      </div>
                    );
                  return (
                    <button key={li} type="button" className={'poem-line pick' + cls + (sel.has(li) ? ' sel' : '')} aria-pressed={sel.has(li)} title={hard.has(li) ? 'Здесь чаще всего ошибаешься' : undefined} onClick={(e) => toggleLine(li, e.shiftKey)}>
                      <span className="pl-text">
                        {words.map((t, w) => (t.word ? <span key={w} className={isPinned(poem, li, wk++) ? 'pw-pin' : undefined}>{t.text}</span> : <span key={w}>{t.text}</span>))}
                      </span>
                      {badges}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {!pinMode && selArr.length === 0 && <p className="small muted poem-how">Нажми на строку (или на номер части) — выберешь, что с ней делать: учить, отметить «уже знаю», начать с неё.</p>}
    </div>
  );
}

/* ---------- Текст стиха и личные настройки ---------- */

const STEP_LABELS: { id: Exclude<LearnStep, 'recall'>; label: string }[] = [
  { id: 'read', label: 'Прочитать' },
  { id: 'half', label: 'Половина слов' },
  { id: 'letters', label: 'Первые буквы' },
  { id: 'together', label: 'Вместе с прошлыми' }
];

function PoemEditor({ topicId, poem, onDone, onDeleted }: { topicId: string; poem: Poem; onDone: () => void; onDeleted: () => void }) {
  const [title, setTitle] = useState(poem.title);
  const [author, setAuthor] = useState(poem.author ?? '');
  const [text, setText] = useState(poem.text);
  const [chunk, setChunk] = useState<string>(poem.text.trim() ? String(poem.chunk) : 'auto');
  const [steps, setSteps] = useState<Set<string>>(new Set(poem.steps ?? ['read', 'half', 'letters', 'together']));
  const [win, setWin] = useState(String(togetherWindow(poem)));
  const [deadline, setDeadline] = useState(poem.deadline ?? '');
  const customised = steps.size !== 4 || Number(win) !== 4 || !!poem.deadline;
  const [more, setMore] = useState(customised);
  const effChunk = chunk === 'auto' ? autoChunk(text) : Number(chunk);
  const parts = poemParts(text, effChunk);
  const lines = poemLines(text);
  const textChanged = poem.text.trim() !== '' && text.trim() !== poem.text.trim();
  const hasProgress = knownSet(poem).size > 0 || (poem.skipLines?.length ?? 0) > 0;
  return (
    <form
      className="stack gap12 tab-pane poem-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        const body = text.trim();
        // Личное (выучено, не учу, подсказки) привязано к строкам: при правке текста переносим на те же строки, при смене частей — оставляем как есть.
        const kept: Partial<Poem> = poem.text.trim() ? (textChanged ? remapPatch(poem, body) : { knownLines: [...knownSet(poem)].sort((a, b) => a - b) }) : {};
        const next: Poem = { ...poem, ...kept, text: body, chunk: effChunk };
        const allSteps = steps.size === 4;
        save(topicId, poem.id, {
          title: title.trim() || lines[0]?.text.replace(/[,.;:!?…—-]+$/, '') || 'Стихотворение',
          author: author.trim() || undefined,
          text: body,
          chunk: effChunk,
          ...kept,
          learned: learnedCount(next),
          steps: allSteps ? undefined : (['read', 'half', 'letters', 'together'] as const).filter((s) => steps.has(s)),
          window: Number(win) === 4 ? undefined : Number(win),
          deadline: deadline || undefined
        });
        onDone();
      }}
    >
      <div className="row gap8 wrap">
        <label className="field grow">
          <span>Название</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Зимнее утро" />
        </label>
        <label className="field grow">
          <span>Автор</span>
          <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="А. С. Пушкин" />
        </label>
      </div>
      <label className="field">
        <span>Текст</span>
        <textarea className="input poem-textarea" autoFocus={!poem.text} rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Вставь стихотворение. Строфы раздели пустой строкой.\n\nМороз и солнце; день чудесный!\nЕщё ты дремлешь, друг прелестный —\n…'} />
      </label>
      <div className="field">
        <span>Учить частями по</span>
        <Segmented
          ariaLabel="Размер части"
          value={chunk}
          onChange={setChunk}
          options={[
            { value: 'auto', label: 'Сам выберу' },
            { value: '2', label: '2 строки' },
            { value: '4', label: '4 строки' },
            { value: '0', label: 'Строфе' }
          ]}
        />
        <span className="small muted">
          {lines.length ? `${nLines(lines.length)} → ${parts.length} ${plural(parts.length, 'часть', 'части', 'частей')}. ` : ''}
          Маленькие части легче. Размер можно менять в любой момент — выученное не пропадёт.
        </span>
      </div>
      <button type="button" className="btn ghost small poem-more" aria-expanded={more} onClick={() => setMore(!more)}>
        {more ? 'Скрыть дополнительное' : 'Дополнительно: шаги учёбы, срок'}
      </button>
      {more && (
        <div className="stack gap12 poem-adv">
        <div className="field">
          <span>Шаги при учёбе</span>
          <div className="row gap8 wrap">
            {STEP_LABELS.map((s) => (
              <button key={s.id} type="button" className={'chip-btn' + (steps.has(s.id) ? ' on' : '')} aria-pressed={steps.has(s.id)} onClick={() => setSteps((cur) => new Set(cur.has(s.id) ? [...cur].filter((x) => x !== s.id) : [...cur, s.id]))}>
                {s.label}
              </button>
            ))}
            <span className="chip-btn on static" aria-hidden>
              По памяти — всегда
            </span>
          </div>
          <span className="small muted">Стих уже наполовину знаешь — убери «Прочитать» и «Половина слов».</span>
        </div>
        {steps.has('together') && (
          <div className="field">
            <span>«Вместе с прошлыми» — сколько прошлых частей добавлять</span>
            <Segmented ariaLabel="Сколько частей вместе" value={win} onChange={setWin} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '4', label: '4' }, { value: '8', label: '8' }]} />
          </div>
        )}
        <div className="field">
          <span>Выучить к дате (необязательно)</span>
          <div className="row gap8 wrap">
            <input className="input" type="date" min="2000-01-01" max="2100-12-31" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Выучить к дате" />
            {deadline && (
              <button type="button" className="btn ghost small" onClick={() => setDeadline('')}>
                Убрать срок
              </button>
            )}
          </div>
          <span className="small muted">Мнема подскажет, сколько строк в день.</span>
        </div>
        </div>
      )}
      {textChanged && hasProgress && <div className="hint warn small">Текст изменился: выученное и твои отметки сохранятся для строк, которые остались прежними.</div>}
      <div className="row gap8 wrap">
        <button className="btn primary" type="submit" disabled={!text.trim()}>
          {poem.text.trim() ? 'Сохранить' : 'Готово — учить'}
        </button>
        {poem.text.trim() && (
          <button type="button" className="btn ghost" onClick={onDone}>
            Отмена
          </button>
        )}
        <span className="grow" />
        <ConfirmButton onConfirm={onDeleted}>
          <Icon name="trash" size={16} /> Удалить стих
        </ConfirmButton>
      </div>
    </form>
  );
}

/* ---------- Строки с подсказкой ---------- */

interface PlanWord {
  t: CueToken;
  key: string; // «строка:слово» (с нуля)
  state: 'plain' | 'pinned' | 'hidden' | 'opened';
}
interface CuePlan {
  rows: { li: number; level: CueLevel; words: PlanWord[] }[];
  hidden: string[]; // ключи спрятанных слов по порядку
}

/** Что показать в каждой строке: свой уровень подсказки строки, «всегда открытые» слова и слова, которые уже открыл. */
function cuePlan(poem: Poem, idx: number[], base: CueLevel, opened: Set<string>): CuePlan {
  const all = poemLines(poem.text);
  const rows = idx.map((li) => {
    const level = effCue(poem, li, base);
    let wk = 0;
    const words: PlanWord[] = cueLine(all[li]?.text ?? '', level, li).map((t) => {
      if (!t.word) return { t, key: '', state: 'plain' };
      const key = `${li}:${wk}`;
      const pin = isPinned(poem, li, wk++);
      return { t, key, state: !t.hidden ? 'plain' : pin ? 'pinned' : opened.has(key) ? 'opened' : 'hidden' };
    });
    return { li, level, words };
  });
  return { rows, hidden: rows.flatMap((r) => r.words.filter((w) => w.state === 'hidden').map((w) => w.key)) };
}

function CueLines({ plan, onOpen }: { plan: CuePlan; onOpen?: (key: string) => void }) {
  return (
    <div className="poem-cue level0">
      {plan.rows.map((r) => (
        <div key={r.li} className="poem-line">
          {r.words.map(({ t, key, state }, k) => {
            if (!t.word) return <span key={k}>{r.level === 3 ? (/[.,!?;:—–-]/.test(t.text) ? t.text : ' ') : t.text}</span>;
            if (state === 'plain') return <span key={k}>{t.text}</span>;
            if (state === 'pinned') return <span key={k} className="pw-pin">{t.full}</span>;
            if (state === 'opened') return <span key={k} className="pw-hinted">{t.full}</span>;
            return r.level === 3 ? (
              <button key={k} type="button" className="pw-blank pw-tap" aria-label="Открыть слово" style={{ width: Math.min(9, 0.6 * t.full.length + 0.6) + 'em' }} onClick={() => onOpen?.(key)} />
            ) : (
              <button key={k} type="button" className="pw-letter pw-tap" aria-label="Открыть слово" onClick={() => onOpen?.(key)}>
                {t.text}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Для учёбы по частям: строки с общим уровнем подсказки (без своих правок «как открывать»). */
function StaticCue({ lines, level, offset }: { lines: string[]; level: CueLevel; offset: number }) {
  return (
    <div className={'poem-cue level' + level}>
      {lines.map((l, i) => (
        <div key={i} className="poem-line">
          {cueLine(l, level, offset + i).map((t, k) => (!t.word ? <span key={k}>{t.text}</span> : !t.hidden ? <span key={k}>{t.text}</span> : <span key={k} className="pw-letter">{t.text}</span>))}
        </div>
      ))}
    </div>
  );
}

/* ---------- Рассказ по памяти: голосом или самопроверкой ---------- */

interface RecallResult {
  acc: number;
  bad: number[]; // индексы строк (внутри показанных) с ошибками
  pass: boolean;
}

function Recall({ poem, idx, title, hint, onPass, onRetry, retryLabel = 'Ещё раз', oneWay }: { poem: Poem; idx: number[]; title: string; hint?: string; onPass: (r: RecallResult) => void; onRetry: (r: RecallResult) => void; retryLabel?: string; oneWay?: string }) {
  const data = useData();
  const lines = useMemo(() => {
    const all = poemLines(poem.text);
    return idx.map((i) => all[i]?.text ?? '');
  }, [poem.text, idx]);
  const voice = recitalVoice(aiAvailable(data));
  const [phase, setPhase] = useState<'hidden' | 'rec' | 'wait' | 'voice' | 'self'>('hidden');
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [letters, setLetters] = useState(false);
  const [live, setLive] = useState('');
  const [err, setErr] = useState('');
  const [rec, setRec] = useState<Recital | null>(null);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const session = useRef<RecitalSession | null>(null);
  useEffect(() => () => session.current?.cancel(), []);
  const helped = opened.size > 0 || letters;
  const plan = cuePlan(poem, idx, letters ? 2 : 3, opened);
  const open = (...keys: string[]) => setOpened((cur) => new Set([...cur, ...keys]));

  const begin = async () => {
    setErr('');
    setLive('');
    try {
      session.current = await startRecital(setLive);
      setPhase('rec');
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const finish = async () => {
    const s = session.current;
    if (!s) return;
    setPhase('wait');
    try {
      const r = await s.stop();
      session.current = null;
      if (!r.text.trim()) throw new Error('Ничего не расслышал — попробуй ещё раз, ближе к микрофону.');
      setRec(compareRecital(lines, r.text, r.times));
      setPhase('voice');
    } catch (e) {
      setErr((e as Error).message);
      setPhase('hidden');
    }
  };
  const result = (): RecallResult => {
    if (phase === 'voice' && rec) return { acc: rec.accuracy, bad: rec.badLines, pass: rec.accuracy >= 0.9 && !helped };
    const bad = [...marked].sort((a, b) => a - b);
    return { acc: lines.length ? 1 - bad.length / lines.length : 0, bad, pass: bad.length === 0 && !helped };
  };

  if (phase === 'voice' && rec) {
    const r = result();
    return (
      <div className="stack gap12 poem-recall">
        <div className="row gap12 poem-score">
          <span className={'poem-pct ' + (rec.accuracy >= 0.9 ? 'good' : rec.accuracy >= 0.7 ? 'mid' : 'bad')}>{Math.round(rec.accuracy * 100)}%</span>
          <span className="stack gap2">
            <strong>{rec.accuracy >= 0.97 && !rec.stumbles ? 'Без единой ошибки!' : rec.accuracy >= 0.9 ? 'Почти идеально' : rec.accuracy >= 0.7 ? 'Неплохо, но есть пропуски' : 'Пока много пропусков'}</strong>
            <span className="small muted">
              {rec.words.filter((w) => w.mark === 'miss').length} пропущено · {rec.words.filter((w) => w.mark === 'wrong').length} не так · {rec.stumbles} {plural(rec.stumbles, 'запинка', 'запинки', 'запинок')}
              {helped && ' · с подсказкой'}
            </span>
          </span>
        </div>
        <RecitalText lines={lines} rec={rec} />
        <div className="small muted">
          <span className="pw-miss">зачёркнуто</span> — пропустил, <span className="pw-wrong">подчёркнуто</span> — сказал иначе (наведи — что прозвучало), <span className="pw-stumble">точки</span> — запнулся: пауза или повтор.
        </div>
        <Actions r={r} onPass={onPass} onRetry={onRetry} retryLabel={retryLabel} oneWay={oneWay} />
      </div>
    );
  }

  if (phase === 'self') {
    const r = result();
    return (
      <div className="stack gap12 poem-recall">
        <strong>Сверь с текстом. Нажми на строки, где ошибся или запнулся.</strong>
        <div className="poem-cue level0 poem-self">
          {lines.map((l, i) => (
            <button key={i} type="button" className={'poem-line self' + (marked.has(i) ? ' bad' : '')} aria-pressed={marked.has(i)} onClick={() => setMarked((m) => new Set(m.has(i) ? [...m].filter((x) => x !== i) : [...m, i]))}>
              <span className="grow">{l}</span>
              <Icon name={marked.has(i) ? 'x' : 'check'} size={14} />
            </button>
          ))}
        </div>
        <Actions r={r} onPass={onPass} onRetry={onRetry} retryLabel={retryLabel} oneWay={oneWay} passLabel={marked.size ? `Дальше — ошибки в ${marked.size} ${plural(marked.size, 'строке', 'строках', 'строках')}` : 'Всё верно — дальше'} />
      </div>
    );
  }

  return (
    <div className="stack gap12 poem-recall">
      <div className="stack gap2">
        <strong>{title}</strong>
        {hint && <span className="small muted">{hint}</span>}
      </div>
      {phase === 'rec' || phase === 'wait' ? (
        <div className="poem-live">
          <span className="rec-dot" />
          <span className="grow">{live || 'Слушаю… рассказывай вслух.'}</span>
        </div>
      ) : (
        <CueLines plan={plan} onOpen={(k) => open(k)} />
      )}
      {err && <div className="hint warn small">{err}</div>}
      <div className="row gap8 wrap">
        {phase === 'rec' ? (
          <>
            <button className="btn primary" onClick={finish}>
              <Icon name="check" size={16} /> Готово
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                session.current?.cancel();
                session.current = null;
                setPhase('hidden');
              }}
            >
              Отмена
            </button>
          </>
        ) : phase === 'wait' ? (
          <span className="small muted">Сверяю с текстом…</span>
        ) : (
          <>
            {voice && (
              <button className="btn primary" onClick={begin}>
                <Icon name="mic" size={16} /> Рассказать вслух
              </button>
            )}
            <button className={'btn' + (voice ? '' : ' primary')} onClick={() => setPhase('self')}>
              <Icon name="check" size={16} /> Рассказал — проверить
            </button>
            {!letters && (
              <button className="btn ghost small" onClick={() => setLetters(true)} title="Показать первые буквы слов">
                Первые буквы
              </button>
            )}
            <button className="btn ghost small" disabled={!plan.hidden.length} onClick={() => open(plan.hidden[0])} title="Открыть следующее слово (или нажми на нужное слово сам)">
              Подсказка{opened.size ? ` · ${opened.size}` : ''}
            </button>
          </>
        )}
      </div>
      {!voice && phase === 'hidden' && <span className="small muted">Расскажи вслух (спрятанное слово можно открыть нажатием), потом нажми «Рассказал — проверить». {window.mnemaApi?.speechStart ? '' : 'Рассказывать голосом с проверкой можно на телефоне или с ИИ-помощником (Настройки → Возможности).'}</span>}
    </div>
  );
}

function Actions({ r, onPass, onRetry, retryLabel, passLabel, oneWay }: { r: RecallResult; onPass: (r: RecallResult) => void; onRetry: (r: RecallResult) => void; retryLabel: string; passLabel?: string; oneWay?: string }) {
  if (oneWay)
    return (
      <div className="row gap8 wrap">
        <button className="btn primary" autoFocus onClick={() => onPass(r)}>
          {oneWay} →
        </button>
      </div>
    );
  return (
    <div className="row gap8 wrap">
      {r.pass ? (
        <>
          <button className="btn primary" autoFocus onClick={() => onPass(r)}>
            {passLabel ?? 'Дальше'} →
          </button>
          <button className="btn ghost" onClick={() => onRetry(r)}>
            {retryLabel}
          </button>
        </>
      ) : (
        <>
          <button className="btn primary" autoFocus onClick={() => onRetry(r)}>
            <Icon name="repeat" size={16} /> {retryLabel}
          </button>
          <button className="btn ghost" onClick={() => onPass(r)}>
            {passLabel && r.bad.length ? passLabel : 'Всё равно дальше'}
          </button>
        </>
      )}
    </div>
  );
}

function RecitalText({ lines, rec }: { lines: string[]; rec: Recital }) {
  let wi = 0;
  return (
    <div className="poem-cue level0 poem-diff">
      {lines.map((l, li) => (
        <div key={li} className="poem-line">
          {cueLine(l, 0).map((t, k) => {
            if (!t.word) return <span key={k}>{t.text}</span>;
            const w = rec.words[wi++];
            if (!w) return <span key={k}>{t.text}</span>;
            const cls = (w.mark === 'miss' ? 'pw-miss' : w.mark === 'wrong' ? 'pw-wrong' : '') + (w.stumble ? ' pw-stumble' : '');
            return (
              <span key={k} className={cls} title={w.mark === 'wrong' ? `Прозвучало: «${w.said}»` : w.stumble ? 'Здесь запнулся' : w.mark === 'miss' ? 'Пропущено' : undefined}>
                {t.text}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ---------- Учить по частям ---------- */

type Stage = 'read' | 'half' | 'letters' | 'recall' | 'together' | 'final' | 'done';
const STAGES: { id: Exclude<Stage, 'final' | 'done'>; label: string }[] = [
  { id: 'read', label: 'Прочитай' },
  { id: 'half', label: 'Половина' },
  { id: 'letters', label: 'Буквы' },
  { id: 'recall', label: 'Сам' },
  { id: 'together', label: 'Вместе' }
];
const CUE_STAGES: Stage[] = ['read', 'half', 'letters', 'recall'];

/** Учим строки из target по частям (в порядке стиха); каждая выученная часть сразу запоминается. */
function LearnFlow({ topicId, poem, target, onExit }: { topicId: string; poem: Poem; target: number[]; onExit: () => void }) {
  const all = poemLines(poem.text).map((l) => l.text);
  const units = useMemo(() => learnUnits(poem, target), []); // eslint-disable-line react-hooks/exhaustive-deps
  const steps = enabledSteps(poem);
  const win = togetherWindow(poem);
  const enabled = (s: Stage) => s === 'recall' || s === 'final' || s === 'done' || steps.has(s as LearnStep);
  const firstStage = (CUE_STAGES.find(enabled) ?? 'recall') as Stage;
  const [k, setK] = useState(0);
  const [stage, setStage] = useState<Stage>(firstStage);
  const [round, setRound] = useState(0);
  const go = (s: Stage) => {
    setStage(s);
    setRound((r) => r + 1);
  };
  if (!units.length)
    return (
      <div className="stack gap12 tab-pane poem-trainer">
        <strong>Нечего учить</strong>
        <span className="muted">Выбранные строки отмечены «не учу». Вернуть их в учёбу можно в списке строк.</span>
        <button className="btn primary start-self" onClick={onExit}>
          Назад
        </button>
      </div>
    );
  const unit = units[Math.min(k, units.length - 1)];
  const unitLines = unit.map((i) => all[i]);
  // «Вместе»: эта часть и несколько предыдущих (из тех, что учили раньше или только что), без ещё не выученных.
  const chain = learnUnits(poem, activeLines(poem));
  const pos = chain.findIndex((u) => u.includes(unit[0]));
  const known = knownSet(fresh(topicId, poem));
  const togetherIdx = chain
    .slice(Math.max(0, pos - win + 1), pos + 1)
    .flat()
    .filter((i) => known.has(i) || unit.includes(i));
  const hasTogether = steps.has('together') && togetherIdx.length > unit.length;
  const afterCue = (s: Stage): Stage => CUE_STAGES.slice(CUE_STAGES.indexOf(s) + 1).find(enabled) ?? 'recall';
  const beforeCue = (s: Stage): Stage => [...CUE_STAGES.slice(0, CUE_STAGES.indexOf(s))].reverse().find((x) => x !== 'recall' && enabled(x)) ?? s;
  const retryStage = (): Stage => [...CUE_STAGES].reverse().find((x) => x !== 'recall' && enabled(x)) ?? 'recall';

  const rec = (idx: number[], r: RecallResult) => record(topicId, poem.id, { acc: r.acc, lines: idx, bad: r.bad.map((b) => idx[b]), mode: 'learn' });
  const partDone = () => {
    save(topicId, poem.id, setKnown(fresh(topicId, poem), unit, true));
    if (k + 1 < units.length) {
      setK(k + 1);
      go(firstStage);
    } else if (poemLearned(fresh(topicId, poem)) && units.length > win) go('final');
    else go('done');
  };

  const body = (() => {
    if (stage === 'done') {
      const learnedAll = poemLearned(fresh(topicId, poem));
      const left = learnTargets(fresh(topicId, poem)).length;
      return (
        <div className="stack gap12 poem-done">
          <div className="poem-done-ico">🎉</div>
          <strong>{learnedAll ? 'Стих выучен!' : 'Выбранное выучено!'}</strong>
          <span className="muted">
            {learnedAll
              ? 'Завтра Мнема напомнит рассказать его целиком — потом через 3 дня, неделю и дальше. Так он останется надолго, а не до конца урока. Лучше всего повторить вечером и утром.'
              : `Остальное — когда захочешь${left ? ` (осталось ${nLines(left)})` : ''}. Выученные строки сохранены.`}
          </span>
          <button className="btn primary start-self" onClick={onExit}>
            Готово
          </button>
        </div>
      );
    }
    if (stage === 'final') {
      const idx = activeLines(fresh(topicId, poem));
      return (
        <Recall
          key={'f' + round}
          poem={fresh(topicId, poem)}
          idx={idx}
          title="А теперь весь стих целиком"
          hint="Без подсказок, от первой до последней строки."
          onPass={(r) => {
            rec(idx, r);
            go('done');
          }}
          onRetry={(r) => {
            rec(idx, r);
            go('final');
          }}
        />
      );
    }
    if (stage === 'recall')
      return (
        <Recall
          key={'r' + round}
          poem={poem}
          idx={unit}
          title="Теперь по памяти"
          hint="Расскажи эту часть вслух, не подглядывая."
          retryLabel={retryStage() === 'recall' ? 'Ещё раз' : 'Ещё раз с буквами'}
          onPass={(r) => {
            rec(unit, r);
            if (hasTogether) go('together');
            else partDone();
          }}
          onRetry={(r) => {
            rec(unit, r);
            go(retryStage());
          }}
        />
      );
    if (stage === 'together')
      return (
        <Recall
          key={'t' + round}
          poem={poem}
          idx={togetherIdx}
          title={togetherIdx[0] === 0 ? 'Теперь всё с начала' : 'Теперь вместе с предыдущими частями'}
          hint="Так части сцепляются: конец одной подсказывает начало следующей."
          onPass={(r) => {
            rec(togetherIdx, r);
            partDone();
          }}
          onRetry={(r) => {
            rec(togetherIdx, r);
            go('together');
          }}
        />
      );
    const level: CueLevel = stage === 'read' ? 0 : stage === 'half' ? 1 : 2;
    const text = { read: 'Прочитай вслух 2–3 раза. Представь картинку к каждой строке — так запоминается быстрее.', half: 'Часть слов спрятана. Расскажи вслух, подглядывая в первые буквы.', letters: 'Остались только первые буквы. Расскажи вслух.' }[stage as 'read' | 'half' | 'letters'];
    return (
      <div className="stack gap12" key={stage + round}>
        <span className="muted">{text}</span>
        <StaticCue lines={unitLines} level={level} offset={unit[0]} />
        <div className="row gap8 wrap">
          <button className="btn primary" autoFocus onClick={() => go(afterCue(stage))}>
            {stage === 'read' ? 'Прочитал — дальше' : 'Рассказал — дальше'} →
          </button>
          {beforeCue(stage) !== stage && (
            <button className="btn ghost" onClick={() => go(beforeCue(stage))}>
              Больше подсказок
            </button>
          )}
          {stage === 'read' && canSpeak() && <ListenBtn className="btn ghost" text={unitLines.join('\n')} />}
        </div>
      </div>
    );
  })();

  const shown = STAGES.filter((s) => enabled(s.id) && (s.id !== 'together' || hasTogether));
  const si = shown.findIndex((s) => s.id === stage);
  return (
    <div className="stack gap16 tab-pane poem-trainer">
      <div className="row between gap8 wrap">
        <div className="stack gap2">
          <strong>{stage === 'final' ? 'Весь стих' : stage === 'done' ? poem.title : `Часть ${k + 1} из ${units.length} · ${unit.length === 1 ? `строка ${unit[0] + 1}` : `строки ${unit[0] + 1}–${unit[unit.length - 1] + 1}`}`}</strong>
          {stage !== 'final' && stage !== 'done' && (
            <div className="poem-steps" aria-label="Шаги">
              {shown.map((s, i) => (
                <span key={s.id} className={'poem-step' + (i < si ? ' done' : i === si ? ' on' : '')}>
                  {s.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {stage !== 'done' && (
          <button className="btn ghost small" onClick={onExit} title="Выученные части сохранятся">
            Перерыв
          </button>
        )}
      </div>
      <div className="poem-progress" aria-hidden>
        <span style={{ width: (stage === 'done' ? 100 : (100 * k) / units.length) + '%' }} />
      </div>
      <div className="poem-stage">{body}</div>
    </div>
  );
}

/* ---------- Рассказать (весь стих, выученное или выбранные строки) ---------- */

function WholeCheck({ topicId, poem, idx, pick, onExit }: { topicId: string; poem: Poem; idx: number[]; pick?: string; onExit: () => void }) {
  const [round, setRound] = useState(0);
  const [done, setDone] = useState<null | { acc: number; due?: string }>(null);
  const whole = !pick;
  const full = poemLearned(poem);
  const finish = (r: RecallResult) => {
    record(topicId, poem.id, { acc: r.acc, lines: idx, bad: r.bad.map((b) => idx[b]), mode: whole ? 'whole' : 'pick' });
    const p = fresh(topicId, poem);
    setDone({ acc: r.acc, due: whole && full ? p.review?.due : undefined });
  };
  return (
    <div className="stack gap16 tab-pane poem-trainer">
      <div className="row between gap8">
        <strong>{pick ?? (full ? 'Расскажи наизусть' : 'Расскажи выученное')}</strong>
        <button className="btn ghost small" onClick={onExit}>
          Закрыть
        </button>
      </div>
      {done ? (
        <div className="stack gap12 poem-done">
          <strong>{done.acc >= 0.9 ? 'Отлично!' : done.acc >= 0.7 ? 'Хорошо, но есть что подтянуть' : 'Стоит поучить ещё'}</strong>
          <span className="muted">
            {Math.round(done.acc * 100)}% верно.
            {done.due ? ` Следующий раз — ${fmtDay(done.due)}.` : ''}
            {done.acc < 0.9 ? ' Трудные строки подсвечены в тексте — «С любого места» потренирует их чаще.' : ''}
          </span>
          <div className="row gap8">
            <button className="btn primary" onClick={onExit}>
              Готово
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setDone(null);
                setRound((x) => x + 1);
              }}
            >
              Ещё раз
            </button>
          </div>
        </div>
      ) : (
        <Recall key={round} poem={poem} idx={idx} title={poem.title || 'Стихотворение'} hint={poem.author} onPass={finish} onRetry={finish} oneWay="Готово" />
      )}
    </div>
  );
}

/* ---------- С любого места ---------- */

/** Мнема показывает строку — ты продолжаешь. Места выбираются случайно (трудные и отмеченные чаще) или задаёшь сам (starts). */
function RandomFlow({ topicId, poem, pool, starts: manual, span, onExit }: { topicId: string; poem: Poem; pool: number[]; starts?: number[]; span: number; onExit: () => void }) {
  const all = poemLines(poem.text).map((l) => l.text);
  const starts = useMemo(() => manual ?? pickStarts(poem, 5, Math.random, pool), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  if (!starts.length) return null;
  const s = starts[Math.min(i, starts.length - 1)];
  const at = pool.indexOf(s);
  const target = pool.slice(at + 1, at + 1 + span);
  const next = (r: RecallResult) => {
    record(topicId, poem.id, { acc: r.acc, lines: target, bad: r.bad.map((b) => target[b]), mode: manual ? 'pick' : 'random' });
    if (r.acc >= 0.9) setScore((x) => x + 1);
    setI((x) => x + 1);
  };
  return (
    <div className="stack gap16 tab-pane poem-trainer">
      <div className="row between gap8">
        <strong>{manual ? 'Продолжи с этого места' : `С любого места · ${Math.min(i + 1, starts.length)} из ${starts.length}`}</strong>
        <button className="btn ghost small" onClick={onExit}>
          Закрыть
        </button>
      </div>
      {i >= starts.length ? (
        <div className="stack gap12 poem-done">
          <strong>
            {score} из {starts.length} — без ошибок
          </strong>
          <span className="muted">Так учитель может спросить с середины — а ты готов. Места, где ошибаешься, будут попадаться чаще.</span>
          <button className="btn primary start-self" onClick={onExit}>
            Готово
          </button>
        </div>
      ) : (
        <>
          <div className="poem-cue level0 poem-given">
            <div className="poem-line">{all[s]}</div>
          </div>
          <Recall key={i} poem={poem} idx={target} title="Продолжи" hint="Расскажи следующие строки." onPass={next} onRetry={next} oneWay="Дальше" />
        </>
      )}
    </div>
  );
}

/** «Послушать» ↔ «Остановить»: пока идёт озвучка, кнопка останавливает её. Уходишь с экрана — тоже замолкает. */
function ListenBtn({ text, className, title }: { text: string; className: string; title?: string }) {
  const on = useSpeaking(text);
  useEffect(() => () => stopSpeaking(), []);
  return on ? (
    <button className={className + ' speaking'} onClick={stopSpeaking} title="Замолчать">
      <Icon name="x" size={16} /> Остановить
    </button>
  ) : (
    <button className={className} onClick={() => speak(text, 'ru-RU')} title={title}>
      <Icon name="speaker" size={16} /> Послушать
    </button>
  );
}
