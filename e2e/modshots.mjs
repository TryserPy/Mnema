import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = 'mods'; fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/mnemaMods'; fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
const errors = []; win.on('pageerror', (e) => errors.push(e.message));
const shot = async (n) => { await win.waitForTimeout(450); await win.screenshot({ path: `${OUT}/${n}.png` }); };
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.locator('.set-nav-item', { hasText: 'Возможности' }).click();
await win.getByRole('switch', { name: 'Моды' }).click();
await win.locator('.set-nav-item', { hasText: 'Моды' }).click();
await win.getByRole('button', { name: 'Разрешить моды' }).click();
await win.getByRole('button', { name: 'Разрешить', exact: true }).click();
await win.waitForTimeout(300);
await shot('m1-catalog');
for (const b of await win.locator('.plug-card button', { hasText: 'Установить' }).all()) { await win.locator('.plug-card button', { hasText: 'Установить' }).first().click(); await win.waitForTimeout(150); }
await win.getByRole('radio', { name: /Мои/ }).click();
await win.waitForTimeout(1000);
await shot('m2-installed');
await win.getByRole('radio', { name: /Сделать свой/ }).click();
await shot('m3-own');
// Сайдбар: где моды
await shot('m4-side');
const foot = win.locator('.foot-more button').first();
if (await foot.count()) { await foot.click(); await shot('m5-footmenu'); await win.keyboard.press('Escape'); }
// Выключить моды: каталог пропадает
await win.getByRole('button', { name: /Выключить моды/ }).click();
await shot('m6-safe');
console.log('errors', JSON.stringify(errors));
await app.close();
