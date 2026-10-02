// Телефон: 390px, процессор в 6 раз медленнее. Сколько длится открытие темы и где время.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto('http://localhost:4174');
// данные: 6 предметов × 8 тем × 25 карточек, конспекты с формулами
await page.evaluate(() => {
  const at = new Date(Date.now() - 20 * 864e5).toISOString();
  const d = { version: 1, subjects: [], topics: [], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true } };
  for (let s = 0; s < 6; s++) {
    d.subjects.push({ id: 's' + s, name: 'Предмет ' + s, color: '#3F51D8', createdAt: at });
    for (let t = 0; t < 8; t++) {
      const tid = `t${s}_${t}`;
      const note = Array.from({ length: 30 }, (_, i) => `**Понятие ${i}** — это определение номер ${i}. Формула $F_${i} = m a^2$. В ${1800 + i} году случилось событие.`).join('\n\n');
      d.topics.push({ id: tid, subjectId: 's' + s, name: `§${t + 1} Тема ${t + 1}`, note, createdAt: at, updatedAt: at });
      for (let c = 0; c < 25; c++) {
        const id = `${tid}_${c}`;
        d.cards.push({ id, topicId: tid, type: 'basic', front: 'Вопрос ' + c + ' $x^2$', back: 'Ответ ' + c, createdAt: at, updatedAt: at });
        if (c % 2) {
          d.states[id + ':0'] = { due: new Date(Date.now() + (c - 12) * 864e5).toISOString(), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: at };
          for (let k = 0; k < 3; k++) d.logs.push({ key: id + ':0', cardId: id, topicId: tid, rating: 3, prevState: 2, at: new Date(Date.now() - (k * 5 + c) * 864e5).toISOString(), ms: 4000 });
        }
      }
    }
  }
  d.logs.sort((a, b) => a.at.localeCompare(b.at));
  localStorage.setItem('mnema-data', JSON.stringify(d));
});
await page.reload();
await page.waitForTimeout(800);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
async function prof(label, fn) {
  await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: false }); });
  await cdp.send('Profiler.start');
  const a = Date.now();
  await fn();
  const ms = Date.now() - a;
  await page.waitForTimeout(600);
  const { profile } = await cdp.send('Profiler.stop');
  const lt = await page.evaluate(() => window.__lt);
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`;
    self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  }
  console.log(`== ${label}: ${ms} ms, long tasks: ${lt.map((x) => Math.round(x)).join(', ')}`);
  console.log([...self.entries()].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => '  ' + v.toFixed(0) + 'ms ' + k).join('\n'));
}
await prof('open drawer', async () => { await page.getByRole('button', { name: 'Знания' }).click(); await page.waitForTimeout(300); });
await prof('expand subject', async () => { await page.locator('.tree-row.subject', { hasText: 'Предмет 2' }).locator('.twisty').click(); await page.locator('.tree-row', { hasText: '§3 Тема 3' }).waitFor(); });
await prof('open topic', async () => { await page.locator('.tree-row', { hasText: '§3 Тема 3' }).locator('.tree-label').click(); await page.locator('.ProseMirror').waitFor(); });
await prof('open topic 2', async () => { await page.getByRole('button', { name: 'Знания' }).click(); await page.waitForTimeout(300); await page.locator('.tree-row', { hasText: '§4 Тема 4' }).locator('.tree-label').click(); await page.locator('.ProseMirror').waitFor(); });
await prof('type 20 chars', async () => { await page.locator('.ProseMirror p').first().click({ position: { x: 4, y: 6 } }); await page.keyboard.type('Проверка набора тек'); });
await page.screenshot({ path: 'out-r/pp-after-type.png' }); console.log('modal:', await page.locator('.modal h2').allInnerTexts());
await prof('open subject', async () => { await page.getByRole('button', { name: 'Знания' }).click(); await page.waitForTimeout(300); await page.locator('.tree-row.subject', { hasText: 'Предмет 3' }).locator('.tree-label').click(); await page.locator('.topic-row').first().waitFor(); });
await browser.close();
