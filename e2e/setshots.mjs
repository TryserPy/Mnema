// Скриншоты всех разделов настроек (высота по содержимому). THEME=dark — тёмная тема. W — ширина окна.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT || 'set';
fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/mnemaSet';
fs.rmSync(dir, { recursive: true, force: true });
const W = Number(process.env.W || 1280);
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const setH = (h) => app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setSize(w, h), [W, h]);
await setH(820);
const shot = async (n) => {
  await win.waitForTimeout(450);
  const h = await win.evaluate(() => document.querySelector('.main').scrollHeight);
  await setH(Math.min(3900, Math.max(820, h + 40)));
  await win.waitForTimeout(450);
  await win.screenshot({ path: `${OUT}/${n}.png` });
  await setH(820);
};
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.waitForTimeout(400);
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
if (process.env.THEME === 'dark') { await win.getByRole('radio', { name: 'Тёмная' }).click(); await win.waitForTimeout(500); }
if (process.env.MODS) {
  await win.locator('.set-nav-item', { hasText: 'Возможности' }).click();
  await win.getByRole('switch', { name: 'ИИ-помощник' }).click();
}
const names = (process.env.ONLY || '').split(',').filter(Boolean);
const items = await win.locator('.set-nav-item').allInnerTexts();
console.log('sections:', items.join(' | '));
for (let i = 0; i < items.length; i++) {
  const t = items[i].trim();
  if (names.length && !names.some((n) => t.startsWith(n))) continue;
  await win.locator('.set-nav-item', { hasText: t }).first().click();
  await shot(String(i).padStart(2, '0') + '-' + t.replace(/[^\p{L}]+/gu, '_'));
}
// переполнения по горизонтали
const over = await win.evaluate(() => [...document.querySelectorAll('.main *')].filter((e) => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0).slice(0, 10).map((e) => e.className + ' ' + e.scrollWidth + '>' + e.clientWidth));
console.log('overflow', JSON.stringify(over));
console.log('errors', JSON.stringify(errors));
await app.close();
