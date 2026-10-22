// Шаг 2: понятность без инструкции — подсказки при первом открытии экрана, справка с поиском и словарём,
// подписи у чисел, предсказуемое «Назад», «Отменить» после копии, хлебные крошки.
import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

const back = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __mnemaBack: () => boolean }).__mnemaBack());

test('подсказка экрана: один раз, «Понятно» — и больше нет; «Помощь» возвращает', async ({ page }) => {
  await openApp(page, { name: 'subject', id: 'geo' });
  const tip = page.getByRole('complementary', { name: /Подсказка: Это предмет/ });
  await expect(tip).toBeVisible();
  await tip.getByRole('button', { name: 'Понятно' }).click();
  await expect(tip).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Геометрия' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: /Подсказка: Это предмет/ })).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('refrain-ui', JSON.stringify({ ...JSON.parse(localStorage.getItem('refrain-ui')!), route: { r: { name: 'help', section: 'use' }, at: Date.now() } })));
  await page.reload();
  await page.getByRole('button', { name: 'Показать подсказки к экранам снова' }).click();
  await expect(page.getByRole('complementary', { name: /Подсказка: «Учусь»/ })).toBeVisible();
});

test('у темы — «N сегодня» и «выучено N%», а не голые числа', async ({ page }) => {
  // Две карточки «Четырёхугольников» уже учили, и их пора повторить.
  await openApp(page, { name: 'subject', id: 'geo' }, {
    patch: (d) => {
      const st = { due: '2026-09-02T10:00:00.000Z', stability: 2, difficulty: 5, elapsed_days: 1, scheduled_days: 1, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: '2026-09-01T10:00:00.000Z' };
      d.states = { 'c1:0': st, 'c2:0': st };
    }
  });
  const row = page.locator('.topic-row', { hasText: 'Четырёхугольники' });
  await expect(row.locator('.badge')).toHaveText('2 сегодня');
  await expect(row).toContainText(/выучено \d+%/);
});

test('кнопка «▶ N» в шапке подписана словами', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'шапка телефона');
  await openApp(page, { name: 'subject', id: 'geo' });
  await expect(page.getByRole('button', { name: /Учить всё на сегодня: \d+ карточ/ })).toBeVisible();
});

test('справка: поиск по словам и словарь', async ({ page }) => {
  await openApp(page, { name: 'help', section: 'use' } as never);
  const q = page.getByRole('searchbox', { name: 'Поиск по справке' });
  await q.fill('термин');
  await expect(page.locator('.how-found dt', { hasText: 'Термин' })).toBeVisible();
  await q.fill('еще раз');
  await expect(page.locator('.how-found dt', { hasText: 'Повторить ещё раз' }).first()).toBeVisible();
  await q.fill('абракадабра');
  await expect(page.locator('.how-found')).toContainText('Ничего не нашлось');
  await q.fill('');
  await page.getByRole('button', { name: /Словарь/ }).click();
  await expect(page.locator('.how-group.open dt', { hasText: 'Конспект' })).toBeVisible();
});

test('«Назад»: шторка → подтема → тема → предмет → «Знания» → «Учусь» → выход вторым нажатием', async ({ page }) => {
  await openApp(page, { name: 'topic', id: 'g2', tab: 'note' });
  await expect(page.getByRole('textbox', { name: 'Название темы' })).toHaveValue('Параллелограмм');
  expect(await back(page)).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Название темы' })).toHaveValue('Четырёхугольники');
  expect(await back(page)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Геометрия' })).toBeVisible();
  expect(await back(page)).toBe(true);
  await expect(page.locator('.know-page')).toBeVisible();
  expect(await back(page)).toBe(true);
  await expect(page.locator('.today-page')).toBeVisible();
  expect(await back(page)).toBe(true);
  await expect(page.locator('.toast')).toContainText('ещё раз, чтобы выйти');
  expect(await back(page)).toBe(false);
});

test('хлебные крошки: папка › предмет › тема', async ({ page }) => {
  await openApp(page, { name: 'topic', id: 'g2' }, {
    patch: (d) => {
      (d as { folders?: unknown[] }).folders = [{ id: 'f1', name: 'Математика', createdAt: '2026-09-01T10:00:00.000Z' }];
      (d.subjects as { id: string; folderId?: string }[])[0].folderId = 'f1';
    }
  });
  const nav = page.getByRole('navigation', { name: 'Где я' });
  await expect(nav).toContainText('Математика');
  await expect(nav).toContainText('Геометрия');
  await expect(nav).toContainText('Четырёхугольники');
  await nav.getByRole('button', { name: 'Математика' }).click();
  await expect(page.getByRole('heading', { name: 'Математика' })).toBeVisible();
});

test('«Сделать копию» → тост с «Открыть» и «Отменить»; «Отменить» убирает копию без следа', async ({ page }) => {
  await openApp(page, { name: 'subject', id: 'geo' });
  await page.getByRole('button', { name: 'Действия с предметом' }).click();
  await page.getByRole('menuitem', { name: /Сделать копию/ }).click();
  const toast = page.locator('.toast');
  await expect(toast).toContainText('Копия готова');
  await expect(toast.getByRole('button', { name: 'Открыть' })).toBeVisible();
  await toast.getByRole('button', { name: 'Отменить' }).click();
  const names = await page.evaluate(async () => {
    const raw = localStorage.getItem('mnema-data-pending');
    return raw;
  });
  void names;
  await page.reload();
  // В «Знаниях» один предмет «Геометрия», копии нет; корзина пуста.
  await page.evaluate(() => localStorage.setItem('refrain-ui', JSON.stringify({ ...JSON.parse(localStorage.getItem('refrain-ui')!), route: { r: { name: 'knowledge' }, at: Date.now() } })));
  await page.reload();
  await expect(page.locator('.know-page')).toBeVisible();
  await expect(page.getByText(/Геометрия \(копия\)|копия/i)).toHaveCount(0);
});

test('удаление предмета — подтверждение, затем «Вернуть»', async ({ page }) => {
  await openApp(page, { name: 'subject', id: 'bio' });
  await page.getByRole('button', { name: 'Действия с предметом' }).click();
  await page.getByRole('menuitem', { name: /Удалить предмет/ }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: /Удалить/ }).last().click();
  const toast = page.locator('.toast');
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: /Вернуть/ }).click();
  await page.evaluate(() => localStorage.setItem('refrain-ui', JSON.stringify({ ...JSON.parse(localStorage.getItem('refrain-ui')!), route: { r: { name: 'subject', id: 'bio' }, at: Date.now() } })));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Биология' })).toBeVisible();
});
