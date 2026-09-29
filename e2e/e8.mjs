// OpenRouter (поддельный, по адресу openrouter.ai через hosts): список моделей, ключ с мусором, неверный ключ.
import { _electron as electron } from 'playwright';
import fs from 'fs';
import http from 'http';
const OUT = process.env.OUT;
const GOOD = 'sk-or-v1-good123';
const hits = [];
const MODELS = [
  { id: 'deepseek/deepseek-chat-v3:free', architecture: { input_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' } },
  { id: 'google/gemini-2.5-flash', architecture: { input_modalities: ['text', 'image'] }, pricing: { prompt: '0.0000003', completion: '0.0000025' } },
  { id: 'qwen/qwen2.5-vl-72b-instruct:free', architecture: { input_modalities: ['text', 'image'] }, pricing: { prompt: '0', completion: '0' } },
  ...Array.from({ length: 300 }, (_, i) => ({ id: `vendor${i}/model-${i}`, architecture: { input_modalities: ['text'] }, pricing: { prompt: '0.001', completion: '0.001' } }))
];
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    const send = (code, obj) => ((res.statusCode = code), res.end(JSON.stringify(obj)));
    const auth = req.headers.authorization;
    hits.push(`${req.method} ${req.url} auth=${auth ? (auth === 'Bearer ' + GOOD ? 'good' : JSON.stringify(auth)) : 'none'} title=${req.headers['x-title'] || ''}`);
    if (req.url === '/api/v1/models') {
      if (auth && auth !== 'Bearer ' + GOOD) return send(401, { error: { message: 'User not found.', code: 401 } });
      return send(200, { data: MODELS });
    }
    if (auth !== 'Bearer ' + GOOD) return send(401, { error: { message: 'User not found.', code: 401 } });
    if (req.url === '/api/v1/key') return send(200, { data: { label: 'sk-or-v1-goo...', limit: null, limit_remaining: null, is_free_tier: true, usage: 0 } });
    if (req.url === '/api/v1/chat/completions') {
      const j = JSON.parse(body);
      const m = MODELS.find((x) => x.id === j.model);
      if (!m) return send(400, { error: { message: `${j.model} is not a valid model ID`, code: 400 } });
      if (body.includes('image_url') && !m.architecture.input_modalities.includes('image')) return send(404, { error: { message: 'No endpoints found that support image input', code: 404 } });
      return send(200, { choices: [{ message: { content: 'готово' } }] });
    }
    send(404, { error: { message: 'Not Found', code: 404 } });
  });
});
await new Promise((r) => srv.listen(5599, r));
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'] });
const userData = await app.evaluate(({ app }) => app.getPath('userData'));
const win = await app.firstWindow();
const step = (s) => console.log('•', s);
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.getByRole('button', { name: 'Возможности' }).click();
await win.getByRole('switch', { name: 'ИИ-помощник' }).click();
await win.getByRole('button', { name: /Добавить свой ИИ/ }).click();
const m = win.locator('.modal');
await m.locator('select.input').first().selectOption({ label: 'OpenRouter' });
await m.getByLabel('Адрес API').fill('http://openrouter.ai:5599/api/v1');
// Неверный ключ
await m.getByLabel(/Ключ API/).fill('sk-or-v1-wrong');
await m.getByRole('button', { name: 'Найти модели' }).click();
await m.locator('.hint').waitFor();
step('models with wrong key: ' + (await m.locator('.hint').innerText()));
await m.getByLabel('Модель').fill('deepseek');
await win.screenshot({ path: OUT + '/or-picker.png' });
await m.locator('.model-opt', { hasText: 'deepseek-chat-v3:free' }).click();
await m.getByRole('button', { name: 'Проверить' }).click();
await m.locator('.hint.warn').waitFor();
step('check with wrong key: ' + (await m.locator('.hint.warn').innerText()));
// Ключ с пробелами, переносом и «Bearer »
await m.getByLabel(/Ключ API/).fill('  Bearer ' + GOOD + ' \n');
await m.getByRole('button', { name: 'Проверить' }).click();
await m.locator('.hint.ok').waitFor();
step('check good key: ' + (await m.locator('.hint.ok').innerText()));
step('vision switch: ' + (await m.getByRole('switch', { name: 'Понимает картинки' }).getAttribute('aria-checked')));
// Русская раскладка в ключе
await m.getByLabel(/Ключ API/).fill('sk-ор-v1-good');
await m.getByRole('button', { name: 'Проверить' }).click();
await m.locator('.hint.warn').waitFor();
step('cyrillic key: ' + (await m.locator('.hint.warn').innerText()));
await m.getByLabel(/Ключ API/).fill(GOOD);
await m.getByLabel('Модель').fill('qwen2.5-vl');
await m.locator('.model-opt', { hasText: 'qwen2.5-vl-72b-instruct:free' }).click();
step('vision after vl pick: ' + (await m.getByRole('switch', { name: 'Понимает картинки' }).getAttribute('aria-checked')));
await m.getByRole('button', { name: 'Сохранить и выбрать' }).click();
await m.waitFor({ state: 'detached' });
await win.getByRole('button', { name: 'Проверить', exact: true }).click();
await win.locator('.feature-extra .hint.ok, .feature-extra .hint.warn').waitFor();
step('main check: ' + (await win.locator('.feature-extra .hint').innerText()));
await app.close();
srv.close();
console.log(hits.slice(0, 12).join('\n'));
fs.rmSync(userData, { recursive: true, force: true });
