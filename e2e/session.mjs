// Этап 4: «Сегодня» — одна кнопка «Учиться», время 5/10/20, «Что в плане и почему», пропуск шага, одна строка про контрольную.
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/session.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];

for (const [w, h, phone] of [[1280, 800, false], [900, 700, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => {
    const at = new Date(Date.now() - 20 * 864e5).toISOString();
    const day = 864e5;
    const exam = new Date(Date.now() + 4 * day).toISOString().slice(0, 10);
    const cards = [];
    const states = {};
    for (let i = 0; i < 60; i++) {
      const id = 'r' + i;
      cards.push({ id, topicId: i % 2 ? 't1' : 't2', type: 'basic', front: 'Вопрос ' + i, back: 'Ответ ' + i, createdAt: at, updatedAt: at });
      states[id + ':0'] = { due: new Date(Date.now() - (2 + (i % 3)) * day).toISOString(), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: new Date(Date.now() - 6 * day).toISOString() };
    }
    for (let i = 0; i < 12; i++) cards.push({ id: 'n' + i, topicId: 't1', type: 'basic', front: 'Новый ' + i, back: 'О ' + i, createdAt: at, updatedAt: at });
    localStorage.setItem('mnema-data', JSON.stringify({
      version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }],
      topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note: '', createdAt: at, updatedAt: at }, { id: 't2', subjectId: 's1', name: 'Ткани', note: '', createdAt: at, updatedAt: at }],
      exams: [{ id: 'e1', subjectId: 's1', name: 'Контрольная по клетке', date: exam, topicIds: ['t1'], createdAt: at, updatedAt: at }],
      cards, states, logs: [], tests: [], settings: { onboarded: true }
    }));
  });
  await page.reload();
  await page.waitForTimeout(700);
  const tag = `${w}`;
  const num = async () => Number((await page.locator('.hero-num').first().innerText()).trim());
  const launchers = async () => page.locator('.today-page button:has-text("Начать"), .today-page button:has-text("Готовиться"), .today-page button:has-text("Учить ·"), .today-page button:has-text("Подготовиться")').count();

  check((await page.locator('.hero-btn').innerText()).includes('Учиться'), `${tag}: главная кнопка называется «Учиться»`);
  check((await launchers()) === 0, `${tag}: старых кнопок запуска («Начать», «Готовиться», «Учить ·», «Подготовиться») на «Сегодня» нет`);
  const chips = await page.locator('.hero-chip').allInnerTexts();
  check(chips.join('|') === '5 мин|10 мин|20 мин|Всё', `${tag}: выбор времени: ${chips.join(' | ')}`);
  const all = await num();
  check(all > 30, `${tag}: «Всё» — ${all} карточек`);
  await page.locator('.hero-chip', { hasText: '5 мин' }).click();
  await page.waitForTimeout(500);
  const five = await num();
  const sub = await page.locator('.hero-sub').innerText();
  check(five < all && five >= 20 && five <= 35, `${tag}: «5 мин» — ${five} карточек (${sub.replace(/\n/g, ' ')})`);
  check(/ещё \d+ — на потом/.test(sub), `${tag}: сказано, сколько остаётся на потом`);
  await page.locator('.hero-chip', { hasText: '20 мин' }).click();
  await page.waitForTimeout(400);
  check((await num()) > five, `${tag}: «20 мин» — больше, чем «5 мин»`);
  await page.locator('.hero-chip', { hasText: '10 мин' }).click();
  await page.waitForTimeout(400);

  // что в плане и почему
  await page.locator('.plan-why-toggle').click();
  await page.waitForTimeout(500);
  const steps = await page.locator('.plan-steps li').allInnerTexts();
  check(steps.length >= 3, `${tag}: в плане ${steps.length} шага: ${steps.map((s) => s.split('\n')[1]).join(' / ')}`);
  check(steps.some((s) => s.includes('К контрольной «Контрольная по клетке»')) && steps.some((s) => s.includes('через 4 дня')), `${tag}: шаг про контрольную с названием и сроком`);
  await page.screenshot({ path: `${OUT}/session-${tag}-plan.png` });
  // пропустить «Новое» (в режиме «Всё» число должно уменьшиться; при ограничении по времени место займут повторения)
  await page.locator('.hero-chip', { hasText: 'Всё' }).click();
  await page.waitForTimeout(400);
  const before = await num();
  await page.locator('.plan-steps li', { hasText: 'Новое' }).getByRole('button', { name: 'Пропустить' }).click();
  await page.waitForTimeout(500);
  const after = await num();
  check(after < before, `${tag}: «Пропустить» у шага «Новое» уменьшило число ${before} → ${after}`);
  check((await page.locator('.plan-steps li.skipped').count()) === 1 && (await page.locator('.plan-steps li.skipped').getByRole('button', { name: 'Вернуть' }).count()) === 1, `${tag}: пропущенный шаг виден и его можно вернуть`);
  // строка про контрольную
  const line = await page.locator('.exam-line').innerText();
  check(/Ближайшая контрольная — «Контрольная по клетке», через 4 дня/.test(line), `${tag}: одна строка про ближайшую контрольную: ${line.replace(/\n/g, ' ')}`);
  if (phone) check(!/Ctrl|клавиш/i.test(await page.locator('.today-page').innerText()), `${tag}: на телефоне нет подсказок про клавиши`);
  const overflow = await page.evaluate(() => { const m = document.querySelector('.main'); return document.documentElement.scrollWidth > innerWidth + 1 || (m ? m.scrollWidth > m.clientWidth + 1 : false); });
  check(!overflow, `${tag}: нет горизонтальной прокрутки`);
  await page.screenshot({ path: `${OUT}/session-${tag}-today.png` });

  // «Учиться»: открывается повторение, очередь = то, что на кнопке
  await page.locator('.hero-btn').click();
  await page.waitForTimeout(600);
  const reveal = await page.getByRole('button', { name: 'Показать ответ' }).count();
  check(reveal === 1, `${tag}: «Учиться» открыло повторение с вопросом`);
  const prog = await page.locator('.review-progress, .progress, [class*="progress"]').first().innerText().catch(() => '');
  console.log(`   (${tag}) шапка повторения: ${prog.replace(/\n/g, ' ').slice(0, 80)}`);
  await page.screenshot({ path: `${OUT}/session-${tag}-review.png` });
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
