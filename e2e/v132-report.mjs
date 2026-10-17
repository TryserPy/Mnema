// 1.32: «Сообщить о проблеме» на телефоне (снимок не перехватывает прокрутку, редактор отметок, техданные сами)
// и вход в Refrain ИИ с лимитом устройств (после «Отвязать и войти» вход завершается сам, код из 6 цифр уходит сам).
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=http://localhost:4174 OUT=папка node e2e/v132-report.mjs
import { chromium } from 'playwright';
import { join } from 'path';

const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const errors = [];
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) bad++;
};
const shot = async (page, name) => OUT && page.screenshot({ path: join(OUT, name + '.png') });

function stub() {
  const quota = (used) => ({ day: { used, limit: 30 }, month: { used: 140, limit: 400 }, resetsAt: '2026-10-16T00:00:00.000Z', group: 'student' });
  const st = { signedIn: false, calls: [], limitOnce: true };
  window.__rf = st;
  const devices = [
    { id: 'dev_aaaaaaaaaaaaaaaa', name: 'Android · Pixel 7', platform: 'android', lastSeen: new Date(Date.now() - 86400000).toISOString() },
    { id: 'dev_bbbbbbbbbbbbbbbb', name: 'DESKTOP-SCHOOL', platform: 'windows', lastSeen: new Date(Date.now() - 9 * 86400000).toISOString() }
  ];
  // Снимок окна: картинка 600×1200 (длинная, чтобы форму было что листать).
  const c = document.createElement('canvas');
  const fakeShot = () => {
    c.width = 600;
    c.height = 1200;
    const x = c.getContext('2d');
    x.fillStyle = '#f4f4f7';
    x.fillRect(0, 0, 600, 1200);
    x.fillStyle = '#3366cc';
    for (let i = 0; i < 12; i++) x.fillRect(30, 40 + i * 95, 540, 60);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  };
  const refrain = {
    status: async () => (st.signedIn ? { signedIn: true, secure: true, emailMasked: 'u***@example.com', quota: quota(1) } : { signedIn: false, secure: true }),
    loginStart: async (email) => (st.calls.push(['start', email]), { ok: true }),
    loginVerify: async (p) => {
      st.calls.push(['verify', p.code, p.replaceDevice ?? null]);
      if (p.code !== '123456') return { ok: false, code: 'code_invalid', error: 'Неверный или устаревший код.', attemptsLeft: 4 };
      if (!p.replaceDevice) return { ok: false, code: 'device_limit', error: 'Слишком много устройств', devices };
      st.signedIn = true;
      return { ok: true, emailMasked: 'u***@example.com', quota: quota(0) };
    },
    me: async () => ({ ok: true, emailMasked: 'u***@example.com', quota: quota(1), devices: [{ ...devices[0], current: true }], access: 'open' }),
    invite: async () => ({ ok: true }),
    unbind: async () => ({ ok: true }),
    deleteAccount: async () => ({ ok: true }),
    logout: async () => ((st.signedIn = false), { ok: true }),
    bug: async (r) => (st.calls.push(['bug', r]), { ok: true, id: 42 }),
    screenshot: async () => fakeShot()
  };
  let api;
  Object.defineProperty(window, 'mnemaApi', {
    configurable: true,
    get: () => api,
    set(v) {
      const getConfig = v.aiGetConfig;
      const setConfig = v.aiSetConfig;
      api = Object.assign(v, {
        refrain,
        aiGetConfig: async () => ({ ...(await getConfig()), refrain: true, order: ['refrain', 'key', 'local'] }),
        aiSetConfig: async (p) => ({ ...(await setConfig(p)), refrain: true })
      });
    }
  });
}

async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(stub);
  await page.goto(URL);
  await page.evaluate(() => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    sessionStorage.setItem('refrain-no-splash', String(Date.now()));
    localStorage.setItem('mnema-data-pending', JSON.stringify({ version: 1, subjects: [], topics: [], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true, theme: 'light', features: { ai: true } } }));
    localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'profile' }, at: Date.now() } }));
  });
  await page.reload();
  await page.waitForTimeout(800);
  return { page, ctx };
}

