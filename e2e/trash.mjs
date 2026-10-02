// Этап 7: «Корзина» — удалили тему, она лежит в корзине, оттуда возвращается (конспект и карточки на месте); корзина не уходит в копию.
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/trash.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];
const SEED = () => {
  const at = new Date(Date.now() - 5 * 864e5).toISOString();
  const cards = Array.from({ length: 3 }, (_, i) => ({ id: 'c' + i, topicId: 't2', type: 'basic', front: 'Вопрос ' + i, back: 'Ответ ' + i, createdAt: at, updatedAt: at }));
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note: 'Клетка — единица жизни.', createdAt: at, updatedAt: at }, { id: 't2', subjectId: 's1', name: 'Ткани', note: 'Ткани бывают разные.', createdAt: at, updatedAt: at }], cards, states: {}, logs: [], tests: [], settings: { onboarded: true } }));
};
const data = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mnema-data')));

for (const [w, h, phone] of [[1280, 800, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(SEED);
  await page.reload();
  await page.waitForTimeout(700);
  const tag = String(w);
  if (phone) { await page.locator('.tab', { hasText: 'Знания' }).click(); await page.waitForTimeout(400); }
  await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
  await page.waitForTimeout(300);
  // удалить тему «Ткани» через меню (два нажатия)
  const row = page.locator('.tree-row', { hasText: 'Ткани' });
  await row.click({ button: 'right' });
  await page.waitForTimeout(300);
  const del = page.locator('.menu.ctx button', { hasText: 'Удалить тему' });
  await del.click();
  await page.waitForTimeout(200);
  await page.locator('.menu.ctx button', { hasText: 'Точно удалить' }).click();
  await page.waitForTimeout(900);
  let d = await data(page);
  check(!d.topics.some((t) => t.id === 't2') && d.cards.length === 0, `${tag}: тема «Ткани» удалена вместе с карточками`);
  check(d.trash?.length === 1 && /Тема «Ткани» · 3 карточки/.test(d.trash[0].label), `${tag}: в корзине запись: ${d.trash?.[0]?.label}`);
  // открыть «Корзину»
  if (phone) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('.drawer-back').click({ position: { x: w - 10, y: 200 } }).catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('.tab', { hasText: 'Профиль' }).click();
    await page.waitForTimeout(300);
    await page.locator('.modal .create-item', { hasText: 'Корзина' }).click();
  } else {
    await page.keyboard.press('Control+p');
    await page.locator('.palette input').fill('Корзина');
    await page.waitForTimeout(250);
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(600);
  check((await page.locator('h1.display').innerText()) === 'Корзина', `${tag}: экран «Корзина» открылся`);
  const items = await page.locator('.trash-item').allInnerTexts();
  check(items.length === 1 && items[0].includes('Тема «Ткани»') && items[0].includes('удалено сегодня'), `${tag}: в списке одна запись: ${items[0]?.replace(/\n/g, ' | ')}`);
  await page.screenshot({ path: `${OUT}/trash-${tag}.png` });
  await page.locator('.trash-item').getByRole('button', { name: 'Вернуть' }).click();
  await page.waitForTimeout(900);
  d = await data(page);
  check(d.topics.some((t) => t.id === 't2' && t.note === 'Ткани бывают разные.') && d.cards.length === 3, `${tag}: тема вернулась с конспектом и тремя карточками`);
  check(!d.trash || d.trash.length === 0, `${tag}: запись из корзины ушла`);
  check((await page.locator('.empty strong').innerText()) === 'В корзине пусто', `${tag}: корзина пуста`);
  const overflow = await page.evaluate(() => { const m = document.querySelector('.main'); return document.documentElement.scrollWidth > innerWidth + 1 || (m ? m.scrollWidth > m.clientWidth + 1 : false); });
  check(!overflow, `${tag}: нет горизонтальной прокрутки`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
