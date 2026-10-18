// 1.33, №9: запуск не падает, если мост приложения заморожен (как contextBridge в Electron) и включён режим разработчика.
// Холодный старт с пустым хранилищем, со старыми данными и повторный запуск после установки service worker.
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=http://localhost:4174 node e2e/v133-startup.mjs
import { chromium } from 'playwright';
import { seed } from './v132-seed.mjs';

const URL = process.env.URL ?? 'http://localhost:4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => {
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
};

async function run(label, { data, dev }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  // Мост только для чтения — как на Windows и Linux.
  await ctx.addInitScript(() => {
    let api;
    Object.defineProperty(window, 'mnemaApi', { configurable: true, get: () => api, set: (v) => (api = Object.freeze(v)) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(
    ({ data, dev }) => {
      sessionStorage.setItem('mnema-web-test-ok', '1');
      sessionStorage.setItem('refrain-no-splash', String(Date.now()));
      if (data) localStorage.setItem('mnema-data-pending', JSON.stringify(data));
      if (dev) localStorage.setItem('refrain-dev', '1');
    },
    { data, dev }
  );
  for (const round of ['запуск', 'повторный запуск (service worker)']) {
    await page.reload();
    await page.waitForTimeout(1500);
    const crash = await page.locator('.crash').count();
    const frozen = await page.evaluate(() => Object.isFrozen(window.mnemaApi));
    check(frozen && crash === 0 && !errors.some((e) => /read only/.test(e)), `${label}: ${round} без экрана сбоя${errors.length ? ' — ' + errors.join('; ') : ''}`);
  }
  await ctx.close();
}

await run('пустое хранилище, режим разработчика', { data: null, dev: true });
await run('старые данные (1.32), режим разработчика', { data: seed(), dev: true });
await run('старые данные, обычный режим', { data: seed(), dev: false });
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
