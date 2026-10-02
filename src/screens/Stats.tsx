import { useMemo, useState, type ReactNode } from 'react';
import { KnowledgeMap } from '../components/lazy';
import { AnimatedNumber, Icon, plural, Segmented } from '../components/ui';
import { bestStreak, MIN_SAMPLE, periodStats, topicAccuracy, WEAK_BELOW, weakTopics, weekSummary } from '../progress';
import { dayKey, dayStart, DAY, forecast, streak } from '../srs';
import { useData } from '../store';
import type { AppData, Route } from '../types';
import '../stats-groups.css';

type StatsTab = 'numbers' | 'map' | undefined;

const fmtDay = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

function delta(a: number, b: number) {
  if (!b) return null;
  const p = Math.round(((a - b) / b) * 100);
  return p === 0 ? null : p;
}

/** Итоги недели: прошлая неделя целиком, в понедельник её видно и на «Сегодня». */
export function WeekCard({ data, go, compact = false }: { data: AppData; go: (r: Route) => void; compact?: boolean }) {
  const [offset, setOffset] = useState(1);
  const w = useMemo(() => weekSummary(data, new Date(), offset), [data, offset]);
  const dA = delta(w.answers, w.prev.answers);
  if (compact && w.answers === 0) return null;
  return (
    <div className="card stack gap12 week-card">
      <div className="row between gap8 wrap">
        <h3 className="row gap8">
          <Icon name="chart" size={18} /> Итоги {offset === 1 ? 'прошлой недели' : 'этой недели'}
        </h3>
        {compact ? (
          <button className="btn small ghost" onClick={() => go({ name: 'stats' })}>
            Подробнее
          </button>
        ) : (
          <div className="sg-weekpick">
            <span className="small muted">Неделя</span>
            <div className="sg-weekseg">
              <Segmented
                ariaLabel="Неделя"
                value={offset}
                onChange={setOffset}
                options={[
                  { value: 1, label: 'Прошлая' },
                  { value: 0, label: 'Эта' }
                ]}
              />
            </div>
          </div>
        )}
      </div>
      <span className="small muted">
        {fmtDay(w.from)} — {fmtDay(w.to)}
      </span>
      {w.answers === 0 ? (
        <p className="muted">{offset === 1 ? 'На прошлой неделе занятий не было. Эта неделя — хороший повод начать: 10 минут в день достаточно.' : 'На этой неделе занятий пока нет.'}</p>
      ) : (
        <>
          <div className="week-kpis">
            <div>
              <span className="kpi-num">
                <AnimatedNumber value={w.answers} />
              </span>
              <span className="small muted">
                {plural(w.answers, 'ответ', 'ответа', 'ответов')}
                {dA !== null && <span className={dA > 0 ? 'up' : 'down'}>{dA > 0 ? ` ▲ ${dA}%` : ` ▼ ${-dA}%`}</span>}
              </span>
            </div>
            <div>
              <span className="kpi-num">
                <AnimatedNumber value={w.days} />
                <small>/7</small>
              </span>
              <span className="small muted">{plural(w.days, 'день', 'дня', 'дней')} с занятиями</span>
            </div>
            <div>
              <span className="kpi-num">
                <AnimatedNumber value={w.minutes} />
              </span>
              <span className="small muted">минут</span>
            </div>
            <div>
              <span className="kpi-num">{w.retention === null ? '—' : w.retention + '%'}</span>
              <span className="small muted">вспомнил старое</span>
            </div>
          </div>
          {!compact && (
            <ul className="week-notes">
              {w.newLearned > 0 && <li>Впервые пройдено карточек: {w.newLearned}.</li>}
              {w.bestDay && <li>Больше всего занимался в {w.bestDay.label} — {w.bestDay.n} {plural(w.bestDay.n, 'ответ', 'ответа', 'ответов')}.</li>}
              {w.topics.length > 0 && <li>Главные темы недели: {w.topics.map((t) => t.name).join(', ')}.</li>}
              {w.days >= 5 && <li>Занимался почти каждый день — так память работает лучше всего. Отлично!</li>}
              {w.days > 0 && w.days < 3 && <li>Совет: лучше понемногу каждый день, чем много за один раз — повторения с перерывами запоминаются надёжнее.</li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Вкладка «Цифры»: сверху то, что зависит от переключателя периода, ниже — то, что от него не зависит. */
function Numbers({ data, go, tabs, period, onPeriod }: { data: AppData; go: (r: Route) => void; tabs: ReactNode; period: 7 | 30 | 3650; onPeriod: (p: 7 | 30 | 3650) => void }) {
  const f = data.settings.features;
  const now = useMemo(() => new Date(), [data]);
  const hour = data.settings.dayStartHour;
  const today = dayStart(now, hour);
  const since = today.getTime() - (period - 1) * DAY;

  // За период.
  const ps = useMemo(() => periodStats(data, since), [data, since]);
  const accuracy = useMemo(() => topicAccuracy(data, since), [data, since]);
  const weak = useMemo(() => weakTopics(data, since), [data, since]);
  const enough = accuracy.some((t) => t.total >= MIN_SAMPLE); // есть ли вообще темы, про которые можно судить

  // Всегда.
  const learned = Object.values(data.states).filter((s) => s.state === 2).length;
  const streakNow = streak(data, now);
  const streakBest = Math.max(bestStreak(data), streakNow);
  const cells = useMemo(() => {
    const perDay = new Map<string, number>();
    for (const l of data.logs) {
      const k = dayKey(new Date(l.at), hour);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    const out: { key: string; n: number; label: string }[] = [];
    for (let i = 16 * 7 - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY);
      const k = dayKey(d, hour);
      out.push({ key: k, n: perDay.get(k) ?? 0, label: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) });
    }
    return out;
  }, [data, hour, today.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const level = (n: number) => (n === 0 ? 0 : n < 10 ? 1 : n < 30 ? 2 : 3);
  const fc = forecast(data, now, 14);
  const maxFc = Math.max(1, ...fc);
  const fcEmpty = fc.every((n) => n === 0);

  const kpiCount = f.confidence ? 3 : 2;
  const periodNote = period === 3650 ? 'За всё время, что ты занимаешься' : `Последние ${period} дней: с ${fmtDay(new Date(since))} по сегодня`;

  return (
    <div className="page">
      <h1 className="display">Статистика</h1>
      {tabs}

      <section className="sg-group" aria-label="За период">
        <div className="sg-head">
          <h2 className="sg-title">За период</h2>
          <div className="sg-period">
            <Segmented
              ariaLabel="Период"
              value={period}
              onChange={onPeriod}
              options={[
                { value: 7, label: 'Неделя' },
                { value: 30, label: 'Месяц' },
                { value: 3650, label: 'Всё время' }
              ]}
            />
          </div>
        </div>
        <span className="small muted sg-note">{periodNote}</span>

        <div className={'sg-kpis n' + kpiCount}>
          <div className="kpi">
            <span className="muted small">Запоминание</span>
            <span className="kpi-num">{ps.retention === null ? '—' : <AnimatedNumber value={ps.retention} />}{ps.retention === null ? '' : '%'}</span>
            <span className="small muted" title="Считаем только ответы на карточки, которые ты уже учил раньше">
              {ps.retention === null ? `мало ответов на старые карточки: ${ps.retentionN} из ${MIN_SAMPLE}` : `цель ${Math.round(data.settings.retention * 100)}%`}
            </span>
          </div>
          <div className="kpi">
            <span className="muted small">Ответов</span>
            <span className="kpi-num">
              <AnimatedNumber value={ps.answers} />
            </span>
            <span className="small muted">{ps.minutes < 1 && ps.answers ? 'меньше минуты' : `${ps.minutes} мин`}</span>
          </div>
          {f.confidence && (
            <div className="kpi">
              <span className="muted small">Ошибки «с уверенностью»</span>
              <span className="kpi-num">{ps.confN === 0 ? '—' : ps.overconf}</span>
              <span className="small muted">{ps.confN === 0 ? 'появятся, когда будешь отмечать уверенность' : `из ${ps.confN} ответов с оценкой уверенности`}</span>
            </div>
          )}
        </div>

        <div className="card stack gap12">
          <div className="stack gap4">
            <h3>Слабые темы</h3>
            <span className="small muted">Верных ответов меньше {Math.round(WEAK_BELOW * 100)}% за этот период</span>
          </div>
          {weak.length === 0 && (
            <span className="muted small">{enough ? 'Слабых тем нет — так держать!' : `Пока мало ответов: тема попадёт сюда, когда в ней будет хотя бы ${MIN_SAMPLE} ответов за период.`}</span>
          )}
          {weak.length > 0 && (
            <div className="sg-weak">
              {weak.map((t) => (
                <button key={t.id} className="weak-row" onClick={() => go({ name: 'topic', id: t.id })}>
                  <span className="row between gap8">
                    <span className="sg-weak-name">{t.name}</span>
                    <span className="strong">{t.pct}%</span>
                  </span>
                  <span className="progress full">
                    <span style={{ width: t.pct + '%', background: t.pct < 65 ? 'var(--again-ink)' : 'var(--hard-ink)' }} />
                  </span>
                  <span className="small muted">
                    ошибок: {t.wrong} из {t.total}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="sg-group sg-always" aria-label="Всегда">
        <div className="sg-head">
          <h2 className="sg-title">Всегда</h2>
          <span className="small muted">не зависит от периода</span>
        </div>

        <div className="sg-kpis n2">
          <div className="kpi">
            <span className="muted small">Выучено</span>
            <span className="kpi-num">
              <AnimatedNumber value={learned} />
            </span>
            <span className="small muted">элементов в долгом повторении</span>
          </div>
          <div className="kpi">
            <span className="muted small">Дней подряд</span>
            <span className="kpi-num">
              <AnimatedNumber value={streakNow} />
            </span>
            <span className="small muted" title="День считается, если ты ответил хотя бы на одну карточку">
              лучшая серия — {streakBest}
            </span>
          </div>
        </div>

        {f.weekly && <WeekCard data={data} go={go} />}

        <div className="stats-grid">
          <div className="card stack gap12">
            <h3>Занятия за 16 недель</h3>
            <div className="heatmap">
              {cells.map((c) => (
                <div key={c.key} className={'hm l' + level(c.n)} title={`${c.label}: ${c.n}`} />
              ))}
            </div>
            <div className="row end gap6 small muted">
              меньше <span className="hm l0 legend" />
              <span className="hm l1 legend" />
              <span className="hm l2 legend" />
              <span className="hm l3 legend" /> больше
            </div>
          </div>

          <div className="card stack gap12">
            <div className="stack gap4">
              <h3>Прогноз нагрузки на 14 дней</h3>
              <span className="small muted">сколько карточек придёт на повторение</span>
            </div>
            {fcEmpty ? (
              <p className="muted sg-empty">
                {Object.keys(data.states).length === 0 ? 'Здесь появится, сколько карточек придёт на повторение, когда ты начнёшь их учить.' : 'Ближайшие две недели повторений нет — можно отдыхать.'}
              </p>
            ) : (
              <div className="bars tall">
                {fc.map((n, i) => (
                  <div key={i} className="bar-col">
                    <span className="small muted">{n}</span>
                    <div className={'bar' + (i === 0 ? ' now' : '')} style={{ height: Math.max(4, (n / maxFc) * 90) }} />
                    <span className="small muted">{new Date(today.getTime() + i * DAY).getDate()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export function Stats({ go, tab }: { go: (r: Route) => void; tab?: StatsTab }) {
  const data = useData();
  const showMap = data.settings.features.map && tab === 'map';
  const [period, setPeriod] = useState<7 | 30 | 3650>(30);
  const f = data.settings.features;
  const tabOptions: { value: NonNullable<StatsTab>; label: string }[] = [
    { value: 'numbers', label: 'Цифры' },
    ...(f.map ? [{ value: 'map' as const, label: 'Карта знаний' }] : [])
  ];
  const current: StatsTab = tab && tabOptions.some((o) => o.value === tab) ? tab : 'numbers';
  const tabs = tabOptions.length > 1 && (
    <div className="tabs-narrow wide-tabs">
      <Segmented ariaLabel="Раздел статистики" value={current} onChange={(v) => go({ name: 'stats', tab: v })} options={tabOptions} />
    </div>
  );

  if (showMap || current === 'map') {
    return (
      <div className="page wide">
        <h1 className="display">Карта знаний</h1>
        {tabs}
        <KnowledgeMap data={data} onOpenTopic={(id) => go({ name: 'topic', id })} />
      </div>
    );
  }
  return <Numbers data={data} go={go} tabs={tabs} period={period} onPeriod={setPeriod} />;
}
