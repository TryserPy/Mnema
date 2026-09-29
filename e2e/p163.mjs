// Стихи: учить по частям (голос — имитация распознавания телефона), самопроверка, с любого места.
import { chromium } from 'playwright';
import fs from 'fs';
const OUT = 'out163p'; fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const mobile = W < 700;
const p = await b.newPage({ viewport: { width: W, height: 860 }, isMobile: mobile, hasTouch: mobile });
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text())); p.on('response', (r) => r.status() >= 400 && errors.push('HTTP ' + r.status() + ' ' + r.url()));
await p.addInitScript(() => {
  window.__script = [];
  window.mnemaApi = {
    load: () => localStorage.getItem('__mock'), save: async (j) => localStorage.setItem('__mock', j), saveSync: (j) => localStorage.setItem('__mock', j),
    speechStart() {
      const seg = window.__script.shift();
      setTimeout(() => {
        if (!seg) { window.__mnemaSpeech?.({ type: 'error', text: 'Не расслышал — скажи ответ ещё раз.' }); return; }
        const words = seg.text.split(' '); let i = 0;
        const t = setInterval(() => { i++; window.__mnemaSpeech?.({ type: 'partial', text: words.slice(0, i).join(' ') }); if (i >= words.length) { clearInterval(t); setTimeout(() => { window.__mnemaSpeech?.({ type: 'final', text: seg.text }); window.__mnemaSpeech?.({ type: 'end' }); }, 40); } }, 30);
      }, seg?.delay ?? 60);
      return { ok: true };
    },
    speechStop() {}
  };
});
const step = (s) => console.log('•', s);
const shot = async (n) => { await p.waitForTimeout(350); await p.screenshot({ path: `${OUT}/${W}-${n}.png` }); };
await p.goto('http://localhost:4174');
await p.getByRole('button', { name: 'Посмотреть на примере' }).click();
await p.waitForTimeout(500);
if (mobile) { await p.locator('button[aria-label="Меню"], button[aria-label="Открыть меню"]').first().click(); await p.waitForTimeout(300); }
await p.locator('.tree-row.subject', { hasText: 'История' }).locator('.twisty').click();
await p.locator('.tree-row.subject', { hasText: 'История' }).locator('xpath=following-sibling::*[1]').locator('.tree-label').first().click().catch(async () => {
  await p.locator('.tree-row:not(.subject)').filter({ hasNotText: 'Закон' }).locator('.tree-label').first().click();
});
await p.waitForTimeout(600);
step('topic: ' + (await p.locator('.title-input').inputValue().catch(() => '?')));
await p.getByRole('button', { name: 'Добавить словарь или список' }).click();
await p.getByRole('menuitem', { name: /Стихотворение/ }).click();
await p.waitForTimeout(400);
await p.getByLabel('Название', { exact: true }).fill('Зимнее утро');
await p.getByLabel('Автор').fill('А. С. Пушкин');
await p.locator('.poem-textarea').fill(`Мороз и солнце; день чудесный!
Ещё ты дремлешь, друг прелестный —
Пора, красавица, проснись:
Открой сомкнуты негой взоры

Навстречу северной Авроры,
Звездою севера явись!
Вечор, ты помнишь, вьюга злилась,
На мутном небе мгла носилась;`);
step('parts info: ' + (await p.locator('.poem-edit .field .small.muted').last().innerText()));
await shot('1-edit');
await p.getByRole('button', { name: 'Готово — учить' }).click();
await p.waitForTimeout(400);
step('tabs: ' + (await p.locator('.otabs > .otab').allInnerTexts()).join(' | ').replace(/\n/g, ''));
step('status: ' + (await p.locator('.poem-status').innerText()));
await shot('2-view');
await p.getByRole('button', { name: 'Начать учить' }).click();
for (const s of ['read', 'half', 'letters']) {
  step(s + ': ' + (await p.locator('.poem-cue').innerText()).replace(/\n/g, ' / ').slice(0, 90));
  if (s === 'letters') await shot('3-letters');
  await p.locator('.poem-stage .btn.primary').click();
  await p.waitForTimeout(150);
}
await shot('4-recall');
// часть 1 — голосом без ошибок, в два куска (как телефон с паузой)
await p.evaluate(() => (window.__script = [{ text: 'мороз и солнце день чудесный еще ты дремлешь друг прелестный' }, { text: 'пора красавица проснись открой сомкнуты негой взоры' }]));
await p.getByRole('button', { name: 'Рассказать вслух' }).click();
await p.waitForTimeout(1500);
step('live: ' + (await p.locator('.poem-live').innerText()).slice(0, 80));
await p.getByRole('button', { name: 'Готово' }).click();
await p.waitForTimeout(3500);
step('result1: ' + (await p.locator('.poem-score').innerText().catch(() => 'НЕТ')).replace(/\n/g, ' / '));
await p.locator('.poem-stage .btn.primary').click();
await p.waitForTimeout(300);
step('now: ' + (await p.locator('.poem-trainer > .row strong').first().innerText()));
for (let i = 0; i < 3; i++) { await p.locator('.poem-stage .btn.primary').click(); await p.waitForTimeout(120); }
// часть 2 — с ошибками: пропуск, замена, повтор и долгая пауза
await p.evaluate(() => (window.__script = [{ text: 'навстречу северной авроры звездою звездою севера явись' }, { text: 'вечор ты помнишь вьюга злилась на небе мгла кружилась', delay: 3600 }]));
await p.getByRole('button', { name: 'Рассказать вслух' }).click();
await p.waitForTimeout(6000);
await p.getByRole('button', { name: 'Готово' }).click();
await p.waitForTimeout(3500);
step('result2: ' + (await p.locator('.poem-score').innerText().catch(() => 'НЕТ')).replace(/\n/g, ' / '));
step('marks: miss=' + (await p.locator('.poem-diff .pw-miss').allInnerTexts()).join(',') + ' wrong=' + (await p.locator('.poem-diff .pw-wrong').allInnerTexts()).join(',') + ' stumble=' + (await p.locator('.poem-diff .pw-stumble').allInnerTexts()).join(','));
step('wide: ' + JSON.stringify(await p.evaluate(() => { const m = document.querySelector('.main'); const out = [...document.querySelectorAll('.main *')].filter((e) => e.getBoundingClientRect().right + m.scrollLeft > m.clientWidth + 1).slice(0, 6).map((e) => e.className + ':' + Math.round(e.getBoundingClientRect().right)); return { sl: m.scrollLeft, sw: m.scrollWidth, cw: m.clientWidth, out }; })));
await shot('5-result');
await p.getByRole('button', { name: 'Всё равно дальше' }).click();
await p.waitForTimeout(300);
step('together: ' + (await p.locator('.poem-recall strong').first().innerText()));
await p.getByRole('button', { name: 'Первые буквы' }).click();
await shot('6-together');
await p.getByRole('button', { name: /Рассказал — проверить/ }).click();
await p.locator('.poem-line.self').nth(6).click();
await shot('7-self');
await p.locator('.poem-stage .btn.ghost').click(); // «Дальше — ошибки в 1 строке»
await p.waitForTimeout(400);
step('done: ' + (await p.locator('.poem-done').innerText().catch(() => 'НЕТ')).replace(/\n/g, ' / ').slice(0, 120));
await shot('8-done');
await p.getByRole('button', { name: 'Готово' }).click();
await p.waitForTimeout(300);
step('status after: ' + (await p.locator('.poem-status').innerText()) + ' hard lines: ' + (await p.locator('.poem-line.hard').count()));
await shot('9-view-after');
// С любого места
await p.getByRole('button', { name: 'С любого места' }).click();
for (let i = 0; i < 5; i++) {
  if (!(await p.locator('.poem-given').count())) break;
  if (i === 0) step('random given: ' + (await p.locator('.poem-given').innerText()) + ' → ' + (await p.locator('.poem-recall .pw-blank').count()) + ' blanks');
  await p.getByRole('button', { name: /Рассказал — проверить/ }).click();
  await p.getByRole('button', { name: /Дальше/ }).click();
  await p.waitForTimeout(150);
}
step('random done: ' + (await p.locator('.poem-done strong').innerText().catch(() => 'НЕТ')));
await shot('10-random');
await p.getByRole('button', { name: 'Готово' }).click();
const ovf = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
step('overflow ' + ovf);
const data = JSON.parse(await p.evaluate(() => localStorage.getItem('__mock')));
const poem = data.topics.flatMap((t) => t.poems ?? [])[0];
step('saved: learned=' + poem.learned + ' review=' + JSON.stringify(poem.review) + ' miss=' + JSON.stringify(poem.lineMiss) + ' history=' + poem.history.length);
console.log('errors', JSON.stringify(errors));
await b.close();
