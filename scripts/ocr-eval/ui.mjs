// Интерфейс «Из учебника» в веб-версии: снимки на ПК и телефоне (390 px), проверка, что ничего не вылезает.
// Запуск: npm run build:web && npx vite preview --mode web --outDir dist-web --port 4180 &
//         PHOTO=/путь/к/фото.jpg OUT=/куда/снимки node scripts/ocr-eval/ui.mjs
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4180';
const OUT = process.env.OUT ?? 'out-ui';
const PHOTO = process.env.PHOTO ?? 'test-fixtures/textbook/pages/physics_mild.jpg';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const seed = () => {
  const at = new Date(Date.now() - 5 * 864e5).toISOString();
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Физика', color: '#3F51D8', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Теплопроводность', note: '', createdAt: at, updatedAt: at }], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true } }));
};
const devices = [
  ['pc', { viewport: { width: 1280, height: 900 } }],
  ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]
];
let bad = 0;
for (const [name, opts] of devices) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(seed);
  await page.reload();
  await page.waitForSelector('#root > *');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}-00-start.png` });
  if (name === 'phone') await page.getByText('Знания', { exact: true }).last().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-005-know.png` });
  if (name === 'phone') await page.getByText('1 тема').first().click();
  else await page.getByText('Физика').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-01-subject.png` });
  await page.getByText('нет карточек').filter({ visible: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-0-topic.png` });
  await page.locator('button', { hasText: 'Из учебника' }).first().click({ timeout: 8000, force: true });
  await page.waitForSelector('.modal');
  await page.screenshot({ path: `${OUT}/${name}-1-empty.png` });
  await page.locator('.modal input[type=file]').setInputFiles(PHOTO);
  await page.locator('.tb-page img').waitFor();
  await page.screenshot({ path: `${OUT}/${name}-2-pages.png` });
  await page.getByRole('radio', { name: 'Без интернета' }).click().catch(() => {});
  await page.getByRole('button', { name: /^Распознать/ }).click();
  await page.locator('.tb-reading').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}-3-reading.png` });
  await page.locator('.tb-review').waitFor({ timeout: 120000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-4-review.png` });
  // Ничего не вылезает за экран.
  const over = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('.modal *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > w + 1) bad.push(el.className + ':' + Math.round(r.right));
    }
    return { sw: document.documentElement.scrollWidth, w, bad: bad.slice(0, 5) };
  });
  console.log(name, 'overflow', JSON.stringify(over));
  if (over.sw > over.w + 1 || over.bad.length) bad++;
  const md = await page.locator('.tb-preview').innerText();
  console.log(name, 'preview:', md.slice(0, 200).replace(/\n+/g, ' | '));
  await page.getByRole('button', { name: 'Править текст' }).click();
  const text = await page.locator('.tb-edit').inputValue();
  fs.writeFileSync(`${OUT}/${name}-result.md`, text.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, 'DATA'));
  await page.getByRole('button', { name: 'Как было' }).click();
  await page.getByRole('button', { name: 'Добавить в конспект' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}-5-note.png` });
  console.log(name, 'errors', JSON.stringify(errors));
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
