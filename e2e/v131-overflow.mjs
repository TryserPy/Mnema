// 1.31 «ничего не вылезает»: каждый встроенный стиль и каждое дополнение × светлая/тёмная × 380 и 1280 px × главные экраны
// (Сегодня, предмет, конспект темы, Оформление). Ищет текст шире своего блока и элементы за краем экрана.
// Запуск: URL=http://localhost:4174 NODE_PATH=$(npm root -g) node e2e/v131-overflow.mjs   (ONLY=styles|addons — часть; SHOTS=1 OUT=… — снимки)
import { chromium } from 'playwright';
import fs from 'fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
const ONLY = process.env.ONLY ?? '';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
let checks = 0;
const errors = [];

async function overflow(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out = [];
    const vis = (e) => {
      const cs = getComputedStyle(e);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length;
    };
    for (const e of document.querySelectorAll('body *')) {
      if (!vis(e) || e.closest('.otabs-measure, svg, .katex, .ProseMirror-separator, .st-frame')) continue;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(e);
      let clip = null;
      for (let a = e.parentElement; a; a = a.parentElement) {
        const c = getComputedStyle(a);
        if (c.overflowX !== 'visible' || c.overflow !== 'visible') {
          clip = a.getBoundingClientRect();
          break;
        }
      }
      if (r.right > W + 1 && (!clip || clip.right > W + 1)) out.push(`за краем ${String(e.className || e.tagName).slice(0, 40)} ${Math.round(r.right)}>${W}`);
      if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX === 'visible' && cs.textOverflow !== 'ellipsis' && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
        out.push(`текст шире блока ${String(e.className || e.tagName).slice(0, 40)} «${e.textContent.trim().slice(0, 24)}»`);
    }
    return [...new Set(out)].slice(0, 6);
  });
}

async function check(page, tag) {
  await page.waitForTimeout(350);
  const r = await overflow(page);
  checks++;
  if (r.length) {
    bad++;
    console.log(`✗ ${tag}: ${r.join(' | ')}`);
    if (process.env.SHOTS) await page.screenshot({ path: `${OUT}/ovf-${tag.replace(/[^\w-]+/g, '_')}.png` });
  }
}

async function open(theme, width) {
  const mobile = width < 700;
  const page = await browser.newPage({ viewport: { width, height: 860 }, isMobile: mobile, hasTouch: mobile, colorScheme: theme });
  page.on('pageerror', (e) => errors.push(`${theme}/${width}: ${e.message}`));
  await page.goto(URL);
  await page.evaluate(() => sessionStorage.setItem('mnema-web-test-ok', '1'));
  await page.reload();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {});
  await page.getByRole('button', { name: 'Посмотреть на примере' }).click({ timeout: 4000 });
  await page.waitForTimeout(500);
  return page;
}

/** Клик с одной повторной попыткой: после смены стиля интерфейс перестраивается и элемент бывает «в движении». */
async function tap(loc) {
  try {
    await loc.click({ timeout: 6000 });
  } catch {
    await loc.page().keyboard.press('Escape');
    await loc.page().waitForTimeout(400);
    await loc.click({ timeout: 6000, force: true });
  }
}

