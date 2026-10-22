import { chromium } from '@playwright/test';
import { seed } from '/home/user/Mnema/e2e/v132-seed.mjs';
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [w, h] of [[360, 640], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4174');
  await page.evaluate((data) => {
    sessionStorage.setItem('mnema-web-test-ok', '1');
    sessionStorage.setItem('refrain-no-splash', String(Date.now()));
    localStorage.setItem('mnema-data-pending', JSON.stringify(data));
    localStorage.setItem('refrain-dev', '1');
    localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'subject', id: 'geo' }, at: Date.now() } }));
  }, seed());
  await page.reload();
  await page.getByRole('button', { name: 'Действия с предметом' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/subject-menu-${w}.png` });
  const overl = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.menu [role=menuitem]')].map((b) => [...b.querySelectorAll('span,small')].map((s) => s.getBoundingClientRect()));
    const btns = [...document.querySelectorAll('.menu [role=menuitem]')].map((b) => b.getBoundingClientRect());
    let n = 0; for (let i = 0; i < items.length - 1; i++) for (const r of items[i]) if (r.bottom > btns[i + 1].top + 1) n++;
    const m = document.querySelector('.menu').getBoundingClientRect();
    const tb = document.querySelector('.tabbar')?.getBoundingClientRect();
    return { overlaps: n, menuBottom: m.bottom, tabbarTop: tb?.top, vh: innerHeight };
  });
  console.log(w, JSON.stringify(overl));
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'topic', id: 'g2' }, at: Date.now() } })));
  await page.reload(); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/topic-note-${w}.png` });
  await ctx.close();
}
await browser.close();
