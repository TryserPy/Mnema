// 1.33, №5: «Добавить из учебника» — скриншот переписки в тёмной теме, локальный ИИ не запущен.
// Ожидаем: одна главная причина с одним действием, без «прочитана без интернета» рядом с «не удаётся подключиться»,
// совет про скриншот вместо «включи свет», остальное свёрнуто; «Настройки ИИ» открываются поверх окна и Esc закрывает только их.
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=http://localhost:4174 [OUT=папка] node e2e/v133-textbook-msgs.mjs
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
  await page.evaluate((data) => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    sessionStorage.setItem('refrain-no-splash', String(Date.now()));
    localStorage.setItem('mnema-data-pending', JSON.stringify(data));
    localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'topic', id: 'g2' }, at: Date.now() } }));
  }, seed());
  await page.reload();
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.mnemaApi.aiAsk = async () => ({ ok: false, error: 'Не удаётся подключиться. Если это программа на компьютере (LM Studio, Ollama) — запусти в ней сервер.' });
  });
  // Скриншот переписки: тёмный фон, светлый текст.
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 600;
    const g = c.getContext('2d');
    g.fillStyle = '#121212';
    g.fillRect(0, 0, 900, 600);
    g.fillStyle = '#b48cff';
    g.fillRect(120, 40, 700, 300);
    g.fillStyle = '#fff';
    g.font = '40px sans-serif';
    ['псина', '8/10', 'Средненького, можно и лучше', '+ бал за оригинальность'].forEach((t, i) => g.fillText(t, 150, 100 + i * 60));
    return c.toDataURL('image/png').split(',')[1];
  });
  const dom = async (t) => {
    const ok = await page.evaluate((t) => {
      const b = [...document.querySelectorAll('button,a,[role=button],[role=menuitem]')].find((x) => x.innerText.includes(t));
      b && b.click();
      return !!b;
    }, t);
    await page.waitForTimeout(500);
    return ok;
  };
  if (!(await dom('Из учебника'))) {
    await dom('Ещё');
    await dom('Из учебника');
  }
  await page.locator('.modal input[type=file]').setInputFiles({ name: 'Screenshot_20261018-211700.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('.tb-page img').first().waitFor();
  await page.getByRole('button', { name: /^(Сделать конспект|Распознать)/ }).click();
  await page.locator('.tb-review, [data-part="tb-messages"]').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(600);
  const box = page.locator('[data-part="tb-messages"]').first();
  const visible = await box.locator('.hint').allInnerTexts();
  const all = visible.join('\n');
  if (OUT) await page.screenshot({ path: join(OUT, `tb-msgs-${v.name}.png`) });
  check(visible.length === 1, `${v.name}: видно одно главное сообщение (а не столбик): ${visible.length}`);
  check(/LM Studio или Ollama/.test(all) && !/без интернета/.test(all), `${v.name}: причина без противоречия «без интернета»`);
  check(await box.getByRole('button', { name: 'Настройки ИИ' }).isVisible(), `${v.name}: одно главное действие «Настройки ИИ»`);
  const more = box.getByRole('button', { name: /^Ещё \d/ });
  if (await more.count()) {
    await more.click();
    const opened = (await box.locator('.hint').allInnerTexts()).join('\n');
    check(!/включи свет/.test(opened), `${v.name}: свёрнутое раскрывается, для скриншота нет «включи свет»`);
    await more.click();
  } else check(true, `${v.name}: других подсказок нет — свёрнутого блока тоже нет`);
  // Настройки ИИ поверх окна; Esc закрывает только их.
  await box.getByRole('button', { name: 'Настройки ИИ' }).click();
  await page.locator('.modal[aria-label="Настройки ИИ"]').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check((await page.locator('.modal[aria-label="Настройки ИИ"]').count()) === 0 && (await page.locator('.modal[aria-label="Добавить из учебника"]').count()) === 1, `${v.name}: Esc закрыл только «Настройки ИИ», прочитанное не потерялось`);
  check(errors.length === 0, `${v.name}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
