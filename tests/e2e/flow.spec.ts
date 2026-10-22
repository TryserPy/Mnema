// Главный путь ученика с нуля: знакомство → предмет → тема → конспект → карточка → учёба → контрольная → экспорт.
import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test('с нуля до экспорта в Anki', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page, { name: 'today' }, { fresh: true });

  // Знакомство: 5 шагов, можно пропустить; на последнем — «Давай попробуем» и «Посмотреть на примере».
  const guide = page.getByRole('dialog', { name: 'Знакомство с Refrain' });
  await expect(guide).toBeVisible();
  for (let i = 0; i < 4; i++) await guide.getByRole('button', { name: 'Дальше' }).click();
  await expect(guide.getByRole('button', { name: /Давай попробуем/ })).toBeVisible();
  await guide.getByRole('button', { name: 'Пропустить' }).click();
  await expect(guide).toBeHidden();

  // Пустой экран объясняет, что делать, и даёт первый шаг.
  await expect(page.getByRole('heading', { name: 'Привет! Это Refrain' })).toBeVisible();
  await page.locator('.welcome').getByRole('button', { name: /Добавить предмет/ }).click();
  const subj = page.getByRole('dialog', { name: 'Новый предмет' });
  await subj.getByPlaceholder('Например: Биология').fill('Геометрия');
  await subj.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByRole('heading', { name: 'Геометрия' })).toBeVisible();

  // Тема.
  await page.getByRole('button', { name: 'Добавить первую тему' }).click();
  await page.getByPlaceholder(/Название темы/).fill('Параллелограмм');
  await page.getByRole('main').getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Название темы' })).toHaveValue('Параллелограмм');

  // Конспект из шаблона и своими словами.
  await page.getByRole('button', { name: /Шаблон «По теме»/ }).click();
  const ed = page.locator('.ProseMirror').first();
  await expect(ed).toContainText('Главное');
  await ed.locator('li').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('. Параллелограмм — четырёхугольник с попарно параллельными сторонами');
  await expect(page.locator('.note-save')).toHaveText('Сохранено');

  // Карточка: вкладка «Карточки» → пустое состояние объясняет и даёт «Вручную».
  await page.getByRole('tab', { name: 'Карточки' }).click();
  await expect(page.getByText('Карточек пока нет')).toBeVisible();
  await page.getByRole('button', { name: /Вручную/ }).click();
  const cardDlg = page.getByRole('dialog', { name: 'Новая карточка' });
  await expect(cardDlg).toBeVisible();
  const fields = cardDlg.locator('textarea, [contenteditable="true"]');
  await fields.nth(0).click();
  await page.keyboard.type('Что такое параллелограмм?');
  await fields.nth(1).click();
  await page.keyboard.type('Четырёхугольник, у которого противоположные стороны попарно параллельны');
  await cardDlg.getByRole('button', { name: 'Добавить' }).click();

  // Учёба: «Учить · 1».
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.getByRole('button', { name: /Учить · \d/ }).first().click();
  await page.getByRole('button', { name: 'Показать ответ' }).click();
  await page.locator('.grades .grade').last().click();
  await expect(page.getByText(/Готово|На сегодня всё|Молодец/).first()).toBeVisible();

  // Контрольная — из меню предмета.
  await page.evaluate(() => (window as unknown as { __mnemaBack: () => boolean }).__mnemaBack());
  await page.evaluate(() => (window as unknown as { __mnemaBack: () => boolean }).__mnemaBack());
  await expect(page.getByRole('heading', { name: 'Геометрия' })).toBeVisible();
  await page.getByRole('button', { name: 'Действия с предметом' }).click();
  await page.getByRole('menuitem', { name: /Новая контрольная/ }).click();
  const exam = page.getByRole('dialog');
  const d = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  await exam.locator('input[type="date"]').fill(d);
  const firstTopic = exam.locator('input[type="checkbox"]').first();
  if (!(await firstTopic.isChecked())) await firstTopic.check();
  await exam.getByRole('button', { name: 'Сохранить' }).click();
  await expect(exam).toBeHidden();
  // Результат виден сразу: экран контрольной с прогнозом.
  await expect(page.getByRole('heading', { name: 'Контрольная: Геометрия' })).toBeVisible();
  await expect(page.getByText('помнишь к дате', { exact: true })).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Геометрия', exact: true }).click();

  // Экспорт в Anki.
  await page.getByRole('button', { name: 'Действия с предметом' }).click();
  await page.getByRole('menuitem', { name: /Экспорт в Anki/ }).click();
  const anki = page.getByRole('dialog', { name: 'Экспорт в Anki' });
  const dl = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
  await anki.getByRole('button', { name: /Сохранить 1 карточку/ }).click();
  const file = await dl;
  if (file) expect(file.suggestedFilename()).toMatch(/\.apkg$/);
  else await expect(anki).toContainText(/Готово/);
});
