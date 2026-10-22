// Устойчивость: пустые данные, очень длинные названия, спецсимволы и эмодзи, HTML и скрипты в тексте (XSS),
// тысячи карточек, двойной тап, нет сети, возврат в приложение. Ни одной ошибки страницы.
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const XSS = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"'&amp;`;
const LONG = 'Тригонометрическиепреобразованияипроизводные'.repeat(4) + ' — очень длинное название темы, которое не помещается в одну строку на телефоне';

test('пустые данные: понятный первый экран, без ошибок', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page, { name: 'knowledge' }, { fresh: true, onboarded: true });
  await page.getByRole('dialog').getByRole('button', { name: 'Пропустить' }).click().catch(() => undefined);
  await expect(page.getByText('Здесь появятся твои предметы')).toBeVisible();
  await expect(page.locator('.empty').getByRole('button', { name: /Создать/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('HTML и скрипты в названиях и конспекте не выполняются', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page, { name: 'subject', id: 'geo' }, {
    patch: (d) => {
      (d.subjects as { name: string }[])[0].name = 'Геометрия ' + XSS;
      const ts = d.topics as { id: string; name: string; note: string }[];
      ts[0].name = XSS + ' 🧮 ∑ ½';
      ts[1].note = `# Заголовок\n\n${XSS}\n\n[ссылка](javascript:window.__xss=3)`;
    }
  });
  await expect(page.getByRole('heading', { name: /Геометрия/ })).toBeVisible();
  await page.locator('.topic-row').first().click();
  await page.evaluate(() => localStorage.setItem('refrain-ui', JSON.stringify({ ...JSON.parse(localStorage.getItem('refrain-ui')!), route: { r: { name: 'topic', id: 'g2', tab: 'note' }, at: Date.now() } })));
  await page.reload();
  await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.locator('.ProseMirror a').first().click({ force: true }).catch(() => undefined);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  // Картинка с неверным адресом может остаться картинкой, но без обработчиков; тегов <script> в странице нет.
  expect(await page.locator('main script, main [onerror], main [onload]').count()).toBe(0);
  expect(await page.locator('main a[href^="javascript:"]').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('очень длинные названия и эмодзи: ничего не вылезает вбок', async ({ page }) => {
  await openApp(page, { name: 'subject', id: 'geo' }, {
    patch: (d) => {
      (d.subjects as { name: string; icon: string }[])[0].name = '👩‍🔬🧪 ' + LONG;
      for (const t of d.topics as { name: string }[]) t.name = LONG;
    }
  });
  await expect(page.locator('.topic-row').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const over = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.topic-row')).filter((r) => r.scrollWidth > r.clientWidth + 2).length);
  expect(over).toBe(0);
});

test('3000 карточек: предмет открывается быстро', async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page, { name: 'knowledge' }, {
    patch: (d) => {
      const cards = d.cards as Record<string, unknown>[];
      const topics = d.topics as { id: string }[];
      for (let i = 0; i < 3000; i++) cards.push({ id: 'm' + i, topicId: topics[i % topics.length].id, type: 'basic', front: `Вопрос ${i}?`, back: `Ответ ${i}`, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' });
    }
  });
  const t0 = Date.now();
  await page.locator('.know-tile', { hasText: 'Геометрия' }).first().click();
  await expect(page.getByRole('heading', { name: 'Геометрия' })).toBeVisible();
  await expect(page.locator('.topic-row').first()).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(4000);
});

test('двойной тап по «Создать» в окне предмета — один предмет', async ({ page }) => {
  await openApp(page, { name: 'knowledge' });
  await page.getByRole('button', { name: 'Создать' }).first().click();
  await page.getByRole('menuitem', { name: /Новый предмет/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Новый предмет' });
  await dlg.getByPlaceholder('Например: Биология').fill('Физика');
  const btn = dlg.getByRole('button', { name: 'Создать' });
  // Два касания подряд, как дрогнувшим пальцем: второе приходится уже на закрывающееся окно.
  await btn.evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect(page.getByRole('heading', { name: 'Физика' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('refrain-ui', JSON.stringify({ ...JSON.parse(localStorage.getItem('refrain-ui')!), route: { r: { name: 'knowledge' }, at: Date.now() } })));
  await page.reload();
  await expect(page.locator('.know-tile', { hasText: 'Физика' })).toHaveCount(1);
});

test('нет сети: всё работает, данные сохраняются', async ({ page, context }) => {
  const errors = watchErrors(page);
  await openApp(page, { name: 'subject', id: 'geo' });
  await context.setOffline(true);
  await page.getByRole('button', { name: /Тема/ }).first().click();
  await page.getByPlaceholder(/Название темы/).fill('Без интернета');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Название темы' })).toHaveValue('Без интернета');
  expect(errors).toEqual([]);
  // Сеть вернулась — тема на месте и после перезагрузки (данные лежат на устройстве, а не на сервере).
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Название темы' })).toHaveValue('Без интернета');
});

test('возврат в приложение (свернули и открыли) — без ошибок, экран на месте', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page, { name: 'topic', id: 'g2', tab: 'note' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('mnema:resume'));
  });
  await expect(page.getByRole('textbox', { name: 'Название темы' })).toHaveValue('Параллелограмм');
  expect(errors).toEqual([]);
});

test('быстрые нажатия на «⋮»: меню открывается и закрывается без ошибок и «призраков»', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page, { name: 'subject', id: 'geo' });
  const btn = page.getByRole('button', { name: 'Действия с предметом' });
  for (let i = 0; i < 6; i++) await btn.click({ force: true, noWaitAfter: true }).catch(() => undefined);
  await expect.poll(() => page.locator('.menu:not(.closing)').count()).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu')).toHaveCount(0);
  expect(await page.locator('.sheet-back').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('двойной тап по «Создать» новой темы — одна тема', async ({ page }) => {
  await openApp(page, { name: 'subject', id: 'bio' });
  await page.getByRole('button', { name: /Тема/ }).first().click();
  await page.getByPlaceholder(/Название темы/).fill('§3. Кишечнополостные');
  await page.getByRole('main').getByRole('button', { name: 'Создать', exact: true }).evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect(page.getByRole('textbox', { name: 'Название темы' })).toHaveValue('§3. Кишечнополостные');
  await page.getByRole('main').getByRole('button', { name: /Биология/ }).first().click();
  await expect(page.locator('.topic-row', { hasText: 'Кишечнополостные' })).toHaveCount(1);
});
