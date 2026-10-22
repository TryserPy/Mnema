// 1.2: меню «⋮» предмета и темы — пункты не налезают друг на друга, меню целиком на экране и ничем не закрыто
// (нижняя навигация, 🐞, таймер), на телефоне это шторка снизу, которая закрывается тапом мимо, свайпом и «Назад».
import { expect, test, type Page } from '@playwright/test';
import { box, isPhone, openApp, overlaps } from './helpers';

const ITEMS = '.menu [role="menuitem"]';

async function openSubjectMenu(page: Page) {
  await page.getByRole('button', { name: 'Действия с предметом' }).click();
  await expect(page.locator('.menu').first()).toBeVisible();
  // Дождаться конца анимации появления.
  await expect.poll(() => page.evaluate(() => document.querySelector('.menu')?.getAnimations().length ?? 0)).toBe(0);
}

/** Каждый видимый пункт можно нажать: в его середине — сам пункт, а не нижняя панель или плавающая кнопка поверх. */
async function covered(page: Page): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const menu = el.closest('.menu') as HTMLElement;
      const r = el.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      // Пункты, прокрученные за край меню или под закреплённую шапку шторки, не проверяем — до них долистывают.
      const head = menu.querySelector('.sheet-head')?.getBoundingClientRect();
      if (r.top < (head ? head.bottom : m.top) || r.bottom > m.bottom) continue;
      for (const [x, y] of [
        [r.left + 6, r.top + r.height / 2],
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.right - 6, r.top + r.height / 2]
      ]) {
        const top = document.elementFromPoint(x, y);
        if (!top || !el.contains(top)) {
          out.push(`«${el.innerText.split('\n')[0]}» закрыт ${top ? top.className || top.tagName : 'ничем (за краем окна)'}`);
          break;
        }
      }
    }
    return out;
  }, ITEMS);
}

async function withinViewport(page: Page) {
  const m = await box(page, '.menu');
  const vp = page.viewportSize()!;
  expect(m, 'меню открыто').not.toBeNull();
  expect(m!.left).toBeGreaterThanOrEqual(0);
  expect(m!.top).toBeGreaterThanOrEqual(0);
  expect(m!.right).toBeLessThanOrEqual(vp.width + 0.5);
  expect(m!.bottom).toBeLessThanOrEqual(vp.height + 0.5);
}

test.describe('меню «⋮» предмета', () => {
  test('пункты не налезают, меню на экране и ничем не закрыто (с 🐞 режима разработчика)', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' }, { dev: true });
    await openSubjectMenu(page);
    expect(await overlaps(page, ITEMS)).toEqual([]);
    await withinViewport(page);
    expect(await covered(page)).toEqual([]);
    if (isPhone(page)) {
      // На телефоне 🐞 спрятан, пока открыта шторка, а нижняя панель — под затемнением.
      await expect(page.locator('.dev-fab')).toBeHidden();
    }
  });

  test('при крупном системном шрифте (200%) и длинных подсказках — без наложений', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' }, { dev: true });
    await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
    await openSubjectMenu(page);
    expect(await overlaps(page, ITEMS)).toEqual([]);
    await withinViewport(page);
    expect(await covered(page)).toEqual([]);
    // Последний пункт достижим прокруткой меню внутри себя.
    const last = page.locator(ITEMS).last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    expect(await covered(page)).toEqual([]);
  });

  test('при 150% шрифта и длинных русских словах в названии предмета', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' }, {
      patch: (d) => {
        (d.subjects as { name: string }[])[0].name = 'Высокопревосходительствующиеся-человеконенавистничество';
      }
    });
    await page.addStyleTag({ content: 'html { font-size: 24px !important; }' });
    await openSubjectMenu(page);
    expect(await overlaps(page, ITEMS)).toEqual([]);
    await withinViewport(page);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  });

  test('пункты сгруппированы: Учить, Подготовка, Управление, Экспорт; «Удалить» — последним', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await openSubjectMenu(page);
    const heads = await page.locator('.menu .menu-section').allInnerTexts();
    expect(heads.map((h) => h.trim().toLowerCase())).toEqual(['учить', 'подготовка', 'управление', 'экспорт']);
    await expect(page.locator(ITEMS).last()).toHaveText(/Удалить предмет/);
    // Результат действия виден до нажатия: сколько карточек на сегодня.
    await expect(page.locator(ITEMS).first()).toContainText(/\d+ карточ/);
  });

  test('цели нажатия не меньше 44 px (палец)', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'мышью цель может быть меньше');
    await openApp(page, { name: 'subject', id: 'geo' });
    await openSubjectMenu(page);
    const small = await page.evaluate((sel) => Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.innerText), ITEMS);
    expect(small).toEqual([]);
  });

  test('закрывается Esc, тапом мимо и кнопкой «Назад» (Android)', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await openSubjectMenu(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu')).toHaveCount(0);

    await openSubjectMenu(page);
    await page.mouse.click(5, 5);
    await expect(page.locator('.menu')).toHaveCount(0);

    await openSubjectMenu(page);
    const handled = await page.evaluate(() => (window as unknown as { __mnemaBack?: () => boolean }).__mnemaBack?.());
    expect(handled).toBe(true);
    await expect(page.locator('.menu')).toHaveCount(0);
    // «Назад» закрыл только меню, а не экран предмета.
    await expect(page.getByRole('heading', { name: 'Геометрия' })).toBeVisible();
  });
});