const go = {
  async look(page, mobile) {
    if (mobile) {
      await page.locator('.tabbar .tab', { hasText: 'Профиль' }).click();
      await page.locator('.main button', { hasText: 'Настройки' }).first().click();
      await page.locator('.set-nav-item', { hasText: 'Оформление' }).first().click();
    } else {
      const btn = page.locator('.side-foot button[aria-label="Настройки"], .side-foot button[title^="Настройки"]').first();
      // «Фокус» прячет панель — тогда настройки по Ctrl+,.
      if (await btn.isVisible().catch(() => false)) await tap(btn);
      else await page.keyboard.press('Control+Comma');
      await page.locator('.set-nav-item', { hasText: 'Оформление' }).first().click();
    }
    await page.locator('[data-set="look-tabs"]').waitFor();
  },
  async today(page, mobile) {
    if (mobile) await page.locator('.tabbar .tab').first().click();
    else {
      const t = page.locator('.nav-item:has-text("Сегодня"), .sidebar [aria-label^="Сегодня"], .sidebar [title^="Сегодня"]').first();
      if (await t.isVisible().catch(() => false)) await tap(t);
      else await page.keyboard.press('Control+1').catch(() => {});
    }
  },
  async topic(page, mobile) {
    if (mobile) {
      await page.locator('.tabbar .tab', { hasText: 'Знания' }).click();
      await page.waitForTimeout(300);
      await page.locator('.main .know-tile, .main .tree-label, .main .subject-card, .main .card', { hasText: 'Физика' }).first().click();
    } else {
      // Узкая панель (дополнение) показывает предметы значками.
      const tree = page.locator('.sidebar:not(.rail) .tree-row.subject .tree-label', { hasText: 'Физика' }).first();
      if (await tree.isVisible().catch(() => false)) await tap(tree);
      else {
        const rail = page.locator('.sidebar .rail-subj[aria-label="Физика"], .sidebar [aria-label="Физика"]').first();
        if (await rail.isVisible().catch(() => false)) await tap(rail);
        else {
          // Панель сверху — через «Знания»; панели нет совсем («Фокус») — через поиск.
          const know = page.locator('.nav-item:has-text("Знания")').first();
          if (await know.isVisible().catch(() => false)) await tap(know);
          else {
            await page.keyboard.press('Control+p');
            await page.keyboard.type('Физика');
            await page.waitForTimeout(400);
            await page.keyboard.press('Enter');
          }
          await page.waitForTimeout(300);
          const tile = page.locator('.main .know-tile, .main .tree-label, .main .subject-card', { hasText: 'Физика' }).first();
          if (await tile.isVisible().catch(() => false)) await tap(tile);
        }
      }
    }
    await page.waitForTimeout(300);
  }
};

async function screens(page, mobile, tag) {
  await go.today(page, mobile);
  await check(page, `${tag} сегодня`);
  await go.topic(page, mobile);
  await check(page, `${tag} предмет`);
  await tap(page.locator('.main .topic-row').first());
  await page.waitForTimeout(300);
  await check(page, `${tag} тема`);
}

for (const theme of ['light', 'dark']) {
  for (const width of [1280, 380]) {
    const mobile = width < 700;
    const page = await open(theme, width);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    // Тема — через настройки, чтобы держалась при переходах.
    await go.look(page, mobile);
    await page.getByRole('radio', { name: theme === 'dark' ? 'Тёмная' : 'Светлая' }).first().click();
    const base = `${theme}-${width}`;
    console.log(`— ${base}`);

    if (ONLY !== 'addons') {
      await page.getByRole('radio', { name: 'Стиль', exact: true }).click();
      const n = await page.locator('[data-set="style-grid"] .st-tile').count();
      for (let i = 0; i < n; i++) {
        await go.look(page, mobile);
        await page.getByRole('radio', { name: 'Стиль', exact: true }).click();
        const tile = page.locator('[data-set="style-grid"] .st-tile').nth(i);
        const name = (await tile.locator('.st-name').innerText().catch(() => String(i))).trim();
        await tile.click();
        await check(page, `${base} стиль «${name}» оформление`);
        await screens(page, mobile, `${base} стиль «${name}»`);
      }
      await go.look(page, mobile);
      await page.getByRole('radio', { name: 'Стиль', exact: true }).click();
      await page.locator('[data-set="style-grid"] .st-tile').first().click(); // обратно «Современный»
    }

    if (ONLY !== 'styles') {
      await go.look(page, mobile);
      await page.getByRole('radio', { name: 'Дополнения', exact: true }).click();
      const names = await page.locator('.addon-row .st-item-name').allInnerTexts();
      for (const name of names) {
        await go.look(page, mobile);
        await page.getByRole('radio', { name: 'Дополнения', exact: true }).click();
        console.log(`  дополнение «${name}»`);
        const sw = page.locator('.addon-row', { hasText: name }).first().getByRole('switch');
        await sw.click();
        await check(page, `${base} дополнение «${name}» оформление`);
        await screens(page, mobile, `${base} дополнение «${name}»`);
        await go.look(page, mobile);
        await page.getByRole('radio', { name: 'Дополнения', exact: true }).click();
        await page.locator('.addon-row', { hasText: name }).first().getByRole('switch').click();
      }
    }
    await page.close();
  }
}

await browser.close();
if (errors.length) {
  console.log('Ошибки страницы:\n' + [...new Set(errors)].slice(0, 10).join('\n'));
  bad += errors.length;
}
console.log(`проверок: ${checks}`);
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё хорошо');
process.exit(bad ? 1 : 0);
