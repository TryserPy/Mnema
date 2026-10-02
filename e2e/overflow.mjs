// Обход экранов на разных ширинах: ищет текст, вылезающий за рамки, и элементы за краем экрана.
import { chromium } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT || 'ovf'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const widths = (process.env.W || '1280,900,380').split(',').map(Number);
const errors = [];
for (const W of widths) {
  const mobile = W < 700;
  const p = await b.newPage({ viewport: { width: W, height: 820 }, isMobile: mobile, hasTouch: mobile });
  p.on('pageerror', (e) => errors.push(W + ': ' + e.message));
  await p.goto('http://localhost:4174');
  await p.getByRole('button', { name: 'Посмотреть на примере' }).click();
  await p.waitForTimeout(400);
  // длинные имена — стресс-тест
  await p.evaluate(() => { const s = window.__mnemaStore; });
  const check = async (tag) => {
    await p.waitForTimeout(450);
    const r = await p.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const out = [];
      const vis = (e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length; };
      for (const e of document.querySelectorAll('body *')) {
        if (!vis(e) || e.closest('.otabs-measure, svg, .katex, .ProseMirror-separator')) continue;
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(e);
        const clipAnc = (() => { let a = e.parentElement; while (a) { const c = getComputedStyle(a); if (c.overflowX !== 'visible' || c.overflow !== 'visible') { const ar = a.getBoundingClientRect(); return ar; } a = a.parentElement; } return null; })();
        if (r.right > W + 1 && (!clipAnc || clipAnc.right > W + 1)) out.push('beyond ' + (e.className || e.tagName) + ' ' + Math.round(r.right));
        // текст шире своего блока (и не обрезан многоточием)
        if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX === 'visible' && cs.textOverflow !== 'ellipsis' && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) out.push('text ' + (e.className || e.tagName) + ' «' + e.textContent.trim().slice(0, 24) + '» ' + e.scrollWidth + '>' + e.clientWidth);
        // текст, сжатый в узкий столбик (по букве-две в строке)
        const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ');
        if (own.length >= 8 && r.width < 70 && r.height > parseFloat(cs.lineHeight || '20') * 2.6) out.push('squeezed ' + (e.className || e.tagName) + ' «' + own.slice(0, 20) + '» w=' + Math.round(r.width));
        // ребёнок вылезает за карточку
        if (e.matches('.card, .modal, .srow, .feat-tile, .style-item, .rule-card, .hw-row, .topic-row, .les-card, .menu')) {
          for (const c of e.children) { const cr = c.getBoundingClientRect(); if (cr.width && cr.right > r.right + 2 && getComputedStyle(e).overflow === 'visible') out.push('child-out ' + e.className + ' > ' + (c.className || c.tagName)); }
        }
      }
      return [...new Set(out)].slice(0, 12);
    });
    if (r.length) console.log(`[${W}] ${tag}:`, r.join(' | '));
    if (process.env.SHOTS) await p.screenshot({ path: `${OUT}/${W}-${tag}.png` });
  };
  const nav = async (label) => {
    if (mobile) { await p.locator('.mobile-bar button').first().click(); await p.waitForTimeout(300); }
    await p.locator(`.nav-item:has-text("${label}"), .side-foot button[aria-label="${label}"], .side-foot button[title^="${label}"]`).first().click();
  };
  await check('today');
  await nav('Домашка'); await check('homework');
  if (mobile) { await p.locator('.mobile-bar button').first().click(); await p.waitForTimeout(300); }
  await p.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.tree-label').click();
  await check('subject');
  await p.getByRole('radio', { name: /Правила/ }).click().catch(() => {});
  await check('rules');
  await p.getByRole('radio', { name: /Темы/ }).click().catch(() => {});
  await p.locator('.topic-row').first().click();
  await check('topic');
  await p.locator('.otab', { hasText: 'Карточки' }).first().click().catch(() => {});
  await check('cards');
  await nav('Статистика'); await check('stats');
  for (const t of ['Достижения', 'Сад знаний']) { await p.getByRole('radio', { name: t }).click().catch(() => {}); await check('stats-' + t); }
  await nav('Настройки'); await check('settings');
  const secs = await p.locator('.set-nav-item').allInnerTexts();
  for (const s of secs) {
    await p.locator('.set-nav-item', { hasText: s.trim() }).first().click();
    await check('set-' + s.trim());
    const back = p.locator('.set-back').first();
    if (await back.count()) await back.click().catch(() => {});
  }
  await nav('Справка'); await check('help');
  await p.close();
}
console.log('errors', JSON.stringify(errors));
await b.close();
