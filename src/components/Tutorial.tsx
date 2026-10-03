// Знакомство «как в играх»: подсвечивает нужное место, а человек делает всё сам — создаёт предмет, тему, пишет конспект, делает карточку.
// Шаг засчитывается, когда действие правда сделано (появился предмет, тема, карточка…). Всегда можно «Пропустить шаг» или «Выйти».
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getData, updateSettings, useData } from '../store';
import type { AppData, Route } from '../types';
import { Icon, selHow, toast } from './ui';
import '../guide.css';

// Состояние живёт вне компонента: при переходе в повторение приложение перерисовывается целиком, а знакомство должно продолжаться.
let stepNow: number | null = null;
let baseNow = { subjects: 0, topics: 0, cards: 0 };
const subs = new Set<() => void>();
const setStepNow = (v: number | null | ((o: number | null) => number | null)) => {
  stepNow = typeof v === 'function' ? v(stepNow) : v;
  subs.forEach((f) => f());
};

/** Начать интерактивное знакомство (из «Знакомства», «Справки», «О Мнеме»). */
export function startTutorial() {
  const d = getData();
  baseNow = { subjects: d.subjects.length, topics: topicsCount(d), cards: d.cards.length };
  setStepNow(0);
}

interface Ctx {
  data: AppData;
  route: Route;
  base: { subjects: number; topics: number; cards: number };
}

const q = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);
const byText = (sel: string, text: string): HTMLElement | null => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => (e.textContent ?? '').includes(text)) ?? null;
const createBtn = () => q('.tab-plus') ?? q('.sidebar .create-btn');
const menuOpen = () => Boolean(q('.modal .create-item'));
const dialogTitle = () => q('.modal h2')?.textContent ?? '';
const topicsCount = (d: AppData) => d.topics.filter((t) => !t.kind).length;

interface Step {
  id: string;
  text: ReactNode;
  hint?: ReactNode;
  target: (c: Ctx) => HTMLElement | null;
  done: (c: Ctx) => boolean;
  /** Последний шаг: ждёт кнопки «Закончить», а не действия. */
  last?: boolean;
}

