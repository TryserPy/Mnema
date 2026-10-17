// 1.32: холст «От руки» на телефоне — один палец рисует, два пальца масштабируют (без штриха), ладонь не рисует,
// полный экран сохраняет рисунок, «Назад» сворачивает полный экран, а не закрывает окно.
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=… OUT=… node e2e/v132-ink.mjs
import { chromium } from 'playwright';
import { join } from 'path';
import { seed } from './v132-seed.mjs';

const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || bad++);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
await page.evaluate((data) => {
  sessionStorage.setItem('mnema-web-test-ok', '1');
  sessionStorage.setItem('refrain-no-splash', String(Date.now()));
  localStorage.setItem('mnema-data-pending', JSON.stringify(data));
  localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'topic', id: 'b1' }, at: Date.now() } }));
}, seed());
await page.reload();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Вставить' }).first().click();
await page.getByRole('menuitem', { name: /Рисунок/ }).click();
await page.locator('.draw-svg').waitFor();
await page.waitForTimeout(600); // лист доехал до места

const cdp = await ctx.newCDPSession(page);
const touch = async (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p[0], y: p[1], id: p[2] ?? i, radiusX: p[3] ?? 4, radiusY: p[3] ?? 4 })) });
const box = await page.locator('.draw-svg').boundingBox();
const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
const paths = () => page.locator('.draw-svg path').count();

// Один палец — штрих
await touch('touchStart', [at(0.2, 0.3)]);
for (let i = 1; i <= 8; i++) await touch('touchMove', [at(0.2 + i * 0.05, 0.3 + i * 0.02)]);
await touch('touchEnd', []);
await page.waitForTimeout(100);
check((await paths()) === 1, 'один палец рисует штрих');

// Два пальца — масштаб, без нового штриха
await touch('touchStart', [at(0.45, 0.5)]);
await touch('touchStart', [at(0.45, 0.5), [...at(0.55, 0.5), 1]]);
for (let i = 1; i <= 8; i++) await touch('touchMove', [at(0.45 - i * 0.03, 0.5), [...at(0.55 + i * 0.03, 0.5), 1]]);
await touch('touchEnd', []);
await page.waitForTimeout(150);
const zoomText = await page.locator('.draw-zoom-val').textContent();
check((await paths()) === 1, 'щипок двумя пальцами не оставляет штриха');
check(parseInt(zoomText) > 150, `щипок приближает холст (${zoomText})`);

// Ладонь (широкое касание) — не рисует
await touch('touchStart', [[...at(0.6, 0.7), 0, 40]]);
await touch('touchMove', [[...at(0.7, 0.75), 0, 40]]);
await touch('touchEnd', []);
await page.waitForTimeout(100);
check((await paths()) === 1, 'широкое касание ладонью не рисует');
await page.locator('.draw-zoom-val').click();
await page.waitForTimeout(100);

// Полный экран: рисунок на месте, «Назад» сворачивает, окно остаётся
await page.getByRole('button', { name: 'Холст на весь экран' }).click();
await page.locator('.draw-full').waitFor();
await page.waitForTimeout(400);
check((await page.locator('.draw-full .draw-svg path').count()) === 1, 'в полном экране рисунок тот же');
OUT && (await page.screenshot({ path: join(OUT, 'ink-full-390.png') }));
const handled = await page.evaluate(() => window.__mnemaBack?.() ?? (document.querySelector('[data-back]')?.click(), true));
await page.waitForTimeout(250);
check(handled && (await page.locator('.draw-full').count()) === 0, '«Назад» сворачивает полный экран');
check((await page.locator('.modal .draw-svg path').count()) === 1, 'окно с рисунком не закрылось, рисунок цел');
OUT && (await page.screenshot({ path: join(OUT, 'ink-back-390.png') }));

// Формула от руки: полный экран и масштаб есть
await page.locator('.modal .modal-head .icon-btn').last().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'От руки' }).first().click();
await page.locator('.sketch-svg').waitFor();
await page.locator('.sketch-tools').getByRole('button', { name: 'На весь экран' }).click();
await page.locator('.sketch-full .sketch-svg').waitFor();
const sb = await page.locator('.sketch-full .sketch-svg').boundingBox();
check(sb.height > 500, `формула от руки на весь экран (${Math.round(sb.height)} px в высоту)`);
OUT && (await page.screenshot({ path: join(OUT, 'pad-full-390.png') }));

await browser.close();
for (const e of errors) console.log('ошибка страницы: ' + e);
console.log(bad || errors.length ? `\n✗ ${bad + errors.length}` : '\n✓ всё в порядке');
process.exit(bad || errors.length ? 1 : 0);
