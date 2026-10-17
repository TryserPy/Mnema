// Консоль разработчика (1.32): журнал (уровни, поиск, ×N), сеть (без секретов), данные, версия и функции, FPS и долгие задачи.
// Грузится только в режиме разработчика (devMode.ts); на телефоне — нижний лист с крупным текстом.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { clearNet, devOn, netEntries, onDev, setDev } from '../devMode';
import { clearLog, logEntries, onLog, openReportProblem, type LogLevel } from '../refrain';
import { getData } from '../store';
import { APP_VERSION } from '../update';
import { Modal, Segmented, toast } from './ui';

type Tab = 'log' | 'net' | 'data' | 'perf';
const LEVEL_NAME: Record<LogLevel, string> = { error: 'ошибка', warn: 'внимание', info: 'событие' };

function useTick(sub: (cb: () => void) => () => void): number {
  const [n, setN] = useState(0);
  useEffect(() => sub(() => setN((x) => x + 1)), [sub]);
  return n;
}

/** Плавающая кнопка «🐞» и сама консоль — только в режиме разработчика. */
export function DevConsoleHost() {
  const on = useSyncExternalStore(onDev, devOn, () => false);
  const [open, setOpen] = useState(false);
  if (!on) return null;
  return (
    <>
      <button className="dev-fab" aria-label="Консоль разработчика" title="Консоль разработчика" onClick={() => setOpen(true)}>
        🐞
      </button>
      {open && <DevConsole onClose={() => setOpen(false)} />}
    </>
  );
}

function text(lines: string[]): string {
  return `Refrain ${APP_VERSION} · ${window.mnemaApi?.platform ?? 'web'} · ${navigator.userAgent}\n${lines.join('\n')}`;
}

export function DevConsole({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('log');
  const [level, setLevel] = useState<LogLevel | 'all'>('all');
  const [q, setQ] = useState('');
  useTick(onLog);
  useTick(onDev);
  const entries = logEntries();
  const shown = entries.filter((e) => (level === 'all' || e.level === level) && (!q || e.text.toLowerCase().includes(q.toLowerCase())));
  const lines = shown.map((e) => `${new Date(e.at).toTimeString().slice(0, 8)} [${LEVEL_NAME[e.level]}] ${e.text}${e.n > 1 ? ` ×${e.n}` : ''}`);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text(lines));
      toast('Журнал скопирован');
    } catch {
      toast('Не получилось скопировать');
    }
  };
  const share = async () => {
    const t = text(lines);
    const nav = navigator as Navigator & { share?: (d: { text: string; title: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: 'Журнал Refrain', text: t });
        return;
      } catch {
        /* отменили или нельзя — сохраним файлом */
      }
    }
    const { downloadFile } = await import('../share');
    downloadFile(`refrain-журнал-${Date.now()}.txt`, t, 'text/plain');
  };

  return (
    <Modal title="Консоль разработчика" onClose={onClose} width={760}>
      <div className="stack gap12 dev-console" data-part="dev-console">
        <Segmented<Tab>
          ariaLabel="Раздел"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'log', label: `Журнал (${entries.length})` },
            { value: 'net', label: 'Сеть' },
            { value: 'data', label: 'Данные' },
            { value: 'perf', label: 'Скорость' }
          ]}
        />
        {tab === 'log' && (
          <>
            <div className="row gap8 wrap">
              <select className="input dev-level" value={level} onChange={(e) => setLevel(e.target.value as LogLevel | 'all')} aria-label="Уровень">
                <option value="all">Все</option>
                <option value="error">Ошибки</option>
                <option value="warn">Внимание</option>
                <option value="info">События</option>
              </select>
              <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск в журнале" aria-label="Поиск в журнале" />
            </div>
            <pre className="dev-log" aria-live="polite">{lines.length ? lines.join('\n') : 'Пока пусто — ошибки и события появятся здесь.'}</pre>
            <div className="row gap8 wrap">
              <button className="btn small" onClick={() => void copy()}>
                Скопировать
              </button>
              <button className="btn small" onClick={() => void share()}>
                Поделиться
              </button>
              <button className="btn small" onClick={() => openReportProblem({ category: 'other', error: lines.slice(-1)[0] })}>
                Прикрепить к жалобе
              </button>
              <button className="btn small ghost" onClick={clearLog}>
                Очистить
              </button>
            </div>
          </>
        )}
        {tab === 'net' && <NetTab />}
        {tab === 'data' && <DataTab />}
        {tab === 'perf' && <PerfTab />}
        <div className="row gap8">
          <span className="grow small muted">Режим разработчика · Refrain {APP_VERSION}. Ничего не отправляется наружу без твоего нажатия.</span>
          <button
            className="btn small ghost danger"
            onClick={() => {
              setDev(false);
              onClose();
            }}
          >
            Выключить
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NetTab() {
  useTick(onDev);
  const list = [...netEntries()].reverse();
  return (
    <>
      <div className="dev-net" role="list">
        {list.length === 0 && <span className="small muted">Запросов пока не было. Адреса показываются без ключей, токенов и почты; заголовки и тела не запоминаются.</span>}
        {list.map((e, i) => (
          <div key={i} role="listitem" className={'dev-net-row' + (e.status === 0 || e.status >= 400 ? ' bad' : '')}>
            <span className="mono">{new Date(e.at).toTimeString().slice(0, 8)}</span>
            <span className="mono">{e.method}</span>
            <span className="mono dev-status">{e.status || '—'}</span>
            <span className="mono">{e.ms} мс</span>
            <span className="mono dev-url">{e.url}</span>
          </div>
        ))}
      </div>
      <div>
        <button className="btn small ghost" onClick={clearNet}>
          Очистить
        </button>
      </div>
    </>
  );
}

