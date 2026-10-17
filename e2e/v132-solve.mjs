// 1.32, N3: «Решить по шагам» на телефоне и ПК — фото условия (выбор файла) → решение с формулами KaTeX →
// «В конспект» и «Сделать карточку». ИИ подменён в странице. Запуск: vite preview --mode web …, затем URL=… OUT=… node e2e/v132-solve.mjs
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
const MD = ['### Условие', 'Дано: $s = 120\\ \\text{км}$, $t = 1{,}5\\ \\text{ч}$. Найти: $v$.', '### Решение', '1. Скорость — путь, делённый на время:', '$$v = \\frac{s}{t} = \\frac{120}{1{,}5} = 80\\ \\text{км/ч}$$', '2. В метрах в секунду: $80 \\cdot \\frac{1000}{3600} \\approx 22{,}2\\ \\text{м/с}$.', '### Ответ', '80 км/ч ≈ 22,2 м/с', '### Проверка', '$80 \\cdot 1{,}5 = 120$ — сходится.'].join('\n');

for (const v of [
  { name: '360', width: 360, height: 800 },
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
    localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'topic', id: 'g6' }, at: Date.now() } }));
  }, seed());
  await page.reload();
  await page.waitForTimeout(900);
  await page.evaluate((md) => {
    window.__asked = [];
    window.mnemaApi.aiAsk = async (r) => (window.__asked.push(r), await new Promise((ok) => setTimeout(ok, 300)), { ok: true, text: md });
  }, MD);
  await page.getByRole('button', { name: 'Действия с темой' }).click();
  await page.getByRole('menuitem', { name: /Решить задачу по шагам/ }).click();
  await page.locator('.modal input[type=file]').setInputFiles('test-fixtures/page47.jpg');
  await page.locator('.solve-photo img').waitFor();
  await page.getByRole('button', { name: /^Решить$/ }).click();
  await page.locator('.solve-result .katex').first().waitFor();
  const asked = await page.evaluate(() => window.__asked.at(-1));
  const img = asked.refrain?.image;
  check(asked.refrain?.task === 'solve' && img && img.data.length * 0.75 < 2 * 1024 * 1024, `${v.name}: Refrain ИИ — задача solve, фото уменьшено (${img ? Math.round((img.data.length * 0.75) / 1024) : '?'} КБ)`);
  check((await page.locator('.solve-result .katex').count()) >= 4, `${v.name}: формулы отрисованы KaTeX`);
  const wide = await page.evaluate(() => [...document.querySelectorAll('.modal')].every((m) => m.scrollWidth <= m.clientWidth + 1) && document.documentElement.scrollWidth <= innerWidth + 1);
  check(wide, `${v.name}: окно без прокрутки вбок (длинная формула прокручивается сама)`);
  if (OUT) await page.screenshot({ path: join(OUT, `solve-${v.name}.png`) });
  await page.getByRole('button', { name: 'В конспект' }).click();
  await page.getByRole('button', { name: 'Сделать карточку' }).click();
  const d = await page.evaluate(() => {
    const raw = localStorage.getItem('mnema-data-pending');
    return raw;
  });
  check((await page.getByRole('button', { name: /В конспекте ✓/ }).count()) === 1 && (await page.getByRole('button', { name: /Карточка есть ✓/ }).count()) === 1, `${v.name}: решение в конспекте и карточка создана`);
  await page.getByRole('button', { name: 'Закрыть' }).last().click();
  await page.waitForTimeout(400);
  if (OUT) await page.screenshot({ path: join(OUT, `solve-note-${v.name}.png`) });
  check(/22,2 м\/с/.test(await page.locator('main').innerText()), `${v.name}: решение видно в конспекте темы`);
  check(!errors.length, `${v.name}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
