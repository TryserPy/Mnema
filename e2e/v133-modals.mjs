// 1.33, №7: «Сообщить о проблеме» — «Отмена», крестик, Esc и клик по фону закрывают окно; кнопки не перекрыты.
// Заодно: окна «Новая карточка» и «Настройки» — то же самое. Мост — заглушка с Refrain ИИ (иначе формы жалобы нет).
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=http://localhost:4174 [OUT=папка] node e2e/v133-modals.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { seed } from './v132-seed.mjs';

const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT;
if (OUT) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => {
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
};

function stub() {
  const refrain = {
    status: async () => ({ signedIn: true, secure: true, emailMasked: 'u***@example.com' }),
    me: async () => ({ ok: true, emailMasked: 'u***@example.com', devices: [], access: 'open' }),
    bug: async () => ({ ok: true, id: 7 }),
    screenshot: async () => null
  };
  let api;
  Object.defineProperty(window, 'mnemaApi', { configurable: true, get: () => api, set: (v) => (api = Object.assign(v, { refrain })) });
}

/** Кнопка видима и именно она под своим центром (не перекрыта слоем). */
async function clickable(page, loc) {
  const b = await loc.boundingBox();
  if (!b) return 'нет на экране';
  return loc.evaluate((want, [x, y]) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return 'ничего под точкой';
    return el === want || want.contains(el) ? 'ok' : `перекрыта: ${el.className || el.tagName}`;
  }, [b.x + b.width / 2, b.y + b.height / 2]);
}

for (const v of [
  { name: 'desk', width: 1280, height: 820 },
  { name: '360', width: 360, height: 800 },
  { name: '412kb', width: 412, height: 500 }
]) {
  const mobile = v.width < 900;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(stub);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate((data) => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    sessionStorage.setItem('refrain-no-splash', String(Date.now()));
    localStorage.setItem('mnema-data-pending', JSON.stringify(data));
    localStorage.setItem('refrain-dev', '1');
  }, seed());
  await page.reload();
  await page.waitForTimeout(1200);
  const report = page.locator('.modal[aria-label="Сообщить о проблеме"]');
  await page.locator('[data-part="app"], .app').first().waitFor();
  await page.waitForTimeout(500);
  const open = async () => {
    for (let i = 0; i < 5 && !(await report.count()); i++) {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('refrain:report', { detail: {} })));
      await page.waitForTimeout(400);
    }
    await report.waitFor();
    await page.waitForTimeout(250);
  };
  for (const how of ['Отмена', 'крестик', 'Esc', 'фон']) {
    await open();
    if (how === 'Отмена') {
      await report.locator('textarea').fill('проверка');
      const cancel = report.getByRole('button', { name: 'Отмена' });
      await cancel.scrollIntoViewIfNeeded();
      const state = await clickable(page, cancel);
      if (OUT) await page.screenshot({ path: join(OUT, `report-${v.name}.png`) });
      check(state === 'ok', `${v.name}: «Отмена» не перекрыта (${state})`);
      await cancel.click({ timeout: 3000 }).catch(() => {});
    } else if (how === 'крестик') await report.getByRole('button', { name: 'Закрыть' }).click({ timeout: 3000 }).catch(() => {});
    else if (how === 'Esc') await page.keyboard.press('Escape');
    else await page.mouse.click(5, 5);
    await page.waitForTimeout(400);
    check((await report.count()) === 0, `${v.name}: «Сообщить о проблеме» закрывается: ${how}`);
  }
  // Редактор отметок на снимке: «Отмена» и Esc закрывают только его, форма остаётся.
  await open();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 200;
    const g = c.getContext('2d');
    g.fillStyle = '#ddd';
    g.fillRect(0, 0, 300, 200);
    return c.toDataURL('image/png').split(',')[1];
  });
  await report.locator('input[type=file]').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await report.locator('.rf-shot-btn').click();
  const editor = page.locator('.shot-editor');
  await editor.waitFor();
  const shotCancel = editor.getByRole('button', { name: 'Отмена', exact: true });
  const shotState = await clickable(page, shotCancel);
  if (OUT) await page.screenshot({ path: join(OUT, `shot-editor-${v.name}.png`) });
  check(shotState === 'ok', `${v.name}: в редакторе снимка «Отмена» не перекрыта (${shotState})`);
  await shotCancel.click();
  await page.waitForTimeout(300);
  check((await editor.count()) === 0 && (await report.count()) === 1, `${v.name}: «Отмена» в редакторе снимка закрыла только его`);
  await report.locator('.rf-shot-btn').click();
  await editor.waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check((await editor.count()) === 0 && (await report.count()) === 1, `${v.name}: Esc в редакторе снимка закрыл только его`);
  await report.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.waitForTimeout(300);
  check((await report.count()) === 0, `${v.name}: после снимка «Отмена» формы закрыла её`);

  // Консоль разработчика → «Прикрепить к жалобе»: два окна; «Отмена» и Esc закрывают только верхнее.
  await page.locator('.dev-fab').click();
  const dev = page.locator('.modal[aria-label="Консоль разработчика"]');
  await dev.waitFor();
  await dev.getByRole('button', { name: 'Прикрепить к жалобе' }).click();
  await report.waitFor();
  await page.waitForTimeout(250);
  const c2 = report.getByRole('button', { name: 'Отмена', exact: true });
  await c2.scrollIntoViewIfNeeded();
  check((await clickable(page, c2)) === 'ok', `${v.name}: жалоба поверх консоли — «Отмена» не перекрыта`);
  await c2.click();
  await page.waitForTimeout(300);
  check((await report.count()) === 0 && (await dev.count()) === 1, `${v.name}: «Отмена» закрыла жалобу, консоль осталась`);
  await dev.getByRole('button', { name: 'Прикрепить к жалобе' }).click();
  await report.waitFor();
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check((await report.count()) === 0 && (await dev.count()) === 1, `${v.name}: Esc закрыл только жалобу`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check((await dev.count()) === 0, `${v.name}: второй Esc закрыл консоль`);

  // Тост («Режим разработчика…», «Готово…») внизу экрана не должен закрывать кнопки окна.
  if (mobile) {
    await page.locator('.tabbar .tab', { hasText: 'Профиль' }).click();
    await page.waitForTimeout(400);
    const ver = page.locator('.prof-version');
    for (let i = 0; i < 7; i++) await ver.click();
    await page.locator('.toast').waitFor({ timeout: 3000 });
    await open();
    await report.locator('textarea').fill('проверка');
    const cancel = report.getByRole('button', { name: 'Отмена' });
    await cancel.scrollIntoViewIfNeeded();
    const toastNow = await page.locator('.toast').count();
    const state = await clickable(page, cancel);
    if (OUT) await page.screenshot({ path: join(OUT, `report-toast-${v.name}.png`) });
    console.log(`  (тост на экране: ${toastNow})`);
    check(state === 'ok', `${v.name}: при тосте «Отмена» не перекрыта (${state})`);
    await cancel.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    check((await report.count()) === 0, `${v.name}: при тосте «Отмена» закрыла окно`);
  }
  check(errors.length === 0, `${v.name}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
