// Прогон офлайн-конвейера Refrain на всех фото. Использование: node run.mjs <метка> [фильтр]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const tag = process.argv[2] || 'x';
const filter = process.argv[3] || '';
const outDir = `out/${tag}`;
fs.mkdirSync(outDir, { recursive: true });
const files = fs.readdirSync('photos').filter((f) => f.endsWith('.jpg') && f.includes(filter)).sort();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext();
const pg = await ctx.newPage();
pg.on('pageerror', (e) => console.log('PAGEERR', e.message));
pg.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
await pg.goto('http://localhost:5199/harness.html');
await pg.evaluate(async () => {
  const web = await import('/src/platform/ocrWeb.ts');
  window.mnemaApi = { platform: 'web', ocrRecognize: (b) => web.recognize(b) };
});
for (const f of files) {
  const b64 = fs.readFileSync(`photos/${f}`).toString('base64');
  const t0 = Date.now();
  const r = await pg.evaluate(async ([b64, name]) => {
    const tb = await import('/src/textbook.ts?t=' + Date.now());
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bin], { type: 'image/jpeg' });
    const t = performance.now();
    try {
      let dbg = null; tb.setDebugHook((x) => (dbg = x));
      const res = await tb.recognizeOffline({ id: 'x', file: blob, name, n: 1, rotate: 0 }, () => {});
      const md = tb.assemble([res], {});
      return { md, raw: res.markdown, figures: res.figures.map((f) => ({ box: f.box, caption: f.caption })), doubts: res.doubts.map((d) => d.text), detectedPage: res.detectedPage, ms: Math.round(performance.now() - t), info: dbg && dbg.info, regions: dbg && dbg.regions, quality: res.quality, rawLines: dbg && dbg.lines };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  }, [b64, f]);
  const base = f.replace('.jpg', '');
  if (r.error) console.log(base, 'ERROR', r.error);
  else {
    fs.writeFileSync(`${outDir}/${base}.md`, r.md.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, 'DATA'));
    fs.writeFileSync(`${outDir}/${base}.json`, JSON.stringify({ rawLines: r.rawLines, figures: r.figures, doubts: r.doubts, detectedPage: r.detectedPage, ms: r.ms, info: r.info, regions: r.regions, quality: r.quality }));
    console.log(base, r.ms + 'ms', 'figs', r.figures.length, 'doubts', r.doubts.length, JSON.stringify(r.info), 'regions', r.regions && r.regions.figures.length + '/' + r.regions.boxes.length);
  }
}
await browser.close();
