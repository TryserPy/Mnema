import { chromium } from 'playwright';

const OUT = process.env.OUT;
const URL = process.env.URL;
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push('console: ' + m.text()));
const shot = (n, full = false) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });
const step = async (name, fn) => {
  try {
    await fn();
    console.log('ok  ', name);
  } catch (e) {
    console.log('FAIL', name, String(e.message).split('\n')[0]);
    await shot('fail-' + name.replace(/\s+/g, '-'));
  }
};

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await step('welcome', async () => {
  await page.getByText('Привет! Это Мнема').waitFor();
  await shot('01-welcome');
});
await step('example', async () => {
  await page.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
  await page.getByRole('button', { name: 'Посмотреть на примере' }).click();
  await page.getByRole('heading', { name: 'Сегодня' }).waitFor();
  await shot('02-today');
});
await step('subject', async () => {
  await page.locator('.tree-row .tree-label', { hasText: 'Физика' }).click();
  await page.getByRole('heading', { name: 'Физика' }).waitFor();
  await shot('03-subject');
});
await step('topic note with math', async () => {
  await page.locator('.topic-row', { hasText: 'Закон Ома' }).click();
  await page.locator('.note-doc').waitFor();
  await page.waitForTimeout(300);
  const katexCount = await page.locator('.note-doc .katex').count();
  if (katexCount < 3) throw new Error('формулы не отрисованы: ' + katexCount);
  await shot('04-note');
});
await step('selection to card', async () => {
  const p = page.locator('.note-doc p').first();
  await p.click({ clickCount: 3 });
  await page.locator('.bubble').waitFor({ state: 'visible' });
  await shot('05-bubble');
  await page.locator('.bubble button.accent').click();
  await page.getByRole('dialog', { name: 'Новая карточка' }).waitFor();
  await shot('06-card-from-selection');
  await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
});
await step('insert formula', async () => {
  await page.locator('.note-doc blockquote p').click();
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Плотность: ');
  await page.getByRole('button', { name: 'Вставить' }).click();
  await page.getByRole('menuitem', { name: /^∑ Формула/ }).click();
  await page.locator('math-field').waitFor();
  await page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD', null, { timeout: 3000 });
  await page.getByRole('button', { name: 'Дробь' }).click();
  await page.keyboard.type('m');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('V');
  await page.waitForTimeout(200);
  await shot('07-formula-editor');
  await page.getByRole('button', { name: 'Вставить', exact: true }).last().click();
  await page.waitForTimeout(500);
});
await step('draw', async () => {
  await page.getByRole('button', { name: 'Вставить' }).click();
  await page.getByRole('menuitem', { name: /Рисунок/ }).click();
  const svg = page.locator('.draw-svg');
  await svg.waitFor();
  const b = await svg.boundingBox();
  await page.mouse.move(b.x + 100, b.y + 100);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(b.x + 100 + i * 15, b.y + 100 + Math.sin(i / 3) * 40);
  await page.mouse.up();
  await page.mouse.move(b.x + 200, b.y + 250);
  await page.mouse.down();
  await page.mouse.move(b.x + 500, b.y + 250, { steps: 10 });
  await page.mouse.up();
  await shot('08-drawing');
  await page.getByRole('button', { name: 'Готово' }).click();
  await page.waitForTimeout(800);
  await page.locator('.note-doc img[alt="Рисунок"], .note-doc .drawing-inline').waitFor();
  await shot('09-note-with-drawing', true);
});
await step('saved markdown', async () => {
  await page.getByRole('tab', { name: /Карточки/ }).click();
  await page.waitForTimeout(900);
  const md = await page.evaluate(() => JSON.parse(localStorage.getItem('mnema-data')).topics.find((t) => t.name.includes('Ома')).note);
  if (!md.includes('\\frac{m}{V}')) throw new Error('формула не сохранилась: ' + md.slice(-300));
  if (!md.includes('data:image/svg+xml;base64')) throw new Error('рисунок не сохранился');
  if (md.indexOf('\\frac{m}{V}') < md.indexOf('Запомни')) throw new Error('формула вставилась не туда');
  if (!md.includes('Плотность: $\\frac{m}{V}$')) throw new Error('формула не в строке текста: ' + md.slice(md.indexOf('Запомни')));
  console.log('     md tail:', md.slice(md.indexOf('Запомни'), md.indexOf('Запомни') + 160).replace(/\n/g, '⏎'));
  await shot('10-cards');
});
await step('reopen drawing', async () => {
  await page.getByRole('tab', { name: 'Конспект' }).click();
  await page.locator('.note-doc img[alt="Рисунок"], .note-doc .drawing-inline').dblclick();
  await page.locator('.draw-svg path').first().waitFor();
  const n = await page.locator('.draw-svg path').count();
  if (n !== 2) throw new Error('линий в рисунке: ' + n);
  await page.getByRole('button', { name: 'Отмена' }).click();
});
await step('reload keeps drawing', async () => {
  await page.reload();
  await page.locator('.tree-row .tree-label', { hasText: 'Физика' }).click();
  await page.locator('.topic-row', { hasText: 'Закон Ома' }).click();
  await page.locator('.note-doc img[alt="Рисунок"], .note-doc .drawing-inline').waitFor({ timeout: 5000 });
  const md = await page.evaluate(() => JSON.parse(localStorage.getItem('mnema-data')).topics.find((t) => t.name.includes('Ома')).note);
  if (!md.includes('data:image/svg+xml')) throw new Error('рисунок пропал из markdown после перезагрузки');
});
await step('test', async () => {
  await page.locator('.tree-row .tree-label', { hasText: 'Биология' }).click();
  await page.locator('.topic-row', { hasText: 'Фотосинтез' }).click();
  await page.getByRole('button', { name: 'Действия с темой' }).click();
  await shot('11-topic-menu');
  await page.getByRole('menuitem', { name: /Проверить себя/ }).click();
  await page.getByRole('menuitem', { name: /Пробная контрольная/ }).click();
  await shot('12-test-setup');
  await page.getByRole('button', { name: 'Учиться' }).click();
  for (let i = 0; i < 12; i++) {
    const choice = page.locator('.choice').first();
    if (await choice.count()) {
      await choice.click();
    } else if (await page.locator('input.typed').count()) {
      await page.locator('input.typed').fill('кислород');
      await page.keyboard.press('Enter');
    } else if (await page.getByRole('button', { name: 'Показать ответ' }).count()) {
      await page.getByRole('button', { name: 'Показать ответ' }).click();
      if (i === 0) await shot('13-test-self');
      await page.getByRole('button', { name: 'Знал', exact: true }).click();
      continue;
    } else break;
    if (i === 0) await shot('13-test-q');
    await page.getByRole('button', { name: /Дальше|Результат/ }).click();
  }
  await page.locator('.grade-badge').waitFor();
  await shot('14-test-result', true);
  await page.getByRole('button', { name: 'К теме' }).click();
});
await step('review', async () => {
  await page.locator('.nav-item', { hasText: 'Сегодня' }).click();
  await page.getByRole('button', { name: 'Учиться' }).click();
  for (let i = 0; i < 60; i++) {
    const show = page.getByRole('button', { name: 'Показать ответ' });
    if (!(await show.count())) break;
    const typed = page.locator('input.typed');
    if (await typed.count()) {
      await typed.fill('3');
      await typed.press('Enter');
    } else await page.keyboard.press('Space');
    if (i === 1) await shot('15-review-answer');
    await page.keyboard.press(i % 4 === 0 ? '1' : '3');
    await page.waitForTimeout(40);
    if (await page.getByRole('dialog', { name: 'Эта карточка не запоминается' }).count()) {
      await shot('15b-leech');
      await page.getByRole('button', { name: 'Позже' }).click();
    }
  }
  await shot('16-review-done');
});
await step('features', async () => {
  await page.getByRole('button', { name: 'На главную' }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('.set-nav-item', { hasText: 'Возможности' }).click();
  await page.getByRole('switch', { name: 'Расписание уроков' }).click();
  await page.getByRole('switch', { name: 'Фокус-режим' }).click();
  await page.getByRole('button', { name: 'Фокус-режим: подробнее' }).click();
  await page.getByRole('dialog', { name: 'Фокус-режим' }).locator('.feat-where', { hasText: 'Сегодня' }).waitFor();
  await page.getByRole('dialog', { name: 'Фокус-режим' }).locator('select').first().waitFor();
  await shot('17-features', true);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Фокус-режим' }).waitFor({ state: 'detached' });
});
await step('settings dark', async () => {
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('.set-nav-item', { hasText: 'Оформление' }).click();
  await page.getByRole('radio', { name: 'Тёмная' }).click();
  await page.locator('.set-nav-item', { hasText: 'Учёба' }).click();
  await page.getByRole('heading', { name: 'Точная настройка' }).waitFor();
  await shot('18-settings-dark', true);
});
await step('help formulas', async () => {
  await page.getByRole('button', { name: 'Справка' }).click();
  await page.getByRole('radio', { name: 'Формулы' }).click();
  await shot('19-help-formulas');
});
await step('today dark', async () => {
  await page.locator('.nav-item', { hasText: 'Сегодня' }).click();
  await shot('20-today-dark');
});
await step('simple buttons + focus', async () => {
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('.set-nav-item', { hasText: 'Учёба' }).click();
  await page.getByRole('switch', { name: 'Простые кнопки' }).click();
  await page.locator('.set-nav-item', { hasText: 'Оформление' }).click();
  await page.getByRole('radio', { name: 'Светлая' }).click();
  await page.locator('.tree-row .tree-label', { hasText: 'История' }).click();
  await page.locator('.topic-row').first().click();
  await page.getByRole('button', { name: 'Действия с темой' }).click();
  await page.getByRole('menuitem', { name: /Повторить ещё раз/ }).click();
  await page.getByRole('button', { name: /^Начать/ }).click();
  await page.getByRole('button', { name: 'Показать ответ' }).click();
  await shot('21-simple-buttons');
});
console.log('errors', JSON.stringify(errors));
await browser.close();
