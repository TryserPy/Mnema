// Заголовки страниц не ломаются посреди слова (баг с видео автора: «Настройк / и» в стиле «Классический»).
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/heading.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
for (const style of ['modern', 'classic']) {
  for (const [w, h] of [[1280, 720], [1100, 700], [960, 700], [1600, 900]]) {
    for (const scale of [1, 1.15, 1.3]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(URL);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
      await page.getByRole('button', { name: 'Посмотреть на примере' }).click();
      await page.waitForTimeout(1000); // данные сохраняются с задержкой 400 мс
      await page.evaluate(([st, sc]) => {
        const k = Object.keys(localStorage).find((x) => { try { const v = JSON.parse(localStorage.getItem(x)); return v && Array.isArray(v.subjects); } catch { return false; } });
        if (!k) throw new Error('нет данных приложения в localStorage: ' + Object.keys(localStorage).join(','));
        const d = JSON.parse(localStorage.getItem(k));
        d.settings.look = st === 'classic' ? { ...d.settings.look, style: 'classic', font: 'literata', headFont: 'literata' } : { ...d.settings.look, style: 'modern' };
        d.settings.fontScale = sc;
        d.settings.theme = 'dark';
        localStorage.setItem(k, JSON.stringify(d));
      }, [style, scale]);
      await page.reload();
      await page.waitForTimeout(400);
      await page.locator('.foot-btn[aria-label="Настройки"]').click();
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const e = document.querySelector('.settings-page h1.display, .settings-page .display, h1.display');
        if (!e) return null;
        const cs = getComputedStyle(e);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        return { lines: Math.round(e.getBoundingClientRect().height / lh), w: Math.round(e.getBoundingClientRect().width), sw: e.scrollWidth, cw: e.clientWidth, fs: cs.fontSize, ff: cs.fontFamily.slice(0, 30) };
      });
      const over = await page.evaluate(() => { const m = document.querySelector('.main'); return document.documentElement.scrollWidth > window.innerWidth + 1 || (m ? m.scrollWidth > m.clientWidth + 1 : false); });
      const broken = !r || r.lines > 1 || r.sw > r.cw + 1 || over;
      if (over) console.log('  (горизонтальная прокрутка страницы!)');
      console.log(`${broken ? '✗' : '✓'} ${style} ${w}px шрифт×${scale}: ${JSON.stringify(r)}`);
      if (broken) { bad++; await page.screenshot({ path: `${OUT}/heading-${style}-${w}-${scale}.png` }); }
      await page.close();
    }
  }
}
await browser.close();
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
