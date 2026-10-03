import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = 'hw'; fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/mnemaHw'; fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
await app.evaluate(({ ipcMain }) => { globalThis.__sched = []; ipcMain.on('notify:schedule', (_e, l) => (globalThis.__sched = l)); });
const win = await app.firstWindow();
const errors = []; win.on('pageerror', (e) => errors.push(e.message)); win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = async (n) => { await win.waitForTimeout(450); await win.screenshot({ path: `${OUT}/${n}.png` }); };
const step = (s) => console.log('•', s);
await win.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.waitForTimeout(300);
await win.locator('.add-schedule').click();
await win.waitForTimeout(300);
await win.getByRole('button', { name: 'Заполнить расписание' }).click();
await win.waitForTimeout(300);
const plan = { 0: ['Физика', 'История'], 1: ['Биология'], 3: ['Физика', 'Биология'], 5: ['История'] };
for (const [i, subs] of Object.entries(plan)) for (const sName of subs) {
  await win.locator('.sched-day').nth(Number(i)).locator('.sched-add').click();
  await win.locator('.sched-menu button', { hasText: sName }).click();
}
await shot('h1-editor');
await win.getByRole('button', { name: 'Готово' }).click();
await win.waitForTimeout(400);
// Домашка: быстрая запись
await win.locator('.nav-item', { hasText: 'Домашка' }).click();
await win.waitForTimeout(300);
await shot('h2-empty');
const add = async (text, subj, dueLabel) => {
  await win.locator('.hw-quick-input').fill(text);
  if (subj) { await win.locator('.pill-btn').first().click(); await win.locator('.pill-menu .menu button', { hasText: subj }).click(); }
  if (dueLabel) { await win.locator('.pill-btn').nth(1).click(); await win.locator('.pill-menu .menu button', { hasText: dueLabel }).first().click(); }
  await win.locator('.hw-quick-input').press('Enter');
  await win.waitForTimeout(250);
};
await add('§ 8, упр. 3 и 5', 'Физика');
await add('Выучить даты реформы 1861 года и написать короткое эссе о причинах отмены крепостного права — не больше страницы', 'История', 'Через неделю');
await add('Лабораторная: клетка под микроскопом', 'Биология', 'Завтра');
await add('Принести сменку', null, 'Без срока');
await shot('h3-list');
await win.locator('.hw-circle').first().click();
await win.waitForTimeout(500);
await shot('h4-done');
step('notify: ' + (await app.evaluate(() => globalThis.__sched.length)));
await win.locator('.nav-item', { hasText: 'Сегодня' }).click();
await win.waitForTimeout(400);
await shot('h5-today');
await win.evaluate(() => document.querySelector('.les-card')?.scrollIntoView());
await shot('h6-today-lessons');
console.log('errors', JSON.stringify(errors));
await app.close();
