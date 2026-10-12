// «Из учебника» в реальных условиях съёмки: разворот, изгиб, плохой свет, наклон и поворот, размытие, муар, малое разрешение.
// Из чистых страниц (scripts/ocr-eval/gen.mjs) делает наборы снимков «как с телефона», прогоняет весь офлайн-конвейер
// (Tesseract в Chromium) и печатает таблицу: случай → сколько слов эталона прочитано и что сказало приложение.
//
//   node e2e/v130-textbook-real.mjs [часть-имени-случая …] [--tag=after] [--save-photos]
//
// Результаты (JSON) кладутся в $REAL_OUT (по умолчанию /tmp/refrain-real), снимки — туда же при --save-photos.
// Нужны: Chromium (PLAYWRIGHT_BROWSERS_PATH или /opt/pw-browsers), playwright (/opt/node-tools или в node_modules).
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = process.env.REAL_OUT || path.join(os.tmpdir(), 'refrain-real');
const args = process.argv.slice(2);
const tag = (args.find((a) => a.startsWith('--tag=')) || '--tag=run').slice(6);
const savePhotos = args.includes('--save-photos');
const filters = args.filter((a) => !a.startsWith('--'));
fs.mkdirSync(path.join(OUT, 'pages'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'photos'), { recursive: true });

async function loadPlaywright() {
  for (const p of ['/opt/node-tools/node_modules/playwright/index.mjs', ROOT + '/node_modules/playwright/index.mjs']) if (fs.existsSync(p)) return import(pathToFileURL(p).href);
  return import('playwright');
}
const { chromium } = await loadPlaywright();
const chromePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));

// 1. Чистые страницы «учебника» (физика, биология, история) + эталонный текст.
execFileSync('node', [path.join(ROOT, 'scripts/ocr-eval/gen.mjs')], { cwd: OUT, stdio: 'ignore' });
const { scoreOne } = await import(pathToFileURL(path.join(ROOT, 'scripts/ocr-eval/score.mjs')).href);

// 2. Сервер с исходниками приложения и файлами Tesseract.
const PORT = Number(process.env.REAL_PORT || 5340 + Math.floor(Math.random() * 40));
const vite = spawn('npx', ['vite', '--config', 'scripts/ocr-eval/vite.harness.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), MNEMA_ROOT: ROOT }, stdio: 'ignore' });
const stop = () => vite.kill();
process.on('exit', stop);
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/harness.html`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const gen = await browser.newPage({ viewport: { width: 800, height: 600 } });
await gen.goto(`http://localhost:${PORT}/harness.html`);
await gen.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'scripts/ocr-eval/realcases.js'), 'utf8') });
const cases = await gen.evaluate(() => window.RC.CASES);
const pagesB64 = Object.fromEntries(['physics', 'biology', 'history2'].map((n) => [n, fs.readFileSync(path.join(OUT, 'pages', n + '.png')).toString('base64')]));
const truthOf = (n) => JSON.parse(fs.readFileSync(path.join(OUT, 'pages', n + '.truth.json'), 'utf8'));

const rec = await browser.newPage();
rec.on('pageerror', (e) => console.log('PAGEERR', e.message));
await rec.goto(`http://localhost:${PORT}/harness.html`);
await rec.evaluate(async () => {
  const web = await import('/src/platform/ocrWeb.ts');
  window.mnemaApi = { platform: 'web', ocrRecognize: (b) => web.recognize(b) };
});

const rows = [];
for (const [id, spec] of Object.entries(cases)) {
  if (filters.length && !filters.some((f) => id.includes(f))) continue;
  const t0 = Date.now();
  const b64 = await gen.evaluate(([id, imgs]) => window.RC.make(id, imgs), [id, pagesB64]);
  if (savePhotos) fs.writeFileSync(path.join(OUT, 'photos', id + '.jpg'), Buffer.from(b64, 'base64'));
  const r = await rec.evaluate(async ([b64, id]) => {
    const tb = await import('/src/textbook.ts?t=' + Date.now());
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bin], { type: 'image/jpeg' });
    const input = { id: 'x', file: blob, name: id + '.jpg', n: 1, rotate: 0 };
    const t = performance.now();
    const facts = [];
    if (tb.setDebugHook) tb.setDebugHook((x) => x && x.facts && facts.push({ ...x.facts, advice: (x.advice || []).map((a) => a.code) }));
    try {
      const res = tb.recognizeOfflinePages ? await tb.recognizeOfflinePages(input, () => {}) : [await tb.recognizeOffline(input, () => {})];
      // «до»: страницы без номеров идут подряд; «после»: приложение само ставит найденные номера.
      const md = tb.assemble(res, {});
      return { md, ms: Math.round(performance.now() - t), pages: res.length, advice: res.flatMap((x) => (x.advice || []).map((a) => a.code)), note: res.map((x) => x.note || '').filter(Boolean), conf: res.map((x) => x.quality && x.quality.conf), detected: res.map((x) => x.detectedPage), facts, notes: res.map((x) => x.note || '') };
    } catch (e) {
      return { error: String((e && e.message) || e), ms: Math.round(performance.now() - t) };
    }
  }, [b64, id]);
  const T = { blocks: spec.pages.flatMap((n) => truthOf(n).blocks), running: '', pageNo: '' };
  const sc = r.error ? null : scoreOne(r.md, T);
  const recall = sc ? Math.round(sc.bagR * 100) : 0;
  const cer = sc ? Math.round(sc.cer * 100) : 100;
  const warned = r.advice && r.advice.length > 0;
  // Вердикт: плохо прочиталось → должно быть честное предупреждение; прочиталось хорошо → не пугать зря.
  let verdict;
  if (r.error) verdict = warned ? 'ошибка (сказали)' : 'ошибка';
  else if (recall < 80) verdict = warned || r.note.length ? 'ок: предупредили' : 'ПЛОХО: молчит';
  else verdict = warned ? 'лишнее предупреждение' : 'ок';
  if (args.includes('--facts')) console.log('   ', JSON.stringify((r.facts || []).map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v])))));
  if (args.includes('--md') && r.md) console.log(r.md.slice(0, 1800) + '\n---');
  rows.push({ id, desc: spec.desc, recall, cer, order: sc ? Math.round(sc.orderOk * 100) : 0, pages: r.pages || 0, advice: r.advice || [], verdict, ms: r.ms, error: r.error, detected: r.detected });
  console.log(`${id.padEnd(14)} слов ${String(recall).padStart(3)}%  CER ${String(cer).padStart(3)}%  порядок ${String(rows.at(-1).order).padStart(3)}%  стр ${r.pages ?? '-'}  ${String(r.ms).padStart(6)}мс  ${verdict}${warned ? '  [' + r.advice.join(', ') + ']' : ''}${r.error ? '  ' + r.error.slice(0, 90) : ''}  (${((Date.now() - t0) / 1000).toFixed(0)}с)`);
}
fs.writeFileSync(path.join(OUT, `real-${tag}.json`), JSON.stringify(rows, null, 1));
const avg = rows.reduce((a, r) => a + r.recall, 0) / (rows.length || 1);
console.log(`\nСреднее по слитным словам эталона: ${avg.toFixed(0)}%  | молчит при плохом чтении: ${rows.filter((r) => r.verdict.startsWith('ПЛОХО')).length}  | лишних предупреждений: ${rows.filter((r) => r.verdict.startsWith('лишнее')).length}`);
await browser.close();
stop();
