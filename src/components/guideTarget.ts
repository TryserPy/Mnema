// Общее для знакомства (Tutorial) и «Где это?» (ShowMe): следить за тем, что подсвечивать, без опроса по таймеру.
// Экран поменялся (появился или пропал элемент, окно, сменился класс) — один раз за кадр пересчитываем подсказку;
// размер элемента или окна изменился — пересчитываем положение рамки. Пока ничего не меняется, ничего и не считается.
// Пока что-то движется (окно «выезжает», список прокручивается), рамка читает место цели каждый кадр и не отстаёт.
// Чистые расчёты (счёт действий, нужна ли прокрутка) — тоже здесь, без DOM; тесты: src/v130-guide.test.ts.
import { useEffect, useLayoutEffect, useState } from 'react';

/** Крупные шаги знакомства: в плашке рядом с номером — «Шаг 4 из 11 · Карточка». */
export const MAJORS = ['Предмет', 'Тема', 'Конспект', 'Карточка', 'Повторение'];

/**
 * Сколько действий в каждом крупном шаге, если идти главным путём.
 * Предмет: открыть «Создать» → выбрать «Новый предмет» → назвать и создать. Тема: то же самое.
 * Конспект: написать (после создания темы она уже открыта). Карточка: выделить и «В карточку» → заполнить и сохранить.
 * Повторение: уйти на «Сегодня» → «Учиться».
 */
export const ACTIONS = [3, 3, 1, 2, 2];

/** Всего действий на главном пути — это «М» в «Шаг N из М». */
export const TOTAL_ACTIONS = ACTIONS.reduce((a, b) => a + b, 0);

/**
 * Номер действия (с единицы, сквозной) по тому, сколько действий осталось до конца крупного шага, считая текущее (`left`).
 * Идёшь главным путём — номер растёт на один. Ушёл в сторону (закрыл окно, вышел из темы) — осталось больше, и номер честно откатывается.
 */
export function actionNumber(major: number, left: number): number {
  const m = Math.max(0, Math.min(ACTIONS.length - 1, Math.floor(major) || 0));
  const before = ACTIONS.slice(0, m).reduce((a, b) => a + b, 0);
  const l = Math.max(1, Math.floor(left) || 1);
  return Math.max(1, Math.min(TOTAL_ACTIONS, before + ACTIONS[m] - l + 1));
}

/** Всё для плашки: номер, сколько всего, название крупного шага и доля для полоски. Экран «Готово» (крупный шаг после последнего) — «М из М». */
export function stepInfo(major: number, left: number): { n: number; total: number; title: string; pct: number } {
  if (major >= MAJORS.length) return { n: TOTAL_ACTIONS, total: TOTAL_ACTIONS, title: 'Готово', pct: 100 };
  const n = actionNumber(major, left);
  return { n, total: TOTAL_ACTIONS, title: MAJORS[Math.max(0, Math.floor(major))], pct: (n / TOTAL_ACTIONS) * 100 };
}

/**
 * Нужно ли прокрутить цель в видимую область: она частично за краем экрана или окна, где лежит.
 * Огромные цели (редактор конспекта выше экрана) не трогаем — иначе страница прыгала бы под пальцем.
 * `view` — видимая область (экран, суженный окном-родителем с прокруткой); `top`/`bottom` — полосы, занятые панелями приложения.
 */
export function needsScroll(r: Rect, view: Rect, top = 0, bottom = 0): boolean {
  const vTop = view.y + top;
  const vBottom = view.y + view.h - bottom;
  if (r.h > (vBottom - vTop) * 0.85) return false; // всё равно не поместится
  return r.y < vTop - 0.5 || r.y + r.h > vBottom + 0.5;
}

