// 1.33, №6: маркер в редакторе конспекта — выделение со знаками препинания (Ctrl+Shift+H), ввод «(==…==)»,
// формула с «=» — после перезагрузки маркер на месте и не протёк в соседнюю строку.
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=http://localhost:4174 node e2e/v133-highlight.mjs
import { chromium } from 'playwright';
import { seed } from './v132-seed.mjs';

const URL = process.env.URL ?? 'http://localhost:4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => {
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
};
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
const data = seed();
data.topics.find((t) => t.id === 'g2').note = 'Параллелограмм: это четырёхугольник, у которого (стороны) попарно параллельны.\n\nВторая строка без маркера.\n\nЗакон: x = 5 и $a=b$ верно.';
await page.evaluate((data) => {
  sessionStorage.setItem('mnema-web-test-ok', '1');
  sessionStorage.setItem('refrain-no-splash', String(Date.now()));
  localStorage.setItem('mnema-data-pending', JSON.stringify(data));
  localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'topic', id: 'g2' }, at: Date.now() } }));
}, data);
await page.reload();
await page.waitForTimeout(1500);
const pm = page.locator('.ProseMirror').first();
await pm.waitFor();
// Выделить «Параллелограмм: это четырёхугольник,» (со знаками) в первом абзаце.
await page.evaluate(() => {
  const p = document.querySelector('.ProseMirror p');
  const t = p.firstChild;
  const r = document.createRange();
  r.setStart(t, 0);
  r.setEnd(t, 'Параллелограмм: это четырёхугольник,'.length);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
});
await pm.focus();
await page.keyboard.press('Control+Shift+H');
await page.waitForTimeout(200);
// Набрать «(==в скобках==)» в конце второй строки.
await page.locator('.ProseMirror p', { hasText: 'Вторая строка' }).click();
await page.keyboard.press('End');
await page.keyboard.type(' (==в скобках, да==)');
// «x = 5»: выделить и маркер.
await page.evaluate(() => {
  const p = [...document.querySelectorAll('.ProseMirror p')].find((x) => x.textContent.startsWith('Закон'));
  const t = p.firstChild;
  const r = document.createRange();
  r.setStart(t, 'Закон: '.length);
  r.setEnd(t, 'Закон: x = 5'.length);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
});
await page.keyboard.press('Control+Shift+H');
await page.waitForTimeout(800);
await page.reload();
await page.waitForTimeout(1500);
const marks = await page.locator('.ProseMirror mark').allInnerTexts();
check(marks.includes('Параллелограмм: это четырёхугольник,'), `выделение со знаками — маркер после перезагрузки: ${JSON.stringify(marks)}`);
check(marks.some((m) => m.includes('в скобках, да')), 'ввод «(==…==)» после скобки — маркер');
check(marks.includes('x = 5'), '«x = 5» с «=» внутри — маркер');
check(!(await page.locator('.ProseMirror p', { hasText: 'Вторая строка' }).locator('mark', { hasText: 'Вторая' }).count()), 'маркер не протёк в соседнюю строку');
check((await page.locator('.ProseMirror').innerText()).indexOf('==') === -1, 'нигде не видно сырых «==»');
check(errors.length === 0, `без ошибок страницы ${errors.join('; ')}`);
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
