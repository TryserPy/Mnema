// 1.17: в пробной контрольной — «Соедини пары» и «Расставь по порядку». Решаем верно и с ошибкой, смотрим итоги и «Повторить ошибки».
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/testkinds.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];
const at = new Date(Date.now() - 5 * 864e5).toISOString();
const card = (id, front, back, type = 'basic') => ({ id, topicId: 't1', type, front, back, createdAt: at, updatedAt: at });
const cards = [
  card('a', '1861', 'Отмена крепостного права', 'reverse'),
  card('b', '1812', 'Отечественная война', 'reverse'),
  card('c', '1825', 'Восстание декабристов', 'reverse'),
  card('d', '1853–1856 гг.', 'Крымская война', 'reverse'),
  card('e', 'Кто отменил крепостное право?', 'Александр II'),
  card('f', 'Кто правил в 1812 году?', 'Александр I'),
  card('g', 'Столица России в XIX веке', 'Петербург')
];
// Что к чему (для «Соедини пары»): левая сторона → правая.
const pairOf = Object.fromEntries(cards.flatMap((c) => [[c.front, c.back], [c.back, c.front]]));
const yearOfEvent = { 'Отечественная война': 1812, 'Восстание декабристов': 1825, 'Крымская война': 1853, 'Отмена крепостного права': 1861 };

for (const [w, h, phone, mistake] of [[1280, 860, false, false], [390, 844, true, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate((cards) => {
    localStorage.setItem('mnema-data', JSON.stringify({
      version: 1, subjects: [{ id: 's1', name: 'История', color: '#C2417A', createdAt: cards[0].createdAt }],
      topics: [{ id: 't1', subjectId: 's1', name: 'Россия XIX века', note: 'Главное.', createdAt: cards[0].createdAt, updatedAt: cards[0].createdAt }],
      cards, states: {}, logs: [], tests: [], settings: { onboarded: true }
    }));
  }, cards);
  await page.reload();
  await page.waitForTimeout(700);
  const tag = String(w);
  if (phone) { await page.locator('.tab', { hasText: 'Знания' }).click(); await page.waitForTimeout(400); await page.getByRole('button', { name: 'Все темы списком' }).click(); await page.waitForTimeout(400); }
  await page.locator('.tree-row.subject', { hasText: 'История' }).locator('.twisty').click();
  await page.waitForTimeout(300);
  await page.locator('.tree-row', { hasText: 'Россия XIX века' }).locator('.tree-label').click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Действия с темой' }).click();
  await page.getByRole('menuitem', { name: /Проверить себя/ }).click();
  await page.getByRole('menuitem', { name: /Пробная контрольная/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('radio', { name: /Все/ }).click();
  await page.getByRole('button', { name: 'Начать' }).click();
  await page.waitForTimeout(400);
  const seen = new Set();
  for (let step = 0; step < 20; step++) {
    if (await page.locator('.result-card').count()) break;
    if (await page.locator('.mt-grid').count()) {
      seen.add('match');
      await page.screenshot({ path: `${OUT}/tk-match-${tag}.png` });
      const lefts = await page.locator('.mt-col').first().locator('.mt-item').allInnerTexts();
      const rights = await page.locator('.mt-col').nth(1).locator('.mt-item').allInnerTexts();
      const clean = (t) => t.replace(/^\d*\s*/, '').trim();
      for (let i = 0; i < lefts.length; i++) {
        // С ошибкой: первым двум — ответы друг друга.
        const from = mistake && i < 2 ? 1 - i : i;
        const j = rights.findIndex((r) => clean(r) === pairOf[clean(lefts[from])]);
        await page.locator('.mt-col').first().locator('.mt-item').nth(i).click();
        await page.locator('.mt-col').nth(1).locator('.mt-item').nth(j).click();
      }
      await page.screenshot({ path: `${OUT}/tk-match-linked-${tag}.png` });
      await page.getByRole('button', { name: 'Проверить' }).click();
      await page.waitForTimeout(300);
      const okRows = await page.locator('.mt-result li.ok').count();
      const badRows = await page.locator('.mt-result li.bad').count();
      check(mistake ? badRows === 2 && okRows === 2 : okRows === 4, `${tag}: «Соедини пары» проверено: верно ${okRows}, ошибок ${badRows}`);
      await page.screenshot({ path: `${OUT}/tk-match-done-${tag}.png` });
    } else if (await page.locator('.ord-zone').count()) {
      seen.add('order');
      await page.screenshot({ path: `${OUT}/tk-order-${tag}.png` });
      const pool = (await page.locator('.ord-pool .ord-item').allInnerTexts()).map((t) => t.trim());
      const order = [...pool].sort((a, b) => yearOfEvent[a] - yearOfEvent[b]);
      if (mistake) [order[0], order[1]] = [order[1], order[0]];
      for (const t of order) await page.locator('.ord-pool .ord-item', { hasText: t }).click();
      await page.screenshot({ path: `${OUT}/tk-order-picked-${tag}.png` });
      await page.getByRole('button', { name: 'Проверить' }).click();
      await page.waitForTimeout(300);
      const okN = await page.locator('.ord-item.ok').count();
      check(mistake ? (await page.locator('.ord-right').count()) === 1 : okN === order.length, `${tag}: «По порядку» проверено: верно ${okN} из ${order.length}`);
      await page.screenshot({ path: `${OUT}/tk-order-done-${tag}.png` });
    } else if (await page.locator('.choice').count()) {
      await page.locator('.choice').first().click();
    } else if (await page.locator('input.typed').count()) {
      await page.locator('input.typed').fill('x'); await page.keyboard.press('Enter');
    } else if (await page.getByRole('button', { name: 'Показать ответ' }).count()) {
      await page.getByRole('button', { name: 'Показать ответ' }).click();
      await page.getByRole('button', { name: /Знал/ }).last().click();
      continue;
    }
    await page.waitForTimeout(150);
    const nx = page.getByRole('button', { name: /Дальше|Результат/ });
    if (await nx.count()) await nx.click();
    await page.waitForTimeout(250);
  }
  check(seen.has('match') && seen.has('order'), `${tag}: в тесте были оба новых задания (${[...seen].join(', ')})`);
  check((await page.locator('.result-card').count()) === 1, `${tag}: дошли до итогов`);
  if (mistake) check((await page.getByRole('button', { name: 'Повторить ошибки' }).count()) === 1, `${tag}: есть «Повторить ошибки»`);
  await page.screenshot({ path: `${OUT}/tk-result-${tag}.png` });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check(ov, `${tag}: нет прокрутки вбок`);
  await ctx.close();
}
check(errors.length === 0, `ошибок страницы нет${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(bad ? `\nНЕ ПРОШЛО: ${bad}` : '\nВсё прошло');
process.exit(bad ? 1 : 0);
