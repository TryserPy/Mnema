// 1.2: фото учебника (без интернета и через ИИ), «Важное», страницы, лента времени, задачи, тест до чтения.
import { _electron as electron } from 'playwright';
import fs from 'fs';
import http from 'http';
const OUT = process.env.OUT;
const PAGE = process.cwd() + '/test-fixtures/page47.jpg';
const AI_MD = `## § 7. Отмена крепостного права

В середине XIX века Россия отставала от европейских стран. Поражение в **Крымской войне** (1853–1856) показало, что прежние порядки мешают развитию страны.

**19 февраля 1861 г.** император **Александр II** подписал **Манифест** об отмене крепостного права. Крестьяне получили личную свободу.

**Временнообязанными** называли крестьян, которые до заключения выкупной сделки должны были нести повинности в пользу помещика.

*Выкупная операция* — это покупка крестьянами земли у помещиков при помощи государства.

[[РИСУНОК 150 395 757 600 | Рис. 12. Число освобождённых крестьян, млн]]

> **Запомните:** Реформа 1861 г. освободила около 23 млн крестьян.

Реформа имела и недостатки: крестьяне получили меньше земли, чем обрабатывали раньше.

[[СТРАНИЦА 47]]`;
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'vl' }] }));
    const text = body.includes('Markdown для конспекта') ? AI_MD : 'OK';
    setTimeout(() => res.end(JSON.stringify({ choices: [{ message: { content: text } }] })), 400);
  });
});
await new Promise((r) => srv.listen(5577, r));
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'] });
const userData = await app.evaluate(({ app }) => app.getPath('userData'));
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const step = (s) => console.log('•', s);
const t0 = Date.now();

await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
// Новая тема в истории
const hist = win.locator('.tree-row.subject', { hasText: 'История' });
await hist.hover();
await hist.getByRole('button', { name: /Ещё о предмете/ }).click();
await win.getByRole('menuitem', { name: 'Новая тема' }).click();
await win.getByPlaceholder('Новая тема, например §12').fill('§ 7. Реформы');
await win.keyboard.press('Enter');
await win.locator('.tb-hint').click();
await win.locator('.modal input[type=file]').setInputFiles(PAGE);
await win.locator('.tb-page img').waitFor();
await win.getByLabel('Номер первой страницы').fill('47');
await win.getByRole('radio', { name: 'Без интернета' }).click();
await win.screenshot({ path: OUT + '/t1-pages.png' });
await win.getByRole('button', { name: /^Распознать/ }).click();
await win.locator('.tb-scan').waitFor();
await win.screenshot({ path: OUT + '/t2-reading.png' });
await win.locator('.tb-review').waitFor({ timeout: 120000 });
step('offline OCR done in ' + Math.round((Date.now() - t0) / 1000) + ' s');
await win.waitForTimeout(400);
await win.screenshot({ path: OUT + '/t3-review-offline.png' });
const prev = await win.locator('.tb-preview').innerText();
step('offline preview: ' + prev.replace(/\n+/g, ' ⏎ ').slice(0, 700));
step('figures: ' + (await win.locator('.tb-figbox').count()) + ', doubts: ' + (await win.locator('.tb-doubt').count()));
step('found: ' + (await win.locator('.tb-found').innerText()).replace(/\n/g, ' '));
await win.getByRole('button', { name: 'Добавить в конспект' }).click();
await win.locator('.imp-panel').waitFor();
await win.waitForTimeout(500);
await win.screenshot({ path: OUT + '/t4-note-important.png' });
step('important groups: ' + (await win.locator('.imp-group-head').allInnerTexts()).map((x) => x.replace(/\n/g, ' ')).join(' | '));
// Страница
await win.locator('.note-doc .page-ref').first().click();
await win.locator('.page-view img').waitFor();
await win.screenshot({ path: OUT + '/t5-page.png' });
await win.keyboard.press('Escape');
// Карточки из всего
await win.getByRole('button', { name: 'Сделать карточки из всего' }).click();
await win.locator('.bulk-row').first().waitFor();
await win.screenshot({ path: OUT + '/t6-bulk.png' });
const addBtn = win.getByRole('button', { name: /^Добавить \d+ карточ/ });
step('bulk: ' + (await addBtn.innerText()));
await addBtn.click();
await win.waitForTimeout(400);

