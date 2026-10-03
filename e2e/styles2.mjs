// «Настройки → Стили» (1.17): плитки с живыми примерами. Примеры нарисованы и целиком в плитке, нажатие включает и выключает стиль,
// включённый стиль не меняет примеры других плиток (они в своём Shadow DOM).
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/styles2.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];
const looks = {
  modern: { onboarded: true, theme: 'light' },
  classic: { onboarded: true, theme: 'dark', fontScale: 1.2, look: { style: 'classic', light: 'paper', dark: 'coffee', font: 'literata', headFont: 'literata', radius: 'normal', background: 'plain', custom: {} }, accent: '#E0A050' }
};
for (const [lookName, settings] of Object.entries(looks)) for (const [w, h, phone] of [[1280, 800, false], [900, 800, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate((st) => localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [], topics: [], cards: [], states: {}, logs: [], tests: [], settings: st })), settings);
  await page.reload();
  await page.waitForTimeout(700);
  const tag = `${lookName}-${w}`;
  if (phone) { await page.locator('.tab', { hasText: 'Профиль' }).click(); await page.waitForTimeout(400); await page.locator('.prof-links .create-item', { hasText: 'Настройки' }).click(); }
  else await page.getByRole('button', { name: 'Настройки' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('.set-nav-item', { hasText: 'Стили' }).click();
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => Array.from(document.querySelectorAll('.st-demo')).map((d) => {
    const scene = d.shadowRoot?.querySelector('.main');
    const kids = scene?.children.length ?? 0;
    const hr = d.getBoundingClientRect();
    const sr = scene?.getBoundingClientRect();
    const fits = sr ? sr.left >= hr.left - 1 && sr.right <= hr.right + 1 && sr.top >= hr.top - 1 && sr.bottom <= hr.bottom + 1 : false;
    return { name: d.closest('.st-tile')?.querySelector('.st-name')?.textContent, kids, fits, z: scene?.style.zoom };
  }));
  check(info.length === 9, `${tag}: плиток ${info.length}`);
  check(info.every((x) => x.kids >= 1), `${tag}: в каждой плитке нарисован пример`);
  const notFit = info.filter((x) => !x.fits);
  check(notFit.length === 0, `${tag}: примеры целиком в плитках${notFit.length ? ': не влезли ' + notFit.map((x) => x.name).join(', ') : ''}`);
  const over = await page.evaluate(() => Array.from(document.querySelectorAll('.st-name, .st-desc, .st-where')).filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > e.closest('.st-tile').getBoundingClientRect().right + 1).map((e) => e.textContent));
  check(over.length === 0, `${tag}: текст в плитках не вылезает${over.length ? ': ' + over.join(', ') : ''}`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: нет прокрутки вбок`);
  await page.screenshot({ path: `${OUT}/styles2-${tag}.png` });
  // Включить «Стикеры»
  const sticky = page.locator('.st-tile', { hasText: 'Стикеры' });
  await sticky.click();
  await page.waitForTimeout(400);
  check((await sticky.getAttribute('aria-pressed')) === 'true', `${tag}: «Стикеры» включились (aria-pressed)`);
  check(await page.evaluate(() => Boolean(document.getElementById('mnema-mods')?.textContent?.includes('Стикеры'))), `${tag}: CSS «Стикеров» применён к приложению`);
  // Пример «Большие карточки» не стал жёлтым — стили других плиток его не трогают
  const bg = await page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('.st-tile')).find((t) => t.textContent.includes('Большие карточки'))?.querySelector('.st-demo');
    const c = d?.shadowRoot?.querySelector('.review-card');
    return c ? getComputedStyle(c).backgroundColor : 'нет';
  });
  check(bg !== 'rgb(255, 244, 168)' && bg !== 'нет', `${tag}: пример «Большие карточки» не задет «Стикерами» (${bg})`);
  const stickyBg = await page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('.st-tile')).find((t) => t.textContent.includes('Стикеры'))?.querySelector('.st-demo');
    return getComputedStyle(d.shadowRoot.querySelector('.review-card')).backgroundColor;
  });
  check(stickyBg === 'rgb(255, 244, 168)', `${tag}: в примере «Стикеров» карточка жёлтая (${stickyBg})`);
  await page.screenshot({ path: `${OUT}/styles2-on-${tag}.png` });
  await sticky.click();
  await page.waitForTimeout(300);
  check((await sticky.getAttribute('aria-pressed')) === 'false', `${tag}: повторное нажатие выключает`);
  // «Свой CSS» раскрывается
  await page.getByRole('button', { name: /Свой CSS/ }).click();
  await page.waitForTimeout(400);
  check(await page.getByRole('textbox', { name: 'Свой CSS' }).isVisible(), `${tag}: «Свой CSS» раскрывается`);
  if (!phone) await page.screenshot({ path: `${OUT}/styles2-own-${tag}.png`, fullPage: false });
  await ctx.close();
}
check(errors.length === 0, `ошибок страницы нет${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(bad ? `\nНЕ ПРОШЛО: ${bad}` : '\nВсё прошло');
process.exit(bad ? 1 : 0);
