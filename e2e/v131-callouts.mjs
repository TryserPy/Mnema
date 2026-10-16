// 1.31: выноски «> [!def] Термин» в редакторе конспекта и в просмотре (правило), светлая и тёмная тема, телефон и компьютер.
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/v131-callouts.mjs   (SHOTS=1 — снимки в OUT)
import { chromium } from 'playwright';
import fs from 'fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const NOTE = [
  '## Фотосинтез',
  '',
  '> [!def] **Фотосинтез**',
  '> образование ==органических веществ== из $CO_2$ и воды на свету',
  '>',
  '> - в хлоропластах [стр. 12]',
  '> - нужен {?хлорофилл?}',
  '',
  '> [!tip] Запомни',
  '> свет → энергия',
  '',
  '> [!note] Чужая выноска с очень длинным заголовком, который не должен вылезать за рамку на телефоне',
  '> из Obsidian',
  '',
  '> **Запомните:** старая рамка учебника',
  '',
  'Хлоропласты содержат пигмент.',
  '',
  'Последний абзац.'
].join('\n');
const RULE = ['> [!rule] Правило буравчика', '> ток → поле', '', '> [!warn]- Свёрнутая', '> скрытый текст', '', '> [!def] <img src=x onerror="window.__xss=1">', '> текст [стр. 4] и {?слово?}'].join('\n');

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
  await page.evaluate(
    ({ NOTE, RULE, theme }) => {
      const at = new Date().toISOString();
      sessionStorage.setItem('mnema-web-test-ok', '1'); // окно «онлайн-версия — только для тестов»
      localStorage.setItem(
        'mnema-data',
        JSON.stringify({
          version: 1,
          subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }],
          topics: [
            { id: 't1', subjectId: 's1', name: 'Фотосинтез', note: NOTE, createdAt: at, updatedAt: at },
            { id: 'r1', subjectId: 's1', name: 'Буравчик', kind: 'rule', note: RULE, createdAt: at, updatedAt: at }
          ],
          cards: [],
          states: {},
          logs: [],
          tests: [],
          settings: { onboarded: true, theme }
        })
      );
    },
    { NOTE, RULE, theme }
  );
  await page.reload();
  await page.waitForTimeout(600);
  return page;
}

async function openTopic(page, width) {
  if (width < 700) {
    // Телефон: панель → предмет → тема в списке предмета → вкладка «Конспект».
    await page.locator('.tabbar .tab', { hasText: 'Знания' }).click();
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: 'Все темы списком' }).click();
    await page.waitForTimeout(400);
    await page.locator('.sidebar:not(.rail) .tree-row.subject .tree-label', { hasText: 'Биология' }).first().click();
    await page.waitForTimeout(400);
    await page.locator('.main .topic-row', { hasText: 'Фотосинтез' }).first().click();
    await page.waitForTimeout(400);
    const tab = page.locator('.topic-tabs [role="tab"], .topic-tabs button', { hasText: 'Конспект' }).first();
    if (await tab.count()) await tab.click().catch(() => {});
  } else {
    await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
    await page.locator('.tree-row', { hasText: 'Фотосинтез' }).locator('.tree-label').click();
  }
  await page.locator('.ProseMirror').waitFor();
  await page.waitForTimeout(500);
}

// Веб-версия хранит данные в IndexedDB; mnemaApi.load() отдаёт последнее сохранённое (после __mnemaFlush — сразу).
const savedNote = (page) =>
  page.evaluate(() => {
    window.__mnemaFlush?.();
    return JSON.parse(window.mnemaApi.load()).topics.find((t) => t.id === 't1').note;
  });

/** Ничего в выносках не вылезает за край экрана и за саму выноску. */
const overflow = (page, root) =>
  page.evaluate((root) => {
    const W = document.documentElement.clientWidth;
    const out = [];
    for (const co of document.querySelectorAll(`${root} [data-callout]`)) {
      const r = co.getBoundingClientRect();
      if (r.right > W + 1) out.push('выноска за краем ' + co.dataset.callout);
      for (const e of co.querySelectorAll('*')) {
        const er = e.getBoundingClientRect();
        if (!er.width || e.closest('.katex')) continue;
        if (er.right > r.right + 1) out.push(`${co.dataset.callout} > ${e.className || e.tagName} шире выноски`);
      }
    }
    return out;
  }, root);

