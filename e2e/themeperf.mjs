import { _electron as electron } from 'playwright';
import fs from 'fs';
const dir = '/tmp/mnemaTP'; fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
await win.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.waitForTimeout(600);
const cdp = await win.context().newCDPSession(win);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.RATE || 4) });
for (const name of (process.env.SEQ || 'Тёмная,Светлая,Тёмная,Светлая').split(',')) {
  await win.evaluate(() => { window.__f = []; let last = performance.now(); const end = last + 1000; const tick = (t) => { window.__f.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await win.getByRole('radio', { name, exact: true }).first().click().catch(async () => await win.getByRole('button', { name, exact: true }).first().click());
  await win.waitForTimeout(1100);
  const f = await win.evaluate(() => window.__f);
  console.log(name, 'frames', f.length, 'worst', Math.round(Math.max(...f)), 'sum>50', Math.round(f.filter((x) => x > 50).reduce((a, b) => a + b, 0)));
}
await app.close();
