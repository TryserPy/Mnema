// Партия «защита» (1.10): вредный рисунок и поддельный блок формулы в карточке не действуют; чужая копия при «Восстановить» не включает моды и не подменяет облако.
// Запуск: URL=http://localhost:4174 NODE_PATH=$(npm root -g) node e2e/security.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const problems = [];
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) problems.push(msg); };

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push('CSP: ' + m.text().slice(0, 140)); });
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
await page.getByRole('button', { name: 'Посмотреть на примере' }).click();
await page.waitForTimeout(1000);

// ---- 1. Рисунок с <style> и поддельный блок формулы в ответе карточки
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="100" height="100" data-mnema="drawing" data-bg="theme">' +
  '<style>body{outline:9px solid red!important}</style>' +
  '<defs><pattern id="mbg" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M3 0H0V3" fill="none" stroke="#999" stroke-width="0.2"/></pattern></defs>' +
  '<rect width="100%" height="100%" fill="url(#mbg)" style="outline:9px solid red"/><path d="M1 1L9 9" fill="none" stroke="#000" stroke-width="1"/></svg>';
const b64 = Buffer.from(svg, 'utf8').toString('base64');
const evilBack = `![x](data:image/svg+xml;base64,${b64})\n\n<div class="math-block"><div data-fake="1" style="position:fixed;inset:0;z-index:99999;background:red">ПОДДЕЛКА</div></div>`;
await page.evaluate((back) => {
  const d = JSON.parse(localStorage.getItem('mnema-data'));
  for (const c of d.cards) c.back = back;
  localStorage.setItem('mnema-data', JSON.stringify(d));
}, evilBack);
await page.reload();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /Учиться/ }).first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Показать ответ' }).click();
await page.waitForTimeout(500);
const r = await page.evaluate(() => ({
  outline: getComputedStyle(document.body).outlineWidth,
  fakeFixed: [...document.querySelectorAll('[data-fake]')].some((e) => getComputedStyle(e).position === 'fixed'),
  fakeStyleAttr: document.querySelector('[data-fake]')?.getAttribute('style') ?? null,
  drawing: document.querySelectorAll('.drawing-inline svg').length,
  paths: document.querySelectorAll('.drawing-inline svg path').length,
  styleTags: document.querySelectorAll('.drawing-inline style, .md-drawing style').length,
  rectStyle: document.querySelector('.drawing-inline rect')?.getAttribute('style') ?? null
}));
console.log('   ', JSON.stringify(r));
ok(r.outline === '0px', 'глобальный <style> из рисунка не действует (у body нет рамки)');
ok(!r.fakeFixed, 'поддельный блок внутри math-block не стал position:fixed');
ok(r.fakeStyleAttr === null, 'style у поддельного блока вырезан');
ok(r.drawing >= 1 && r.paths >= 2, 'настоящий рисунок Мнемы (svg, pattern, path, rect) по-прежнему рисуется');
ok(r.styleTags === 0 && r.rectStyle === null, 'в рисунке нет <style> и атрибута style');

// ---- 2. «Восстановить из копии» с чужим облаком и включёнными модами
const own = await page.evaluate(() => JSON.parse(localStorage.getItem('mnema-data')));
own.settings.cloud = { url: 'https://evil.example', user: 'x', folder: 'f', encrypt: false, auto: true };
own.settings.pluginsSafe = false;
own.settings.features = { ...own.settings.features, mods: true };
own.settings.plugins = [{ id: 'p', name: 'Чужой', version: '1', description: '', code: 'export default { onload(){ document.title = "ВЗЛОМ" } }', enabled: true }];
const f = '/tmp/evil-copy.json';
fs.writeFileSync(f, JSON.stringify(own));
await page.keyboard.press('Escape');
await page.locator('.foot-btn[aria-label="Настройки"]').click();
await page.waitForTimeout(400);
await page.locator('.set-nav-item', { hasText: 'Данные' }).click();
await page.waitForTimeout(300);
await page.locator('input[type=file][accept="application/json,.json"]').first().setInputFiles(f);
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
await page.waitForTimeout(1200);
const after = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('mnema-data')); return { cloud: d.settings.cloud, safe: d.settings.pluginsSafe, plugins: (d.settings.plugins ?? []).length, title: document.title }; });
console.log('   ', JSON.stringify(after));
ok(after.cloud === null, 'облако из чужой копии не подключилось');
ok(after.safe === true, 'безопасный режим модов включён');
ok(after.title !== 'ВЗЛОМ', 'код мода из чужой копии не запустился');
const msg = await page.locator('.hint, .toast, [role=status]').allInnerTexts().catch(() => []);
console.log('    сообщение:', msg.filter((t) => /Не перенесено|восстановлены/.test(t)).join(' | ').slice(0, 200));

await browser.close();
console.log(problems.length ? 'ПРОБЛЕМЫ:\n' + problems.join('\n') : 'ВСЁ ВЕРНО');
process.exit(problems.length ? 1 : 0);
