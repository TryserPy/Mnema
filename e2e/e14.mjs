// 1.4: анимации и их настройки, оформление, конспект на весь экран, итоги, шаблоны, моды, экспорт в Anki.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT;
const dir = '/tmp/mnema14';
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync('/tmp/apkg-out', { recursive: true, force: true });
fs.mkdirSync('/tmp/apkg-out');
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
await app.evaluate(({ dialog }) => {
  dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: '/tmp/apkg-out/' + o.defaultPath.split('/').pop() });
});
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const step = (s) => console.log('•', s);
// Настройки теперь по разделам: слева .set-nav-item, строка «название — кнопка» — .srow
const sect = (t) => win.locator('.set-nav-item', { hasText: t }).click();
const rowBtn = (label, btn) => win.locator('.srow', { has: win.locator('.srow-label', { hasText: new RegExp('^' + label + '$') }) }).getByRole('button', { name: btn });
const shot = async (n) => { await win.waitForTimeout(350); await win.screenshot({ path: `${OUT}/${n}.png` }); };
await win.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.waitForTimeout(400);
await shot('f0-today');

// Настройки: оформление
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await shot('f1-settings');
await sect('Оформление');
await win.getByRole('button', { name: 'Мята' }).click();
await win.waitForTimeout(500);
step('mint bg: ' + (await win.evaluate(() => getComputedStyle(document.body).backgroundColor)));
await sect('Текст и форма');
await win.getByRole('button', { name: /Нунито/ }).click();
await win.getByRole('radio', { name: 'Круглые' }).click();
await win.getByRole('button', { name: /Клетка/ }).click();
await win.waitForTimeout(600);
step('font: ' + (await win.evaluate(() => getComputedStyle(document.body).fontFamily)) + ' | radius: ' + (await win.evaluate(() => getComputedStyle(document.querySelector('.sgroup-body')).borderRadius)) + ' | nunito loaded: ' + (await win.evaluate(() => document.fonts.check('16px Nunito'))));
await shot('f2-look');
await sect('Оформление');
await win.getByRole('radio', { name: 'Тёмная' }).click();
await win.getByRole('button', { name: 'Океан' }).click();
await win.waitForTimeout(500);
await shot('f3-ocean');
await win.getByRole('radio', { name: 'Светлая' }).click();
// Раскрывающийся блок (раньше «Для продвинутых», теперь «Свои цвета» в «Текст и форма»): плавное раскрытие
await sect('Текст и форма');
await win.getByRole('button', { name: /Свои цвета/ }).click();
await win.waitForTimeout(90);
const mid = await win.locator('.collapse').first().evaluate((e) => [e.getBoundingClientRect().height.toFixed(0), getComputedStyle(e).opacity]);
await win.waitForTimeout(400);
const full = await win.locator('.collapse').first().evaluate((e) => [e.getBoundingClientRect().height.toFixed(0), getComputedStyle(e).opacity]);
step(`advanced expand mid=${mid} end=${full}`);
await win.getByRole('button', { name: /Свои цвета/ }).click();
await win.waitForTimeout(90);
step('closing still in DOM: ' + (await win.locator('.collapse').count()));
// Анимации: выключить
await sect('Анимации');
await win.getByRole('radio', { name: 'Нет', exact: true }).click();
step('motion attr: ' + (await win.evaluate(() => document.documentElement.dataset.motion)));
await win.getByRole('radio', { name: 'Свои', exact: true }).click();
await win.waitForTimeout(400);
await shot('f4-motion');
await win.getByRole('radio', { name: 'Все', exact: true }).click();

// Возможности
await win.locator('.foot-btn[aria-label="Возможности"]').click();
await win.getByRole('switch', { name: 'Моды' }).click();
await win.getByRole('switch', { name: 'Карта знаний' }).click();
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await sect('Оформление');
await win.locator('.st-tile', { hasText: 'Стикеры' }).click();
await win.getByRole('switch', { name: 'Крупные кнопки' }).click();
step('mods css: ' + (await win.evaluate(() => document.getElementById('mnema-mods').textContent.length)));
await win.locator('.style-list').first().scrollIntoViewIfNeeded();
await shot('f5-mods');

// Тема: шаблон карточки, конспект на весь экран
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await win.getByRole('button', { name: 'На весь экран' }).click();
await win.waitForTimeout(400);
step('full: ' + (await win.locator('.note-layout.full').count()) + ' fixed=' + (await win.locator('.note-layout.full').evaluate((e) => getComputedStyle(e).position)));
await shot('f6-full');
await win.keyboard.press('Escape');
await win.waitForTimeout(300);
step('after esc full: ' + (await win.locator('.note-layout.full').count()));
await win.getByRole('tab', { name: /Карточки/ }).click();
await win.getByRole('button', { name: 'Карточка' }).first().click();
await win.locator('.tpl-chip', { hasText: 'Что такое' }).locator('button').click();
await win.keyboard.type('резистор');
step('template front: ' + (await win.locator('.modal textarea').first().inputValue()));
await shot('f7-template');
await win.keyboard.press('Escape');

// Повторение → статистика
await win.getByRole('button', { name: /Учить · / }).first().click();
for (let i = 0; i < 3; i++) {
  await win.getByRole('button', { name: 'Показать ответ' }).click();
  await win.locator('.grade').nth(2).click();
  await win.waitForTimeout(200);
}
await win.keyboard.press('Escape');
await win.waitForTimeout(500);
await win.getByRole('button', { name: 'Статистика' }).click();
await shot('f8-stats');
await win.getByRole('radio', { name: 'Карта знаний' }).click();
await win.locator('.map-canvas').waitFor();
step('map lazy ok');

// Экспорт в Anki
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await sect('Данные');
await rowBtn('В Anki', 'Экспорт').click();
await win.locator('.modal').getByRole('button', { name: /^Сохранить/ }).click();
await win.locator('.modal .hint').waitFor({ timeout: 20000 });
step('anki: ' + (await win.locator('.modal .hint').innerText()));
await win.waitForTimeout(800);
step('file: ' + fs.readdirSync('/tmp/apkg-out').map((f) => f + ' ' + fs.statSync('/tmp/apkg-out/' + f).size).join(', '));
await win.keyboard.press('Escape');
await rowBtn('Распечатать карточки', 'Печать').click();
await shot('f11-print');
step('print dialog: ' + (await win.locator('.modal').innerText()).replace(/\n+/g, ' | ').slice(0, 160));
console.log('errors', JSON.stringify(errors));
await app.close();
