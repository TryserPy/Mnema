// 1.32, п.10: жесты на телефоне — нажатие по карточке открывает ответ, свайп вправо/влево оценивает,
// вертикальная прокрутка карточку не двигает; «потяни вниз» на «Сегодня» обновляет план; скелетоны вместо кружков.
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=… OUT=… node e2e/v132-gestures.mjs
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

async function open(v, route) {
  const ctx = await browser.newContext({ viewport: v, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  const drag = async (from, to, steps = 10, pause = 16) => {
    await touch('touchStart', [from]);
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]);
      await page.waitForTimeout(pause);
    }
    await touch('touchEnd', []);
  };
  return { ctx, page, touch, drag, errors };
}

for (const v of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 800, height: 360 }
]) {
  const tag = `${v.width}×${v.height}`;
  const { ctx, page, touch, drag, errors } = await open(v, { name: 'today' });
  await page.getByRole('button', { name: /^Учиться/ }).first().click();
  const card = page.locator('.review-card');
  await card.waitFor();
  const progress = () => page.locator('.review-top .small').textContent();
  const p0 = await progress();
  const b = await card.boundingBox();
  const mid = [b.x + b.width / 2, b.y + Math.min(b.height / 2, 120)];

  // Свайп до ответа ничего не оценивает
  await drag(mid, [mid[0] + 200, mid[1]]);
  await page.waitForTimeout(250);
  check((await progress()) === p0 && !(await page.locator('.answer').count()), `${tag}: свайп до ответа не оценивает`);

  // Нажатие по карточке — ответ
  await touch('touchStart', [mid]);
  await touch('touchEnd', []);
  await page.waitForTimeout(250);
  check((await page.locator('.answer').count()) === 1, `${tag}: нажатие по карточке показывает ответ`);
  if (OUT && v.width === 390) await page.screenshot({ path: join(OUT, `swipe-revealed-${v.width}.png`) });

  // Вертикальный жест — прокрутка, а не свайп
  await drag(mid, [mid[0] + 20, mid[1] - 160]);
  await page.waitForTimeout(250);
  check((await progress()) === p0, `${tag}: вертикальный жест не оценивает карточку`);

  // Короткий медленный сдвиг — карточка возвращается
  await drag(mid, [mid[0] + 50, mid[1]], 10, 60);
  await page.waitForTimeout(300);
  const tf = await card.evaluate((el) => el.style.transform);
  check((await progress()) === p0 && !tf, `${tag}: короткий сдвиг — карточка вернулась на место`);

  // Свайп вправо, с подписью «Хорошо» во время движения
  await touch('touchStart', [mid]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[mid[0] + i * 18, mid[1]]]), await page.waitForTimeout(16);
  const armed = await card.evaluate((el) => el.dataset.swipe);
  if (OUT && v.width === 390) await page.screenshot({ path: join(OUT, `swipe-good-${v.width}.png`) });
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  const p1 = await progress();
  check(armed === 'good' && p1 !== p0, `${tag}: свайп вправо — «Хорошо» (подпись: ${armed}, ${p0} → ${p1})`);

  // Свайп влево — «Снова»: карточка вернётся в эту же сессию
  await touch('touchStart', [mid]);
  await touch('touchEnd', []);
  await page.waitForTimeout(250);
  await drag(mid, [mid[0] - 200, mid[1]]);
  await page.waitForTimeout(500);
  const p2 = await progress();
  check(p2 !== p1, `${tag}: свайп влево — «Снова» (${p1} → ${p2})`);
  check(!errors.length, `${tag}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}

// «Потяни вниз» на «Сегодня»
{
  const { ctx, page, drag, touch, errors } = await open({ width: 390, height: 844 }, { name: 'today' });
  await page.locator('.today-page').waitFor();
  const x = 195;
  await drag([x, 200], [x, 420], 14, 20);
  await page.waitForTimeout(400);
  const t = await page.locator('.toast').first().textContent().catch(() => '');
  check(/План на сегодня обновлён/.test(t ?? ''), `потяни вниз — план обновлён (тост: «${t}»)`);
  // Короткое потягивание — ничего не происходит
  await page.waitForTimeout(3500);
  await drag([x, 200], [x, 250], 6, 20);
  await page.waitForTimeout(300);
  const op = await page.locator('.ptr').evaluate((el) => getComputedStyle(el).opacity);
  check(Number(op) < 0.05, `короткое потягивание — индикатор спрятан (opacity ${op})`);
  check(!errors.length, `«Сегодня»: без ошибок страницы ${errors.join('; ')}`);
  if (OUT) {
    await touch('touchStart', [[x, 200]]);
    for (let i = 1; i <= 10; i++) await touch('touchMove', [[x, 200 + i * 22]]);
    await page.screenshot({ path: join(OUT, 'ptr-390.png') });
    await touch('touchEnd', []);
  }
  await ctx.close();
}

await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
