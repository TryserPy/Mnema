import { useEffect, useMemo, useRef, useState } from 'react';
import { Markdown } from '../components/Markdown';
import { Icon, Segmented, AnimText } from '../components/ui';
import { allItems, checkTyped } from '../srs';
import { addTestResult, getData, useData } from '../store';
import { buildTest, schoolGrade, type TestQuestion } from '../testgen';
import type { Route } from '../types';

interface Answer {
  ok: boolean;
  given?: string;
}

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function TestScreen({ topicId, go, pretest = false }: { topicId: string; go: (r: Route) => void; pretest?: boolean }) {
  const data = useData();
  const topic = data.topics.find((t) => t.id === topicId);
  const available = useMemo(() => allItems(getData(), { topicId }).length, [topicId]);
  const [count, setCount] = useState<number>(Math.min(10, available));
  const [timed, setTimed] = useState(false);
  const [questions, setQuestions] = useState<TestQuestion[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<(Answer | undefined)[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finished, setFinished] = useState(false);
  const saved = useRef(false);

  useEffect(() => {
    if (!deadline || finished) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [deadline, finished]);
  useEffect(() => {
    if (deadline && now >= deadline && !finished) setFinished(true);
  }, [now, deadline, finished]);

  const correct = answers.filter((a) => a?.ok).length;
  useEffect(() => {
    if (finished && questions && !saved.current && !pretest) {
      saved.current = true;
      addTestResult({ topicId, total: questions.length, correct });
    }
  }, [finished, questions, topicId, correct]);

  if (!topic) return <div className="page">Тема не найдена.</div>;
  const back = () => go({ name: 'topic', id: topicId });

  // ---------- Настройка ----------
  if (!questions) {
    const options = [5, 10, 20].filter((n) => n < available).map((n) => ({ value: n, label: String(n) }));
    options.push({ value: available, label: `Все (${available})` });
    return (
      <div className="page narrow center-page">
        <div className="card stack gap16 done-card">
          <div className="stack gap4">
            <span className="muted">{pretest ? 'Проверь себя до чтения' : 'Пробная контрольная'}</span>
            <h1 className="display">{topic.name}</h1>
          </div>
          {pretest ? (
            <p className="muted">Ты ещё не учил эту тему — и это нормально. Отвечай наугад: попытка вспомнить до чтения готовит память, и потом запоминается лучше, даже если сейчас ошибёшься. Оценки не будет.</p>
          ) : (
            <p className="muted">Вопросы по карточкам темы, без подсказок. Расписание повторений не меняется — это просто проверка, насколько ты готов.</p>
          )}
          <div className="stack gap8">
            <span className="label">Сколько вопросов</span>
            <Segmented ariaLabel="Сколько вопросов" value={count} options={options} onChange={setCount} />
          </div>
          <div className="stack gap8" hidden={pretest}>
            <span className="label">Время</span>
            <Segmented
              ariaLabel="Время"
              value={timed ? 'on' : 'off'}
              options={[
                { value: 'off', label: 'Без ограничения' },
                { value: 'on', label: `${count} мин (минута на вопрос)` }
              ]}
              onChange={(v) => setTimed(v === 'on')}
            />
          </div>
          <div className="row end gap8">
            <button className="btn ghost" onClick={back}>
              Отмена
            </button>
            <button
              className="btn primary"
              onClick={() => {
                const q = buildTest(getData(), topicId, count);
                setQuestions(q);
                setAnswers(new Array(q.length).fill(undefined));
                if (timed) setDeadline(Date.now() + q.length * 60_000);
              }}
            >
              Начать
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Итоги ----------
  if ((finished || idx >= questions.length) && pretest) {
    const mistakes = questions.map((q, i) => ({ q, a: answers[i] })).filter((x) => !x.a?.ok);
    return (
      <div className="page narrow">
        <div className="card stack gap12 result-card">
          <span className="muted">Проверь себя до чтения · {topic.name}</span>
          <h1 className="display">
            Угадано {correct} из {questions.length}
          </h1>
          <p>Теперь прочитай конспект. Обрати внимание на вопросы, где ошибся, — ответы на них теперь запомнятся легче.</p>
          {mistakes.length > 0 && (
            <ul className="pretest-list">
              {mistakes.slice(0, 8).map(({ q }) => (
                <li key={q.key}>
                  <Markdown text={q.question} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="row gap8">
          <button className="btn primary" onClick={() => go({ name: 'topic', id: topicId, tab: 'note' })}>
            Читать конспект
          </button>
        </div>
      </div>
    );
  }

  if (finished || idx >= questions.length) {
    const grade = schoolGrade(correct, questions.length);
    const mistakes = questions.map((q, i) => ({ q, a: answers[i] })).filter((x) => !x.a?.ok);
    return (
      <div className="page narrow">
        <div className="card stack gap12 result-card">
          <span className="muted">Пробная контрольная · {topic.name}</span>
          <div className="row gap16 end-align">
            <div className={'grade-badge g' + grade}>{grade}</div>
            <div className="stack gap4">
              <h1 className="display">
                {correct} из {questions.length}
              </h1>
              <span className="muted">
                {Math.round((correct / Math.max(1, questions.length)) * 100)}% верно · оценка примерная
              </span>
            </div>
          </div>
          {deadline && now >= deadline && <div className="hint warn">Время вышло — вопросы без ответа засчитаны как ошибки.</div>}
        </div>
        {mistakes.length > 0 && (
          <div className="card stack gap12">
            <h3>Ошибки — разбери их</h3>
            {mistakes.map(({ q, a }) => (
              <div key={q.key} className="mistake">
                <Markdown text={q.question} />
                {a?.given && (
                  <div className="small">
                    <span className="muted">Твой ответ: </span>
                    <span className="bad-text">{a.given}</span>
                  </div>
                )}
                <div className="small">
                  <span className="muted">Верно: </span>
                  <Markdown className="inline-md" text={q.answer} />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="row gap8">
          {mistakes.length > 0 && (
            <button className="btn primary" onClick={() => go({ name: 'review', cardIds: [...new Set(mistakes.map((m) => m.q.cardId))], cram: true, topicId })}>
              Повторить ошибки
            </button>
          )}
          <button className="btn" onClick={back}>
            К теме
          </button>
        </div>
      </div>
    );
  }

  // ---------- Вопрос ----------
  const q = questions[idx];
  const ans = answers[idx];
  const answer = (a: Answer) => {
    const next = [...answers];
    next[idx] = a;
    setAnswers(next);
    setRevealed(true);
  };
  const nextQ = () => {
    setIdx(idx + 1);
    setRevealed(false);
    setTyped('');
  };

  return (
    <div className="review">
      <div className="review-top">
        <button className="icon-btn" aria-label="Закончить" onClick={() => setFinished(true)}>
          <Icon name="x" />
        </button>
        <div className="progress full">
          <span style={{ width: `${(idx / questions.length) * 100}%` }} />
        </div>
        <span className="small muted nowrap">
          <AnimText value={`${idx + 1} из ${questions.length}`} />
        </span>
        {deadline && (
          <span className={'pill small-pill' + (deadline - now < 60_000 ? ' warn-pill' : '')}>
            <Icon name="timer" size={16} /> {fmt(deadline - now)}
          </span>
        )}
      </div>
      <div className="review-card">
        <Markdown text={q.question} className="question" />
        {q.kind === 'choice' && (
          <div className="choices">
            {q.options!.map((o) => {
              const isRight = o === q.answer;
              const chosen = ans?.given === o;
              const cls = revealed ? (isRight ? ' right' : chosen ? ' wrong' : ' dim') : '';
              return (
                <button key={o} className={'choice' + cls} disabled={revealed} onClick={() => answer({ ok: isRight, given: o })}>
                  <Markdown text={o} />
                </button>
              );
            })}
          </div>
        )}
        {q.kind === 'typed' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!revealed && typed.trim()) answer({ ok: checkTyped(typed, q.expected!), given: typed });
            }}
          >
            <input className={'input typed ' + (revealed ? (ans?.ok ? 'ok' : 'bad') : '')} autoFocus placeholder="Напиши ответ и нажми Enter" value={typed} readOnly={revealed} onChange={(e) => setTyped(e.target.value)} />
          </form>
        )}
        {q.kind === 'self' && revealed && (
          <div className="answer stack gap12">
            <div className="divider" />
            <Markdown text={q.answer} className="answer-text" />
          </div>
        )}
        {revealed && q.kind !== 'self' && !ans?.ok && q.kind === 'typed' && (
          <div className="hint warn">
            Верно: <Markdown className="inline-md" text={q.answer} />
          </div>
        )}
      </div>
      <div className="review-actions">
        {q.kind === 'self' && !revealed && (
          <button className="btn primary big" onClick={() => setRevealed(true)}>
            Показать ответ
          </button>
        )}
        {q.kind === 'self' && revealed && !ans && (
          <div className="grades two">
            <button className="grade again" onClick={() => { const n = [...answers]; n[idx] = { ok: false }; setAnswers(n); nextQ(); }}>
              <span className="strong">Не знал</span>
            </button>
            <button className="grade good" onClick={() => { const n = [...answers]; n[idx] = { ok: true }; setAnswers(n); nextQ(); }}>
              <span className="strong">Знал</span>
            </button>
          </div>
        )}
        {q.kind !== 'self' && revealed && (
          <button className="btn primary big" autoFocus onClick={nextQ}>
            {idx + 1 < questions.length ? 'Дальше' : 'Результат'}
          </button>
        )}
      </div>
    </div>
  );
}
