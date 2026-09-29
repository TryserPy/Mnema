// Переключение между темами: сколько кадров теряется и где время. RATE=4 — замедлить процессор.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const DATA = process.env.DATA || '/tmp/mnemaBench';
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: DATA } });
const win = await app.firstWindow();
await win.waitForTimeout(1500);
if (await win.getByRole('button', { name: 'Посмотреть на примере' }).count()) await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.waitForTimeout(800);
const cdp = await win.context().newCDPSession(win);
const rate = Number(process.env.RATE || 1);
if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 300 });
// раскрыть первые два предмета
const subs = win.locator('.tree-row.subject');
for (let i = 0; i < 2; i++) await subs.nth(i).locator('.twisty').click();
await win.waitForTimeout(500);
const topics = win.locator('.tree-row:not(.subject):not(.folder) .tree-label');
const n = Math.min(await topics.count(), 6);
console.log('topics visible', n);
const self = new Map();
let total = [];
for (let r = 0; r < 2; r++)
  for (let i = 0; i < n; i++) {
    await win.evaluate(() => {
      window.__f = [];
      let last = performance.now();
      const end = last + 1500;
      const tick = (t) => { window.__f.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await cdp.send('Profiler.start');
    await topics.nth(i).click();
    await win.waitForTimeout(1600);
    const { profile } = await cdp.send('Profiler.stop');
    const byId = new Map(profile.nodes.map((x) => [x.id, x]));
    for (let k = 0; k < profile.samples.length; k++) {
      const x = byId.get(profile.samples[k]);
      const key = `${x.callFrame.functionName || '(anon)'} ${x.callFrame.url.split('/').pop()}:${x.callFrame.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[k] ?? 0) / 1000);
    }
    const f = await win.evaluate(() => window.__f);
    const long = f.filter((x) => x > 50);
    total.push(Math.max(...f));
    console.log(`switch ${r}.${i}: frames ${f.length}, worst ${Math.round(Math.max(...f))}ms, >50ms: ${long.map(Math.round).join(',')}`);
  }
console.log([...self.entries()].filter(([k]) => !/^\((idle|program|root|garbage)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => '  ' + v.toFixed(0) + 'ms ' + k).join('\n'));
await app.close();
