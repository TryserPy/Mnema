// 1.8.2: меню в боковой панели (правая кнопка и «⋯» у темы, предмета, папки) открываются рядом с точкой нажатия.
// Раньше fitInView стирала inline left/top у fixed-меню, и оно уезжало в левый верхний угол панели.
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/ctxmenu.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
let bad = 0;

async function run(vw, vh, label) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
  await page.getByRole('button', { name: 'Посмотреть на примере' }).click();
  await page.waitForTimeout(500);
  // Раскрыть все предметы, чтобы были темы.
  for (let i = 0; i < 6; i++) {
    const tw = page.locator('.tree-row .twisty:not(.open):not(.leaf)').first();
    if (!(await tw.count())) break;
    await tw.click();
    await page.waitForTimeout(120);
  }
  const check = async (what, getPoint, open) => {
    const p = await getPoint();
    await open();
    await page.waitForTimeout(450); // анимация + два пересчёта (rAF и 200 мс)
    const m = page.locator('.menu.ctx').first();
    const shown = await m.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false);
    const box = shown ? await m.boundingBox() : null;
    if (!box) {
      console.log(`✗ ${label} ${what}: меню не открылось`);
      bad++;
      return;
    }
    // «Рядом»: точка нажатия лежит у самого меню (не дальше 30 px), и меню целиком в окне.
    const touches = p.x >= box.x - 30 && p.x <= box.x + box.width + 30 && p.y >= box.y - 30 && p.y <= box.y + box.height + 30;
    const inside = box.x >= -1 && box.y >= -1 && box.x + box.width <= vw + 1 && box.y + box.height <= vh + 1;
    if (!touches || !inside) {
      console.log(`✗ ${label} ${what}: точка (${Math.round(p.x)},${Math.round(p.y)}), меню (${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)})`);
      await page.screenshot({ path: `${OUT}/ctx-${label}-${what.replace(/\W+/g, '_')}.png` });
      bad++;
    } else console.log(`✓ ${label} ${what}: меню (${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}) у точки (${Math.round(p.x)},${Math.round(p.y)})`);
    await page.keyboard.press('Escape');
    await page.mouse.click(vw - 5, vh - 5);
    await page.waitForTimeout(250);
  };

  const topicRows = page.locator('.tree-row:not(.subject):not(.folder)');
  const n = await topicRows.count();
  const rowAt = (i) => topicRows.nth(Math.min(i, n - 1));
  for (const idx of [0, Math.floor(n / 2), n - 1]) {
    await rowAt(idx).scrollIntoViewIfNeeded();
    await check(
      `тема#${idx} правая кнопка`,
      async () => {
        const b = await rowAt(idx).boundingBox();
        return { x: b.x + 40, y: b.y + b.height / 2 };
      },
      async () => {
        const b = await rowAt(idx).boundingBox();
        await page.mouse.click(b.x + 40, b.y + b.height / 2, { button: 'right' });
      }
    );
    await rowAt(idx).scrollIntoViewIfNeeded();
    await check(
      `тема#${idx} «⋯»`,
      async () => {
        await rowAt(idx).hover();
        const b = await rowAt(idx).locator('.row-more').boundingBox();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      },
      async () => {
        await rowAt(idx).hover();
        await rowAt(idx).locator('.row-more').click();
      }
    );
  }
  const subj = page.locator('.tree-row.subject').first();
  await subj.scrollIntoViewIfNeeded();
  await check(
    'предмет правая кнопка',
    async () => {
      const b = await subj.boundingBox();
      return { x: b.x + 40, y: b.y + b.height / 2 };
    },
    async () => {
      const b = await subj.boundingBox();
      await page.mouse.click(b.x + 40, b.y + b.height / 2, { button: 'right' });
    }
  );
  await page.close();
}

await run(1280, 800, '1280x800');
await run(1280, 520, '1280x520');
await run(900, 700, '900x700');
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
