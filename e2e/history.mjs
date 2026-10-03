// Этап 7: «История конспекта» — пункт в меню темы, список версий, предпросмотр, возврат (текущий текст сохраняется как версия).
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/history.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];
const data = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mnema-data')));

for (const [w, h, phone] of [[1280, 800, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => {
    const at = new Date(Date.now() - 5 * 864e5).toISOString();
    const t1 = new Date(Date.now() - 3600e3).toISOString();
    const t2 = new Date(Date.now() - 2 * 3600e3).toISOString();
    localStorage.setItem('mnema-data', JSON.stringify({
      version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }],
      topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note: 'Новый короткий текст.', createdAt: at, updatedAt: at }, { id: 't2', subjectId: 's1', name: 'Ткани', note: 'Без истории.', createdAt: at, updatedAt: at }],
      cards: [], states: {}, logs: [], tests: [],
      noteHistory: { t1: [{ at: t1, note: 'Клетка — единица жизни. Ядро хранит ДНК. Митохондрии вырабатывают энергию.' }, { at: t2, note: 'Клетка — единица жизни.' }] },
      settings: { onboarded: true }
    }));
  });
  await page.reload();
  await page.waitForTimeout(700);
  const tag = String(w);
  if (phone) { await page.locator('.tab', { hasText: 'Знания' }).click(); await page.waitForTimeout(400); await page.getByRole('button', { name: 'Все темы списком' }).click(); await page.waitForTimeout(400); }
  await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
  await page.waitForTimeout(300);
  // тема без истории: пункта нет
  await page.locator('.tree-row', { hasText: 'Ткани' }).locator('.tree-label').click();
  await page.waitForTimeout(500);
  if (phone) await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Действия с темой' }).click();
  await page.waitForTimeout(250);
  check((await page.getByRole('menuitem', { name: /История конспекта/ }).count()) === 0, `${tag}: у темы без истории пункта «История конспекта» нет`);
  await page.keyboard.press('Escape');
  // тема с историей
  if (phone) { await page.locator('.tab', { hasText: 'Знания' }).click(); await page.waitForTimeout(400); await page.getByRole('button', { name: 'Все темы списком' }).click(); await page.waitForTimeout(400); }
  await page.locator('.tree-row', { hasText: 'Клетка' }).locator('.tree-label').click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Действия с темой' }).click();
  await page.waitForTimeout(250);
  await page.getByRole('menuitem', { name: /История конспекта/ }).click();
  await page.waitForTimeout(500);
  const items = await page.locator('.hist-item').count();
  check(items === 2, `${tag}: в списке 2 версии`);
  const prev1 = await page.locator('.hist-preview').innerText();
  check(prev1.includes('Митохондрии'), `${tag}: предпросмотр свежей версии: «${prev1.slice(0, 40)}…»`);
  await page.screenshot({ path: `${OUT}/history-${tag}.png` });
  // вернуть свежую версию
  await page.getByRole('button', { name: 'Вернуть эту версию' }).click();
  await page.waitForTimeout(900);
  const d = await data(page);
  const t = d.topics.find((x) => x.id === 't1');
  check(t.note.startsWith('Клетка — единица жизни. Ядро'), `${tag}: конспект вернулся к выбранной версии`);
  check(d.noteHistory.t1[0].note === 'Новый короткий текст.', `${tag}: прежний текст стал версией в истории (${d.noteHistory.t1.length} версий)`);
  const shown = await page.locator('.ProseMirror').innerText();
  check(shown.includes('Митохондрии'), `${tag}: редактор показывает вернувшийся текст`);
  const overflow = await page.evaluate(() => { const m = document.querySelector('.main'); return document.documentElement.scrollWidth > innerWidth + 1 || (m ? m.scrollWidth > m.clientWidth + 1 : false); });
  check(!overflow, `${tag}: нет горизонтальной прокрутки`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
