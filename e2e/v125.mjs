// 1.25.0: без «Создать» в нижней панели (значок «+» в шапке), окна и меню не вылезают за экран, справка «Где это?» и «Пример».
// Запуск: URL=http://localhost:4174 OUT=out node e2e/v125.mjs
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
const SEED = (at) => {
  const t = (id, s, name, extra = {}) => ({ id, subjectId: s, name, note: 'Конспект ' + name + ' — главное своими словами.', createdAt: at, updatedAt: at, ...extra });
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, folders: [{ id: 'f1', name: 'Науки', color: '#888', createdAt: at }], subjects: [{ id: 's1', name: 'Английский язык и литература', color: '#05f', folderId: 'f1', createdAt: at }, { id: 's2', name: 'История', color: '#D8503F', createdAt: at }], topics: [t('t1', 's1', 'Present Simple'), t('t2', 's1', 'Past Simple'), t('h1', 's2', 'Русь')], cards: [{ id: 'c1', topicId: 't1', type: 'basic', front: 'В', back: 'О', createdAt: at, updatedAt: at }], states: {}, logs: [], tests: [], settings: { onboarded: true } }));
};
const inside = async (page, sel, w, h) => {
  const b = await page.locator(sel).last().boundingBox();
  return b && b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= w + 0.5 && b.y + b.height <= h + 0.5 ? null : b;
};

