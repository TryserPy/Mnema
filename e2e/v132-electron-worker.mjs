// 1.32, п.7: фоновый поток разбора фото в Electron (окно с file://). Проверяем, что поток запускается из file://
// при CSP worker-src 'self', готовит страницу и возвращает пиксели, PNG для распознавания и JPEG.
// Запуск (нужен npx vite build и скачанный Electron): xvfb-run -a node e2e/v132-electron-worker.mjs
import { _electron as electron } from 'playwright';
import fs from 'fs';

const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd(), '--no-sandbox'] });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await win.waitForTimeout(1500);
const file = fs.readdirSync('dist/assets').find((f) => /^textbookWorker-.*\.js$/.test(f));
const r = await win.evaluate(async (file) => {
  const out = { protocol: location.protocol, offscreen: typeof OffscreenCanvas !== 'undefined' };
  // Страница-образец: строки «текста» на светлом листе.
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 1600;
  const x = c.getContext('2d');
  x.fillStyle = '#eee';
  x.fillRect(0, 0, 1200, 1600);
  x.fillStyle = '#111';
  x.font = '28px serif';
  for (let i = 0; i < 40; i++) x.fillText('Параграф учебника: строка номер ' + i + ' про клетку и ткани.', 80, 100 + i * 36);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  try {
    const w = new Worker(new URL('./assets/' + file, location.href), { type: 'module', name: 'refrain-textbook' });
    const res = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('нет ответа за 30 с')), 30000);
      w.onerror = (e) => (clearTimeout(t), reject(new Error('onerror: ' + (e.message || 'без текста'))));
      w.onmessage = (e) => {
        if (e.data.type === 'progress') return;
        clearTimeout(t);
        e.data.type === 'done' ? resolve(e.data.result) : reject(new Error(e.data.message));
      };
      w.postMessage({ id: 1, op: 'prepare', job: { file: blob, rotate: 0, split: true, want: { ocr: true, jpegs: [{ side: 1600, q: 0.82 }] } } });
    });
    w.terminate();
    const p = res.parts[0];
    Object.assign(out, { ok: true, parts: res.parts.length, w: p.info.w, h: p.info.h, rgba: p.rgba.byteLength, png: p.ocrPng?.byteLength ?? 0, jpeg: Object.values(p.jpegs ?? {})[0]?.slice(0, 23), bitmap: p.bitmap ? `${p.bitmap.width}×${p.bitmap.height}` : null });
  } catch (e) {
    Object.assign(out, { ok: false, error: e.message });
  }
  return out;
}, file);
await app.close();
console.log(JSON.stringify(r), errors.length ? 'ошибки: ' + errors.join('; ') : '');
const ok = r.ok && r.png > 1000 && r.rgba === r.w * r.h * 4 && r.jpeg === 'data:image/jpeg;base64,' && r.bitmap;
console.log(ok ? '✓ поток разбора фото работает в Electron (file://)' : '✗ поток в Electron не работает — сработает запасной путь в главном потоке');
process.exit(ok ? 0 : 1);
