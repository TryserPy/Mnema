// Оценка: CER/WER по тексту + структура (заголовки, жирное, рамки, абзацы, порядок, рисунки, формулы, мусор).
// node score.mjs <метка> [метка2 …]
import fs from 'fs';

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[—–−‐‑]/g, '-')
    .replace(/[«»“”„"']/g, '"')
    .replace(/[­]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function lev(a, b) {
  // a, b: строки или массивы
  const n = a.length, m = b.length;
  if (!n) return m;
  if (!m) return n;
  let prev = new Int32Array(m + 1), cur = new Int32Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m];
}
const cer = (t, o) => (t.length ? lev(t, o) / t.length : 0);
const words = (s) => norm(s).split(' ').filter(Boolean);

/** Разбор Markdown-вывода в блоки. */
export function parseOut(md) {
  const src = md.replace(/^\[стр\. \d+\]$/gm, '').replace(/\n{3,}/g, '\n\n');
  const blocks = [];
  let images = 0;
  for (const raw of src.split(/\n\n+/)) {
    let b = raw.trim();
    if (!b) continue;
    const imgs = [...b.matchAll(/!\[([^\]]*)\]\([^)]*\)/g)];
    images += imgs.length;
    for (const m of imgs) blocks.push({ kind: 'img', text: m[1], raw: m[0] });
    b = b.replace(/!\[([^\]]*)\]\([^)]*\)/g, '').trim();
    if (!b) continue;
    // внутри блока строки списка/цитаты разбираем по строкам
    const lines = b.split('\n');
    let curBlock = null;
    const push = () => curBlock && blocks.push(curBlock);
    for (const ln of lines) {
      const l = ln.trim();
      if (!l) continue;
      let kind = 'p', text = l;
      let m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) (kind = 'h'), (text = m[2]);
      else if ((m = /^>\s?(.*)$/.exec(l))) (kind = 'quote'), (text = m[1]);
      else if ((m = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l))) (kind = 'li'), (text = m[1]);
      else if (/^\$\$?.*\$\$?$/.test(l)) kind = 'formula';
      else if (/^\*[^*].*[^*]\*$/.test(l) || /^_.*_$/.test(l)) kind = 'italic';
      if (curBlock && curBlock.kind === kind && (kind === 'p' || kind === 'quote' || kind === 'italic')) curBlock.raw += '\n' + l, (curBlock.text += ' ' + text);
      else (push(), (curBlock = { kind, text, raw: l }));
    }
    push();
  }
  for (const b of blocks) {
    b.bold = [...b.text.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]);
    b.plain = b.text.replace(/\*\*/g, '').replace(/(?<![\w*])\*|\*(?![\w*])/g, '').replace(/\$/g, '').replace(/\\[a-z]+/g, ' ').replace(/[{}_^]/g, '');
  }
  return { blocks, images };
}

function truthText(T) {
  return T.blocks.map((b) => (b.t === 'box' ? b.title + ': ' + b.text : b.text)).join(' ');
}

