// 1.5: папки, значки, домашка+уведомления, видео, моды с кодом, поиск, панель форматирования, весь экран.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT;
const dir = '/tmp/mnema15';
fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
// перехватить расписание уведомлений
await app.evaluate(({ ipcMain }) => {
  globalThis.__sched = [];
  ipcMain.on('notify:schedule', (_e, list) => (globalThis.__sched = list));
});
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const step = (s) => { console.log('•', s); win.evaluate((x) => (window.__st = x), s.slice(0, 12)).catch(() => {}); };
const shot = async (n) => { await win.waitForTimeout(350); await win.screenshot({ path: `${OUT}/${n}.png` }); };
await win.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.waitForTimeout(400);

// 1. Папка «Естественные науки»: Биология + Физика
await win.locator('.sidebar .create-btn').click();
await win.locator('.modal .create-item', { hasText: 'Новая папка' }).click();
await win.locator('.modal').getByLabel('Название').fill('Естественные науки');
await win.locator('.modal .icon-pick-btn').click();
await win.locator('.modal .ico-opt', { hasText: '🔬' }).click();
await win.locator('.modal').getByRole('button', { name: 'Создать' }).click();
await win.waitForTimeout(400);
for (const name of ['Биология', 'Физика']) {
  await win.locator('.tree-row.subject', { hasText: name }).click({ button: 'right' });
  await win.getByRole('menuitem', { name: /Изменить название/ }).click();
  await win.locator('.modal select').selectOption({ label: '🔬 Естественные науки' });
  if (name === 'Физика') { await win.locator('.modal .icon-pick-btn').click(); await win.locator('.modal .ico-opt', { hasText: '⚡' }).click(); }
  await win.locator('.modal').getByRole('button', { name: 'Сохранить' }).click();
  await win.waitForTimeout(300);
}
step('tree: ' + (await win.locator('.tree').innerText()).replace(/\n+/g, ' | ').slice(0, 200));
await win.locator('.tree-row.folder').locator('.tree-label').click();
await win.waitForTimeout(400);
step('folder screen: ' + (await win.locator('.folder-subjects').innerText()).replace(/\n+/g, ' | ').slice(0, 160));
await shot('g1-folder');

// 2. Домашка с расписанием: Физика по понедельникам и четвергам
await win.locator('.foot-btn[aria-label="Возможности"]').click();
await win.getByRole('switch', { name: 'Расписание уроков' }).click();
await win.getByRole('button', { name: 'Сегодня' }).first().click();
await win.locator('.les-card').getByRole('button', { name: /Заполнить/ }).click();
const days = win.getByRole('dialog', { name: 'Расписание уроков' }).locator('.sched-day');
for (const i of [0, 3]) {
  await days.nth(i).locator('.sched-add').click();
  await days.nth(i).locator('.sched-pick-item', { hasText: 'Физика' }).click();
}
await win.getByRole('dialog', { name: 'Расписание уроков' }).getByRole('button', { name: 'Готово' }).click();
await win.locator('.hw-today').getByRole('button', { name: /Записать/ }).click();
await win.locator('.modal .hw-text').fill('§ 8, упр. 3 и 5');
await win.locator('.modal .hw-subj', { hasText: 'Физика' }).click();
step('chips: ' + (await win.locator('.modal .look-chip').allInnerTexts()).join(' | '));
await shot('g2-hw-form');
await win.locator('.modal').getByRole('button', { name: 'Записать' }).click();
await win.waitForTimeout(900);
const sched = await app.evaluate(() => globalThis.__sched);
step('notify plan: ' + JSON.stringify(sched).slice(0, 220));
await win.getByRole('button', { name: /Домашка/ }).first().click();
await win.waitForTimeout(400);
step('hw screen: ' + (await win.locator('.hw-sec').first().innerText()).replace(/\n+/g, ' | '));
await win.locator('.hw-row .hw-circle').first().click();
await win.waitForTimeout(300);
await shot('g3-hw');

