// Вкладки темы с множеством списков: ничего не прокручивается, лишнее — в «Ещё».
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT || 'tabs';
fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/mnemaTabs';
fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await win.waitForTimeout(600);
const kinds = ['Словарь', 'Термины', 'Даты', 'Формулы', 'Список', 'Термины'];
for (const k of kinds) {
  await win.getByRole('button', { name: 'Добавить словарь или список' }).click();
  await win.getByRole('menuitem', { name: new RegExp('^' + k) }).first().click();
  await win.waitForTimeout(250);
}
await win.waitForTimeout(400);
await win.screenshot({ path: `${OUT}/tabs-wide.png`, clip: { x: 248, y: 0, width: 1032, height: 300 } });
console.log('visible tabs', await win.locator('.otabs > .otab').count(), 'more', await win.locator('.otab-more').count());
await win.locator('.otab-more .otab').click();
await win.waitForTimeout(300);
await win.screenshot({ path: `${OUT}/tabs-more.png`, clip: { x: 248, y: 0, width: 1032, height: 500 } });
await win.locator('.otab-more .menu button').last().click();
await win.waitForTimeout(400);
console.log('selected', await win.locator('.otab.on').innerText());
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 800));
await win.waitForTimeout(600);
await win.screenshot({ path: `${OUT}/tabs-narrow.png`, clip: { x: 0, y: 0, width: 900, height: 300 } });
const scroll = await win.evaluate(() => { const t = document.querySelector('.topic-tabs'); return t.scrollWidth - t.clientWidth; });
console.log('tabs overflow', scroll, 'errors', JSON.stringify(errors));
await app.close();