for (const [w, h, phone] of [[360, 760, true], [390, 844, true], [900, 700, false], [1280, 800, false]]) {
  const tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(SEED, at);
  await page.reload();
  await page.waitForTimeout(700);
  if (phone) {
    const tabs = await page.locator('.tabbar .tab-label').allInnerTexts();
    check(tabs.join('|') === 'Учусь|Знания|Профиль', `${tag}: внизу нет «Создать»: ${tabs.join(' | ')}`);
    await page.locator('.mobile-bar .mobile-create').click();
    await page.waitForTimeout(400);
    check((await page.locator('.modal h2', { hasText: 'Создать' }).count()) === 1, `${tag}: «+» в шапке открывает «Создать»`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  // меню предмета «⋯»
  if (phone) { await page.locator('.tab', { hasText: 'Знания' }).click(); await page.waitForTimeout(300); await page.locator('.know-tile').first().click(); }
  else await page.locator('.sidebar .tree-row.folder .twisty').click().then(() => page.locator('.sidebar .tree-label', { hasText: 'Английский' }).click());
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Действия с предметом' }).click();
  await page.waitForTimeout(500);
  let out = await inside(page, '.menu', w, h);
  check(!out, `${tag}: меню предмета «⋯» целиком на экране${out ? ' ' + JSON.stringify(out) : ''}`);
  await page.screenshot({ path: `${OUT}/v125-${tag}-subjmenu.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // меню темы «⋯» и «+» у вкладок
  await page.locator('.main .topic-row').first().click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Действия с темой' }).click();
  await page.waitForTimeout(500);
  out = await inside(page, '.menu', w, h);
  check(!out, `${tag}: меню темы «⋯» целиком на экране${out ? ' ' + JSON.stringify(out) : ''}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (!phone) {
    // контекстное меню у правого-нижнего края
    await page.locator('.sidebar .tree-row.subject').last().click({ button: 'right' });
    await page.waitForTimeout(400);
    out = await inside(page, '.menu.ctx', w, h);
    check(!out, `${tag}: контекстное меню в панели целиком на экране`);
    await page.keyboard.press('Escape');
  }
  // окна не шире экрана
  if (phone) await page.locator('.mobile-bar .mobile-create').click(); else await page.locator('.sidebar .create-btn').click();
  await page.waitForTimeout(400);
  out = await inside(page, '.modal', w, h);
  check(!out, `${tag}: окно «Создать» целиком на экране`);
  await page.keyboard.press('Escape');
  await ctx.close();
}

// ---------- Справка: «Где это?» и «Пример» ----------
for (const [w, h, phone] of [[1280, 800, false], [390, 844, true]]) {
  const tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(SEED, at);
  await page.reload();
  await page.waitForTimeout(700);
  const openHelp = async () => {
    if (phone) await page.locator('.tab', { hasText: 'Профиль' }).click(); else await page.locator('.sidebar .nav-item', { hasText: 'Профиль' }).click();
    await page.locator('.prof-links .create-item', { hasText: 'Справка' }).click();
    await page.waitForTimeout(400);
    await page.locator('.seg button', { hasText: 'Как пользоваться' }).click();
    await page.waitForTimeout(400);
  };
  await openHelp();
  const nWhere = await page.locator('.how-acts button', { hasText: 'Где это?' }).count();
  const nDemo = await page.locator('.how-acts button', { hasText: 'Пример' }).count();
  check(nWhere >= 3 && nDemo >= 3, `${tag}: в открытой группе есть «Где это?» (${nWhere}) и «Пример» (${nDemo})`);
  // «Где это?» у «Учиться»
  await page.locator('.how-row', { hasText: '«Учиться»' }).getByRole('button', { name: 'Где это?' }).click();
  await page.waitForTimeout(900);
  check((await page.locator('.show-me .tut-card').count()) === 1 && (await page.locator('.show-me .tut-ring').count()) === 1, `${tag}: «Где это?» — перешёл на «Сегодня» и подсветил кнопку`);
  check((await page.locator('.hero-btn').count()) === 1, `${tag}: открыт экран «Сегодня»`);
  await page.screenshot({ path: `${OUT}/v125-${tag}-where.png` });
  await page.locator('.show-me').getByRole('button', { name: 'Понятно' }).click();
  await page.waitForTimeout(300);
  check((await page.locator('.show-me').count()) === 0, `${tag}: «Понятно» закрывает подсказку`);
  // «Где это?» у темы (меню темы)
  await openHelp();
  await page.locator('.how-row', { hasText: 'Закрой и перескажи' }).getByRole('button', { name: 'Где это?' }).click();
  await page.waitForTimeout(900);
  check((await page.locator('button[aria-label="Действия с темой"]').count()) === 1 && (await page.locator('.show-me .tut-ring').count()) === 1, `${tag}: «Закрой и перескажи» — открыл тему и подсветил «⋯»`);
  await page.locator('.show-me').getByRole('button', { name: 'Закрыть' }).click();
  // все примеры проходятся до конца
  await openHelp();
  for (const g of ['devices', 'order', 'safe']) {
    const heads = page.locator('.how-head');
    const n = await heads.count();
    for (let i = 0; i < n; i++) if (!(await page.locator('.how-group').nth(i).evaluate((e) => e.classList.contains('open')))) await heads.nth(i).click();
  }
  await page.waitForTimeout(400);
  const demos = page.locator('.how-acts button', { hasText: 'Пример' });
  const total = await demos.count();
  let passed = 0;
  for (let i = 0; i < total; i++) {
    await demos.nth(i).scrollIntoViewIfNeeded();
    await demos.nth(i).click();
    await page.waitForTimeout(400);
    for (let k = 0; k < 12; k++) {
      if (await page.locator('.demo-foot').getByRole('button', { name: 'Понятно' }).count()) break;
      const hot = page.locator('.demo-stage .hot');
      if (await hot.count()) await hot.first().click();
      await page.waitForTimeout(k < 2 ? 300 : 900);
    }
    if (await page.locator('.demo-foot').getByRole('button', { name: 'Понятно' }).count()) passed++;
    if (i === 0) await page.screenshot({ path: `${OUT}/v125-${tag}-demo.png` });
    const wf = await page.locator('.modal .demo-stage').boundingBox();
    if (wf && wf.x + wf.width > w + 1) check(false, `${tag}: пример ${i} шире экрана`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  check(total >= 6 && passed === total, `${tag}: все примеры проходятся до конца (${passed} из ${total})`);
  // пример Wi-Fi: скриншот середины
  await page.locator('.how-row', { hasText: 'По Wi-Fi' }).getByRole('button', { name: 'Пример' }).click();
  await page.waitForTimeout(300);
  await page.locator('.demo-stage .hot').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/v125-${tag}-wifi.png` });
  await page.keyboard.press('Escape');
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