/**
 * Низкий экран (телефон на боку): сверху и снизу у окна заголовок, крестик и кнопки — плашка ложится сбоку от него, в свободное поле, если оно есть.
 * Возвращает место (слева и сверху — от края экрана, ширина) или null, когда сбоку тесно (тогда плашка уходит наверх, как раньше).
 * `cardH` — высота плашки при этой ширине неизвестна заранее, поэтому берём запасную: узкая плашка выше обычной.
 */
export function lowSidePlace(r: Rect, vw: number, gap = 12, minW = 130, maxW = 260): { left: number; top: number; width: number } | null {
  const leftSpace = r.x - gap;
  const rightSpace = vw - (r.x + r.w) - gap;
  const best = Math.max(leftSpace, rightSpace);
  if (best - 8 < minW || r.w < vw * 0.3) return null; // узкой цели (кнопка) и так найдётся место
  const width = Math.min(maxW, best - 8);
  const left = leftSpace >= rightSpace ? r.x - gap - width : r.x + r.w + gap;
  return { left: Math.max(8, Math.min(vw - width - 8, left)), top: 8, width: Math.min(width, vw - 16) };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Счётчик «на экране что-то поменялось» (не чаще раза за кадр). Изменения внутри самой подсказки (.tut) не считаются. */
export function useDomTick(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const bump = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          setTick((t) => t + 1);
        });
    };
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        const el = m.target instanceof Element ? m.target : m.target.parentElement;
        if (!el?.closest('.tut')) {
          bump();
          return;
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'hidden', 'aria-selected', 'aria-checked', 'open'] });
    window.addEventListener('resize', bump);
    window.addEventListener('scroll', bump, true);
    // Окно «выезжает» (animation/transform) — это не меняет ни класс, ни разметку, но место цели меняется: пересчитываем и при старте, и в конце.
    const onAnim = (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest('.tut')) bump();
    };
    const animEvents = ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend'];
    for (const n of animEvents) document.addEventListener(n, onAnim, true);
    return () => {
      mo.disconnect();
      window.removeEventListener('resize', bump);
      window.removeEventListener('scroll', bump, true);
      for (const n of animEvents) document.removeEventListener(n, onAnim, true);
      cancelAnimationFrame(raf);
    };
  }, [active]);
  return tick;
}

/** Рамки считаем одинаковыми, если все числа отличаются меньше чем на полпикселя (иначе рамка зря перерисовывается каждый кадр). */
export function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
}

const read = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect(); // уже с учётом transform (анимация окна), прокрутки, размера текста и масштаба
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** Сколько кадров подряд цель должна простоять на месте, чтобы перестать следить; и сколько максимум следим за один заход. */
const CALM_FRAMES = 10;
const WATCH_MIN = 400;
const WATCH_MAX = 3000;

/**
 * Положение элемента на экране. Читается сразу, при каждом `tick`, при изменении размера — а ещё, пока цель двигается
 * (окно выезжает, список едет), каждый кадр: рамка не отстаёт и не остаётся там, где элемент был в начале анимации.
 * Когда цель замерла (10 кадров подряд) — следить перестаём. Нет элемента — null.
 */
export function useRect(el: HTMLElement | null, tick: number): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (!el || !el.isConnected) return setRect((o) => (o === null ? o : null));
    const next = read(el);
    setRect((o) => (sameRect(o, next) ? o : next));
  }, [el, tick]);
  useEffect(() => {
    if (!el) return;
    let raf = 0;
    let calm = 0;
    let last: Rect | null = null;
    const t0 = performance.now();
    const frame = () => {
      raf = 0;
      if (!el.isConnected) return setRect((o) => (o === null ? o : null));
      const next = read(el);
      calm = sameRect(last, next) ? calm + 1 : 0;
      last = next;
      setRect((o) => (sameRect(o, next) ? o : next));
      const dt = performance.now() - t0;
      if ((calm < CALM_FRAMES || dt < WATCH_MIN) && dt < WATCH_MAX) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => setRect((o) => (sameRect(o, read(el)) ? o : read(el))));
      ro.observe(el);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [el, tick]);
  return el ? rect : null;
}
