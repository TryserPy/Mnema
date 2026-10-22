// 1.1: номер страницы можно ввести числом — в просмотре фото страниц учебника (единственная листалка «N из M»).
import { expect, test, type Page } from '@playwright/test';
import { box, fakeKeyboardScript, openApp } from './helpers';

const PAGES = 12;

async function openViewer(page: Page) {
  await openApp(page, { name: 'topic', id: 'g2', tab: 'note' }, {
    pages: PAGES,
    patch: (d) => {
      (d.topics as { id: string; note: string }[]).find((t) => t.id === 'g2')!.note = '[стр. 1]\n\nПараллелограмм — это четырёхугольник, у которого противоположные стороны попарно параллельны.';
    }
  });
  await page.getByText('стр. 1', { exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: /Страница 1/ })).toBeVisible();
  return page.getByRole('textbox', { name: /Номер страницы/ });
}

test.describe('ввод номера страницы', () => {
  test('поле с цифровой клавиатурой, показывает текущую страницу', async ({ page }) => {
    const input = await openViewer(page);
    await expect(input).toHaveValue('1');
    await expect(input).toHaveAttribute('inputmode', 'numeric');
    await expect(input).toHaveAttribute('enterkeyhint', /go|done/);
    await expect(page.getByText(`из ${PAGES}`)).toBeVisible();
    const b = (await input.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
  });

  test('Enter переходит на страницу', async ({ page }) => {
    const input = await openViewer(page);
    await input.fill('7');
    await input.press('Enter');
    await expect(page.getByRole('dialog', { name: /Страница 7/ })).toBeVisible();
    await expect(input).toHaveValue('7');
  });

  test('потеря фокуса тоже применяет номер', async ({ page }) => {
    const input = await openViewer(page);
    await input.fill('4');
    await input.blur();
    await expect(page.getByRole('dialog', { name: /Страница 4/ })).toBeVisible();
  });

  for (const [raw, want] of [
    ['99', PAGES],
    ['0', 1],
    ['-3', 1],
    ['2.5', 1],
    ['abc', 1],
    ['', 1],
    ['  5 ', 5],
    ['٣', 1]
  ] as const) {
    test(`ввод «${raw}» → страница ${want}`, async ({ page }) => {
      const input = await openViewer(page);
      await input.fill(raw);
      await input.press('Enter');
      await expect(page.getByRole('dialog', { name: new RegExp(`Страница ${want}\\b`) })).toBeVisible();
      await expect(input).toHaveValue(String(want));
      expect(await page.evaluate(() => document.body.innerText.includes('NaN'))).toBe(false);
    });
  }

  test('Esc возвращает прежний номер, не закрывая окно', async ({ page }) => {
    const input = await openViewer(page);
    await input.fill('9');
    await input.press('Escape');
    await expect(input).toHaveValue('1');
    await expect(page.getByRole('dialog', { name: /Страница 1/ })).toBeVisible();
  });

  test('синхронизация с кнопками «вперёд/назад»', async ({ page }) => {
    const input = await openViewer(page);
    await page.getByRole('button', { name: 'Следующая страница' }).click();
    await expect(input).toHaveValue('2');
    await input.fill('12');
    await input.press('Enter');
    await expect(page.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
    await page.getByRole('button', { name: 'Предыдущая страница' }).click();
    await expect(input).toHaveValue('11');
  });

  test('быстрые повторные нажатия не уводят за границы', async ({ page }) => {
    const input = await openViewer(page);
    const next = page.getByRole('button', { name: 'Следующая страница' });
    for (let i = 0; i < 20; i++) await next.click({ force: true }).catch(() => undefined);
    await expect(input).toHaveValue(String(PAGES));
  });
});

test.describe('клавиатура не закрывает поле', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 720, 'только телефон');
  test('поле над экранной клавиатурой', async ({ page }) => {
    await page.addInitScript(fakeKeyboardScript);
    const input = await openViewer(page);
    await input.focus();
    const kb = Math.round(page.viewportSize()!.height * 0.42);
    await page.evaluate((px) => (window as unknown as { __kb: (n: number) => void }).__kb(px), kb);
    await expect.poll(async () => (await box(page, 'input.pager-input'))?.bottom ?? 9999).toBeLessThanOrEqual(page.viewportSize()!.height - kb + 1);
  });
});