function DataTab() {
  const d = getData();
  const size = useMemo(() => JSON.stringify(d).length, [d]);
  const features = Object.entries(d.settings.features ?? {});
  let lsKeys: string[] = [];
  try {
    lsKeys = Object.keys(localStorage).sort();
  } catch {
    /* нет доступа */
  }
  const rows: [string, string][] = [
    ['Версия', APP_VERSION],
    ['Платформа', window.mnemaApi?.platform ?? 'web'],
    ['Экран', `${window.innerWidth}×${window.innerHeight} · ${devicePixelRatio}x`],
    ['Данные', `${Math.round(size / 1024)} КБ`],
    ['Предметы / темы / карточки', `${d.subjects.length} / ${d.topics.length} / ${d.cards.length}`],
    ['Повторений в журнале', String(d.logs.length)],
    ['Облако', d.settings.cloud ? `${d.settings.cloud.kind ?? 'webdav'}${d.settings.cloud.lastAt ? ', ' + new Date(d.settings.cloud.lastAt).toLocaleString('ru-RU') : ''}` : 'нет'],
    ['Ключи localStorage (без значений)', lsKeys.join(', ') || '—']
  ];
  return (
    <div className="stack gap8">
      <table className="dev-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <strong className="small">Функции</strong>
      <div className="row gap8 wrap small">
        {features.map(([k, v]) => (
          <span key={k} className={'dev-flag' + (v ? ' on' : '')}>
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

/** FPS считаются только пока открыта эта вкладка (requestAnimationFrame), чтобы консоль сама не нагружала приложение. */
function PerfTab() {
  const [fps, setFps] = useState(0);
  const [worst, setWorst] = useState(0);
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let start = performance.now();
    let prev = start;
    let gap = 0;
    const loop = (t: number) => {
      frames++;
      gap = Math.max(gap, t - prev);
      prev = t;
      if (t - start >= 1000) {
        setFps(Math.round((frames * 1000) / (t - start)));
        setWorst(Math.round(gap));
        frames = 0;
        gap = 0;
        start = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  const longs = logEntries().filter((e) => e.text.startsWith('долгая задача'));
  return (
    <div className="stack gap8">
      <div className="row gap16 wrap">
        <div className="stack">
          <span className="kpi-num">{fps}</span>
          <span className="small muted">кадров в секунду</span>
        </div>
        <div className="stack">
          <span className="kpi-num">{worst}</span>
          <span className="small muted">мс — самый долгий кадр</span>
        </div>
        {mem && (
          <div className="stack">
            <span className="kpi-num">{Math.round(mem.usedJSHeapSize / 1048576)}</span>
            <span className="small muted">МБ памяти JS</span>
          </div>
        )}
      </div>
      <span className="small muted">Долгих задач (больше 120 мс) в журнале: {longs.reduce((n, e) => n + e.n, 0)}.</span>
    </div>
  );
}
