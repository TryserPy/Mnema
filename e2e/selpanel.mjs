// Панель выделения в конспекте (правая кнопка по слову): после «Список» и «Рамка» она должна остаться на месте.
// Раньше эти кнопки сдвигали позиции выделения, и панель пряталась — приходилось вызывать её заново.
// Запуск: URL=http://localhost:4174 NODE_PATH=$(npm root -g) node e2e/selpanel.mjs
import { chromium } from 'playwright';
const URL = process.env.URL ?? 'http://localhost:4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
await page.evaluate(() => {
  const at = new Date().toISOString();
  const note = 'Первый абзац про фотосинтез и хлорофилл.\n\nВторой абзац про дыхание клетки.\n\nТретий абзац про обмен веществ.';
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note, createdAt: at, updatedAt: at }], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true } }));
});
await page.reload();
await page.waitForTimeout(600);
await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
await page.locator('.tree-row', { hasText: 'Клетка' }).locator('.tree-label').click();
await page.locator('.ProseMirror').waitFor();
await page.waitForTimeout(500);

let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const panel = () => page.locator('.sel-panel').isVisible();
const wordBox = async (word) =>
  page.evaluate((w) => {
    const walker = document.createTreeWalker(document.querySelector('.ProseMirror'), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent.indexOf(w);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + w.length);
        const b = r.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    }
    return null;
  }, word);
const open = async (word) => {
  const p = await wordBox(word);
  await page.mouse.dblclick(p.x, p.y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForTimeout(500);
};

await open('фотосинтез');
check(await panel(), 'правая кнопка по слову — панель появилась');
for (const label of ['Рамка', 'Список']) {
  await page.locator('.sel-panel .sel-fmt button', { hasText: label }).click();
  await page.waitForTimeout(700);
  check(await panel(), `после «${label}» панель осталась`);
  const on = await page.locator('.sel-panel .sel-fmt button.on', { hasText: label }).count();
  check(on === 1, `кнопка «${label}» подсвечена (включено)`);
  await page.locator('.sel-panel .sel-fmt button', { hasText: label }).click();
  await page.waitForTimeout(700);
  check(await panel(), `после повторного «${label}» (выключить) панель осталась`);
}
// несколько нажатий подряд: Рамка → Жирный → Список → Маркер
for (const label of ['Рамка', 'Жирный', 'Список', 'Маркер']) {
  await page.locator('.sel-panel .sel-fmt button', { hasText: label }).click();
  await page.waitForTimeout(450);
}
check(await panel(), 'после цепочки «Рамка → Жирный → Список → Маркер» панель осталась');
// выделение сменилось — панель должна спрятаться (как и раньше)
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(!(await panel()), 'Esc прячет панель');
const p2 = await wordBox('дыхание');
await page.mouse.click(p2.x, p2.y);
await page.waitForTimeout(500);
check(!(await panel()), 'обычный щелчок по тексту панель не вызывает');
await open('дыхание');
check(await panel(), 'правая кнопка по другому слову — панель снова появилась');
await page.screenshot({ path: (process.env.OUT ?? 'out') + '/selpanel.png' });
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