export function scoreOne(md, T) {
  const { blocks, images } = parseOut(md);
  const textBlocks = blocks.filter((b) => b.kind !== 'img');
  const outText = norm(textBlocks.map((b) => b.plain).join(' '));
  const tt = norm(truthText(T));
  const r = {};
  r.cer = cer(tt, outText);
  const tw = words(tt), ow = words(outText);
  r.wer = tw.length ? lev(tw, ow) / tw.length : 0;
  // мешок слов (точность чтения без учёта порядка)
  const bag = new Map();
  for (const w of tw) bag.set(w, (bag.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of ow) if ((bag.get(w) ?? 0) > 0) (hit++, bag.set(w, bag.get(w) - 1));
  r.bagR = tw.length ? hit / tw.length : 0;
  r.bagP = ow.length ? hit / ow.length : 0;

  // заголовки
  const th = T.blocks.filter((b) => b.t === 'h' || b.t === 'h2');
  const oh = blocks.filter((b) => b.kind === 'h');
  let htp = 0;
  const usedH = new Set();
  for (const t of th) {
    const k = oh.findIndex((o, i) => !usedH.has(i) && cer(norm(t.text), norm(o.plain)) <= 0.25);
    if (k >= 0) (htp++, usedH.add(k));
  }
  r.headTP = htp; r.headFN = th.length - htp; r.headFP = oh.length - usedH.size; r.headTotal = th.length;

  // жирное
  const tb = T.blocks.flatMap((b) => b.bold ?? []);
  const ob = blocks.filter((b) => b.kind !== 'h').flatMap((b) => b.bold);
  const usedB = new Set();
  let btp = 0;
  for (const t of tb) {
    const k = ob.findIndex((o, i) => !usedB.has(i) && cer(norm(t), norm(o)) <= 0.3);
    if (k >= 0) (btp++, usedB.add(k));
  }
  r.boldTP = btp; r.boldFN = tb.length - btp; r.boldFP = ob.length - usedB.size; r.boldTotal = tb.length;

  // рамки
  const tbox = T.blocks.filter((b) => b.t === 'box');
  let boxOk = 0;
  for (const t of tbox) {
    const want = norm(t.title + ': ' + t.text);
    // все цитатные блоки подряд склеиваем
    const quotes = blocks.filter((b) => b.kind === 'quote').map((b) => norm(b.plain));
    const joined = quotes.join(' ');
    const best = Math.min(...[...quotes, joined].map((q) => cer(want, q)), 9);
    if (best <= 0.3) boxOk++;
  }
  r.boxOk = boxOk; r.boxTotal = tbox.length;

  // абзацы целиком (p, li, box, fig-caption) и порядок
  const unitTexts = textBlocks.map((b) => norm(b.plain));
  const tp = T.blocks.filter((b) => b.t === 'p' || b.t === 'li' || b.t === 'box');
  let intact = 0;
  const pos = [];
  for (const t of tp) {
    const want = norm(t.t === 'box' ? t.title + ': ' + t.text : t.text);
    let best = 9, bi = -1;
    unitTexts.forEach((u, i) => {
      const c = cer(want, t.t === 'box' && !u.startsWith(norm(t.title)) ? u : u);
      if (c < best) (best = c), (bi = i);
    });
    // рамка допускается как два блока: заголовок + текст — проверим отдельно через boxOk
    if (t.t === 'box') {
      if (r.boxOk) intact++;
      pos.push(bi);
      continue;
    }
    if (best <= 0.2) intact++;
    if (best <= 0.4) pos.push(bi);
  }
  r.paraIntact = intact; r.paraTotal = tp.length;
  r.fragments = textBlocks.length; // чем ближе к числу блоков эталона — тем лучше
  r.truthBlocks = T.blocks.length;
  // порядок: LIS / n
  const seq = pos.filter((p) => p >= 0);
  const lis = [];
  for (const p of seq) {
    let lo = 0, hi = lis.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (lis[mid] < p) lo = mid + 1; else hi = mid; }
    lis[lo] = p;
  }
  r.orderOk = seq.length ? lis.length / seq.length : 0;

  // списки
  const tli = T.blocks.filter((b) => b.t === 'li');
  const oli = blocks.filter((b) => b.kind === 'li');
  let lok = 0;
  for (const t of tli) if (oli.some((o) => cer(norm(t.text), norm(o.plain)) <= 0.3)) lok++;
  r.listOk = lok; r.listTotal = tli.length;

  // рисунки
  const tf = T.blocks.filter((b) => b.t === 'fig');
  r.figs = images; r.figsTruth = tf.length;
  let capOk = 0;
  for (const t of tf) {
    const cands = [...blocks.filter((b) => b.kind === 'italic' || b.kind === 'img').map((b) => norm(b.plain)), ...unitTexts];
    if (cands.some((c) => cer(norm(t.text), c) <= 0.25)) capOk++;
  }
  r.capOk = capOk;

  // формулы
  const tfm = T.blocks.filter((b) => b.t === 'formula');
  let fok = 0, fdollar = 0;
  const squash = (s) => s.toLowerCase().replace(/\\(cdot|times)/g, '·').replace(/[\s_{}$\\^]/g, '').replace(/[·∙*×•.-]/g, '').replace(/[−–—]/g, '');
  for (const t of tfm) {
    const want = squash(t.text);
    const hitB = blocks.find((b) => b.kind !== 'img' && cer(want, squash(b.text)) <= 0.3 && b.text.length < 60);
    if (hitB) fok++;
    if (hitB && /\$/.test(hitB.raw)) fdollar++;
  }
  r.formulaOk = fok; r.formulaDollar = fdollar; r.formulaTotal = tfm.length;

  // мусор: колонтитул и номер страницы не должны попасть в текст
  let leak = 0;
  for (const b of textBlocks) {
    if (T.running && cer(norm(T.running), norm(b.plain)) <= 0.3) leak++;
    if (norm(b.plain) === T.pageNo) leak++;
  }
  r.leak = leak;
  // осколки: короткие блоки из 1-2 символов или без букв
  r.junkBlocks = textBlocks.filter((b) => b.kind !== 'li' && (b.plain.replace(/[^\p{L}\p{N}]/gu, '').length < 3)).length;
  // нечитаемый мусор: доля слов, которых нет в эталоне и которые не похожи ни на одно слово эталона (≤1 правки)
  const tset = new Set(tw);
  const tl = [...tset];
  let bad = 0;
  for (const w of ow) if (!tset.has(w) && !tl.some((x) => Math.abs(x.length - w.length) <= 1 && lev(x, w) <= Math.max(1, Math.floor(x.length * 0.25)))) bad++;
  r.garbageWords = bad; r.outWords = ow.length;
  return r;
}

