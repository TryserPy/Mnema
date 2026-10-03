// 1.23.0: интерактивное знакомство, копии, «Поиск» в списке, правая кнопка, «Остановить», причины ошибок, моды скрыты, справка по задачам.
// Запуск: URL=http://localhost:4174 OUT=out node e2e/v123.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];
const stepNo = async (page) => (await page.locator('.tut-step').innerText()).match(/шаг (\d+)/i)?.[1];

for (const [w, h, phone] of [[1280, 800, false], [390, 844, true]]) {
  const tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(900);
  // Слайды → «Давай попробуем» → тренажёр
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Давай попробуем' }).click();
  await page.waitForTimeout(600);
  const text = async () => (await page.locator('.tut-text').innerText()).trim();
  const create = phone ? '.mobile-bar .mobile-create' : '.sidebar .create-btn';
  check((await page.locator('.tut-card').count()) === 1 && (await stepNo(page)) === '1', `${tag}: тренажёр начался с шага 1`);
  check((await page.locator('.tut-ring').count()) === 1, `${tag}: кнопка «Создать» подсвечена`);
  await page.screenshot({ path: `${OUT}/v123-${tag}-tut1.png` });
  // Закрыл окно «Создать» — вернулись к «Нажми «Создать»»
  await page.locator(create).click();
  await page.waitForTimeout(700);
  check((await text()).includes('Новый предмет'), `${tag}: открыто «Создать» — просит выбрать «Новый предмет»`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  check((await text()).includes('Нажми «Создать»'), `${tag}: закрыл окно «Создать» — вернулся на «Нажми «Создать»»`);
  await page.locator(create).click();
  await page.waitForTimeout(400);
  await page.locator('.modal .create-item', { hasText: 'Новый предмет' }).click();
  await page.waitForTimeout(700);
  check((await text()).includes('Назови предмет'), `${tag}: открыт диалог предмета`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  check((await text()).includes('Нажми «Создать»'), `${tag}: закрыл диалог предмета — вернулся на шаг «Создать»`);
  // Любой предмет подходит — не обязательно «Биология»
  await page.locator(create).click();
  await page.waitForTimeout(400);
  await page.locator('.modal .create-item', { hasText: 'Новый предмет' }).click();
  await page.waitForTimeout(400);
  await page.locator('.modal input').first().fill('Химия');
  await page.locator('.modal').getByRole('button', { name: /Создать/ }).last().click();
  await page.waitForTimeout(900);
  check((await stepNo(page)) === '2', `${tag}: любой предмет засчитан — шаг 2 (тема)`);
  // Тема: удалённый предмет возвращает на шаг 1
  if (!phone) {
    await page.locator('.tree-row.subject', { hasText: 'Химия' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Удалить предмет' }).click();
    await page.waitForTimeout(300);
    await page.locator('.modal').getByRole('button', { name: /Удалить/ }).last().click();
    await page.waitForTimeout(900);
    check((await stepNo(page)) === '1', `${tag}: удалил предмет — подсказка вернулась на шаг 1`);
    await page.locator(create).click();
    await page.waitForTimeout(400);
    await page.locator('.modal .create-item', { hasText: 'Новый предмет' }).click();
    await page.waitForTimeout(400);
    await page.locator('.modal input').first().fill('Биология');
    await page.locator('.modal').getByRole('button', { name: /Создать/ }).last().click();
    await page.waitForTimeout(900);
    check((await stepNo(page)) === '2', `${tag}: создал другой предмет — снова шаг 2`);
  }
  await page.locator(create).click();
  await page.waitForTimeout(500);
  await page.locator('.modal .create-item', { hasText: 'Новая тема' }).click();
  await page.waitForTimeout(500);
  check((await text()).includes('Назови тему'), `${tag}: диалог темы`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  check((await stepNo(page)) === '2' && (await text()).includes('Новая тема'), `${tag}: закрыл диалог темы — остался на шаге 2`);
  await page.locator(create).click();
  await page.waitForTimeout(500);
  await page.locator('.modal .create-item', { hasText: 'Новая тема' }).click();
  await page.waitForTimeout(400);
  await page.locator('.modal input.input').fill('§1 Клетка');
  await page.locator('.modal').getByRole('button', { name: 'Создать', exact: true }).click();
  await page.waitForTimeout(1200);
  check((await stepNo(page)) === '3', `${tag}: тема создана — шаг 3 (конспект)`);
  // Ушёл на «Сегодня» — подсказка зовёт назад в тему
  await page.locator(phone ? '.tab' : '.sidebar .nav-item', { hasText: phone ? 'Учусь' : 'Сегодня' }).first().click();
  await page.waitForTimeout(800);
  check((await stepNo(page)) === '3' && (await text()).includes('Открой свою тему'), `${tag}: ушёл с темы — подсказка зовёт обратно («${(await text()).slice(0, 40)}…»)`);
  check((await page.locator('.tut-ring').count()) === 1, `${tag}: путь к теме подсвечен`);
  if (!phone) {
    // подсветка ведёт к предмету → потом к теме, как и подсказывает окно
    await page.locator('.sidebar .tree-row.subject .tree-label', { hasText: 'Биология' }).click();
    await page.waitForTimeout(700);
    check((await text()).includes('Открой свою тему') && (await page.locator('.tut-ring').count()) === 1, `${tag}: открыл предмет — тема подсвечена в списке`);
    await page.locator('.main .topic-row', { hasText: '§1 Клетка' }).click();
  } else { await page.locator('.tab', { hasText: 'Знания' }).click(); await page.waitForTimeout(400); await page.locator('.know-tile', { hasText: 'Химия' }).click(); await page.waitForTimeout(400); await page.locator('.main .topic-row', { hasText: '§1 Клетка' }).click(); }
  await page.waitForTimeout(900);
  check((await text()).includes('Напиши в конспекте'), `${tag}: открыл тему — снова «Напиши в конспекте»`);
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('Клетка — это единица строения и жизни всех организмов.');
  await page.waitForTimeout(1300);
  check((await stepNo(page)) === '4', `${tag}: конспект написан — шаг 4 (карточка)`);
  await page.screenshot({ path: `${OUT}/v123-${tag}-tut6.png` });
  if (!phone) {
    await page.locator('.ProseMirror p').first().click({ clickCount: 3 });
    await page.locator('.ProseMirror p').first().click({ button: 'right' });
    await page.waitForTimeout(400);
    await page.locator('.sel-card').click();
    await page.waitForTimeout(500);
    check((await text()).includes('Сохранить'), `${tag}: открыто окно карточки — «нажми Сохранить»`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    check((await stepNo(page)) === '4', `${tag}: закрыл окно карточки — остался на шаге 4`);
    await page.locator('.ProseMirror p').first().click({ clickCount: 3 });
    await page.locator('.ProseMirror p').first().click({ button: 'right' });
    await page.waitForTimeout(400);
    await page.locator('.sel-card').click();
    await page.waitForTimeout(500);
    await page.locator('.modal textarea').first().fill('Что такое клетка?');
    await page.locator('.modal textarea').nth(1).fill('Единица строения и жизни.');
    await page.locator('.modal').getByRole('button', { name: /Сохранить|Добавить/ }).first().click();
    await page.waitForTimeout(1300);
    check((await stepNo(page)) === '5', `${tag}: карточка создана — шаг 5 (повторение)`);
    await page.locator('.sidebar .nav-item', { hasText: 'Сегодня' }).click();
    await page.waitForTimeout(700);
    check((await page.locator('.tut-ring').count()) === 1, `${tag}: «Учиться» подсвечено`);
    await page.locator('.hero-btn').click();
    await page.waitForTimeout(1200);
    check((await stepNo(page)) === '6', `${tag}: повторение открыто — финал`);
    check((await page.locator('.tut-card').count()) === 1, `${tag}: подсказка осталась в повторении`);
    await page.screenshot({ path: `${OUT}/v123-${tag}-tut8.png` });
    await page.locator('.tut-btns .btn.primary').click();
    await page.waitForTimeout(400);
    check((await page.locator('.tut').count()) === 0, `${tag}: «Закончить» закрывает знакомство`);
  } else {
    // «Пропустить шаг» делает шаг за тебя
    await page.getByRole('button', { name: 'Пропустить шаг' }).click();
    await page.waitForTimeout(500);
    check((await stepNo(page)) === '5', `${tag}: «Пропустить шаг» сделал карточку за тебя — шаг 5`);
    await page.getByRole('button', { name: 'Выйти' }).click();
    check((await page.locator('.tut').count()) === 0, `${tag}: «Выйти» закрывает знакомство`);
  }
  await page.reload();
  await page.waitForTimeout(800);
  check((await page.locator('.modal h2', { hasText: 'Знакомство' }).count()) === 0, `${tag}: после знакомства оно больше не лезет само`);
  await ctx.close();
}

// ---------- Копии, моды скрыты, справка по задачам, «Что нового» ----------
const at = new Date(Date.now() - 5 * 864e5).toISOString();
const SEED = (at) => {
  const cards = Array.from({ length: 3 }, (_, i) => ({ id: 'c' + i, topicId: 't1', type: 'basic', front: 'Вопрос ' + i, back: 'Ответ ' + i, createdAt: at, updatedAt: at }));
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, folders: [{ id: 'f1', name: 'Науки', color: '#888', createdAt: at }], subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', folderId: 'f1', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note: 'Клетка — единица жизни.', createdAt: at, updatedAt: at }, { id: 't2', subjectId: 's1', parentId: 't1', name: 'Ядро', note: 'Ядро хранит ДНК.', createdAt: at, updatedAt: at }], cards, states: {}, logs: [], tests: [], settings: { onboarded: true } }));
};
const dataOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mnema-data')));
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(SEED, at);
  await page.reload();
  await page.waitForTimeout(800);
  // предмет — копия через меню
  await page.locator('.tree-row.folder').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Сделать копию' }).click();
  await page.waitForTimeout(500);
  let d = await dataOf(page);
  check(d.folders.length === 2 && d.folders.some((f) => f.name === 'Науки (копия)'), '1280: копия папки создана');
  check(d.subjects.length === 2 && d.subjects.filter((s) => s.name === 'Биология').length === 2, '1280: внутри копии папки — копия предмета с тем же именем');
  check(d.topics.length === 4 && d.cards.length === 6, `1280: темы и карточки скопированы (${d.topics.length} тем, ${d.cards.length} карточек)`);
  check(d.topics.some((t) => t.parentId && d.topics.filter((x) => x.id === t.parentId).length === 1 && t.name === 'Ядро'), '1280: подтема привязана к своему родителю');
  await page.getByRole('button', { name: 'Открыть' }).click().catch(() => {});
  await page.waitForTimeout(400);
  // предмет: «⋯» на экране предмета
  await page.locator('.tree-row.subject').first().locator('.tree-label').click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Действия с предметом' }).click();
  await page.getByRole('menuitem', { name: /Сделать копию/ }).click();
  await page.waitForTimeout(500);
  d = await dataOf(page);
  check(d.subjects.some((s) => s.name === 'Биология (копия)'), '1280: «Сделать копию» в меню предмета');
  // тема: «⋯» на экране темы
  // открытый предмет раскрыт сам (стрелка теперь его сворачивает — не трогаем); раскрываем, только если свёрнут
  const tw = page.locator('.tree-row.subject').first().locator('.twisty');
  if (!(await tw.evaluate((e) => e.classList.contains('open')))) await tw.click();
  await page.waitForTimeout(300);
  await page.locator('.tree-row:not(.subject):not(.folder)').first().locator('.tree-label').click();
  await page.waitForTimeout(600);
  await page.locator('.topic-head .more button, .more > .icon-btn').first().click().catch(() => {});
  await page.getByRole('menuitem', { name: /Сделать копию/ }).click();
  await page.waitForTimeout(500);
  d = await dataOf(page);
  check(d.topics.some((t) => /\(копия\)$/.test(t.name)), '1280: «Сделать копию» в меню темы');
  // карточка
  await page.locator('.tab-pane, .topic-tabs').first().waitFor();
  await page.locator('.topic-tabs [role="tab"]', { hasText: 'Карточки' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('.card-row').first().click();
  await page.waitForTimeout(400);
  const before = (await dataOf(page)).cards.length;
  await page.getByRole('button', { name: /Копия/ }).click();
  await page.waitForTimeout(400);
  check((await dataOf(page)).cards.length === before + 1, '1280: копия карточки');

  // Моды скрыты
  await page.locator('.sidebar .nav-item', { hasText: 'Профиль' }).click();
  await page.locator('.prof-links .create-item', { hasText: 'Настройки' }).click();
  await page.waitForTimeout(500);
  const secs = await page.locator('.set-nav button, .settings-page nav button').allInnerTexts().catch(() => []);
  check(!secs.some((t) => /Моды/.test(t)), `1280: в «Настройках» нет раздела «Моды» (${secs.length} разделов)`);
  await page.locator('.settings-page').getByRole('button', { name: /Возможности/ }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  check((await page.locator('.feat-tile', { hasText: 'Моды' }).count()) === 0, '1280: в «Возможностях» нет «Модов»');
  // «Что нового»
  await page.locator('.settings-page').getByRole('button', { name: 'О Мнеме' }).first().click();
  await page.waitForTimeout(400);
  check((await page.locator('.sgroup-title, .group-title, h3, .sgroup > span').filter({ hasText: 'Что нового в 1.' }).count()) >= 1, '1280: «Что нового в <текущей версии>»');
  await page.getByRole('button', { name: 'Что было раньше' }).click();
  await page.waitForTimeout(400);
  check((await page.locator('.wn-ver').count()) >= 10, '1280: «Что было раньше» — список версий');
  await page.screenshot({ path: `${OUT}/v123-1280-whatsnew.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // справка
  await page.locator('.sidebar .nav-item', { hasText: 'Профиль' }).click();
  await page.locator('.prof-links .create-item', { hasText: 'Справка' }).click();
  await page.waitForTimeout(400);
  await page.locator('.seg button', { hasText: 'Как пользоваться' }).click();
  await page.waitForTimeout(500);
  check((await page.locator('.how-group').count()) === 5, '1280: справка «Как пользоваться» — 5 групп по задачам');
  check((await page.locator('.how-group.open').count()) === 1, '1280: открыта одна группа, остальные свёрнуты');
  await page.screenshot({ path: `${OUT}/v123-1280-how.png` });
  await page.locator('.how-head').nth(1).click();
  await page.waitForTimeout(400);
  check((await page.locator('.how-group.open').count()) === 2, '1280: группа раскрывается по нажатию');
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
