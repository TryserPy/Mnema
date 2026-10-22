// 1.4: конспект на телефоне — быстрый старт (шаблоны, буфер), автосохранение и восстановление, панель над клавиатурой,
// карточка из выделения, отмена/возврат, режим «Чтение», длинный конспект.
import { expect, test, type Page } from '@playwright/test';
import { box, fakeKeyboardScript, openApp } from './helpers';

const editor = (page: Page) => page.locator('.ProseMirror').first();

async function openEmptyNote(page: Page) {
  await openApp(page, { name: 'topic', id: 'g6', tab: 'note' }, {
    patch: (d) => {
      (d.topics as { id: string; note: string }[]).find((t) => t.id === 'g6')!.note = '';
    }
  });
  await expect(editor(page)).toBeVisible();
}

async function selectWord(page: Page, word: string) {
  await page.evaluate((w) => {
    const root = document.querySelector('.ProseMirror')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const i = t.textContent!.indexOf(w);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(t, i);
      r.setEnd(t, i + w.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
      return;
    }
  }, word);
}

test.describe('быстрый старт', () => {
  test('«Создать» → «Новый конспект» → шаблон «По теме»', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await page.getByRole('button', { name: 'Создать' }).first().click();
    await page.getByRole('menuitem', { name: /Новый конспект/ }).click();
    await page.getByRole('dialog', { name: 'Новая тема' }).getByRole('textbox').first().fill('Векторы');
    await page.getByRole('button', { name: 'Создать', exact: true }).last().click();
    const start = page.getByRole('region', { name: 'Начать конспект' });
    await expect(start).toBeVisible();
    await start.getByRole('button', { name: /Шаблон «По теме»/ }).click();
    await expect(editor(page).getByRole('heading', { name: 'Векторы' })).toBeVisible();
    await expect(editor(page)).toContainText('Определения');
    await expect(start).toBeHidden();
  });

  test('вставка из буфера одним нажатием', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openEmptyNote(page);
    await page.evaluate(() => navigator.clipboard.writeText('Площадь   \r\nквадрата равна a².\r\n\r\n\r\nПлощадь прямоугольника — ab.'));
    await page.getByRole('button', { name: /Вставить из буфера/ }).click();
    await expect(editor(page)).toContainText('Площадь прямоугольника — ab.');
    await expect(page.locator('.toast')).toContainText('вставлен');
  });
});

test.describe('сохранение', () => {
  test('автосохранение: «Сохраняется…» → «Сохранено», после перезагрузки текст на месте', async ({ page }) => {
    await openEmptyNote(page);
    await editor(page).click();
    await page.keyboard.type('Площадь треугольника — половина основания на высоту. Ёлка 🌲 <script>alert(1)</script>');
    const status = page.locator('.note-save');
    await expect(status).toHaveText('Сохранено');
    await page.reload();
    await expect(editor(page)).toContainText('Площадь треугольника — половина основания на высоту. Ёлка 🌲 <script>alert(1)</script>');
    // Текст со «скриптом» — просто текст: ничего не выполнилось и в разметке нет <script>.
    expect(await editor(page).locator('script').count()).toBe(0);
  });

  test('ушёл с экрана сразу после набора — правка не потерялась', async ({ page }) => {
    await openEmptyNote(page);
    await editor(page).click();
    await page.keyboard.type('Последнее слово');
    await page.evaluate(() => (window as unknown as { __mnemaBack?: () => boolean }).__mnemaBack?.());
    await page.reload();
    await page.evaluate(() => localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'topic', id: 'g6', tab: 'note' }, at: Date.now() } })));
    await page.reload();
    await expect(editor(page)).toContainText('Последнее слово');
  });

  test('приложение свернули (visibilitychange) — сохраняется сразу', async ({ page }) => {
    await openEmptyNote(page);
    await editor(page).click();
    await page.keyboard.type('Свернул');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('.note-save')).toHaveText('Сохранено');
  });

  test('нет сети — «сохранено на устройстве»', async ({ page, context }) => {
    await openEmptyNote(page);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await editor(page).click();
    await page.keyboard.type('Без интернета');
    await expect(page.locator('.note-save')).toHaveText('Нет сети — сохранено на устройстве');
    await context.setOffline(false);
  });

  test('русский ввод через IME (композиция) сохраняется целиком', async ({ page }) => {
    await openEmptyNote(page);
    await editor(page).click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'пар', selectionStart: 3, selectionEnd: 3 });
    await cdp.send('Input.imeSetComposition', { text: 'паралл', selectionStart: 6, selectionEnd: 6 });
    await cdp.send('Input.insertText', { text: 'параллелограмм' });
    await expect(editor(page)).toContainText('параллелограмм');
    await expect(page.locator('.note-save')).toHaveText('Сохранено');
    await page.reload();
    await expect(editor(page)).toContainText('параллелограмм');
    expect((await editor(page).innerText()).match(/пар/g)?.length).toBe(1);
  });
});