// ── Жалоба ──
{
  const { page, ctx } = await open(390, 844);
  await page.locator('.create-item', { hasText: 'Сообщить о проблеме' }).click();
  await page.locator('[data-part="report"]').waitFor();
  await page.locator('[data-part="report"] .switch, [data-part="report"] [role="switch"]').last().click();
  await page.waitForTimeout(300);
  const img = page.locator('.rf-shot-btn img');
  check((await img.count()) === 1, 'снимок в форме — картинка-кнопка');
  const ta = await img.evaluate((el) => getComputedStyle(el).touchAction);
  check(ta !== 'none', `снимок не перехватывает прокрутку (touch-action: ${ta})`);
  const before = await img.getAttribute('src');
  await shot(page, 'report-form-390');
  await page.locator('.rf-shot-btn').click();
  await page.locator('.shot-editor').waitFor();
  check((await page.locator('.shot-tool').count()) >= 4, 'редактор: рамка, стрелка, маркер, скрыть');
  const box = await page.locator('.shot-canvas').boundingBox();
  await page.mouse.move(box.x + 40, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 160, { steps: 6 });
  await page.mouse.up();
  await page.locator('.shot-tool', { hasText: 'Скрыть' }).click();
  await page.mouse.move(box.x + 30, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 330, { steps: 6 });
  await page.mouse.up();
  await shot(page, 'report-editor-390');
  await page.locator('.shot-bar .btn.primary').click();
  await page.waitForTimeout(300);
  check((await page.locator('.shot-editor').count()) === 0, 'редактор закрылся по «Готово»');
  check((await img.getAttribute('src')) !== before, 'в форме снимок с отметками');
  check(/Отметок: 2/.test(await page.locator('.rf-marker').textContent()), 'отметок: 2');
  await page.locator('[data-part="report"] textarea').fill('Кнопка не нажимается');
  await page.locator('[data-part="report"] button[type="submit"]').click();
  await page.waitForTimeout(400);
  const call = await page.evaluate(() => window.__rf.calls.find((c) => c[0] === 'bug')?.[1]);
  check(Boolean(call?.screenshot), 'снимок ушёл с отчётом');
  check(/Refrain \d+\.\d+\.\d+ · .*экран 390×844/.test(call?.text ?? ''), 'техданные приложились сами: версия, устройство, экран');
  check((await page.locator('.rf-sent').count()) === 1, 'подтверждение «Отправлено»');
  await shot(page, 'report-sent-390');
  await ctx.close();
}

// ── Вход с лимитом устройств ──
{
  const { page, ctx } = await open(360, 800);
  await page.locator('.main button', { hasText: 'Настройки' }).first().click();
  await page.locator('.set-nav-item', { hasText: 'ИИ' }).first().click();
  await page.locator('[data-part="refrain"]').waitFor();
  await page.locator('[data-part="refrain"] input[type="email"]').fill('pupil@example.com');
  await page.locator('[data-part="refrain"] button[type="submit"]').click();
  await page.locator('[data-part="refrain"] input[autocomplete="one-time-code"]').fill('123456');
  await page.waitForTimeout(500);
  const rows = await page.locator('[data-part="refrain"] .rf-device').allTextContents();
  check(rows.length === 2 && /Pixel 7/.test(rows[0]) && /последняя активность: вчера/.test(rows[0]), `код ушёл сам; лимит устройств — понятные имена и активность (${rows[0] ?? ''})`);
  await shot(page, 'login-devices-360');
  await page.locator('[data-part="refrain"] .rf-device button').nth(1).click();
  await page.waitForTimeout(600);
  const calls = await page.evaluate(() => window.__rf.calls.filter((c) => c[0] === 'verify'));
  check(calls.length === 2 && calls[1][2] === 'dev_bbbbbbbbbbbbbbbb', 'повтор входа с replaceDevice без нового кода');
  check(/Вход: u\*\*\*@example\.com/.test(await page.locator('[data-part="refrain"]').textContent()), 'вход завершился сам');
  check(/Старое устройство отвязано/.test(await page.locator('[data-part="refrain"]').textContent()), 'сообщение «Старое устройство отвязано»');
  await shot(page, 'login-done-360');
  await ctx.close();
}

await browser.close();
for (const e of errors) console.log('ошибка страницы: ' + e);
console.log(bad || errors.length ? `\n✗ ${bad + errors.length}` : '\n✓ всё в порядке');
process.exit(bad || errors.length ? 1 : 0);
