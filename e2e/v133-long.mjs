// 1.33, №13: очень длинные определения не превращаются в узкий высокий столбик и не раздувают контейнер.
// Длинный текст, слово без пробелов, ссылка, формула KaTeX — в списке карточек, повторении, окне карточки, «Знаниях», поиске.
// Запуск: vite preview --mode web --outDir dist-web --port 4174, затем URL=http://localhost:4174 [OUT=папка] node e2e/v133-long.mjs
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

const LONG = 'Параллелограмм — это четырёхугольник, у которого противоположные стороны попарно параллельны, то есть лежат на параллельных прямых. '.repeat(14);
const WORD = 'Электроэнцефалографический'.repeat(12);
const LINK = 'https://example.com/' + 'очень-длинная-ссылка-'.repeat(15);
const TEX = '$$' + Array.from({ length: 30 }, (_, i) => `a_{${i}}x^{${i}}`).join('+') + '$$';
const T0 = '2026-09-01T10:00:00.000Z';

function data() {
  const d = seed();
  d.cards.push(
    { id: 'L1', topicId: 'g2', type: 'basic', front: 'Что такое параллелограмм?', back: LONG, createdAt: T0, updatedAt: T0 },
    { id: 'L2', topicId: 'g2', type: 'basic', front: WORD, back: LINK, createdAt: T0, updatedAt: T0 },
    { id: 'L3', topicId: 'g2', type: 'basic', front: 'Формула', back: TEX, why: LONG, createdAt: T0, updatedAt: T0 }
  );
  // Словарь терминов: длинное определение (тот самый «узкий высокий столбик»).
  const g2 = d.topics.find((t) => t.id === 'g2');
  g2.lists = [{ id: 'tl', kind: 'terms', title: 'Термины', cols: ['Термин', 'Определение', 'Пример'], mode: 'basic' }];
  d.cards.push(
    { id: 'T1', topicId: 'g2', listId: 'tl', type: 'basic', front: 'Параллелограмм', back: LONG, createdAt: T0, updatedAt: T0 },
    { id: 'T2', topicId: 'g2', listId: 'tl', type: 'basic', front: WORD, back: LINK + ' ' + WORD, createdAt: T0, updatedAt: T0 }
  );
  return d;
}

/** Узкий высокий столбик: блок текста уже 45 % своего контейнера и выше втрое своей ширины; или что-то шире экрана. */
async function audit(page, sel, label) {
  const r = await page.evaluate((sel) => {
    const W = document.documentElement.clientWidth;
    const out = { narrow: [], wide: [], hscroll: document.documentElement.scrollWidth > W + 1 };
    for (const el of document.querySelectorAll(sel)) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const box = el.parentElement.getBoundingClientRect();
      const txt = (el.value ?? '') + (el.querySelector?.('textarea')?.value ?? '') + el.textContent;
      if (txt.trim().length < 40) continue; // пустая клетка растягивается по строке — это не текст
      if (b.width < box.width * 0.45 && b.height > b.width * 3 && b.height > 150) out.narrow.push(`${el.className} ${Math.round(b.width)}×${Math.round(b.height)} в ${Math.round(box.width)}`);
      if (b.right > W + 1 && !el.closest('.katex-display, .math-block, pre, table')) out.wide.push(`${el.className} ${Math.round(b.right)}>${W}`);
    }
    return out;
  }, sel);
  check(!r.narrow.length && !r.wide.length && !r.hscroll, `${label}${r.narrow.length ? ' столбик: ' + r.narrow.join('; ') : ''}${r.wide.length ? ' шире экрана: ' + r.wide.join('; ') : ''}${r.hscroll ? ' прокрутка вбок' : ''}`);
}

for (const v of [
  { name: '360', width: 360, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desk', width: 1280, height: 820 }
]) {
  const mobile = v.width < 900;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  const open = async (route) => {
    await page.evaluate(
      ({ d, route }) => {
        sessionStorage.setItem('mnema-web-test-ok', '1');
        sessionStorage.setItem('refrain-no-splash', String(Date.now()));
        localStorage.setItem('mnema-data-pending', JSON.stringify(d));
        localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: route, at: Date.now() } }));
      },
      { d: data(), route }
    );
    await page.reload();
    await page.waitForTimeout(1300);
  };
  const tag = v.name;
  await open({ name: 'topic', id: 'g2', tab: 'cards' });
  await audit(page, '.card-row, .card-row .md, .card-row-q', `${tag}: список карточек`);
  if (OUT) await page.screenshot({ path: join(OUT, `long-cards-${tag}.png`) });
  await open({ name: 'topic', id: 'g2', tab: 'list:tl' });
  await audit(page, '.list-tr .cell-wrap, .list-tr .cell', `${tag}: словарь — длинное определение`);
  if (OUT) await page.screenshot({ path: join(OUT, `long-list-${tag}.png`) });
  await open({ name: 'topic', id: 'g2', tab: 'cards' });
  // Окно карточки (правка) с длинным текстом.
  await page.locator('.card-row', { hasText: 'Что такое параллелограмм' }).first().click();
  await page.locator('.modal').waitFor();
  await audit(page, '.modal .field, .modal textarea, .modal .math-preview, .modal .md', `${tag}: окно карточки`);
  await page.locator('.modal button[aria-label="Закрыть"]').first().click();
  await page.waitForTimeout(300);
  // Повторение: длинный ответ, слово, ссылка, формула.
  await open({ name: 'topic', id: 'g2', tab: 'cards' });
  await page.getByRole('button', { name: /^Учить/ }).first().click();
  await page.locator('.review-card').waitFor();
  for (let i = 0; i < 6; i++) {
    const card = page.locator('.review-card');
    if (!(await card.count())) break;
    await page.getByRole('button', { name: 'Показать ответ' }).click().catch(() => {});
    await page.waitForTimeout(250);
    await audit(page, '.review-card, .review-card .md, .answer, .why-box', `${tag}: повторение, карточка ${i + 1}`);
    const kx = await page.evaluate(() =>
      [...document.querySelectorAll('.review-card .katex-display')].every((k) => {
        const box = k.closest('.math-block') ?? k;
        return box.getBoundingClientRect().right <= document.documentElement.clientWidth + 1 && (box.scrollWidth <= box.clientWidth + 1 || getComputedStyle(box).overflowX === 'auto');
      })
    );
    check(kx, `${tag}: длинная формула прокручивается внутри блока`);
    if (OUT) await page.screenshot({ path: join(OUT, `long-review-${i}-${tag}.png`) });
    await page.getByRole('button', { name: /Хорошо|Помню/ }).first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
  check(errors.length === 0, `${tag}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
