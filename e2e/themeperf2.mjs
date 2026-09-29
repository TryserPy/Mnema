import { _electron as electron } from 'playwright';
import fs from 'fs';
const dir = '/tmp/mnemaTP'; fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.waitForTimeout(600);
const cdp = await win.context().newCDPSession(win);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await win.evaluate(() => { const st = document.createElement('style'); st.textContent = "html.theme-fade, html.theme-fade *, html.theme-fade *::before, html.theme-fade *::after { transition: background-color 0.4s ease, color 0.4s ease, border-color 0.4s ease, fill 0.4s ease, box-shadow 0.4s ease !important; }"; document.head.appendChild(st); });
for (const mode of ['old', 'vt', 'instant', 'old', 'vt', 'instant']) {
  const f = await win.evaluate(async (mode) => {
    const r = document.documentElement;
    const P = r.dataset.theme === 'dark' ? { '--bg': '#F6F3EC', '--surface': '#FFFFFF', '--ink': '#1E2230', '--side': '#EFEBE2', '--line': '#E6E1D6' } : { '--bg': '#15171E', '--surface': '#20232D', '--ink': '#F1EFE9', '--side': '#1B1E27', '--line': '#2E3240' };
    const apply = () => { r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark'; for (const [k, v] of Object.entries(P)) r.style.setProperty(k, v); };
    const fr = []; let last = performance.now(); const end = last + 1000;
    await new Promise((res) => { const tick = (t) => { fr.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick);
      if (mode === 'old') { r.classList.add('theme-fade'); apply(); setTimeout(() => r.classList.remove('theme-fade'), 450); }
      else if (mode === 'vt') document.startViewTransition(apply); else apply(); });
    return fr;
  }, mode);
  console.log(mode.padEnd(8), 'frames', f.length, 'worst', Math.round(Math.max(...f)), 'jank ms', Math.round(f.filter((x) => x > 34).reduce((a, b) => a + b, 0)));
  await win.waitForTimeout(400);
}
await app.close();
