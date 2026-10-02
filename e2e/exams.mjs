// Этап 3: контрольная из нескольких тем — создать, экран подготовки, «Исправить» (режим «заранее»), пробная контрольная, старая дата у темы.
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/exams.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const problems = [];
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) problems.push(m); };

async function start(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Посмотреть на примере' }).click();
  await page.waitForTimeout(1000);
}
// Дать карточкам состояния: часть «слабых» (давно, забывал), часть крепких.
async function seedStates(page) {
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('mnema-data'));
    const day = 864e5, now = Date.now();
    d.cards.forEach((c, i) => {
      const weak = i % 2 === 0;
      d.states[c.id + ':0'] = { due: new Date(now + (weak ? -2 : 20) * day).toISOString(), stability: weak ? 1.2 : 80, difficulty: weak ? 8.5 : 4, elapsed_days: 5, scheduled_days: 5, learning_steps: 0, reps: 5, lapses: weak ? 3 : 0, state: 2, last_review: new Date(now - (weak ? 15 : 1) * day).toISOString() };
    });
    localStorage.setItem('mnema-data', JSON.stringify(d));
  });
  await page.reload();
  await page.waitForTimeout(600);
}
const noOverflow = (page) => page.evaluate(() => { const m = document.querySelector('.main'); return !(document.documentElement.scrollWidth > innerWidth + 1 || (m && m.scrollWidth > m.clientWidth + 1)); });

const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) errs.push(m.text()); });

// ---------- 1. Создание из поиска ----------
await start(page, 1280, 800);
await seedStates(page);
await page.keyboard.press('Control+p');
await page.locator('.palette input').fill('Новая контрольная');
await page.waitForTimeout(250);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
const dlg = page.getByRole('dialog');
ok(await dlg.count() === 1, 'из поиска открылось окно «Новая контрольная»');
await dlg.locator('input.input').first().fill('Контрольная по примеру');
// Темы: «Все» в предмете по умолчанию (первый предмет)
await dlg.getByRole('button', { name: 'Все', exact: true }).click();
const picked = await dlg.locator('.exam-topic-pick input:checked').count();
ok(picked >= 1, `выбраны темы (${picked})`);
await page.screenshot({ path: `${OUT}/exam-dialog-1280.png` });
await dlg.getByRole('button', { name: 'Сохранить' }).click();
await page.waitForTimeout(700);
ok((await page.locator('h1.display').innerText()) === 'Контрольная по примеру', 'после сохранения открылся экран контрольной');
ok(await page.locator('.exam-pct').count() === 1, 'крупная готовность на экране');
ok((await page.locator('.exam-hero').innerText()).includes('прогноз по карточкам, не оценка'), 'подпись «прогноз по карточкам, не оценка»');
await page.screenshot({ path: `${OUT}/exam-screen-1280.png`, fullPage: false });
ok(await noOverflow(page), 'на 1280 нет горизонтальной прокрутки');

// ---------- 2. «Исправить» — режим «заранее» ----------
const fixBtn = page.getByRole('button', { name: /Исправить · \d+/ });
ok(await fixBtn.count() === 1, '«Исправить · N» показан, когда есть слабые места');
const n = Number(/(\d+)/.exec(await fixBtn.innerText())[1]);
await fixBtn.click();
await page.waitForTimeout(600);
ok(await page.getByText('заранее — слабые места').count() === 1, 'повторение «заранее»: пометка на экране');
ok(await page.getByRole('button', { name: 'Показать ответ' }).count() === 1, 'карточка открыта вопросом');
console.log(`    слабых к исправлению: ${n}`);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// ---------- 3. Пробная контрольная по всем темам ----------
await page.goto(URL); await page.waitForTimeout(600);
await page.getByRole('button', { name: /Контрольная по примеру/ }).first().click().catch(() => {});
await page.waitForTimeout(500);
if (!(await page.locator('.exam-hero').count())) { await page.keyboard.press('Control+p'); await page.locator('.palette input').fill('Контрольная: Контрольная'); await page.waitForTimeout(250); await page.keyboard.press('Enter'); await page.waitForTimeout(500); }
await page.getByRole('button', { name: /Пробная контрольная/ }).click();
await page.waitForTimeout(500);
ok(await page.getByRole('button', { name: 'Начать' }).count() >= 1, 'пробная контрольная открылась (настройка теста)');
await page.screenshot({ path: `${OUT}/exam-test-1280.png` });
await page.getByRole('button', { name: 'Начать' }).first().click();
await page.waitForTimeout(500);
ok((await page.locator('.review-card, .test-q, [class*=question]').count()) >= 1, 'тест по темам контрольной начался: вопрос на экране');

