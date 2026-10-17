// 1.32: плавность анимации при разборе фото учебника. Процессор замедлен в 4 раза (CDP), режим «Без интернета».
// Меряем: на чём держится анимация полосы (transform — рисует видеокарта, независимо от занятости страницы)
// и самые долгие паузы главного потока, пока идёт разбор. Запуск: URL=http://localhost:4174 node e2e/v132-scanfps.mjs
import { chromium } from 'playwright';
import { seed } from './v132-seed.mjs';

const URL = process.env.URL ?? 'http://localhost:4174';
const RATE = Number(process.env.RATE ?? 4);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(URL);
await page.evaluate((data) => {
  sessionStorage.setItem('mnema-web-test-ok', '1');
  sessionStorage.setItem('refrain-no-splash', String(Date.now()));
  localStorage.setItem('mnema-data-pending', JSON.stringify(data));
  localStorage.setItem('refrain-ui', JSON.stringify({ route: { r: { name: 'topic', id: 'b1' }, at: Date.now() } }));
}, seed());
await page.reload();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Из учебника' }).first().click();
await page.locator('.modal input[type=file]').setInputFiles('test-fixtures/page47.jpg');
await page.locator('.tb-page img').first().waitFor();
await page.getByRole('radio', { name: 'Без интернета' }).click().catch(() => {});
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
await page.evaluate(() => {
  const st = (window.__fps = { gaps: [], last: performance.now(), on: true });
  const loop = (t) => {
    st.gaps.push(t - st.last);
    st.last = t;
    if (st.on) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
await page.getByRole('button', { name: /^(Распознать|Сделать конспект)/ }).click();
await page.locator('.scan-line').waitFor();
const anim = await page.evaluate(() => {
  const a = document.querySelector('.scan-line').getAnimations()[0];
  const kf = a?.effect?.getKeyframes?.() ?? [];
  return { name: a?.animationName, props: [...new Set(kf.flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))] };
});
await page.waitForTimeout(12000);
const r = await page.evaluate(() => {
  window.__fps.on = false;
  const g = window.__fps.gaps.slice(1);
  const sorted = [...g].sort((a, b) => b - a);
  const total = g.reduce((a, b) => a + b, 0);
  return { frames: g.length, seconds: Math.round(total / 100) / 10, fps: Math.round((g.length / total) * 1000 * 10) / 10, worst: sorted.slice(0, 5).map(Math.round), over250: g.filter((x) => x > 250).length };
});
console.log(`анимация полосы: ${anim.name}, свойства: ${anim.props.join(', ')}`);
console.log(`главный поток при замедлении ×${RATE}: ${r.fps} кадров/с за ${r.seconds} с, самые долгие паузы: ${r.worst.join(', ')} мс, пауз > 250 мс: ${r.over250}`);
const ok = anim.props.length === 1 && anim.props[0] === 'transform';
console.log(ok ? '✓ полоса анимируется только transform — плавная при занятом главном потоке' : '✗ полоса анимирует свойства раскладки');
await browser.close();
process.exit(ok ? 0 : 1);
