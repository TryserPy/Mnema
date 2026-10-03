// Этап 5: оболочка — «＋ Создать» (компьютер: кнопка слева; телефон: ячейка нижней панели), нижняя панель Учусь · Знания · ＋ · Профиль.
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/shell.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];
const SEED = () => {
  const at = new Date(Date.now() - 5 * 864e5).toISOString();
  const cards = Array.from({ length: 6 }, (_, i) => ({ id: 'c' + i, topicId: 't1', type: 'basic', front: 'Вопрос ' + i, back: 'Ответ ' + i, createdAt: at, updatedAt: at }));
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note: 'Клетка — единица жизни.', createdAt: at, updatedAt: at }], cards, states: {}, logs: [], tests: [], settings: { onboarded: true } }));
};
const cardsOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mnema-data')).cards.length);

for (const [w, h, phone] of [[1280, 800, false], [900, 700, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(SEED);
  await page.reload();
  await page.waitForTimeout(700);
  const tag = String(w);

  if (phone) {
    const tabs = await page.locator('.tabbar .tab-label').allInnerTexts();
    check(tabs.join('|') === 'Учусь|Знания|Создать|Профиль', `${tag}: нижняя панель с подписями: ${tabs.join(' | ')}`);
    check((await page.locator('.mobile-bar [aria-label="Меню"]').count()) === 0, `${tag}: кнопки ☰ вверху нет`);
    const box = await page.locator('.tabbar').boundingBox();
    check(box && Math.abs(box.y + box.height - h) < 2 && box.width === w, `${tag}: панель прижата к низу и во всю ширину (${Math.round(box.y)}+${Math.round(box.height)} из ${h})`);
    const small = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].filter((b) => b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44).length);
    check(small === 0, `${tag}: все ячейки не меньше 44 px`);
    await page.screenshot({ path: `${OUT}/shell-${tag}-today.png` });
    // Знания → экран с плитками предметов и поиском
    await page.locator('.tab', { hasText: 'Знания' }).click();
    await page.waitForTimeout(500);
    check((await page.locator('.know-tile', { hasText: 'Биология' }).first().isVisible()), `${tag}: «Знания» показывают плитку предмета`);
    check((await page.locator('.tab.on', { hasText: 'Знания' }).count()) === 1, `${tag}: вкладка «Знания» подсвечена`);
    await page.locator('.know-search input').fill('клет');
    await page.waitForTimeout(300);
    check((await page.locator('.know-found-row', { hasText: 'Клетка' }).count()) === 1, `${tag}: поиск нашёл тему «Клетка»`);
    await page.screenshot({ path: `${OUT}/shell-${tag}-knowledge.png` });
    await page.locator('.know-search input').fill('');
    await page.locator('.know-tile', { hasText: 'Биология' }).click();
    await page.waitForTimeout(400);
    check((await page.locator('.tab.on', { hasText: 'Знания' }).count()) === 1, `${tag}: внутри предмета «Знания» подсвечены`);
    // Профиль
    await page.locator('.tab', { hasText: 'Профиль' }).click();
    await page.waitForTimeout(400);
    const prof = await page.locator('.prof-links .create-item strong').allInnerTexts();
    check(prof.join('|') === 'Настройки|Возможности|Автокопии|Корзина|Справка', `${tag}: «Профиль»: ${prof.join(' | ')}`);
    check((await page.locator('.prof-progress').isVisible()) && (await page.locator('.prof-progress h3').innerText()).includes('Мой прогресс'), `${tag}: «Мой прогресс» сверху`);
    await page.screenshot({ path: `${OUT}/shell-${tag}-profile.png` });
    await page.locator('.prof-links .create-item', { hasText: 'Настройки' }).click();
    await page.waitForTimeout(500);
    check((await page.locator('.settings-page').count()) > 0 && (await page.locator('.tab.on', { hasText: 'Профиль' }).count()) === 1, `${tag}: «Настройки» открылись, вкладка «Профиль» подсвечена`);
    await page.locator('.tab', { hasText: 'Учусь' }).click();
    await page.waitForTimeout(400);
  } else {
    check((await page.locator('.tabbar:visible').count()) === 0, `${tag}: нижней панели на компьютере нет`);
    check((await page.locator('.sidebar .create-btn').count()) === 1, `${tag}: слева кнопка «Создать»`);
    check((await page.locator('.sidebar .row-add').count()) >= 1 && (await page.locator('.side-head button').count()) === 2, `${tag}: «+» у предметов и тем на месте`);
    await page.locator('.sidebar .nav-item', { hasText: 'Знания' }).click();
    await page.waitForTimeout(500);
    check((await page.locator('.know-tile', { hasText: 'Биология' }).first().isVisible()) && (await page.locator('.know-tile').first().boundingBox()).width > 200, `${tag}: «Знания» слева открывают плитки`);
    await page.screenshot({ path: `${OUT}/shell-${tag}-knowledge.png` });
    await page.locator('.sidebar .nav-item', { hasText: 'Профиль' }).click();
    await page.waitForTimeout(500);
    check((await page.locator('.prof-links .create-item').count()) === 5, `${tag}: «Профиль» слева открывает экран`);
    await page.screenshot({ path: `${OUT}/shell-${tag}-profile.png` });
  }

  // «Создать»
  const open = phone ? () => page.locator('.tab-plus').click() : () => page.locator('.sidebar .create-btn').click();
  await open();
  await page.waitForTimeout(500);
  const items = await page.locator('.modal .create-item strong').allInnerTexts();
  check(items.join('|') === 'Быстрая карточка|Новая тема|Новый предмет|Новая папка|Домашка|Контрольная|Файл изменений', `${tag}: «Создать»: ${items.join(' | ')}`);
  await page.screenshot({ path: `${OUT}/shell-${tag}-create.png` });
  // быстрая карточка
  const n0 = await cardsOf(page);
  await page.locator('.modal .create-item', { hasText: 'Быстрая карточка' }).click();
  await page.waitForTimeout(400);
  check((await page.locator('.modal h2').innerText()) === 'Быстрая карточка', `${tag}: открылось окно «Быстрая карточка»`);
  await page.locator('.modal textarea').nth(0).fill('Что такое клетка?');
  await page.locator('.modal textarea').nth(1).fill('Единица жизни.');
  await page.getByRole('button', { name: 'Сохранить и ещё одну' }).click();
  await page.waitForTimeout(300);
  await page.locator('.modal textarea').nth(0).fill('Что такое ядро?');
  await page.locator('.modal textarea').nth(1).fill('Хранит ДНК.');
  await page.locator('.modal').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.waitForTimeout(900);
  const n1 = await cardsOf(page);
  check(n1 === n0 + 2, `${tag}: добавлено 2 карточки (${n0} → ${n1})`);
  // новая тема
  await open();
  await page.waitForTimeout(400);
  await page.locator('.modal .create-item', { hasText: 'Новая тема' }).click();
  await page.waitForTimeout(300);
  await page.locator('.modal input.input').fill('§2 Ткани');
  await page.locator('.modal').getByRole('button', { name: 'Создать', exact: true }).click();
  await page.waitForTimeout(700);
  check((await page.locator('input.title-input').inputValue()) === '§2 Ткани', `${tag}: новая тема создана и открыта`);
  // Esc закрывает меню «Создать»
  await open();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check((await page.locator('.modal').count()) === 0, `${tag}: Esc закрывает «Создать»`);
  // нет горизонтальной прокрутки
  const overflow = await page.evaluate(() => { const m = document.querySelector('.main'); return document.documentElement.scrollWidth > innerWidth + 1 || (m ? m.scrollWidth > m.clientWidth + 1 : false); });
  check(!overflow, `${tag}: нет горизонтальной прокрутки`);
  if (phone) {
    // в повторении панели нет
    await page.locator('.tab', { hasText: 'Учусь' }).click();
    await page.waitForTimeout(400);
    await page.locator('.hero-btn').click();
    await page.waitForTimeout(600);
    check((await page.locator('.tabbar').count()) === 0, `${tag}: в повторении нижней панели нет`);
    await page.screenshot({ path: `${OUT}/shell-${tag}-review.png` });
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
