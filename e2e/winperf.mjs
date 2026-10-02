// Лаги окон: сколько длятся самые долгие кадры, пока открывается окно или меню (большой набор данных, процессор в N раз медленнее).
// Запуск: URL=http://localhost:4174 RATE=4 NODE_PATH=$(npm root -g) node e2e/winperf.mjs
import { chromium } from 'playwright';
const URL = process.env.URL ?? 'http://localhost:4174';
const RATE = Number(process.env.RATE ?? 4);
const SUBJ = Number(process.env.SUBJ ?? 12);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
await page.evaluate((SUBJ) => {
  const at = new Date(Date.now() - 20 * 864e5).toISOString();
  const d = { version: 1, subjects: [], topics: [], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true } };
  for (let s = 0; s < SUBJ; s++) {
    d.subjects.push({ id: 's' + s, name: 'Предмет ' + s, color: '#3F51D8', createdAt: at });
    for (let t = 0; t < 10; t++) {
      const tid = `t${s}_${t}`;
      const note = Array.from({ length: 40 }, (_, i) => `**Понятие ${i}** — это определение номер ${i}. Формула $F_${i} = m a^2$. В ${1800 + i} году случилось событие.`).join('\n\n');
      d.topics.push({ id: tid, subjectId: 's' + s, name: `§${t + 1} Тема ${t + 1}`, note, createdAt: at, updatedAt: at });
      for (let c = 0; c < 30; c++) {
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
}, SUBJ);
await page.reload();
await page.waitForTimeout(1000);
await page.locator('.tree-row.subject', { hasText: 'Предмет 2' }).locator('.twisty').click();
await page.locator('.tree-row', { hasText: '§3 Тема 3' }).locator('.tree-label').click();
await page.locator('.ProseMirror').waitFor();
await page.waitForTimeout(800);
if (process.env.TODAY) { await page.locator('.nav-item, .sidebar button, a', { hasText: 'Сегодня' }).first().click(); await page.waitForTimeout(800); }
if (process.env.NOANIM) await page.evaluate(() => document.documentElement.setAttribute('data-no-windows', ''));
if (process.env.CSS) await page.addStyleTag({ content: process.env.CSS });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
console.log(`карточек: ${SUBJ * 300}, процессор ×${RATE} медленнее`);

async function measure(label, open, close) {
  let traceLine = '';
  await page.evaluate(() => {
    window.__fr = [];
    window.__loaf = [];
    window.__go = true;
    let last = performance.now();
    const tick = (t) => { window.__fr.push(t - last); last = t; if (window.__go) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__loaf.push({ d: e.duration, b: e.blockingDuration, s: e.scripts.map((x) => `${x.sourceFunctionName || x.invoker}:${Math.round(x.duration)}`).join(',') }))).observe({ type: 'long-animation-frame', buffered: false }); } catch {}
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__fr.length = 0; window.__loaf.length = 0; });
  if (process.env.TRACE) await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute'] });
  if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 300 }); await cdp.send('Profiler.start'); }
  await open();
  await page.waitForTimeout(700);
  if (process.env.PROFILE) {
    const { profile } = await cdp.send('Profiler.stop');
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const self = new Map();
    const incl = new Map();
    for (let i = 0; i < profile.samples.length; i++) {
      const dt = (profile.timeDeltas[i] ?? 0) / 1000;
      let id = profile.samples[i];
      const n0 = byId.get(id);
      const k0 = `${n0.callFrame.functionName || '(anon)'} ${n0.callFrame.url.split('/').pop()}:${n0.callFrame.lineNumber}`;
      self.set(k0, (self.get(k0) ?? 0) + dt);
      const seen = new Set();
      for (; id; id = parent.get(id)) { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + dt); } }
    }
    const top = (m, n) => [...m.entries()].filter(([k]) => !/^\((idle|program|root|garbage)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `     ${v.toFixed(0)}мс ${k}`).join('\n');
    console.log('   САМО (×' + RATE + '):\n' + top(self, 7) + '\n   ВКЛЮЧАЯ ВЛОЖЕННЫЕ:\n' + top(incl, 12));
  }
  if (process.env.TRACE) {
    const ev = JSON.parse((await browser.stopTracing()).toString()).traceEvents;
    const mainTid = ev.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
    const by = new Map();
    for (const e of ev) if (e.ph === 'X' && e.tid === mainTid?.tid && e.pid === mainTid?.pid && ['EvaluateScript', 'FunctionCall', 'UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'RunMicrotasks', 'TimerFire', 'FireAnimationFrame', 'HitTest', 'IntersectionObserverController::computeIntersections'].includes(e.name)) by.set(e.name, (by.get(e.name) ?? 0) + e.dur / 1000);
    if (process.env.PAINTS) {
      const pt = ev.filter((e) => e.ph === 'X' && e.name === 'Paint' && e.tid === mainTid?.tid && e.dur > 500).map((e) => { const c = e.args?.data?.clip; const w = c ? Math.round(Math.hypot(c[2] - c[0], c[3] - c[1]) * 0.7) : '?'; return `${(e.dur / 1000).toFixed(1)}мс клип≈${c ? Math.round(c[2] - c[0]) + '×' + Math.round(c[5] - c[1]) : '?'} слой ${e.args?.data?.layerId ?? '?'}`; });
      console.log('   отрисовка: ' + pt.slice(0, 8).join(' | '));
    }
    traceLine = '   трасса: ' + [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}мс`).join(', ');
  }
  const r = await page.evaluate(() => { window.__go = false; return { fr: window.__fr.slice(), loaf: window.__loaf.slice() }; });
  const fr = r.fr.filter((x) => x > 0);
  const max = Math.max(...fr);
  const slow = fr.filter((x) => x > 24).length;
  console.log(`${label.padEnd(34)} кадров ${String(fr.length).padStart(3)}, самый долгий ${max.toFixed(0).padStart(4)} мс, медленных (>24 мс) ${slow}, длинных задач ${r.loaf.length}${r.loaf.length ? ' [' + r.loaf.map((x) => `${x.d.toFixed(0)}мс ${x.s}`).join(' | ').slice(0, 220) + ']' : ''}`);
  if (traceLine) console.log(traceLine);
  await close();
  await page.waitForTimeout(500);
}
const esc = async () => { await page.keyboard.press('Escape'); };

if (process.env.PROBEVARS) {
  const variants = {
    'весь экран (как у окон)': 'position:fixed;inset:0;background:rgba(20,22,30,.45);z-index:65',
    'весь экран ещё раз': 'position:fixed;inset:0;background:rgba(20,22,30,.45);z-index:65',
    'весь экран, третий раз': 'position:fixed;inset:0;background:rgba(20,22,30,.45);z-index:65'
  };


  for (const [name, css] of Object.entries(variants)) await measure('вставка: ' + name, () => page.evaluate((c) => { const d = document.createElement('div'); d.id = '__probe'; d.style.cssText = c; document.body.appendChild(d); }, css), () => page.evaluate(() => document.getElementById('__probe')?.remove()));
  await browser.close();
  process.exit(0);
}
await measure('ПУСТОЙ fixed-блок (без React)', () => page.evaluate(() => { const d = document.createElement('div'); d.id = '__probe'; d.style.cssText = 'position:fixed;inset:0;background:rgba(20,22,30,.45);z-index:65'; document.body.appendChild(d); }), () => page.evaluate(() => document.getElementById('__probe')?.remove()));
await measure('Ctrl+P: поиск', () => page.keyboard.press('Control+p'), esc);
await measure('Вставить (меню в конспекте)', () => page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Вставить').click()), esc);
await measure('Дата контрольной (окно)', () => page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Дата контрольной')).click()), async () => { await page.getByRole('button', { name: 'Отмена' }).first().click().catch(() => esc()); });
await measure('Правая кнопка по теме (меню)', () => page.evaluate(() => { const r = [...document.querySelectorAll('.tree-row')].find((x) => x.textContent.includes('§3 Тема 3')); const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.x + 40, clientY: b.y + 10, button: 2 })); }), esc);
await measure('Значок «⋯» у темы', () => page.locator('.page .icon-btn', { has: page.locator('svg') }).filter({ hasText: '' }).nth(1).click().catch(() => {}), esc);
await measure('Настройки (кнопка слева)', () => page.locator('.rail-foot button, .sidebar-foot button').nth(2).click().catch(() => {}), async () => { await page.getByRole('button', { name: 'Сегодня' }).first().click().catch(() => {}); });
await browser.close();
console.log(errors.length ? 'Ошибки страницы: ' + errors.join(' | ') : 'Ошибок страницы нет');