// Точный режим (ИИ): включить и заменить конспект
await win.getByRole('button', { name: 'Возможности' }).click();
await win.getByRole('switch', { name: 'ИИ-помощник' }).click();
await win.getByRole('radio', { name: 'На компьютере' }).click();
const ep = win.locator('input.input').filter({ hasNot: win.locator('[type=time]') }).first();
await ep.fill('http://localhost:5577/v1');
await ep.blur();
await win.getByRole('button', { name: 'Найти модели' }).click();
await win.locator('select.input').first().selectOption('vl');
await win.locator('.tree-row', { hasText: '§ 7. Реформы' }).locator('.tree-label').click();
await win.getByRole('button', { name: 'Из учебника' }).click();
await win.locator('.modal input[type=file]').setInputFiles(PAGE);
await win.locator('.tb-page img').waitFor();
await win.getByRole('radio', { name: 'Точно (ИИ)' }).click();
await win.getByRole('button', { name: /^Распознать/ }).click();
await win.locator('.tb-review').waitFor({ timeout: 30000 });
await win.waitForTimeout(400);
await win.screenshot({ path: OUT + '/t7-review-ai.png' });
await win.getByRole('radio', { name: 'Заменить конспект' }).click();
await win.getByRole('button', { name: 'Добавить в конспект' }).click();
await win.waitForTimeout(800);
await win.screenshot({ path: OUT + '/t8-note-ai.png' });

// Лента времени
await win.locator('.tree-row.subject', { hasText: 'История' }).locator('.tree-label').click();
await win.getByRole('radio', { name: 'Лента времени' }).click();
await win.locator('.timeline').waitFor();
step('timeline: ' + (await win.locator('.tl-date').allInnerTexts()).join(', '));
await win.screenshot({ path: OUT + '/t9-timeline.png' });

// Задача с числами
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.tree-label').click();
await win.locator('.topic-row', { hasText: 'Закон Ома' }).click();
await win.getByRole('radio', { name: /Карточки/ }).click();
await win.getByRole('button', { name: 'Карточка' }).click();
await win.locator('.modal select.input').selectOption('problem');
await win.locator('.modal textarea').nth(0).fill('Напряжение {U=10..220} В, сопротивление {R=2..50} Ом. Найди силу тока.');
await win.locator('.modal textarea').nth(1).fill('I = U / R = {=U/R} А');
await win.locator('.problem-preview').waitFor();
await win.screenshot({ path: OUT + '/t10-problem-editor.png' });
await win.getByRole('button', { name: 'Добавить', exact: true }).click();
await win.keyboard.press('Escape');
await win.waitForTimeout(300);
const d0 = JSON.parse(await win.evaluate(() => JSON.stringify(window.__mnemaDebug ?? null)));
void d0;

await app.close();
srv.close();
const d = JSON.parse(fs.readFileSync(userData + '/mnema-data.json', 'utf8'));
const t = d.topics.find((x) => x.name === '§ 7. Реформы');
console.log('note start:', JSON.stringify(t.note.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, 'DATA').slice(0, 900)));
console.log('pages stored:', (t.pages ?? []).map((p) => p.n), 'cards in topic:', d.cards.filter((c) => c.topicId === t.id).map((c) => c.type + ':' + c.front.slice(0, 50) + (c.page ? ' p' + c.page : '')));
console.log('problem cards:', d.cards.filter((c) => c.type === 'problem').length);
console.log('errors', JSON.stringify(errors));
fs.rmSync(userData, { recursive: true, force: true });
