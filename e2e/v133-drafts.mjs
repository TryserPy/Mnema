// 1.33, №10 и №2: черновик новой карточки переживает закрытие окна, переход в конспект и перезагрузку;
// «Отмена» и сохранение его стирают. «Почему» и формулу можно убрать; пустое «почему» не сохраняется.
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=http://localhost:4174 [OUT=папка] node e2e/v133-drafts.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { seed } from './v132-seed.mjs';

const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT;
if (OUT) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => {
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
};

for (const v of [
  { name: 'desk', width: 1280, height: 820 },
  { name: '360', width: 360, height: 800 }
]) {
  const mobile = v.width < 900;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate((data) => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    sessionStorage.setItem('refrain-no-splash', String(Date.now()));
    localStorage.setItem('mnema-data-pending', JSON.stringify(data));
    localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'topic', id: 'g2', tab: 'cards' }, at: Date.now() } }));
  }, seed());
  await page.reload();
  await page.waitForTimeout(1200);
  const tag = v.name;
  const openNew = async () => {
    await page.locator('main button', { hasText: /^\s*Карточка/ }).first().click();
    await page.locator('.modal[aria-label="Новая карточка"]').waitFor();
  };
  const modal = page.locator('.modal[aria-label="Новая карточка"]');
  await openNew();
  await modal.locator('select').selectOption('reverse');
  await modal.locator('textarea').first().fill('Фотосинтез');
  await page.waitForTimeout(600);
  await modal.locator('button[aria-label="Закрыть"]').click();
  await page.waitForTimeout(400);
  check(await page.locator('main button', { hasText: /^\s*Карточка/ }).first().locator('.chip', { hasText: 'черновик' }).isVisible(), `${tag}: на кнопке видно «черновик»`);
  // Уйти в конспект и вернуться.
  await page.locator('[role="tab"], .tab, button', { hasText: /^Конспект$/ }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.locator('[role="tab"], .tab, button', { hasText: /^Карточки/ }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await openNew();
  check((await modal.locator('[data-part="draft-restored"]').isVisible()) && (await modal.locator('textarea').first().inputValue()) === 'Фотосинтез' && (await modal.locator('select').inputValue()) === 'reverse', `${tag}: после конспекта — «Черновик восстановлен», термин и тип на месте`);
  if (OUT) await page.screenshot({ path: join(OUT, `draft-${tag}.png`) });
  // Перезагрузка (как свернуть и выгрузить вкладку на телефоне).
  await modal.locator('textarea').nth(1).fill('Образование органических веществ на свету');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.reload();
  await page.waitForTimeout(1200);
  await openNew();
  check((await modal.locator('textarea').nth(1).inputValue()) === 'Образование органических веществ на свету', `${tag}: после перезагрузки значение на месте`);

  // №2: «почему» можно убрать; формулу — тоже.
  await modal.locator('button', { hasText: '+ Объяснение' }).click();
  await modal.locator('textarea').nth(2).fill('Потому что $E=h\\nu$');
  await page.waitForTimeout(300);
  check((await modal.locator('.formula-chip').count()) === 1, `${tag}: формула видна в списке «Формулы»`);
  await modal.locator('.formula-chip button').click();
  check((await modal.locator('textarea').nth(2).inputValue()) === 'Потому что', `${tag}: «×» у формулы убрал её из текста`);
  await modal.locator('button[aria-label="Убрать объяснение «почему»"]').click();
  check((await modal.locator('textarea').count()) === 2 && (await modal.locator('button', { hasText: '+ Объяснение' }).isVisible()), `${tag}: «×» убрал блок «почему», можно вернуть`);
  await modal.locator('button', { hasText: /^Добавить$/ }).click();
  await page.waitForTimeout(500);
  await modal.locator('button[aria-label="Закрыть"]').click();
  await page.waitForTimeout(500);
  check(!(await page.locator('main button', { hasText: /^\s*Карточка/ }).first().locator('.chip').count()), `${tag}: после «Добавить» черновика нет`);
  const added = page.locator('main', { hasText: 'Фотосинтез' });
  check((await added.count()) > 0, `${tag}: карточка добавлена`);

  // «Отмена» стирает черновик.
  await openNew();
  check(!(await modal.locator('[data-part="draft-restored"]').count()), `${tag}: новое окно — пустое`);
  await modal.locator('textarea').first().fill('временное');
  await page.waitForTimeout(600);
  await modal.locator('button', { hasText: /^Отмена$/ }).click();
  await page.waitForTimeout(400);
  await openNew();
  check((await modal.locator('textarea').first().inputValue()) === '', `${tag}: после «Отмена» черновика нет`);
  await modal.locator('button[aria-label="Закрыть"]').click();
  check(errors.length === 0, `${tag}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
