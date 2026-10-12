// Каждый стиль каталога — на телефоне (390×844) и планшете (820×1180): Сегодня, предмет, тема с конспектом, повторение, настройки, боковая шторка.
// Ищет: горизонтальную прокрутку страницы, элементы за правым краем, пропавшие нижнюю панель и верхнюю полосу, ошибки в консоли. Скриншоты — в OUT.
// Нужен запущенный dev-сервер (`npx vite --port 5217`): стили включаются через модуль store прямо на странице, а не через кнопки галереи,
// поэтому скрипт не ломается, когда галерею переделывают.
//   URL=http://localhost:5217 OUT=out-v130 [ONLY=focus,notebook] [DEVICE=phone|tablet] [UI_CSS=путь/к/api.css] node e2e/v130-mobile-styles.mjs
// Кроме стилей каталога проверяются «раскладочные» наборы data-ui-* (панель сверху / справа / узкая со значками, узкая и широкая колонка, плитки…):
// на телефоне они не должны ломать раскладку. Если стили раскладки уже есть в приложении, они подхватятся сами; если нет — задай UI_CSS файлом с их правилами.
import { chromium } from 'playwright';
import fs from 'fs';

const URL = process.env.URL || 'http://localhost:5217';
const OUT = process.env.OUT || 'out-v130';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  tablet: { viewport: { width: 820, height: 1180 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 }
};
const devices = process.env.DEVICE ? [process.env.DEVICE] : Object.keys(DEVICES);
const uiCss = process.env.UI_CSS ? fs.readFileSync(process.env.UI_CSS, 'utf8') : '';

/** Наборы атрибутов раскладки: как их ставят стили («Фокус» — узкая колонка и панель со значками и т. д.). */
const LAYOUTS = [
  { id: 'ui-focus', attrs: { 'data-ui-content': 'narrow', 'data-ui-sidebar': 'rail' } },
  { id: 'ui-top', attrs: { 'data-ui-sidebar': 'top', 'data-ui-content': 'wide' } },
  { id: 'ui-right', attrs: { 'data-ui-sidebar': 'right' } },
  { id: 'ui-tiles', attrs: { 'data-ui-topics': 'tiles', 'data-ui-cards': 'flat', 'data-ui-tabs': 'pills', 'data-ui-grades': 'grid' } },
  { id: 'ui-full', attrs: { 'data-ui-content': 'full', 'data-ui-grades': 'tall', 'data-ui-tabs': 'boxed', 'data-ui-cards': 'sharp' } }
];

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const problems = [];
const report = (dev, style, screen, msg) => {
  problems.push(`${dev} / ${style} / ${screen}: ${msg}`);
  console.log('  !!', screen, msg);
};

async function open(dev, setup) {
  const ctx = await browser.newContext(DEVICES[dev]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    // Vite дописывает ?t=… к изменённым модулям: берём адрес модуля так, как его загрузило само приложение, иначе получим «второй экземпляр».
    performance.setResourceTimingBufferSize(2000);
    window.__imp = (n) => import(performance.getEntriesByType('resource').map((r) => r.name).find((u) => new URL(u).pathname === n) ?? n);
  });
  await page.goto(URL);
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Понятно' }).click({ timeout: 1500 }).catch(() => {}); // веб-версия: «только для тестов»
  await page.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2000 }).catch(() => {}); // знакомство при первом запуске
  // Данные: знакомый пример и «знакомство пройдено» — через модули приложения (работает только на dev-сервере).
  await page.evaluate(async () => {
    const store = await window.__imp('/src/store.ts');
    const seed = await window.__imp('/src/seed.ts');
    seed.addExample();
    store.updateSettings({ onboarded: true });
  });
  await page.waitForTimeout(300);
  await page.evaluate(setup.fn, setup.arg);
  if (uiCss) await page.addStyleTag({ content: uiCss });
  await page.waitForTimeout(500);
  return { ctx, page, errors };
}

/** Что не так на экране: прокрутка вбок, торчащие элементы, нет нижней панели. */
async function audit(page, dev) {
  return page.evaluate((dev) => {
    const W = innerWidth;
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > W + 1) out.push(`страница шире экрана: ${de.scrollWidth} > ${W}`);
    const seen = new Set();
    for (const e of document.querySelectorAll('.app *, .modal *')) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > W + 2 || r.left < -2) {
        // торчащее, но лежащее в блоке с горизонтальной прокруткой, — это нормально
        let p = e.parentElement, clipped = false;
        while (p && p !== document.body) {
          const o = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(o.overflowX) && p.getBoundingClientRect().right <= W + 2) { clipped = true; break; }
          p = p.parentElement;
        }
        if (clipped || e.closest('.otabs-measure, .sr-only, [aria-hidden="true"]')) continue;
        const key = (e.className?.baseVal ?? e.className) + '|' + e.tagName;
        if (!seen.has(key) && seen.size < 6) { seen.add(key); out.push(`торчит за край: <${e.tagName.toLowerCase()} class="${key.split('|')[0]}"> ${Math.round(r.left)}…${Math.round(r.right)}`); }
      }
    }
    if (dev === 'phone' && !document.querySelector('.review-card, .review')) {
      const app = document.querySelector('.app');
      if (!app?.classList.contains('mobile')) out.push('нет .app.mobile — телефонная раскладка не включилась');
      const bar = document.querySelector('.mobile-bar');
      if (!bar || bar.getBoundingClientRect().height < 20) out.push('пропала верхняя полоса приложения');
      const sb = document.querySelector('.sidebar');
      if (sb && !document.querySelector('.drawer-open') && sb.getBoundingClientRect().right > 2 && getComputedStyle(sb).visibility !== 'hidden') out.push('боковая панель торчит на экране телефона');
    }
    return out;
  }, dev);
}

