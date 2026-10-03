// 1.24.0: «Пропустить шаг» делает шаг за тебя, подсказка не закрывает окно, свернуть открытый предмет/папку, Ctrl+C / Ctrl+V (в т. ч. несколько).
// Запуск: URL=http://localhost:4174 OUT=out node e2e/v124.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];
const dataOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mnema-data')));
const stepNo = async (page) => (await page.locator('.tut-step').innerText()).match(/шаг (\d+)/i)?.[1];
const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// ---------- Тренажёр: «Пропустить шаг» делает шаг за тебя ----------
for (const [w, h, phone] of [[1280, 800, false], [390, 844, true]]) {
  const tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(900);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Давай попробуем' }).click();
  await page.waitForTimeout(600);
  // подсказка не закрывает окно «Создать»
  await page.locator(phone ? '.mobile-bar .mobile-create' : '.sidebar .create-btn').click();
  await page.waitForTimeout(700);
  const m = await page.locator('.modal').boundingBox();
  const c = await page.locator('.tut-card').boundingBox();
  check(!overlap(m, c) || phone, `${tag}: подсказка не закрывает окно «Создать»`);
  await page.locator('.modal .create-item', { hasText: 'Новый предмет' }).click();
  await page.waitForTimeout(700);
  const m2 = await page.locator('.modal').boundingBox();
  const c2 = await page.locator('.tut-card').boundingBox();
  check(!overlap(m2, c2) || phone, `${tag}: подсказка не закрывает диалог «Новый предмет»`);
  await page.screenshot({ path: `${OUT}/v124-${tag}-dialog.png` });
  // Пропустить: предмет создан за тебя, окно закрыто
  await page.getByRole('button', { name: 'Пропустить шаг' }).click();
  await page.waitForTimeout(900);
  let d = await dataOf(page);
  check(d.subjects.length === 1 && (await page.locator('.modal').count()) === 0 && (await stepNo(page)) === '2', `${tag}: «Пропустить» на шаге 1 — предмет создан (${d.subjects.map((s) => s.name)}), окно закрыто, шаг 2`);
  await page.getByRole('button', { name: 'Пропустить шаг' }).click();
  await page.waitForTimeout(1000);
  d = await dataOf(page);
  check(d.topics.length === 1 && (await stepNo(page)) === '3' && (await page.locator('.ProseMirror').count()) === 1, `${tag}: шаг 2 — тема создана и открыта, шаг 3`);
  await page.getByRole('button', { name: 'Пропустить шаг' }).click();
  await page.waitForTimeout(1500);
  d = await dataOf(page);
  check(d.topics[0].note.length > 25 && (await stepNo(page)) === '4', `${tag}: шаг 3 — пример конспекта написан (${d.topics[0].note.length} знаков), шаг 4`);
  check((await page.locator('.ProseMirror').innerText()).includes('Клетка'), `${tag}: пример виден в открытом редакторе`);
  await page.getByRole('button', { name: 'Пропустить шаг' }).click();
  await page.waitForTimeout(900);
  d = await dataOf(page);
  check(d.cards.length === 1 && (await stepNo(page)) === '5', `${tag}: шаг 4 — карточка создана, шаг 5`);
  // уйти с темы — конспект не пропал (редактор не затёр пример)
  await page.locator(phone ? '.tab' : '.sidebar .nav-item', { hasText: phone ? 'Учусь' : 'Сегодня' }).first().click();
  await page.waitForTimeout(900);
  d = await dataOf(page);
  check(d.topics[0].note.includes('Клетка'), `${tag}: после ухода с темы пример конспекта на месте`);
  await page.getByRole('button', { name: 'Пропустить шаг' }).click();
  await page.waitForTimeout(700);
  check((await stepNo(page)) === '6', `${tag}: шаг 5 пропущен — финал`);
  await page.locator('.tut-btns .btn.primary').click();
  await ctx.close();
}

