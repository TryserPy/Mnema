// 1.6.3: панель по правой кнопке, жирный не прилипает, правило окошком, термины предмета.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = 'out163'; fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/mnema163'; fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
const errors = []; win.on('pageerror', (e) => errors.push(e.message)); win.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const step = (s) => console.log('•', s);
const shot = async (n) => { await win.waitForTimeout(400); await win.screenshot({ path: `${OUT}/${n}.png` }); };
const bubbleVisible = () => win.evaluate(() => { const b = document.querySelector('.bubble'); return !!b && b.isConnected && getComputedStyle(b).visibility !== 'hidden' && b.getBoundingClientRect().width > 0; });
const selectWord = (w) => win.evaluate((w) => { const pm = document.querySelector('.ProseMirror'); const tw = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { const i = n.data.indexOf(w); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); getSelection().removeAllRanges(); getSelection().addRange(r); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.right, cy: b.y + b.height / 2 }; } } return null; }, w);

await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.waitForTimeout(400);
await win.getByRole('button', { name: 'Настройки', exact: true }).click().catch(() => {});
await win.locator('.foot-btn[aria-label="Возможности"]').click();
for (const n of ['Правила предмета', 'Словари и списки']) { const sw = win.getByRole('switch', { name: n }); if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click(); }
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await win.waitForTimeout(800);

// 1. Выделение без правой кнопки — панели нет
await win.locator('.ProseMirror').focus();
let p = await selectWord('напряжению');
await win.waitForTimeout(600);
step('bubble after plain select: ' + (await bubbleVisible()));
// 2. Правая кнопка — панель есть
await win.mouse.click(p.x, p.y, { button: 'right' });
await win.waitForTimeout(500);
step('bubble after right-click: ' + (await bubbleVisible()) + ' buttons: ' + (await win.locator('.bubble button').allInnerTexts()).join(' | ').replace(/\n/g, ''));
step('bubble y=' + Math.round((await win.locator('.bubble').boundingBox()).y) + ' word y=' + Math.round(p.y)); await shot('b1-rightclick');
await win.locator('.bubble button[aria-label="Жирный"]').click();
await win.waitForTimeout(200);
// курсор в конец слова и печать
await win.keyboard.press('ArrowRight');
await win.keyboard.type('ТЕСТ');
await win.waitForTimeout(400);
step('bubble after typing: ' + (await bubbleVisible()));
const html = await win.evaluate(() => document.querySelector('.ProseMirror').innerHTML);
step('bold stuck? ' + /<strong>[^<]*ТЕСТ/.test(html) + ' | ' + (html.match(/<strong>напряжению<\/strong>[^<]{0,10}/) || ['нет'])[0]);
// Ctrl+B и печать — продолжается
await win.keyboard.press('Control+b');
await win.keyboard.type('жир');
await win.waitForTimeout(200);
step('ctrl+b typing bold: ' + /<strong>жир<\/strong>/.test(await win.evaluate(() => document.querySelector('.ProseMirror').innerHTML)));
await win.keyboard.press('Control+b');
await win.keyboard.press('Control+z'); await win.keyboard.press('Control+z'); await win.keyboard.press('Control+z');
// 3. Правая кнопка по слову без выделения — выделит слово
const pc = await selectWord('сопротивлению');
await win.evaluate(() => getSelection().collapseToStart());
await win.waitForTimeout(300);
await win.mouse.click(pc.x, pc.y, { button: 'right' });
await win.waitForTimeout(500);
step('right-click no selection → selected: "' + (await win.evaluate(() => getSelection().toString())) + '" bubble=' + (await bubbleVisible()));
// 4. Escape прячет
await win.keyboard.press('Escape');
await win.waitForTimeout(300);
step('after Esc bubble: ' + (await bubbleVisible()));
// 5. Правило из выделения → подсказка → окошко
await win.mouse.click(pc.x, pc.y, { button: 'right' });
await win.waitForTimeout(400);
await win.locator('.bubble button', { hasText: 'Правило' }).click();
await win.waitForTimeout(400);
await win.locator('.modal textarea').fill('Сила тока обратно пропорциональна сопротивлению участка цепи.');
await win.locator('.modal').getByRole('button', { name: 'Создать правило' }).click();
await win.waitForTimeout(800);
await win.locator('.ProseMirror').click({ position: { x: 5, y: 5 } });
await win.locator('.rule-word').first().hover();
await win.waitForTimeout(700);
step('rule tip: ' + (await win.locator('.rule-tip').count()));
await win.locator('.rule-tip .link-btn').click();
await win.waitForTimeout(500);
step('after tip click: modal=' + (await win.locator('.modal .modal-head').innerText().catch(() => 'НЕТ')).replace(/\n/g, ' ') + ' still on topic=' + (await win.locator('.title-input').inputValue().catch(() => '-')) + ' buttons=' + (await win.locator('.modal .btn').allInnerTexts()).join('|').replace(/\n/g, ''));
await shot('r1-rule-modal');
await win.keyboard.press('Escape');
await win.waitForTimeout(300);