/** Цвет рамки и фона выноски и читаемость заголовка. */
const looks = (page, sel) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const t = el.querySelector('[data-callout-title], .callout-kind');
    return { border: cs.borderLeftColor, bg: cs.backgroundColor, title: t ? getComputedStyle(t).color : '' };
  }, sel);

for (const theme of ['light', 'dark']) {
  for (const width of [1280, 380]) {
    const tag = `${theme}-${width}`;
    console.log(`— ${tag}`);
    const page = await open(theme, width);
    await openTopic(page, width);
    check((await page.evaluate(() => document.documentElement.dataset.theme)) === theme, `${tag}: тема ${theme}`);

    // ---- Редактор ----
    const def = page.locator('.note-doc [data-callout="def"]');
    check(await def.isVisible(), `${tag}: выноска «def» в редакторе`);
    check((await def.locator('.callout-kind').inputValue()) === 'def', `${tag}: вид выноски в шапке — «Определение»`);
    check((await def.locator('.callout-title').inputValue()) === '**Фотосинтез**', `${tag}: заголовок выноски — в поле`);
    check(await page.locator('.note-doc [data-callout="note"][data-callout-other]').isVisible(), `${tag}: чужая выноска — обычной рамкой`);
    check((await page.locator('.note-doc .page-ref').first().innerText()).trim() === 'стр. 12', `${tag}: [стр. 12] — плашка без скобок`);
    check((await page.locator('.note-doc .unsure-word').first().innerText()).includes('хлорофилл'), `${tag}: {?хлорофилл?} подсвечен`);
    check(await page.locator('.note-doc blockquote', { hasText: 'Запомните:' }).isVisible(), `${tag}: старая рамка «Запомните» открывается как прежде`);
    const dl = await looks(page, '.note-doc [data-callout="def"]');
    const tl = await looks(page, '.note-doc [data-callout="tip"]');
    check(dl && tl && dl.border !== tl.border && dl.bg !== 'rgba(0, 0, 0, 0)', `${tag}: у выносок свои цвета (def ${dl?.border}, tip ${tl?.border})`);
    const ov = await overflow(page, '.note-doc');
    check(!ov.length, `${tag}: в редакторе ничего не вылезает ${ov.join('; ')}`);
    if (process.env.SHOTS) await page.locator('.note-doc').screenshot({ path: `${OUT}/callouts-editor-${tag}.png` });

    if (width === 1280) {
      // Ввод «[!rule] » в начале строки → выноска, курсор в заголовке.
      await page.locator('.note-doc p', { hasText: 'Последний абзац.' }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('[!rule] ');
      await page.locator('.note-doc [data-callout="rule"]').waitFor({ timeout: 3000 }).catch(() => {});
      check(await page.locator('.note-doc [data-callout="rule"]').isVisible(), `${tag}: «[!rule] » стала выноской`);
      check(await page.evaluate(() => document.activeElement?.classList.contains('callout-title')), `${tag}: курсор — в заголовке выноски`);
      await page.keyboard.type('Закон Ома');
      await page.keyboard.press('Enter');
      await page.keyboard.type('I = U / R');
      await page.waitForTimeout(600);
      check((await savedNote(page)).includes('> [!rule] Закон Ома\n> I = U / R'), `${tag}: сохранилось как «> [!rule] Закон Ома»`);

      // Смена вида в шапке.
      await page.locator('.note-doc [data-callout="rule"] .callout-kind').selectOption('warn');
      await page.waitForTimeout(600);
      check((await savedNote(page)).includes('> [!warn] Закон Ома'), `${tag}: вид поменялся на «Внимание»`);
      // Убрать выноску — текст остаётся.
      await page.locator('.note-doc [data-callout="warn"] .callout-off').click();
      await page.waitForTimeout(600);
      const after = await savedNote(page);
      check(!after.includes('[!warn]') && after.includes('Закон Ома\n\nI = U / R'), `${tag}: «убрать выноску» оставила текст`);

      // Выделение → «В выноску» → «Пример».
      const p = page.locator('.note-doc p', { hasText: 'Хлоропласты содержат пигмент.' });
      await p.dblclick();
      await p.click({ button: 'right' });
      await page.waitForTimeout(400);
      await page.locator('.sel-panel .sel-actions button', { hasText: 'В выноску' }).click();
      await page.locator('.sel-panel [data-callout-pick="ex"]').click();
      await page.waitForTimeout(600);
      check((await savedNote(page)).includes('> [!ex]\n> Хлоропласты содержат пигмент.'), `${tag}: «В выноску → Пример»`);
      check(await page.locator('.sel-panel [data-callout-pick="ex"].on').isVisible(), `${tag}: в панели отмечен текущий вид`);
      if (process.env.SHOTS) await page.screenshot({ path: `${OUT}/callouts-selpanel-${tag}.png` });
      await page.locator('.sel-panel [data-callout-pick="ex"]').click();
      await page.waitForTimeout(600);
      check(!(await savedNote(page)).includes('[!ex]'), `${tag}: тот же вид ещё раз — выноска убрана`);
      await page.keyboard.press('Escape');
    }

    // ---- Просмотр (правило) ----
    await page.goto(URL + '#/');
    await page.waitForTimeout(400);
    if (width < 700) {
      await page.locator('.tabbar .tab', { hasText: 'Знания' }).click();
      await page.waitForTimeout(350);
      await page.getByRole('button', { name: 'Все темы списком' }).click();
      await page.waitForTimeout(400);
    }
    await page.locator('.sidebar:not(.rail) .tree-row.subject .tree-label', { hasText: 'Биология' }).first().click();
    await page.waitForTimeout(300);
    await page.getByRole('radio', { name: /Правила/ }).click();
    await page.locator('.rule-card', { hasText: 'Буравчик' }).first().click();
    await page.locator('.rule-view-body').waitFor();
    const md = page.locator('.rule-view-body .md');
    check(await md.locator('[data-callout="rule"] [data-callout-title]').innerText().then((t) => t.includes('📐') && t.includes('Правило буравчика')), `${tag}: просмотр — значок и заголовок`);
    check((await md.locator('details[data-callout="warn"]').getAttribute('open')) === null, `${tag}: «[!warn]-» свёрнута`);
    await md.locator('details[data-callout="warn"] summary').click();
    check(await md.locator('details[data-callout="warn"]', { hasText: 'скрытый текст' }).locator('[data-callout-body]').isVisible(), `${tag}: свёрнутая раскрывается`);
    check(await md.locator('[data-callout="def"] [data-callout-title]').innerText().then((t) => t.includes('📘')), `${tag}: заголовок с HTML — значок на месте`);
    check(!(await page.evaluate(() => window.__xss)) && !(await md.locator('img[onerror]').count()), `${tag}: HTML в заголовке обезврежен`);
    check((await md.locator('.page-ref').innerText()).trim() === 'стр. 4' && (await md.locator('[data-unsure]').innerText()) === 'слово', `${tag}: просмотр — плашка и {?слово?}`);
    const vr = await looks(page, '.rule-view-body [data-callout="rule"]');
    check(vr && vr.border !== vr.bg && vr.title !== vr.bg, `${tag}: просмотр — рамка ${vr?.border}, фон ${vr?.bg}, заголовок ${vr?.title}`);
    const ov2 = await overflow(page, '.rule-view-body');
    check(!ov2.length, `${tag}: в просмотре ничего не вылезает ${ov2.join('; ')}`);
    if (process.env.SHOTS) await page.screenshot({ path: `${OUT}/callouts-view-${tag}.png` });
    await page.close();
  }
}

check(!errors.length, 'без ошибок на странице ' + errors.join(' | '));
await browser.close();
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё хорошо');
process.exit(bad ? 1 : 0);
