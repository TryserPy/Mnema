// 1.32, N1: «Импорт карточек» и «Готовые колоды» на телефоне (360/390/412/ландшафт) и ПК: вставить набор Quizlet,
// поменять столбцы, добавить; RemNote; добавить готовую колоду. Проверяет раскладку (без прокрутки вбок) и результат.
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=… OUT=… node e2e/v132-import.mjs
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { seed } from './v132-seed.mjs';

const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT;
if (OUT) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || bad++);

const QUIZLET = 'mitochondria\tмитохондрия\nribosome\tрибосома\nnucleus\tядро\nmembrane\tмембрана';

for (const v of [
  { name: '360', width: 360, height: 800 },
  { name: '390', width: 390, height: 844 },
  { name: '412', width: 412, height: 915 },
  { name: 'land', width: 800, height: 360 },
  { name: 'desk', width: 1280, height: 820 }
]) {
  const mobile = v.width < 900;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate((data) => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    sessionStorage.setItem('refrain-no-splash', String(Date.now()));
    localStorage.setItem('mnema-data-pending', JSON.stringify(data));
    localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'settings', section: 'data' }, at: Date.now() } }));
  }, seed());
  await page.reload();
  await page.waitForTimeout(900);
  const noHScroll = () => page.evaluate(() => [...document.querySelectorAll('.modal')].every((m) => m.scrollWidth <= m.clientWidth + 1) && document.documentElement.scrollWidth <= innerWidth + 1);

  // Quizlet
  await page.locator('.srow', { hasText: 'Из Quizlet, таблицы' }).getByRole('button').click();
  await page.getByRole('button', { name: /^Quizlet/ }).click();
  await page.getByLabel('Текст карточек').fill(QUIZLET);
  await page.waitForTimeout(200);
  check((await page.locator('.imp-card').count()) === 4, `${v.name}: Quizlet — 4 карточки в предпросмотре`);
  check(await noHScroll(), `${v.name}: окно импорта без прокрутки вбок`);
  if (OUT) await page.screenshot({ path: join(OUT, `import-quizlet-${v.name}.png`), fullPage: false });
  // Поменять местами вопрос и ответ
  await page.getByLabel('Столбец 1').selectOption('back');
  await page.getByLabel('Столбец 2').selectOption('front');
  const first = await page.locator('.imp-card').first().innerText();
  check(/^митохондрия/.test(first.trim()), `${v.name}: столбцы поменялись местами (${first.trim().split('\n')[0]})`);
  await page.getByLabel('Название предмета').fill('Биология-англ');
  await page.getByRole('button', { name: /^Добавить 4 карточки/ }).click();
  await page.waitForTimeout(600);
  check((await page.locator('main').innerHTML()).includes('Карточки из Quizlet') && /митохондрия/.test(await page.locator('main').innerText()), `${v.name}: открылась новая тема «Карточки из Quizlet» с карточками`);

  // RemNote
  await page.evaluate(() => localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'settings', section: 'data' }, at: Date.now() } })));
  await page.reload();
  await page.waitForTimeout(800);
  await page.locator('.srow', { hasText: 'Из Quizlet, таблицы' }).getByRole('button').click();
  await page.getByRole('button', { name: /^RemNote/ }).click();
  await page.getByLabel('Текст карточек').fill('Клетка\n  - Митохондрия >> энергия\n  - ДНК :: дезоксирибонуклеиновая кислота');
  await page.waitForTimeout(200);
  check((await page.locator('.imp-card').count()) === 2, `${v.name}: RemNote — 2 карточки`);
  await page.getByRole('button', { name: 'Отмена' }).click();

  // Готовые колоды
  await page.locator('.srow', { hasText: 'Готовые колоды' }).getByRole('button').click();
  await page.getByRole('button', { name: /Химические элементы 1–30/ }).click();
  check(await noHScroll(), `${v.name}: каталог колод без прокрутки вбок`);
  if (OUT) await page.screenshot({ path: join(OUT, `decks-${v.name}.png`) });
  await page.locator('.modal').getByRole('button', { name: /^Добавить$/ }).click();
  await page.waitForTimeout(600);
  check((await page.locator('main').innerHTML()).includes('Химические элементы 1–30') && /Первые 30 элементов/.test(await page.locator('main').innerText()), `${v.name}: колода добавлена и открыта`);
  check(!errors.length, `${v.name}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
