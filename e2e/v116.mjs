// 1.16 «порядок»: поиск в Настройках без вылезающего текста, «Стили» — свой раздел, в справке нет вкладки «Моды»
// (а «Как писать моды» открывается в «Настройках → Моды»), меню темы «⋯» с группами «Проверить себя» и «Поделиться».
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/v116.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];

for (const [w, h, phone] of [[1280, 800, false], [900, 800, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => {
    const at = new Date(Date.now() - 5 * 864e5).toISOString();
    const card = (id, q) => ({ id, topicId: 't1', type: 'basic', front: q, back: 'ответ', createdAt: at });
    localStorage.setItem('mnema-data', JSON.stringify({
      version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }],
      topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note: 'Клетка — единица жизни. Ядро хранит ДНК.', createdAt: at, updatedAt: at }],
      cards: [card('c1', 'Где ДНК?'), card('c2', 'Что такое клетка?'), card('c3', 'Что делают митохондрии?')], states: {}, logs: [], tests: [],
      settings: { onboarded: true, theme: 'dark', fontScale: 1.2, look: { style: 'classic', light: 'paper', dark: 'coffee', font: 'literata', headFont: 'literata', radius: 'normal', background: 'plain', custom: {} }, accent: '#E0A050', features: { mods: true }, pluginsSafe: false }
    }));
  });
  await page.reload();
  await page.waitForTimeout(800);
  const tag = String(w);

  // ---------- 1. Поиск в Настройках ----------
  if (phone) { await page.locator('.tab', { hasText: 'Профиль' }).click(); await page.waitForTimeout(400); await page.getByRole('menuitem', { name: /Настройки/ }).click(); }
  else await page.getByRole('button', { name: 'Настройки' }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('textbox', { name: 'Найти настройку' }).fill('ко');
  await page.waitForTimeout(300);
  const over = await page.evaluate(() => {
    const nav = document.querySelector('.set-nav');
    if (!nav) return ['нет .set-nav'];
    const r = nav.getBoundingClientRect();
    return Array.from(document.querySelectorAll('.set-result span')).filter((s) => {
      const b = s.getBoundingClientRect();
      return b.right > r.right + 1 || s.scrollWidth > s.clientWidth + 1;
    }).map((s) => s.textContent);
  });
  check(over.length === 0, `${tag}: результаты поиска не вылезают за колонку${over.length ? ': ' + over.join(', ') : ''}`);
  await page.screenshot({ path: `${OUT}/v116-search-${tag}.png` });
  await page.getByRole('textbox', { name: 'Найти настройку' }).fill('');
  await page.waitForTimeout(200);

  // ---------- 2. «Стили» — отдельный раздел ----------
  const navItems = (await page.locator('.set-nav-item').allInnerTexts()).map((x) => x.trim());
  check(navItems.includes('Стили'), `${tag}: в Настройках есть раздел «Стили» (${navItems.join(' · ')})`);
  check(navItems.includes('Моды'), `${tag}: раздел «Моды» в Настройках остался`);
  await page.locator('.set-nav-item', { hasText: 'Оформление' }).click();
  await page.waitForTimeout(300);
  check((await page.locator('[data-set="styles"]').count()) === 0 && (await page.locator('.st-tile', { hasText: 'Стикеры' }).count()) === 0, `${tag}: в «Оформлении» стилей больше нет`);
  if (await page.locator('.set-back').count()) { await page.locator('.set-back').click(); await page.waitForTimeout(300); }
  await page.locator('.set-nav-item', { hasText: 'Стили' }).click();
  await page.waitForTimeout(400);
  check((await page.locator('.st-tile', { hasText: 'Стикеры' }).count()) === 1, `${tag}: в разделе «Стили» есть переключатель «Стикеры»`);
  await page.screenshot({ path: `${OUT}/v116-styles-${tag}.png` });

  // ---------- 3. Моды: справка без вкладки, «Как писать моды» — окном ----------
  if (!phone) {
    if (await page.locator('.set-back').count()) { await page.locator('.set-back').click(); await page.waitForTimeout(300); }
    await page.locator('.set-nav-item', { hasText: 'Моды' }).click();
    await page.waitForTimeout(400);
    const own = page.getByRole('radio', { name: /Сделать свой/ });
    if (await own.count()) await own.first().click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Как писать моды/ }).click();
    await page.waitForTimeout(400);
    check((await page.locator('.modal', { hasText: 'Что умеет app' }).count()) === 1, `${tag}: «Как писать моды» открывает окно с примером`);
    await page.screenshot({ path: `${OUT}/v116-modsguide-${tag}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Справка' }).first().click();
    await page.waitForTimeout(400);
    const tabs = await page.getByRole('radiogroup', { name: 'Раздел справки' }).getByRole('radio').allInnerTexts();
    check(!tabs.some((t) => /Моды/.test(t)), `${tag}: в справке нет вкладки «Моды» (${tabs.join(' · ')})`);
  }

  // ---------- 4. Меню темы ----------
  if (phone) { await page.locator('.tab', { hasText: 'Знания' }).click(); await page.waitForTimeout(400); }
  await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
  await page.waitForTimeout(300);
  await page.locator('.tree-row', { hasText: 'Клетка' }).locator('.tree-label').click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Действия с темой' }).click();
  await page.waitForTimeout(300);
  const top = (await page.locator('.menu[role="menu"] [role="menuitem"]').allInnerTexts()).map((x) => x.split('\n')[0].trim());
  check(top.length <= 8, `${tag}: в меню темы ${top.length} пунктов: ${top.join(' · ')}`);
  check(!top.some((t) => /важн/i.test(t)), `${tag}: «Отметить важной» — только звёздочкой у названия`);
  const inView = async () => page.evaluate(() => {
    const m = document.querySelector('.menu[role="menu"]');
    const r = m.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  });
  check(await inView(), `${tag}: меню целиком в окне`);
  await page.screenshot({ path: `${OUT}/v116-menu-${tag}.png` });
  await page.getByRole('menuitem', { name: /Проверить себя/ }).click();
  await page.waitForTimeout(300);
  const sub = (await page.locator('.menu[role="menu"] [role="menuitem"]').allInnerTexts()).map((x) => x.split('\n')[0].trim());
  check(sub[0] === 'Проверить себя' && sub.some((t) => /Закрой и перескажи/.test(t)) && sub.some((t) => /Пробная контрольная/.test(t)), `${tag}: группа «Проверить себя»: ${sub.join(' · ')}`);
  check(await inView(), `${tag}: группа целиком в окне`);
  const focused = await page.evaluate(() => document.activeElement?.classList.contains('menu-back'));
  check(focused, `${tag}: фокус на «Назад» после открытия группы`);
  await page.screenshot({ path: `${OUT}/v116-menu-check-${tag}.png` });
  await page.locator('.menu-back').click();
  await page.waitForTimeout(250);
  check((await page.locator('.menu[role="menu"] [role="menuitem"]').count()) === top.length, `${tag}: «Назад» возвращает основной список`);
  await page.getByRole('menuitem', { name: /Поделиться/ }).click();
  await page.waitForTimeout(250);
  const share = (await page.locator('.menu[role="menu"] [role="menuitem"]').allInnerTexts()).map((x) => x.split('\n')[0].trim());
  check(share.length === 4, `${tag}: группа «Поделиться»: ${share.join(' · ')}`);
  await page.screenshot({ path: `${OUT}/v116-menu-share-${tag}.png` });
  await page.getByRole('menuitem', { name: /Распечатать карточки/ }).click();
  await page.waitForTimeout(400);
  check((await page.locator('.modal').count()) === 1, `${tag}: пункт из группы срабатывает (окно печати)`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // Снова открыть меню — снова основной список, а не группа
  await page.getByRole('button', { name: 'Действия с темой' }).click();
  await page.waitForTimeout(250);
  check((await page.locator('.menu-back').count()) === 0, `${tag}: при новом открытии меню показан основной список`);
  await ctx.close();
}
check(errors.length === 0, `ошибок страницы нет${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(bad ? `\nНЕ ПРОШЛО: ${bad}` : '\nВсё прошло');
process.exit(bad ? 1 : 0);
