import { useMemo, useState } from 'react';
import { Garden } from '../components/Garden';
import { KnowledgeMap } from '../components/lazy';
import { AnimatedNumber, Icon, plural, Segmented } from '../components/ui';
import { achievements, bestStreak, weekSummary } from '../progress';
import { dayKey, dayStart, DAY, forecast, streak } from '../srs';
import { useData } from '../store';
import type { AppData, Route } from '../types';

type StatsTab = 'numbers' | 'map' | 'garden' | 'awards' | undefined;

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
          <div style={{ width: 240 }}>
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

function Awards({ data }: { data: AppData }) {
  const now = new Date();
  const list = achievements(data, now);
  const got = list.filter((a) => a.got).length;
  const cur = streak(data, now);
  const best = Math.max(bestStreak(data), cur);
  return (
    <div className="stack gap16">
      <div className="streak-hero">
        <div className="stack gap4">
          <span className="muted small">Серия сейчас</span>
          <span className="kpi-num">
            🔥 <AnimatedNumber value={cur} /> {plural(cur, 'день', 'дня', 'дней')}
          </span>
        </div>
        <div className="stack gap4">
          <span className="muted small">Лучшая серия</span>
          <span className="kpi-num">{best}</span>
        </div>
        <div className="stack gap4">
          <span className="muted small">Получено</span>
          <span className="kpi-num">
            {got} <small>из {list.length}</small>
          </span>
        </div>
      </div>
      <div className="awards">
        {list.map((a, i) => (
          <div key={a.id} className={'award' + (a.got ? ' got' : '')} style={{ animationDelay: Math.min(i, 12) * 35 + 'ms' }}>
            <span className="award-ico">{a.icon}</span>
            <div className="stack gap4 grow">
              <strong>{a.title}</strong>
              <span className="small muted">{a.text}</span>
              {!a.got && a.progress && (
                <span className="progress full" title={`${a.progress[0]} из ${a.progress[1]}`}>
                  <span style={{ width: (a.progress[0] / a.progress[1]) * 100 + '%' }} />
                </span>
              )}
            </div>
            {a.got && <span className="award-ok">✓</span>}
          </div>
        ))}
      </div>
      <p className="small muted">Серия считается по дням, когда ты ответил хотя бы на одну карточку. День начинается в {data.settings.dayStartHour}:00.</p>
    </div>
  );
}

