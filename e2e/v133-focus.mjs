// 1.33, №14: помодоро — встроенный таймер (работа, пауза, свёрнут, перерыв, конец перерыва) и мод «Помодоро»
// по центру и без наложений на ПК и на 360. Запуск: vite preview … --port 4174, затем URL=… [OUT=папка] node e2e/v133-focus.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { seed } from './v132-seed.mjs';

const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT;
if (OUT) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => {
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
};
const shot = async (page, name) => OUT && page.screenshot({ path: join(OUT, name + '.png') });

for (const v of [
  { name: 'desk', width: 1280, height: 820 },
  { name: '360', width: 360, height: 800 }
]) {
  const mobile = v.width < 900;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  const d = seed();
  await page.evaluate((d) => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    sessionStorage.setItem('refrain-no-splash', String(Date.now()));
    localStorage.setItem('mnema-data-pending', JSON.stringify(d));
    localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'settings', section: 'study' }, at: Date.now() } }));
  }, d);
  await page.reload();
  await page.waitForTimeout(1300);
  const tag = v.name;
  // Настройки фокуса: наборы и кнопка — в строках с отступами, как остальные настройки (а не прижаты к левому краю).
  const group = page.locator('.sgroup', { has: page.locator('.focus-presets') });
  const gb = await group.boundingBox();
  const rowsOk = await page.evaluate(() => {
    const body = document.querySelector('.focus-presets').closest('.sgroup-body').getBoundingClientRect();
    const items = [...document.querySelectorAll('.focus-presets .chip-btn'), ...[...document.querySelectorAll('.srow .btn')].filter((b) => /фокус|заново|таймер/i.test(b.textContent))];
    return items.length >= 5 && items.every((el) => { const r = el.getBoundingClientRect(); return r.left >= body.left + 8 && r.right <= body.right - 8 && r.bottom <= body.bottom; });
  });
  check(Boolean(gb) && rowsOk, `${tag}: наборы 25/5… и «Начать фокус» внутри карточки настроек, с отступами`);
  await page.locator('.focus-presets').scrollIntoViewIfNeeded();
  await shot(page, `focus-settings-${tag}`);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /^(Начать фокус|Начать заново)$/ }).click();
  const pill = page.locator('.focus-pill').first();
  await pill.waitFor();
  const t0 = await page.locator('.focus-time').first().textContent();
  check(/^(25:00|24:5\d)$/.test(t0.trim()), `${tag}: на старте 25:00, а не больше (${t0.trim()})`);
  const inView = async (label) => {
    const b = await pill.boundingBox();
    const W = v.width;
    check(b && b.x >= 0 && b.x + b.width <= W + 1 && b.y + b.height <= v.height, `${tag}: ${label} — таймер на экране`);
    const centered = await pill.evaluate((el) => {
      const kids = [...el.children].filter((c) => getComputedStyle(c).display !== 'none');
      const r = el.getBoundingClientRect();
      // Всё внутри по вертикальному центру «пилюли» и ничего не вылезает за её край.
      return kids.every((c) => {
        const b = c.getBoundingClientRect();
        return b.left >= r.left - 1 && b.right <= r.right + 1 && Math.abs(b.top + b.height / 2 - (r.top + r.height / 2)) < r.height / 2;
      });
    });
    check(centered, `${tag}: ${label} — содержимое ровно внутри`);
    await shot(page, `focus-${label}-${tag}`);
  };
  await inView('работа');
  await page.getByRole('button', { name: 'Пауза' }).click();
  await inView('пауза');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByRole('button', { name: 'Сразу перерыв' }).click();
  await inView('перерыв');
  await page.getByRole('button', { name: 'Свернуть таймер' }).click();
  await inView('свёрнут');
  await pill.click();
  await page.getByRole('button', { name: 'Остановить фокус' }).click();
  check(errors.length === 0, `${tag}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
