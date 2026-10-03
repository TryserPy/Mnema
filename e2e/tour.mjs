// Обзор экранов: скриншоты всех основных мест (полные страницы).
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT;
fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/mnemaTour';
fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
const setH = (h) => app.evaluate(({ BrowserWindow }, h) => BrowserWindow.getAllWindows()[0].setSize(1280, h), h);
const shot = async (n, full = false) => {
  await win.waitForTimeout(400);
  if (full) {
    const h = await win.evaluate(() => { const m = document.querySelector('.main'); return m ? m.scrollHeight : document.body.scrollHeight; });
    await setH(Math.min(3900, Math.max(820, h + 40)));
    await win.waitForTimeout(500);
  }
  await win.screenshot({ path: `${OUT}/${n}.png` });
  if (full) { await setH(820); await win.waitForTimeout(200); }
};
await win.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.waitForTimeout(500);
if (process.env.ALL) {
  await win.getByRole('button', { name: 'Возможности' }).click();
  for (const sw of await win.locator('.feature .switch:not(.on), .feature [role=switch][aria-checked=false]').all()) await sw.click().catch(() => {});
}
await win.getByRole('button', { name: 'Сегодня' }).first().click();
await shot('t01-today', true);
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.tree-label').click();
await shot('t02-subject', true);
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await shot('t03-topic', true);
await win.getByRole('button', { name: 'Статистика' }).first().click().catch(() => {});
await shot('t04-stats', true);
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await shot('t05-settings', true);
await win.getByRole('button', { name: 'Возможности' }).click();
await shot('t06-features', true);
console.log('errors', JSON.stringify(errors));
await app.close();
