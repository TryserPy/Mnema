// 1.6: план до контрольной, подготовка к урокам, «почему?», карточки из конспекта, фото к домашке, обновления.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT || 'out16'; fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/mnema16';
fs.rmSync(dir, { recursive: true, force: true });
const launch = () => electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
let app = await launch();
let win = await app.firstWindow();
const errors = [];
const watch = (w) => { w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|net::/.test(m.text()) && errors.push('console: ' + m.text())); };
watch(win);
const step = (s) => console.log('•', s);
const shot = async (n) => { await win.waitForTimeout(400); await win.screenshot({ path: `${OUT}/${n}.png` }); };
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.waitForTimeout(1500);
await app.close();
// Все карточки примера «выучены» 5 дней назад и ждут повторения сегодня — для «почему?».
const d = JSON.parse(fs.readFileSync(dir + '/mnema-data.json', 'utf8'));
const now = Date.now();
for (const c of d.cards) {
  const n = c.type === 'reverse' ? 2 : c.type === 'cloze' ? (c.front.match(/\{\{/g) || []).length : 1;
  for (let o = 0; o < Math.max(1, n); o++) d.states[c.id + ':' + o] = { due: new Date(now - 3600e3).toISOString(), stability: 5, difficulty: 5, elapsed_days: 5, scheduled_days: 5, reps: 3, lapses: 0, state: 2, last_review: new Date(now - 5 * 864e5).toISOString(), learning_steps: 0 };
}
fs.writeFileSync(dir + '/mnema-data.json', JSON.stringify(d));
app = await launch();
win = await app.firstWindow();
watch(win);
await win.waitForTimeout(1200);

// 1. План до контрольной: тема «Закон Ома», контрольная через 4 дня; одна новая карточка для плана
await win.locator('.tree-row.subject', { hasText: 'Физика' }).locator('.twisty').click();
await win.locator('.tree-row', { hasText: 'Закон Ома' }).locator('.tree-label').click();
await win.waitForTimeout(600);
await win.getByRole('button', { name: '+ Дата контрольной' }).click();
const ex = new Date(); ex.setDate(ex.getDate() + 4);
await win.locator('.topic-head input[type=date]').fill(ex.toISOString().slice(0, 10));
await win.locator('.title-input').click();
await win.waitForTimeout(500);
step('topic plan: ' + ((await win.locator('.topic-head .exam-plan').count()) ? (await win.locator('.topic-head .exam-plan').innerText()).replace(/\n/g, ' ') : 'НЕТ'));
await shot('p1-topic-plan');

// 2. Карточки из конспекта
await win.getByRole('button', { name: 'Действия с темой' }).click();
await win.getByRole('menuitem', { name: /Карточки из конспекта/ }).click();
await win.waitForTimeout(400);
step('drafts: ' + (await win.locator('.modal .bulk-row').count()) + ' | ' + (await win.locator('.modal h2').innerText()));
await shot('p2-notecards');
await win.locator('.modal').getByRole('button', { name: /^Добавить \d+/ }).click();
await win.waitForTimeout(400);
step('toast: ' + (await win.locator('.toast').innerText().catch(() => '—')));

// 3. Сегодня: план контрольной
await win.locator('.nav-item', { hasText: 'Сегодня' }).click();
await win.waitForTimeout(500);
step('today exam: ' + (await win.locator('.exam-card').innerText()).replace(/\n+/g, ' | ').slice(0, 220));
await win.evaluate(() => document.querySelector('.exam-card')?.scrollIntoView());
await shot('p3-today-exam');

// 4. Расписание: завтра Физика → «Подготовиться к завтра»
await win.locator('.add-schedule').click();
await win.getByRole('button', { name: 'Заполнить расписание' }).click();
const tdow = (new Date().getDay() + 1) % 7 || 1; // завтра (воскресенье → понедельник)
await win.locator('.sched-day').nth(tdow - 1).locator('.sched-add').click();
await win.locator('.sched-day').nth(tdow - 1).locator('.sched-pick-item', { hasText: 'Физика' }).click();
await win.getByRole('button', { name: 'Готово' }).click();
await win.waitForTimeout(400);
const prep = win.locator('.les-actions button', { hasText: 'Подготовиться' });
step('prep: ' + ((await prep.count()) ? await prep.innerText() : 'НЕТ'));
await win.evaluate(() => document.querySelector('.les-card')?.scrollIntoView());
await shot('p4-lessons');

// 5. Повторение: «почему?» на третьем верном ответе
await win.locator('.hero-btn').click();
await win.waitForTimeout(500);
let asked = false;
for (let i = 0; i < 8 && !asked; i++) {
  if (await win.locator('.modal', { hasText: 'Почему это так?' }).count()) { asked = true; break; }
  const q = await win.locator('.review-card .question').innerText().catch(() => '?');
  const typing = await win.locator('.review-card input').count();
  await win.keyboard.press(typing ? 'Enter' : 'Space');
  await win.waitForTimeout(250);
  const grades = await win.locator('.grade').allInnerTexts();
  console.log('  q:', q.slice(0, 40).replace(/\n/g, ' '), '| typing', typing, '| grades', grades.map((g) => g.split('\n')[0]).join(','));
  await win.keyboard.press('3');
  await win.waitForTimeout(400);
  if (await win.locator('.modal', { hasText: 'Почему это так?' }).count()) asked = true;
}
step('why asked: ' + asked);
await shot('p5-why');
if (asked) {
  await win.locator('.modal textarea').fill('Потому что так устроено');
  await win.keyboard.press('Enter');
  await win.waitForTimeout(400);
  step('why modal closed: ' + ((await win.locator('.modal', { hasText: 'Почему это так?' }).count()) === 0));
}
await win.keyboard.press('Escape');
await win.waitForTimeout(500);

// 6. Фото к домашке
await win.locator('.nav-item', { hasText: 'Домашка' }).click();
await win.waitForTimeout(300);
await win.locator('.hw-quick input[type=file]').setInputFiles('hwphoto.png');
await win.waitForTimeout(800);
step('thumbs: ' + (await win.locator('.hw-quick .photo-thumb').count()));
await win.locator('.hw-quick-input').press('Enter');
await win.waitForTimeout(500);
step('row photo: ' + (await win.locator('.hw-row .hw-photo').count()) + ' text=' + (await win.locator('.hw-row .hw-text-line').first().innerText()));
await win.locator('.hw-row .hw-photo').first().click();
await win.waitForTimeout(400);
await shot('p6-photo');
step('viewer: ' + (await win.locator('.photo-view img').count()));
await win.keyboard.press('Escape');

// 7. Обновления
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.locator('.set-nav-item', { hasText: 'О Мнеме' }).click();
await win.getByLabel('Репозиторий GitHub').fill('test-user/mnema');
await win.getByRole('button', { name: /Проверить обновления/ }).click();
await win.waitForTimeout(6000);
step('update result: ' + ((await win.locator('.update-box').count()) ? await win.locator('.update-box').innerText() : 'НЕТ'));
await shot('p7-update');
console.log('errors', JSON.stringify(errors));
await app.close();
