// Android-часть в Chromium: страница из APK-ассетов по https://mnema.app, поддельный мост MnemaAndroid.
import { chromium, _electron as electron } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { execSync } from 'child_process';
const OUT = process.env.OUT;
const WWW = process.cwd() + '/android/build/assets/www';
const step = (s) => console.log('•', s);
const errors = [];
// Настройки по разделам; на телефоне — список → раздел. Строка «название — кнопка» — .srow
const rowBtn = (w, label, btn) => w.locator('.srow', { has: w.locator('.srow-label', { hasText: new RegExp('^' + label + '$') }) }).getByRole('button', { name: btn });

// Поддельные сервисы: ИИ (OpenAI-совместимый) и WebDAV.
const files = new Map();
const davLog = [];
const AUTH = 'Basic ' + Buffer.from('ученик:app-pass').toString('base64');
const srv = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const u = decodeURIComponent(req.url);
    if (u.startsWith('/v1')) {
      res.setHeader('content-type', 'application/json');
      if (u.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'm' }] }));
      return res.end(JSON.stringify({ choices: [{ message: { content: 'Ответ ИИ: ' + (req.headers.authorization || '') } }] }));
    }
    davLog.push(`${req.method} ${u}`);
    if (req.headers.authorization !== AUTH) return (res.statusCode = 401), res.end('Unauthorized');
    if (req.method === 'MKCOL') return (res.statusCode = 201), res.end();
    if (req.method === 'PUT') return files.set(u, Buffer.concat(chunks).toString('utf8')), (res.statusCode = 201), res.end();
    if (req.method === 'GET') return files.has(u) ? res.end(files.get(u)) : ((res.statusCode = 404), res.end('nf'));
    res.statusCode = 405;
    res.end();
  });
});
await new Promise((r) => srv.listen(5620, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.gz': 'application/gzip', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const served = [];
await ctx.route('https://mnema.app/**', (route) => {
  let p = new URL(route.request().url()).pathname;
  if (p === '/') p = '/index.html';
  const f = p === '/test-page.jpg' ? process.cwd() + '/test-fixtures/page47.jpg' : path.join(WWW, decodeURIComponent(p));
  served.push(p);
  if (!f.startsWith(WWW) && !f.endsWith('page47.jpg')) return route.fulfill({ status: 404 });
  if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
  route.fulfill({ status: 200, contentType: MIME[path.extname(f)] ?? 'application/octet-stream', body: fs.readFileSync(f) });
});
const saved = [];
await ctx.exposeFunction('__nodeHttp', async (reqJson) => {
  const r = JSON.parse(reqJson);
  try {
    const body = r.body == null ? undefined : r.bodyBase64 ? Buffer.from(r.body, 'base64') : r.body;
    const res = await fetch(r.url, { method: r.method, headers: r.headers, body, signal: AbortSignal.timeout(r.timeout) });
    return JSON.stringify({ status: res.status, text: await res.text() });
  } catch (e) {
    return JSON.stringify({ status: 0, error: String(e.cause?.code || e.message) });
  }
});
await ctx.exposeFunction('__nodeSaveFile', async (name, mime, b64) => {
  const p = '/tmp/android-saved-' + saved.length + '-' + name.replace(/\s+/g, '_');
  fs.writeFileSync(p, Buffer.from(b64, 'base64'));
  saved.push({ name, mime, p });
});
await ctx.addInitScript(() => {
  const results = {};
  const done = (id, r) => {
    results[id] = r;
    setTimeout(() => window.__mnemaNative.done(id), 0);
  };
  window.MnemaAndroid = {
    load: () => localStorage.getItem('fake:data'),
    save: (j) => (localStorage.setItem('fake:data', j), (window.__saves = (window.__saves || 0) + 1), true),
    take: (id) => {
      const r = results[id];
      delete results[id];
      return r ?? 'null';
    },
    http: (id, req) => void window.__nodeHttp(req).then((r) => done(id, r)),
    prefGet: (n) => localStorage.getItem('pref:' + n),
    prefSet: (n, v) => (v ? localStorage.setItem('pref:' + n, v) : localStorage.removeItem('pref:' + n)),
    encrypt: (t) => (t ? btoa(unescape(encodeURIComponent('K' + t))) : ''),
    decrypt: (t) => {
      try {
        const s = decodeURIComponent(escape(atob(t)));
        return s[0] === 'K' ? s.slice(1) : '';
      } catch {
        return '';
      }
    },
    saveFile: (id, name, mime, b64) => void window.__nodeSaveFile(name, mime, b64).then(() => done(id, '{"ok":true}')),
    speechStart: (lang) => {
      window.__speechLang = lang;
      setTimeout(() => window.__mnemaSpeech?.({ type: 'partial', text: 'Сила тока равна' }), 300);
      return '{"ok":true}';
    },
    speechStop: () =>
      setTimeout(() => {
        window.__mnemaSpeech?.({ type: 'final', text: 'Сила тока равна напряжению, делённому на сопротивление' });
        window.__mnemaSpeech?.({ type: 'end' });
      }, 200),
    appVersion: () => '1.3.0'
  };
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
await page.goto('https://mnema.app/index.html');
step('platform: ' + (await page.evaluate(() => window.mnemaApi?.platform)));
await page.getByRole('button', { name: 'Посмотреть на примере' }).click();
await page.waitForTimeout(1500);
step('saved via bridge: ' + (await page.evaluate(() => window.__saves)));
await page.reload();
await page.waitForTimeout(800);
step('after reload welcome shown: ' + (await page.getByRole('button', { name: 'Посмотреть на примере' }).count()));
await page.screenshot({ path: OUT + '/a1-today.png' });

step('DBG subjects stored=' + (await page.evaluate(() => (JSON.parse(localStorage.getItem('fake:data') || '{}').subjects || []).length)) + ' dom=' + (await page.locator('.tree-row.subject').count()) + ' welcome=' + (await page.getByRole('button', { name: 'Посмотреть на примере' }).count()));
// Назад (кнопка телефона)
await page.getByRole('button', { name: 'Знания' }).click();
await page.waitForTimeout(300);
const b1 = await page.evaluate(() => window.__mnemaBack());
await page.waitForTimeout(300);
step(`back closes drawer: ${b1}, drawer open after: ${await page.locator('.drawer-open, .sidebar.open').count()}`);
step('back on root: ' + (await page.evaluate(() => window.__mnemaBack())));

step('DBG subjects stored=' + (await page.evaluate(() => (JSON.parse(localStorage.getItem('fake:data') || '{}').subjects || []).length)) + ' dom=' + (await page.locator('.tree-row.subject').count()) + ' welcome=' + (await page.getByRole('button', { name: 'Посмотреть на примере' }).count()));
// ИИ через мост
const cfg = await page.evaluate(() => window.mnemaApi.aiSaveCustom({ name: 'Тест', format: 'openai', baseUrl: 'http://127.0.0.1:5620/v1', model: 'm', vision: true, auth: 'bearer', headers: '', key: 'sk-secret123', select: true }));
console.log(JSON.stringify(cfg).slice(0,300)); const pref = String(await page.evaluate(() => localStorage.getItem('pref:ai')));
step(`ai saved ${cfg.ok}; key stored encrypted: ${pref.includes('ks:') && !pref.includes('sk-secret123')}`);
step('ai ask: ' + JSON.stringify(await page.evaluate(() => window.mnemaApi.aiAsk({ text: 'привет' }))));
step('ai models: ' + JSON.stringify(await page.evaluate(() => window.mnemaApi.aiProbe({ provider: 'custom:' + '' }).catch((e) => String(e)))).slice(0, 160));

step('DBG subjects stored=' + (await page.evaluate(() => (JSON.parse(localStorage.getItem('fake:data') || '{}').subjects || []).length)) + ' dom=' + (await page.locator('.tree-row.subject').count()) + ' welcome=' + (await page.getByRole('button', { name: 'Посмотреть на примере' }).count()));
// Голос
await page.getByRole('button', { name: 'Знания' }).click();
await page.locator('.foot-btn[aria-label="Возможности"]').click();
await page.getByRole('switch', { name: 'Ответ голосом' }).click();
await page.getByRole('button', { name: 'Знания' }).click();
await page.waitForTimeout(500); await page.screenshot({ path: OUT + '/a-dbg.png' });
await page.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
await page.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Учить/ }).first().click();
await page.getByRole('button', { name: /Ответить голосом/ }).click();
await page.waitForTimeout(700);
step('voice partial: ' + (await page.locator('.voice-box').innerText()).replace(/\n/g, ' '));
await page.screenshot({ path: OUT + '/a2-voice.png' });
await page.locator('.voice-rec').click();
await page.locator('.voice-box.done').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: 'Показать ответ' }).click();
await page.waitForTimeout(300);
step('voice compare: ' + (await page.locator('.voice-box.done').innerText()).replace(/\n/g, ' ') + ' lang=' + (await page.evaluate(() => window.__speechLang)));
await page.screenshot({ path: OUT + '/a3-voice-done.png' });
await page.getByRole('button', { name: 'Закончить' }).click().catch(() => page.keyboard.press('Escape'));
await page.waitForTimeout(300);

