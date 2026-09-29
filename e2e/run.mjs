import { chromium } from 'playwright';

const OUT = process.env.OUT;
const URL = process.env.URL;
const errors = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
} catch {
  browser = await chromium.launch();
}
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));

await page.goto(URL);
await page.screenshot({ path: `${OUT}/01-welcome.png` });
await page.getByRole('button', { name: /Добавить пример/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/02-today.png` });

// Тема и конспект
await page.getByRole('button', { name: '§12 Фотосинтез' }).first().click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/03-topic-note.png` });
// Выделяем фразу и делаем карточку
const ta = page.locator('textarea.note-input');
await ta.evaluate((el) => {
  const text = el.value;
  const s = text.indexOf('**Фотосинтез**');
  const e = text.indexOf('**хлорофилла**.') + '**хлорофилла**.'.length;
  el.focus();
  el.setSelectionRange(s, e);
});
await page.getByRole('button', { name: /В карточку/ }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/04-to-card.png` });
await page.keyboard.press('Escape');

// Карточки
await page.getByRole('radio', { name: /Карточки/ }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/05-cards.png` });

// Закрой и перескажи
await page.getByRole('radio', { name: 'Конспект' }).click();
await page.getByRole('button', { name: /Закрой и перескажи/ }).click();
await page.locator('.modal textarea').fill('Фотосинтез идёт на свету, нужен хлорофилл. Есть световая фаза.');
await page.getByRole('button', { name: /Сравнить/ }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/06-recall.png` });
await page.getByRole('button', { name: 'Готово' }).click();

// Повторение
await page.getByRole('button', { name: /Сегодня/ }).first().click();
await page.getByRole('button', { name: /Начать/ }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/07-review-q.png` });
let answered = 0;
for (let i = 0; i < 40; i++) {
  const show = page.getByRole('button', { name: /Показать ответ/ });
  if (!(await show.count())) break;
  if (i === 0) await page.getByRole('button', { name: 'Точно знаю' }).click().catch(() => {});
  const typed = page.locator('input.typed');
  if (await typed.count()) { await typed.fill('кислород'); await typed.press('Enter'); } else await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  if (i === 0) await page.screenshot({ path: `${OUT}/08-review-a.png` });
  await page.keyboard.press(i % 5 === 0 ? '1' : '3');
  answered++;
  await page.waitForTimeout(60);
}
await page.screenshot({ path: `${OUT}/09-review-done.png` });
console.log('answered', answered);
await page.getByRole('button', { name: 'На главную' }).click();

// Статистика и настройки
await page.getByRole('button', { name: /Статистика/ }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/10-stats.png` });
await page.getByRole('button', { name: /Настройки/ }).click();
await page.getByRole('radio', { name: 'Тёмная' }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/11-settings-dark.png`, fullPage: true });
await page.getByRole('button', { name: /Сегодня/ }).first().click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/12-today-dark.png` });

// Перезагрузка: данные должны сохраниться
await page.waitForTimeout(600);
await page.reload();
await page.waitForTimeout(300);
const subjects = await page.locator('.tree-item').count();
console.log('tree items after reload', subjects);
console.log('errors', JSON.stringify(errors));
await browser.close();
