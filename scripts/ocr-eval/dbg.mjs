// node dbg.mjs <метка> <имя> : прогоняет сохранённые строки OCR через buildPage заново (без OCR) и печатает md
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const [tag, name] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(`out/${tag}/${name}.json`, 'utf8'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pg = await browser.newPage();
await pg.goto('http://localhost:5199/harness.html');
const r = await pg.evaluate(async ([lines, info, regions]) => {
  const tt = await import('/src/textbookText.ts?t=' + Date.now());
  const mh = tt.median(lines.map((l) => l.bbox.y1 - l.bbox.y0)) || 30;
  const gs = tt.findGutters(lines, mh);
  const split = tt.splitAtGutters(lines, gs);
  const merged = tt.mergeRows(split, gs, mh);
  let order = []; const res = tt.buildPage({ lines, width: info.w, height: info.h, figures: regions.figures, boxes: regions.boxes, debug: (x) => (order = x) });
  return { order, mh, gs, nIn: lines.length, nSplit: split.length, nMerged: merged.length, md: res.markdown, rows: merged.map((l) => `${Math.round(l.bbox.x0)}-${Math.round(l.bbox.x1)} y${Math.round(l.bbox.y0)} b${l.block}: ${l.words.map((w) => w.text).join(' ')}`) };
}, [j.rawLines, j.info, j.regions]);
console.log('mh', r.mh, 'gutters', JSON.stringify(r.gs), 'lines', r.nIn, '->', r.nSplit, '->', r.nMerged);
if (process.argv[4] === 'rows') console.log(r.rows.join('\n'));
else if (process.argv[4] === 'order') console.log(r.order.join('\n'));
else console.log(r.md);
await browser.close();
