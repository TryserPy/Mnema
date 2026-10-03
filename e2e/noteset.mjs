// 1.18: «Набор из конспекта» — подсказка в теме без карточек, черновики по группам, порция по умолчанию, пометки качества.
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/noteset.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];
const note = [
  '## Клетка',
  '**Клетка** — это наименьшая единица живого.',
  '**Ядро** — это часть клетки, где хранится ДНК.',
  '**Митохондрия** — это органоид, который вырабатывает энергию.',
  '**Рибосома** — это органоид, на котором собирается белок.',
  '**Мембрана** — это оболочка клетки.',
  '**Хлоропласт** — это органоид, в котором идёт фотосинтез.',
  '**Вакуоль** — это полость с клеточным соком.',
  '**Цитоплазма** — это внутренняя среда клетки.',
  'В 1665 г. Роберт Гук впервые увидел клетки в микроскоп.',
  'В 1838 г. Шлейден и Шванн создали клеточную теорию.',
  '**Лизосома** — это органоид, который переваривает ненужные вещества, старые части клетки и попавшие внутрь бактерии, а ещё помогает клетке выжить при голодании, разбирая на части то, без чего можно обойтись какое-то время.',
  '**Аппарат Гольджи** — это органоид упаковки веществ.',
  '**Эндоплазматическая сеть** — это сеть каналов в клетке.',
  '**Клеточная стенка** — это жёсткая оболочка растительной клетки.'
].join('\n\n');

for (const [w, h, phone] of [[1280, 860, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate((note) => {
    const at = new Date(Date.now() - 864e5).toISOString();
    localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#22A06B', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note, createdAt: at, updatedAt: at }], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true } }));
  }, note);
  await page.reload();
  await page.waitForTimeout(700);
  const tag = String(w);
  if (phone) { await page.locator('.tab', { hasText: 'Знания' }).click(); await page.waitForTimeout(400); await page.getByRole('button', { name: 'Все темы списком' }).click(); await page.waitForTimeout(400); }
  await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
  await page.waitForTimeout(300);
  await page.locator('.tree-row', { hasText: 'Клетка' }).locator('.tree-label').click();
  await page.waitForTimeout(1200);
  const hint = page.locator('.ns-hint');
  check((await hint.count()) === 1, `${tag}: в теме без карточек — подсказка «Сделать карточки»`);
  await page.screenshot({ path: `${OUT}/ns-hint-${tag}.png` });
  await hint.getByRole('button', { name: 'Сделать карточки' }).click();
  await page.waitForTimeout(500);
  const heads = (await page.locator('.ns-head h4').allInnerTexts()).map((x) => x.trim());
  check(heads.includes('Определения') && heads.includes('Даты'), `${tag}: группы: ${heads.join(' · ')}`);
  const total = await page.locator('.modal .bulk-row').count();
  const on = await page.locator('.modal .bulk-row input[type=checkbox]:checked').count();
  check(on <= 12 && on > 0 && total > on, `${tag}: отмечено ${on} из ${total} (порция не больше 12)`);
  const warns = await page.locator('.modal .ns-warn').allInnerTexts();
  check(warns.some((x) => /несколько фактов|Длинный/.test(x)), `${tag}: у длинного черновика есть пометка: ${warns.slice(0, 2).join(' | ')}`);
  const longOn = await page.evaluate(() => Array.from(document.querySelectorAll('.modal .bulk-row')).filter((r) => r.querySelector('.ns-warn')).some((r) => r.querySelector('input').checked));
  check(!longOn, `${tag}: черновики с пометкой не отмечены сами`);
  await page.screenshot({ path: `${OUT}/ns-modal-${tag}.png` });
  const btn = page.getByRole('button', { name: /^Добавить \d+/ });
  const label = await btn.innerText();
  await btn.click();
  await page.waitForTimeout(600);
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem('mnema-data')).cards.length);
  check(n === on, `${tag}: добавлено ${n} карточек («${label}»)`);
  check((await page.locator('.ns-hint').count()) === 0, `${tag}: после добавления подсказки нет`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: нет прокрутки вбок`);
  await ctx.close();
}
check(errors.length === 0, `ошибок страницы нет${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(bad ? `\nНЕ ПРОШЛО: ${bad}` : '\nВсё прошло');
process.exit(bad ? 1 : 0);
