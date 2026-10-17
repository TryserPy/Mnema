// 1.32, N2: «Карточки из ссылки, видео или книги» на телефоне и ПК. ИИ подменён в странице (aiAsk отвечает JSON карточек).
// Ссылка в веб-версии: понятная подсказка (чужие сайты из браузера не открыть). Текст и книга EPUB — до добавления карточек.
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=… OUT=… node e2e/v132-source.mjs
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { strToU8, zipSync } from 'fflate';
import { seed } from './v132-seed.mjs';

const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT;
if (OUT) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || bad++);

const long = (s) => `<p>${s} ${'Клетка состоит из ядра, цитоплазмы и мембраны. '.repeat(10)}</p>`;
const epubPath = '/tmp/refrain-e2e-book.epub';
writeFileSync(
  epubPath,
  zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="c.opf"/></rootfiles></container>'),
    'c.opf': strToU8('<package><metadata><dc:title>Биология</dc:title></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>'),
    'a.xhtml': strToU8(`<html><body><h1>Клетка</h1>${long('Раз.')}</body></html>`),
    'b.xhtml': strToU8(`<html><body><h1>Ткани</h1>${long('Два.')}</body></html>`)
  })
);

for (const v of [
  { name: '360', width: 360, height: 800 },
  { name: '390', width: 390, height: 844 },
  { name: 'land', width: 800, height: 360 },
  { name: 'desk', width: 1280, height: 820 }
]) {
  const mobile = v.width < 900;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate((data) => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    sessionStorage.setItem('refrain-no-splash', String(Date.now()));
    localStorage.setItem('mnema-data-pending', JSON.stringify(data));
    localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'settings', section: 'data' }, at: Date.now() } }));
  }, seed());
  await page.reload();
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.__asked = [];
    window.mnemaApi.aiAsk = async (r) => {
      window.__asked.push(r);
      await new Promise((ok) => setTimeout(ok, 300));
      return { ok: true, text: JSON.stringify({ cards: [{ q: 'Из чего состоит клетка?', a: 'Ядро, цитоплазма, мембрана', why: '' }, { q: 'Что такое ткань?', a: 'Группа сходных клеток', why: '' }] }) };
    };
  });
  const noHScroll = () => page.evaluate(() => [...document.querySelectorAll('.modal')].every((m) => m.scrollWidth <= m.clientWidth + 1) && document.documentElement.scrollWidth <= innerWidth + 1);
  const open = async () => page.locator('.srow', { hasText: 'Карточки из ссылки, видео или книги' }).getByRole('button').click();

  // Ссылка в браузере — подсказка, что делать
  await open();
  await page.getByLabel('Ссылка на статью или видео').fill('https://ru.wikipedia.org/wiki/Клетка');
  await page.getByRole('button', { name: 'Открыть', exact: true }).last().click();
  const alert = await page.getByRole('alert').textContent();
  check(/вставь его во вкладку «Текст»/.test(alert ?? ''), `${v.name}: ссылка в браузере — подсказка «Текст» (${(alert ?? '').slice(0, 60)}…)`);
  check(await noHScroll(), `${v.name}: окно без прокрутки вбок`);

  // Книга EPUB
  await page.getByRole('radio', { name: 'Книга EPUB' }).click();
  await page.locator('.modal input[type=file]').setInputFiles(epubPath);
  await page.locator('.modal select').waitFor();
  const chapters = await page.locator('.modal select option').allTextContents();
  check(chapters.length === 2 && /Клетка/.test(chapters[0]), `${v.name}: EPUB — главы ${chapters.map((c) => c.split(' ·')[0]).join(', ')}`);
  await page.locator('.modal select').selectOption('1');
  await page.getByRole('button', { name: 'Дальше' }).click();
  check(/Биология — Ткани/.test(await page.locator('.modal').innerText()), `${v.name}: выбрана глава «Ткани»`);
  if (OUT && v.name === '390') await page.screenshot({ path: join(OUT, `source-book-${v.name}.png`) });
  await page.getByRole('button', { name: /Сделать карточки/ }).click();
  await page.locator('.bulk-row').first().waitFor();
  const asked = await page.evaluate(() => window.__asked.at(-1));
  check(asked.refrain?.task === 'cards.source' && /Два\./.test(asked.refrain.text), `${v.name}: ИИ получил главу и задачу cards.source`);
  check((await page.locator('.bulk-row').count()) === 2, `${v.name}: 2 черновика`);
  if (OUT && v.name === '390') await page.screenshot({ path: join(OUT, `source-drafts-${v.name}.png`) });
  check(await noHScroll(), `${v.name}: черновики без прокрутки вбок`);
  await page.getByRole('button', { name: /^Добавить 2 карточки/ }).click();
  await page.waitForTimeout(700);
  const main = await page.locator('main').innerText();
  check((await page.locator('main').innerHTML()).includes('Биология — Ткани') && /Источник/.test(main), `${v.name}: новая тема с источником открыта`);
  check(!errors.length, `${v.name}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
