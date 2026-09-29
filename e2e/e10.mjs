// Ответ голосом на компьютере: фальшивый микрофон Chromium + поддельный OpenAI-совместимый сервер.
import { _electron as electron } from 'playwright';
import fs from 'fs';
import http from 'http';
const OUT = process.env.OUT;
let got = null;
const srv = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    const body = Buffer.concat(chunks);
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'm' }] }));
    if (req.url.endsWith('/audio/transcriptions')) {
      got = { ct: req.headers['content-type'], size: body.length, hasModel: body.includes('name="model"\r\n\r\nwhisper-1'), hasFile: body.includes('filename="answer.webm"') };
      return res.end(JSON.stringify({ text: 'Сила тока равна напряжению, делённому на сопротивление' }));
    }
    res.end(JSON.stringify({ choices: [{ message: { content: 'готово' } }] }));
  });
});
await new Promise((r) => srv.listen(5601, r));
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const userData = await app.evaluate(({ app }) => app.getPath('userData'));
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
const step = (s) => console.log('•', s);
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.getByRole('button', { name: 'Возможности' }).click();
await win.getByRole('switch', { name: 'ИИ-помощник' }).click();
await win.getByRole('switch', { name: 'Ответ голосом' }).click();
const r = await win.evaluate(() => window.mnemaApi.aiSaveCustom({ name: 'Тест', format: 'openai', baseUrl: 'http://127.0.0.1:5601/v1', model: 'm', vision: true, auth: 'bearer', headers: '', key: 'k', select: true }));
step('saved: ' + r.ok);
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.tree-label').click();
await win.locator('.topic-row', { hasText: 'Закон Ома' }).click();
await win.getByRole('button', { name: /Учить/ }).first().click();
await win.getByRole('button', { name: /Ответить голосом/ }).click();
await win.locator('.voice-rec').waitFor();
await win.waitForTimeout(1500);
await win.screenshot({ path: OUT + '/v1-rec.png' });
await win.locator('.voice-rec').click();
await win.locator('.voice-box.done').waitFor({ timeout: 15000 });
step('transcript: ' + (await win.locator('.voice-box.done').innerText()).replace(/\n/g, ' '));
await win.getByRole('button', { name: 'Показать ответ' }).click();
await win.waitForTimeout(300);
step('compare: ' + (await win.locator('.voice-box.done').innerText()).replace(/\n/g, ' '));
await win.screenshot({ path: OUT + '/v2-compare.png' });
console.log('server got', JSON.stringify(got), 'errors', JSON.stringify(errors));
await app.close();
srv.close();
fs.rmSync(userData, { recursive: true, force: true });
