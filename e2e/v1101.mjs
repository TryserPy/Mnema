// 1.10.1: (1) HTML с class="modal-back" в ответе карточки не рисует поддельное окно; (2) плашка плана на «Сегодня» не раздувается;
// (3) шапка темы знает про контрольную, в которую тема входит; (4) справка: вкладка «Моды» только при включённых модах.
// Запуск: URL=http://localhost:4174 OUT=out NODE_PATH=$(npm root -g) node e2e/v1101.mjs
import { chromium } from 'playwright';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
const ymd = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
await page.evaluate(([d5, d9]) => {
  const at = new Date().toISOString();
  const cards = [];
  for (const [tid, n] of [['t1', 4], ['t2', 4]]) for (let i = 0; i < n; i++) cards.push({ id: `${tid}c${i}`, topicId: tid, type: 'basic', front: 'Вопрос ' + i, back: i === 0 && tid === 't1' ? '<div class="modal-back"><div class="modal"><div class="modal-head"><h2>ПОДДЕЛКА</h2></div></div></div> ответ' : 'Ответ ' + i, createdAt: at, updatedAt: at });
  localStorage.setItem('mnema-data', JSON.stringify({
    version: 1, subjects: [{ id: 's1', name: 'Биология', color: '#3F51D8', createdAt: at }],
    topics: [{ id: 't1', subjectId: 's1', name: 'Клетка', note: 'Клетка — единица жизни.', examDate: d5, createdAt: at, updatedAt: at }, { id: 't2', subjectId: 's1', name: 'Ткани', note: '', createdAt: at, updatedAt: at }, { id: 't3', subjectId: 's1', name: 'Органы', note: '', createdAt: at, updatedAt: at }],
    exams: [{ id: 'e1', subjectId: 's1', name: 'Контрольная по органам', date: d9, topicIds: ['t3'], createdAt: at, updatedAt: at }],
    cards: [...cards, { id: 't3c0', topicId: 't3', type: 'basic', front: 'Орган?', back: 'Да', createdAt: at, updatedAt: at }], states: {}, logs: [], tests: [], settings: { onboarded: true }
  }));
}, [ymd(5), ymd(9)]);
await page.reload();
await page.waitForTimeout(700);
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };

// (2) «Сегодня»: плашки подготовки к контрольной не раздуты
const plans = await page.evaluate(() => [...document.querySelectorAll('.exam-plan')].map((e) => Math.round(e.getBoundingClientRect().height)));
check(plans.length > 0 && plans.every((h) => h < 200), `плашки плана на «Сегодня» невысокие: ${JSON.stringify(plans)} px`);
await page.screenshot({ path: `${OUT}/v1101-today.png` });

// (3) шапка темы: тема входит в контрольную по органам
await page.locator('.tree-row.subject', { hasText: 'Биология' }).locator('.twisty').click();
await page.locator('.tree-row', { hasText: 'Органы' }).locator('.tree-label').click();
await page.waitForTimeout(500);
const head = await page.locator('.topic-head').innerText();
check(/Контрольная «Контрольная по органам»/.test(head) && !/\+ Дата контрольной/.test(head), 'шапка темы показывает контрольную, в которую она входит');
await page.screenshot({ path: `${OUT}/v1101-topic.png` });

// (1) подделка окна из ответа карточки
await page.locator('.tree-row', { hasText: 'Клетка' }).locator('.tree-label').click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Учить/ }).first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Показать ответ' }).click().catch(() => {});
await page.waitForTimeout(400);
const forged = await page.evaluate(() => ({ backs: document.querySelectorAll('.modal-back').length, vis: [...document.querySelectorAll('.modal-back')].some((e) => getComputedStyle(e).position === 'fixed') }));
check(forged.backs === 0, `class="modal-back" из ответа карточки не попадает на страницу (найдено ${forged.backs})`);
await page.screenshot({ path: `${OUT}/v1101-forged.png` });

// (4) справка
await page.keyboard.press('Escape');
await page.evaluate(() => { location.hash = ''; });
await page.goto(URL);
await page.waitForTimeout(500);
await page.locator('.foot-btn[aria-label="Справка"]').click().catch(() => {});
await page.waitForTimeout(400);
const tabsOff = await page.locator('[aria-label="Раздел справки"] button').allInnerTexts();
check(!tabsOff.includes('Моды'), `в справке без включённых модов нет вкладки «Моды»: ${JSON.stringify(tabsOff)}`);
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('mnema-data')); d.settings.features = { ...d.settings.features, mods: true }; localStorage.setItem('mnema-data', JSON.stringify(d)); });
await page.reload();
await page.waitForTimeout(500);
await page.locator('.foot-btn[aria-label="Справка"]').click().catch(() => {});
await page.waitForTimeout(400);
const tabsOn = await page.locator('[aria-label="Раздел справки"] button').allInnerTexts();
check(tabsOn.includes('Моды'), `с включёнными модами вкладка «Моды» есть: ${JSON.stringify(tabsOn)}`);

await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ВЕРНО');
process.exit(bad ? 1 : 0);
