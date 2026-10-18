// 1.33, №3 и №4: плашка под ошибкой ИИ только при настоящем сбое; у «Объясни иначе» — кто отвечает, «Отменить», «Повторить»,
// «Настройки ИИ» по причине ошибки. Мост — заглушка (как в Electron/Android: есть Refrain ИИ), сервер не нужен.
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=http://localhost:4174 [OUT=папка] node e2e/v133-ai.mjs
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
  const st = { answers: [], asked: 0, wait: 0 };
  window.__ai = st;
  const refrain = {
    status: async () => ({ signedIn: true, secure: true, emailMasked: 'u***@example.com' }),
    me: async () => ({ ok: true, emailMasked: 'u***@example.com', devices: [], access: 'open' }),
    bug: async () => ({ ok: true, id: 1 }),
    screenshot: async () => null
  };
  let api;
  Object.defineProperty(window, 'mnemaApi', {
    configurable: true,
    get: () => api,
    set(v) {
      const getConfig = v.aiGetConfig;
      api = Object.assign(v, {
        refrain,
        aiGetConfig: async () => ({ ...(await getConfig()), refrain: true, order: ['refrain', 'key', 'local'] }),
        aiAsk: async () => {
          st.asked++;
          if (st.wait) await new Promise((ok) => setTimeout(ok, st.wait));
          return st.answers.shift() ?? { ok: true, text: 'Проще говоря: это так.', via: 'refrain' };
        }
      });
    }
  });
}

for (const v of [
  { name: 'desk', width: 1280, height: 820 },
  { name: '360', width: 360, height: 800 }
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
  }, seed());
  await page.reload();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /^Учиться/ }).first().click();
  await page.locator('.review-card').waitFor();
  const reveal = async () => {
    await page.getByRole('button', { name: /Показать ответ/ }).first().click();
    await page.locator('.answer').waitFor();
  };
  await reveal();
  const tag = v.name;

  // 1. Нет сети — без плашки «Сообщить», в самой карточке «Повторить»; повтор — объяснение.
  await page.evaluate(() => window.__ai.answers.push({ ok: false, code: 'network', error: 'Нет связи с Refrain ИИ.' }));
  await page.getByRole('button', { name: /Объясни иначе/ }).click();
  await page.locator('[data-part="ai-problem"]').waitFor();
  check((await page.locator('.rf-failed').count()) === 0, `${tag}: нет сети — плашки нет`);
  check(await page.locator('[data-part="ai-problem"] button', { hasText: 'Повторить' }).isVisible(), `${tag}: нет сети — есть «Повторить»`);
  await page.locator('[data-part="ai-problem"] button', { hasText: 'Повторить' }).click();
  await page.locator('.ai-box', { hasText: 'Проще говоря' }).waitFor();
  check(true, `${tag}: «Повторить» дал объяснение`);

  // 2. «Отменить» во время ожидания: экран возвращается, поздний ответ не применяется.
  await page.getByRole('button', { name: /Хорошо/ }).first().click();
  await page.waitForTimeout(300);
  await reveal();
  await page.evaluate(() => {
    window.__ai.wait = 1500;
    window.__ai.answers.push({ ok: true, text: 'ПОЗДНИЙ ОТВЕТ', via: 'refrain' });
  });
  await page.getByRole('button', { name: /Объясни иначе/ }).click();
  await page.locator('[data-part="ai-working"]').waitFor();
  check(await page.locator('[data-part="ai-via"]', { hasText: 'Refrain ИИ' }).isVisible(), `${tag}: видно, кто отвечает (Refrain ИИ)`);
  if (OUT) await page.screenshot({ path: join(OUT, `ai-working-${tag}.png`) });
  await page.locator('[data-part="ai-working"] button', { hasText: 'Отменить' }).click();
  await page.waitForTimeout(1800);
  check((await page.locator('text=ПОЗДНИЙ ОТВЕТ').count()) === 0 && (await page.getByRole('button', { name: /Объясни иначе/ }).isVisible()), `${tag}: «Отменить» — поздний ответ не показан, кнопка снова есть`);
  await page.evaluate(() => (window.__ai.wait = 0));

  // 3. LM Studio не запущен — «Настройки ИИ» в карточке и одна плашка; повтор той же ошибки плашку не плодит.
  await page.evaluate(() => window.__ai.answers.push({ ok: false, error: 'Не удаётся подключиться. Если это программа на компьютере (LM Studio, Ollama) — запусти в ней сервер.' }));
  await page.getByRole('button', { name: /Объясни иначе/ }).click();
  await page.locator('[data-part="ai-problem"]').waitFor();
  check(await page.locator('[data-part="ai-problem"] button', { hasText: 'Настройки ИИ' }).isVisible(), `${tag}: LM Studio — «Настройки ИИ» у ошибки`);
  check((await page.locator('text=Сообщить о проблеме').count()) === 0, `${tag}: LM Studio — без «Сообщить о проблеме»`);
  await page.waitForTimeout(200);
  check((await page.locator('.rf-failed').count()) === 0, `${tag}: ошибка видна в карточке — плашка сверху её не дублирует`);

  // 4. Настоящий сбой сервера — «Сообщить о проблеме» прямо у ошибки, форма с подставленной ошибкой.
  await page.evaluate(() => window.__ai.answers.push({ ok: false, code: 'internal', error: 'Сбой на сервере. Попробуй позже.' }));
  await page.locator('[data-part="ai-problem"] button', { hasText: 'Повторить' }).click();
  await page.locator('[data-part="ai-problem"][data-kind="bug"]').waitFor();
  await page.waitForTimeout(200);
  check((await page.locator('.rf-failed').count()) === 0, `${tag}: сбой — без плашки поверх карточки`);
  if (OUT) await page.screenshot({ path: join(OUT, `ai-report-${tag}.png`) });
  await page.locator('[data-part="ai-problem"] button', { hasText: 'Сообщить о проблеме' }).click();
  await page.locator('[data-part="report"]', { hasText: 'Сбой на сервере' }).waitFor({ timeout: 5000 });
  check(true, `${tag}: сбой — «Сообщить о проблеме» открыла форму с ошибкой`);
  await page.locator('.modal [aria-label="Закрыть"]').first().click();
  await page.waitForTimeout(300);

  // 5. «Настройки ИИ» из ошибки ведут в настройки.
  await page.evaluate(() => window.__ai.answers.push({ ok: false, error: '401: invalid x-api-key' }));
  await page.locator('[data-part="ai-problem"] button', { hasText: 'Повторить' }).click();
  await page.locator('[data-part="ai-problem"][data-kind="key"]').waitFor();
  await page.locator('[data-part="ai-problem"] button', { hasText: 'Настройки ИИ' }).click();
  await page.locator('[data-part="ai-settings"]').waitFor({ timeout: 5000 });
  check(true, `${tag}: «Настройки ИИ» открыли настройки`);

  check(errors.length === 0, `${tag}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
