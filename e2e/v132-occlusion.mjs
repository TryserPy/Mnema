// 1.32, N5: «Закрыть часть картинки» на телефоне (касания CDP) и ПК (мышь): картинка → рамки пальцем → щипок не рисует
// рамку → подпись → карточка → повторение: «?» на рамке, после ответа — подпись. Запуск: vite preview --mode web …,
// затем URL=… OUT=… node e2e/v132-occlusion.mjs
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

for (const v of [
  { name: '390', width: 390, height: 844 },
  { name: '360', width: 360, height: 800 },
  { name: 'desk', width: 1280, height: 820 }
]) {
  const mobile = v.width < 900;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  const data = seed();
  data.cards = data.cards.filter((c) => c.topicId !== 'b1');
  await page.evaluate((data) => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    sessionStorage.setItem('refrain-no-splash', String(Date.now()));
    localStorage.setItem('mnema-data-pending', JSON.stringify(data));
    localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'topic', id: 'b1', tab: 'cards' }, at: Date.now() } }));
  }, data);
  await page.reload();
  await page.waitForTimeout(900);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] ?? i })) });
  const dragBox = async (box, a, b) => {
    const pa = [box.x + box.width * a[0], box.y + box.height * a[1]];
    const pb = [box.x + box.width * b[0], box.y + box.height * b[1]];
    if (mobile) {
      await touch('touchStart', [pa]);
      for (let i = 1; i <= 8; i++) await touch('touchMove', [[pa[0] + ((pb[0] - pa[0]) * i) / 8, pa[1] + ((pb[1] - pa[1]) * i) / 8]]);
      await touch('touchEnd', []);
    } else {
      await page.mouse.move(pa[0], pa[1]);
      await page.mouse.down();
      await page.mouse.move(pb[0], pb[1], { steps: 8 });
      await page.mouse.up();
    }
    await page.waitForTimeout(120);
  };

  await page.getByRole('button', { name: /Вручную|Карточка/ }).first().click();
  await page.locator('.modal select').first().selectOption('occlusion');
  await page.locator('.modal input[type=file][accept="image/*"]').setInputFiles('test-fixtures/page47.jpg');
  await page.locator('.occl-canvas svg image').waitFor();
  await page.waitForTimeout(700);
  const box = await page.locator('.occl-canvas svg').boundingBox();
  check(box.y >= 0 && box.y < v.height * 0.5, `${v.name}: холст сам прокрутился в поле зрения (верх на ${Math.round(box.y)} px)`);
  await dragBox(box, [0.1, 0.1], [0.45, 0.2]);
  await dragBox(box, [0.5, 0.5], [0.9, 0.6]);
  check((await page.locator('.occl-mask.edit').count()) === 2, `${v.name}: две рамки нарисованы ${mobile ? 'пальцем' : 'мышью'}`);
  if (mobile) {
    // Щипок двумя пальцами — масштаб, без новой рамки
    const c = [box.x + box.width * 0.5, box.y + box.height * 0.35];
    await touch('touchStart', [[c[0] - 20, c[1], 0]]);
    await touch('touchStart', [[c[0] - 20, c[1], 0], [c[0] + 20, c[1], 1]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[c[0] - 20 - i * 10, c[1], 0], [c[0] + 20 + i * 10, c[1], 1]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(150);
    check((await page.locator('.occl-mask.edit').count()) === 2, `${v.name}: щипок не рисует рамку`);
    check((await page.getByRole('button', { name: 'Весь рисунок' }).count()) === 1, `${v.name}: щипок приблизил картинку`);
    await page.getByRole('button', { name: 'Весь рисунок' }).click();
  }
  // Подписать первую рамку
  await dragBox(await page.locator('.occl-canvas svg').boundingBox(), [0.2, 0.15], [0.2, 0.15]);
  await page.getByLabel('Что под рамкой').fill('Заголовок параграфа');
  check(await page.evaluate(() => document.querySelector('.modal').scrollWidth <= document.querySelector('.modal').clientWidth + 1), `${v.name}: редактор без прокрутки вбок`);
  if (OUT) await page.screenshot({ path: join(OUT, `occl-edit-${v.name}.png`) });
  await page.locator('.modal').getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.waitForTimeout(300);
  await page.locator('.modal').getByRole('button', { name: 'Закрыть' }).click();
  await page.waitForTimeout(300);
  check((await page.locator('.card-row .occl-view svg').count()) === 1, `${v.name}: в списке карточек — картинка с рамками`);

  // Повторение
  await page.getByRole('button', { name: /^Учить/ }).first().click();
  await page.locator('.review-card .occl-view svg').waitFor();
  const q = await page.locator('.review-card .occl-mask.target').count();
  const others = await page.locator('.review-card .occl-mask.other').count();
  check(q === 1 && others === 1 && (await page.locator('.occl-q').count()) === 1, `${v.name}: вопрос — одна рамка с «?», другая закрыта`);
  if (OUT) await page.screenshot({ path: join(OUT, `occl-q-${v.name}.png`) });
  await page.getByRole('button', { name: 'Показать ответ' }).click();
  await page.waitForTimeout(200);
  const opened = await page.locator('.review-card .occl-mask.target.open').count();
  const labelText = await page.locator('.occl-pill text').allTextContents();
  check(opened === 1, `${v.name}: после ответа рамка открылась${labelText.length ? ', подпись: ' + labelText[0] : ''}`);
  if (OUT) await page.screenshot({ path: join(OUT, `occl-a-${v.name}.png`) });
  check(!errors.length, `${v.name}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
