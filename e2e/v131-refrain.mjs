// 1.31, Refrain ИИ в окне: вход (почта → код), счётчик страниц, экран лимита → «Без интернета», закрытый тест → приглашение,
// «Сообщить о проблеме» под ошибкой ИИ. Сервер не нужен: window.mnemaApi.refrain и aiAsk — заглушки (как мост Electron/Android).
// Запуск: URL=http://localhost:4174 NODE_PATH=$(npm root -g) node e2e/v131-refrain.mjs   (веб-сборка: vite preview --mode web)
import { chromium } from 'playwright';
const URL = process.env.URL ?? 'http://localhost:4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const errors = [];
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) bad++;
};

/** Заглушка моста: подменяется в момент, когда веб-платформа ставит window.mnemaApi. */
function stub() {
  const quota = (used) => ({ day: { used, limit: 30 }, month: { used: 140, limit: 400 }, resetsAt: '2026-10-16T00:00:00.000Z', group: 'student' });
  const st = { signedIn: false, calls: [], answer: null, set: [] };
  window.__rf = st;
  const refrain = {
    status: async () => (st.signedIn ? { signedIn: true, secure: true, emailMasked: 'u***@example.com', quota: quota(12) } : { signedIn: false, secure: true }),
    loginStart: async (email) => (st.calls.push(['start', email]), { ok: true }),
    loginVerify: async (p) => (st.calls.push(['verify', p.code]), p.code === '123456' ? ((st.signedIn = true), { ok: true, emailMasked: 'u***@example.com', quota: quota(12) }) : { ok: false, code: 'code_invalid', error: 'Неверный или устаревший код. Осталось попыток: 4.', attemptsLeft: 4 }),
    me: async () => ({ ok: true, emailMasked: 'u***@example.com', quota: quota(12), devices: [{ id: 'dev_aaaaaaaaaaaaaaaa', name: 'Этот компьютер', platform: 'linux', lastSeen: '', current: true }], access: 'open' }),
    invite: async (code) => (st.calls.push(['invite', code]), { ok: true, quota: quota(0) }),
    unbind: async () => ({ ok: true }),
    deleteAccount: async () => ({ ok: true }),
    logout: async () => ((st.signedIn = false), { ok: true }),
    bug: async (r) => (st.calls.push(['bug', r]), { ok: true, id: 42 }),
    screenshot: async () => null
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
        aiSetConfig: async (p) => (st.set.push(p), { ...(await setConfig(p)), refrain: true }),
        aiAsk: async (r) => (st.calls.push(['ask', r.refrain?.task ?? null]), st.answer ?? { ok: true, text: 'ok', via: 'refrain', quota: quota(13) })
      });
    }
  });
}

async function open(theme, width) {
  const mobile = width < 700;
  const page = await browser.newPage({ viewport: { width, height: 860 }, isMobile: mobile, hasTouch: mobile, colorScheme: theme });
  page.on('pageerror', (e) => errors.push(`${theme}/${width}: ${e.message}`));
  await page.addInitScript(stub);
  await page.goto(URL);
  await page.evaluate((theme) => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [], topics: [], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true, theme, features: { ai: true } } }));
  }, theme);
  await page.reload();
  await page.waitForTimeout(600);
  return page;
}

async function openAi(page, mobile) {
  if (mobile) {
    await page.locator('.tabbar .tab', { hasText: 'Профиль' }).click();
    await page.locator('.main button', { hasText: 'Настройки' }).first().click();
  } else await page.locator('.side-foot button[aria-label="Настройки"], .side-foot button[title^="Настройки"]').first().click();
  await page.locator('.set-nav-item', { hasText: 'ИИ' }).first().click();
  await page.locator('[data-part="refrain"]').waitFor();
}

