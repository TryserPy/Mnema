// 1.6.1: рисунок (фон, цвет, весь экран, предпросмотр, размер), расписание (повторы, без обрезки), Ctrl+V фото в домашку.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = 'out161'; fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/mnema161'; fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
const errors = []; win.on('pageerror', (e) => errors.push(e.message)); win.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const step = (s) => console.log('•', s);
const shot = async (n) => { await win.waitForTimeout(400); await win.screenshot({ path: `${OUT}/${n}.png` }); };
await win.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.waitForTimeout(400);

// 1. Рисунок
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await win.waitForTimeout(700);
await win.locator('.ProseMirror').click();
await win.keyboard.press('Control+End');
await win.locator('.note-insert button[aria-haspopup=menu]').first().click();
await win.getByRole('menuitem', { name: /Рисунок/ }).click();
await win.waitForTimeout(400);
const box = await win.locator('.draw-svg').boundingBox();
const line = async (x1, y1, x2, y2) => { await win.mouse.move(box.x + x1, box.y + y1); await win.mouse.down(); for (let i = 1; i <= 12; i++) await win.mouse.move(box.x + x1 + ((x2 - x1) * i) / 12, box.y + y1 + ((y2 - y1) * i) / 12); await win.mouse.up(); };
await line(60, 60, 400, 160);
await win.locator('.draw-colors .swatch').nth(2).click();
await line(80, 200, 500, 120);
await win.getByRole('radio', { name: 'Маркер' }).click();
await line(100, 240, 520, 240);
await win.getByRole('radio', { name: /Клетка/ }).click();
await win.getByLabel('Размер в конспекте').fill('50');
await win.getByRole('button', { name: /Как будет в конспекте/ }).click();
await shot('d1-editor');
await win.getByRole('button', { name: 'Холст на весь экран' }).click();
await win.waitForTimeout(400);
step('fullscreen: ' + (await win.locator('.draw-full').count()));
await shot('d2-full');
await win.keyboard.press('Escape');
await win.waitForTimeout(300);
step('after esc full: ' + (await win.locator('.draw-full').count()) + ', modal: ' + (await win.locator('.modal').count()));
await win.getByRole('radio', { name: /Как у конспекта/ }).click();
await win.getByRole('button', { name: 'Готово' }).click();
await win.waitForTimeout(600);
const img = win.locator('.ProseMirror .drawing-inline').last();
step('inline: ' + (await img.evaluate((e) => { const s = e.querySelector('svg'); return `w=${s.getAttribute('width')} rendered=${Math.round(s.getBoundingClientRect().width)}`; })));
await img.scrollIntoViewIfNeeded();
await shot('d3-note-light');
await win.keyboard.press('Control+p');
await win.locator('.palette input').fill('>тёмная');
await win.keyboard.press('Enter');
await win.waitForTimeout(700);
step('dark ink: ' + (await img.evaluate((e) => [...e.querySelectorAll('path')].map((p) => getComputedStyle(p).stroke).join(' | '))));
await img.scrollIntoViewIfNeeded();
await shot('d4-note-dark');
// повторное открытие двойным щелчком: фон и размер сохранились
await img.dblclick();
await win.waitForTimeout(500);
step('reopen: bg=' + (await win.locator('.bg-chip.on').innerText()) + ' size=' + (await win.getByLabel('Размер в конспекте').inputValue()));
await win.getByRole('button', { name: 'Отмена' }).click();

// 2. Расписание: первый урок слева, повтор предмета
await win.locator('.nav-item', { hasText: 'Сегодня' }).click();
await win.locator('.add-schedule').click();
await win.getByRole('button', { name: 'Заполнить расписание' }).click();
await win.locator('.sched-day').nth(1).locator('.sched-add').click();
await win.waitForTimeout(400);
await shot('s1-pick');
const pickBox = await win.locator('.sched-day').nth(1).locator('.sched-pick').boundingBox();
const modalBox = await win.locator('.modal').boundingBox();
step(`pick inside modal: ${pickBox.x >= modalBox.x && pickBox.x + pickBox.width <= modalBox.x + modalBox.width + 1}`);
for (const n of ['Физика', 'История', 'Физика']) await win.locator('.sched-day').nth(1).locator('.sched-pick-item', { hasText: n }).click();
step('tuesday: ' + (await win.locator('.sched-day').nth(1).locator('.sched-chip').allInnerTexts()).join(' | ').replace(/\n/g, ' '));
await shot('s2-dups');
await win.getByRole('button', { name: 'Готово' }).last().click();

// 3. Ctrl+V фото в домашку
await win.locator('.nav-item', { hasText: 'Домашка' }).click();
await win.waitForTimeout(300);
await win.locator('.hw-quick-input').click();
await win.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 200; c.height = 120; const x = c.getContext('2d'); x.fillStyle = '#e8f0ff'; x.fillRect(0, 0, 200, 120); x.fillStyle = '#223'; x.fillText('упр. 5', 20, 60);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
  document.querySelector('.hw-quick-input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await win.waitForTimeout(700);
step('pasted thumbs: ' + (await win.locator('.hw-quick .photo-thumb').count()));
await win.locator('.hw-quick-input').fill('Упражнение со скриншота');
await win.locator('.hw-quick-input').press('Enter');
await win.waitForTimeout(400);
step('row photo: ' + (await win.locator('.hw-row .hw-photo').count()));
await shot('h1-paste');
console.log('errors', JSON.stringify(errors));
await app.close();
