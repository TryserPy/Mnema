// 1.22.0: «+» вернулись, меню по свободному месту, «Поиск» внизу, справка без «Клавиш», знакомство, закрываемые подсказки,
// «Ещё N» у подтем, автокопии из «Профиля», «Отпусти файл» не зависает.
// Запуск: URL=http://localhost:4174 OUT=out node e2e/v122.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];
const at = new Date(Date.now() - 5 * 864e5).toISOString();
const SEED = ([n, at]) => {
  const subs = Array.from({ length: 3 }, (_, i) => ({ id: 's' + i, name: 'Предмет ' + i, color: '#3F51D8', createdAt: at }));
  const topics = [{ id: 't1', subjectId: 's0', name: 'Главная тема', note: '', createdAt: at, updatedAt: at }];
  for (let i = 0; i < n; i++) topics.push({ id: 'k' + i, subjectId: 's0', parentId: 't1', name: 'Подтема номер ' + i + ' с довольно длинным названием', note: 'x', createdAt: at, updatedAt: at });
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: subs, topics, cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true } }));
};

for (const [w, h, phone] of [[1280, 800, false], [390, 844, true]]) {
  const tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // Самый первый запуск: знакомство предлагается само, «Пропустить» запоминается
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(900);
  check((await page.locator('.modal h2', { hasText: 'Знакомство' }).count()) === 1, `${tag}: при первом запуске предлагается знакомство`);
  await page.screenshot({ path: `${OUT}/v122-${tag}-guide.png` });
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.waitForTimeout(350);
  check((await page.locator('.guide-body h3').innerText()).startsWith('2.'), `${tag}: «Дальше» ведёт на шаг 2`);
  await page.getByRole('button', { name: 'Пропустить' }).click();
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForTimeout(700);
  check((await page.locator('.modal h2', { hasText: 'Знакомство' }).count()) === 0, `${tag}: после «Пропустить» оно больше не лезет`);

  await page.evaluate(SEED, [30, at]);
  await page.reload();
  await page.waitForTimeout(800);

  if (!phone) {
    // «+» вернулись, меню по свободному месту, «Поиск» внизу
    check((await page.locator('.sidebar .row-add').count()) >= 1, `${tag}: «+» у предметов на месте`);
    check((await page.locator('.side-head button[aria-label="Добавить предмет"]').count()) === 1, `${tag}: «+» над списком предметов на месте`);
    await page.locator('.sidebar .tree').click({ position: { x: 100, y: 250 } });
    check((await page.locator('.menu.ctx').count()) === 0, `${tag}: левая кнопка по свободному месту меню не открывает`);
    await page.locator('.sidebar .tree').click({ position: { x: 100, y: 250 }, button: 'right' });
    await page.waitForTimeout(300);
    const items = await page.locator('.menu.ctx [role="menuitem"]').allInnerTexts();
    check(items.join('|').includes('Новый предмет') && items.join('|').includes('Новая папка'), `${tag}: правая кнопка по свободному месту: ${items.join(' | ')}`);
    await page.screenshot({ path: `${OUT}/v122-${tag}-blankmenu.png` });
    await page.keyboard.press('Escape');
    await page.mouse.click(700, 400);
    const nv = await page.locator('.nav .search-item').boundingBox();
    const hwb = await page.locator('.nav .nav-item', { hasText: 'Профиль' }).boundingBox();
    const last = await page.locator('.nav > *').last().evaluate((e) => e.classList.contains('search-item'));
    check(nv && hwb && nv.y > hwb.y && last, `${tag}: «Поиск» — последний пункт верхнего списка (под «Профилем»)`);
    check((await page.locator('.side-search').count()) === 0, `${tag}: внизу панели «Поиска» больше нет`);
  }

  // Подтемы: «Ещё N»
  await page.evaluate(() => {});
  await page.goto(URL);
  await page.waitForTimeout(500);
  if (phone) { await page.locator('.tab', { hasText: 'Знания' }).click(); await page.waitForTimeout(300); await page.locator('.know-tile', { hasText: 'Предмет 0' }).click(); }
  else await page.locator('.tree-row.subject', { hasText: 'Предмет 0' }).locator('.tree-label').click();
  await page.waitForTimeout(500);
  await page.locator(phone ? '.main .topic-row' : '.tree-row', { hasText: 'Главная тема' }).first().click();
  await page.waitForTimeout(500);
  const chips = await page.locator('.subtopics .subtopic-chip:not(.add)').count();
  check(chips === 8, `${tag}: подтем видно 8 из 30 (${chips})`);
  const more = page.locator('.subtopics .capped-more');
  check((await more.innerText()).trim() === 'Ещё 22', `${tag}: кнопка «Ещё 22»`);
  await more.click();
  await page.waitForTimeout(300);
  check((await page.locator('.subtopics .subtopic-chip:not(.add)').count()) === 30 && (await page.locator('.subtopics .capped-open').count()) === 1, `${tag}: после «Ещё» видны все 30 и список прокручивается внутри`);
  const box = await page.locator('.subtopics').boundingBox();
  check(box.height < h * 0.6, `${tag}: блок подтем не растягивает страницу (${Math.round(box.height)} px)`);
  await page.screenshot({ path: `${OUT}/v122-${tag}-subtopics.png` });

  // Подсказка про учебник закрывается и не возвращается
  check((await page.locator('.tb-hint').count()) === 1, `${tag}: подсказка про учебник есть`);
  await page.locator('.dismiss-x').first().click();
  await page.waitForTimeout(300);
  check((await page.locator('.tb-hint').count()) === 0, `${tag}: подсказку закрыли крестиком`);
  await page.reload();
  await page.waitForTimeout(800);
  check((await page.locator('.tb-hint').count()) === 0, `${tag}: после перезапуска подсказка не вернулась`);

  // «Отпусти файл» не зависает
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'a.txt', { type: 'text/plain' }));
    const el = document.querySelector('.app');
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(250);
  check((await page.locator('.drop-hint').count()) === 1, `${tag}: при перетаскивании файла подсказка видна`);
  await page.waitForTimeout(1600);
  check((await page.locator('.drop-hint').count()) === 0, `${tag}: файл унесли — подсказка исчезла сама`);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'a.txt', { type: 'text/plain' }));
    document.querySelector('.app').dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.dispatchEvent(new DragEvent('dragleave', { relatedTarget: null })));
  await page.waitForTimeout(200);
  check((await page.locator('.drop-hint').count()) === 0, `${tag}: файл вышел за окно — подсказка исчезла сразу`);

  // Справка без «Клавиш»
  if (phone) await page.locator('.tab', { hasText: 'Профиль' }).click(); else await page.locator('.sidebar .nav-item', { hasText: 'Профиль' }).click();
  await page.waitForTimeout(400);
  // «Автокопии» открывают окно
  await page.locator('.prof-links .create-item', { hasText: 'Автокопии' }).click();
  await page.waitForTimeout(500);
  check((await page.locator('.modal').count()) === 1 && (await page.locator('.settings-page').count()) === 0, `${tag}: «Автокопии» открыли окно, а не настройки`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('.prof-links .create-item', { hasText: 'Справка' }).click();
  await page.waitForTimeout(500);
  const segs = await page.locator('.seg button').allInnerTexts();
  check(segs.join('|') === 'Как учиться|Как пользоваться', `${tag}: справка: ${segs.join(' | ')}`);
  check((await page.locator('.idea .illu').count()) === 3, `${tag}: у трёх идей есть рисунки`);
  await page.screenshot({ path: `${OUT}/v122-${tag}-help.png`, fullPage: false });

  // О Мнеме: версии рядом, а не колонкой
  await page.evaluate(() => {});
  if (phone) { await page.locator('.tab', { hasText: 'Профиль' }).click(); } else { await page.locator('.sidebar .nav-item', { hasText: 'Профиль' }).click(); }
  await page.waitForTimeout(300);
  await page.locator('.prof-links .create-item', { hasText: 'Настройки' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'О Мнеме' }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  check((await page.locator('.wn-list').count()) === 1 && (await page.getByRole('button', { name: 'Что было раньше' }).count()) === 1, `${tag}: «Что нового»: текущая версия списком и кнопка «Что было раньше»`);
  const ab = await page.locator('.about').boundingBox().catch(() => null);
  const wl = await page.locator('.wn-list').boundingBox();
  check(wl.height < (phone ? 800 : 420), `${tag}: список обновлений компактный (${Math.round(wl.height)} px)`);
  await page.screenshot({ path: `${OUT}/v122-${tag}-about.png` });
  await page.getByRole('button', { name: 'Пройти знакомство' }).first().click();
  await page.waitForTimeout(400);
  check((await page.locator('.tut-card').count()) === 1, `${tag}: знакомство из «О Мнеме» запускает тренажёр`);
  await page.getByRole('button', { name: 'Выйти' }).click();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!overflow, `${tag}: нет горизонтальной прокрутки`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
