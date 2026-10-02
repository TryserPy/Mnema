// Этап 6: причины ошибок в повторении («не помню / перепутал / не понял») и «Повторить ошибки» с записью в расписание.
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/errors.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];
const closeModal = async (page) => { if (await page.locator('.modal-back').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(350); } };
const logs = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mnema-data')).logs.map((l) => ({ cardId: l.cardId, rating: l.rating, err: l.err })));

for (const [w, h, phone] of [[1280, 800, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => {
    const at = new Date(Date.now() - 20 * 864e5).toISOString();
    const cards = []; const states = {};
    for (let i = 0; i < 4; i++) {
      const id = 'c' + i;
      cards.push({ id, topicId: 't1', type: 'basic', front: 'Вопрос ' + i, back: 'Ответ ' + i, createdAt: at, updatedAt: at });
      states[id + ':0'] = { due: new Date(Date.now() - 2 * 864e5).toISOString(), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: new Date(Date.now() - 7 * 864e5).toISOString() };
    }
    localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note: '', createdAt: at, updatedAt: at }], cards, states, logs: [], tests: [], settings: { onboarded: true } }));
  });
  await page.reload();
  await page.waitForTimeout(700);
  const tag = String(w);
  await page.locator('.hero-btn').click();
  await page.waitForTimeout(500);
  check((await page.locator('.err-chips').count()) === 0, `${tag}: пока ответ не открыт, пометок причины нет`);
  await page.getByRole('button', { name: 'Показать ответ' }).click();
  await page.waitForTimeout(300);
  const chips = await page.locator('.err-chip').allInnerTexts();
  check(chips.join('|') === 'Не помню|Перепутал|Не понял', `${tag}: после ответа — причины: ${chips.join(' | ')}`);
  await page.screenshot({ path: `${OUT}/errors-${tag}-chips.png` });
  // 1-я карточка: «Перепутал»
  await page.locator('.err-chip', { hasText: 'Перепутал' }).click();
  await page.waitForTimeout(400);
  let l = await logs(page);
  check(l.length === 1 && l[0].rating === 1 && l[0].err === 'mixed', `${tag}: «Перепутал» = «Снова» + причина в журнале: ${JSON.stringify(l[0])}`);
  // остальные — «Помню» (обычная оценка, без причины)
  for (let i = 0; i < 12; i++) {
    await closeModal(page);
    if (await page.getByRole('button', { name: 'Показать ответ' }).count()) await page.getByRole('button', { name: 'Показать ответ' }).click();
    await page.waitForTimeout(150);
    const good = page.locator('.grade.good').first();
    if (!(await good.count())) break;
    await good.click();
    await page.waitForTimeout(250);
    await closeModal(page);
    if (await page.locator('.done-card').count()) break;
  }
  // карточка с «Снова» вернулась в очередь (через несколько минут) — доигрываем
  for (let i = 0; i < 6 && !(await page.locator('.done-card').count()); i++) {
    await closeModal(page);
    if (await page.getByRole('button', { name: 'Показать ответ' }).count()) await page.getByRole('button', { name: 'Показать ответ' }).click();
    await page.waitForTimeout(150);
    const good = page.locator('.grade.good').first();
    if (await good.count()) await good.click();
    await page.waitForTimeout(300);
    await closeModal(page);
  }
  const done = await page.locator('.done-card').innerText().catch(() => '');
  check(/Что пошло не так: перепутал — 1/.test(done), `${tag}: в итоге: «Что пошло не так: перепутал — 1»`);
  check(/Повторить ошибки · 1/.test(done), `${tag}: есть «Повторить ошибки · 1»`);
  await page.screenshot({ path: `${OUT}/errors-${tag}-done.png` });
  await page.waitForTimeout(800); // данные сохраняются с задержкой 400 мс
  const before = (await logs(page)).length;
  await closeModal(page);
  await page.getByRole('button', { name: /Повторить ошибки/ }).click();
  await page.waitForTimeout(600);
  const m = (await page.locator('body').innerText()).match(/1 из (\d+)/);
  check(m && m[1] === '1', `${tag}: «Повторить ошибки» открыло занятие из одной карточки (1 из ${m ? m[1] : '?'})`);
  await page.getByRole('button', { name: 'Показать ответ' }).click();
  await page.waitForTimeout(200);
  await page.locator('.grade.good').first().click();
  await page.waitForTimeout(900);
  check((await logs(page)).length === before + 1, `${tag}: повтор ошибки записан в расписание (ответов ${before} → ${(await logs(page)).length})`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
