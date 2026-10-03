import { _electron as electron } from 'playwright';
import fs from 'fs';
const dir = '/tmp/mnemaSt'; fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.locator('.set-nav-item', { hasText: 'Стили' }).click();
await win.waitForTimeout(400);
// Включённые стили собираются в <style id="mnema-mods">: включил — CSS появился, выключил — исчез, остальное как было.
const snap = () => win.evaluate(() => [document.getElementById('mnema-mods')?.textContent ?? '', getComputedStyle(document.querySelector('.main')).backgroundImage.slice(0, 20), getComputedStyle(document.body).fontFamily.slice(0, 14)].join(' | '));
const base = await snap();
console.log('base', base);
const names = await win.locator('.st-tile .st-name').allInnerTexts();
for (const n of names) {
  const tile = win.locator('.st-tile', { has: win.locator('.st-name', { hasText: new RegExp('^' + n + '$') }) });
  await tile.click(); await win.waitForTimeout(250);
  const on = await snap();
  await tile.click(); await win.waitForTimeout(250);
  const off = await snap();
  console.log(n.padEnd(20), on === base ? 'NO CHANGE' : 'changes', off === base ? 'reverts' : 'NOT REVERTED: ' + off);
}
await app.close();