test.describe('панель над клавиатурой (телефон)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 720, 'телефон');
  test.beforeEach(async ({ page }) => page.addInitScript(fakeKeyboardScript));
  const keyboard = (page: Page) => page.evaluate((px) => (window as unknown as { __kb: (n: number) => void }).__kb(px), Math.round(page.viewportSize()!.height * 0.42));

  test('появляется с клавиатурой, стоит над ней, кнопки 44 px', async ({ page }) => {
    await openEmptyNote(page);
    await expect(page.locator('.note-kbar')).toHaveCount(0);
    await editor(page).click();
    const kb = Math.round(page.viewportSize()!.height * 0.42);
    await page.evaluate((px) => (window as unknown as { __kb: (n: number) => void }).__kb(px), kb);
    const bar = page.getByRole('toolbar', { name: 'Оформление конспекта' });
    await expect(bar).toBeVisible();
    await expect.poll(async () => (await box(page, '.note-kbar'))!.bottom).toBeLessThanOrEqual(page.viewportSize()!.height - kb + 1);
    const small = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.note-kbar .kb-btn')).filter((b) => b.getClientRects().length && (b.offsetHeight < 44 || b.offsetWidth < 44)).length);
    expect(small).toBe(0);
    // «Готово» убирает фокус — панель пропадает.
    await bar.getByRole('button', { name: /Готово/ }).click();
    await expect(page.locator('.note-kbar')).toHaveCount(0);
  });

  test('отменить и вернуть', async ({ page }) => {
    await openEmptyNote(page);
    await editor(page).click();
    await keyboard(page);
    await page.keyboard.type('Ромб');
    const bar = page.getByRole('toolbar', { name: 'Оформление конспекта' });
    await bar.getByRole('button', { name: 'Отменить' }).click();
    await expect(editor(page)).not.toContainText('Ромб');
    await bar.getByRole('button', { name: 'Вернуть' }).click();
    await expect(editor(page)).toContainText('Ромб');
  });

  test('заголовок и жирный с панели', async ({ page }) => {
    await openEmptyNote(page);
    await editor(page).click();
    await keyboard(page);
    const bar = page.getByRole('toolbar', { name: 'Оформление конспекта' });
    await bar.getByRole('button', { name: 'Заголовок' }).click();
    await page.keyboard.type('Свойства');
    await expect(editor(page).locator('h2')).toHaveText('Свойства');
    await page.keyboard.press('Enter');
    await bar.getByRole('button', { name: 'Жирный' }).click();
    await page.keyboard.type('важно');
    await expect(editor(page).locator('strong')).toHaveText('важно');
  });

  test('выделение → «В карточку» в один тап', async ({ page }) => {
    await openApp(page, { name: 'topic', id: 'g2', tab: 'note' });
    await editor(page).click();
    await keyboard(page);
    await selectWord(page, 'четырёхугольник');
    const bar = page.getByRole('toolbar', { name: 'Оформление конспекта' });
    // Панель выделения (лист) может закрыть панель оформления — тогда «В карточку» есть в ней.
    const fromBar = bar.getByRole('button', { name: 'В карточку' });
    if (await fromBar.isVisible()) await fromBar.click();
    else await page.locator('.bubble.sel-panel').getByRole('button', { name: /В карточку/ }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Новая карточка' });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('четырёхугольник');
  });
});

test.describe('чтение и правка', () => {
  test('«Читать» — текст не редактируется, режим помнится после перезагрузки', async ({ page }) => {
    await openApp(page, { name: 'topic', id: 'g2', tab: 'note' });
    await page.getByRole('button', { name: /Читать/ }).first().click();
    await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
    await expect(page.locator('.note-save')).toHaveText('Чтение');
    await page.reload();
    await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
    await page.getByRole('button', { name: /Править/ }).first().click();
    await expect(editor(page)).toHaveAttribute('contenteditable', 'true');
  });
});

test.describe('длинный конспект', () => {
  test('3000 абзацев: открывается, набор не тормозит, сохраняется', async ({ page }) => {
    test.setTimeout(90_000);
    const long = Array.from({ length: 3000 }, (_, i) => `Абзац ${i + 1}. Параллелограмм — четырёхугольник, у которого противоположные стороны параллельны.`).join('\n\n');
    await openApp(page, { name: 'topic', id: 'g2', tab: 'note' }, {
      patch: (d) => {
        (d.topics as { id: string; note: string }[]).find((t) => t.id === 'g2')!.note = long;
      }
    });
    await expect(editor(page)).toContainText('Абзац 1.');
    await editor(page).locator('p').first().click();
    await page.keyboard.press('End');
    const t0 = Date.now();
    await page.keyboard.type(' быстро', { delay: 0 });
    const typed = Date.now() - t0;
    expect(typed).toBeLessThan(3000);
    await expect(page.locator('.note-save')).toHaveText('Сохранено', { timeout: 15_000 });
    await page.reload();
    await expect(editor(page).locator('p').first()).toContainText('быстро');
  });
});
