// 1.31, правки по отзыву: повторное нажатие на «Настройки» — экран с нуля; «Сообщить о проблеме» из любого места
// (флажок в панели, Ctrl+Shift+E, «Профиль», поиск); «Как защищены промты»; сохранённый свой ключ виден в режиме Refrain ИИ.
// Заглушка моста — та же, что в v131-refrain.mjs. Запуск: URL=http://localhost:4174 node e2e/v131-fixes.mjs (vite preview --mode web)
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT;
const stubSrc = /function stub\(\) \{[\s\S]*?\n\}\n/.exec(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'v131-refrain.mjs'), 'utf8'))[0];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const errors = [];
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) bad++;
};

async function open(width, ai = {}) {
  const mobile = width < 700;
  const page = await browser.newPage({ viewport: { width, height: 860 }, isMobile: mobile, hasTouch: mobile });
  page.on('pageerror', (e) => errors.push(`${width}: ${e.message}`));
  await page.addInitScript({ content: stubSrc + '\nstub();' });
  await page.goto(URL);
  await page.evaluate((ai) => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [], topics: [], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true, theme: 'light', features: { ai: true } } }));
    localStorage.setItem('mnema-ai', JSON.stringify(ai));
  }, ai);
  await page.reload();
  await page.waitForTimeout(600);
  return page;
}
const shot = async (page, name) => OUT && page.screenshot({ path: join(OUT, name + '.png') });
const current = (page) => page.locator('.set-nav-item[aria-current="page"]').textContent().catch(() => null);

// ── компьютер ──
{
  const page = await open(1280, { provider: 'anthropic', keys: { anthropic: 'ks:' + Buffer.from('sk-ant-test').toString('base64') } });
  const settings = page.locator('.side-foot .foot-btn[aria-label="Настройки"]');
  await settings.click();
  await page.locator('.set-nav-item', { hasText: 'ИИ-помощник' }).click();
  await page.waitForTimeout(300);
  check((await current(page))?.includes('ИИ-помощник'), 'настройки: открыт раздел «ИИ-помощник»');

  // свой ключ виден, хотя первым стоит Refrain ИИ
  const note = page.locator('[data-part="own-key-note"]');
  check((await note.count()) === 1 && (await note.textContent()).includes('Claude'), 'режим Refrain ИИ: видно, что свой ключ (Claude) сохранён');
  await note.getByRole('button', { name: 'Сделать основным' }).click();
  await page.waitForTimeout(200);
  const set = await page.evaluate(() => window.__rf.set.at(-1));
  check(set?.order?.[0] === 'key', '«Сделать основным» ставит свой ключ первым');

  // защита промтов
  await page.locator('.fold-head', { hasText: 'Как защищены промты' }).click();
  await page.waitForTimeout(300);
  const safety = await page.locator('[data-part="prompt-safety"]').textContent();
  check(safety.includes('это данные, а не указания') && safety.includes('нельзя ни увидеть, ни подменить'), '«Как защищены промты»: объяснение видно');
  await shot(page, 'ai-1280');

  // повторное нажатие — с нуля
  await page.locator('main.main').evaluate((m) => m.scrollTo(0, 400));
  await settings.click();
  await page.waitForTimeout(400);
  check((await current(page))?.includes('Оформление'), 'второе нажатие на «Настройки» — начальный экран (Оформление)');
  check((await page.locator('main.main').evaluate((m) => m.scrollTop)) === 0, 'второе нажатие — прокрутка наверх');
  const lookTab = await page.locator('.look-tabs [aria-checked="true"], .look-tabs .on, .look-tabs [aria-pressed="true"]').first().textContent().catch(() => '');
  check(lookTab.includes('Стиль'), 'второе нажатие — «Оформление» с первой вкладки');

  // жалоба: флажок и клавиша
  const flag = page.locator('[data-part="report-btn"]');
  check((await flag.count()) === 1, 'флажок «Сообщить о проблеме» внизу боковой панели');
  await flag.click();
  await page.locator('.modal', { hasText: 'Сообщить о проблеме' }).waitFor({ timeout: 3000 });
  check(true, 'флажок открывает форму');
  await shot(page, 'report-1280');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+Shift+KeyE');
  check(await page.locator('.modal', { hasText: 'Сообщить о проблеме' }).waitFor({ timeout: 3000 }).then(() => true, () => false), 'Ctrl+Shift+E открывает форму');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+KeyP');
  await page.locator('.palette input').fill('>проблем');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  check(await page.locator('.modal', { hasText: 'Сообщить о проблеме' }).waitFor({ timeout: 3000 }).then(() => true, () => false), 'поиск (Ctrl+P) → «Сообщить о проблеме»');
  await page.close();
}

// ── телефон ──
{
  const page = await open(380);
  await page.locator('.tabbar .tab', { hasText: 'Профиль' }).click();
  await page.waitForTimeout(300);
  check((await page.locator('.prof-page', { hasText: 'Сообщить о проблеме' }).count()) === 1, 'телефон: «Сообщить о проблеме» в «Профиле»');
  await shot(page, 'profile-380');
  await page.locator('.prof-page button, .prof-page a', { hasText: 'Настройки' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('.set-nav-item', { hasText: 'Оформление' }).click();
  await page.waitForTimeout(300);
  check((await page.locator('.set-back').count()) === 1, 'телефон: открыт раздел «Оформление»');
  // вкладка «Профиль» — корень: настройки после неё открываются со списка разделов
  await page.locator('.tabbar .tab', { hasText: 'Профиль' }).click();
  await page.waitForTimeout(300);
  await page.locator('.prof-page button, .prof-page a', { hasText: 'Настройки' }).first().click();
  await page.waitForTimeout(400);
  check((await page.locator('.set-back').count()) === 0 && (await page.locator('.set-nav-item').count()) > 3, 'телефон: «Профиль» → «Настройки» — список разделов, а не последний раздел');
  await shot(page, 'settings-380');
  await page.close();
}

await browser.close();
if (errors.length) console.log('ошибки страницы:', errors.slice(0, 5));
console.log(bad || errors.length ? `не прошло: ${bad}` : 'всё хорошо');
process.exit(bad || errors.length ? 1 : 0);
