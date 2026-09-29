// 1.3.1: рисование у курсора, колесо графа, предметы (меню/удаление/возврат), тумблер, плавающая панель, словари, правила.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT;
const dir = '/tmp/mnema131';
fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
await win.setViewportSize?.({ width: 1280, height: 820 });
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const step = (s) => console.log('•', s);
const shot = (n) => win.screenshot({ path: `${OUT}/${n}.png` });

await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.waitForTimeout(500);

// 1. Тумблер: кружок едет через transform
await win.locator('.foot-btn[aria-label="Возможности"]').click();
const sw = win.getByRole('switch', { name: 'Карта знаний' });
await sw.click();
await win.waitForTimeout(80);
const mid = await sw.locator('span').evaluate((e) => getComputedStyle(e).transform);
await win.waitForTimeout(400);
const end = await sw.locator('span').evaluate((e) => getComputedStyle(e).transform);
step(`switch knob mid=${mid} end=${end}`);
await win.getByRole('switch', { name: 'ИИ-помощник' }).click();
await win.getByRole('switch', { name: 'Ответ от руки' }).click().catch(() => {});

// 2. Рисование от руки в конспекте: линия у курсора
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await win.waitForTimeout(400);
await win.getByRole('button', { name: /От руки/ }).first().click();
const pad = win.locator('.hand-pad .sketch-svg');
await pad.waitFor();
await pad.scrollIntoViewIfNeeded();
const box = await pad.boundingBox();
const sx = box.x + 60, sy = box.y + 40;
await win.mouse.move(sx, sy);
await win.mouse.down();
for (let i = 1; i <= 10; i++) await win.mouse.move(sx + i * 12, sy + i * 6);
await win.mouse.up();
await win.waitForTimeout(200);
const pb = await win.locator('.hand-pad .sketch-svg path').last().boundingBox();
step(`stroke start expected (${Math.round(sx)},${Math.round(sy)}) got (${Math.round(pb.x)},${Math.round(pb.y)}); end expected (${Math.round(sx + 120)},${Math.round(sy + 60)}) got (${Math.round(pb.x + pb.width)},${Math.round(pb.y + pb.height)})`);
await shot('d1-pad');
await win.keyboard.press('Escape');
await win.getByRole('button', { name: /От руки/ }).first().click().catch(() => {});

// 3. Плавающая панель инструментов при длинном конспекте
await win.locator('.ProseMirror').click();
await win.keyboard.press('Control+End');
for (let i = 0; i < 40; i++) {
  await win.keyboard.type(`Строка длинного конспекта номер ${i + 1}.`);
  await win.keyboard.press('Enter');
}
await win.waitForTimeout(300);
await win.locator('.main').evaluate((m) => (m.scrollTop = m.scrollHeight));
await win.waitForTimeout(500);
step('fab visible: ' + (await win.locator('.note-fab').isVisible()));
await win.locator('.note-fab').click();
await win.waitForTimeout(350);
step('float panel buttons: ' + (await win.locator('.note-float-panel > .btn').allInnerTexts()).join(' | '));
await win.locator('.note-float-panel').getByRole('button', { name: /Вставить/ }).click();
await win.waitForTimeout(250);
await shot('d2-float');
step('float menu items: ' + (await win.locator('.note-float-panel .menu [role=menuitem]').count()));
await win.keyboard.press('Escape');
await win.locator('.main').evaluate((m) => (m.scrollTop = 0));
await win.waitForTimeout(400);
step('fab after scroll up: ' + (await win.locator('.note-fab').count()));

// 4. Словарь
await win.getByRole('button', { name: 'Добавить словарь или список' }).click();
await win.getByRole('menuitem', { name: /Словарь/ }).click();
await win.waitForTimeout(300);
const a = win.getByLabel('Новая строка: Слово');
await a.fill('current');
await a.press('Enter');
await win.getByLabel('Новая строка: Перевод').fill('сила тока');
await win.getByLabel('Новая строка: Перевод').press('Enter');
await win.waitForTimeout(200);
await win.getByLabel('Новая строка: Слово').fill('voltage');
await win.getByLabel('Новая строка: Слово').press('Enter');
await win.getByLabel('Новая строка: Перевод').fill('напряжение');
await win.getByLabel('Новая строка: Пример').fill('The voltage is 220 V.');
await win.getByLabel('Новая строка: Пример').press('Enter');
await win.getByRole('button', { name: 'Вставить списком' }).click();
await win.locator('.paste-area').fill('resistance — сопротивление\nwire - провод - a copper wire\nswitch\tвыключатель');
await win.getByRole('button', { name: /^Добавить 3/ }).click();
await win.waitForTimeout(400);
step('list rows: ' + (await win.locator('.list-tr:not(.list-th):not(.new-row)').count()) + ', tab: ' + (await win.locator('.topic-tabs .otab.on').innerText()));
await shot('d3-vocab');
await win.locator('.list-head').getByRole('button', { name: /Учить · / }).click();
await win.waitForTimeout(400);
step('review q: ' + (await win.locator('.review-card .question').innerText()) + ' speaker: ' + (await win.locator('.review-card .speak-btn').count()));
await win.getByRole('button', { name: 'Показать ответ' }).click();
await win.waitForTimeout(250);
await shot('d4-review');
await win.keyboard.press('Escape');
await win.waitForTimeout(300);

