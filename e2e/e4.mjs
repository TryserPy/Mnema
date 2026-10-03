// 1.1.1: боковая панель, подтемы, звёздочки, граф, расписание, клавиши, формула от руки в конспекте.
import { _electron as electron } from 'playwright';
import fs from 'fs';
import http from 'http';
const OUT = process.env.OUT;
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'vl' }] }));
    const hasImage = body.includes('image_url');
    setTimeout(() => res.end(JSON.stringify({ choices: [{ message: { content: hasImage ? 'F = ma' : 'OK' } }] })), 300);
  });
});
await new Promise((r) => srv.listen(5577, r));
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'] });
const userData = await app.evaluate(({ app }) => app.getPath('userData'));
const win = await app.firstWindow();
await win.setViewportSize?.({ width: 1280, height: 800 });
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const step = (s) => console.log('•', s);

await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
// Подтема через «+» у темы в панели
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
const ohm = win.locator('.tree-row', { hasText: 'Закон Ома' });
await ohm.hover();
await ohm.getByRole('button', { name: /Ещё о теме/ }).click();
await win.getByRole('menuitem', { name: 'Добавить подтему' }).click();
await win.getByPlaceholder('Подтема').fill('Сопротивление проводника');
await win.keyboard.press('Enter');
await win.locator('.title-input').waitFor();
step('subtopic title: ' + (await win.locator('.title-input').inputValue()) + ' crumbs: ' + (await win.locator('.crumbs').innerText()).replace(/\n/g, ' '));
// Звёздочка
await win.locator('.star-big').click();
step('star on: ' + (await win.locator('.star-big.on').count()));
// Перетащить тему «Фотосинтез» внутрь «Закон Ома» — вложение
await win.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
const src = win.locator('.tree-row', { hasText: 'Фотосинтез' });
const dst = win.locator('.tree-row', { hasText: 'Закон Ома' });
await src.dragTo(dst, { targetPosition: { x: 60, y: 18 } });
await win.waitForTimeout(300);
const tree = await win.locator('.tree').innerText();
step('tree after drag: ' + tree.replace(/\n+/g, ' | '));
await win.screenshot({ path: OUT + '/g1-sidebar.png' });
// Ширина панели
const handle = win.locator('.side-resize');
const hb = await handle.boundingBox();
await win.mouse.move(hb.x + 4, hb.y + 300);
await win.mouse.down();
await win.mouse.move(hb.x + 90, hb.y + 300, { steps: 6 });
await win.mouse.up();
step('sidebar width: ' + (await win.locator('.sidebar').evaluate((e) => e.getBoundingClientRect().width)));
// Свернуть по Ctrl+\
await win.locator('.main').click({ position: { x: 5, y: 5 } });
await win.keyboard.press('Control+Backslash');
await win.waitForTimeout(300);
step('rail: ' + (await win.locator('.sidebar.rail').count()));
await win.screenshot({ path: OUT + '/g2-rail.png' });
await win.keyboard.press('Control+Backslash');
await win.waitForTimeout(300);

// Сегодня: расписание
await win.keyboard.press('Control+1');
await win.getByRole('button', { name: /Добавить расписание уроков/ }).click();
await win.getByRole('button', { name: 'Заполнить' }).click();
const days = win.locator('.day');
await days.nth(0).getByRole('button', { name: 'Физика' }).click();
await days.nth(1).getByRole('button', { name: 'Биология' }).click();
await days.nth(2).getByRole('button', { name: 'История' }).click();
await days.nth(2).getByRole('button', { name: 'Физика' }).click();
await days.nth(4).getByRole('button', { name: 'Биология' }).click();
await win.getByRole('button', { name: 'Готово' }).click();
await win.waitForTimeout(400);
await win.locator('.schedule-card').scrollIntoViewIfNeeded();
await win.screenshot({ path: OUT + '/g3-today.png', fullPage: false });
step('lessons: ' + (await win.locator('.lesson').count()));

