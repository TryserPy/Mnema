// Скриншоты конспекта на телефоне: пустой конспект (шаблоны) и панель над клавиатурой. node scripts/shots/notes.mjs <папка>
import { chromium } from '@playwright/test';
import { seed } from '../../e2e/v132-seed.mjs';
const OUT = process.argv[2];
const URL = process.env.URL ?? 'http://localhost:4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const vv = new EventTarget();
  vv.offsetTop = 0; vv.offsetLeft = 0; vv.scale = 1; vv.kb = 0;
  Object.defineProperty(vv, 'height', { get: () => window.innerHeight - vv.kb });
  Object.defineProperty(vv, 'width', { get: () => window.innerWidth });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  window.__kb = (px) => { vv.kb = px; vv.dispatchEvent(new Event('resize')); };
});
const page = await ctx.newPage();
await page.goto(URL);
const data = seed();
data.topics.find((t) => t.id === 'g6').note = '';
await page.evaluate((data) => {
  sessionStorage.setItem('mnema-web-test-ok', '1');
  sessionStorage.setItem('refrain-no-splash', String(Date.now()));
  localStorage.setItem('mnema-data-pending', JSON.stringify(data));
  localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'topic', id: 'g6', tab: 'note' }, at: Date.now() } }));
}, data);
await page.reload();
await page.locator('.ProseMirror').waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/note-empty-360.png` });
await page.getByRole('button', { name: /Шаблон «По теме»/ }).click();
await page.waitForTimeout(400);
await page.locator('.ProseMirror li').first().click();
await page.keyboard.type('Площадь — сколько места занимает фигура');
await page.evaluate(() => window.__kb(300));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/note-keyboard-360.png` });
await browser.close();
