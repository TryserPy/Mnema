// 1.31: «Создать → Из тетради» — фото разворота (ответ ИИ — заглушка) и .docx-фикстура; светлая 1280 и тёмная 380.
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/v131-notebook.mjs   (SHOTS=1 — снимки в OUT)
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
const ROOT = process.env.ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const ANSWER = ['## Фотосинтез', '', '> [!def] Фотосинтез', '> образование {?органических?} веществ из углекислого газа и воды на свету', '', 'Лист зелёный, так как в нём есть хлорофилл.', '', 'В 1771 году Пристли открыл, что растения выделяют кислород.', '', '[[СТРАНИЦА 12]]'].join('\n');

let bad = 0;
const errors = [];
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) bad++;
};

async function open(theme, width) {
  const mobile = width < 700;
  const page = await browser.newPage({ viewport: { width, height: 860 }, isMobile: mobile, hasTouch: mobile, colorScheme: theme });
  page.on('pageerror', (e) => errors.push(`${theme}/${width}: ${e.message}`));
  await page.goto(URL);
  await page.evaluate((theme) => {
    const at = new Date().toISOString();
    sessionStorage.setItem('mnema-web-test-ok', '1');
    localStorage.setItem(
      'mnema-data',
      JSON.stringify({
        version: 1,
        subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }],
        topics: [{ id: 't1', subjectId: 's1', name: 'Дыхание', note: '## Дыхание\n\nСтарый текст.', createdAt: at, updatedAt: at }],
        cards: [],
        states: {},
        logs: [],
        tests: [],
        homework: [],
        settings: { onboarded: true, theme }
      })
    );
  }, theme);
  await page.reload();
  await page.waitForTimeout(600);
  // Заглушка ИИ: вместо сети — готовый ответ; запросы запоминаются для проверки.
  await page.evaluate((ANSWER) => {
    window.__asked = [];
    window.mnemaApi.aiAsk = async (r) => (window.__asked.push({ task: r.refrain?.task, system: r.system?.slice(0, 200), image: Boolean(r.image) }), { ok: true, text: ANSWER });
  }, ANSWER);
  return page;
}

async function openNotebook(page, width) {
  await page.locator(width < 700 ? '.mobile-bar .mobile-create' : '.sidebar .create-btn').first().click();
  await page.locator('.create-item', { hasText: 'Из тетради' }).click();
  await page.locator('[data-part="notebook"]').waitFor();
}

async function overflow(page) {
  return page.evaluate(() => {
    const box = document.querySelector('.modal')?.getBoundingClientRect();
    if (!box) return ['нет окна'];
    const out = [];
    for (const e of document.querySelectorAll('.modal *')) {
      const r = e.getBoundingClientRect();
      if (!r.width || e.closest('.katex')) continue;
      if (r.right > box.right + 1 || r.left < box.left - 1) out.push(`${e.tagName.toLowerCase()}.${e.className}`.slice(0, 60));
    }
    return out.slice(0, 5);
  });
}

/** PNG «разворота» 1600×1000 из браузера: две страницы с текстом. */
async function spreadPng(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 1000;
    const x = c.getContext('2d');
    x.fillStyle = '#eef3fb';
    x.fillRect(0, 0, 1600, 1000);
    x.strokeStyle = '#b8c8e6';
    for (let i = 0; i < 1600; i += 25) (x.beginPath(), x.moveTo(i, 0), x.lineTo(i, 1000), x.stroke());
    x.fillStyle = '#1a237e';
    x.font = '40px serif';
    x.fillText('Фотосинтез', 120, 200);
    x.fillText('Дыхание', 920, 200);
    return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(b64, 'base64');
}