// ---------- 4. Сегодня: блок «Контрольные», старая дата у темы ----------
await start(page, 1280, 800);
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('mnema-data'));
  const t = d.topics.find((x) => !x.kind);
  t.examDate = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  localStorage.setItem('mnema-data', JSON.stringify(d));
});
await page.reload(); await page.waitForTimeout(700);
await page.locator('aside button', { hasText: 'Сегодня' }).first().click();
await page.waitForTimeout(400);
ok(await page.locator('.exam-card .exam-row').count() === 1, 'старая дата у темы показана на «Сегодня» как контрольная');
await page.screenshot({ path: `${OUT}/exam-today-1280.png` });
await page.locator('.exam-card .exam-main').first().click();
await page.waitForTimeout(600);
ok(await page.locator('.exam-hero').count() === 1, 'по ней открывается экран подготовки');
await page.getByRole('button', { name: 'Изменить' }).click();
await page.waitForTimeout(400);
const dlg2 = page.getByRole('dialog');
await dlg2.locator('input.input').first().fill('Теперь записанная');
await dlg2.getByRole('button', { name: 'Сохранить' }).click();
await page.waitForTimeout(700);
ok((await page.locator('h1.display').innerText()) === 'Теперь записанная', 'после изменения дата темы стала записанной контрольной');
await page.locator('aside button', { hasText: 'Сегодня' }).first().click();
await page.waitForTimeout(400);
ok(await page.locator('.exam-card .exam-row').count() === 1, 'на «Сегодня» она одна, без двойника от старой даты');

// ---------- 5. Размеры ----------
for (const [w, h] of [[900, 700], [390, 844]]) {
  await start(page, w, h);
  await seedStates(page);
  await page.keyboard.press('Control+p').catch(() => {});
  await page.evaluate(() => {});
  // создаём напрямую через данные, чтобы не зависеть от поиска на телефоне
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('mnema-data'));
    const s = d.subjects[0];
    d.exams = [{ id: 'e-demo', subjectId: s.id, name: 'Контрольная для проверки раскладки с очень длинным названием, чтобы проверить перенос строк', date: new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10), topicIds: d.topics.filter((t) => t.subjectId === s.id && !t.kind).map((t) => t.id), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    localStorage.setItem('mnema-data', JSON.stringify(d));
  });
  await page.reload(); await page.waitForTimeout(700);
  await page.evaluate(() => { location.hash = ''; });
  // открыть экран: через «Сегодня»
  const row = page.locator('.exam-card .exam-main').first();
  if (await row.count()) await row.click(); else console.log('    (блок контрольных не найден на «Сегодня»)');
  await page.waitForTimeout(600);
  ok(await page.locator('.exam-hero').count() === 1, `${w}px: экран контрольной открылся`);
  ok(await noOverflow(page), `${w}px: нет горизонтальной прокрутки`);
  await page.screenshot({ path: `${OUT}/exam-screen-${w}.png` });
  await page.getByRole('button', { name: 'Изменить' }).click();
  await page.waitForTimeout(400);
  ok(await noOverflow(page), `${w}px: окно «Изменить» не ломает раскладку`);
  await page.screenshot({ path: `${OUT}/exam-dialog-${w}.png` });
  await page.keyboard.press('Escape');
}

await browser.close();
console.log(errs.length ? 'Ошибки страницы: ' + errs.join(' | ') : 'Ошибок страницы нет');
if (errs.length) problems.push('ошибки страницы');
console.log(problems.length ? 'ПРОБЛЕМЫ:\n' + problems.join('\n') : 'ВСЁ ВЕРНО');
process.exit(problems.length ? 1 : 0);
