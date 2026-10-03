// «Показать, где это»: из справки ведёт на нужный экран и подсвечивает кнопку или строку — по шагам, с подписью.
// Тот же вид, что у знакомства (кольцо + подсказка), но человек ничего не обязан делать: «Дальше» / «Понятно».
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Route } from '../types';
import { byText, cardPlace, q } from './Tutorial';
import { Icon } from './ui';
import '../guide.css';

export interface WhereStep {
  /** Куда перейти перед шагом (необязательно). */
  go?: Route;
  /** Что подсветить: CSS-селектор, «селектор|текст» (элемент с таким текстом) или функция. */
  target?: string | (() => HTMLElement | null);
  text: string;
}

let tour: WhereStep[] | null = null;
const subs = new Set<() => void>();
const set = (v: WhereStep[] | null) => {
  tour = v;
  subs.forEach((f) => f());
};
/** Начать показ. */
export const showWhere = (steps: WhereStep[]) => set(steps.length ? steps : null);

function find(t: WhereStep['target']): HTMLElement | null {
  if (!t) return null;
  if (typeof t === 'function') return t();
  const [sel, text] = t.split('|');
  return text ? byText(sel, text) : q(sel);
}

export function ShowMeHost({ go }: { go: (r: Route) => void }) {
  const steps = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => tour
  );
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => setI(0), [steps]);
  const step = steps?.[i];
  // Переходим на нужный экран и ищем, что подсветить (экран может открываться не сразу).
  useEffect(() => {
    if (!step) return;
    if (step.go) go(step.go);
    setRect(null);
    setMissing(false);
    let tries = 0;
    let scrolled = false;
    const id = setInterval(() => {
      const el = find(step.target);
      if (el) {
        if (!scrolled) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          scrolled = true;
        }
        const r = el.getBoundingClientRect();
        setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
      } else if (++tries > 12 && step.target) setMissing(true);
    }, 200);
    return () => clearInterval(id);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!steps || !step) return null;
  const last = i === steps.length - 1;
  const phone = window.innerWidth < 720;
  return (
    <div className="tut show-me" aria-live="polite">
      {rect && <div className="tut-ring" style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12 }} />}
      <div className={'tut-card' + (phone ? ' phone' : '')} style={cardPlace(rect, phone)} role="dialog" aria-label="Где это">
        {steps.length > 1 && (
          <div className="tut-step">
            {i + 1} из {steps.length}
            <span className="tut-bar">
              <i style={{ width: ((i + 1) / steps.length) * 100 + '%' }} />
            </span>
          </div>
        )}
        <p className="tut-text">{step.text}</p>
        {missing && <p className="small muted tut-hint">Здесь этого пока нет — например, нужна хотя бы одна тема, или функция есть только в приложении на компьютере или телефоне.</p>}
        <div className="tut-btns">
          <button className="btn ghost small" onClick={() => set(null)}>
            Закрыть
          </button>
          {last ? (
            <button className="btn primary small" onClick={() => set(null)}>
              <Icon name="check" size={16} /> Понятно
            </button>
          ) : (
            <button className="btn primary small" onClick={() => setI(i + 1)}>
              Дальше
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
