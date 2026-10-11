// «Показать, где это»: из справки ведёт на нужный экран и подсвечивает кнопку или строку — по шагам, с подписью.
// Тот же вид, что у знакомства (кольцо + подсказка), но человек ничего не обязан делать: «Дальше» / «Понятно».
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Route } from '../types';
import { byText, cardPlace, q } from './Tutorial';
import { useDomTick, useRect } from './guideTarget';
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
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [missing, setMissing] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);
  useEffect(() => setI(0), [steps]);
  const step = steps?.[i];
  const tick = useDomTick(Boolean(step));
  const rect = useRect(el, tick);
  // Новый шаг: переходим на нужный экран (один раз).
  useEffect(() => {
    if (!step) return;
    if (step.go) go(step.go);
    elRef.current = null;
    setEl(null);
    setMissing(false);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  // Экран может открываться не сразу: ищем элемент при каждом изменении экрана (без опроса по таймеру); прокручиваем к нему один раз.
  useEffect(() => {
    if (!step?.target) return;
    const found = find(step.target);
    if (found === elRef.current) return;
    elRef.current = found;
    if (found) {
      found.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setMissing(false);
    }
    setEl(found);
  }, [step, tick]);
  // Нет такого на экране — через пару секунд честно говорим об этом.
  useEffect(() => {
    if (!step?.target || el) return;
    const t = setTimeout(() => setMissing(true), 2400);
    return () => clearTimeout(t);
  }, [step, el]);
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