test.describe('шторка на телефоне', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 720, 'только телефон');

  test('снизу экрана, с затемнением и ручкой; над нижней панелью', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await openSubjectMenu(page);
    await expect(page.locator('.menu.sheet')).toBeVisible();
    await expect(page.locator('.sheet-back')).toBeVisible();
    await expect(page.locator('.menu.sheet .sheet-grip')).toBeVisible();
    const m = await box(page, '.menu.sheet');
    expect(Math.round(m!.bottom)).toBeGreaterThanOrEqual(page.viewportSize()!.height - 2);
    await expect(page.locator('.menu.sheet')).toHaveAttribute('aria-label', 'Действия с предметом');
  });

  test('свайп вниз за ручку закрывает', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' });
    await openSubjectMenu(page);
    const g = (await box(page, '.menu.sheet .sheet-grip'))!;
    const x = g.left + g.width / 2;
    const y = g.top + g.height / 2;
    await page.locator('.menu.sheet .sheet-grip').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true });
    for (let k = 1; k <= 6; k++) await page.locator('.menu.sheet .sheet-grip').dispatchEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y + k * 40, isPrimary: true });
    await page.locator('.menu.sheet .sheet-grip').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y + 240, isPrimary: true });
    await expect(page.locator('.menu')).toHaveCount(0);
  });

  test('подменю «Что учить» открывается в той же шторке, «Назад» возвращает', async ({ page }) => {
    await openApp(page, { name: 'subject', id: 'geo' }, {
      patch: (d) => {
        (d.cards as Record<string, unknown>[]).push({ id: 'l1', topicId: 'g2', type: 'basic', front: 'Ромб', back: 'Параллелограмм с равными сторонами', listId: 'terms', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' });
      }
    });
    await openSubjectMenu(page);
    const pick = page.locator(ITEMS, { hasText: 'Что учить' });
    if (!(await pick.count())) test.skip(true, 'нет выбора «Что учить» для этих данных');
    await pick.click();
    await expect(page.locator('.menu .menu-back')).toBeVisible();
    expect(await overlaps(page, ITEMS)).toEqual([]);
    await page.locator('.menu .menu-back').click();
    await expect(page.locator(ITEMS, { hasText: 'Что учить' })).toBeVisible();
  });
});

test.describe('меню «⋮» темы', () => {
  test('пункты не налезают и ничем не закрыты', async ({ page }) => {
    await openApp(page, { name: 'topic', id: 'g2' }, { dev: true });
    await page.getByRole('button', { name: 'Действия с темой' }).click();
    await expect(page.locator('.menu').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.querySelector('.menu')?.getAnimations().length ?? 0)).toBe(0);
    expect(await overlaps(page, ITEMS)).toEqual([]);
    await withinViewport(page);
    expect(await covered(page)).toEqual([]);
  });
});
