import { createRequire } from 'module'; const { chromium } = createRequire('/usr/local/lib/node_modules_global/')('playwright');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
for (const W of [1100, 380]) {
  const p = await b.newPage({ viewport: { width: W, height: 1400 } });
  p.on('pageerror', (e) => errs.push(W + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(W + ' console: ' + m.text()); });
  await p.goto('http://localhost:4190/tmp-prompts.html');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `p${W}a.png`, fullPage: true });
  await p.getByRole('button', { name: 'Сделать свой на его основе' }).click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: '{{предмет}}' }).click();
  await p.getByRole('button', { name: 'Проверить на странице' }).click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: `p${W}b.png`, fullPage: true });
  const asked = await p.evaluate(() => window.__asked.map((r) => r.system.slice(0, 120) + ' … ' + r.system.slice(-80)));
  console.log(W, JSON.stringify(asked));
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log('overflow', over);
}
console.log('errors', errs);
await b.close();