// 5. Правила предмета
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.tree-label').click();
await win.getByRole('radio', { name: /Правила/ }).click();
await win.getByRole('button', { name: /Добавить первое правило/ }).click();
await win.getByRole('dialog', { name: 'Новое правило' }).getByLabel('Название').fill('Как решать задачи на закон Ома');
await win.getByRole('button', { name: 'Создать правило' }).click();
await win.waitForTimeout(400);
await win.locator('.rule-card:not(.add)', { hasText: 'Как решать задачи на закон Ома' }).click();
await win.locator('.modal').getByRole('button', { name: 'Изменить' }).click();
await win.locator('.modal textarea').fill('1. Выпиши, что дано. 2. Найди формулу. 3. Подставь числа с единицами.');
await win.locator('.modal').getByRole('button', { name: 'Сохранить' }).click();
await win.waitForTimeout(400);
await win.keyboard.press('Escape');
await win.waitForTimeout(300);
step('rule saved in modal: ' + (await win.locator('.rule-card', { hasText: 'Выпиши' }).count()));
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await win.waitForTimeout(300);
await win.getByRole('button', { name: /^Правила$/ }).click();
await win.waitForTimeout(400);
step('drawer: ' + (await win.locator('.rules-drawer').innerText()).replace(/\n+/g, ' | ').slice(0, 200));
await shot('d5-rules');
await win.keyboard.press('Escape');
await win.waitForTimeout(300);
step('tree rules row: ' + (await win.locator('.rules-row').count()));

// 6. Предмет: меню ⋯, переименование, удаление и возврат
await win.locator('.tree-row.subject', { hasText: 'История' }).hover();
await win.getByRole('button', { name: 'Ещё о предмете «История»' }).click();
await shot('d6-menu');
await win.getByRole('menuitem', { name: /Изменить название/ }).click();
await win.locator('.modal').getByLabel('Название').fill('История России');
await win.getByRole('button', { name: 'Сохранить' }).click();
await win.waitForTimeout(300);
await win.locator('.tree-row.subject', { hasText: 'История России' }).click({ button: 'right' });
await win.getByRole('menuitem', { name: 'Удалить предмет' }).click();
await win.getByRole('button', { name: 'Удалить', exact: true }).click();
await win.waitForTimeout(400);
step('after delete: ' + (await win.locator('.tree-row.subject').allInnerTexts()).join(', ').replace(/\n/g, ' ') + ' | toast: ' + (await win.locator('.toast').innerText()).replace(/\n/g, ' '));
await shot('d7-toast');
await win.locator('.toast-btn').click();
await win.waitForTimeout(400);
step('after undo: ' + (await win.locator('.tree-row.subject').allInnerTexts()).join(', ').replace(/\n/g, ' '));

// 7. Граф: колесо не прокручивает страницу
await win.getByRole('button', { name: 'Статистика' }).click();
await win.getByRole('radio', { name: /Карта/ }).click();
await win.waitForTimeout(800);
await win.locator('.main').evaluate((m) => (m.scrollTop = 40));
const before = await win.locator('.main').evaluate((m) => m.scrollTop);
const cb = await win.locator('.map-canvas').boundingBox();
await win.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
for (let i = 0; i < 5; i++) await win.mouse.wheel(0, 200);
await win.waitForTimeout(300);
const after = await win.locator('.main').evaluate((m) => m.scrollTop);
step(`graph wheel: page scroll ${before} → ${after}`);

// 8. Тема оформления — плавно, без ошибок
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.locator('.set-nav-item', { hasText: 'Оформление' }).click();
// плавная смена темы теперь идёт через document.startViewTransition (класс theme-fade убран)
await win.evaluate(() => { const o = document.startViewTransition; window.__vt = 0; if (o) document.startViewTransition = function (...a) { window.__vt++; return o.apply(document, a); }; });
await win.getByRole('radio', { name: 'Тёмная' }).click();
await win.waitForTimeout(120);
step('theme-fade class: ' + (await win.evaluate(() => document.documentElement.classList.contains('theme-fade'))) + ', view transition: ' + (await win.evaluate(() => window.__vt > 0)));
await win.waitForTimeout(500);
await shot('d8-dark');
await win.getByRole('radio', { name: 'Светлая' }).click();

console.log('errors', JSON.stringify(errors));
await app.close();