// 3. Видео в конспекте + панель форматирования
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await win.waitForTimeout(700);
await win.locator('.ProseMirror').click();
await win.keyboard.press('Control+End');
await win.keyboard.press('Enter');
await win.evaluate(() => {
  const dt = new DataTransfer();
  dt.setData('text/plain', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42');
  document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await win.waitForTimeout(600);
step('video embeds: ' + (await win.locator('.ProseMirror .video-embed').count()));
await win.evaluate(() => { window.__imgs = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { const all = n.nodeType === 1 ? [n, ...n.querySelectorAll('img')] : []; for (const i of all) if (i.tagName === 'IMG' && /watch/.test(i.src)) { let p = i, path = []; while (p && path.length < 6) { path.push(p.className || p.tagName); p = p.parentElement; } window.__imgs.push(path.join(' < ') + ' @' + window.__st + ' alt=' + i.alt + ' src=' + i.getAttribute('src') + ' full=' + !!document.querySelector('.note-layout.full')); } } }).observe(document.body, { subtree: true, childList: true }); });
await win.waitForTimeout(800);
const note = await win.evaluate(() => JSON.parse(localStorage.getItem('x') || 'null'));
await win.locator('.ProseMirror p').first().click({ clickCount: 3 });
await win.locator('.ProseMirror p').first().click({ button: 'right' });
await win.waitForTimeout(400);
step('dbg p: ' + JSON.stringify(await win.evaluate(() => ({ html: document.querySelector('.ProseMirror p').outerHTML.slice(0, 200), sel: getSelection().toString().slice(0, 60), b: !!document.querySelector('.bubble') }))));
const bub = await win.locator('.bubble').boundingBox();
const bar = await win.locator('.note-insert').first().boundingBox();
const bg = await win.locator('.bubble').evaluate((e) => getComputedStyle(e).backgroundColor);
step(`bubble y=${Math.round(bub?.y)} bar bottom=${Math.round(bar.y + bar.height)} bg=${bg}`);
await shot('g4-bubble');
await win.keyboard.press('Escape');
await win.locator('.ve-cover').first().click();
await win.waitForTimeout(500);
step('iframe: ' + (await win.locator('.video-embed iframe').getAttribute('src')));
await shot('g5-video');

// 4. Весь экран + длинный конспект: квадратик инструментов виден под полосой
await win.getByRole('button', { name: /На весь экран/ }).first().click();
await win.locator('.ProseMirror').click();
await win.keyboard.press('Control+End');
for (let i = 0; i < 35; i++) { await win.keyboard.type('Длинная строка номер ' + i); await win.keyboard.press('Enter'); }
await win.locator('.note-layout.full').evaluate((m) => (m.scrollTop = m.scrollHeight));
await win.waitForTimeout(500);
const fab = await win.locator('.note-fab').boundingBox().catch(() => null);
const fbar = await win.locator('.note-full-bar').boundingBox();
step(`full: fab=${fab ? Math.round(fab.y) : 'нет'} bar bottom=${Math.round(fbar.y + fbar.height)}`);
await shot('g6-full');
await win.keyboard.press('Escape');
await win.waitForTimeout(300);

// 5. Моды с кодом
await win.locator('.foot-btn[aria-label="Возможности"]').click();
await win.getByRole('switch', { name: 'Моды', exact: true }).click();
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.locator('.set-nav-item', { hasText: 'Моды' }).click();
const pm = win.locator('.set-pane');
// безопасный режим: сначала разрешить моды, потом ставить из каталога
await pm.getByRole('button', { name: 'Разрешить моды' }).click();
await win.getByRole('dialog', { name: 'Разрешить моды?' }).getByRole('button', { name: 'Разрешить', exact: true }).click();
await pm.getByRole('radio', { name: 'Каталог' }).click();
for (const name of ['Помодоро', 'Конфетти', 'Шпаргалка формул', 'Размер конспекта']) await pm.locator('.plug-card', { hasText: name }).getByRole('button', { name: 'Установить' }).click();
await pm.getByRole('radio', { name: /^Мои/ }).click();
await win.waitForTimeout(1200);
step('running: ' + (await pm.locator('.plug-row.on:not(:has(.err-text)):not(:has-text("Запускается"))').count()) + ' errors: ' + (await pm.locator('.plug-row .err-text').allInnerTexts()).join('; '));
await shot('g7-mods');
await win.locator('.foot-btn[aria-label="Моды"]').click();
await win.getByRole('menuitem', { name: /Помодоро/ }).click();
await win.waitForTimeout(400);
step('pomodoro view: ' + (await win.locator('.plugin-view').innerText()).replace(/\n+/g, ' | ').slice(0, 80));
await win.locator('.foot-btn[aria-label="Моды"]').click();
await win.getByRole('menuitem', { name: /Формулы|формул/ }).click();
await win.waitForTimeout(400);
step('formulas: ' + (await win.locator('.plugin-view .katex').count()) + ' формул');
await shot('g8-formulas');

// 6. Поиск Ctrl+P: по тексту конспекта и команда мода
await win.keyboard.press('Control+p');
await win.locator('.palette input').fill('сопротивлен');
await win.waitForTimeout(300);
step('search: ' + (await win.locator('.pal-item').allInnerTexts()).slice(0, 4).join(' || ').replace(/\n/g, ' '));
await shot('g9-search');
await win.locator('.palette input').fill('>конфетти');
await win.waitForTimeout(200);
await win.keyboard.press('Enter');
await win.waitForTimeout(300);
step('confetti pieces: ' + (await win.locator('body > div i').count()));

// 7. Анимации: кнопка «Свои» (раньше «Выбрать») в рамке — проверяем переключатели во всех разделах настроек
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
let segs = 0, out = 0;
for (const t of await win.locator('.set-nav-item').allInnerTexts()) {
  await win.locator('.set-nav-item', { hasText: t.trim() }).first().click();
  await win.waitForTimeout(150);
  segs += await win.evaluate(() => [...document.querySelectorAll('.set-pane .seg')].map((s) => s.scrollWidth - s.clientWidth).filter((d) => d > 1).length);
  out += await win.evaluate(() => [...document.querySelectorAll('.set-pane .seg')].map((s) => { const r = s.getBoundingClientRect(); const p = (s.closest('.sgroup-body') ?? s.closest('.set-pane'))?.getBoundingClientRect(); return p && r.right > p.right + 1 ? 1 : 0; }).reduce((a, b) => a + b, 0));
}
step('imgs: ' + JSON.stringify(await win.evaluate(() => window.__imgs)));
step(`segmented overflow: inner=${segs} outOfCard=${out}`);
console.log('errors', JSON.stringify(errors));
await app.close();
const data = JSON.parse(fs.readFileSync(dir + '/mnema-data.json', 'utf8'));
const t = data.topics.find((x) => x.name.includes('Закон Ома'));
console.log('saved video md:', /!\[video\]\(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/.test(t.note), 'folders', data.folders.length, 'hw', data.homework.length, 'plugins', data.settings.plugins.length);
