// Веб-версия (PWA): запуск, сохранение в IndexedDB, перенос старых данных из localStorage, работа без сети, одна вкладка, телефон и планшет.
// Запуск: npm run build:web && npm run preview:web -- --port 4180 &
//         URL=http://localhost:4180 OUT=out node e2e/web.mjs   (пакет playwright должен находиться: например, симлинк на глобальный в node_modules)
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4180';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) bad++;
};
const errors = [];

const seed = () => {
  const at = new Date(Date.now() - 5 * 864e5).toISOString();
  const cards = Array.from({ length: 6 }, (_, i) => ({ id: 'c' + i, topicId: 't1', type: 'basic', front: 'Вопрос ' + i, back: 'Ответ ' + i, createdAt: at, updatedAt: at }));
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note: 'Клетка — единица жизни.', createdAt: at, updatedAt: at }], cards, states: {}, logs: [], tests: [], settings: { onboarded: true } }));
};
const idbData = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open('mnema-web', 1);
        r.onsuccess = () => {
          const g = r.result.transaction('kv').objectStore('kv').get('data');
          g.onsuccess = () => resolve(g.result ?? null);
        };
      })
  );

const devices = [
  ['ПК', { viewport: { width: 1280, height: 800 } }],
  ['планшет', { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['телефон', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]
];

for (const [name, opts] of devices) {
  const ctx = await browser.newContext({ ...opts, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
  await page.goto(URL);
  await page.evaluate(seed); // как будто до веб-версии Мнема уже писала в localStorage
  await page.reload();
  await page.waitForSelector('#root > *', { timeout: 15000 });
  await page.waitForTimeout(800);

  check((await page.evaluate(() => window.mnemaApi?.platform)) === 'web', `${name}: платформа web`);
  check((await page.locator('body').innerText()).includes('Биология') || (await page.locator('body').innerText()).includes('Сегодня'), `${name}: интерфейс отрисован`);
  const stored = await idbData(page);
  check(typeof stored === 'string' && JSON.parse(stored).cards.length === 6, `${name}: данные из localStorage перенесены в IndexedDB`);
  check((await page.evaluate(() => localStorage.getItem('mnema-data'))) === null, `${name}: старая копия в localStorage убрана`);

  // Изменение сохраняется и переживает перезагрузку.
  await page.evaluate(() => {
    const d = JSON.parse(window.mnemaApi.load());
    d.subjects.push({ id: 's2', name: 'Тестовый предмет веба', color: '#B33', createdAt: new Date().toISOString() });
    return window.mnemaApi.save(JSON.stringify(d));
  });
  await page.reload();
  await page.waitForSelector('#root > *');
  check(JSON.parse(await page.evaluate(() => window.mnemaApi.load())).subjects.some((s) => s.name === 'Тестовый предмет веба'), `${name}: запись пережила перезагрузку`);

  // Автокопия за сегодня.
  const backups = await page.evaluate(() => window.mnemaApi.backupList());
  check(backups.length === 1 && /^mnema-\d{4}-\d{2}-\d{2}\.json$/.test(backups[0].name), `${name}: автокопия за день создана (${backups[0]?.name})`);

  // Service worker и работа без интернета.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // чтобы страница была под управлением воркера
  await page.waitForTimeout(500);
  check(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), `${name}: service worker управляет страницей`);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#root > *', { timeout: 15000 });
  check((await page.locator('#root').innerText()).length > 20, `${name}: без интернета приложение открывается`);
  await ctx.setOffline(false);

  // Вторая вкладка не должна затирать данные первой.
  const second = await ctx.newPage();
  await second.goto(URL);
  await second.waitForTimeout(800);
  check((await second.locator('body').innerText()).includes('уже открыта в другой вкладке'), `${name}: вторая вкладка предупреждает`);
  check((await second.locator('#root > *').count()) === 0, `${name}: вторая вкладка не запускает приложение`);
  await second.close();

  await page.screenshot({ path: `${OUT}/web-${name}.png` });
  await ctx.close();
}

// Манифест и значки.
const ctx = await browser.newContext();
const page = await ctx.newPage();
const man = await (await page.request.get(URL + '/manifest.webmanifest')).json();
check(man.display === 'standalone' && man.icons.length === 3, 'манифест: standalone и три значка');
for (const i of man.icons) check((await page.request.get(`${URL}/${i.src}`)).ok(), `значок ${i.src} отдаётся`);
check((await page.request.get(URL + '/ocr/rus.traineddata.gz')).ok(), 'OCR-словарь отдаётся');
await ctx.close();

await browser.close();
if (errors.length) console.log('\nОшибки страницы:\n' + [...new Set(errors)].join('\n'));
console.log(bad ? `\n✗ Не прошло: ${bad}` : '\nВсё прошло ✓');
process.exit(bad ? 1 : 0);
