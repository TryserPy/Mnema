// 1.6.2: таблица терминов, перестановка вкладок, меню «+», ссылки на термины/темы/правила.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = 'out162'; fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/mnema162'; fs.rmSync(dir, { recursive: true, force: true });
const launch = () => electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
let app = await launch();
let win = await app.firstWindow();
const errors = []; const watch = (w) => { w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text())); }; watch(win);
const step = (s) => console.log('•', s);
const shot = async (n) => { await win.waitForTimeout(400); await win.screenshot({ path: `${OUT}/${n}.png` }); };
await win.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.waitForTimeout(400);
await win.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
await win.locator('.tree-row.topic, .tree-row', { hasText: 'Фотосинтез' }).last().locator('.tree-label').click();
await win.waitForTimeout(600);
// меню «+» не вылезает за окно
await win.getByRole('button', { name: 'Добавить словарь или список' }).click();
await win.waitForTimeout(300);
const mb = await win.locator('.topic-tabs > .more .menu').boundingBox();
const vw = await win.evaluate(() => innerWidth);
step(`add menu right=${Math.round(mb.x + mb.width)} window=${vw}`);
await shot('t1-addmenu');
await win.getByRole('menuitem', { name: /^Термины/ }).click();
await win.waitForTimeout(400);
const add = async (a, b, c) => {
  await win.locator('.new-row textarea').nth(0).fill(a);
  await win.locator('.new-row textarea').nth(0).press('Enter');
  if (b) { await win.locator('.new-row textarea').nth(1).fill(b); }
  await win.locator('.new-row textarea').nth(1).press('Enter');
  if (c !== undefined) { await win.locator('.new-row textarea').nth(2).fill(c); await win.locator('.new-row textarea').nth(2).press('Enter'); }
  await win.waitForTimeout(250);
};
await add('Внутриклеточное пищеварение', 'Переваривание пищевых частиц внутри клетки с помощью ферментов лизосом', 'У амёбы и инфузорий');
await add('Хлоропласт', '', '');
await add('Гидрофобность', 'Свойство молекул отталкивать воду');
step('rows: ' + (await win.locator('.list-tr:not(.list-th):not(.new-row)').count()) + ' plain: ' + (await win.locator('.list-tr.plain').count()));
// ширина столбцов
const h = await win.locator('.col-resize').first().boundingBox();
await win.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
await win.mouse.down();
await win.mouse.move(h.x + 120, h.y + h.height / 2, { steps: 8 });
await win.mouse.up();
await win.waitForTimeout(300);
step('cols: ' + (await win.locator('.list-table').evaluate((e) => e.style.getPropertyValue('--lt-cols'))));
await shot('t2-table');
// перестановка вкладок: «Термины» — перед «Конспект»
await win.getByRole('tab', { name: 'Термины' }).dragTo(win.getByRole('tab', { name: 'Конспект' }));
await win.waitForTimeout(400);
step('tabs: ' + (await win.locator('.otabs > .otab').allInnerTexts()).join(' | ').replace(/\n/g, ''));
// ссылка из конспекта Физики на термин Биологии — правой кнопкой
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await win.waitForTimeout(700);
await win.evaluate((w) => { const pm = document.querySelector('.ProseMirror'); const tw = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { const i = n.data.indexOf(w); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); getSelection().removeAllRanges(); getSelection().addRange(r); break; } } }, 'напряжению');
await win.locator('.ProseMirror').focus();
await win.waitForTimeout(300);
const wb = await win.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await win.mouse.click(wb.x, wb.y, { button: 'right' });
await win.waitForTimeout(300);
step('ctx menu: ' + (await win.locator('.bubble button').allInnerTexts()).join(' | '));
await shot('l1-ctx');
await win.locator('.bubble button', { hasText: 'Ссылка' }).click();
await win.waitForTimeout(300);
await win.locator('.modal .search-field input').fill('Гидроф');
await win.waitForTimeout(200);
await shot('l2-picker');
await win.locator('.lp-item').first().click();
await win.waitForTimeout(500);
step('link: ' + (await win.locator('.ProseMirror a[href^="mnema://"]').count()));
await win.locator('.ProseMirror a[href^="mnema://"]').hover();
await win.waitForTimeout(700);
step('tip: ' + ((await win.locator('.link-tip').count()) ? (await win.locator('.link-tip').innerText()).replace(/\n+/g, ' / ').slice(0, 100) : 'НЕТ'));
await shot('l3-tip');
await win.waitForTimeout(800);
await app.close();
app = await launch(); win = await app.firstWindow(); watch(win);
await win.waitForTimeout(1200);
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await win.waitForTimeout(800);
step('after restart link: ' + (await win.locator('.ProseMirror a[href^="mnema://"]').count()) + ' text=' + (await win.locator('.ProseMirror a[href^="mnema://"]').first().innerText().catch(() => '-')));
await win.locator('.ProseMirror a[href^="mnema://"]').click({ modifiers: ['Control'] });
await win.waitForTimeout(700);
step('ctrl+click → ' + (await win.locator('.title-input').inputValue()) + ' / tab: ' + (await win.locator('.otab.on').innerText()).replace(/\n/g, ''));
const d = JSON.parse(fs.readFileSync(dir + '/mnema-data.json', 'utf8'));
step('md: ' + (d.topics.find((t) => t.name.includes('Закон Ома')).note.match(/\[[^\]]+\]\(mnema:[^)]+\)/) || ['НЕТ'])[0]);
console.log('errors', JSON.stringify(errors));
await app.close();
