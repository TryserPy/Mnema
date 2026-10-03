// Этап 2 (вычитание): экраны, которые поменялись — «Сегодня», «Статистика», «Справка», «Настройки → Оформление», «Возможности».
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/stage2.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const problems = [];
const SIZES = [
  { w: 1280, h: 800, phone: false },
  { w: 900, h: 700, phone: false },
  { w: 390, h: 844, phone: true }
];
for (const { w, h, phone } of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${w}: pageerror ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`${w}: HTTP ${r.status()} ${r.url()}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) problems.push(`${w}: console.error ${m.text()}`); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
  await page.getByRole('button', { name: 'Посмотреть на примере' }).click();
  await page.waitForTimeout(500);
  const shot = (n) => page.screenshot({ path: `${OUT}/s2-${w}-${n}.png` });
  const foot = (n) => page.locator(`.foot-btn[aria-label="${n}"]`).click();
  const openNav = async () => { if (phone) { await page.getByRole('button', { name: 'Знания' }).click(); await page.waitForTimeout(300); } };
  await shot('1-today');
  // Статистика
  await openNav();
  await foot('Статистика');
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('.sg-always')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await shot('2-stats-always');
  const streakTile = await page.getByText('Дней подряд').count();
  if (!streakTile) problems.push(`${w}: нет плитки «Дней подряд»`);
  // Справка
  await openNav();
  await foot('Справка');
  await page.waitForTimeout(400);
  const helpTabs = await page.getByRole('radio').allInnerTexts();
  console.log(`${w} справка, вкладки: [${helpTabs.join(' | ')}]`);
  if (phone ? helpTabs.join('|') !== 'Как учиться' : helpTabs.join('|') !== 'Как учиться|Клавиши') problems.push(`${w}: вкладки справки: ${helpTabs.join('|')}`);
  await shot('3-help');
  // Возможности
  await openNav();
  await foot('Возможности');
  await page.waitForTimeout(400);
  const tiles = await page.locator('.feat-tile').count();
  const heads = await page.locator('.feat-group-title, .sgroup-title, h3').allInnerTexts();
  console.log(`${w} возможности: плиток ${tiles}; группы: ${heads.join(' | ')}`);
  if (tiles !== 14 && tiles !== 13) problems.push(`${w}: плиток возможностей ${tiles} (ждём 14, на телефоне без «Значок у часов» — 13)`);
  await shot('4-features');
  // Настройки → «Стили» (с 1.16 снова свой раздел)
  await openNav();
  await foot('Настройки');
  await page.waitForTimeout(400);
  const navItems = await page.locator('.set-nav-item').allInnerTexts();
  const stylesItem = page.locator('.set-nav-item', { hasText: 'Стили' });
  if (await stylesItem.count()) { await stylesItem.click(); await page.waitForTimeout(300); }
  console.log(`${w} настройки, разделы: ${navItems.map((x) => x.trim()).join(' | ')}`);
  if (!navItems.some((x) => /Стили/.test(x))) problems.push(`${w}: в разделах настроек нет раздела «Стили»`);
  await shot('5-look-styles');
  const sticky = page.locator('.st-tile', { hasText: 'Стикеры' });
  if (await sticky.count()) {
    await sticky.click();
    await page.waitForTimeout(300);
    const on = await page.evaluate(() => Boolean(document.getElementById('mnema-mods')?.textContent?.includes('Стикеры')));
    console.log(`${w} стикеры включились: ${on}`);
    if (!on) problems.push(`${w}: стиль «Стикеры» не применился`);
    await shot('6-look-styles-on');
    await sticky.click();
    await page.waitForTimeout(200);
    const off = await page.evaluate(() => !document.getElementById('mnema-mods')?.textContent?.includes('Стикеры'));
    if (!off) problems.push(`${w}: стиль «Стикеры» не выключился`);
  } else problems.push(`${w}: нет переключателя «Стикеры»`);
  // «Выключить все» должно выключить все включённые стили, а не один
  for (const n of ['Тетрадь', 'Стикеры']) await page.locator('.st-tile', { hasText: n }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Выключить все' }).click();
  await page.waitForTimeout(300);
  const left = await page.evaluate(() => document.getElementById('mnema-mods')?.textContent?.trim() ?? '');
  console.log(`${w} после «Выключить все» стилей осталось: ${left ? 'да' : 'нет'}`);
  if (left) problems.push(`${w}: «Выключить все» оставило стили: ${left.slice(0, 60)}`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? 'ПРОБЛЕМЫ:\n' + problems.join('\n') : 'ВСЁ ВЕРНО');
process.exit(problems.length ? 1 : 0);
