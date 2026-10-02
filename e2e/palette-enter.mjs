// Ctrl+P → «Фокус» → Enter: повторение должно открыться с вопросом (кнопка «Показать ответ»), а не сразу с ответом.
// Тот же Enter, которым запустили команду, раньше ловил экран повторения и открывал ответ.
// Запуск: URL=http://localhost:4174 NODE_PATH=$(npm root -g) node e2e/palette-enter.mjs
import { chromium } from 'playwright';
const URL = process.env.URL ?? 'http://localhost:4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole('button', { name: 'Посмотреть на примере' }).click();
await page.waitForTimeout(500);
let bad = 0;
for (const [label, query] of [['Фокус', 'Фокус'], ['Начать повторение', 'Начать повторение']]) {
  await page.keyboard.press('Control+p');
  await page.locator('.palette input').fill(query);
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const reveal = await page.getByRole('button', { name: 'Показать ответ' }).count();
  const grades = await page.locator('.grade').count();
  const ok = reveal === 1 && grades === 0;
  console.log(`${ok ? '✓' : '✗'} «${label}» по Enter: «Показать ответ» ${reveal}, кнопок оценки ${grades}`);
  if (!ok) bad++;
  await page.keyboard.press('Escape'); // выйти из повторения
  await page.waitForTimeout(400);
  const confirm = page.getByRole('button', { name: /Закончить|Выйти/ });
  if (await confirm.count()) await confirm.first().click().catch(() => {});
  await page.getByRole('button', { name: 'Сегодня' }).first().click().catch(() => {});
  await page.waitForTimeout(300);
}
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
