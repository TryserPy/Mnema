import { _electron as electron } from 'playwright';
import fs from 'fs';
const dir = '/tmp/mnemaSt'; fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.locator('.set-nav-item', { hasText: 'Стили' }).click();
await win.waitForTimeout(400);
const snap = () => win.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const cs = (s, p) => (q(s) ? getComputedStyle(q(s))[p] : '-');
  return [cs('.main', 'backgroundImage').slice(0, 20), cs('body', 'fontFamily').slice(0, 14), cs('.style-preview .btn', 'minHeight'), cs('.style-preview .question', 'fontSize'), cs('.style-preview .review-card', 'backgroundColor'), cs('.style-preview .grade.again', 'borderRadius'), cs('.style-preview .hero', 'boxShadow').slice(0, 12), cs('.style-preview .hero-sub', 'display'), cs('.style-preview .note-doc', 'fontSize')].join(' ; ');
});
const base = await snap();
console.log('base', base);
const names = await win.locator('.style-item strong').allInnerTexts();
for (const n of names) {
  const sw = win.getByRole('switch', { name: n, exact: true });
  await sw.click(); await win.waitForTimeout(250);
  const on = await snap();
  await sw.click(); await win.waitForTimeout(250);
  const off = await snap();
  console.log(n.padEnd(20), on === base ? 'NO CHANGE' : 'changes', off === base ? 'reverts' : 'NOT REVERTED: ' + off);
}
await app.close();
