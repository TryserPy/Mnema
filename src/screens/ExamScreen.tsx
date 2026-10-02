// Подготовка к контрольной: сколько помнишь к дате (прогноз по карточкам, не оценка), что охвачено, где слабые места, что делать каждый день.
import { useMemo, useState } from 'react';
import { ExamDialog } from '../components/ExamDialog';
import { AnimatedNumber, Icon, plural } from '../components/ui';
import { dayPlan, readiness } from '../exams';
import { examById } from '../examList';
import { REASON_TEXT } from '../weakness';
import { useData } from '../store';
import type { Route } from '../types';
import '../exam.css';

const MAX_FIX = 15; // за один заход «Исправить» — не больше стольких карточек

const when = (days: number) => (days < 0 ? 'уже прошла' : days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} ${plural(days, 'день', 'дня', 'дней')}`);
const fmtDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const dayLabel = (offset: number, daysLeft: number, iso: string) =>
  offset === 0 ? 'Сегодня' : offset === 1 ? 'Завтра' : offset === daysLeft - 1 ? 'Накануне' : new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });

export function ExamScreen({ id, go }: { id: string; go: (r: Route) => void }) {
  const data = useData();
  const [editing, setEditing] = useState(false);
  const now = useMemo(() => new Date(), [data]);
  const view = useMemo(() => {
    const ex = examById(data, id);
    return ex ? { ex, r: readiness(data, ex, now), plan: dayPlan(data, ex, now) } : null;
  }, [data, id, now]);

  if (!view) {
    return (
      <div className="page narrow">
        <div className="empty">
          <strong>Контрольная не найдена</strong>
          <span>Возможно, её удалили.</span>
          <button className="btn primary" onClick={() => go({ name: 'today' })}>
            На «Сегодня»
          </button>
        </div>
      </div>
    );
  }
  const { ex, r, plan } = view;
  const subject = data.subjects.find((s) => s.id === ex.subjectId);
  const pct = Math.round(r.recallOnDate * 100);
  const fix = r.weak.slice(0, MAX_FIX);
  const past = r.daysLeft < 0;
  const learnCards = r.cardIds;

  return (
    <div className="page narrow exam-page">
      <div className="row between end-align gap12">
        <div className="stack gap4">
          {subject && (
            <button className="crumb" onClick={() => go({ name: 'subject', id: subject.id })}>
              <span className="dot" style={{ background: subject.color }} /> {subject.name}
            </button>
          )}
          <h1 className="display">{ex.name}</h1>
          <span className="muted">
            {fmtDate(ex.date)} · {when(r.daysLeft)}
          </span>
        </div>
        <button className="btn small" onClick={() => setEditing(true)}>
          <Icon name="edit" size={16} /> Изменить
        </button>
      </div>

      <div className="card exam-hero stack gap12">
        {r.items === 0 ? (
          <>
            <strong>В выбранных темах пока нет карточек</strong>
            <span className="muted">Сделай карточки из конспекта — тогда Мнема покажет, что ты помнишь и что повторить.</span>
          </>
        ) : (
          <>
            <div className="exam-pct-row">
              <span className="exam-pct">
                <AnimatedNumber value={pct} />
                <small>%</small>
              </span>
              <span className="stack gap2">
                <strong>{past ? 'прогноз на день контрольной' : 'помнишь к дате'}</strong>
                <span className="small muted">прогноз по карточкам, не оценка за контрольную</span>
              </span>
            </div>
            <div className="exam-facts small">
              <span>
                Учишь {r.started} из {r.items} {plural(r.items, 'карточки', 'карточек', 'карточек')}
                {r.started < r.items && ' — остальные ещё не начаты, их прогноз 0'}
              </span>
              {r.coverage ? (
                <span>
                  Карточки есть на {r.coverage.covered} из {r.coverage.places} {plural(r.coverage.places, 'важного места', 'важных мест', 'важных мест')} конспекта
                </span>
              ) : (
                <span className="muted">В конспектах нет отмеченного важного — охват не считается</span>
              )}
            </div>
          </>
        )}
        {!past && r.items > 0 && (
          <div className="row gap8 wrap">
            {fix.length > 0 && (
              <button className="btn primary" onClick={() => go({ name: 'review', cardIds: fix.map((c) => c.cardId), ahead: true })}>
                <Icon name="repeat" size={18} /> Исправить · {fix.length}
              </button>
            )}
            <button className={'btn' + (fix.length ? '' : ' primary')} onClick={() => go({ name: 'review', cardIds: learnCards })}>
              <Icon name="play" size={18} /> Учить к контрольной
            </button>
            {r.items >= 2 && (
              <button className="btn" onClick={() => go({ name: 'test', topicId: ex.topicIds[0], examId: ex.id })}>
                <Icon name="test" size={18} /> Пробная контрольная
              </button>
            )}
          </div>
        )}
      </div>

      {r.perTopic.length > 0 && (
        <div className="card stack gap12">
          <h3>По темам</h3>
          {r.perTopic.map((t) => {
            const cov = t.coverage ? Math.round((t.coverage.covered / t.coverage.places) * 100) : null;
            return (
              <button key={t.topicId} className="exam-topic" onClick={() => go({ name: 'topic', id: t.topicId })}>
                <span className="row between gap8">
                  <strong className="clamp1">{t.name}</strong>
                  <span className="small muted">
                    помнишь {Math.round(t.recall * 100)}%{t.coverage ? ` · охвачено ${t.coverage.covered} из ${t.coverage.places}` : ''}
                  </span>
                </span>
                <span className="exam-bars" aria-hidden="true">
                  {cov !== null && <span className="exam-bar cover" style={{ width: cov + '%' }} />}
                  <span className="exam-bar recall" style={{ width: Math.round(t.recall * 100) + '%' }} />
                </span>
              </button>
            );
          })}
          <span className="small muted">Светлая полоса — охват конспекта карточками, тёмная — сколько помнишь к дате.</span>
        </div>
      )}

      {r.weak.length > 0 && !past && (
        <div className="card stack gap8">
          <h3>Слабые места</h3>
          <span className="small muted">Что к этой дате подведёт скорее всего. Оценка — по тому, как быстро забывается, сколько раз забывал и как трудно запоминается.</span>
          {r.weak.slice(0, 5).map((w) => {
            const c = data.cards.find((x) => x.id === w.cardId);
            return (
              <button key={w.cardId} className="exam-weak" onClick={() => go({ name: 'topic', id: w.topicId, tab: 'cards' })}>
                <strong className="clamp2">{(c?.front ?? '').replace(/\{\{|\}\}/g, '…').slice(0, 140) || 'Карточка'}</strong>
                <span className="small muted">
                  {w.reasons.length ? w.reasons.slice(0, 2).map((x) => REASON_TEXT[x]).join(' · ') : 'вспоминается хуже других'}
                </span>
              </button>
            );
          })}
          {r.weak.length > 5 && <span className="small muted">И ещё {r.weak.length - 5}.</span>}
        </div>
      )}

      {plan.length > 0 && (
        <div className="card stack gap8">
          <h3>План до даты</h3>
          <ul className="exam-plan">
            {plan.map((p) => (
              <li key={p.offset} className={p.kind}>
                <span className="exam-plan-day">{dayLabel(p.offset, r.daysLeft, p.date)}</span>
                <span>
                  {p.kind === 'new' && `${p.n} ${plural(p.n, 'новая карточка', 'новые карточки', 'новых карточек')} + повторения`}
                  {p.kind === 'weak' && `последний проход: ${p.n} ${plural(p.n, 'слабое место', 'слабых места', 'слабых мест')}`}
                  {p.kind === 'rest' && 'только повторения по расписанию'}
                </span>
              </li>
            ))}
          </ul>
          <span className="small muted">Новое заканчиваем за два дня до даты, а накануне — только слабое: так память держится надёжнее, чем при зубрёжке ночью.</span>
        </div>
      )}

      {editing && <ExamDialog examId={ex.id} onClose={() => setEditing(false)} onSaved={(newId) => newId !== ex.id && go({ name: 'exam', id: newId })} />}
    </div>
  );
}
