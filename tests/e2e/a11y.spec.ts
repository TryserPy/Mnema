// Доступность (axe-core): на ключевых экранах нет критических и серьёзных нарушений; меню и шторки читаются TalkBack/VoiceOver.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openApp, type Where } from './helpers';

const SCREENS: [string, Where][] = [
  ['Учусь', { name: 'today' }],
  ['Знания', { name: 'knowledge' }],
  ['Предмет', { name: 'subject', id: 'geo' }],
  ['Тема — конспект', { name: 'topic', id: 'g2', tab: 'note' }],
  ['Тема — карточки', { name: 'topic', id: 'g2', tab: 'cards' }],
  ['Профиль', { name: 'profile' }],
  ['Помощь', { name: 'help', section: 'use' } as Where],
  ['Настройки — оформление', { name: 'settings', section: 'look' } as Where]
];

async function serious(page: Page, include?: string) {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) b = b.include(include);
  const r = await b.analyze();
  return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const [name, where] of SCREENS) {
  test(`axe: ${name}`, async ({ page }) => {
    await openApp(page, where);
    await page.waitForLoadState('networkidle');
    expect(await serious(page)).toEqual([]);
  });
}

test('axe: тёмная тема, экран предмета', async ({ page }) => {
  await openApp(page, { name: 'subject', id: 'geo' }, { theme: 'dark' });
  expect(await serious(page)).toEqual([]);
});

test('axe: открытое меню «⋮»', async ({ page }) => {
  await openApp(page, { name: 'subject', id: 'geo' });
  await page.getByRole('button', { name: 'Действия с предметом' }).click();
  await expect(page.getByRole('menu', { name: 'Действия с предметом' })).toBeVisible();
  expect(await serious(page, '.menu')).toEqual([]);
});

test('меню: фокус внутри, Esc возвращает фокус на кнопку', async ({ page }) => {
  await openApp(page, { name: 'subject', id: 'geo' });
  const btn = page.getByRole('button', { name: 'Действия с предметом' });
  await btn.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Действия с предметом' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(btn).toBeFocused();
});

test('кнопки-значки подписаны словами', async ({ page }) => {
  await openApp(page, { name: 'subject', id: 'geo' });
  const bare = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .filter((b) => b.getClientRects().length && !b.textContent?.replace(/[\s​]/g, '') && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby') && !b.title)
      .map((b) => b.outerHTML.slice(0, 120))
  );
  expect(bare).toEqual([]);
});

test('анимации выключаются при «Уменьшить движение»', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page, { name: 'subject', id: 'geo' });
  await page.getByRole('button', { name: 'Действия с предметом' }).click();
  const long = await page.evaluate(() => document.getAnimations().filter((a) => {
    const t = a.effect?.getTiming();
    return typeof t?.duration === 'number' && t.duration > 50;
  }).length);
  expect(long).toBe(0);
});
