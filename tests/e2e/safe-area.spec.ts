// 1.3: системные панели телефона (строка состояния, вырез, жестовая полоса) и экранная клавиатура ничего не закрывают.
// env(safe-area-inset-*) в Chromium без выреза — 0, поэтому отступы подменяются через --native-* (их же ставит обёртка Android).
import { expect, test, type Page } from '@playwright/test';
import { box, fakeKeyboardScript, fakeSafeArea, openApp, settled } from './helpers';

const INSET = { top: 28, bottom: 34, left: 0, right: 0 };

async function bottomOf(page: Page, sel: string) {
  const b = await box(page, sel);
  expect(b, sel).not.toBeNull();
  return b!.bottom;
}

test.describe('безопасная зона', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 720, 'телефон');

  test('нижняя панель и шапка — внутри безопасной зоны', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await fakeSafeArea(page, INSET);
    const vh = page.viewportSize()!.height;
    // Кнопки вкладок кончаются над жестовой полосой.
    for (const name of ['Учусь', 'Знания', 'Профиль']) {
      const b = (await page.locator('.tabbar').getByRole('button', { name }).boundingBox())!;
      expect(b.y + b.height, name).toBeLessThanOrEqual(vh - INSET.bottom + 0.5);
    }
    // Шапка: кнопки ниже строки состояния.
    const bar = (await page.locator('.mobile-bar button').first().boundingBox())!;
    expect(bar.y).toBeGreaterThanOrEqual(INSET.top - 0.5);
  });

  test('шторка меню: последний пункт над жестовой полосой', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await fakeSafeArea(page, INSET);
    await page.getByRole('button', { name: 'Действия с предметом' }).click();
    await settled(page, '.menu.sheet');
    // Долистать шторку до конца, как это сделает палец.
    await page.locator('.menu.sheet').evaluate((m) => (m.scrollTop = m.scrollHeight));
    const last = page.locator('.menu.sheet [role="menuitem"]').last();
    await expect.poll(async () => (await last.boundingBox())!.y + (await last.boundingBox())!.height).toBeLessThanOrEqual(page.viewportSize()!.height - INSET.bottom + 0.5);
    // Верх шторки — ниже строки состояния.
    expect((await box(page, '.menu.sheet'))!.top).toBeGreaterThanOrEqual(INSET.top);
  });

  test('повторение (без нижней панели): кнопки оценки над жестовой полосой', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await fakeSafeArea(page, INSET);
    await page.getByRole('button', { name: /Учить всё на сегодня: \d+ карточ/ }).click();
    await page.getByRole('button', { name: /Показать ответ|Проверить/ }).first().click();
    await expect(page.locator('.grades')).toBeVisible();
    await settled(page, '.grades');
    expect(await bottomOf(page, '.grades')).toBeLessThanOrEqual(page.viewportSize()!.height - INSET.bottom + 0.5);
  });

  test('окно-шторка: кнопки внизу окна над жестовой полосой', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await fakeSafeArea(page, INSET);
    await page.getByRole('button', { name: 'Действия с предметом' }).click();
    await page.getByRole('menuitem', { name: /Новая контрольная/ }).click();
    const modal = page.locator('.modal').last();
    await expect(modal).toBeVisible();
    await settled(page, '.modal');
    const inner = await modal.evaluate((m) => {
      const r = m.getBoundingClientRect();
      return r.bottom - parseFloat(getComputedStyle(m).paddingBottom);
    });
    expect(inner).toBeLessThanOrEqual(page.viewportSize()!.height - INSET.bottom + 0.5);
  });

  test('тост над нижней панелью и жестовой полосой', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await fakeSafeArea(page, INSET);
    await page.getByRole('button', { name: 'Действия с предметом' }).click();
    await page.getByRole('menuitem', { name: /Сделать копию/ }).click();
    const t = page.locator('.toast');
    await expect(t).toBeVisible();
    await settled(page, '.toast');
    const tb = (await box(page, '.tabbar'))!;
    expect((await box(page, '.toast'))!.bottom).toBeLessThanOrEqual(tb.top + 0.5);
  });
});

test.describe('телефон боком: вырез сбоку', () => {
  test.skip(({ viewport }) => !viewport || viewport.width <= viewport.height, 'только ландшафт');
  test('содержимое не уходит под вырез', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await fakeSafeArea(page, { left: 44, right: 44, bottom: 21 });
    const h = (await page.getByRole('heading', { name: 'Геометрия' }).boundingBox())!;
    expect(h.x).toBeGreaterThanOrEqual(44);
    const app = (await box(page, '.app'))!;
    const inner = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.app')!).paddingLeft));
    expect(inner).toBe(44);
    expect(app.right).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});

test.describe('экранная клавиатура', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 720, 'телефон');

  test('поле внизу экрана прокручивается над клавиатурой; нижняя панель и 🐞 прячутся', async ({ page }) => {
    await page.addInitScript(fakeKeyboardScript);
    await openApp(page, { name: 'subject', id: 'geo' }, { dev: true });
    // Поле в самом низу прокручиваемой области экрана.
    await page.evaluate(() => {
      const main = document.querySelector('.main')!;
      const pad = document.createElement('div');
      pad.style.height = '1200px';
      const input = document.createElement('input');
      input.className = 'input';
      input.id = 'probe';
      input.setAttribute('aria-label', 'проба');
      main.append(pad, input);
      main.scrollTop = main.scrollHeight;
    });
    const probe = page.locator('#probe');
    await probe.focus();
    const kb = Math.round(page.viewportSize()!.height * 0.45);
    await page.evaluate((px) => (window as unknown as { __kb: (n: number) => void }).__kb(px), kb);
    await expect(page.locator('html')).toHaveAttribute('data-kb', '');
    await expect(page.locator('.tabbar')).toBeHidden();
    await expect(page.locator('.dev-fab')).toBeHidden();
    await expect.poll(async () => (await probe.boundingBox())!.y + (await probe.boundingBox())!.height).toBeLessThanOrEqual(page.viewportSize()!.height - kb + 1);
    // Клавиатуру убрали — панель вернулась.
    await page.evaluate(() => (window as unknown as { __kb: (n: number) => void }).__kb(0));
    await expect(page.locator('.tabbar')).toBeVisible();
  });

  test('поле номера темы: шрифт не меньше 16 px (iOS не увеличивает страницу)', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await page.getByRole('button', { name: /Тема/ }).first().click();
    const fs = await page.locator('form input.input').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(fs).toBeGreaterThanOrEqual(16);
  });
});
