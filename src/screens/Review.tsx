import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Rating, type Grade } from 'ts-fsrs';
import { aiAvailable, explainDifferently } from '../ai';
import { CardEditor } from '../components/CardEditor';
import { SketchPad, type Stroke } from '../components/Drawing';
import { canSpeak, speak } from '../speak';
import { Markdown } from '../components/Markdown';
import { PageViewer } from '../components/PageViewer';
import { Icon, Modal, AnimText } from '../components/ui';
import { checkNumber } from '../problems';
import { compareSpoken, startVoice, voiceSupported, type VoiceSession } from '../voice';
import { buildPrompt, buildQueue, cardLapses, checkTyped, formatInterval, GRADES, MINUTE, previewIntervals, type QueueItem } from '../srs';
import { getData, markLeechSeen, recordReview, updateCard, useData } from '../store';
import { keyFor, matches, prettyCombo, typingTarget } from '../keys';
import type { Confidence, Route } from '../types';

const GRADE_UI = [
  { label: 'Снова', cls: 'again' },
  { label: 'Трудно', cls: 'hard' },
  { label: 'Хорошо', cls: 'good' },
  { label: 'Легко', cls: 'easy' }
];
const CONF = ['Угадываю', 'Думаю, что знаю', 'Точно знаю'];

interface Waiting {
  item: QueueItem;
  due: number;
}