async function walk(dev, label, setup) {
  console.log(dev, label);
  const { ctx, page, errors } = await open(dev, setup);
  const dir = `${OUT}/${dev}/${label}`;
  fs.mkdirSync(dir, { recursive: true });
  const phone = dev === 'phone';
  const shot = async (name) => {
    await page.waitForTimeout(450);
    const bad = await audit(page, dev);
    for (const b of bad) report(dev, label, name, b);
    await page.screenshot({ path: `${dir}/${name}.png` });
  };
  const safe = async (name, fn) => {
    try {
      await fn();
      await shot(name);
    } catch (e) {
      report(dev, label, name, 'не удалось дойти до экрана: ' + String(e.message).split('\n')[0]);
      await page.screenshot({ path: `${dir}/${name}-ERR.png` }).catch(() => {});
    }
  };
  const nav = async (name) => {
    // Телефон: нижняя панель; планшет/компьютер: боковая панель.
    const t = page.locator(phone ? '.tabbar .tab' : '.sidebar .nav-item', { hasText: name }).first();
    await t.click({ timeout: 4000 });
  };
  const openDrawer = async () => {
    if (phone) {
      await page.locator('.tabbar .tab', { hasText: 'Знания' }).click({ timeout: 4000 });
      await page.waitForTimeout(350);
      await page.getByRole('button', { name: 'Все темы списком' }).click({ timeout: 4000 });
      await page.waitForTimeout(400);
    }
  };
  await safe('1-today', async () => {});
  await safe('2-drawer', async () => {
    await openDrawer();
  });
  await safe('3-subject', async () => {
    if (!phone) await page.waitForTimeout(0);
    await page.locator('.tree-row.subject .tree-label', { hasText: 'Физика' }).first().click({ timeout: 4000 });
  });
  await safe('4-topic', async () => {
    await page.locator('.main .topic-row').first().click({ timeout: 4000 });
    await page.waitForTimeout(500);
    const tab = page.locator('.topic-tabs [role="tab"], .topic-tabs button', { hasText: 'Конспект' }).first();
    if (await tab.count()) await tab.click().catch(() => {});
  });
  await safe('5-review', async () => {
    if (phone) {
      await page.locator('.mobile-brand').click({ timeout: 4000 }); // домой — «Сегодня»
    } else await nav('Сегодня');
    await page.waitForTimeout(400);
    await page.locator('.hero-btn').first().click({ timeout: 4000 });
  });
  await safe('6-settings', async () => {
    await page.keyboard.press('Escape');
    // из повторения выходим: на телефоне — крестик/назад, иначе — Esc
    await page.evaluate(() => (location.hash = ''));
    if (await page.locator('.review, .review-card').count()) await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    if (phone) {
      if (!(await page.locator('.tabbar').count())) await page.keyboard.press('Escape');
      await page.locator('.tabbar .tab', { hasText: 'Знания' }).click({ timeout: 4000 });
      await page.waitForTimeout(350);
      await page.getByRole('button', { name: 'Все темы списком' }).click({ timeout: 4000 });
      await page.waitForTimeout(400);
      await page.locator('.side-foot button[aria-label="Настройки"], .side-foot button[title="Настройки"]').first().click({ timeout: 4000 });
    } else await page.getByRole('button', { name: 'Настройки', exact: true }).click({ timeout: 4000 });
  });
  // Создание: окно «Создать» (частая точка поломок на узком экране)
  await safe('7-create', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator(phone ? '.mobile-bar .mobile-create' : '.sidebar .create-btn').first().click({ timeout: 4000 });
  });
  if (errors.length) report(dev, label, 'консоль', 'ошибки: ' + errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// Список стилей — из самого приложения.
const meta = await (async () => {
  const ctx = await browser.newContext(DEVICES.phone);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    // Vite дописывает ?t=… к изменённым модулям: берём адрес модуля так, как его загрузило само приложение, иначе получим «второй экземпляр».
    performance.setResourceTimingBufferSize(2000);
    window.__imp = (n) => import(performance.getEntriesByType('resource').map((r) => r.name).find((u) => new URL(u).pathname === n) ?? n);
  });
  await page.goto(URL);
  await page.waitForTimeout(500);
  const r = await page.evaluate(async () => (await window.__imp('/src/mods.ts')).CATALOG.map((m) => ({ id: m.id, name: m.name, desktopOnly: Boolean(m.desktopOnly) })));
  await ctx.close();
  return r;
})();
const styles = meta.filter((m) => !ONLY.length || ONLY.includes(m.id));

const setMods = { fn: (ids) => window.__imp('/src/store.ts').then((s) => s.updateSettings({ modsOn: ids })), arg: [] };
const setAttrs = { fn: (attrs) => { for (const [k, v] of Object.entries(attrs)) document.documentElement.setAttribute(k, v); }, arg: {} };
for (const dev of devices) {
  await walk(dev, '00-без-стиля', { fn: () => {}, arg: null });
  for (const m of styles) await walk(dev, m.id, { fn: setMods.fn, arg: [m.id] });
  if (!ONLY.length || ONLY.includes('ui'))
    for (const l of LAYOUTS) await walk(dev, l.id, { fn: setAttrs.fn, arg: l.attrs });
}
await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/problems.txt`, problems.join('\n') + '\n');
console.log(problems.length ? `\nПроблем: ${problems.length} (список — ${OUT}/problems.txt)` : '\nВсё чисто');
process.exitCode = problems.length ? 1 : 0;
