// Знакомство-тренажёр, как его проходит человек: смотрим на рамку и нажимаем ровно в её середину (как палец или мышь по подсветке).
// Проверяет: рамка совпадает с элементом (после анимации окна, при прокрутке), плашка не закрывает подсвеченное и не вылезает за экран,
// счёт «Шаг N из М» растёт по порядку, нажатие в рамку продвигает знакомство. Прогоняет и «Пропустить шаг» до «Готово».
// Нужен dev-сервер (`npx vite --port 5217`): знакомство запускается через модуль Tutorial прямо на странице.
//   URL=http://localhost:5217 OUT=out-v130-tour [DEVICE=phone|land|narrow|tablet|desktop] [STYLES=none,notebook,focus,ui-focus,...] [UI_CSS=api.css] node e2e/v130-tour.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const URL = process.env.URL || 'http://localhost:5217';
const OUT = process.env.OUT || 'out-v130-tour';
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  land: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, // телефон на боку: уже не «телефонная» раскладка (шире 720), но экран низкий
  narrow: { viewport: { width: 700, height: 700 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }, // как на жалобе: узкое окно ~700
  tablet: { viewport: { width: 820, height: 1180 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  desktop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }
};
const devs = (process.env.DEVICE || 'phone,narrow,desktop').split(',');
const uiCss = process.env.UI_CSS ? fs.readFileSync(process.env.UI_CSS, 'utf8') : '';
const LAYOUTS = {
  'ui-focus': { 'data-ui-content': 'narrow', 'data-ui-sidebar': 'rail' },
  'ui-top': { 'data-ui-sidebar': 'top', 'data-ui-content': 'wide' },
  'ui-right': { 'data-ui-sidebar': 'right' }
};

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const problems = [];

// Сколько стилей — столько прогонов; названия берём из каталога приложения.
const catalog = await (async () => {
  const ctx = await browser.newContext(DEVICES.phone);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(2000);
    window.__imp = (n) => import(performance.getEntriesByType('resource').map((r) => r.name).find((u) => new URL(u).pathname === n) ?? n);
  });
  await page.goto(URL);
  await page.waitForTimeout(500);
  const r = await page.evaluate(async () => (await window.__imp('/src/mods.ts')).CATALOG.map((m) => m.id));
  await ctx.close();
  return r;
})();
const styles = (process.env.STYLES ? process.env.STYLES.split(',') : ['none', ...catalog, ...Object.keys(LAYOUTS)]).filter(Boolean);

/** Открыть приложение, включить стиль и запустить знакомство так, как это делает человек: пустое приложение → «Знакомство». */
async function start(page, style) {
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(2000);
    window.__imp = (n) => import(performance.getEntriesByType('resource').map((r) => r.name).find((u) => new URL(u).pathname === n) ?? n);
  });
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Понятно' }).click({ timeout: 1500 }).catch(() => {}); // веб-версия: «только для тестов»
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Давай попробуем' }).click();
  await page.evaluate(async ({ style, layout }) => {
    const store = await window.__imp('/src/store.ts');
    if (style !== 'none' && !layout) store.updateSettings({ modsOn: [style] });
    if (layout) for (const [k, v] of Object.entries(layout)) document.documentElement.setAttribute(k, v);
  }, { style, layout: LAYOUTS[style] });
  if (uiCss) await page.addStyleTag({ content: uiCss });
  await page.waitForTimeout(600);
}

const stepText = (page) => page.locator('.tut-step').first().innerText().catch(() => '');
const parseStep = (t) => {
  const m = /Шаг (\d+) из (\d+)/i.exec(t);
  if (/Всё готово/i.test(t)) return { n: 99, total: 99, done: true };
  return m ? { n: +m[1], total: +m[2] } : null;
};

async function ringState(page) {
  return page.evaluate(() => {
    const ring = document.querySelector('.tut-ring')?.getBoundingClientRect();
    const card = document.querySelector('.tut-card')?.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;
    const r = ring && { x: ring.left + 6, y: ring.top + 6, w: ring.width - 12, h: ring.height - 12 };
    let hit = null, overlap = 0;
    if (r) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const el = document.elementFromPoint(Math.min(vw - 1, Math.max(0, cx)), Math.min(vh - 1, Math.max(0, cy)));
      hit = el ? (el.closest('button, a, [role="button"], input, textarea, .ProseMirror, .create-item, .topic-row, .tab, .nav-item, .tree-row, .modal') ? 'ok' : (el.className?.baseVal ?? el.className) || el.tagName) : 'none';
      if (card) {
        const ix = Math.max(0, Math.min(r.x + r.w, card.right) - Math.max(r.x, card.left));
        const iy = Math.max(0, Math.min(r.y + r.h, card.bottom) - Math.max(r.y, card.top));
        overlap = (ix * iy) / Math.max(1, r.w * r.h);
      }
    }
    return {
      ring: r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) },
      cardOut: card ? card.left < -1 || card.right > vw + 1 || card.top < -1 || card.bottom > vh + 1 : false,
      overlap: Math.round(overlap * 100),
      hit,
      cx: r ? Math.round(r.x + r.w / 2) : null,
      cy: r ? Math.round(r.y + r.h / 2) : null
    };
  });
}

