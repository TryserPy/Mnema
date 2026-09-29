// Свои ИИ по API: OpenAI-совместимый, Anthropic и Gemini (поддельные серверы), ИИ для картинок.
import { _electron as electron } from 'playwright';
import fs from 'fs';
import http from 'http';
const OUT = process.env.OUT;
const hits = [];
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    const h = req.headers;
    const u = req.url;
    const send = (code, obj) => {
      res.statusCode = code;
      res.end(JSON.stringify(obj));
    };
    const img = body.includes('image_url') || body.includes('"image"') || body.includes('inline_data');
    hits.push(`${req.method} ${u.split('?')[0]}${img ? ' +img' : ''}`);
    if (u.startsWith('/openai/')) {
      if (h.authorization !== 'Bearer k1') return send(401, { error: { message: 'Invalid API key' } });
      if (u.endsWith('/models')) return send(200, { data: [{ id: 'text-only' }, { id: 'vis' }] });
      const j = JSON.parse(body);
      if (img && j.model === 'text-only') return send(400, { error: { message: 'image input is not supported' } });
      return send(200, { choices: [{ message: { content: '<think>хм</think>готово' } }] });
    }
    if (u.startsWith('/anth/')) {
      if (h['x-api-key'] !== 'k2') return send(401, { error: { message: 'invalid x-api-key' } });
      if (u.includes('/v1/models')) return send(200, { data: [{ id: 'claude-x' }] });
      return send(200, { content: [{ type: 'text', text: img ? 'x^2' : 'готово' }] });
    }
    if (u.startsWith('/gem/')) {
      if (h['x-goog-api-key'] !== 'k3') return send(403, { error: { message: 'API key not valid' } });
      if (u.includes(':generateContent')) return send(200, { candidates: [{ content: { parts: [{ text: 'готово' }] } }] });
      return send(200, { models: [{ name: 'models/gem-1', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] });
    }
    send(404, { error: 'нет' });
  });
});
await new Promise((r) => srv.listen(5588, r));
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'] });
const userData = await app.evaluate(({ app }) => app.getPath('userData'));
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
const step = (s) => console.log('•', s);
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.getByRole('button', { name: 'Возможности' }).click();
await win.getByRole('switch', { name: 'ИИ-помощник' }).click();

async function addCustom({ preset, name, url, key, model, expectVision }) {
  await win.getByRole('button', { name: /Добавить свой ИИ/ }).click();
  const m = win.locator('.modal');
  await m.locator('select.input').first().selectOption({ label: preset });
  await m.getByLabel('Название (как будет в списке)').fill(name);
  await m.getByLabel('Адрес API').fill(url);
  await m.getByLabel(/Ключ API/).fill(key);
  await m.getByRole('button', { name: 'Найти модели' }).click();
  await m.locator('.hint').waitFor();
  await m.getByLabel('Модель').fill(model);
  await m.locator('.model-opt', { hasText: model }).first().click();
  await m.getByRole('button', { name: 'Проверить' }).click();
  await m.locator('.hint.ok, .hint.warn').waitFor();
  const st = await m.locator('.hint').innerText();
  step(`${name}: ${st}`);
  if (expectVision !== undefined) step(`  vision switch: ${await m.getByRole('switch', { name: 'Понимает картинки' }).getAttribute('aria-checked')}`);
  await win.screenshot({ path: `${OUT}/ai-${name.replace(/\s/g, '')}.png` });
  await m.getByRole('button', { name: 'Сохранить и выбрать' }).click();
  await m.waitFor({ state: 'detached' });
}
await addCustom({ preset: 'Другой — OpenAI-совместимый', name: 'Тест OpenAI', url: 'http://127.0.0.1:5588/openai/v1', key: 'k1', model: 'text-only', expectVision: false });
await addCustom({ preset: 'Другой — формат Anthropic', name: 'Тест Anthropic', url: 'http://127.0.0.1:5588/anth', key: 'k2', model: 'claude-x', expectVision: true });
await addCustom({ preset: 'Другой — формат Gemini', name: 'Тест Gemini', url: 'http://127.0.0.1:5588/gem', key: 'k3', model: 'gem-1' });

// Выбрать OpenAI (без картинок) и для картинок — Anthropic
await win.getByRole('radio', { name: /Тест OpenAI/ }).click();
await win.getByLabel('ИИ для картинок').selectOption({ label: 'Тест Anthropic' });
await win.waitForTimeout(300);
await win.getByRole('button', { name: 'Проверить', exact: true }).click();
await win.locator('.feature-extra .hint.ok').waitFor();
step('main check: ' + (await win.locator('.feature-extra .hint.ok').innerText()));
await win.screenshot({ path: `${OUT}/ai-list.png` });
const text = await win.evaluate(() => window.mnemaApi.aiAsk({ text: 'привет' }));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pic = await win.evaluate((d) => window.mnemaApi.aiAsk({ text: 'формула', image: { mime: 'image/png', data: d } }), png);
step('text → ' + JSON.stringify(text) + '; image → ' + JSON.stringify(pic));
// Неверный ключ
await win.locator('.ai-item', { hasText: 'Тест Gemini' }).getByRole('button', { name: /Изменить/ }).click();
await win.locator('.modal').getByLabel(/Ключ API/).fill('bad');
await win.locator('.modal').getByRole('button', { name: 'Проверить' }).click();
await win.locator('.modal .hint.warn').waitFor();
step('bad key: ' + (await win.locator('.modal .hint.warn').innerText()));
await win.locator('.modal').getByRole('button', { name: 'Удалить' }).click();
await win.locator('.modal').getByRole('button', { name: 'Точно удалить' }).click();
await win.waitForTimeout(300);
step('after delete: ' + (await win.locator('.ai-item').allInnerTexts()).map((t) => t.split('\n')[0]).join(', '));
await app.close();
srv.close();
const cfg = JSON.parse(fs.readFileSync(userData + '/ai.json', 'utf8'));
console.log('stored keys encrypted:', Object.entries(cfg.keys).map(([k, v]) => k + '=' + String(v).slice(0, 4)).join(' '), 'plain leaked:', JSON.stringify(cfg).includes('"k1"'));
console.log('hits', hits.join(' | '));
console.log('errors', JSON.stringify(errors));
fs.rmSync(userData, { recursive: true, force: true });