for (const [theme, width] of [
  ['light', 1280],
  ['dark', 380]
]) {
  const tag = `${theme}-${width}`;
  console.log(`— ${tag}`);

  // ---- Фото ----
  let page = await open(theme, width);
  await openNotebook(page, width);
  await page.locator('input[aria-label="Название темы"]').fill('Фотосинтез');
  await page.locator('[data-testid="nb-photos"]').setInputFiles({ name: 'spread.png', mimeType: 'image/png', buffer: await spreadPng(page) });
  await page.locator('.nb-page[data-page="2"] .nb-text').waitFor({ timeout: 15000 });
  await page.locator('.nb-finish').waitFor({ timeout: 15000 });
  check((await page.locator('.nb-page').count()) === 2, `${tag}: разворот → две страницы`);
  const asked = await page.evaluate(() => window.__asked);
  check(asked.length === 2 && asked.every((a) => a.task === 'notebook.read' && a.image && /тетрад/i.test(a.system ?? '')), `${tag}: две задачи notebook.read с фото`);
  check(await page.locator('.nb-page[data-page="1"] .nb-unsure', { hasText: 'органических' }).isVisible(), `${tag}: неуверенное слово подсвечено`);
  await page.locator('.nb-page[data-page="1"] .nb-unsure').click();
  await page.locator('.nb-page[data-page="1"] .nb-fix').fill('органических');
  await page.keyboard.press('Enter');
  check(!(await page.locator('.nb-page[data-page="1"] .nb-unsure').count()), `${tag}: слово поправлено нажатием`);
  await page.getByRole('button', { name: 'Как в тетради' }).click();
  check(await page.locator('.nb-page[data-page="1"]', { hasText: 'т.к.' }).isVisible(), `${tag}: «Как в тетради» вернул сокращение`);
  await page.getByRole('button', { name: 'Всё верно (1)' }).click(); // на второй странице метка осталась
  await page.getByRole('button', { name: 'Черновики карточек' }).click();
  const drafts = await page.locator('.nb-draft').count();
  check(drafts >= 1, `${tag}: черновики карточек: ${drafts}`);
  const ov = await overflow(page);
  check(!ov.length, `${tag}: в окне ничего не вылезает ${ov.join('; ')}`);
  if (process.env.SHOTS) await page.locator('.modal').screenshot({ path: `${OUT}/notebook-photo-${tag}.png` });
  await page.getByRole('button', { name: 'Сохранить конспект' }).click();
  await page.locator('.ProseMirror, .note-doc').first().waitFor({ timeout: 10000 });
  const saved = await page.evaluate(() => {
    window.__mnemaFlush?.();
    const d = JSON.parse(window.mnemaApi.load());
    const t = d.topics.find((x) => x.name === 'Фотосинтез');
    return { note: t?.note ?? '', cards: d.cards.filter((c) => c.topicId === t?.id).length };
  });
  check(saved.note.includes('> [!def] Фотосинтез') && saved.note.includes('органических') && !saved.note.includes('{?'), `${tag}: конспект сохранён без меток`);
  check(saved.cards === drafts, `${tag}: карточек в теме: ${saved.cards}`);
  await page.close();

  // ---- Файл .docx ----
  page = await open(theme, width);
  await openNotebook(page, width);
  await page.getByRole('radio', { name: 'Файл' }).click();
  await page.locator('[data-testid="nb-file"]').setInputFiles(path.join(ROOT, 'test-fixtures/notebook/biology.docx'));
  await page.locator('.nb-row').first().waitFor({ timeout: 10000 });
  const titles = await page.locator('.nb-row input[aria-label="Название темы"]').evaluateAll((es) => es.map((e) => e.value));
  check(titles.some((t) => t.includes('Фотосинтез')) && titles.some((t) => t.includes('Дыхание')), `${tag}: разделы: ${titles.join(' | ')}`);
  check(await page.locator('.nb-row', { hasText: 'В домашку' }).first().isVisible(), `${tag}: «Домашнее задание» — похоже на ДЗ`);
  check(await page.locator('.nb-row', { hasText: 'Дописать в «Дыхание»' }).first().isVisible(), `${tag}: «Дыхание растений» — дописать в существующую тему`);
  const ov2 = await overflow(page);
  check(!ov2.length, `${tag}: в окне файла ничего не вылезает ${ov2.join('; ')}`);
  if (process.env.SHOTS) await page.locator('.modal').screenshot({ path: `${OUT}/notebook-file-${tag}.png` });
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.waitForTimeout(600);
  const d = await page.evaluate(() => (window.__mnemaFlush?.(), JSON.parse(window.mnemaApi.load())));
  check(d.topics.some((t) => /Фотосинтез/.test(t.name) && /\|/.test(t.note)), `${tag}: тема «Фотосинтез» с таблицей`);
  check(/Старый текст[\s\S]*Дыхание растений/.test(d.topics.find((t) => t.id === 't1').note), `${tag}: «Дыхание» дописано`);
  check((d.homework ?? []).some((h) => /12/.test(h.text) && /-10-14$/.test(h.due ?? '')), `${tag}: домашка на 14.10`);
  await page.close();
}

await browser.close();
if (errors.length) {
  console.log('Ошибки страницы:\n' + errors.join('\n'));
  bad += errors.length;
}
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё хорошо');
process.exit(bad ? 1 : 0);
