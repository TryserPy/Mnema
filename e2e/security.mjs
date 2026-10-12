// Партия «защита» (1.10): вредный рисунок и поддельный блок формулы в карточке не действуют; чужая копия при «Восстановить» не включает моды и не подменяет облако.
// Запуск: URL=http://localhost:4174 NODE_PATH=$(npm root -g) node e2e/security.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const problems = [];
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) problems.push(msg); };

// Данные приложения лежат в IndexedDB (mnema-web / kv / data) и пишутся с задержкой — читаем и пишем их напрямую.
const idbGet = (pg) => pg.evaluate(() => new Promise((res) => { const r = indexedDB.open('mnema-web', 1); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('data'); g.onsuccess = () => res(JSON.parse(g.result)); }; }));
const idbPut = (pg, d) => pg.evaluate((json) => new Promise((res) => { const r = indexedDB.open('mnema-web', 1); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(json, 'data'); t.oncomplete = () => res(); }; }), JSON.stringify(d));

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { try { sessionStorage.setItem('mnema-web-test-ok', '1'); } catch { /* без хранилища */ } }); // окно «только для тестов» онлайн-версии
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
const forge = (mark) => `${mark}<span class="katex"><span class="rlap"><span class="katex-inner" data-forged="1" style="top:-400px;left:-500px;width:1200px;height:800px;background-color:#ffffff;color:#000000">Поддельное окно <a href="https://phish.example">войти</a></span></span></span>${mark ? '</span>' : ''}`;
const evilBack = `![x](data:image/svg+xml;base64,${b64})\n\n<div class="math-block"><div data-fake="1" style="position:fixed;inset:0;z-index:99999;background:red">ПОДДЕЛКА</div></div>\n\n${forge('')}\n\n${forge('<span data-mk="0123456789abcdef0123456789abcdef">')}\n\n$$x\\rlap{=}y + \\overbrace{a+b}^{n}$$`;
await page.waitForTimeout(800);
{
  const d = await idbGet(page);
  for (const c of d.cards) c.back = evilBack;
  await idbPut(page, d);
}
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
  rectStyle: document.querySelector('.drawing-inline rect')?.getAttribute('style') ?? null,
  // С1: руками написанный <span class="katex"> не рисует поддельное окно; метка формулы из текста снимается; настоящая формула рисуется как раньше
  forged: [...document.querySelectorAll('[data-forged]')].map((e) => ({ pos: getComputedStyle(e).position, style: e.getAttribute('style'), cls: e.getAttribute('class') })),
  marks: document.querySelectorAll('[data-mk]').length,
  realInner: [...document.querySelectorAll('.katex .rlap > .katex-inner')].map((e) => getComputedStyle(e).position),
  realBrace: document.querySelectorAll('.katex .brace-center').length,
  // contain:paint: даже position:absolute, добавленный скриптом, остаётся в рамке конспекта
  clip: (() => {
    const md = document.querySelector('.md');
    const x = document.createElement('div');
    x.id = 'probe-abs';
    x.style.cssText = 'position:absolute;left:-2000px;top:-2000px;width:5000px;height:5000px;background:red';
    md.appendChild(x);
    const hit = document.elementFromPoint(5, 5);
    x.remove();
    return { hitProbe: hit?.id === 'probe-abs', contain: getComputedStyle(md).contain };
  })()
}));
console.log('   ', JSON.stringify(r));
ok(r.outline === '0px', 'глобальный <style> из рисунка не действует (у body нет рамки)');
ok(!r.fakeFixed, 'поддельный блок внутри math-block не стал position:fixed');
ok(r.fakeStyleAttr === null, 'style у поддельного блока вырезан');
ok(r.forged.length >= 2 && r.forged.every((f) => f.pos !== 'absolute' && f.style === null && f.cls === null), 'C1: поддельный katex-inner из текста (и с выдуманной меткой) не абсолютный, без class и style');
ok(r.marks === 0, 'C1: метка формулы в разметке не остаётся');
ok(r.realInner.length >= 1 && r.realInner.every((p) => p === 'absolute') && r.realBrace >= 1, 'C1: настоящие \\rlap и \\overbrace рисуются как раньше');
ok(/paint/.test(r.clip.contain) && !r.clip.hitProbe, 'C1: .md {contain: paint} — абсолютный блок внутри конспекта не перекрывает остальное окно');
ok(r.drawing >= 1 && r.paths >= 2, 'настоящий рисунок Refrain (svg, pattern, path, rect) по-прежнему рисуется');
ok(r.styleTags === 0 && r.rectStyle === null, 'в рисунке нет <style> и атрибута style');

// ---- 1б. Н9: окно плеера видео — iframe с sandbox, без перехода верхнего окна; полный экран остаётся
{
  const d = await idbGet(page);
  for (const c of d.cards) c.back = 'Видео:\n\n![video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)';
  await idbPut(page, d);
  await page.reload();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Учиться/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Показать ответ' }).click();
  await page.waitForTimeout(400);
  await page.locator('.ve-cover').first().click();
  await page.waitForTimeout(300);
  const fr = await page.evaluate(() => { const f = document.querySelector('.video-embed iframe'); return f ? { sandbox: f.getAttribute('sandbox'), allow: f.getAttribute('allow'), fs: f.hasAttribute('allowfullscreen') } : null; });
  console.log('   ', JSON.stringify(fr));
  ok(fr !== null, 'Н9: плеер видео открылся (iframe)');
  const sb = new Set((fr?.sandbox ?? '').split(/\s+/));
  ok(['allow-scripts', 'allow-same-origin', 'allow-presentation', 'allow-popups', 'allow-popups-to-escape-sandbox'].every((t) => sb.has(t)), 'Н9: у iframe плеера есть sandbox с нужным плееру (скрипты, презентация, всплывающие окна)');
  ok(!sb.has('allow-top-navigation') && !sb.has('allow-forms') && !sb.has('allow-modals') && !sb.has('allow-downloads'), 'Н9: плеер не может увести окно Refrain, слать формы, показывать alert и качать файлы');
  ok(/fullscreen/.test(fr?.allow ?? '') && fr?.fs === true, 'Н9: полный экран у плеера сохранён (allow=fullscreen, allowfullscreen)');
  await page.keyboard.press('Escape');
}

// ---- 2. «Восстановить из копии» с чужим облаком и включёнными модами
const own = await idbGet(page);
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
await page.waitForTimeout(800);
const after = await idbGet(page).then((d) => ({ cloud: d.settings.cloud, safe: d.settings.pluginsSafe, plugins: (d.settings.plugins ?? []).length, title: '' }));
after.title = await page.title();
console.log('   ', JSON.stringify(after));
ok(after.cloud === null, 'облако из чужой копии не подключилось');
ok(after.safe === true, 'безопасный режим модов включён');
ok(after.title !== 'ВЗЛОМ', 'код мода из чужой копии не запустился');
const msg = await page.locator('.hint, .toast, [role=status]').allInnerTexts().catch(() => []);
console.log('    сообщение:', msg.filter((t) => /Не перенесено|восстановлены/.test(t)).join(' | ').slice(0, 200));

await browser.close();
console.log(problems.length ? 'ПРОБЛЕМЫ:\n' + problems.join('\n') : 'ВСЁ ВЕРНО');
process.exit(problems.length ? 1 : 0);
