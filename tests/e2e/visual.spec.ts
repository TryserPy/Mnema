// Скриншотные проверки (visual regression) ключевых экранов на телефоне. Эталоны — tests/e2e/__screenshots__;
// обновить после намеренной правки вида: npx playwright test visual --update-snapshots.
import { expect, test, type Page } from '@playwright/test';
import { openApp, settled, type Where } from './helpers';

test.beforeEach(({}, info) => test.skip(!['phone-360', 'phone-412', 'desktop'].includes(info.project.name), 'эталоны — на трёх размерах'));

const NOW = new Date('2026-10-05T10:00:00+03:00');

async function shot(page: Page, where: Where, name: string, prep?: (p: Page) => Promise<void>) {
  await page.clock.setFixedTime(NOW);
  await openApp(page, where);
  // Подсказки при первом открытии — отдельная проверка (clarity.spec.ts), на эталонах их нет.
  await page.evaluate(() => {
    const ui = JSON.parse(localStorage.getItem('refrain-ui') ?? '{}');
    localStorage.setItem('refrain-ui', JSON.stringify({ ...ui, 'tips-seen': ['today', 'knowledge', 'subject', 'topic', 'profile'] }));
  });
  await page.reload();
  await expect(page.locator('.app')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if (prep) await prep(page);
  await settled(page, '.app');
  // Допуск 5 %: на другой машине (CI) сглаживание шрифтов и тени дают ~3 % разницы; съехавшая раскладка — намного больше.
  await expect(page).toHaveScreenshot(name + '.png', { fullPage: false, maxDiffPixelRatio: 0.05, mask: [page.locator('.ProseMirror-separator')] });
}

test('предмет', async ({ page }) => shot(page, { name: 'subject', id: 'geo' }, 'subject'));
test('меню «⋮» предмета', async ({ page }) =>
  shot(page, { name: 'subject', id: 'geo' }, 'subject-menu', async (p) => {
    await p.getByRole('button', { name: 'Действия с предметом' }).click();
    await settled(p, '.menu');
  }));
test('конспект', async ({ page }) => shot(page, { name: 'topic', id: 'g2', tab: 'note' }, 'topic-note'));
test('знания', async ({ page }) => shot(page, { name: 'knowledge' }, 'knowledge'));
test('настройки — оформление', async ({ page }) => shot(page, { name: 'settings', section: 'look' } as Where, 'settings-look'));
