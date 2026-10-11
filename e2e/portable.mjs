// Запуск: npm run build:web && npm run preview:web -- --port 4180 &   затем   URL=http://localhost:4180 OUT=out node e2e/portable.mjs
// (playwright и fflate должны находиться из папки скрипта: симлинки в node_modules).
// Проверка в браузере: значок-картинка (загрузка, кадрирование, показ), экспорт «Всё в Markdown» и импорт обратно, копирование из конспекта.
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4180';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) bad++;
};
const errors = [];
const at = new Date(Date.now() - 5 * 864e5).toISOString();
const seedData = {
  version: 1,
  folders: [],
  subjects: [{ id: 's1', name: 'Физика', color: '#2A5BB8', icon: '⚡', createdAt: at }],
  topics: [
    { id: 't1', subjectId: 's1', name: 'Закон Ома', note: 'Ток $I=U/R$ и ==важно==\n\n$$\nI=\\frac{U}{R}\n$$\n\nСм. [Сопротивление](mnema://topic/t2).\n\n> **Запомните:** ток течёт\n', createdAt: at, updatedAt: at },
    { id: 't2', subjectId: 's1', name: 'Сопротивление', parentId: 't1', note: 'R — **сопротивление**', createdAt: at, updatedAt: at }
  ],
  cards: [
    { id: 'c1', topicId: 't1', type: 'basic', front: 'Формула тока?', back: '$I=U/R$', createdAt: at, updatedAt: at },
    { id: 'c2', topicId: 't1', type: 'cloze', front: 'Ток {{c1::I}} в амперах', back: '', createdAt: at, updatedAt: at }
  ],
  states: {},
  logs: [],
  tests: [],
  settings: { onboarded: true }
};
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
await ctx.addInitScript(() => sessionStorage.setItem('mnema-web-test-ok', '1'));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
await page.goto(URL);
await page.evaluate((d) => localStorage.setItem('mnema-data', JSON.stringify(d)), seedData);
await page.reload();
await page.waitForSelector('#root > *', { timeout: 15000 });
await page.waitForTimeout(800);

