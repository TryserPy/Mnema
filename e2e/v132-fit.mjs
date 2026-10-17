// 1.32, N4: «Подогнать расписание под меня» на телефоне и ПК. Журнал ответов — синтетический ученик, который
// забывает быстрее обычного. Проверяем: мало ответов — сколько ещё нужно; подгонка с полосой хода; «Включить»;
// «Вернуть обычное». Запуск: vite preview --mode web …, затем URL=… OUT=… node e2e/v132-fit.mjs
import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { createRequire } from 'module';
import { seed } from './v132-seed.mjs';

const require = createRequire(import.meta.url);
const { default_w, FSRSAlgorithm, forgetting_curve } = require('ts-fsrs');
const URL = process.env.URL ?? 'http://localhost:4174';
const OUT = process.env.OUT;
if (OUT) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || bad++);

function simulate(cards, days) {
  let x = 7;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const trueW = [...default_w];
  for (const i of [0, 1, 2, 3]) trueW[i] = default_w[i] * 0.35;
  trueW[8] = default_w[8] - 0.7;
  const truth = new FSRSAlgorithm({ w: trueW });
  const sched = new FSRSAlgorithm({ w: [...default_w] });
  const logs = [];
  const t0 = Date.now() - days * 86400000;
  for (let c = 0; c < cards; c++) {
    let day = Math.floor((c / cards) * days * 0.5);
    let ts = null;
    let ss = null;
    let last = day;
    let prev = 0;
    while (day < days) {
      const t = ss ? day - last : 0;
      const p = ts ? forgetting_curve(trueW, t, ts.stability) : 0.5;
      const g = !ts ? (rnd() < 0.7 ? 3 : 1) : rnd() < p ? 3 : 1;
      logs.push({ key: `c${(c % 20) + 1}:${Math.floor(c / 20)}`, cardId: `c${(c % 20) + 1}`, topicId: 'g1', rating: g, prevState: prev, at: new Date(t0 + day * 86400000 + c * 1000).toISOString(), ms: 3000 });
      ts = truth.next_state(ts, t, g);
      ss = sched.next_state(ss, t, g);
      prev = 2;
      last = day;
      day += Math.max(1, sched.next_interval(ss.stability, t));
    }
  }
  return logs;
}

for (const v of [
  { name: '360', width: 360, height: 800, logs: simulate(260, 180) },
  { name: '390-мало', width: 390, height: 844, logs: simulate(15, 40) },
  { name: 'desk', width: 1280, height: 820, logs: simulate(260, 180) }
]) {
  const mobile = v.width < 900;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(
    ({ data }) => {
      sessionStorage.setItem('mnema-web-test-ok', '1');
      sessionStorage.setItem('refrain-no-splash', String(Date.now()));
      localStorage.setItem('mnema-data-pending', JSON.stringify(data));
      localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'settings', section: 'study' }, at: Date.now() } }));
    },
    { data: { ...seed(), logs: v.logs } }
  );
  await page.reload();
  await page.waitForTimeout(900);
  if (OUT) await page.screenshot({ path: join(OUT, `fit-start-${v.width}.png`) });
  await page.locator('.srow', { hasText: 'Подогнать расписание под меня' }).getByRole('button').click();
  const dlg = page.locator('.modal');
  if (v.name.includes('мало')) {
    const t = await dlg.innerText();
    check(/Нужно больше ответов: \d+ из.300/.test(t) && /примерно через \d+/.test(t), `${v.name}: мало ответов — сколько ещё и когда хватит`);
    check(await dlg.getByRole('button', { name: 'Подогнать' }).isDisabled(), `${v.name}: кнопка «Подогнать» недоступна`);
    if (OUT) await page.screenshot({ path: join(OUT, `fit-few-${v.width}.png`) });
  } else {
    const t0 = Date.now();
    await dlg.getByRole('button', { name: 'Подогнать' }).click();
    await dlg.getByRole('button', { name: 'Включить' }).waitFor({ timeout: 120000 });
    const txt = await dlg.innerText();
    check(/Прогноз стал точнее: ошибка [\d,]+.% → [\d,]+.%/.test(txt) && /чаще/.test(txt), `${v.name}: подгонка за ${Math.round((Date.now() - t0) / 100) / 10} с — «${txt.match(/Прогноз[^\n]*/)?.[0]}»`);
    if (OUT) await page.screenshot({ path: join(OUT, `fit-done-${v.width}.png`) });
    await dlg.getByRole('button', { name: 'Включить' }).click();
    await page.waitForTimeout(300);
    const hint = await page.locator('.srow', { hasText: 'Подогнать расписание под меня' }).innerText();
    check(/Подогнано .* прогноз точнее/.test(hint), `${v.name}: в настройках — «${hint.split('\n')[1]}»`);
    await page.locator('.srow', { hasText: 'Подогнать расписание под меня' }).getByRole('button').click();
    await dlg.getByRole('button', { name: 'Вернуть обычное' }).click();
    await dlg.getByRole('button', { name: 'Точно вернуть?' }).click();
    await page.waitForTimeout(300);
    check(/Вернул обычное расписание/.test(await page.locator('.toast').first().innerText()), `${v.name}: «Вернуть обычное» работает`);
  }
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  check(wide, `${v.name}: без прокрутки вбок`);
  check(!errors.length, `${v.name}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
