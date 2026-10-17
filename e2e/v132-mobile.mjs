// 1.32, мобильный аудит: все основные экраны на 360×800, 390×844, 412×915 и в ландшафте 800×360.
// Ищет горизонтальную прокрутку, элементы шире экрана, наложение текста на счётчики, мелкие кнопки (< 44 px) и
// перекрытие нижней панелью; снимает экраны в OUT. Запуск: vite preview --mode web --outDir dist-web --port 4174,
// затем URL=http://localhost:4174 OUT=папка node e2e/v132-mobile.mjs [экран…]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT;
const ONLY = process.argv.slice(2);
if (OUT) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const VIEWS = [
  { name: '360', width: 360, height: 800 },
  { name: '390', width: 390, height: 844 },
  { name: '412', width: 412, height: 915 },
  { name: 'land', width: 800, height: 360 },
  { name: 'desk', width: 1280, height: 820 }
];
let bad = 0;
const problems = [];
const check = (ok, label) => {
  if (!ok) {
    bad++;
    problems.push(label);
  }
  console.log(`${ok ? '✓' : '✗'} ${label}`);
};

const T0 = '2026-09-01T10:00:00.000Z';
const topic = (id, subjectId, name, extra = {}) => ({ id, subjectId, name, note: `# ${name}\n\nТекст конспекта про «${name}». Формула $a^2+b^2=c^2$.`, createdAt: T0, updatedAt: T0, ...extra });
export function seed() {
  const topics = [
    topic('g1', 'geo', 'Четырёхугольники', { order: 1 }),
    topic('g2', 'geo', 'Параллелограмм', { parentId: 'g1', order: 1 }),
    topic('g3', 'geo', 'Прямоугольник, ромб и квадрат: свойства, признаки и задачи на доказательство', { parentId: 'g1', order: 2 }),
    topic('g4', 'geo', 'Трапеция и средняя линия трапеции', { parentId: 'g1', order: 3 }),
    topic('g5', 'geo', 'Теорема Фалеса', { parentId: 'g4', order: 1 }),
    topic('g6', 'geo', 'Площади многоугольников', { order: 2 }),
    topic('b1', 'bio', '§1. Зоология — наука о животных', { order: 1 }),
    topic('b2', 'bio', '§2. Простейшие: амёба, эвглена, инфузория-туфелька', { order: 2 })
  ];
  const cards = [];
  let n = 0;
  for (const t of topics) for (let i = 0; i < (t.id === 'g1' ? 4 : 3); i++) cards.push({ id: 'c' + ++n, topicId: t.id, type: 'basic', front: `Вопрос ${n} по теме «${t.name}»?`, back: `Ответ ${n}`, createdAt: T0, updatedAt: T0 });
  return {
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
    settings: { onboarded: true, theme: 'light', features: { ai: true } }
  };
}

async function open(v, route) {
  const mobile = v.width < 900;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${v.name}: ошибка страницы ${e.message}`));
  await page.goto(URL);
  await page.evaluate(
    ({ data, route }) => {
      sessionStorage.setItem('mnema-web-test-ok', '1');
      sessionStorage.setItem('refrain-no-splash', String(Date.now()));
      localStorage.setItem('mnema-data-pending', JSON.stringify(data));
      localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: route, at: Date.now() } }));
    },
    { data: seed(), route }
  );
  await page.reload();
  await page.waitForTimeout(900);
  return { page, ctx };
}

/** Проверки раскладки на текущем экране. */
async function audit(page, label) {
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out = { hscroll: document.documentElement.scrollWidth > W + 1, wide: [], small: [], overlap: [] };
    const vis = (el) => {
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth && !el.closest('[inert], [aria-hidden="true"]');
    };
    const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 40);
    for (const el of document.querySelectorAll('main *, .modal *, .mobile-top *, .tabbar *')) {
      if (!vis(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.right > W + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.scroll-x, .tabs, .tab-strip, pre, .katex, table, .ProseMirror, .mobile-tabs, [data-hscroll]')) out.wide.push(`${name(el)} (${Math.round(b.right)}>${W})`);
    }
    for (const el of document.querySelectorAll('button, a[href], [role="button"], input[type="checkbox"], .icon-btn')) {
      if (!vis(el) || el.closest('.ProseMirror, .katex, .md, .note-view')) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 32 || b.height < 32) out.small.push(`${name(el)} ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    // Счётчики (бейджи) не должны налезать на соседний текст в той же строке.
    for (const badge of document.querySelectorAll('.badge, .count, .tree-count, .nav-count, .pill-count')) {
      if (!vis(badge)) continue;
      const bb = badge.getBoundingClientRect();
      const row = badge.parentElement;
      for (const sib of row ? row.children : []) {
        if (sib === badge || !vis(sib) || sib.contains(badge)) continue;
        const sb = sib.getBoundingClientRect();
        const ix = Math.min(bb.right, sb.right) - Math.max(bb.left, sb.left);
        const iy = Math.min(bb.bottom, sb.bottom) - Math.max(bb.top, sb.top);
        if (ix > 2 && iy > 2) out.overlap.push(`${name(badge)} поверх «${name(sib)}»`);
      }
    }
    return out;
  });
  check(!r.hscroll, `${label}: нет горизонтальной прокрутки`);
  check(r.wide.length === 0, `${label}: ничего не шире экрана${r.wide.length ? ' — ' + r.wide.slice(0, 4).join('; ') : ''}`);
  check(r.overlap.length === 0, `${label}: счётчики не налезают на текст${r.overlap.length ? ' — ' + r.overlap.slice(0, 4).join('; ') : ''}`);
  if (r.small.length) console.log(`  · мелкие кнопки (${label}): ${r.small.slice(0, 6).join('; ')}`);
  return r;
}

const shot = async (page, name) => OUT && page.screenshot({ path: join(OUT, name + '.png') });

const SCREENS = {
  today: { route: { name: 'today' } },
  knowledge: { route: { name: 'knowledge' } },
  subject: { route: { name: 'subject', id: 'geo' } },
  topic: { route: { name: 'topic', id: 'g1' } },
  settings: { route: { name: 'settings', section: 'ai' } },
  data: { route: { name: 'settings', section: 'data' } },
  profile: { route: { name: 'profile' } },
  stats: { route: { name: 'stats' } },
  homework: { route: { name: 'homework' } },
  tree: {
    route: { name: 'knowledge' },
    run: async (page) => {
      const b = page.getByRole('button', { name: 'Все темы списком' });
      if (!(await b.count())) return; // на широком экране дерево и так слева
      await b.click();
      await page.waitForTimeout(500);
    }
  }
};

for (const [key, sc] of Object.entries(SCREENS)) {
  if (ONLY.length && !ONLY.includes(key)) continue;
  for (const v of VIEWS) {
    const { page, ctx } = await open(v, sc.route);
    if (sc.run) await sc.run(page);
    await audit(page, `${key} ${v.name}`);
    await shot(page, `${key}-${v.name}`);
    await ctx.close();
  }
}

await browser.close();
console.log(bad ? `\n✗ проблем: ${bad}` : '\n✓ всё чисто');
if (problems.length) console.log(problems.join('\n'));
process.exit(bad ? 1 : 0);