// Облако
await page.getByRole('button', { name: 'Знания' }).click();
await page.getByRole('button', { name: 'Настройки', exact: true }).click();
await page.locator('.set-nav-item', { hasText: 'Данные' }).click();
await rowBtn(page, 'Облако', /Подключить|Настроить/).click();
const m = page.locator('.modal');
await m.locator('select.input').selectOption({ label: 'Nextcloud / другой WebDAV' });
await m.getByLabel('Адрес WebDAV', { exact: true }).fill('http://127.0.0.1:5620/dav');
await m.getByLabel('Логин').fill('ученик');
await m.locator('input[type=password]').first().fill('app-pass');
await m.getByRole('switch', { name: 'Шифровать' }).click();
await m.locator('input[type=password]').nth(1).fill('мой-шифр');
await m.getByRole('button', { name: 'Синхронизировать сейчас' }).click();
await m.locator('.hint.ok:has-text("Готово"), .hint.warn').waitFor({ timeout: 30000 });
step('cloud: ' + (await m.locator('.hint').innerText()) + ' | ' + davLog.join(', '));
await page.screenshot({ path: OUT + '/a4-cloud.png' });
const cloudPref = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('pref:secret')).map((k) => k + '=' + localStorage.getItem(k).slice(0, 12)));
step('cloud secrets in prefs (encrypted): ' + cloudPref.join(', '));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// Экспорт в Obsidian (zip)
await rowBtn(page, 'В Obsidian', 'Экспорт').click();
await page.locator('.hint', { hasText: 'Готово' }).waitFor({ timeout: 10000 });
step('obsidian: ' + (await page.locator('.hint', { hasText: 'Готово' }).innerText()));
const zip = saved.find((s) => s.name.endsWith('.zip'));
step('zip: ' + execSync(`unzip -l "${zip.p}" | tail -3 | head -1; unzip -l "${zip.p}" | grep -c "\\.md"`).toString().replace(/\n/g, ' '));