function fmtClock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Review({ route, go }: { route: Extract<Route, { name: 'review' }>; go: (r: Route) => void }) {
  const data = useData();
  const cram = Boolean(route.cram);
  const settings = data.settings;
  const initial = useMemo(
    () => buildQueue(getData(), new Date(), { topicId: route.topicId, subjectId: route.subjectId, subjectIds: route.subjectIds, cardIds: route.cardIds, cram }).slice(0, route.limit ?? Infinity),
    [route.topicId, route.subjectId, route.subjectIds, route.cardIds, cram, route.limit]
  );
  const [queue, setQueue] = useState<QueueItem[]>(initial.slice(1));
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [current, setCurrent] = useState<QueueItem | null>(initial[0] ?? null);
  const [revealed, setRevealed] = useState(false);
  const [confidence, setConfidence] = useState<Confidence | undefined>(undefined);
  const [typed, setTyped] = useState('');
  const [stats, setStats] = useState({ done: 0, again: 0, ms: 0, overconf: 0 });
  const [leechCard, setLeechCard] = useState<string | null>(null);
  const [againByCard, setAgainByCard] = useState<Record<string, number>>({});
  const [handOpen, setHandOpen] = useState(false);
  const [handStrokes, setHandStrokes] = useState<Stroke[]>([]);
  const [explain, setExplain] = useState<{ state: 'idle' | 'loading' | 'done' | 'error'; text: string; added?: boolean }>({ state: 'idle', text: '' });
  const [editLeech, setEditLeech] = useState(false);
  // «Почему?»: после верного ответа иногда просим объяснить себе одной фразой (самообъяснение).
  const [whyAsk, setWhyAsk] = useState<{ cardId: string; go: () => void } | null>(null);
  const [whyText, setWhyText] = useState('');
  const goodCount = useRef(0);
  const [pageView, setPageView] = useState<number | null>(null);
  const [voice, setVoice] = useState<{ state: 'idle' | 'rec' | 'wait' | 'done' | 'error'; text: string }>({ state: 'idle', text: '' });
  const voiceSession = useRef<VoiceSession | null>(null);
  const voiceKind = voiceSupported();
  const shownAt = useRef(Date.now());
  const exitRef = useRef<() => void>(() => undefined);
  const typedRef = useRef<HTMLInputElement>(null);

  // Фокус-режим: таймер сессии и перерыв.
  const focusMs = settings.focusMinutes * MINUTE;
  const [focusStart] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [onBreak, setOnBreak] = useState<number | null>(null);
  useEffect(() => {
    if (!route.focus) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [route.focus]);
  const focusLeft = focusStart + focusMs - now;
  useEffect(() => {
    if (route.focus && focusLeft <= 0 && onBreak === null) setOnBreak(Date.now());
  }, [route.focus, focusLeft, onBreak]);

  const card = current ? data.cards.find((c) => c.id === current.cardId) : undefined;
  const topic = card ? data.topics.find((t) => t.id === card.topicId) : undefined;
  const subject = topic ? data.subjects.find((s) => s.id === topic.subjectId) : undefined;
  const seed = useMemo(() => Math.floor(Math.random() * 2 ** 31), [current]); // eslint-disable-line react-hooks/exhaustive-deps
  const prompt = card && current ? buildPrompt(card, current.ord, seed) : null;
  const listInfo = card?.listId ? data.topics.find((t) => t.id === card.topicId)?.lists?.find((l) => l.id === card.listId) : undefined;
  const state = current ? data.states[current.key] : undefined;
  const intervals = useMemo(() => (current && revealed ? previewIntervals(state, new Date(), settings) : [0, 0, 0, 0]), [current, revealed, state, settings]);
  const typedOk = !revealed ? undefined : prompt?.typed !== undefined ? checkTyped(typed, prompt.typed) : prompt?.numeric ? checkNumber(typed, prompt.numeric) : undefined;
  const wantsInput = prompt?.typed !== undefined || Boolean(prompt?.numeric?.length);
  const askConf = settings.features.confidence && !cram;

  useEffect(() => {
    shownAt.current = Date.now();
    if (prompt?.typed !== undefined || prompt?.numeric?.length) setTimeout(() => typedRef.current?.focus(), 0);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback((q: QueueItem[], w: Waiting[]) => {
    const t = Date.now();
    const ready = w.filter((x) => x.due <= t).sort((a, b) => a.due - b.due);
    let next: QueueItem | null = null;
    let nq = q;
    let nw = w;
    if (ready.length) {
      next = ready[0].item;
      nw = w.filter((x) => x !== ready[0]);
    } else if (q.length) {
      next = q[0];
      nq = q.slice(1);
    } else if (w.length) {
      const first = [...w].sort((a, b) => a.due - b.due)[0];
      next = first.item;
      nw = w.filter((x) => x !== first);
    }
    setQueue(nq);
    setWaiting(nw);
    setCurrent(next);
    setRevealed(false);
    setConfidence(undefined);
    setTyped('');
    setHandOpen(false);
    setHandStrokes([]);
    setExplain({ state: 'idle', text: '' });
    voiceSession.current?.cancel();
    voiceSession.current = null;
    setVoice({ state: 'idle', text: '' });
  }, []);

  const grade = useCallback(
    (rating: Grade) => {
      if (!current || !revealed || !card) return;
      const ms = Date.now() - shownAt.current;
      const overconf = confidence === 2 && rating === Rating.Again ? 1 : 0;
      setStats((s) => ({ done: s.done + 1, again: s.again + (rating === Rating.Again ? 1 : 0), ms: s.ms + ms, overconf: s.overconf + overconf }));
      if (rating === Rating.Again) setAgainByCard((m) => ({ ...m, [card.id]: (m[card.id] ?? 0) + 1 }));
      let w = waiting;
      if (cram) {
        if (rating === Rating.Again) {
          const q = [...queue];
          q.splice(Math.min(3, q.length), 0, current);
          advance(q, w);
          return;
        }
      } else {
        const next = recordReview({ key: current.key, cardId: current.cardId, topicId: current.topicId, rating, confidence, ms, now: new Date() });
        const due = new Date(next.due).getTime();
        if (due - Date.now() < 30 * MINUTE) w = [...w, { item: { ...current, isNew: false }, due }];
        // «Трудная» карточка: предложить переписать один раз.
        if (rating === Rating.Again && settings.features.leeches && !card.leechSeen && cardLapses(getData(), card) >= settings.leechThreshold) {
          setLeechCard(card.id);
        }
      }
      if (rating >= Rating.Good && !cram && !route.mini && settings.features.why && !card.why && state && state.state === 2) {
        goodCount.current++;
        if (goodCount.current % 7 === 3) {
          setWhyText('');
          setWhyAsk({ cardId: card.id, go: () => advance(queue, w) });
          return;
        }
      }
      advance(queue, w);
    },
    [current, revealed, card, confidence, waiting, queue, cram, advance, settings, state, route.mini]
  );

  const blocked = Boolean(leechCard) || onBreak !== null || pageView !== null || whyAsk !== null;

  const explainRef = useRef<() => void>(() => undefined);
  const voiceToggleRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (blocked) return;
      const inInput = typingTarget(e);
      if (matches(e, settings, 'exitReview') || e.key === 'Escape') {
        exitRef.current();
        return;
      }
      if (!current) return;
      if (!revealed) {
        if ((matches(e, settings, 'reveal') && !inInput) || e.key === 'Enter') {
          e.preventDefault();
          setRevealed(true);
        } else if (!inInput && settings.features.voice && matches(e, settings, 'voiceAnswer')) {
          e.preventDefault();
          voiceToggleRef.current();
        } else if (!inInput && settings.features.handwriting && matches(e, settings, 'handAnswer')) {
          e.preventDefault();
          setHandOpen(true);
        }
        return;
      }
      if (inInput && e.target !== typedRef.current) return;
      if (settings.features.ai && matches(e, settings, 'explain')) {
        e.preventDefault();
        explainRef.current();
        return;
      }
      const confirm = e.key === 'Enter' || matches(e, settings, 'reveal');
      if (settings.simpleButtons) {
        if (matches(e, settings, 'again')) grade(Rating.Again);
        else if (matches(e, settings, 'good') || matches(e, settings, 'hard') || confirm) {
          e.preventDefault();
          grade(typedOk === false && confirm ? Rating.Again : Rating.Good);
        }
        return;
      }
      const idx = (['again', 'hard', 'good', 'easy'] as const).findIndex((a) => matches(e, settings, a));
      if (idx >= 0) {
        e.preventDefault();
        grade(GRADES[idx]);
      } else if (confirm) {
        e.preventDefault();
        grade(typedOk === false ? Rating.Again : Rating.Good);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, revealed, grade, go, typedOk, blocked, settings, route.topicId]);

  async function runExplain() {
    if (!card || !prompt || !revealed || !aiAvailable(getData()) || explain.state !== 'idle') return;
    setExplain({ state: 'loading', text: '' });
    try {
      const text = await explainDifferently({
        subject: subject?.name,
        topic: topic?.name,
        question: prompt.question,
        answer: prompt.answer,
        why: card.why,
        note: topic?.note.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, '')
      });
      setExplain({ state: 'done', text });
    } catch (e) {
      setExplain({ state: 'error', text: (e as Error).message });
    }
  }
  explainRef.current = () => void runExplain();

  async function toggleVoice() {
    if (voice.state === 'rec' && voiceSession.current) {
      const sess = voiceSession.current;
      voiceSession.current = null;
      setVoice((v) => ({ state: 'wait', text: v.text }));
      try {
        const text = (await sess.stop()).trim();
        setVoice(text ? { state: 'done', text } : { state: 'error', text: 'Ничего не расслышал — попробуй ещё раз.' });
      } catch (e) {
        setVoice({ state: 'error', text: (e as Error).message });
      }
      return;
    }
    if (voice.state === 'wait') return;
    try {
      setVoice({ state: 'rec', text: '' });
      voiceSession.current = await startVoice((t) => setVoice((v) => (v.state === 'rec' ? { state: 'rec', text: t } : v)));
    } catch (e) {
      setVoice({ state: 'error', text: 'Нет доступа к микрофону или распознаванию речи. ' + ((e as Error).message ?? '') });
    }
  }
  voiceToggleRef.current = () => void toggleVoice();
  const spokenMatch = voice.state === 'done' && prompt ? compareSpoken(voice.text, prompt.typed ?? prompt.answer) : null;

  const remaining = queue.length + waiting.length + (current ? 1 : 0);
  const total = stats.done + remaining;
  const exit = () => {
    if (route.mini) window.mnemaApi?.miniEnd?.();
    go(route.topicId ? { name: 'topic', id: route.topicId } : { name: 'today' });
  };
  exitRef.current = exit;

  // Перерыв в фокус-режиме.
  if (onBreak !== null) {
    const left = onBreak + settings.breakMinutes * MINUTE - now;
    return (
      <div className="page narrow center-page">
        <div className="card stack gap12 done-card center">
          <Icon name="timer" size={32} />
          <h1 className="display">Перерыв</h1>
          <p className="lead">
            {settings.focusMinutes} минут позади — ответов: {stats.done}. Встань, подвигайся, попей воды.
          </p>
          <div className="big-clock">{left > 0 ? fmtClock(left) : 'Можно продолжать'}</div>
          <div className="row gap8 center-row">
            <button className="btn" onClick={exit}>
              Закончить
            </button>
            <button className="btn primary" disabled={!current} onClick={() => go({ ...route, focus: true, run: Date.now() })}>
              Ещё {settings.focusMinutes} минут
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!current || !card || !prompt) {
    const correct = stats.done ? Math.round(((stats.done - stats.again) / stats.done) * 100) : 0;
    return (
      <div className="page narrow center-page">
        <div className="card stack gap12 done-card">
          <h1 className="display">{stats.done ? 'Готово!' : 'Сейчас нечего повторять'}</h1>
          {stats.done > 0 ? (
            <>
              <p className="lead">
                Ответов: {stats.done} · вспомнил сразу: {correct}% · {Math.max(1, Math.round(stats.ms / 60_000))} мин
              </p>
              {stats.overconf > 0 && <div className="hint warn">Ошибок «с уверенностью»: {stats.overconf}. Разбери их — такие ошибки исправляются особенно хорошо.</div>}
              {!cram && <p className="muted">Следующие повторения Мнема покажет сама, когда придёт время.</p>}
            </>
          ) : (
            <p className="muted">Все карточки повторены или ещё не добавлены.</p>
          )}
          <div className="row gap8">
            <button className="btn primary" onClick={exit}>
              {route.mini ? 'Закрыть' : 'На главную'}
            </button>
            {route.topicId && (
              <button className="btn" onClick={() => go({ name: 'topic', id: route.topicId! })}>
                К теме
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const leech = leechCard ? data.cards.find((c) => c.id === leechCard) : undefined;

  return (
    <div className="review">
      <div className="review-top">
        <button className="icon-btn" aria-label="Закончить" onClick={exit}>
          <Icon name="x" />
        </button>
        <div className="progress full">
          <span style={{ width: `${(stats.done / Math.max(1, total)) * 100}%` }} />
        </div>
        {route.focus ? (
          <span className="pill small-pill" title="Фокус-режим">
            <Icon name="timer" size={16} /> {fmtClock(focusLeft)}
          </span>
        ) : (
          <span className="small muted nowrap">
            <AnimText value={`${stats.done + 1} из ${total}`} />
          </span>
        )}
      </div>

      <div className="review-card" key={current?.key}>
        <div className="row gap8 small muted">
          <span className="dot" style={{ background: subject?.color }} />
          <span>{topic?.name}</span>
          {cram && <span className="chip neutral">без изменения расписания</span>}
        </div>
        <div className="q-row">
          <Markdown text={prompt.question} className="question" />
          {listInfo?.lang && current?.ord === 0 && canSpeak() && <SpeakBtn text={card.front} lang={listInfo.lang} />}
        </div>

        {wantsInput && (
          <input
            ref={typedRef}
            className={'input typed ' + (typedOk === true ? 'ok' : typedOk === false ? 'bad' : '')}
            placeholder={prompt.numeric ? 'Реши и впиши число (можно пропустить — Enter)' : 'Напиши ответ и нажми Enter'}
            inputMode={prompt.numeric ? 'decimal' : undefined}
            value={typed}
            readOnly={revealed}
            onChange={(e) => setTyped(e.target.value)}
          />
        )}

        {!revealed && settings.features.handwriting && (prompt.typed === undefined || prompt.numeric) && (
          <div className="stack gap8">
            {handOpen ? (
              <SketchPad strokes={handStrokes} onChange={setHandStrokes} height={200} label="Ответ от руки" />
            ) : (
              <button type="button" className="link-btn" onClick={() => setHandOpen(true)}>
                ✎ Ответить от руки
              </button>
            )}
          </div>
        )}

        {settings.features.voice && voiceKind && (prompt.typed === undefined || prompt.numeric) && (voice.state !== 'idle' || !revealed) && (
          <div className={'voice-box ' + voice.state}>
            {voice.state === 'idle' && !revealed && (
              <button type="button" className="link-btn" onClick={() => void toggleVoice()}>
                🎤 Ответить голосом
              </button>
            )}
            {voice.state === 'rec' && (
              <button type="button" className="voice-rec" onClick={() => void toggleVoice()}>
                <span className="rec-dot" /> {voice.text || (voiceKind === 'native' ? 'Говори…' : 'Записываю… Нажми, когда закончишь')}
              </button>
            )}
            {voice.state === 'wait' && <span className="small muted">Распознаю…</span>}
            {voice.state === 'error' && <span className="small warn-text">{voice.text}</span>}
            {voice.state === 'done' && (
              <div className="stack gap4">
                <span className="label">Ты сказал</span>
                <span>«{voice.text}»</span>
                {revealed && spokenMatch && spokenMatch.total > 0 && (
                  <span className={'small ' + (spokenMatch.hit / spokenMatch.total >= 0.7 ? 'ok-text' : 'warn-text')}>
                    {spokenMatch.hit / spokenMatch.total >= 0.7 ? 'Похоже на правильный ответ' : 'Совпало не всё'} — ключевых слов {spokenMatch.hit} из {spokenMatch.total}
                    {spokenMatch.missed.length > 0 && spokenMatch.missed.length <= 6 && `. Не прозвучало: ${spokenMatch.missed.join(', ')}`}. Оцени себя честно.
                  </span>
                )}
                {revealed && spokenMatch && spokenMatch.total === 0 && <span className="small muted">Сравни сказанное с ответом сам и оцени себя честно.</span>}
              </div>
            )}
          </div>
        )}

        {!revealed && askConf && (
          <div className="stack gap8 conf">
            <span className="muted small">Насколько уверен?</span>
            <div className="conf-row">
              {CONF.map((l, i) => (
                <button key={i} type="button" className={'conf-btn' + (confidence === i ? ' on' : '')} onClick={() => setConfidence(i as Confidence)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        {revealed && (
          <div className="answer stack gap12">
            <div className="divider" />
            {typedOk !== undefined && <div className={'hint ' + (typedOk ? 'ok' : 'warn')}>{typedOk ? 'Верно!' : 'Не совпадает. Сравни с ответом и оцени себя честно.'}</div>}
            {handStrokes.length > 0 && (
              <div className="my-hand">
                <span className="label">Твой ответ</span>
                <svg viewBox={handViewBox(handStrokes)} role="img" aria-label="Твой ответ от руки">
                  {handStrokes.map((st, i) => (
                    <polyline key={i} points={st.points.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth={st.width} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                </svg>
              </div>
            )}
            <div className="q-row">
              <Markdown text={prompt.answer} className="answer-text" onPage={setPageView} />
              {listInfo?.lang && current?.ord === 1 && canSpeak() && <SpeakBtn text={card.front} lang={listInfo.lang} />}
            </div>
            {card.page && (
              <button className="page-ref as-btn" onClick={() => setPageView(card.page!)} title="Открыть страницу учебника">
                <Icon name="book" size={14} /> учебник, стр. {card.page}
              </button>
            )}
            {card.why && (
              <div className="why-box">
                <span className="label">{listInfo ? listInfo.cols[2] : 'Почему это так?'}</span>
                <Markdown text={card.why} />
              </div>
            )}
            {aiAvailable(data) && explain.state === 'idle' && (
              <button
                type="button"
                className={'btn small ai-btn' + ((againByCard[card.id] ?? 0) >= 2 ? ' pulse' : '')}
                onClick={() => void runExplain()}
                title={keyFor(settings, 'explain') ? 'Клавиша ' + prettyCombo(keyFor(settings, 'explain')).join(' + ') : undefined}
              >
                ✦ Объясни иначе
              </button>
            )}
            {explain.state === 'loading' && <div className="ai-box muted">Думаю, как объяснить проще…</div>}
            {explain.state === 'error' && <div className="hint warn">{explain.text}</div>}
            {explain.state === 'done' && (
              <div className="ai-box">
                <span className="label">Объяснение от ИИ — проверь его по учебнику</span>
                <Markdown text={explain.text} />
                <div className="row gap8">
                  {!explain.added && (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => {
                        updateCard(card.id, { why: card.why ? `${card.why}\n\n${explain.text}` : explain.text });
                        setExplain({ ...explain, added: true });
                      }}
                    >
                      Добавить в «почему»
                    </button>
                  )}
                  {explain.added && <span className="small muted">Добавлено в карточку ✓</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="review-actions">
        {!revealed ? (
          <button className="btn primary big" onClick={() => setRevealed(true)}>
            Показать ответ
          </button>
        ) : settings.simpleButtons ? (
          <div className="grades two">
            <button className="grade again" onClick={() => grade(Rating.Again)}>
              <span className="strong">Не помню</span>
              {keyFor(settings, 'again') && <span className="kbd">{prettyCombo(keyFor(settings, 'again')).join('+')}</span>}
            </button>
            <button className="grade good" onClick={() => grade(Rating.Good)}>
              <span className="strong">Помню</span>
              {keyFor(settings, 'good') && <span className="kbd">{prettyCombo(keyFor(settings, 'good')).join('+')}</span>}
            </button>
          </div>
        ) : (
          <div className="grades">
            {GRADES.map((g, i) => (
              <button key={g} className={'grade ' + GRADE_UI[i].cls} onClick={() => grade(g)}>
                <span className="strong">{GRADE_UI[i].label}</span>
                {settings.showIntervals && !cram && <span className="small">{formatInterval(intervals[i])}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {pageView !== null && topic && <PageViewer pages={topic.pages ?? []} page={pageView} onClose={() => setPageView(null)} />}
      {whyAsk && (
        <Modal
          title="Почему это так?"
          width={520}
          onClose={() => {
            const g = whyAsk.go;
            setWhyAsk(null);
            g();
          }}
        >
          <form
            className="stack gap12"
            onSubmit={(e) => {
              e.preventDefault();
              if (whyText.trim()) updateCard(whyAsk.cardId, { why: whyText.trim() });
              const g = whyAsk.go;
              setWhyAsk(null);
              g();
            }}
          >
            <p className="muted small">Объясни себе одной фразой — своими словами. Так ответ связывается с тем, что уже знаешь, и помнится дольше. Объяснение сохранится в карточку.</p>
            <textarea
              className="input"
              rows={3}
              autoFocus
              value={whyText}
              onChange={(e) => setWhyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Потому что…"
            />
            <div className="row end gap8">
              <button type="button" className="btn ghost" onClick={() => { const g = whyAsk.go; setWhyAsk(null); g(); }}>
                Пропустить
              </button>
              <button className="btn primary" type="submit" disabled={!whyText.trim()}>
                Сохранить
              </button>
            </div>
          </form>
        </Modal>
      )}

      {leech && !editLeech && (
        <Modal
          title="Эта карточка не запоминается"
          onClose={() => {
            markLeechSeen(leech.id);
            setLeechCard(null);
          }}
        >
          <div className="stack gap12">
            <p>
              Ты забывал её уже {cardLapses(data, leech)} раз. Обычно дело не в тебе, а в самой карточке: слишком длинный ответ, несколько фактов сразу или непонятный вопрос.
            </p>
            <ul className="tight">
              <li>Раздели на 2–3 карточки поменьше.</li>
              <li>Сформулируй вопрос своими словами.</li>
              <li>Добавь объяснение «почему» или пример.</li>
            </ul>
            <div className="row end gap8">
              <button
                className="btn ghost"
                onClick={() => {
                  markLeechSeen(leech.id);
                  setLeechCard(null);
                }}
              >
                Позже
              </button>
              <button className="btn primary" onClick={() => setEditLeech(true)}>
                Переписать сейчас
              </button>
            </div>
          </div>
        </Modal>
      )}
      {leech && editLeech && (
        <Modal
          title="Переписать карточку"
          width={620}
          onClose={() => {
            markLeechSeen(leech.id);
            setEditLeech(false);
            setLeechCard(null);
          }}
        >
          <CardEditor
            topicId={leech.topicId}
            card={leech}
            onDone={() => {
              markLeechSeen(leech.id);
              setEditLeech(false);
              setLeechCard(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/** Рамка рисунка по линиям — чтобы ответ от руки не терялся в пустом поле. */
function handViewBox(strokes: { points: [number, number][] }[]): string {
  const pts = strokes.flatMap((st) => st.points);
  const pad = 20;
  const minX = Math.max(0, Math.min(...pts.map((p) => p[0])) - pad);
  const minY = Math.max(0, Math.min(...pts.map((p) => p[1])) - pad);
  const w = Math.max(...pts.map((p) => p[0])) + pad - minX;
  const h = Math.max(...pts.map((p) => p[1])) + pad - minY;
  return `${minX} ${minY} ${Math.max(w, 200)} ${Math.max(h, 60)}`;
}

function SpeakBtn({ text, lang }: { text: string; lang: string }) {
  return (
    <button type="button" className="icon-btn speak-btn" aria-label="Послушать" title="Послушать произношение" onClick={() => speak(text, lang)}>
      <Icon name="speaker" size={20} />
    </button>
  );
}