export function Stats({ go, tab }: { go: (r: Route) => void; tab?: StatsTab }) {
  const data = useData();
  const showMap = data.settings.features.map && tab === 'map';
  const [period, setPeriod] = useState<7 | 30 | 3650>(30);
  const now = useMemo(() => new Date(), [data]);
  const hour = data.settings.dayStartHour;
  const since = dayStart(now, hour).getTime() - (period - 1) * DAY;
  const logs = data.logs.filter((l) => new Date(l.at).getTime() >= since);

  // Реальное запоминание: доля ответов «не Снова» среди карточек, которые были в состоянии Review.
  const matured = logs.filter((l) => l.prevState === 2);
  const retention = matured.length ? Math.round((matured.filter((l) => l.rating > 1).length / matured.length) * 100) : null;
  const minutes = Math.round(logs.reduce((a, l) => a + l.ms, 0) / 60_000);
  const learned = Object.values(data.states).filter((s) => s.state === 2).length;
  const overconf = logs.filter((l) => l.confidence === 2 && l.rating === 1).length;
  const confLogs = logs.filter((l) => l.confidence !== undefined);

  // Тепловая карта за 16 недель.
  const perDay = new Map<string, number>();
  for (const l of data.logs) {
    const k = dayKey(new Date(l.at), hour);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const today = dayStart(now, hour);
  const cells: { key: string; n: number; label: string }[] = [];
  for (let i = 16 * 7 - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    const k = dayKey(d, hour);
    cells.push({ key: k, n: perDay.get(k) ?? 0, label: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) });
  }
  const level = (n: number) => (n === 0 ? 0 : n < 10 ? 1 : n < 30 ? 2 : 3);

  // Слабые темы: наименьшая доля верных ответов (минимум 5 ответов за период).
  const byTopic = new Map<string, { total: number; ok: number }>();
  for (const l of logs) {
    const x = byTopic.get(l.topicId) ?? { total: 0, ok: 0 };
    x.total++;
    if (l.rating > 1) x.ok++;
    byTopic.set(l.topicId, x);
  }
  const weak = [...byTopic.entries()]
    .filter(([, v]) => v.total >= 5)
    .map(([id, v]) => ({ topic: data.topics.find((t) => t.id === id), pct: Math.round((v.ok / v.total) * 100) }))
    .filter((x) => x.topic)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5);

  const fc = forecast(data, now, 14);
  const maxFc = Math.max(1, ...fc);

  const f = data.settings.features;
  const tabOptions: { value: NonNullable<StatsTab>; label: string }[] = [
    { value: 'numbers', label: 'Цифры' },
    ...(f.awards ? [{ value: 'awards' as const, label: 'Достижения' }] : []),
    ...(f.garden ? [{ value: 'garden' as const, label: 'Сад знаний' }] : []),
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
  if (current === 'garden') {
    return (
      <div className="page wide">
        <h1 className="display">Сад знаний</h1>
        {tabs}
        <Garden data={data} go={go} />
      </div>
    );
  }
  if (current === 'awards') {
    return (
      <div className="page">
        <h1 className="display">Достижения</h1>
        {tabs}
        <Awards data={data} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="row between end-align">
        <h1 className="display">Статистика</h1>
        <div style={{ width: 340 }}>
          <Segmented
            ariaLabel="Период"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 7, label: 'Неделя' },
              { value: 30, label: 'Месяц' },
              { value: 3650, label: 'Всё время' }
            ]}
          />
        </div>
      </div>

      {tabs}
      {f.weekly && <WeekCard data={data} go={go} />}

      <div className="kpis">
        <div className="kpi">
          <span className="muted small">Запоминание</span>
          <span className="kpi-num">{retention === null ? '—' : <AnimatedNumber value={retention} />}{retention === null ? '' : '%'}</span>
          <span className="small muted">{retention === null ? 'появится, когда карточки начнут возвращаться через дни' : `цель ${Math.round(data.settings.retention * 100)}%`}</span>
        </div>
        <div className="kpi">
          <span className="muted small">Ответов</span>
          <span className="kpi-num">
            <AnimatedNumber value={logs.length} />
          </span>
          <span className="small muted">{minutes < 1 && logs.length ? 'меньше минуты' : `${minutes} мин`}</span>
        </div>
        <div className="kpi">
          <span className="muted small">Выучено</span>
          <span className="kpi-num">
            <AnimatedNumber value={learned} />
          </span>
          <span className="small muted">элементов в долгом повторении</span>
        </div>
        <div className="kpi">
          <span className="muted small">Ошибки «с уверенностью»</span>
          <span className="kpi-num">{overconf}</span>
          <span className="small muted">из {confLogs.length} ответов с оценкой уверенности</span>
        </div>
      </div>

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
          <h3>Прогноз на 2 недели</h3>
          <div className="bars tall">
            {fc.map((n, i) => (
              <div key={i} className="bar-col">
                <span className="small muted">{n}</span>
                <div className={'bar' + (i === 0 ? ' now' : '')} style={{ height: Math.max(4, (n / maxFc) * 90) }} />
                <span className="small muted">{new Date(today.getTime() + i * DAY).getDate()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card stack gap12">
          <h3>Слабые темы</h3>
          {weak.length === 0 && <span className="muted small">Появятся, когда в теме наберётся хотя бы 5 ответов за период.</span>}
          {weak.map(({ topic, pct }) => (
            <button key={topic!.id} className="weak-row" onClick={() => go({ name: 'topic', id: topic!.id })}>
              <span className="row between">
                <span>{topic!.name}</span>
                <span className="strong">{pct}%</span>
              </span>
              <span className="progress full">
                <span style={{ width: pct + '%', background: pct < 75 ? 'var(--again-ink)' : pct < 85 ? 'var(--hard-ink)' : 'var(--good-ink)' }} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