// ---- 1. Значок-картинка ----
const png = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = 240;
  const g = c.getContext('2d');
  g.fillStyle = '#e0572e';
  g.fillRect(0, 0, 400, 240);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(300, 120, 90, 0, 7);
  g.fill();
  g.fillStyle = '#2a5bb8';
  g.fillRect(20, 20, 100, 100);
  return c.toDataURL('image/png').split(',')[1];
});
fs.writeFileSync(`${OUT}/src.png`, Buffer.from(png, 'base64'));
await page.getByRole('button', { name: /Физика/ }).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Изменить предмет' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Сменить значок|Выбрать значок/ }).click();
await page.waitForTimeout(300);
check((await page.getByRole('button', { name: /Своя картинка/ }).count()) === 1, 'в выборе значка есть «Своя картинка…»');
await page.screenshot({ path: `${OUT}/icon-1-picker.png` });
await page.getByRole('button', { name: /Своя картинка/ }).click();
await page.waitForSelector('.icon-crop');
await page.setInputFiles('.icon-crop input[type=file]', `${OUT}/src.png`);
await page.waitForSelector('.icon-crop-stage canvas');
await page.waitForTimeout(400);
// приблизить и сдвинуть
await page.locator('.icon-crop-range').fill('2');
const box = await page.locator('.icon-crop-stage').boundingBox();
await page.mouse.move(box.x + 120, box.y + 120);
await page.mouse.down();
await page.mouse.move(box.x + 60, box.y + 100, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/icon-2-crop.png` });
await page.getByRole('button', { name: 'Готово' }).click();
await page.waitForTimeout(400);
check((await page.locator('.icon-pick .subj-ico.has-img img').count()) === 1, 'после «Готово» в окне предмета показана картинка');
check((await page.getByRole('button', { name: 'убрать картинку' }).count()) === 1, 'есть «убрать картинку»');
await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
await page.waitForTimeout(600);
const subj = JSON.parse(await page.evaluate(() => window.mnemaApi.load())).subjects[0];
const uri = subj.iconImg ?? '';
check(/^data:image\/(webp|png);base64,/.test(uri), `сохранён растр: ${uri.slice(0, 22)}…`);
check(Math.floor((uri.length * 3) / 4) <= 40 * 1024, `размер ${Math.round((uri.length * 3) / 4 / 1024)} КБ ≤ 40 КБ`);
const dim = await page.evaluate(
  (u) =>
    new Promise((ok) => {
      const i = new Image();
      i.onload = () => ok([i.naturalWidth, i.naturalHeight]);
      i.src = u;
    }),
  uri
);
check(dim[0] === 128 && dim[1] === 128, `размер картинки ${dim.join('×')}`);
check(subj.icon === '⚡', 'эмодзи сохранился рядом с картинкой');
check((await page.locator('.sidebar .subj-ico.has-img img, aside .subj-ico.has-img img').count()) >= 1, 'картинка видна в боковой панели');
check((await page.locator('.subj-ico.big.has-img img').count()) === 1, 'картинка видна на экране предмета');
await page.screenshot({ path: `${OUT}/icon-3-shown.png` });
// поиск (палитра команд)
await page.keyboard.press('Control+p');
await page.waitForTimeout(300);
await page.keyboard.type('Физ');
await page.waitForTimeout(300);
check((await page.locator('.pal-ico .subj-ico.has-img img').count()) >= 1, 'картинка видна в поиске (палитра)');
await page.screenshot({ path: `${OUT}/icon-4-palette.png` });
await page.keyboard.press('Escape');
// убрать картинку
await page.getByRole('button', { name: 'Изменить предмет' }).click();
await page.getByRole('button', { name: 'убрать картинку' }).click();
await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
await page.waitForTimeout(500);
const s2 = JSON.parse(await page.evaluate(() => window.mnemaApi.load())).subjects[0];
check(!s2.iconImg && s2.icon === '⚡', '«Убрать картинку» вернул эмодзи');
// вернуть картинку для экспорта
await page.evaluate((u) => {
  const d = JSON.parse(window.mnemaApi.load());
  d.subjects[0].iconImg = u;
  return window.mnemaApi.save(JSON.stringify(d));
}, uri);

// ---- 2. Экспорт «Всё в Markdown» и импорт обратно ----
await page.reload();
await page.waitForSelector('#root > *');
await page.getByRole('button', { name: 'Настройки', exact: true }).click();
await page.locator('.set-nav-item', { hasText: 'Данные' }).click();
await page.waitForTimeout(300);
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.srow', { hasText: 'Всё в Markdown' }).getByRole('button', { name: 'Экспорт' }).click()]);
const zipPath = `${OUT}/export.zip`;
await dl.saveAs(zipPath);
check(fs.statSync(zipPath).size > 500, `скачан архив ${dl.suggestedFilename()} (${fs.statSync(zipPath).size} Б)`);
await page.screenshot({ path: `${OUT}/md-1-settings.png` });
const { unzipSync } = await import('fflate').catch(() => ({}));
if (unzipSync) {
  const files = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
  const names = Object.keys(files);
  console.log(names.join('\n'));
  check(names.some((n) => n.endsWith('Физика/Закон Ома.md')) && names.some((n) => n.includes('attachments/значок')), 'в архиве темы и значок предмета');
  const md = new TextDecoder().decode(files[names.find((n) => n.endsWith('Физика/Закон Ома.md'))]);
  fs.writeFileSync(`${OUT}/Закон Ома.md`, md);
  check(md.includes('[Сопротивление](') && !md.includes('mnema://') && md.includes('> [!important] Запомните'), 'ссылки обычные, выноска Obsidian');
}
// очистить данные и импортировать архив
await page.evaluate(() => {
  const d = JSON.parse(window.mnemaApi.load());
  d.subjects = [];
  d.topics = [];
  d.cards = [];
  return window.mnemaApi.save(JSON.stringify(d));
});
await page.reload();
await page.waitForSelector('#root > *');
await page.getByRole('button', { name: 'Настройки', exact: true }).click();
await page.locator('.set-nav-item', { hasText: 'Данные' }).click();
await page.locator('.srow', { hasText: 'Из папки Markdown' }).getByRole('button', { name: 'Выбрать' }).click();
await page.waitForSelector('.modal input[type=file]', { state: 'attached' });
await page.locator('.modal input[type=file]').first().setInputFiles(zipPath);
await page.waitForSelector('.hint.ok');
const hint = await page.locator('.modal .hint.ok').innerText();
check(/2 заметки/.test(hint) && /карточек: 2/.test(hint), `предпросмотр импорта: ${hint}`);
await page.screenshot({ path: `${OUT}/md-2-import.png` });
await page.getByRole('button', { name: 'Импортировать', exact: true }).click();
await page.waitForTimeout(800);
const back = JSON.parse(await page.evaluate(() => window.mnemaApi.load()));
check(back.subjects.length === 1 && back.subjects[0].name === 'Физика' && back.subjects[0].iconImg === uri && back.subjects[0].icon === '⚡', 'предмет вернулся со значком-картинкой и эмодзи');
const ohm = back.topics.find((t) => t.name === 'Закон Ома');
const res = back.topics.find((t) => t.name === 'Сопротивление');
check(ohm && res && res.parentId === ohm.id, 'подтема на месте');
check(ohm.note.includes('$I=U/R$') && ohm.note.includes('==важно==') && ohm.note.includes(`](mnema://topic/${res.id})`) && ohm.note.includes('> **Запомните:** ток течёт'), 'конспект вернулся: формулы, выделение, ссылка на подтему, рамка');
check(back.cards.length === 2 && back.cards.some((c) => c.type === 'cloze' && c.front === 'Ток {{c1::I}} в амперах'), 'карточки вернулись');

// ---- 3. Копирование из конспекта ----
await page.evaluate(() => {
  location.hash = '';
});
await page.getByRole('button', { name: /Физика/ }).first().click();
await page.waitForTimeout(300);
await page.getByText('Закон Ома', { exact: true }).first().click();
await page.waitForSelector('.note-doc', { timeout: 10000 });
await page.waitForTimeout(600);
await page.locator('.note-doc').click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Control+c');
await page.waitForTimeout(300);
const clip = await page.evaluate(async () => {
  const items = await navigator.clipboard.read();
  const out = {};
  for (const it of items) for (const t of it.types) out[t] = await (await it.getType(t)).text();
  return out;
});
fs.writeFileSync(`${OUT}/clip.json`, JSON.stringify(clip, null, 1));
const plain = clip['text/plain'] ?? '';
const html = clip['text/html'] ?? '';
check(plain.includes('$I=U/R$') && plain.includes('==важно==') && plain.includes('Сопротивление') && !plain.includes('mnema://'), `буфер: чистый Markdown (${JSON.stringify(plain.slice(0, 80))}…)`);
check(html.includes('$I=U/R$') && /data-type="inline-math"/.test(html), 'буфер: в HTML формулы видны текстом $…$');

console.log('ошибки страницы:', errors.length ? errors : 'нет');
await browser.close();
console.log(bad ? `ПРОВАЛОВ: ${bad}` : 'ВСЁ В ПОРЯДКЕ');
process.exit(bad ? 1 : 0);