// 6. Термины предмета
await win.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.tree-label').click();
await win.waitForTimeout(500);
step('subject tabs: ' + (await win.locator('.tabs-narrow').innerText()).replace(/\n/g, ' | '));
await win.getByRole('radio', { name: /Термины/ }).click().catch(async () => await win.locator('.tabs-narrow button', { hasText: 'Термины' }).click());
await win.waitForTimeout(400);
step('terms empty: ' + (await win.locator('.terms-pane, .empty').first().innerText()).replace(/\n/g, ' / ').slice(0, 120));
await shot('s1-terms-empty');
await win.getByRole('button', { name: 'Записать общие термины' }).click();
await win.waitForTimeout(400);
const add = async (a, b) => { await win.locator('.new-row textarea').nth(0).fill(a); await win.locator('.new-row textarea').nth(0).press('Enter'); if (b) await win.locator('.new-row textarea').nth(1).fill(b); await win.locator('.new-row textarea').nth(1).press('Enter'); await win.waitForTimeout(250); };
await add('Клетка', 'Элементарная единица живого');
await add('Органоид', 'Постоянная структура клетки');
step('general rows: ' + (await win.locator('.list-tr:not(.list-th):not(.new-row)').count()));
await shot('s2-general');
// термины в теме Фотосинтез
await win.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
await win.locator('.tree-row', { hasText: 'Фотосинтез' }).last().locator('.tree-label').click();
await win.waitForTimeout(500);
await win.getByRole('button', { name: 'Добавить словарь или список' }).click();
await win.getByRole('menuitem', { name: /^Термины/ }).click();
await win.waitForTimeout(400);
await add('Хлорофилл', 'Зелёный пигмент');
await add('Тилакоид', 'Мембранный мешочек хлоропласта');
step('topic list head: ' + (await win.locator('.list-head').innerText()).replace(/\n/g, ' | '));
await win.getByRole('button', { name: /Все термины предмета/ }).click();
await win.waitForTimeout(500);
step('after link: chip on=' + (await win.locator('.terms-chips .hw-fchip.on').innerText()).replace(/\n/g, ' '));
await win.locator('.terms-chips .hw-fchip', { hasText: 'Все' }).click();
await win.waitForTimeout(400);
step('all groups: ' + (await win.locator('.terms-group-head').allInnerTexts()).join(' | ').replace(/\n/g, ' ') + ' rows=' + (await win.locator('.terms-table .list-tr:not(.list-th):not(.new-row)').count()));
await shot('s3-all');
await win.setViewportSize?.({ width: 420, height: 800 }).catch(() => {});
// 7. Ссылка на общий термин открывает вкладку предмета
await win.locator('.terms-group-head', { hasText: 'Фотосинтез' }).click();
await win.waitForTimeout(300);
step('filtered chip: ' + (await win.locator('.terms-chips .hw-fchip.on').innerText()).replace(/\n/g, ' ') + ' sections=' + (await win.locator('.terms-section').count()));
await win.evaluate(() => { const d = window.__mnemaData?.(); });
const d = JSON.parse(fs.readFileSync(dir + '/mnema-data.json', 'utf8'));
const g = d.topics.find((t) => t.kind === 'glossary');
const card = d.cards.find((c) => c.topicId === g?.id);
await win.evaluate((h) => window.dispatchEvent(new CustomEvent('mnema:open-link', { detail: h })), 'mnema://card/' + card.id);
await win.waitForTimeout(600);
step('link to general term → ' + (await win.locator('h1.display').innerText().catch(() => '-')) + ' chip=' + (await win.locator('.terms-chips .hw-fchip.on').innerText().catch(() => '-')).replace(/\n/g, ' '));
step('tree has glossary? ' + (await win.locator('.tree-row', { hasText: 'Общие термины' }).count()));
console.log('errors', JSON.stringify(errors));
await app.close();
