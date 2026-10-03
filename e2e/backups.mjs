// 1.19 (Electron): «Настройки → Данные → Автокопии» — список копий по дням, что внутри, «Вернуть эту копию», «Вернуть как было».
// Запуск: NODE_PATH=$(npm root -g) xvfb-run -a node e2e/backups.mjs
import { _electron as electron } from 'playwright';
import fs from 'fs';
import path from 'path';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/mnemaBk';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const at = '2026-09-20T10:00:00.000Z';
const data = (topics, cards) => JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#22A06B', createdAt: at }], topics: topics.map((n, i) => ({ id: 't' + i, subjectId: 's1', name: n, note: '', createdAt: at, updatedAt: at })), cards: Array.from({ length: cards }, (_, i) => ({ id: 'c' + i, topicId: 't0', type: 'basic', front: 'Вопрос ' + i, back: 'Ответ', createdAt: at, updatedAt: at })), states: {}, logs: [], tests: [], settings: { onboarded: true } });
const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
// Сейчас — 3 темы; вчерашняя копия — 1 тема и 2 карточки; позавчерашняя — повреждена; чужой файл в папке не показывается.
fs.writeFileSync(path.join(dir, 'mnema-data.json'), data(['Клетка', 'Ткани', 'Органы'], 5));
fs.writeFileSync(path.join(dir, 'backups', `mnema-${day(1)}.json`), data(['Клетка'], 2));
fs.writeFileSync(path.join(dir, 'backups', `mnema-${day(2)}.json`), '{ сломано');
fs.writeFileSync(path.join(dir, 'backups', 'secret.json'), data(['Чужое'], 0));

const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd(), '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
await win.setViewportSize({ width: 1280, height: 800 });
await win.waitForTimeout(1200);
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.locator('.set-nav-item', { hasText: 'Данные' }).click();
await win.waitForTimeout(300);
await win.locator('.srow', { hasText: 'Автокопии' }).getByRole('button', { name: 'Открыть' }).click();
await win.waitForTimeout(500);
const rows = (await win.locator('.bk-row strong').allInnerTexts()).map((x) => x.trim());
check(rows.length >= 2 && !rows.some((r) => /Чуж|secret/.test(r)), `в списке копии по дням: ${rows.join(' · ')}`);
check(rows.includes('Вчера'), 'вчерашняя копия подписана «Вчера»');
await win.locator('.bk-row', { hasText: 'Вчера' }).click();
await win.waitForTimeout(400);
const body = await win.locator('.bk-item.open .bk-body').innerText();
check(/1 предмет · 1 тема · 2 карточки/.test(body), `что внутри: «${body.split('\n')[0]}»`);
await win.screenshot({ path: `${OUT}/backups-list.png` });
// Повреждённая копия
const broken = win.locator('.bk-row').filter({ hasNotText: /Вчера|Сегодня/ }).first();
if (await broken.count()) {
  await broken.click();
  await win.waitForTimeout(300);
  await win.screenshot({ path: `${OUT}/backups-broken.png` });
  check((await win.locator('.bk-bad').count()) === 1, 'повреждённая копия — понятное сообщение, без ошибки');
  await win.locator('.bk-row', { hasText: 'Вчера' }).click();
  await win.waitForTimeout(200);
}
// Вернуть вчерашнюю
await win.getByRole('button', { name: 'Вернуть эту копию' }).click();
await win.waitForTimeout(300);
check((await win.locator('.modal', { hasText: 'Восстановить из копии?' }).count()) === 1, 'сначала спрашивает подтверждение');
await win.getByRole('button', { name: 'Восстановить', exact: true }).click();
await win.waitForTimeout(600);
const topicsNow = await win.evaluate(() => JSON.parse(window.mnemaApi.load()).topics.length);
check(topicsNow === 1, `после восстановления тем: ${topicsNow} (как во вчерашней копии)`);
await win.screenshot({ path: `${OUT}/backups-restored.png` });
// Вернуть как было
const undo = win.getByRole('button', { name: 'Вернуть как было' });
check((await undo.count()) === 1, 'есть «Вернуть как было»');
await undo.click();
await win.waitForTimeout(600);
const topicsBack = await win.evaluate(() => JSON.parse(window.mnemaApi.load()).topics.length);
check(topicsBack === 3, `«Вернуть как было» вернуло ${topicsBack} темы`);
// Мост не читает чужие файлы
const sneaky = await win.evaluate(async () => [await window.mnemaApi.backupRead('../mnema-data.json'), await window.mnemaApi.backupRead('secret.json')]);
check(sneaky.every((x) => x === null), 'мост не отдаёт файлы вне шаблона имени');
await app.close();
console.log(bad ? `\nНЕ ПРОШЛО: ${bad}` : '\nВсё прошло');
process.exit(bad ? 1 : 0);