async function run(dev, style) {
  const label = `${dev}/${style}`;
  const dir = `${OUT}/${dev}/${style}`;
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext(DEVICES[dev]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const bad = (msg) => {
    problems.push(`${label}: ${msg}`);
    console.log('  !!', msg);
  };
  await start(page, style);

  const tap = async (x, y) => (DEVICES[dev].hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  let last = 0;
  let lastLine = '';
  const seen = [];
  let shots = 0;
  const shot = async (name) => page.screenshot({ path: `${dir}/${String(++shots).padStart(2, '0')}-${name}.png` });
  // Идём «руками»: нажимаем в середину рамки; где нужно что-то ввести — вводим.
  for (let guard = 0; guard < 40; guard++) {
    await page.waitForTimeout(450);
    const text = await stepText(page);
    const st = parseStep(text);
    if (!st) { bad('плашка знакомства пропала посреди прохождения: ' + JSON.stringify(text)); await shot('lost'); break; }
    if (!seen.includes(st.n)) seen.push(st.n);
    const rs = await ringState(page);
    const title = (await page.locator('.tut-text').first().innerText()).slice(0, 60);
    const line = text.replace(/\s+/g, ' ') + ' | ' + title + ' | ' + JSON.stringify(rs.ring);
    if (line !== lastLine) console.log('  ', line);
    lastLine = line;
    if (/Закончить/.test(await page.locator('.tut-btns').innerText())) {
      await shot('done');
      break;
    }
    if (st.n < last) console.log('   (номер откатился', last, '→', st.n, ')');
    last = st.n;
    if (!st.done && st.n > st.total) bad(`номер больше «М»: ${text}`);
    const needsRing = !/Сегодня повторять пока нечего/.test(title);
    if (needsRing && !rs.ring) bad(`нет рамки на шаге «${title}»`);
    if (rs.cardOut) bad(`плашка вылезла за экран на шаге «${title}»`);
    if (rs.overlap > 15) bad(`плашка закрывает ${rs.overlap}% подсвеченного на шаге «${title}»`);
    if (rs.ring && rs.hit && rs.hit !== 'ok') bad(`в середине рамки лежит не то (${rs.hit}) на шаге «${title}»`);
    await shot('s' + st.n);
    // что делать на этом шаге
    const modalInput = page.locator('.modal input.input, .modal input[type="text"], .modal input:not([type])').first();
    const dlgTitle = await page.locator('.modal h2').first().innerText().catch(() => '');
    if (/Новый предмет|Новая тема/.test(dlgTitle) && (await modalInput.count())) {
      await modalInput.fill(/предмет/.test(dlgTitle) ? 'Биология' : '§1 Клетка');
      await page.locator('.modal button.primary, .modal .btn.primary').first().click();
    } else if (/Напиши в конспекте/.test(title)) {
      await page.locator('.ProseMirror').first().click();
      await page.keyboard.type('Клетка — основа жизни всех организмов.');
    } else if (/Сделай карточку|Заполни вопрос|Теперь повторение|Закрой это окно|Сегодня повторять/.test(title)) {
      await page.getByRole('button', { name: 'Пропустить шаг' }).click();
    } else if (rs.ring) await tap(rs.cx, rs.cy);
    else await page.getByRole('button', { name: 'Пропустить шаг' }).click();
  }
  if (seen.length < 8) bad(`в знакомстве мало разных номеров шагов: ${seen.join(',')}`);
  if (errors.length) bad('ошибки в консоли: ' + errors.slice(0, 3).join(' | '));
  await ctx.close();

  if (process.env.SKIP2) return; // SKIP2=1 — без второго прохода (быстрее)
  // Второй проход: только «Пропустить шаг» — не должно застревать и ломаться.
  const ctx2 = await browser.newContext(DEVICES[dev]);
  const p2 = await ctx2.newPage();
  await start(p2, style);
  let reached = false;
  for (let i = 0; i < 12; i++) {
    await p2.waitForTimeout(500);
    if (await p2.getByRole('button', { name: 'Закончить' }).count()) { reached = true; break; }
    await p2.getByRole('button', { name: 'Пропустить шаг' }).click({ timeout: 3000 }).catch(() => {});
  }
  if (!reached) bad('«Пропустить шаг» не довёл до «Готово»');
  await ctx2.close();
}

for (const dev of devs) for (const style of styles) {
  console.log(dev, style);
  try {
    await run(dev, style);
  } catch (e) {
    problems.push(`${dev}/${style}: упало: ${String(e.message).split("\n").slice(0,12).join(" | ")}`);
    console.log('  !! упало:', String(e.message).split('\n')[0]);
  }
}
await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/problems.txt`, problems.join('\n') + '\n');
console.log(problems.length ? `\nПроблем: ${problems.length} (список — ${OUT}/problems.txt)` : '\nВсё чисто');
process.exitCode = problems.length ? 1 : 0;
