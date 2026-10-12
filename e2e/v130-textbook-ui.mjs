// «Из учебника» вживую: окно импорта на компьютере и телефоне, режимы «Конспект / Кратко / Дословно», второй запрос к ИИ,
// откат при кривом ответе, таблицы и формулы, рисунки. ИИ подменён заглушкой window.mnemaApi.aiAsk.
//
//   npx vite --mode web --port 5321 &   URL=http://localhost:5321 node e2e/v130-textbook-ui.mjs [pc|phone]
// Скриншоты — в $OUT (по умолчанию /tmp/refrain-ui).
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:5321';
const OUT = process.env.OUT ?? '/tmp/refrain-ui';
const which = process.argv[2] ?? 'both';
fs.mkdirSync(OUT, { recursive: true });
const P1 = 'test-fixtures/textbook/pages/physics_mild.jpg';
const P2 = 'test-fixtures/textbook/pages/biology_mild.jpg';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const seed = () => {
  const at = new Date(Date.now() - 5 * 864e5).toISOString();
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Физика', color: '#3F51D8', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Теплопроводность', note: '', createdAt: at, updatedAt: at }], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true, features: { ai: true } } }));
};

// Ответы заглушки ИИ. Первый шаг (чтение страницы) и второй (сведение) различаются по системному тексту.
const READ_PHYS = `## § 12. Теплопроводность

Такой способ передачи энергии называют **теплопроводностью**. При теплопроводности вещество не перемещается вдоль тела: переносится только энергия.

[[РИСУНОК 100 400 900 600 | рис 25 - Нагревание стержня]]

Количество теплоты вычисляют по формуле: $Q = c · m · (t_2 − t_1)$, где $m = 5 кг$.

Орган | Функция
Сердце | Насос | лишнее
Лёгкие

> Запомните: теплопроводность — перенос энергии.

[[СТРАНИЦА 47]]`;
const READ_BIO = `## § 5. Строение клетки

Клетка — наименьшая единица строения и жизнедеятельности организма.

[[РИСУНОК 100 300 900 700 | Рис. 11. Строение животной клетки]]

Митохондрии называют «энергетическими станциями» клетки.

[[СТРАНИЦА 48]]`;
const SUMMARY = `## § 12. Теплопроводность

[стр. 47]

- **Теплопроводность** — перенос энергии без перемещения вещества.
- Количество теплоты: $Q = c \\cdot m \\cdot (t_2 - t_1)$.

| Орган | Функция |
|---|---|
| Сердце | Насос |

[[РИС 1.1]]

> **Запомните:** теплопроводность — перенос энергии.

## § 5. Строение клетки

[стр. 48]

- **Клетка** — наименьшая единица строения организма.

[[РИС 2.1]]`;

async function run(name, viewport, scenario) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(seed);
  await page.reload();
  await page.waitForSelector('#root > *');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Понятно' }).click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(([rp, rb, sm]) => {
    window.__readPhys = rp;
    window.__readBio = rb;
    window.__summary = sm;
    window.__asks = [];
    window.mnemaApi.aiAsk = (req) => {
      window.__asks.push({ merge: /ОДИН связный конспект/.test(req.system), direct: /КОНСПЕКТ по фото/.test(req.system), image: !!req.image });
      if (/ОДИН связный конспект/.test(req.system)) return Promise.resolve(window.__mergeReply ?? { ok: true, text: window.__summary });
      if (window.__badRead) return Promise.resolve(window.__badRead);
      const n = window.__asks.filter((a) => a.image).length;
      return Promise.resolve({ ok: true, text: n % 2 === 0 ? window.__readBio : window.__readPhys });
    };
  }, [READ_PHYS, READ_BIO, SUMMARY]);
  if (scenario.mergeFail) await page.evaluate(() => (window.__mergeReply = { ok: false, error: '500: boom' }));
  // На телефоне боковая панель уезжает за край: нажимаем по DOM, а не по координатам.
  const dom = async (t) => {
    const ok = await page.evaluate((t) => { const b = [...document.querySelectorAll('button,a,[role=button],[role=menuitem]')].find((x) => x.innerText.includes(t)); b && b.click(); return !!b; }, t);
    await page.waitForTimeout(600);
    return ok;
  };
  await dom('Физика');
  await dom('нет карточек');
  if (!(await dom('Из учебника'))) {
    await page.screenshot({ path: `${OUT}/${name}-0-nofound.png` });
    throw new Error('нет кнопки «Из учебника»');
  }
  await page.locator('.modal input[type=file]').setInputFiles(scenario.files);
  await page.locator('.tb-page img').first().waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-1-pages.png` });
  if (scenario.style) await page.getByRole('radio', { name: scenario.style }).click();
  await page.getByRole('radio', { name: scenario.engine === 'ai' ? 'Точно (ИИ)' : 'Без интернета' }).click();
  await page.screenshot({ path: `${OUT}/${name}-2-options.png` });
  await page.getByRole('button', { name: /^(Сделать конспект|Распознать)/ }).click();
  await page.locator('.tb-review').waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  const text = await page.locator('.tb-preview').innerText();
  const html = await page.locator('.tb-preview').innerHTML();
  const warns = await page.locator('.hint.warn').allInnerTexts();
  const asks = await page.evaluate(() => window.__asks);
  await page.screenshot({ path: `${OUT}/${name}-3-review.png`, fullPage: false });
  const info = {
    name,
    asks: asks.map((a) => (a.merge ? 'сведение' : a.direct ? 'конспект-страница' : 'чтение')).join(', '),
    tables: await page.locator('.tb-preview table').count(),
    katex: await page.locator('.tb-preview .katex').count(),
    katexErr: await page.locator('.tb-preview .katex-error').count(),
    imgs: await page.locator('.tb-preview img').count(),
    unsafe: /<script|onerror|javascript:/i.test(html),
    warns,
    chars: text.length,
    errors
  };
  if (scenario.finish) {
    await page.getByRole('button', { name: 'Добавить в конспект' }).click();
    await page.waitForTimeout(2500);
    info.editor = {
      tables: await page.locator('.ProseMirror table').count(),
      cells: await page.locator('.ProseMirror td, .ProseMirror th').count(),
      katex: await page.locator('.ProseMirror .katex').count(),
      imgs: await page.locator('.ProseMirror img').count()
    };
    await page.screenshot({ path: `${OUT}/${name}-4-editor.png` });
  }
  console.log(JSON.stringify(info, null, 1));
  return { page, ctx, info };
}

const out = [];
const PC = { width: 1280, height: 900 };
const PH = { width: 390, height: 844 };
const sizes = which === 'pc' ? [['pc', PC]] : which === 'phone' ? [['phone', PH]] : [['pc', PC], ['phone', PH]];
for (const [sz, vp] of sizes) {
  let r = await run(`${sz}-summary-ai`, vp, { files: [P1, P2], engine: 'ai', style: 'Конспект', finish: true });
  out.push(r.info);
  // откат второго запроса
  await r.ctx.close();
  r = await run(`${sz}-merge-fail`, vp, { files: [P1, P2], engine: 'ai', style: 'Конспект', mergeFail: true });
  out.push(r.info);
  await r.ctx.close();
  r = await run(`${sz}-verbatim-ai`, vp, { files: [P1], engine: 'ai', style: 'Дословно' });
  out.push(r.info);
  await r.ctx.close();
  r = await run(`${sz}-offline-summary`, vp, { files: [P1], engine: 'offline', style: 'Конспект' });
  out.push(r.info);
  await r.ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/ui-summary.json`, JSON.stringify(out, null, 1));