// Резервная копия (скачивание через saveFile)
const backupBtn = rowBtn(page, 'Сохранить копию', 'Сохранить').first();
if (await backupBtn.count()) {
  await backupBtn.click();
  await page.waitForTimeout(800);
  step('backup saved: ' + saved.map((s) => s.name + ' ' + s.mime).join('; '));
}

// Офлайн-распознавание страницы (Tesseract из /ocr/)
const t0 = Date.now();
const ocr = await page.evaluate(async () => {
  const b = new Uint8Array(await (await fetch('/test-page.jpg')).arrayBuffer());
  const r = await window.mnemaApi.ocrRecognize(b);
  return r.ok ? { ok: true, lines: r.lines.length, sample: r.lines.slice(0, 3).map((l) => l.words.map((w) => w.text).join(' ')) } : r;
});
step(`ocr (${Math.round((Date.now() - t0) / 1000)}s): ` + JSON.stringify(ocr));
step('ocr files served: ' + [...new Set(served.filter((p) => p.startsWith('/ocr/')))].join(', '));

// Синхронизация с настоящей Мнемой для Windows (Electron-сервер)
const pcDir = '/tmp/mnemaPC';
fs.rmSync(pcDir, { recursive: true, force: true });
const pc = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: pcDir } });
const w1 = await pc.firstWindow();
await w1.getByRole('button', { name: /Добавить предмет/ }).first().click();
await w1.getByPlaceholder('Например: Биология').fill('История');
await w1.getByRole('button', { name: 'Создать' }).click();
await w1.waitForTimeout(500);
await w1.getByRole('button', { name: 'Настройки', exact: true }).click();
await w1.locator('.set-nav-item', { hasText: 'Данные' }).click();
await rowBtn(w1, 'Синхронизация по Wi-Fi', 'Открыть').click();
await w1.locator('.sync-qr').waitFor();
const codes = await w1.locator('.big-code').allInnerTexts();
await rowBtn(page, 'Синхронизация по Wi-Fi', 'Открыть').click();
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/a5-sync.png' });
const manualRadio = page.getByRole('radio', { name: 'Ввести код другого' });
if (await manualRadio.count()) await manualRadio.click();
const manualBtn = page.getByRole('button', { name: /Ввести вручную|вручную/ });
if (await manualBtn.count()) await manualBtn.click();
await page.getByLabel('Адрес').fill(codes[0].trim().replace(/^[\d.]+/, '127.0.0.1'));
await page.getByLabel('Код').fill(codes[1].replace(/\D/g, ''));
await page.getByRole('button', { name: 'Синхронизировать' }).click();
await page.locator('.modal .hint.ok, .modal .hint.warn').waitFor({ timeout: 30000 });
step('phone sync: ' + (await page.locator('.modal .hint').innerText()));
await page.screenshot({ path: OUT + '/a6-synced.png' });
await w1.waitForTimeout(1500);
step('pc tree: ' + (await w1.locator('.tree').innerText()).replace(/\n+/g, ' | '));
await pc.close();

const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log('overflow', overflow, 'errors', JSON.stringify(errors));
await browser.close();
srv.close();
