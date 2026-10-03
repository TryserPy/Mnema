// Стих наизусть: текст по частям, тренажёр «нарастающими частями» с исчезающими подсказками,
// рассказ целиком (голосом или самопроверкой) и «с любого места».
import { useEffect, useMemo, useRef, useState } from 'react';
import { aiAvailable } from '../ai';
import { autoChunk, compareRecital, cueLine, dayKey, hardLines, nextReview, pickStarts, poemLearned, poemLines, poemParts, type CueLevel, type Recital } from '../poem';
import { canSpeak, speak, stopSpeaking, useSpeaking } from '../speak';
import { deletePoem, getData, restorePoem, updatePoem, useData } from '../store';
import type { Poem, Route } from '../types';
import { recitalVoice, startRecital, type RecitalSession } from '../voice';
import { ConfirmButton, Icon, plural, Segmented, toast } from './ui';

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

function save(topicId: string, poemId: string, patch: Partial<Poem>) {
  updatePoem(topicId, poemId, patch);
}

/** Записать итог проверки: трудные строки, история, и (если стих выучен и рассказан целиком) — следующий повтор. */
function record(topicId: string, poemId: string, r: { acc: number; lines: number[]; bad: number[]; mode: 'learn' | 'whole' | 'random' }) {
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

export function PoemView({ topicId, poem, start, go }: { topicId: string; poem: Poem; start?: 'whole'; go: (r: Route) => void }) {
  const [mode, setMode] = useState<null | 'learn' | 'whole' | 'random' | 'edit'>(start ?? (poem.text.trim() ? null : 'edit'));
  const lines = useMemo(() => poemLines(poem.text), [poem.text]);
  const parts = useMemo(() => poemParts(poem.text, poem.chunk), [poem.text, poem.chunk]);
  const hard = hardLines(poem);
  const learned = Math.min(poem.learned, parts.length);
  const all = learned >= parts.length && parts.length > 0;
  const today = dayKey(new Date());
  const last = poem.history?.filter((h) => h.mode === 'whole').at(-1);

  if (mode === 'edit')
    return (
      <PoemEditor
        topicId={topicId}
        poem={poem}
        onDone={() => setMode(null)}
        onDeleted={() => {
          const removed = deletePoem(topicId, poem.id);
          go({ name: 'topic', id: topicId, tab: 'note' });
          if (removed) toast('Стих удалён', { label: 'Вернуть', run: () => restorePoem(topicId, removed) });
        }}
      />
    );
  if (mode === 'learn') return <LearnFlow topicId={topicId} poem={poem} onExit={() => setMode(null)} />;
  if (mode === 'whole') return <WholeCheck topicId={topicId} poem={poem} onExit={() => setMode(null)} />;
  if (mode === 'random') return <RandomFlow topicId={topicId} poem={poem} onExit={() => setMode(null)} />;

  return (
    <div className="stack gap16 tab-pane poem-view">
      <div className="row gap8 wrap">
        {!all ? (
          <button className="btn primary" onClick={() => setMode('learn')}>
            <Icon name="play" size={16} /> {learned === 0 ? 'Начать учить' : `Учить дальше · часть ${learned + 1} из ${parts.length}`}
          </button>
        ) : (
          <button className="btn primary" onClick={() => setMode('whole')}>
            <Icon name="mic" size={16} /> Рассказать наизусть
          </button>
        )}
        {!all && learned > 0 && (
          <button className="btn" onClick={() => setMode('whole')} title="Проверить, что уже выучено">
            <Icon name="mic" size={16} /> Рассказать выученное
          </button>
        )}
        {learned > 0 && lines.length > 3 && (
          <button className="btn" onClick={() => setMode('random')} title="Мнема показывает строку — продолжаешь с этого места">
            <Icon name="repeat" size={16} /> С любого места
          </button>
        )}
        {canSpeak() && <ListenBtn className="btn" text={poem.text} title="Мнема прочитает стих вслух" />}
        <span className="grow" />
        <button className="icon-btn bordered" aria-label="Изменить стих" title="Изменить текст и размер частей" onClick={() => setMode('edit')}>
          <Icon name="sliders" size={18} />
        </button>
      </div>

      <div className="small muted poem-status">
        {all ? 'Выучен целиком' : `Выучено ${learned} из ${parts.length} ${plural(parts.length, 'части', 'частей', 'частей')}`}
        {poem.review && all && (poem.review.due <= today ? ' · пора повторить' : ` · повторить ${fmtDay(poem.review.due)}`)}
        {last && ` · в прошлый раз ${Math.round(last.acc * 100)}%`}
        {hard.size > 0 && ` · трудных строк: ${hard.size}`}
      </div>

      <div className="poem-card">
        {(poem.title || poem.author) && (
          <div className="poem-head">
            {poem.title && <strong>{poem.title}</strong>}
            {poem.author && <span className="muted">{poem.author}</span>}
          </div>
        )}
        {parts.map((pt, k) => (
          <div key={k} className={'poem-part' + (k < learned ? ' learned' : k === learned ? ' next' : '')}>
            <span className="poem-part-mark" title={k < learned ? 'Выучено' : k === learned ? 'Следующая часть' : ''}>
              {k < learned ? <Icon name="check" size={14} /> : k + 1}
            </span>
            <div className="poem-part-lines">
              {lines.slice(pt.from, pt.to).map((l, i) => (
                <div key={i} className={'poem-line' + (hard.has(pt.from + i) ? ' hard' : '')} title={hard.has(pt.from + i) ? 'Здесь чаще всего ошибаешься' : undefined}>
                  {l.text}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="small muted poem-how">
        Как учим: стих делится на части. Каждую — вслух, пока подсказки исчезают: весь текст → половина слов → первые буквы → по памяти, потом вместе с предыдущими. Выученный стих Мнема напомнит повторить через 1, 3, 7… дней. Хорошо учить вечером и повторить утром — во сне память закрепляется.
      </p>
    </div>
  );
}

/* ---------- Текст стиха ---------- */

function PoemEditor({ topicId, poem, onDone, onDeleted }: { topicId: string; poem: Poem; onDone: () => void; onDeleted: () => void }) {
  const [title, setTitle] = useState(poem.title);
  const [author, setAuthor] = useState(poem.author ?? '');
  const [text, setText] = useState(poem.text);
  const [chunk, setChunk] = useState<string>(poem.text.trim() ? String(poem.chunk) : 'auto');
  const effChunk = chunk === 'auto' ? autoChunk(text) : Number(chunk);
  const parts = poemParts(text, effChunk);
  const lines = poemLines(text);
  const changedText = text.trim() !== poem.text.trim() || effChunk !== poem.chunk;
  return (
    <form
      className="stack gap12 tab-pane poem-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        // Текст или части поменялись — прогресс по частям начинаем заново (трудные строки тоже).
        const reset = changedText && poem.text.trim() ? { learned: 0, lineMiss: [], review: undefined } : {};
        save(topicId, poem.id, { title: title.trim() || lines[0]?.text.replace(/[,.;:!?…—-]+$/, '') || 'Стихотворение', author: author.trim() || undefined, text: text.trim(), chunk: effChunk, ...reset });
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
          {lines.length ? `${lines.length} ${plural(lines.length, 'строка', 'строки', 'строк')} → ${parts.length} ${plural(parts.length, 'часть', 'части', 'частей')}. ` : ''}
          Маленькие части легче. Для длинных строк или если учится трудно — по 2 строки.
        </span>
      </div>
      {changedText && poem.text.trim() && poem.learned > 0 && <div className="hint warn small">Текст или части поменялись — учить части придётся заново.</div>}
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

function CueLines({ lines, level, offset = 0, revealed = 0 }: { lines: string[]; level: CueLevel; offset?: number; revealed?: number }) {
  let wi = 0;
  return (
    <div className={'poem-cue level' + level}>
      {lines.map((l, i) => (
        <div key={i} className="poem-line">
          {cueLine(l, level, offset + i).map((t, k) => {
            if (!t.word) return <span key={k}>{level === 3 ? (/[.,!?;:—–-]/.test(t.text) ? t.text : ' ') : t.text}</span>;
            const idx = wi++;
            if (!t.hidden) return <span key={k}>{t.text}</span>;
            if (idx < revealed) return <span key={k} className="pw-hinted">{t.full}</span>;
            return level === 3 ? <span key={k} className="pw-blank" style={{ width: Math.min(9, 0.6 * t.full.length + 0.6) + 'em' }} /> : <span key={k} className="pw-letter">{t.text}</span>;
          })}
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

function Recall({ lines, offset, title, hint, onPass, onRetry, retryLabel = 'Ещё раз', oneWay }: { lines: string[]; offset: number; title: string; hint?: string; onPass: (r: RecallResult) => void; onRetry: (r: RecallResult) => void; retryLabel?: string; oneWay?: string }) {
  const data = useData();
  const voice = recitalVoice(aiAvailable(data));
  const [phase, setPhase] = useState<'hidden' | 'rec' | 'wait' | 'voice' | 'self'>('hidden');
  const [hints, setHints] = useState(0);
  const [letters, setLetters] = useState(false);
  const [live, setLive] = useState('');
  const [err, setErr] = useState('');
  const [rec, setRec] = useState<Recital | null>(null);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const session = useRef<RecitalSession | null>(null);
  useEffect(() => () => session.current?.cancel(), []);
  const helped = hints > 0 || letters;

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

  const words = lines.reduce((n, l) => n + cueLine(l, 3).filter((t) => t.word).length, 0);
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
        <CueLines lines={lines} level={letters ? 2 : 3} offset={offset} revealed={hints} />
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
            <button className="btn ghost small" disabled={hints >= words} onClick={() => setHints((h) => h + 1)} title="Открыть следующее слово">
              Подсказка{hints ? ` · ${hints}` : ''}
            </button>
          </>
        )}
      </div>
      {!voice && phase === 'hidden' && <span className="small muted">Расскажи вслух, потом нажми «Рассказал — проверить». {window.mnemaApi?.speechStart ? '' : 'Рассказывать голосом с проверкой можно на телефоне или с ИИ-помощником (Настройки → Возможности).'}</span>}
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
const STAGES: { id: Stage; label: string }[] = [
  { id: 'read', label: 'Прочитай' },
  { id: 'half', label: 'Половина' },
  { id: 'letters', label: 'Буквы' },
  { id: 'recall', label: 'Сам' },
  { id: 'together', label: 'Вместе' }
];
const WINDOW = 4; // «вместе» — не больше 4 последних частей, целиком — в конце

function LearnFlow({ topicId, poem, onExit }: { topicId: string; poem: Poem; onExit: () => void }) {
  const lines = poemLines(poem.text).map((l) => l.text);
  const parts = poemParts(poem.text, poem.chunk);
  const [k, setK] = useState(Math.min(poem.learned, parts.length - 1));
  const [stage, setStage] = useState<Stage>(poem.learned >= parts.length ? 'final' : 'read');
  const [round, setRound] = useState(0);
  const part = parts[k];
  const partLines = lines.slice(part.from, part.to);
  const winFrom = parts[Math.max(0, k - WINDOW + 1)].from;
  const go = (s: Stage) => {
    setStage(s);
    setRound((r) => r + 1);
  };
  const rec = (from: number, count: number, r: RecallResult) => record(topicId, poem.id, { acc: r.acc, lines: Array.from({ length: count }, (_, i) => from + i), bad: r.bad.map((b) => b + from), mode: 'learn' });
  const partDone = () => {
    const next = k + 1;
    save(topicId, poem.id, { learned: Math.max(poem.learned, next) });
    if (next >= parts.length) {
      if (parts.length > WINDOW) go('final');
      else finishAll();
    } else {
      setK(next);
      go('read');
    }
  };
  const finishAll = () => {
    const p = getData().topics.find((t) => t.id === topicId)?.poems?.find((x) => x.id === poem.id);
    if (p && !p.review) save(topicId, poem.id, { learned: parts.length, review: { due: dayKey(new Date(Date.now() + 86400000)), interval: 1, reps: 0 } });
    go('done');
  };

  const body = (() => {
    if (stage === 'done')
      return (
        <div className="stack gap12 poem-done">
          <div className="poem-done-ico">🎉</div>
          <strong>Стих выучен!</strong>
          <span className="muted">Завтра Мнема напомнит рассказать его целиком — потом через 3 дня, неделю и дальше. Так он останется надолго, а не до конца урока. Лучше всего повторить вечером и утром.</span>
          <button className="btn primary start-self" onClick={onExit}>
            Готово
          </button>
        </div>
      );
    if (stage === 'final')
      return (
        <Recall
          key={'f' + round}
          lines={lines}
          offset={0}
          title="А теперь весь стих целиком"
          hint="Без подсказок, от первой до последней строки."
          onPass={(r) => {
            rec(0, lines.length, r);
            finishAll();
          }}
          onRetry={(r) => {
            rec(0, lines.length, r);
            go('final');
          }}
        />
      );
    if (stage === 'recall')
      return (
        <Recall
          key={'r' + round}
          lines={partLines}
          offset={part.from}
          title="Теперь по памяти"
          hint="Расскажи эту часть вслух, не подглядывая."
          retryLabel="Ещё раз с буквами"
          onPass={(r) => {
            rec(part.from, partLines.length, r);
            if (k === 0) partDone();
            else go('together');
          }}
          onRetry={(r) => {
            rec(part.from, partLines.length, r);
            go('letters');
          }}
        />
      );
    if (stage === 'together')
      return (
        <Recall
          key={'t' + round}
          lines={lines.slice(winFrom, part.to)}
          offset={winFrom}
          title={winFrom === 0 ? 'Теперь всё с начала' : 'Теперь вместе с предыдущими частями'}
          hint="Так части сцепляются: конец одной подсказывает начало следующей."
          onPass={(r) => {
            rec(winFrom, part.to - winFrom, r);
            partDone();
          }}
          onRetry={(r) => {
            rec(winFrom, part.to - winFrom, r);
            go('together');
          }}
        />
      );
    const level: CueLevel = stage === 'read' ? 0 : stage === 'half' ? 1 : 2;
    const text = { read: 'Прочитай вслух 2–3 раза. Представь картинку к каждой строке — так запоминается быстрее.', half: 'Часть слов спрятана. Расскажи вслух, подглядывая в первые буквы.', letters: 'Остались только первые буквы. Расскажи вслух.' }[stage as 'read' | 'half' | 'letters'];
    return (
      <div className="stack gap12" key={stage + round}>
        <span className="muted">{text}</span>
        <CueLines lines={partLines} level={level} offset={part.from} />
        <div className="row gap8 wrap">
          <button className="btn primary" autoFocus onClick={() => go(stage === 'read' ? 'half' : stage === 'half' ? 'letters' : 'recall')}>
            {stage === 'read' ? 'Прочитал — дальше' : 'Рассказал — дальше'} →
          </button>
          {stage !== 'read' && (
            <button className="btn ghost" onClick={() => go(stage === 'half' ? 'read' : 'half')}>
              Больше подсказок
            </button>
          )}
          {stage === 'read' && canSpeak() && <ListenBtn className="btn ghost" text={partLines.join('\n')} />}
        </div>
      </div>
    );
  })();

  const si = STAGES.findIndex((s) => s.id === stage);
  return (
    <div className="stack gap16 tab-pane poem-trainer">
      <div className="row between gap8 wrap">
        <div className="stack gap2">
          <strong>{stage === 'final' ? 'Весь стих' : stage === 'done' ? poem.title : `Часть ${k + 1} из ${parts.length}`}</strong>
          {stage !== 'final' && stage !== 'done' && (
            <div className="poem-steps" aria-label="Шаги">
              {STAGES.filter((s) => s.id !== 'together' || k > 0).map((s, i) => (
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
        <span style={{ width: (stage === 'done' ? 100 : (100 * k) / parts.length) + '%' }} />
      </div>
      <div className="poem-stage">{body}</div>
    </div>
  );
}

/* ---------- Рассказать целиком ---------- */

function WholeCheck({ topicId, poem, onExit }: { topicId: string; poem: Poem; onExit: () => void }) {
  const lines = poemLines(poem.text).map((l) => l.text);
  const parts = poemParts(poem.text, poem.chunk);
  const all = poem.learned >= parts.length;
  const upto = all ? lines.length : parts[Math.max(0, Math.min(poem.learned, parts.length) - 1)]?.to ?? lines.length;
  const shown = lines.slice(0, upto);
  const [round, setRound] = useState(0);
  const [done, setDone] = useState<null | { acc: number; due?: string }>(null);
  const finish = (r: RecallResult) => {
    record(topicId, poem.id, { acc: r.acc, lines: shown.map((_, i) => i), bad: r.bad, mode: 'whole' });
    const p = getData().topics.find((t) => t.id === topicId)?.poems?.find((x) => x.id === poem.id);
    setDone({ acc: r.acc, due: all ? p?.review?.due : undefined });
  };
  return (
    <div className="stack gap16 tab-pane poem-trainer">
      <div className="row between gap8">
        <strong>{all ? 'Расскажи наизусть' : 'Расскажи выученное'}</strong>
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
        <Recall key={round} lines={shown} offset={0} title={poem.title || 'Стихотворение'} hint={poem.author} onPass={finish} onRetry={finish} oneWay="Готово" />
      )}
    </div>
  );
}

/* ---------- С любого места ---------- */

function RandomFlow({ topicId, poem, onExit }: { topicId: string; poem: Poem; onExit: () => void }) {
  const lines = poemLines(poem.text).map((l) => l.text);
  const parts = poemParts(poem.text, poem.chunk);
  const known = poem.learned >= parts.length ? lines.length : parts[Math.max(0, poem.learned - 1)]?.to ?? lines.length;
  const starts = useMemo(() => pickStarts({ ...poem, text: lines.slice(0, known).join('\n') }, 5), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  if (!starts.length) return null;
  const s = starts[i];
  const target = lines.slice(s + 1, Math.min(known, s + 3));
  const next = (r: RecallResult) => {
    record(topicId, poem.id, { acc: r.acc, lines: target.map((_, j) => s + 1 + j), bad: r.bad.map((b) => b + s + 1), mode: 'random' });
    if (r.acc >= 0.9) setScore((x) => x + 1);
    setI((x) => x + 1);
  };
  return (
    <div className="stack gap16 tab-pane poem-trainer">
      <div className="row between gap8">
        <strong>С любого места · {Math.min(i + 1, starts.length)} из {starts.length}</strong>
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
            <div className="poem-line">{lines[s]}</div>
          </div>
          <Recall key={i} lines={target} offset={s + 1} title="Продолжи" hint="Расскажи следующие строки." onPass={next} onRetry={next} oneWay="Дальше" />
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
