// Облако WebDAV: две копии Мнемы синхронизируются через поддельный WebDAV, с шифрованием.
import { _electron as electron } from 'playwright';
import fs from 'fs';
import http from 'http';
const OUT = process.env.OUT;
const files = new Map();
const log = [];
const AUTH = 'Basic ' + Buffer.from('ученик:app-pass').toString('base64');
const srv = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    log.push(`${req.method} ${decodeURIComponent(req.url)}`);
    if (req.headers.authorization !== AUTH) return (res.statusCode = 401), res.end('Unauthorized');
    const u = decodeURIComponent(req.url);
    if (req.method === 'MKCOL') return (res.statusCode = 201), res.end();
    if (req.method === 'PUT') return files.set(u, Buffer.concat(chunks).toString('utf8')), (res.statusCode = 201), res.end();
    if (req.method === 'GET') {
      if (!files.has(u)) return (res.statusCode = 404), res.end('not found');
      return res.end(files.get(u));
    }
    res.statusCode = 405;
    res.end();
  });
});
await new Promise((r) => srv.listen(5610, r));
const EXE = process.cwd() + '/node_modules/electron/dist/electron';
// Настройки по разделам: строка «название — кнопка» (.srow) в разделе «Данные»
const rowBtn = (w, label, btn) => w.locator('.srow', { has: w.locator('.srow-label', { hasText: new RegExp('^' + label + '$') }) }).getByRole('button', { name: btn });
const step = (s) => console.log('•', s);
async function open(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  const app = await electron.launch({ executablePath: EXE, args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
  return { app, win: await app.firstWindow() };
}
async function setup(win, pass) {
  await win.getByRole('button', { name: 'Настройки', exact: true }).click();
  await win.locator('.set-nav-item', { hasText: 'Данные' }).click();
  await rowBtn(win, 'Облако', /Подключить|Настроить/).click();
  const m = win.locator('.modal');
  await win.screenshot({ path: OUT + '/c-debug.png' });
  await m.locator('select.input').selectOption({ label: 'Nextcloud / другой WebDAV' });
  console.log('labels:', await m.locator('.field > span').allInnerTexts(), await m.locator('select.input').inputValue());
  await m.getByLabel('Адрес WebDAV', { exact: true }).fill('http://127.0.0.1:5610/dav');
  await m.getByLabel('Логин').fill('ученик');
  await m.locator('input[type=password]').first().fill(pass);
  await m.getByRole('switch', { name: 'Шифровать' }).click();
  await m.locator('input[type=password]').nth(1).fill('мой-шифр');
  await m.getByRole('button', { name: 'Синхронизировать сейчас' }).click();
  await m.locator('.hint.ok:not(:has-text("…")), .hint.warn').waitFor({ timeout: 20000 });
  const t = await m.locator('.hint').innerText();
  await win.screenshot({ path: `${OUT}/c-${Date.now()}.png` });
  return t;
}
const A = await open('/tmp/cloudA');
await A.win.getByRole('button', { name: 'Посмотреть на примере' }).click();
step('A wrong pass: ' + (await setup(A.win, 'bad')));
await A.win.locator('.modal input[type=password]').first().fill('app-pass');
await A.win.locator('.modal').getByRole('button', { name: 'Синхронизировать сейчас' }).click();
await A.win.locator('.modal .hint.ok:has-text("Готово")').waitFor({ timeout: 20000 });
step('A first: ' + (await A.win.locator('.modal .hint').innerText()));
const stored = [...files.values()][0];
step('stored encrypted: ' + (stored.includes('mnemaEncrypted') && !stored.includes('Фотосинтез')));
const B = await open('/tmp/cloudB');
await B.win.getByRole('button', { name: /Добавить предмет/ }).first().click();
await B.win.getByPlaceholder('Например: Биология').fill('Химия');
await B.win.getByRole('button', { name: 'Создать' }).click();
await B.win.waitForTimeout(500);
step('B: ' + (await setup(B.win, 'app-pass')));
await A.win.locator('.modal').getByRole('button', { name: 'Синхронизировать сейчас' }).click();
await A.win.waitForTimeout(300);
await A.win.locator('.modal .hint.ok:has-text("Готово")').waitFor({ timeout: 20000 });
step('A again: ' + (await A.win.locator('.modal .hint').innerText()));
await A.win.keyboard.press('Escape');
await A.win.waitForTimeout(400);
step('A tree: ' + (await A.win.locator('.tree').innerText()).replace(/\n+/g, ' | '));
await A.app.close();
await B.app.close();
srv.close();
console.log(log.join(' ; '));
