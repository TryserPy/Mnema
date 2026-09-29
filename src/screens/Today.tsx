import { useMemo, useState } from 'react';
import { Collapse, Icon, Modal, plural, AnimatedNumber, AnimText, SubjectMark } from '../components/ui';
import { WeekCard } from './Stats';
import { HomeworkToday } from '../components/Homework';
import { addExample } from '../seed';
import { duePoems } from '../poem';
import { dayStart, DAY, examPlan, streak, todayCounts, tomorrowSubjects, topicMastery, warmupCards, type ExamPlan } from '../srs';
import { dismissTip, setScheduleDay, sortedSubjects, updateSettings, useData } from '../store';
import { pickTip } from '../tips';
import type { Route } from '../types';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAY_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

export function Today({ go, onNewSubject }: { go: (r: Route) => void; onNewSubject: () => void }) {
  const data = useData();
  const now = useMemo(() => new Date(), [data]);
  const f = data.settings.features;
  const counts = todayCounts(data, now);
  const total = counts.learning + counts.review + counts.newCount;
  const st = streak(data, now);
  const tip = pickTip(data, now);
  const [whyOpen, setWhyOpen] = useState(false);

  const recent = data.logs.slice(-200);
  const avgMs = recent.length ? recent.reduce((a, l) => a + l.ms, 0) / recent.length : 10_000;
  const minutes = total === 0 ? 0 : Math.max(1, Math.round((total * avgMs * 1.1) / 60_000));

  const today = dayStart(now, data.settings.dayStartHour);
  const exams = data.topics
    .filter((t) => t.examDate)
    .map((t) => ({ t, days: Math.round((new Date(t.examDate + 'T12:00:00').getTime() - today.getTime()) / DAY), m: topicMastery(data, t.id) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);
  const important = data.topics
    .filter((t) => t.important)
    .map((t) => {
      const c = todayCounts(data, now, { topicId: t.id });
      const m = topicMastery(data, t.id);
      return { t, due: c.learning + c.review + c.newCount, pct: m.total ? Math.round((m.learned / m.total) * 100) : 0 };
    })
    .slice(0, 6);
  const tomorrow = f.schedule ? tomorrowSubjects(data, now).map((id) => data.subjects.find((s) => s.id === id)!).filter(Boolean) : [];

  if (data.subjects.length === 0) {
    return (
      <div className="page narrow">
        <div className="welcome">
          <div className="logo big">М</div>
          <h1 className="display">Привет! Это Мнема</h1>
          <p className="lead">Она помогает запоминать то, что ты учишь, — и напоминает повторить как раз тогда, когда ты начинаешь забывать.</p>
          <ol className="steps big-steps">
            <li>
              <span><strong>Добавь предмет</strong> — например, «Биология».</span>
            </li>
            <li>
              <span><strong>Создай тему</strong> и коротко запиши главное своими словами.</span>
            </li>
            <li>
              <span><strong>Выдели важное</strong>, нажми правую кнопку мыши → «В карточку».</span>
            </li>
            <li>
              <span><strong>Каждый день</strong> нажимай «Начать» — хватит 10–15 минут.</span>
            </li>
          </ol>
          <div className="row gap8 wrap center-row">
            <button className="btn primary big-ish" onClick={onNewSubject}>
              <Icon name="plus" size={18} /> Добавить предмет
            </button>
            <button
              className="btn"
              onClick={() => {
                addExample();
                updateSettings({ onboarded: true });
              }}
            >
              Посмотреть на примере
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page narrow today-page">
      <div className="row between end-align">
        <div>
          <div className="muted">
            {WEEKDAY_FULL[now.getDay()]}, {now.getDate()} {MONTHS[now.getMonth()]}
          </div>
          <h1 className="display">Сегодня</h1>
        </div>
        {st > 0 && (
          <div className="pill streak" title="Дней подряд с повторениями">
            <Icon name="flame" size={18} />
            {st} {plural(st, 'день', 'дня', 'дней')} подряд
          </div>
        )}
      </div>

      <div className="hero">
        {total > 0 ? (
          <>
            <div className="hero-label">На сегодня</div>
            <div className="row gap12 end-align">
              <div className="hero-num">
                <AnimatedNumber value={total} />
              </div>
              <div className="hero-sub">
                {plural(total, 'карточка', 'карточки', 'карточек')} · около {minutes} мин
              </div>
            </div>
            <button className="hero-btn" onClick={() => go({ name: 'review' })}>
              <Icon name="play" size={18} /> Начать
            </button>
            {f.focus && (
              <button className="hero-link" onClick={() => go({ name: 'review', focus: true, run: Date.now() })}>
                <Icon name="timer" size={16} /> Фокус {data.settings.focusMinutes} минут, потом перерыв
              </button>
            )}
          </>
        ) : (
          <>
            <div className="hero-num small-num">Всё повторено ✓</div>
            <div className="hero-sub">Новые повторения появятся завтра. Можно дописать конспект или добавить карточки.</div>
          </>
        )}
      </div>

      {f.weekly && dayStart(now, data.settings.dayStartHour).getDay() === 1 && <WeekCard data={data} go={go} compact />}

      {tomorrow.length > 0 && !f.schedule && (
        <div className="note-line">
          <Icon name="calendar" size={18} />
          <span>
            Завтра: {tomorrow.map((s) => s.name).join(', ')}. Их карточки идут первыми.
          </span>
        </div>
      )}

      {f.schedule && <WeekSchedule now={now} go={go} />}

      {f.homework && <HomeworkToday go={go} />}

      {f.poems &&
        duePoems(data, now).map(({ topic, poem }) => (
          <button key={poem.id} className="note-line poem-due" onClick={() => go({ name: 'topic', id: topic.id, tab: 'poem:' + poem.id + ':whole' })}>
            <Icon name="mic" size={18} />
            <span className="grow">
              Расскажи наизусть «{poem.title || topic.name}» — пора повторить, чтобы не забылся.
            </span>
            <Icon name="right" size={16} />
          </button>
        ))}

      {exams.length > 0 && (
        <div className="card exam-card">
          <h3>Контрольные</h3>
          {exams.map(({ t, days, m }) => {
            const pct = m.total ? Math.round((m.learned / m.total) * 100) : 0;
            const subject = data.subjects.find((s) => s.id === t.subjectId);
            const plan = examPlan(data, now, t.id);
            const todo = plan ? plan.todayNew + plan.todayAhead + plan.todayDue : 0;
            return (
              <div key={t.id} className="exam-row">
                <div className="exam-top">
                  <span className="dot" style={{ background: subject?.color }} />
                  <button className="grow exam-main" onClick={() => go({ name: 'topic', id: t.id })}>
                    <strong>{t.name}</strong>
                    <span className="muted small block">
                      {days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} ${plural(days, 'день', 'дня', 'дней')}`} · выучено {pct}%
                    </span>
                  </button>
                  {todo > 0 ? (
                    <button className="btn small primary" onClick={() => go({ name: 'review', topicId: t.id })}>
                      Готовиться · {todo}
                    </button>
                  ) : (
                    f.test &&
                    m.total >= 2 && (
                      <button className="btn small" onClick={() => go({ name: 'test', topicId: t.id })}>
                        Проверить себя
                      </button>
                    )
                  )}
                </div>
                {plan && plan.total > 0 && <ExamPlanLine plan={plan} />}
              </div>
            );
          })}
        </div>
      )}

      {important.length > 0 && (
        <div className="card stack gap8">
          <h3 className="row gap8">
            <span className="star-mark">
              <Icon name="starFill" size={18} />
            </span>
            Важные темы
          </h3>
          {important.map(({ t, due, pct }) => {
            const subject = data.subjects.find((x) => x.id === t.subjectId);
            return (
              <div key={t.id} className="exam">
                <span className="dot" style={{ background: subject?.color }} />
                <button className="grow exam-main" onClick={() => go({ name: 'topic', id: t.id })}>
                  <strong>{t.name}</strong>
                  <span className="muted small block">
                    {subject?.name} · выучено {pct}%
                  </span>
                </button>
                {due > 0 && (
                  <button className="btn small" onClick={() => go({ name: 'review', topicId: t.id })}>
                    Учить · {due}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!f.schedule && (
        <button className="add-schedule" onClick={() => updateSettings({ features: { ...f, schedule: true } })}>
          <Icon name="calendar" size={18} /> Добавить расписание уроков — накануне Мнема будет ставить карточки этих предметов первыми
        </button>
      )}

      {tip && (
        <div className="tip tip-bottom">
          <Icon name="bulb" size={20} />
          <div className="grow stack gap6">
            <span>{tip.text}</span>
            {whyOpen && <span className="small why">{tip.why}</span>}
            <button className="link-btn tip-link" onClick={() => setWhyOpen(!whyOpen)}>
              <AnimText value={whyOpen ? 'Скрыть' : 'Почему?'} />
            </button>
          </div>
          <button className="icon-btn small tip-close" aria-label="Скрыть совет" onClick={() => dismissTip(tip.id)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

const DAYS = [
  ['1', 'Пн', 'Понедельник'],
  ['2', 'Вт', 'Вторник'],
  ['3', 'Ср', 'Среда'],
  ['4', 'Чт', 'Четверг'],
  ['5', 'Пт', 'Пятница'],
  ['6', 'Сб', 'Суббота']
] as const;

/** Уроки на сегодня и завтра. Вся неделя — в окне «Расписание». */
function WeekSchedule({ now, go }: { now: Date; go: (r: Route) => void }) {
  const data = useData();
  const [edit, setEdit] = useState(false);
  const subjects = sortedSubjects(data);
  const base = dayStart(now, data.settings.dayStartHour);
  const todayDow = base.getDay();
  const tmr = new Date(base);
  tmr.setDate(tmr.getDate() + 1);
  const tomorrowDow = tmr.getDay() === 0 ? 1 : tmr.getDay();
  const tomorrowLabel = tmr.getDay() === 0 ? 'В понедельник' : 'Завтра';
  const empty = DAYS.every(([d]) => (data.settings.schedule[d] ?? []).length === 0);
  const lessons = (dow: number) => (data.settings.schedule[String(dow)] ?? []).map((id) => subjects.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const dueBySubject = (id: string) => {
    const c = todayCounts(data, now, { subjectId: id });
    return c.learning + c.review + c.newCount;
  };
  const tomorrowIds = lessons(tomorrowDow).map((s) => s.id);
  const prepDue = tomorrowIds.length ? (() => {
    const c = todayCounts(data, now, { subjectIds: tomorrowIds });
    return c.learning + c.review + c.newCount;
  })() : 0;
  // Утром (до 13:00), если сегодня есть уроки — разминка на 5 карточек.
  const warm = now.getHours() < 13 && todayDow !== 0 ? warmupCards(data, now, 5) : [];
  const col = (title: string, dow: number, withDue: boolean) => {
    const list = dow === 0 ? [] : lessons(dow);
    return (
      <div className="les-col">
        <div className="les-col-title">{title}</div>
        {list.length === 0 ? (
          <span className="les-none">{dow === 0 ? 'Выходной' : 'Уроков нет'}</span>
        ) : (
          list.map((s, i) => {
            const due = withDue ? dueBySubject(s.id) : 0;
            return (
              <button key={s.id + i} className="les" style={{ animationDelay: i * 35 + 'ms' }} onClick={() => go({ name: 'subject', id: s.id })}>
                <span className="les-n">{i + 1}</span>
                <SubjectMark color={s.color} icon={s.icon} />
                <span className="les-name">{s.name}</span>
                {due > 0 && (
                  <span className="les-due" title="Карточки этого предмета стоят первыми — повтори перед уроком">
                    ↻ {due}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    );
  };
  return (
    <div className="card les-card">
      <div className="les-head">
        <h3>Уроки</h3>
        <span className="grow" />
        <button className="link-btn small" onClick={() => setEdit(true)}>
          {empty ? 'Заполнить расписание' : 'Вся неделя ›'}
        </button>
      </div>
      {empty ? (
        <p className="small muted">Отметь, какие предметы в какие дни. Накануне урока Мнема поставит их карточки первыми — повторить перед уроком полезнее всего. А домашке сама подставит срок «к следующему уроку».</p>
      ) : (
        <div className="les-cols">
          {col('Сегодня', todayDow, false)}
          {col(tomorrowLabel, tomorrowDow, true)}
        </div>
      )}
      {!empty && (prepDue > 0 || warm.length > 0) && (
        <div className="les-actions">
          {prepDue > 0 && (
            <button className="btn small primary" onClick={() => go({ name: 'review', subjectIds: tomorrowIds, run: Date.now() })} title="Повторить карточки предметов, которые будут на уроках">
              <Icon name="play" size={14} /> Подготовиться к {tmr.getDay() === 0 ? 'понедельнику' : 'завтра'} · {prepDue}
            </button>
          )}
          {warm.length > 0 && (
            <button className="btn small" onClick={() => go({ name: 'review', cardIds: warm, cram: true, limit: warm.length, run: Date.now() })} title="5 самых подзабытых карточек сегодняшних уроков — расписание повторений не меняется">
              <Icon name="flame" size={14} /> Разминка перед уроками · {warm.length}
            </button>
          )}
        </div>
      )}
      {edit && <ScheduleEditor onClose={() => setEdit(false)} todayDow={todayDow} tomorrowDow={tomorrowDow} />}
    </div>
  );
}

/** Расписание на неделю: у каждого дня — уроки по порядку. «+» раскрывает под днём список предметов;
 * один предмет можно поставить несколько раз (две информатики — в начале и в конце дня). Уроки можно перетаскивать. */
function ScheduleEditor({ onClose, todayDow, tomorrowDow }: { onClose: () => void; todayDow: number; tomorrowDow: number }) {
  const data = useData();
  const subjects = sortedSubjects(data);
  const [adding, setAdding] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ day: string; i: number } | null>(null);
  const [over, setOver] = useState<{ day: string; i: number } | null>(null);
  const move = (day: string, from: number, to: number) => {
    const ids = [...(data.settings.schedule[day] ?? [])];
    const [x] = ids.splice(from, 1);
    ids.splice(to > from ? to - 1 : to, 0, x);
    setScheduleDay(day, ids);
  };
  return (
    <Modal title="Расписание уроков" onClose={onClose} width={660}>
      <div className="stack gap12">
        <p className="small muted">Нажми «+» и выбери предмет — урок встанет в конец дня. Один предмет можно поставить несколько раз. Порядок меняется перетаскиванием.</p>
        <div className="sched">
          {DAYS.map(([d, short, full]) => {
            const ids = data.settings.schedule[d] ?? [];
            const list = ids.map((id, i) => ({ s: subjects.find((x) => x.id === id), i })).filter((x): x is { s: NonNullable<typeof x.s>; i: number } => Boolean(x.s));
            const tag = Number(d) === todayDow ? 'сегодня' : Number(d) === tomorrowDow ? 'завтра' : '';
            const open = adding === d;
            return (
              <div key={d} className={'sched-day' + (tag ? ' hl' : '') + (open ? ' open' : '')}>
                <div className="sched-dname" title={full}>
                  <strong>{short}</strong>
                  {tag && <span>{tag}</span>}
                </div>
                <div className="sched-body">
                  <div
                    className="sched-lessons"
                    onDragOver={(e) => {
                      if (drag?.day === d) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (drag?.day === d) move(d, drag.i, over?.day === d ? over.i : ids.length);
                      setDrag(null);
                      setOver(null);
                    }}
                  >
                    {list.map(({ s, i }, k) => (
                      <span
                        key={s.id + i}
                        className={'sched-chip' + (drag?.day === d && drag.i === i ? ' dragging' : '') + (over?.day === d && over.i === i && drag?.i !== i ? ' drop-before' : '')}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          setDrag({ day: d, i });
                        }}
                        onDragEnter={() => drag?.day === d && setOver({ day: d, i })}
                        onDragEnd={() => {
                          setDrag(null);
                          setOver(null);
                        }}
                        title="Перетащи, чтобы поменять порядок"
                      >
                        <span className="sched-n">{k + 1}</span>
                        <span className="dot" style={{ background: s.color }} />
                        {s.name}
                        <button aria-label={`Убрать ${s.name} из ${full}`} onClick={() => setScheduleDay(d, ids.filter((_, j) => j !== i))}>
                          <Icon name="x" size={12} />
                        </button>
                      </span>
                    ))}
                    <button className={'sched-add' + (open ? ' open' : '')} aria-expanded={open} aria-label={`Добавить урок: ${full}`} onClick={() => setAdding(open ? null : d)}>
                      <Icon name={open ? 'x' : 'plus'} size={14} />
                      {list.length === 0 && !open && <span>урок</span>}
                      {open && <span>готово</span>}
                    </button>
                  </div>
                  <Collapse open={open}>
                    <div className="sched-pick" role="group" aria-label={`Предметы для: ${full}`}>
                      {subjects.map((s) => {
                        const n = ids.filter((x) => x === s.id).length;
                        return (
                          <button key={s.id} className="sched-pick-item" onClick={() => setScheduleDay(d, [...ids, s.id])}>
                            <SubjectMark color={s.color} icon={s.icon} />
                            <span className="clamp1">{s.name}</span>
                            {n > 0 && <span className="sched-pick-n">×{n}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </Collapse>
                </div>
              </div>
            );
          })}
        </div>
        <div className="row end">
          <button className="btn primary" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </Modal>
  );
}

const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** План подготовки: что сегодня и сколько новых в каждый день до контрольной. */
export function ExamPlanLine({ plan }: { plan: ExamPlan }) {
  const parts: string[] = [];
  if (plan.todayNew) parts.push(`${plan.todayNew} ${plural(plan.todayNew, 'новая', 'новые', 'новых')}`);
  if (plan.todayDue) parts.push(`${plan.todayDue} повторить`);
  if (plan.todayAhead) parts.push(`${plan.todayAhead} освежить заранее`);
  const max = Math.max(1, ...plan.perDay);
  const today = new Date();
  return (
    <div className="exam-plan">
      <span className="small">
        {parts.length ? <>План на сегодня: {parts.join(', ')}.</> : plan.newLeft === 0 && plan.weak === 0 ? <>Всё готово — к контрольной тема будет в памяти.</> : <>На сегодня по плану всё сделано.</>}
        {plan.newLeft > 0 && plan.daysLeft > 1 && <span className="muted"> Новые разложены до контрольной — по чуть-чуть каждый день.</span>}
      </span>
      {plan.perDay.length > 1 && plan.perDay.some((n) => n > 0) && (
        <div className="exam-days" aria-hidden="true">
          {plan.perDay.map((n, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            return (
              <span key={i} className={'exam-day' + (i === 0 ? ' now' : '')} title={`${DOW[d.getDay()]}: ${n} новых`}>
                <i style={{ height: Math.max(3, (n / max) * 22) + 'px' }} />
                <b>{i === 0 ? 'сег' : DOW[d.getDay()]}</b>
              </span>
            );
          })}
          <span className="exam-day exam-flag" title="Контрольная">
            <i />
            <b>🏁</b>
          </span>
        </div>
      )}
    </div>
  );
}
