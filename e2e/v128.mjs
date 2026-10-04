// 1.28.0: знакомство засчитывает шаги (короткий конспект, «Пропустить шаг»); стихи «под себя»: выбор строк, «уже знаю», «не учу»,
// «повторять чаще», свои подсказки, старт с любой строки, шаги учёбы.
// Запуск: URL=http://localhost:4174 OUT=out node e2e/v128.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT ?? 'out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
const errors = [];
const at = new Date(Date.now() - 5 * 864e5).toISOString();
const POEM = 'Мороз и солнце; день чудесный!\nЕщё ты дремлешь, друг прелестный —\nПора, красавица, проснись:\nОткрой сомкнуты негой взоры\n\nНавстречу северной Авроры,\nЗвездою севера явись!\nВечор, ты помнишь, вьюга злилась,\nНа мутном небе мгла носилась;';
const SEED = ([at, poem]) => {
  localStorage.setItem('mnema-data', JSON.stringify({ version: 1, folders: [], subjects: [{ id: 's1', name: 'Литература', color: '#05f', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Пушкин', note: 'Конспект про Пушкина.', createdAt: at, updatedAt: at, poems: [{ id: 'p1', title: 'Зимнее утро', author: 'А. С. Пушкин', text: poem, chunk: 0, learned: 0, createdAt: at, updatedAt: at }] }], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true } }));
};
// Данные хранятся в IndexedDB и пишутся с задержкой 400 мс.
const stored = async (page) => {
  await page.waitForTimeout(700);
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open('mnema-web', 1);
        r.onsuccess = () => {
          const g = r.result.transaction('kv').objectStore('kv').get('data');
          g.onsuccess = () => resolve(JSON.parse(g.result).topics[0].poems[0]);
        };
      })
  );
};

for (const [w, h, phone] of [[1280, 800, false], [390, 844, true]]) {
  const tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(SEED, [at, POEM]);
  await page.reload();
  await page.waitForTimeout(800);
  // открыть стих
  if (phone) { await page.locator('.tab', { hasText: 'Знания' }).click(); await page.waitForTimeout(300); await page.locator('.know-tile', { hasText: 'Литература' }).click(); }
  else await page.locator('.sidebar .tree-row.subject .tree-label', { hasText: 'Литература' }).click();
  await page.waitForTimeout(400);
  await page.locator('.main .topic-row', { hasText: 'Пушкин' }).click();
  await page.waitForTimeout(600);
  if (await page.getByRole('tab', { name: /Зимнее утро/ }).count()) await page.getByRole('tab', { name: /Зимнее утро/ }).click();
  else { await page.locator('.otab-more > .otab').click(); await page.waitForTimeout(300); await page.getByRole('menuitem', { name: /Зимнее утро/ }).click(); }
  await page.waitForTimeout(600);
  check((await page.locator('.poem-line.pick').count()) === 8, `${tag}: 8 строк можно выбирать`);
  // 1. выбрать строку — появляется панель
  await page.locator('.poem-line.pick').nth(4).click();
  check((await page.locator('.poem-bar').innerText()).includes('Выбрано: 1 строка'), `${tag}: выбрал строку — панель «Выбрано: 1 строка»`);
  // 2. с этой строки — тренажёр начинается с неё
  await page.getByRole('button', { name: 'Начать с этой строки' }).click();
  await page.waitForTimeout(400);
  let head = await page.locator('.poem-trainer strong').first().innerText();
  check(/Часть 1 из 1/.test(head) && /5–8/.test(head), `${tag}: учить с 5-й строки — одна часть, строки 5–8 («${head}»)`);
  await page.screenshot({ path: `${OUT}/v128-${tag}-learn.png` });
  await page.getByRole('button', { name: 'Перерыв' }).click();
  await page.waitForTimeout(300);
  // 3. уже знаю 1–4
  await page.locator('.poem-bar button', { hasText: 'Снять' }).click();
  await page.locator('.poem-line.pick').nth(0).click();
  await page.locator('.poem-line.pick').nth(3).click({ modifiers: ['Shift'] });
  check((await page.locator('.poem-bar').innerText()).includes('Выбрано: 4 строки'), `${tag}: Shift — выбрался диапазон из 4 строк`);
  await page.getByRole('button', { name: 'Уже знаю' }).click();
  await page.waitForTimeout(300);
  let p = await stored(page);
  check(JSON.stringify(p.knownLines) === '[0,1,2,3]' && p.learned === 1, `${tag}: «Уже знаю» записалось (${JSON.stringify(p.knownLines)}, частей ${p.learned})`);
  check((await page.locator('.poem-status').innerText()).includes('Выучено 4 из 8'), `${tag}: статус «Выучено 4 из 8»`);
  // 4. не учу строку 8
  await page.locator('.poem-bar button', { hasText: 'Снять' }).click();
  await page.locator('.poem-line.pick').nth(7).click();
  await page.getByRole('button', { name: 'Не учу' }).click();
  await page.waitForTimeout(300);
  p = await stored(page);
  check(JSON.stringify(p.skipLines) === '[7]', `${tag}: «Не учу» записалось`);
  check((await page.locator('.poem-status').innerText()).includes('Выучено 4 из 7') && (await page.locator('.poem-status').innerText()).includes('не учу: 1'), `${tag}: статус «Выучено 4 из 7 · не учу: 1»`);
  // 5. повторять чаще + своя подсказка «Открыта» для строки 6
  await page.locator('.poem-bar button', { hasText: 'Снять' }).click();
  await page.locator('.poem-line.pick').nth(5).click();
  await page.locator('.poem-bar button', { hasText: 'Повторять чаще' }).click();
  await page.locator('.poem-bar button', { hasText: 'Открыта' }).click();
  await page.waitForTimeout(300);
  p = await stored(page);
  check(JSON.stringify(p.focusLines) === '[5]' && p.lineCue?.['5'] === 0, `${tag}: «Повторять чаще» и «Открыта» записались`);
  check((await page.getByRole('button', { name: /Повторить отмеченное/ }).count()) === 1, `${tag}: появилась кнопка «Повторить отмеченное»`);
  // 6. учить дальше: строки 5,6,7 — «по памяти», строка 6 открыта
  await page.locator('.poem-bar button', { hasText: 'Снять' }).click();
  await page.getByRole('button', { name: /Учить дальше/ }).click();
  await page.waitForTimeout(300);
  head = await page.locator('.poem-trainer strong').first().innerText();
  check(/Часть 1 из 1/.test(head) && /5–7/.test(head), `${tag}: «Учить дальше» берёт только невыученное и без «не учу» («${head}»)`);
  for (let i = 0; i < 3; i++) { await page.locator('.poem-stage .btn.primary').first().click(); await page.waitForTimeout(250); }
  const recallText = await page.locator('.poem-stage .poem-cue').innerText();
  check(/Звездою севера явись/.test(recallText) || /Звездою/.test(recallText), `${tag}: по памяти строка 6 открыта по моей настройке («${recallText.replace(/\n/g, ' / ').slice(0, 70)}»)`);
  check(!/Навстречу/.test(recallText), `${tag}: остальные строки спрятаны`);
  // подсказка нажатием на слово
  const blanks = await page.locator('.poem-stage .pw-tap').count();
  await page.locator('.poem-stage .pw-tap').first().click();
  check((await page.locator('.poem-stage .pw-tap').count()) === blanks - 1, `${tag}: нажал на спрятанное слово — оно открылось`);
  await page.getByRole('button', { name: /^Строку$/ }).click();
  check((await page.locator('.poem-stage .pw-hinted').count()) >= 2, `${tag}: «Строку» открывает строку целиком`);
  await page.screenshot({ path: `${OUT}/v128-${tag}-recall.png` });
  // пройти до конца самопроверкой
  await page.getByRole('button', { name: 'Рассказал — проверить' }).click();
  await page.waitForTimeout(300);
  await page.locator('.poem-stage .btn', { hasText: /дальше/i }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/v128-${tag}-after.png` });
  for (let g = 0; g < 6 && (await page.locator('.poem-done').count()) === 0; g++) {
    const btn = page.locator('.poem-stage .btn').filter({ hasText: /дальше|Рассказал — проверить|Готово|Прочитал/i }).first();
    if (!(await btn.count())) break;
    await btn.click(); await page.waitForTimeout(300);
  }
  check((await page.locator('.poem-done').count()) === 1, `${tag}: часть пройдена — экран «выучено»`);
  await page.getByRole('button', { name: 'Готово' }).click();
  await page.waitForTimeout(300);
  p = await stored(page);
  check(JSON.stringify(p.knownLines) === '[0,1,2,3,4,5,6]', `${tag}: выученное сохранилось (${JSON.stringify(p.knownLines)})`);
  check(!!p.review, `${tag}: всё, что учу, выучено — назначен первый повтор`);
  check((await page.locator('.poem-status').innerText()).includes('Выучен целиком'), `${tag}: статус «Выучен целиком» (строка «не учу» не мешает)`);
  // 7. слова-подсказки
  await page.getByRole('button', { name: /Слова-подсказки/ }).click();
  await page.locator('.pickrow .pw-pick').first().click();
  await page.getByRole('button', { name: 'Готово' }).click();
  p = await stored(page);
  check(JSON.stringify(p.pinWords) === '["0:0"]', `${tag}: слово «Мороз» закреплено открытым`);
  // 8. настройки стиха: шаги, срок, смена частей не стирает выученное
  await page.getByRole('button', { name: 'Изменить стих' }).click();
  await page.waitForTimeout(300);
  await page.locator('.poem-edit .chip-btn', { hasText: 'Прочитать' }).click();
  await page.locator('.poem-edit .seg button', { hasText: '2 строки' }).click();
  await page.locator('.poem-edit input[type=date]').fill('2099-01-01');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.waitForTimeout(400);
  p = await stored(page);
  check(!p.steps.includes('read') && p.chunk === 2 && p.deadline === '2099-01-01', `${tag}: шаги, размер частей и срок сохранились`);
  check(JSON.stringify(p.knownLines) === '[0,1,2,3,4,5,6]' && p.learned >= 3, `${tag}: размер частей поменялся — выученное осталось (${JSON.stringify(p.knownLines)})`);
  await ctx.close();
}
console.log(errors.length ? 'ОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n') : 'ошибок страницы нет');
await browser.close();
process.exit(bad ? 1 : 0);
