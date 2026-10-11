// Режим ИИ в интерфейсе: кривые ответы → откат на офлайн с пояснением; хороший ответ с HTML → безопасный Markdown.
// А ещё замер: самая долгая «задача» главного потока во время распознавания (чем меньше, тем плавнее окно).
// Запуск: npm run build:web && npx vite preview --mode web --outDir dist-web --port 4180 &  node scripts/ocr-eval/ui-ai.mjs
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4180';
const OUT = process.env.OUT ?? 'out-ui';
const PHOTO = process.env.PHOTO ?? 'test-fixtures/textbook/pages/physics_mild.jpg';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const seed = () => {
  const at = new Date(Date.now() - 5 * 864e5).toISOString();
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Физика', color: '#3F51D8', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Теплопроводность', note: '', createdAt: at, updatedAt: at }], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true, features: { ai: true } } }));
};
const cases = [
  ['json', { ok: true, text: '{"text": "страница", "blocks": [1, 2]}' }, /данные вместо текста/],
  ['refusal', { ok: true, text: 'К сожалению, я не могу прочитать это изображение.' }, /не по делу/],
  ['loop', { ok: true, text: Array.from({ length: 12 }, () => 'Реформа 1861 года освободила крестьян.').join('\n') }, /зациклился/],
  ['network', { ok: false, error: 'fetch failed' }, /Нет связи/],
  ['html', { ok: true, text: '# § 12. Теплопроводность\n\nТепло <script>alert(1)</script> передаётся <img src=x onerror=alert(2)> от тела к телу, это называют **теплопроводностью** и это известно давно. [ссылка](javascript:alert(3))\n\nЗапомните: теплота идёт от горячего к холодному.', }, null]
];
let bad = 0;
for (const [name, reply, expectNote] of cases) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => (errors.push('dialog: ' + d.message()), d.dismiss()));
  await page.goto(URL);
  await page.evaluate(seed);
  await page.reload();
  await page.waitForSelector('#root > *');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Понятно' }).click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate((r) => {
    window.mnemaApi.aiAsk = async () => r;
    window.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] });
  }, reply);
  await page.getByText('Физика').first().click();
  await page.waitForTimeout(500);
  await page.getByText('нет карточек').first().click();
  await page.waitForTimeout(500);
  await page.locator('button', { hasText: 'Из учебника' }).first().click();
  await page.locator('.modal input[type=file]').setInputFiles(PHOTO);
  await page.locator('.tb-page img').waitFor();
  await page.getByRole('radio', { name: 'Точно (ИИ)' }).click();
  await page.getByRole('button', { name: /^Распознать/ }).click();
  await page.locator('.tb-review').waitFor({ timeout: 120000 });
  const warn = (await page.locator('.hint.warn').allInnerTexts()).join(' | ');
  const preview = await page.locator('.tb-preview').innerHTML();
  const long = await page.evaluate(() => window.__long);
  await page.screenshot({ path: `${OUT}/ai-${name}.png` });
  const okNote = expectNote ? expectNote.test(warn) && /прочитана без интернета/.test(warn) : true;
  const safe = !/<script|onerror|javascript:/i.test(preview);
  const text = await page.locator('.tb-preview').innerText();
  const okText = expectNote ? /Теплопроводность/.test(text) : /теплопроводностью/.test(text);
  console.log(name, 'откат/пояснение:', okNote, '| безопасно:', safe, '| текст:', okText, '| долгие задачи, мс:', JSON.stringify(long), '| ошибки страницы:', JSON.stringify(errors));
  if (!okNote || !safe || !okText || errors.length) bad++;
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