// Граф
await win.getByRole('button', { name: 'Возможности' }).click();
for (const n of ['Карта знаний', 'ИИ-помощник']) await win.getByRole('switch', { name: n }).click();
await win.getByRole('radio', { name: 'На компьютере' }).click();
const ep = win.locator('input.input').filter({ hasNot: win.locator('[type=time]') }).first();
await ep.fill('http://localhost:5577/v1');
await ep.blur();
await win.getByRole('button', { name: 'Найти модели' }).click();
await win.locator('select.input').first().selectOption('vl');
await win.getByRole('button', { name: 'Статистика' }).click();
await win.getByRole('radio', { name: 'Карта знаний' }).click();
await win.locator('.map-canvas').waitFor();
await win.waitForTimeout(400);
await win.screenshot({ path: OUT + '/g4-graph-early.png' });
await win.waitForTimeout(2500);
await win.screenshot({ path: OUT + '/g5-graph.png' });
// перетащить узел: ищем пиксель узла через hover сканированием — просто тянем из центра
const cb = await win.locator('.map-canvas').boundingBox();
await win.getByRole('button', { name: 'Настройки карты' }).click();
await win.getByRole('radio', { name: 'Все' }).click();
await win.waitForTimeout(800);
await win.screenshot({ path: OUT + '/g6-graph-panel.png' });
await win.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
await win.mouse.wheel(0, -400);
await win.waitForTimeout(600);
await win.screenshot({ path: OUT + '/g7-graph-zoom.png' });

// Клавиши
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.getByRole('button', { name: /Горячие клавиши/ }).click();
await win.getByRole('button', { name: 'Клавиша: Вставить формулу' }).click();
await win.keyboard.press('Control+Shift+F');
step('formula key: ' + (await win.getByRole('button', { name: 'Клавиша: Вставить формулу' }).innerText()).replace(/\n/g, ''));
await win.locator('.key-row').first().scrollIntoViewIfNeeded();
await win.screenshot({ path: OUT + '/g8-keys.png' });
const segOverflow = await win.evaluate(() => {
  const seg = document.querySelector('.set-row .seg');
  const btn = [...seg.querySelectorAll('button')].pop();
  return { seg: seg.getBoundingClientRect().right, btn: btn.getBoundingClientRect().right };
});
step('seg overflow check: ' + JSON.stringify(segOverflow));

// Формула от руки в конспекте
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await win.getByRole('radio', { name: 'Конспект' }).click().catch(() => {});
await win.locator('.note-doc p').first().click();
await win.keyboard.press('End');
await win.keyboard.press('Control+Shift+M');
await win.locator('.hand-pad').waitFor();
const pad = win.getByRole('img', { name: 'Пиши формулу здесь' });
const pb = await pad.boundingBox();
await win.mouse.move(pb.x + 60, pb.y + 40);
await win.mouse.down();
await win.mouse.move(pb.x + 60, pb.y + 120, { steps: 5 });
await win.mouse.up();
await win.mouse.move(pb.x + 100, pb.y + 80);
await win.mouse.down();
await win.mouse.move(pb.x + 160, pb.y + 80, { steps: 5 });
await win.mouse.up();
await win.locator('.hand-result').waitFor({ timeout: 6000 });
await win.screenshot({ path: OUT + '/g9-hand-ready.png' });
await win.waitForTimeout(2300);
step('pad status after auto insert: ' + (await win.locator('.hand-pad-status').innerText()));
await win.waitForTimeout(700);
await app.close();
srv.close();
const d = JSON.parse(fs.readFileSync(userData + '/mnema-data.json', 'utf8'));
const ohmT = d.topics.find((t) => t.name.includes('Ома'));
console.log('formula in note:', ohmT.note.includes('F = ma'), 'important:', d.topics.filter((t) => t.important).map((t) => t.name));
console.log('photosynthesis parent:', d.topics.find((t) => t.name.includes('Фотосинтез')).parentId === ohmT.id, 'sub parent ok:', d.topics.find((t) => t.name === 'Сопротивление проводника')?.parentId === ohmT.id);
console.log('sidebarWidth', d.settings.sidebarWidth, 'keys', JSON.stringify(d.settings.keys), 'schedule', JSON.stringify(Object.keys(d.settings.schedule)));
console.log('errors', JSON.stringify(errors));
fs.rmSync(userData, { recursive: true, force: true });
