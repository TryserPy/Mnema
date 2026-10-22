// Все меню и поповеры на ключевых экранах (а не только «⋮» предмета): пункты не налезают, меню на экране целиком
// и не закрыто нижней панелью и плавающими кнопками — при обычном и при крупном (150%) шрифте.
import { expect, test, type Page } from '@playwright/test';
import { openApp, overlaps, settled, type Where } from './helpers';

// Тема с пятью словарями: вкладок больше, чем помещается, — появляется «Ещё» со своим меню.
const manyLists = (d: Record<string, unknown>) => {
  (d.topics as { id: string; lists?: unknown[] }[]).find((t) => t.id === 'g2')!.lists = [1, 2, 3, 4, 5].map((i) => ({ id: 'l' + i, kind: 'terms', title: `Словарь терминов номер ${i}`, cols: ['Термин', 'Значение', 'Пример'], mode: 'show' }));
};

const SCREENS: [string, Where, ((d: Record<string, unknown>) => void)?][] = [
  ['Учусь', { name: 'today' }],
  ['Предмет', { name: 'subject', id: 'geo' }],
  ['Тема — конспект', { name: 'topic', id: 'g2', tab: 'note' }],
  ['Тема — карточки', { name: 'topic', id: 'g2', tab: 'cards' }],
  ['Тема со словарями («Ещё»)', { name: 'topic', id: 'g2', tab: 'note' }, manyLists]
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
  for (const [name, where, patch] of SCREENS) {
    test(`${name}: все меню${big ? ' (шрифт 150%)' : ''}`, async ({ page }) => {
      await openApp(page, where, { dev: true, patch });
      if (big) await page.addStyleTag({ content: 'html { font-size: 24px !important; }' });
      // Кнопки помечаются один раз: после закрытия меню вкладки перестраиваются, и «n-я видимая кнопка» могла бы
      // снова оказаться той же самой.
      const n = await page.locator('main [aria-haspopup="menu"]').evaluateAll((els) => {
        els.forEach((e, i) => e.setAttribute('data-e2e-trigger', String(i)));
        return els.length;
      });
      for (let i = 0; i < n; i++) {
        const t = page.locator(`[data-e2e-trigger="${i}"]`);
        if (!(await t.count()) || !(await t.isVisible()) || (await t.isDisabled())) continue;
        const label = `${name} → «${(await t.getAttribute('aria-label')) ?? (await t.innerText()).trim()}»`;
        await t.click();
        // Меню появляется на кадр позже клика: ждём, пока кнопка скажет «раскрыто», и само меню.
        // Кнопка без aria-expanded открывает окно, а не меню, — её пропускаем.
        if ((await t.getAttribute('aria-expanded')) === null) continue;
        await expect(t, label + ': раскрылось').toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('.menu:not(.closing)').first(), label).toBeVisible();
        await checkOpenMenu(page, label);
        await page.keyboard.press('Escape');
        await expect(page.locator('.menu:not(.closing)'), label + ': Esc закрывает').toHaveCount(0);
        await expect(page.locator('.menu, .sheet-back')).toHaveCount(0); // дождаться конца анимации закрытия
      }
    });
  }
