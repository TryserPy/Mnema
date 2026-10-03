// Проверка возможностей 1.1 в Electron: ИИ (через поддельный LM Studio), рукописная формула,
// «Объясни иначе», ответ от руки, карта знаний, мини-повторение, импорт из Anki.
import { _electron as electron } from 'playwright';
import fs from 'fs';
import http from 'http';
const OUT = process.env.OUT;
const FIX = process.cwd() + '/test-fixtures';
const seen = [];
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'qwen2.5-vl-7b' }, { id: 'gemma-3-4b' }] }));
    const j = JSON.parse(body || '{}');
    const hasImage = JSON.stringify(j).includes('image_url');
    seen.push({ model: j.model, hasImage });
    const text = hasImage ? '$$I = \\frac{U}{R}$$' : JSON.stringify(j).includes('Ответь одним словом') ? 'OK' : 'Представь трубу с водой: **напряжение** — это напор, а сопротивление — узость трубы. Чем сильнее напор и шире труба, тем больше воды (тока) течёт.';
    res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
  });
});
await new Promise((r) => srv.listen(5577, r));

const EXE = process.cwd() + '/node_modules/electron/dist/electron';
const app = await electron.launch({ executablePath: EXE, args: [process.cwd() + '', '--no-sandbox'] });
const userData = await app.evaluate(({ app }) => app.getPath('userData'));
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const step = (s) => console.log('•', s);

await win.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске

await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.getByRole('button', { name: 'Возможности' }).click();
for (const n of ['ИИ-помощник', 'Ответ от руки', 'Карта знаний', 'Значок у часов и напоминания']) await win.getByRole('switch', { name: n }).click();
step('features on');
// ИИ: модель на компьютере
await win.getByRole('radio', { name: 'На компьютере' }).click();
const ep = win.locator('input.input').filter({ hasNot: win.locator('[type=time]') }).first();
await ep.fill('http://localhost:5577/v1');
await ep.blur();
await win.getByRole('button', { name: 'Найти модели' }).click();
await win.locator('select.input').first().selectOption('qwen2.5-vl-7b');
await win.getByRole('button', { name: 'Проверить' }).click();
await win.locator('.hint.ok').waitFor({ timeout: 5000 });
step('ai check: ' + (await win.locator('.hint.ok').innerText()));
await win.screenshot({ path: OUT + '/f1-ai-settings.png' });

// Рукописная формула в конспекте
await win.locator('.tree-row .tree-label', { hasText: 'Физика' }).click();
await win.locator('.topic-row', { hasText: 'Закон Ома' }).click();
await win.locator('.note-doc').waitFor();
await win.locator('.note-doc p').last().click();
await win.keyboard.press('Control+End');
await win.keyboard.press('Enter');
await win.getByRole('button', { name: 'Вставить' }).click();
await win.getByRole('menuitem', { name: /^∑ Формула/ }).click();
await win.getByRole('radio', { name: 'Нарисовать' }).click();
const pad = win.getByRole('img', { name: 'Напиши формулу' });
const b = await pad.boundingBox();
async function stroke(pts) {
  await win.mouse.move(b.x + pts[0][0], b.y + pts[0][1]);
  await win.mouse.down();
  for (const [x, y] of pts.slice(1)) await win.mouse.move(b.x + x, b.y + y, { steps: 4 });
  await win.mouse.up();
}
await stroke([[60, 40], [60, 140]]);
await stroke([[100, 90], [140, 90]]);
await stroke([[100, 110], [140, 110]]);
await stroke([[180, 60], [200, 40], [220, 60], [200, 90]]);
await stroke([[170, 100], [240, 100]]);
await stroke([[180, 120], [180, 160], [200, 150], [180, 140], [220, 165]]);
await win.screenshot({ path: OUT + '/f2-formula-hand.png' });
await win.getByRole('button', { name: 'Распознать' }).click();
await win.waitForFunction(() => document.querySelector('math-field')?.value?.includes('frac'), null, { timeout: 5000 });
step('recognized: ' + (await win.evaluate(() => document.querySelector('math-field').value)));
await win.screenshot({ path: OUT + '/f3-formula-recognized.png' });
await win.getByRole('button', { name: 'Вставить', exact: true }).last().click();
await win.waitForTimeout(900);

