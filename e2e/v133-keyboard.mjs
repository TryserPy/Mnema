// 1.33, №8: телефон с открытой экранной клавиатурой. visualViewport подменяется (у Playwright нет настоящей клавиатуры):
// видимая часть на KB px ниже окна, как в Android WebView, где 100dvh не уменьшается.
// Проверяем: панель выделения — лист над клавиатурой, не закрывает выделенный текст; нижняя навигация и 🐞 спрятаны;
// у окна «Новая карточка» кнопки «Отмена»/«Добавить» над клавиатурой. 360×800 и 412×915.
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=http://localhost:4174 [OUT=папка] node e2e/v133-keyboard.mjs
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

function fakeKeyboard() {
  const vv = new EventTarget();
  vv.offsetTop = 0;
  vv.offsetLeft = 0;
  vv.scale = 1;
  vv.kb = 0;
  Object.defineProperty(vv, 'height', { get: () => window.innerHeight - vv.kb });
  Object.defineProperty(vv, 'width', { get: () => window.innerWidth });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  window.__kb = (px) => {
    vv.kb = px;
    vv.dispatchEvent(new Event('resize'));
  };
}

for (const v of [
  { name: '360', width: 360, height: 800, kb: 300 },
  { name: '412', width: 412, height: 915, kb: 330 }
]) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(fakeKeyboard);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  const data = seed();
  data.topics.find((t) => t.id === 'g2').note = 'Параллелограмм — это четырёхугольник, у которого противоположные стороны попарно параллельны.\n\n' + 'Свойства параллелограмма. '.repeat(30);
  await page.evaluate((data) => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    sessionStorage.setItem('refrain-no-splash', String(Date.now()));
    localStorage.setItem('mnema-data-pending', JSON.stringify(data));
    localStorage.setItem('refrain-dev', '1');
    localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'topic', id: 'g2' }, at: Date.now() } }));
  }, data);
  await page.reload();
  await page.waitForTimeout(1500);
  const tag = v.name;
  // Выделить «четырёхугольник» и открыть панель «Выделенное», клавиатура открыта.
  await page.locator('.ProseMirror').first().waitFor();
  await page.evaluate(() => {
    const w = document.createTreeWalker(document.querySelector('.ProseMirror'), NodeFilter.SHOW_TEXT);
    let t = w.nextNode();
    while (t && !t.textContent.includes('четырёхугольник')) t = w.nextNode();
    const i = t.textContent.indexOf('четырёхугольник');
    const r = document.createRange();
    r.setStart(t, i);
    r.setEnd(t, i + 'четырёхугольник'.length);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await page.locator('.ProseMirror').first().focus();
  await page.evaluate((kb) => window.__kb(kb), v.kb);
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.documentElement.hasAttribute('data-kb')), `${tag}: клавиатура замечена (html[data-kb])`);
  check(!(await page.locator('.tabbar').isVisible().catch(() => false)), `${tag}: нижняя навигация спрятана при клавиатуре`);
  check(!(await page.locator('.dev-fab').isVisible().catch(() => false)), `${tag}: 🐞 не закрывает конспект`);
  const selBtn = page.getByRole('button', { name: /Выделенное/ }).first();
  await selBtn.click();
  const panel = page.locator('.bubble.sel-panel');
  await panel.waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  const pr = await panel.boundingBox();
  const visible = v.height - v.kb;
  check(pr.y + pr.height <= visible + 1, `${tag}: панель целиком над клавиатурой (низ ${Math.round(pr.y + pr.height)} ≤ ${visible})`);
  const selRect = await page.evaluate(() => {
    const r = getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : null;
    return r && { top: r.top, bottom: r.bottom };
  });
  check(selRect && selRect.bottom <= pr.y, `${tag}: выделенный текст над панелью (${selRect && Math.round(selRect.bottom)} ≤ ${Math.round(pr.y)})`);
  const fmt = await page.locator('.sel-fmt').boundingBox();
  const act = await page.locator('.sel-actions').boundingBox();
  check(fmt && act && fmt.y + fmt.height <= act.y + 1, `${tag}: оформление и действия в панели не налезают друг на друга`);
  const fmtVisible = await page.evaluate(() => { const p = document.querySelector(".bubble.sel-panel").getBoundingClientRect(); const f = document.querySelector(".sel-fmt").getBoundingClientRect(); return f.top >= p.top - 1 && f.bottom <= p.bottom + 1; });
  check(fmtVisible, `${tag}: кнопки оформления (Ж К М Н) видны в панели`);
  if (OUT) await page.screenshot({ path: join(OUT, `kb-panel-${tag}.png`) });
  // Окно карточки с клавиатурой: кнопки над ней.
  await page.evaluate(() => window.__kb(0));
  await page.getByRole('button', { name: 'В карточку' }).first().click();
  const modal = page.locator('.modal').last();
  await modal.waitFor();
  await page.evaluate((kb) => window.__kb(kb), v.kb);
  await page.waitForTimeout(300);
  const add = modal.getByRole('button', { name: /^(Добавить|Сохранить)$/ });
  await add.scrollIntoViewIfNeeded();
  const ab = await add.boundingBox();
  check(ab && ab.y + ab.height <= visible + 1, `${tag}: «Добавить» в окне карточки над клавиатурой (${ab && Math.round(ab.y + ab.height)} ≤ ${visible})`);
  if (OUT) await page.screenshot({ path: join(OUT, `kb-modal-${tag}.png`) });
  check(errors.length === 0, `${tag}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