const pct = (x) => (x * 100).toFixed(0) + '%';
export function fmt(name, r) {
  return `${name.padEnd(18)} CER ${pct(r.cer).padStart(4)} WER ${pct(r.wer).padStart(4)} bag R${pct(r.bagR)}/P${pct(r.bagP)} | заг ${r.headTP}/${r.headTotal}(+${r.headFP}) жирн ${r.boldTP}/${r.boldTotal}(+${r.boldFP}) рамка ${r.boxOk}/${r.boxTotal} абз ${r.paraIntact}/${r.paraTotal} порядок ${pct(r.orderOk)} спис ${r.listOk}/${r.listTotal} рис ${r.figs}/${r.figsTruth} подп ${r.capOk} ф-ла ${r.formulaOk}/${r.formulaTotal}($${r.formulaDollar}) мусор ${r.leak}+${r.junkBlocks}+${r.garbageWords}/${r.outWords}сл блоков ${r.fragments}/${r.truthBlocks}`;
}

if (process.argv[1].endsWith('score.mjs')) {
  const tags = process.argv.slice(2);
  const filter = process.env.F || '';
  for (const tag of tags) {
    console.log('==== ' + tag);
    const all = [];
    for (const f of fs.readdirSync(`out/${tag}`).filter((f) => f.endsWith('.md') && f.includes(filter)).sort()) {
      const base = f.replace('.md', '');
      const pageName = base.replace(/_(clean|mild|heavy|given)$/, '');
      const T = JSON.parse(fs.readFileSync(`pages/${pageName}.truth.json`, 'utf8'));
      const r = scoreOne(fs.readFileSync(`out/${tag}/${f}`, 'utf8'), T);
      console.log(fmt(base, r));
      all.push([base, r]);
    }
    const avg = (k, sel = () => true) => {
      const xs = all.filter(([b]) => sel(b)).map(([, r]) => r[k]);
      return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    };
    for (const [lbl, sel] of [['ВСЕ', () => true], ['clean', (b) => /clean|given/.test(b)], ['mild', (b) => /mild/.test(b)], ['heavy', (b) => /heavy/.test(b)]])
      console.log(`  среднее ${lbl.padEnd(6)} CER ${pct(avg('cer', sel))} WER ${pct(avg('wer', sel))} bagR ${pct(avg('bagR', sel))} order ${pct(avg('orderOk', sel))}`);
  }
}
