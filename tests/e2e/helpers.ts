// Общее для сквозных проверок: данные для старта, открыть экран, проверить, что прямоугольники не налезают.
import { expect, type Page } from '@playwright/test';

const T0 = '2026-09-01T10:00:00.000Z';
type Obj = Record<string, unknown>;
const topic = (id: string, subjectId: string, name: string, extra: Obj = {}) => ({ id, subjectId, name, note: `# ${name}\n\nТекст конспекта про «${name}».`, createdAt: T0, updatedAt: T0, ...extra });

/** 1×1 PNG — фото «страницы учебника» для просмотра страниц. */
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export interface SeedOptions {
  onboarded?: boolean;
  /** Сколько фото страниц у темы «Параллелограмм» (для просмотра страниц). */
  pages?: number;
  theme?: 'light' | 'dark';
  /** Изменить данные перед запуском. */
  patch?: (d: Obj) => void;
}

/** «Геометрия» с вложенными темами и длинными названиями и «Биология» (как в e2e/v132-seed.mjs). */
export function seedData(o: SeedOptions = {}) {
  const pages = Array.from({ length: o.pages ?? 0 }, (_, i) => ({ n: i + 1, img: PIXEL }));
  const topics = [
    topic('g1', 'geo', 'Четырёхугольники', { order: 1 }),
    topic('g2', 'geo', 'Параллелограмм', { parentId: 'g1', order: 1, pages, note: '# Параллелограмм\n\nПараллелограмм — это четырёхугольник, у которого противоположные стороны попарно параллельны. [стр. 1]\n\nСвойства параллелограмма.' }),
    topic('g3', 'geo', 'Прямоугольник, ромб и квадрат: свойства, признаки и задачи на доказательство', { parentId: 'g1', order: 2 }),
    topic('g4', 'geo', 'Трапеция и средняя линия трапеции', { parentId: 'g1', order: 3 }),
    topic('g5', 'geo', 'Теорема Фалеса', { parentId: 'g4', order: 1 }),
    topic('g6', 'geo', 'Площади многоугольников', { order: 2 }),
    topic('b1', 'bio', '§1. Зоология — наука о животных', { order: 1 }),
    topic('b2', 'bio', '§2. Простейшие: амёба, эвглена, инфузория-туфелька', { order: 2 })
  ];
  const cards: Obj[] = [];
  let n = 0;
  for (const t of topics) for (let i = 0; i < (t.id === 'g1' ? 4 : 3); i++) cards.push({ id: 'c' + ++n, topicId: t.id, type: 'basic', front: `Вопрос ${n} по теме «${t.name}»?`, back: `Ответ ${n}`, createdAt: T0, updatedAt: T0 });
  const d: Obj = {
    version: 1,
    subjects: [
      { id: 'geo', name: 'Геометрия', color: '#3366CC', icon: '📐', createdAt: T0, order: 1 },
      { id: 'bio', name: 'Биология', color: '#2BA36B', icon: '🧬', createdAt: T0, order: 2 }
    ],
    topics,
    cards,
    states: {},
    logs: [],
    tests: [],
    settings: { onboarded: o.onboarded ?? true, theme: o.theme ?? 'light', features: { ai: true } }
  };
  o.patch?.(d);
  return d;
}

export type Where = { name: string; id?: string; tab?: string };

/**
 * Открыть Refrain с данными. Данные кладутся один раз за вкладку (до первой загрузки), поэтому после page.reload()
 * видно то, что сохранило само приложение, — так проверяется восстановление после перезагрузки.
 */
export async function openApp(page: Page, where: Where = { name: 'today' }, o: SeedOptions & { dev?: boolean; fresh?: boolean } = {}) {
  const data = o.fresh ? null : seedData(o);
  await page.addInitScript(
    ({ data, where, dev }) => {
      if (sessionStorage.getItem('e2e-seeded')) return;
      sessionStorage.setItem('e2e-seeded', '1');
      sessionStorage.setItem('mnema-web-test-ok', '1');
      sessionStorage.setItem('refrain-no-splash', String(Date.now()));
      if (data) localStorage.setItem('mnema-data-pending', JSON.stringify(data));
      if (dev) localStorage.setItem('refrain-dev', '1');
      localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: where, at: Date.now() } }));
    },
    { data, where, dev: Boolean(o.dev) }
  );
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export const intersects = (a: Rect, b: Rect, slack = 0.5) => a.left < b.right - slack && b.left < a.right - slack && a.top < b.bottom - slack && b.top < a.bottom - slack;

/**
 * Пункты меню (или любые элементы) не налезают друг на друга: ни сами кнопки, ни их текст.
 * Возвращает список наложений с подписями — пустой, если всё хорошо.
 */
export async function overlaps(page: Page, itemSelector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const items = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((e) => e.getClientRects().length);
    const out: string[] = [];
    const rect = (e: Element) => e.getBoundingClientRect();
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    // Текст: каждая строка текста внутри пункта (через Range) должна лежать внутри своего пункта.
    const textBoxes = (el: HTMLElement) => {
      const boxes: DOMRect[] = [];
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        if (!t.textContent?.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(t);
        boxes.push(...Array.from(r.getClientRects()));
      }
      return boxes;
    };
    for (let i = 0; i < items.length; i++) {
      const a = rect(items[i]);
      for (const tb of textBoxes(items[i])) if (tb.bottom > a.bottom + 1 || tb.top < a.top - 1) out.push(`текст «${items[i].innerText.slice(0, 30)}» вылезает из пункта`);
      for (let j = i + 1; j < items.length; j++) if (hit(a, rect(items[j]))) out.push(`«${items[i].innerText.slice(0, 30)}» налезает на «${items[j].innerText.slice(0, 30)}»`);
    }
    return out;
  }, itemSelector);
}

export async function box(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e || !e.getClientRects().length) return null;
    const r = e.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
}

/** Подмена visualViewport: «экранная клавиатура» высотой px снизу (у Playwright нет настоящей). */
export function fakeKeyboardScript() {
  const vv = new EventTarget() as EventTarget & { offsetTop: number; offsetLeft: number; scale: number; kb: number; height: number; width: number };
  vv.offsetTop = 0;
  vv.offsetLeft = 0;
  vv.scale = 1;
  vv.kb = 0;
  Object.defineProperty(vv, 'height', { get: () => window.innerHeight - vv.kb });
  Object.defineProperty(vv, 'width', { get: () => window.innerWidth });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  (window as unknown as { __kb: (px: number) => void }).__kb = (px: number) => {
    vv.kb = px;
    vv.dispatchEvent(new Event('resize'));
  };
}

/** Системные панели телефона: подменяем отступы безопасной зоны (env() в Chromium без выреза всегда 0). */
export async function fakeSafeArea(page: Page, inset: { top?: number; bottom?: number; left?: number; right?: number }) {
  await page.addStyleTag({
    content: `:root { --native-top: ${inset.top ?? 0}px !important; --native-bottom: ${inset.bottom ?? 0}px !important; --native-left: ${inset.left ?? 0}px !important; --native-right: ${inset.right ?? 0}px !important; }`
  });
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 720 || (page.viewportSize()?.height ?? 800) <= 500;