const STEPS: Step[] = [
  {
    id: 'create',
    text: 'Нажми «Создать» — отсюда создаётся всё.',
    target: (c) => (c.data.subjects.length > c.base.subjects ? null : createBtn()),
    done: (c) => menuOpen() || c.data.subjects.length > c.base.subjects
  },
  {
    id: 'subject-item',
    text: 'Выбери «Новый предмет».',
    target: () => byText('.modal .create-item', 'Новый предмет'),
    done: (c) => dialogTitle() === 'Новый предмет' || c.data.subjects.length > c.base.subjects
  },
  {
    id: 'subject',
    text: 'Назови предмет — например, «Биология» — и нажми «Создать».',
    target: (c) => (c.data.subjects.length > c.base.subjects ? null : q('.modal')),
    done: (c) => c.data.subjects.length > c.base.subjects
  },
  {
    id: 'topic',
    text: 'Теперь тема — один параграф или раздел. Нажми «Создать» → «Новая тема», назови её и нажми «Создать».',
    hint: 'Например: «§1 Клетка».',
    target: (c) => (menuOpen() ? byText('.modal .create-item', 'Новая тема') : dialogTitle() === 'Новая тема' ? q('.modal') : topicsCount(c.data) > c.base.topics ? null : createBtn()),
    done: (c) => topicsCount(c.data) > c.base.topics && c.route.name === 'topic'
  },
  {
    id: 'note',
    text: 'Напиши в конспекте пару предложений своими словами — главное из темы.',
    hint: 'Не переписывай учебник: своими словами запоминается лучше.',
    target: () => q('.ProseMirror'),
    done: (c) => {
      const t = c.route.name === 'topic' ? c.data.topics.find((x) => x.id === (c.route as { id: string }).id) : undefined;
      return Boolean(t && t.note.trim().length >= 25);
    }
  },
  {
    id: 'card',
    text: <>Сделай карточку: {selHow('В карточку')}. Потом нажми «Сохранить».</>,
    hint: 'Одна карточка — один факт.',
    target: () => q('.modal') ?? q('.ProseMirror'),
    done: (c) => c.data.cards.length > c.base.cards
  },
  {
    id: 'learn',
    text: 'Теперь повторение. Вернись на «Сегодня» и нажми «Учиться».',
    target: (c) => (c.route.name === 'today' ? q('.hero-btn') : byText('.tab', 'Учусь') ?? byText('.nav-item', 'Сегодня')),
    done: (c) => c.route.name === 'review'
  },
  {
    id: 'done',
    last: true,
    text: 'Готово! Так выглядит повторение: сначала вспомни ответ сам, потом открой и честно оцени. Мнема сама решит, когда показать карточку снова.',
    target: () => null,
    done: () => false
  }
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function TutorialHost({ route }: { route: Route }) {
  const data = useData();
  const step = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => stepNow
  );
  const setStep = setStepNow;
  const [rect, setRect] = useState<Rect | null>(null);
  const [tick, setTick] = useState(0);
  const advancing = useRef(false);

  const finish = (completed: boolean) => {
    setStep(null);
    setRect(null);
    if (!getData().settings.onboarded) updateSettings({ onboarded: true });
    if (completed) toast('Знакомство пройдено. Справка и знакомство — в «Профиле»');
  };

  // Раз в четверть секунды смотрим на экран: шаг сделан? где подсвечивать?
  useEffect(() => {
    if (step === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [step]);

  const cur = step === null ? null : STEPS[step];
  const ctx: Ctx = { data, route, base: baseNow };
  useEffect(() => {
    if (step === null || !cur) return;
    if (!cur.last && !advancing.current && cur.done(ctx)) {
      advancing.current = true;
      // Даём увидеть, что получилось, и только потом идём дальше.
      setTimeout(() => {
        advancing.current = false;
        setStep((s) => (s === null ? s : Math.min(s + 1, STEPS.length - 1)));
      }, 450);
    }
    const el = cur.target(ctx);
    if (el) {
      const r = el.getBoundingClientRect();
      const next = { x: r.left, y: r.top, w: r.width, h: r.height };
      setRect((o) => (o && Math.abs(o.x - next.x) < 1 && Math.abs(o.y - next.y) < 1 && Math.abs(o.w - next.w) < 1 && Math.abs(o.h - next.h) < 1 ? o : next));
    } else setRect(null);
  }, [step, tick, data, route]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === null || !cur) return null;
  const vh = window.innerHeight;
  const phone = window.innerWidth < 720;
  // Подсказку держим там, где она не закрывает то, что подсвечено.
  const top = rect ? rect.y + rect.h / 2 > vh / 2 : false;
  return (
    <div className="tut" aria-live="polite">
      {rect && <div className="tut-ring" style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12 }} />}
      <div className={'tut-card' + (top ? ' at-top' : '') + (phone ? ' phone' : '')} role="dialog" aria-label="Знакомство">
        <div className="tut-step">
          Шаг {step + 1} из {STEPS.length}
          <span className="tut-bar">
            <i style={{ width: ((step + 1) / STEPS.length) * 100 + '%' }} />
          </span>
        </div>
        <p className="tut-text">{cur.text}</p>
        {cur.hint && <p className="small muted tut-hint">{cur.hint}</p>}
        <div className="tut-btns">
          <button className="btn ghost small" onClick={() => finish(false)}>
            Выйти
          </button>
          {cur.last ? (
            <button className="btn primary small" onClick={() => finish(true)}>
              <Icon name="check" size={16} /> Закончить
            </button>
          ) : (
            <button className="btn small" onClick={() => setStep(Math.min(step + 1, STEPS.length - 1))}>
              Пропустить шаг
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
