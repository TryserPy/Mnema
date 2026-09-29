// Снимки всех экранов: пусто и с примером, светлая/тёмная.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT;
const dir = '/tmp/mnemaAudit';
fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
const shot = async (n) => { await win.waitForTimeout(450); await win.screenshot({ path: `${OUT}/${n}.png` }); };
await shot('01-welcome');
// Пусто: пропустить пример
const skip = win.getByRole('button', { name: /Начать с нуля|Создать свой|Свой предмет|Пропустить/ });
console.log('welcome buttons:', await win.getByRole('button').allInnerTexts());
if (await skip.count()) await skip.first().click();
await shot('02-today-empty');
await win.locator('.foot-btn[aria-label="Возможности"]').click();
await win.getByRole('switch', { name: 'Карта знаний' }).click();
await win.getByRole('switch', { name: 'Расписание уроков' }).click();
await shot('03-features');
await win.getByRole('button', { name: 'Статистика' }).click();
await shot('04-stats-empty');
const mapTab = win.getByRole('radio', { name: /Карта/ });
if (await mapTab.count()) { await mapTab.click(); await shot('05-map-empty'); }
await win.getByRole('button', { name: 'Сегодня' }).first().click();
await shot('06-today-empty-schedule');
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await shot('07-settings');
console.log('errors', JSON.stringify(errors));
await app.close();
