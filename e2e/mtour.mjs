// Телефонный обзор: настройки, возможности, домашка, предмет, тема, сад. Ищет переполнения.
import { chromium } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT || 'mtour';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 380, height: 780 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:4174');
await p.getByRole('button', { name: 'Посмотреть на примере' }).click();
await p.waitForTimeout(500);
const over = async (tag) => {
  const r = await p.evaluate(() => {
    const W = innerWidth;
    const out = [];
    for (const e of document.querySelectorAll('.main *, .modal *')) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > W + 1 && !e.closest('.otabs-measure')) out.push('beyond:' + (e.className?.baseVal ?? e.className) + ':' + Math.round(r.right));
      else if (e.scrollWidth > e.clientWidth + 2 && cs.overflowX === 'visible' && e.children.length === 0 && e.textContent.trim()) out.push('text:' + e.className + ':' + e.textContent.slice(0, 30));
    }
    return [...new Set(out)].slice(0, 8);
  });
  if (r.length) console.log('OVER', tag, JSON.stringify(r));
};
const shot = async (n) => { await p.waitForTimeout(450); await over(n); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };
const menu = async () => { await p.locator('.tab', { hasText: 'Знания' }).click(); await p.waitForTimeout(350); await p.getByRole('button', { name: 'Все темы списком' }).click(); await p.waitForTimeout(350); };
await shot('01-today');
await menu();
await shot('02-drawer');
await p.locator('.side-foot button[aria-label="Настройки"], .side-foot button[title="Настройки"]').first().click().catch(async () => { await p.getByRole('button', { name: 'Настройки', exact: true }).click(); });
await shot('03-settings');
for (const sec of (process.env.SECS || 'Оформление,Возможности,Моды,Данные').split(',')) {
  const it = p.locator('.set-nav-item', { hasText: sec }).first();
  if (!(await it.count())) { console.log('no section', sec); continue; }
  await it.click();
  await shot('04-set-' + sec);
  const back = p.getByRole('button', { name: /Назад|Все настройки/ }).first();
  if (await back.count()) await back.click();
}
await menu();
await p.locator('.nav-item', { hasText: 'Домашка' }).click();
await shot('05-homework');
await menu();
await p.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.tree-label').click();
await shot('06-subject');
await p.locator('.topic-row').first().click();
await shot('07-topic');
console.log('errors', JSON.stringify(errors));
await b.close();
