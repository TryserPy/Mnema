import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = 'garden'; fs.mkdirSync(OUT, { recursive: true });
const dir = '/tmp/mnemaG'; fs.rmSync(dir, { recursive: true, force: true });
fs.cpSync('/tmp/mnemaBench', dir, { recursive: true });
// разнообразим стадии: для каждой темы — своя доля выученных
const d = JSON.parse(fs.readFileSync(dir + '/mnema-data.json', 'utf8'));
d.settings.features.garden = true;
const byTopic = new Map();
for (const c of d.cards) (byTopic.get(c.topicId) ?? byTopic.set(c.topicId, []).get(c.topicId)).push(c);
let k = 0;
for (const t of d.topics.slice(0, 40)) {
  const cards = byTopic.get(t.id) ?? [];
  const frac = [0, 0.02, 0.12, 0.3, 0.45, 0.65, 0.85, 1][k % 8];
  const started = k % 8 === 0 ? 0 : 1;
  cards.forEach((c, i) => {
    for (const key of Object.keys(d.states)) if (key.startsWith(c.id)) delete d.states[key];
    if (!started) return;
    const learned = i < frac * cards.length;
    const now = Date.now();
    d.states[c.id + ':0'] = { due: new Date(now + (learned ? 20 : (k % 5 === 4 ? -3 : 1)) * 864e5).toISOString(), stability: learned ? 30 : 1, difficulty: 5, elapsed_days: 1, scheduled_days: 1, reps: 3, lapses: 0, state: learned ? 2 : 1, last_review: new Date(now - 864e5).toISOString(), learning_steps: 0 };
  });
  k++;
}
fs.writeFileSync(dir + '/mnema-data.json', JSON.stringify(d));
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: dir } });
const win = await app.firstWindow();
const errors = []; win.on('pageerror', (e) => errors.push(e.message));
await win.waitForTimeout(1500);
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 1000));
await win.getByRole('button', { name: 'Статистика' }).first().click().catch(async () => await win.locator('button[title="Статистика"]').first().click());
await win.waitForTimeout(500);
await win.getByRole('radio', { name: /Сад/ }).click().catch(async () => await win.getByRole('tab', { name: /Сад/ }).click());
await win.waitForTimeout(1200);
await win.screenshot({ path: OUT + '/g1.png' });
await win.locator('.plant-btn').nth(5).click();
await win.waitForTimeout(400);
await win.locator('.plant-btn').nth(5).click();
await win.waitForTimeout(300);
await win.screenshot({ path: OUT + '/g2.png' });
const st = await win.evaluate(() => [...document.querySelectorAll('.plant')].slice(0, 40).map((p) => p.getAttribute('class')).join(' | '));
console.log(st.slice(0, 400));
console.log('errors', JSON.stringify(errors));
await app.close();
