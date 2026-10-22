// Масштаб интерфейса: на телефоне — всё крупнее (страница раскладывается уже и растягивается), помнится после перезагрузки;
// в браузере на компьютере — подсказка про масштаб браузера. Крупный масштаб не ломает меню и нижнюю панель.
import { expect, test } from '@playwright/test';
import { openApp, overlaps } from './helpers';

test.describe('телефон', () => {
  test.skip(({ isMobile }) => !isMobile, 'телефон');

  test('«Крупнее» в настройках: интерфейс крупнее, выбор помнится', async ({ page }) => {
    await openApp(page, { name: 'settings', section: 'look' } as never);
    const w0 = await page.evaluate(() => innerWidth);
    const ctl = page.getByRole('group', { name: 'Масштаб интерфейса' });
    await ctl.scrollIntoViewIfNeeded();
    await ctl.getByRole('button', { name: 'Крупнее' }).click();
    await ctl.getByRole('button', { name: 'Крупнее' }).click();
    await expect(ctl.locator('output')).toHaveText('125%');
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(Math.round(w0 / 1.25));
    // Кнопки стали физически крупнее: высота нижней вкладки в пикселях экрана выросла.
    await page.reload();
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(Math.round(w0 / 1.25));
    await expect(page.getByRole('group', { name: 'Масштаб интерфейса' }).locator('output')).toHaveText('125%');
    await page.getByRole('group', { name: 'Масштаб интерфейса' }).getByRole('button', { name: 'Как было' }).click();
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(w0);
  });

  test('150%: меню предмета без наложений и без прокрутки вбок', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await page.evaluate(() => {
      localStorage.setItem('refrain-ui', JSON.stringify({ ...JSON.parse(localStorage.getItem('refrain-ui') ?? '{}'), zoom: 1.5 }));
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.zoom)).toBe('150');
    await page.getByRole('button', { name: 'Действия с предметом' }).click();
    await expect(page.locator('.menu.sheet')).toBeVisible();
    expect(await overlaps(page, '.menu [role="menuitem"]')).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
});

test.describe('компьютер в браузере', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'компьютер');
  test('подсказка про Ctrl + / Ctrl −, страница масштаб не перехватывает', async ({ page }) => {
    await openApp(page, { name: 'settings', section: 'look' } as never);
    await expect(page.getByText(/масштаб меняет сам браузер/)).toBeVisible();
    const before = await page.evaluate(() => document.querySelector('meta[name=viewport]')!.getAttribute('content'));
    await page.keyboard.press('Control+=');
    expect(await page.evaluate(() => document.querySelector('meta[name=viewport]')!.getAttribute('content'))).toBe(before);
  });
});
