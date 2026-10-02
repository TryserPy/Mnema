// Длинный конспект (блоки вне экрана не раскладываются): прокрутка не «прыгает», выделение и панель работают далеко от начала.
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/longnote.mjs
import { chromium } from 'playwright';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
await page.evaluate(() => {
  const at = new Date().toISOString();
  const note = Array.from({ length: 120 }, (_, i) => (i % 15 === 0 ? `## Раздел ${i / 15 + 1}\n\n` : '') + `Абзац ${i}: ${'слово '.repeat(20 + (i % 7) * 12)}метка${i}. Формула $F_${i}=ma$.`).join('\n\n');
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Длинная', note, createdAt: at, updatedAt: at }], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true } }));
});
await page.reload();
await page.waitForTimeout(600);
await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
await page.locator('.tree-row', { hasText: 'Длинная' }).locator('.tree-label').click();
await page.locator('.ProseMirror').waitFor();
await page.waitForTimeout(800);
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
check(await page.evaluate(() => document.querySelector('.ProseMirror').hasAttribute('data-long')), 'длинный конспект помечен (data-long)');
const scroller = await page.evaluate(() => { const el = document.querySelector('.ProseMirror'); let p = el; while (p && !(p.scrollHeight > p.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement; p?.setAttribute('data-sc', '1'); return !!p; });
check(scroller, 'нашли прокручиваемый контейнер');
const h0 = await page.evaluate(() => document.querySelector('[data-sc]').scrollHeight);
// медленно проматываем вниз: смотрим, чтобы верх видимого блока не «прыгал» назад
let jumps = 0;
let prevTop = 0;
for (let i = 0; i < 40; i++) {
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(40);
  const t = await page.evaluate(() => document.querySelector('[data-sc]').scrollTop);
  if (t < prevTop - 5) jumps++;
  prevTop = t;
}
const h1 = await page.evaluate(() => document.querySelector('[data-sc]').scrollHeight);
console.log(`   высота: до ${h0}, после прохода ${h1} px; скачков назад: ${jumps}`);
check(jumps === 0, 'прокрутка вниз без скачков назад');
// выделение и панель далеко от начала
const w = await page.evaluate(() => {
  const ws = document.createTreeWalker(document.querySelector('.ProseMirror'), NodeFilter.SHOW_TEXT);
  let best = null;
  for (let n = ws.nextNode(); n; n = ws.nextNode()) {
    const i = n.textContent.indexOf('метка');
    if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 5);
    const b = r.getBoundingClientRect();
    if (b.top > 80 && b.bottom < innerHeight - 80) { best = { x: b.x + b.width / 2, y: b.y + b.height / 2 }; break; }
  }
  return best;
});
check(!!w, 'на экране есть абзац со словом «метка»');
if (w) {
  await page.mouse.dblclick(w.x, w.y);
  await page.mouse.click(w.x, w.y, { button: 'right' });
  await page.waitForTimeout(500);
  check(await page.locator('.sel-panel').isVisible(), 'правая кнопка по слову в середине длинного конспекта — панель появилась');
  await page.locator('.sel-panel .sel-fmt button', { hasText: 'Рамка' }).click();
  await page.waitForTimeout(600);
  check(await page.locator('.sel-panel').isVisible(), 'после «Рамка» панель осталась и в длинном конспекте');
  await page.keyboard.press('Escape');
}
// вверх: порядок и положение не потеряны
await page.evaluate(() => { document.querySelector('[data-sc]').scrollTop = 0; });
await page.waitForTimeout(300);
check(await page.evaluate(() => document.querySelector('[data-sc]').scrollTop) === 0, 'вернулись к началу');
await page.screenshot({ path: `${OUT}/longnote.png` });
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
