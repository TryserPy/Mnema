// Все меню и поповеры на ключевых экранах (а не только «⋮» предмета): пункты не налезают, меню на экране целиком
// и не закрыто нижней панелью и плавающими кнопками — при обычном и при крупном (150%) шрифте.
import { expect, test, type Page } from '@playwright/test';
import { openApp, overlaps, settled, type Where } from './helpers';

const SCREENS: [string, Where][] = [
  ['Учусь', { name: 'today' }],
  ['Предмет', { name: 'subject', id: 'geo' }],
  ['Тема — конспект', { name: 'topic', id: 'g2', tab: 'note' }],
  ['Тема — карточки', { name: 'topic', id: 'g2', tab: 'cards' }]
];

async function checkOpenMenu(page: Page, label: string) {
  const menu = page.locator('.menu:not(.closing)').last();
  await expect(menu, label).toBeVisible();
  await settled(page, '.menu');
  expect(await overlaps(page, '.menu:not(.closing) [role="menuitem"]'), label).toEqual([]);
  const r = (await menu.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(r.x, label).toBeGreaterThanOrEqual(-0.5);
  expect(r.y, label).toBeGreaterThanOrEqual(-0.5);
  expect(r.x + r.width, label).toBeLessThanOrEqual(vp.width + 0.5);
  expect(r.y + r.height, label).toBeLessThanOrEqual(vp.height + 0.5);
  // Первый видимый пункт можно нажать: сверху над ним ничего не лежит.
  const first = menu.locator('[role="menuitem"]').first();
  const hit = await first.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return Boolean(top && el.contains(top));
  });
  expect(hit, label + ': пункт закрыт другим элементом').toBe(true);
}

for (const big of [false, true])
  for (const [name, where] of SCREENS) {
    test(`${name}: все меню${big ? ' (шрифт 150%)' : ''}`, async ({ page }) => {
      await openApp(page, where, { dev: true });
      if (big) await page.addStyleTag({ content: 'html { font-size: 24px !important; }' });
      const triggers = page.locator('main [aria-haspopup="menu"]:visible');
      const n = await triggers.count();
      for (let i = 0; i < n; i++) {
        const t = triggers.nth(i);
        if (!(await t.isVisible()) || (await t.isDisabled())) continue;
        const label = `${name} → «${(await t.getAttribute('aria-label')) ?? (await t.innerText()).trim()}»`;
        await t.click();
        if (!(await page.locator('.menu:not(.closing)').count())) continue; // кнопка открыла окно, а не меню
        await checkOpenMenu(page, label);
        await page.keyboard.press('Escape');
        await expect(page.locator('.menu:not(.closing)')).toHaveCount(0);
      }
    });
  }
