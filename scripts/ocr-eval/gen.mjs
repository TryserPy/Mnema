// Рисует «страницы учебника» в Chromium и сохраняет чистые PNG + эталон (truth json).
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
import katex from '/home/user/Mnema/node_modules/katex/dist/katex.mjs';
import { PAGES } from './pages.mjs';
const NM = '/home/user/Mnema/node_modules';
const ff = (fam, w, st, file) => `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};src:url('file://${NM}/@fontsource/${file}')}`;
const FONTS =
  ['cyrillic', 'latin'].flatMap((sub) => [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']].map(([w, s]) => ff('Literata', w, s, `literata/files/literata-${sub}-${w}-${s}.woff2`))).join('') +
  ['cyrillic', 'latin'].flatMap((sub) => [400, 700].map((w) => ff('Onest', w, 'normal', `onest/files/onest-${sub}-${w}-normal.woff2`))).join('');
const VOW = 'аеёиоуыэюяАЕЁИОУЫЭЮЯ';
const shy = (w) => {
  if (w.length < 9 || !/^[А-Яа-яЁё]+$/.test(w)) return w;
  let o = '';
  for (let i = 0; i < w.length; i++) {
    o += w[i];
    if (i >= 2 && i < w.length - 3 && VOW.includes(w[i]) && !VOW.includes(w[i + 1])) o += '­';
  }
  return o;
};
const hy = (s) => s.replace(/[А-Яа-яЁё]+/g, shy);
const inline = (s) => s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((x) => (x.startsWith('**') ? `<b>${hy(x.slice(2, -2))}</b>` : x.startsWith('*') ? `<i>${hy(x.slice(1, -1))}</i>` : hy(x))).join('');
const plain = (s) => s.replace(/\*\*/g, '').replace(/\*/g, '');
const svgFig = {
  rod: `<svg viewBox="0 0 560 260" width="100%"><rect x="1" y="1" width="558" height="258" fill="#f6f9fc" stroke="#222" stroke-width="2"/><rect x="90" y="120" width="380" height="26" fill="#9aa4b1" stroke="#222" stroke-width="2"/><path d="M60 150 q-20 -40 10 -70 q5 30 30 30 q20 20 -10 40z" fill="#e8742c" stroke="#a33" stroke-width="2"/><g fill="#c33" stroke="#722"><circle cx="150" cy="133" r="9"/><circle cx="250" cy="133" r="9"/><circle cx="350" cy="133" r="9"/><circle cx="440" cy="133" r="9"/></g><path d="M90 200h380" stroke="#333" stroke-width="3"/><path d="M450 190l20 10-20 10" fill="none" stroke="#333" stroke-width="3"/></svg>`,
  cell: `<svg viewBox="0 0 560 360" width="100%"><rect x="1" y="1" width="558" height="358" fill="#fbfbf3" stroke="#222" stroke-width="2"/><ellipse cx="280" cy="180" rx="230" ry="150" fill="#dff0d8" stroke="#2c6e2c" stroke-width="5"/><circle cx="270" cy="175" r="62" fill="#c9c3ef" stroke="#4b3fa0" stroke-width="4"/><circle cx="270" cy="175" r="18" fill="#6a5acd"/><ellipse cx="410" cy="120" rx="46" ry="22" fill="#f6c28b" stroke="#a65d12" stroke-width="3"/><ellipse cx="140" cy="250" rx="40" ry="20" fill="#f6c28b" stroke="#a65d12" stroke-width="3"/><g fill="#a33"><circle cx="130" cy="120" r="7"/><circle cx="160" cy="140" r="7"/><circle cx="400" cy="250" r="7"/><circle cx="430" cy="225" r="7"/></g></svg>`,
  map: `<svg viewBox="0 0 560 300" width="100%"><rect x="1" y="1" width="558" height="298" fill="#f3efdc" stroke="#222" stroke-width="2"/><path d="M40 60 Q200 20 320 80 T520 70 L520 250 Q300 280 40 240z" fill="#d9e8c8" stroke="#6a8a4b" stroke-width="3"/><path d="M110 90 C200 120 250 150 300 200 S420 230 480 200" fill="none" stroke="#b22" stroke-width="5" stroke-dasharray="14 8"/><g fill="#b22"><circle cx="110" cy="90" r="9"/><circle cx="300" cy="200" r="9"/><circle cx="480" cy="200" r="9"/></g><path d="M440 100l30 20 30-20" fill="none" stroke="#235" stroke-width="4"/></svg>`
};
const block = (b) => {
  switch (b.t) {
    case 'h': return `<h1>${inline(b.text)}</h1>`;
    case 'h2': return `<h2>${inline(b.text)}</h2>`;
    case 'p': return `<p>${inline(b.text)}</p>`;
    case 'li': return `<ul><li>${inline(b.text)}</li></ul>`;
    case 'formula': return `<div class="formula">${katex.renderToString(b.tex, { throwOnError: false })}</div>`;
    case 'box': return `<div class="box"><div class="bt">${b.title}</div><p>${inline(b.text)}</p></div>`;
    case 'fig': return `<figure>${svgFig[b.kind]}<figcaption>${inline(b.caption)}</figcaption></figure>`;
  }
};
const css = (font) => `${FONTS}
body{margin:0;background:#fbf9f2}
.page{position:relative;width:1500px;height:2100px;box-sizing:border-box;padding:150px 120px 0;font-family:'${font}',serif;font-size:34px;line-height:1.5;color:#1c1c1c;background:#fbf9f2;text-align:justify;hyphens:manual}
.run{position:absolute;top:56px;left:120px;right:120px;font-size:24px;color:#555;text-align:left;border-bottom:1px solid #aaa;padding-bottom:6px}
.no{position:absolute;bottom:70px;left:0;right:0;text-align:center;font-size:28px;color:#444}
h1{font-size:50px;line-height:1.2;margin:0 0 28px;text-align:left;font-weight:700}
h2{font-size:38px;margin:26px 0 10px;text-align:left;font-weight:700}
p{margin:0 0 14px}
ul{margin:0 0 4px;padding-left:44px}li{margin:0}
.cols{display:flex;gap:64px}.cols>div{flex:1;min-width:0}
.formula{text-align:center;margin:10px 0 16px;font-size:40px}
.box{background:#e8f0fb;border:3px solid #2a5aa8;padding:14px 22px 6px;margin:16px 0}
.box .bt{color:#2a5aa8;font-weight:700;font-size:36px;margin-bottom:4px}
figure{margin:10px 0 14px}figure svg{display:block}
figcaption{font-style:italic;font-size:29px;margin-top:6px;text-align:left;line-height:1.3}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pg = await browser.newPage({ viewport: { width: 1500, height: 2100 } });
for (const [name, P] of Object.entries(PAGES)) {
  const html = `<!doctype html><meta charset=utf-8><style>${css(P.font)}</style><link rel=stylesheet href="file://${NM}/katex/dist/katex.min.css"><div class=page lang=ru><div class=run>${P.running}</div>${P.head.map(block).join('')}<div class=cols>${P.cols.map((c) => `<div>${c.map(block).join('')}</div>`).join('')}</div><div class=no>${P.pageNo}</div></div>`;
  fs.writeFileSync(`pages/${name}.html`, html);
  await pg.goto(`file://${process.cwd()}/pages/${name}.html`);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: `pages/${name}.png`, clip: { x: 0, y: 0, width: 1500, height: 2100 } });
  const truth = [];
  const flat = [...P.head, ...P.cols.flat()];
  for (const b of flat) {
    if (b.t === 'fig') truth.push({ t: 'fig', text: plain(b.caption) });
    else if (b.t === 'formula') truth.push({ t: 'formula', text: b.plain });
    else if (b.t === 'box') truth.push({ t: 'box', title: b.title, text: plain(b.text) });
    else truth.push({ t: b.t, text: plain(b.text), bold: [...b.text.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]) });
  }
  fs.writeFileSync(`pages/${name}.truth.json`, JSON.stringify({ name, pageNo: P.pageNo, running: P.running, blocks: truth }, null, 1));
}
await browser.close();