// Повторение: ответ от руки + «Объясни иначе»
await win.getByRole('button', { name: /Учить/ }).first().click();
await win.getByRole('button', { name: /Ответить от руки/ }).click();
const hp = win.getByRole('img', { name: 'Ответ от руки' });
const hb = await hp.boundingBox();
await win.mouse.move(hb.x + 40, hb.y + 60);
await win.mouse.down();
for (let i = 0; i < 12; i++) await win.mouse.move(hb.x + 40 + i * 20, hb.y + 60 + (i % 2) * 30, { steps: 3 });
await win.mouse.up();
await win.getByRole('button', { name: 'Показать ответ' }).click();
await win.getByRole('img', { name: 'Твой ответ от руки' }).waitFor();
await win.getByRole('button', { name: /Объясни иначе/ }).click();
await win.locator('.ai-box').filter({ hasText: 'трубу' }).waitFor({ timeout: 5000 });
await win.screenshot({ path: OUT + '/f4-review-explain.png' });
await win.getByRole('button', { name: 'Добавить в «почему»' }).click();
await win.getByText('Добавлено в карточку').waitFor();
step('explain ok');
await win.keyboard.press('Escape');
await win.waitForTimeout(300);
if (await win.getByRole('button', { name: 'Закончить' }).count()) await win.getByRole('button', { name: 'Закончить' }).click();

// Карта знаний
await win.getByRole('button', { name: 'Статистика' }).click();
await win.getByRole('radio', { name: 'Карта знаний' }).click();
await win.locator('.map-canvas').waitFor();
await win.waitForTimeout(300);
step('map nodes: ' + 'canvas');
await win.screenshot({ path: OUT + '/f5-map.png' });

// Импорт из Anki
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.getByRole('button', { name: 'Импорт из Anki' }).click();
await win.locator('input[type=file][accept*=apkg]').setInputFiles(FIX + '/new.apkg');
await win.getByRole('button', { name: /Добавить \d+ карточ/ }).waitFor({ timeout: 10000 });
await win.screenshot({ path: OUT + '/f6-anki-preview.png' });
await win.getByRole('button', { name: /Добавить \d+ карточ/ }).click();
await win.getByText('Готово:').waitFor();
step('anki: ' + (await win.locator('.hint.ok').innerText()));
await win.getByRole('button', { name: 'Открыть' }).click();
await win.getByRole('tab', { name: /Карточки/ }).click().catch(() => {});
await win.waitForTimeout(500);
await win.screenshot({ path: OUT + '/f7-anki-cards.png' });

// Мини-повторение (как по Ctrl+Alt+M)

await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.webContents.send('mini:start');
  w.setBounds({ width: 460, height: 620 });
});
await win.waitForTimeout(700);
step('mini class: ' + (await win.locator('.app.review-mode.mini').count()));
await win.screenshot({ path: OUT + '/f8-mini.png' });
await win.keyboard.press('Escape');
await win.waitForTimeout(500);

await app.close();
srv.close();
const d = JSON.parse(fs.readFileSync(userData + '/mnema-data.json', 'utf8'));
const ohm = d.topics.find((t) => t.name.includes('Ома'));
console.log('note formula:', /\$\$?I = \\frac\{U\}\{R\}/.test(ohm.note), JSON.stringify(ohm.note.slice(-80)));
console.log('why added:', d.cards.some((c) => (c.why ?? '').includes('трубу')));
const bio = d.subjects.find((s) => s.name === 'Биология');
const cell = d.topics.find((t) => t.name === 'Клетка' && t.subjectId === bio.id);
console.log('anki topic in Биология:', Boolean(cell), 'cards:', d.cards.filter((c) => c.topicId === cell?.id).map((c) => c.type).join(','));
console.log('anki states:', Object.keys(d.states).filter((k) => d.cards.find((c) => c.id === k.split(':')[0])?.topicId === cell?.id).length);
console.log('ai calls:', JSON.stringify(seen));
console.log('errors', JSON.stringify(errors));
fs.rmSync(userData, { recursive: true, force: true });