for (const [theme, width] of [
  ['light', 1280],
  ['dark', 380]
]) {
  const tag = `${theme}-${width}`;
  const mobile = width < 700;
  console.log(`— ${tag}`);
  const page = await open(theme, width);
  await openAi(page, mobile);

  // Вход
  await page.locator('[data-part="refrain"] input[type="email"]').fill('u@example.com');
  await page.getByRole('button', { name: 'Прислать код' }).click();
  await page.locator('input[aria-label="Код из письма"]').fill('000000');
  await page.getByRole('button', { name: 'Войти' }).click();
  check(await page.locator('[data-part="refrain"] [role="alert"]', { hasText: 'Осталось попыток: 4' }).isVisible(), `${tag}: неверный код — понятный текст`);
  await page.locator('input[aria-label="Код из письма"]').fill('123456');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.locator('.rf-quota').waitFor();
  check(await page.locator('.rf-quota', { hasText: 'Сегодня 12 из 30 страниц' }).isVisible(), `${tag}: вход, счётчик «12 из 30 страниц»`);
  check(await page.locator('[data-part="refrain"]', { hasText: 'u***@example.com' }).isVisible(), `${tag}: маска почты`);

  // Лимит → «Без интернета»
  await page.evaluate(() => (window.__rf.answer = { ok: false, code: 'limit_day', error: 'На сегодня бесплатные страницы Refrain ИИ закончились.', quota: { day: { used: 30, limit: 30 }, month: { used: 160, limit: 400 }, resetsAt: '', group: 'student' } }));
  await page.locator('.ai-mode', { hasText: 'Без интернета' }).click();
  await page.getByRole('button', { name: 'Проверить' }).first().click();
  await page.locator('[data-part="limit"]').waitFor({ timeout: 5000 });
  check(await page.locator('.modal', { hasText: 'На сегодня бесплатные страницы закончились' }).isVisible(), `${tag}: экран лимита`);
  check(await page.locator('[data-part="limit"] .rf-quota', { hasText: '30 из 30' }).isVisible(), `${tag}: на экране лимита — счётчик`);
  await page.locator('.rf-choices .btn', { hasText: 'Без интернета' }).click();
  await page.waitForTimeout(400);
  check((await page.evaluate(() => window.__rf.set)).some((p) => p.provider === 'local'), `${tag}: «Без интернета» выбрал ИИ на компьютере`);
  check(await page.locator('[data-part="ai-settings"]').isVisible(), `${tag}: после выбора — настройки ИИ`);

  // Закрытый тест → приглашение
  await page.evaluate(() => (window.__rf.answer = { ok: false, code: 'access_closed', error: 'Refrain ИИ сейчас в закрытом тесте.' }));
  await page.getByRole('button', { name: 'Проверить' }).first().click();
  await page.locator('.modal', { hasText: 'в закрытом тесте' }).waitFor({ timeout: 5000 });
  await page.locator('.modal input[aria-label="Код приглашения"]').fill('ABCD-1234');
  await page.locator('.modal').getByRole('button', { name: 'Ввести' }).click();
  await page.waitForTimeout(300);
  check((await page.evaluate(() => window.__rf.calls)).some((c) => c[0] === 'invite' && c[1] === 'ABCD-1234'), `${tag}: приглашение отправлено`);
  check(!(await page.locator('.modal', { hasText: 'в закрытом тесте' }).count()), `${tag}: окно закрылось`);

  // Настоящий сбой (internal) → «Сообщить о проблеме» с автозаполнением; upstream/нет сети — без плашки (1.33)
  await page.evaluate(() => (window.__rf.answer = { ok: false, code: 'internal', error: 'Сбой ИИ на сервере.' }));
  await page.getByRole('button', { name: 'Проверить' }).first().click();
  await page.locator('.rf-failed').waitFor({ timeout: 5000 });
  await page.locator('.rf-failed').getByRole('button', { name: 'Сообщить о проблеме' }).click();
  await page.locator('[data-part="report"]').waitFor();
  check(await page.locator('[data-part="report"]', { hasText: 'Сбой ИИ' }).isVisible(), `${tag}: форма заполнила ошибку сама`);
  await page.locator('[data-part="report"] textarea').fill('Не работает проверка');
  await page.locator('[data-part="report"]').getByRole('button', { name: 'Отправить' }).click();
  await page.locator('.modal', { hasText: 'Отправлено, номер #42. Спасибо!' }).waitFor();
  const bug = (await page.evaluate(() => window.__rf.calls)).find((c) => c[0] === 'bug')?.[1];
  check(Boolean(bug && bug.context?.error && /^Экран: .+\nНе работает проверка$/.test(bug.text) && !JSON.stringify(bug).includes('u@example.com')), `${tag}: отчёт ушёл с ошибкой, без почты`);
  await page.close();
}

await browser.close();
if (errors.length) {
  console.log('Ошибки страницы:\n' + errors.join('\n'));
  bad += errors.length;
}
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё хорошо');
process.exit(bad ? 1 : 0);