// ---------- Свернуть предмет/папку, когда ты в нём; Ctrl+C / Ctrl+V ----------
{
  const at = new Date(Date.now() - 5 * 864e5).toISOString();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate((at) => {
    const t = (id, s, name, extra = {}) => ({ id, subjectId: s, name, note: 'Конспект ' + name, createdAt: at, updatedAt: at, ...extra });
    localStorage.setItem('mnema-data', JSON.stringify({ version: 1, folders: [{ id: 'f1', name: 'Науки', color: '#888', createdAt: at }], subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', folderId: 'f1', createdAt: at }, { id: 's2', name: 'История', color: '#D8503F', createdAt: at }], topics: [t('t1', 's1', 'Клетка'), t('t2', 's1', 'Ткани'), t('t3', 's1', 'Ядро', { parentId: 't1' }), t('h1', 's2', 'Русь')], cards: [{ id: 'c1', topicId: 't1', type: 'basic', front: 'В', back: 'О', createdAt: at, updatedAt: at }], states: {}, logs: [], tests: [], settings: { onboarded: true } }));
  }, at);
  await page.reload();
  await page.waitForTimeout(800);
  // в теме «Ядро»: папка, предмет и «Клетка» раскрыты сами
  await page.locator('.tree-row.folder .twisty').click();
  await page.waitForTimeout(300);
  await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
  await page.waitForTimeout(300);
  await page.locator('.tree-row', { hasText: 'Клетка' }).locator('.twisty').click();
  await page.waitForTimeout(300);
  await page.locator('.tree-label', { hasText: 'Ядро' }).click();
  await page.waitForTimeout(500);
  // сворачиваем предмет, будучи в его теме
  await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
  await page.waitForTimeout(500);
  check(!(await page.locator('.tree-label', { hasText: 'Ткани' }).isVisible()), '1280: предмет сворачивается, даже когда открыта его тема');
  await page.locator('.tree-row.folder .twisty').click();
  await page.waitForTimeout(500);
  check(!(await page.locator('.tree-row.subject', { hasText: 'Биология' }).isVisible()), '1280: папка сворачивается, даже когда ты внутри');
  await page.screenshot({ path: `${OUT}/v124-collapsed.png` });
  await page.locator('.tree-row.folder .twisty').click();
  await page.waitForTimeout(400);
  check(await page.locator('.tree-row.subject', { hasText: 'Биология' }).isVisible(), '1280: и разворачивается обратно');

  // Ctrl+C на открытой теме → Ctrl+V в другом предмете
  await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
  await page.waitForTimeout(300);
  await page.locator('.tree-label', { hasText: 'Клетка' }).click();
  await page.waitForTimeout(400);
  await page.locator('body').click({ position: { x: 1270, y: 790 } }).catch(() => {});
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(300);
  check((await page.locator('.toast').innerText()).includes('Скопировано'), '1280: Ctrl+C — «Скопировано»');
  await page.locator('.tree-label', { hasText: 'История' }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(500);
  let d = await dataOf(page);
  const pasted = d.topics.filter((t) => t.subjectId === 's2' && t.name === 'Клетка');
  check(pasted.length === 1 && d.topics.some((t) => t.parentId === pasted[0].id && t.name === 'Ядро'), '1280: Ctrl+V в «Истории» — тема «Клетка» с подтемой вставлена (имя без «(копия)»)');
  check(d.cards.length === 2, '1280: карточка темы тоже скопирована');
  // несколько: Ctrl+щелчок по двум предметам → Ctrl+C → Ctrl+V
  await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.tree-label').click({ modifiers: ['Control'] });
  await page.locator('.tree-row.subject', { hasText: 'История' }).locator('.tree-label').click({ modifiers: ['Control'] });
  await page.waitForTimeout(300);
  check((await page.locator('.pick-bar').innerText()).includes('2'), '1280: выбрано 2 предмета');
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(300);
  check((await page.locator('.toast').innerText()).includes('2'), '1280: Ctrl+C — скопировано 2');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(600);
  d = await dataOf(page);
  check(d.subjects.length === 4 && d.subjects.some((s) => s.name === 'История (копия)') && d.subjects.filter((s) => s.name === 'Биология' && !s.folderId).length === 1, `1280: Ctrl+V (стоя в «Истории») — оба предмета вставлены рядом с ней (${d.subjects.map((s) => s.name).join(', ')})`);
  // текст в конспекте копируется как обычно, а не тема
  await page.locator('.tree-label', { hasText: 'Ткани' }).first().click();
  await page.waitForTimeout(500);
  const before = (await dataOf(page)).topics.length;
  await page.locator('.ProseMirror p').first().click({ clickCount: 3 });
  await page.keyboard.press('Control+c');
  await page.keyboard.press('End');
  await page.waitForTimeout(300);
  check((await dataOf(page)).topics.length === before, '1280: Ctrl+C в конспекте копирует текст, а не тему');
  // кнопки «Сделать копию» на месте
  await page.locator('.tree-row.subject', { hasText: 'История' }).first().click({ button: 'right' });
  check((await page.getByRole('menuitem', { name: 'Сделать копию' }).count()) === 1, '1280: кнопка «Сделать копию» осталась');
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
