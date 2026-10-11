// Какая разметка конспекта ломает редактор: загружает варианты заметки в тему и смотрит, не упал ли экран.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const URL = process.env.URL ?? 'http://localhost:4180';
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
import fs from 'node:fs';
const full = fs.readFileSync(process.env.NOTE ?? 'docs/handoff/textbook-ui/pc-result.md', 'utf8').replace('(DATA)', `(${IMG})`);
const blocks = full.split('\n\n');
const variants = {
  'картинка+подпись одним абзацем, список в конце': 'Текст.\n\n![x](' + IMG + ')\n*cap*\n\n- раз\n- два',
  'то же, формула в конце': 'Текст.\n\n![x](' + IMG + ')\n*cap*\n\n$$a=b$$',
  'то же, цитата в конце': 'Текст.\n\n![x](' + IMG + ')\n*cap*\n\n> **Запомните:** абв.',
  'то же, картинка в конце': 'Текст.\n\n![x](' + IMG + ')\n*cap*',
  'без подписи': 'Текст.\n\n![x](' + IMG + ')'
};
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
for (const [name, note] of Object.entries(variants)) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log('   console:', m.text().slice(0, 900)));
  page.on('pageerror', (e) => console.log('   pageerror:', (e.stack || e.message).slice(0, 900)));
  await page.goto(URL);
  await page.evaluate((note) => {
    const at = new Date().toISOString();
    localStorage.setItem('mnema-data', JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Физика', color: '#3F51D8', createdAt: at }], topics: [{ id: 't1', subjectId: 's1', name: 'Тема', note, createdAt: at, updatedAt: at }], cards: [], states: {}, logs: [], tests: [], settings: { onboarded: true } }));
  }, note);
  await page.reload();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Понятно' }).click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.getByText('Физика').first().click();
  await page.waitForTimeout(400);
  await page.getByText('нет карточек').first().click();
  await page.waitForTimeout(1200);
  const broken = await page.getByText('что-то пошло не так').count();
  console.log(name.padEnd(8), broken ? 'ПАДАЕТ' : 'ok');
  await ctx.close();
}
await browser.close();
