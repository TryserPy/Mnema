// «Из тетради → Файл»: PDF с текстом без сторонней библиотеки. Хватает того, что уже есть: fflate для FlateDecode.
// Что умеет: объекты и потоки объектов (ObjStm), фильтры Flate/ASCIIHex/ASCII85 (+ PNG-предиктор), дерево страниц,
// шрифты с ToUnicode (так пишут Word, Chrome, LibreOffice), простые шрифты с Differences и cp1251, формы (Form XObject).
// Строки собираются по положению на странице, крупный шрифт — заголовок. PDF без текста (скан) — картинки страниц для ветки «Фото».
// Чего не умеет: зашифрованные PDF (даже с пустым паролем) и шрифты без ToUnicode с CID — тогда честно говорим, что делать.
import { inflateSync, unzlibSync } from 'fflate';
import { escInline, escLineStart, type FileStats } from './fileImport';
import { joinLines } from './textbookText';

const MAX_BYTES = 80 * 1024 * 1024;
const MAX_PAGES = 400;
const MAX_STREAM = 40 * 1024 * 1024;

// ---------- Значения PDF ----------

type PdfVal = number | boolean | null | string | PdfName | PdfRef | PdfVal[] | PdfDict | PdfStr;
class PdfName {
  constructor(public n: string) {}
}
class PdfRef {
  constructor(public num: number, public gen: number) {}
}
class PdfStr {
  constructor(public bytes: Uint8Array) {}
}
type PdfDict = Map<string, PdfVal>;
interface PdfObj {
  dict?: PdfDict;
  val: PdfVal;
  stream?: Uint8Array;
}

const isDict = (v: unknown): v is PdfDict => v instanceof Map;
const nameOf = (v: PdfVal | undefined) => (v instanceof PdfName ? v.n : undefined);
const numOf = (v: PdfVal | undefined) => (typeof v === 'number' ? v : undefined);

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)));

/** Разбор значений PDF из байтов (словари, массивы, строки, имена, ссылки «n g R», числа). */
class Lexer {
  pos: number;
  constructor(public b: Uint8Array, pos = 0, public end = b.length) {
    this.pos = pos;
  }
  skip() {
    const b = this.b;
    while (this.pos < this.end) {
      const c = b[this.pos];
      if (WS.has(c)) this.pos++;
      else if (c === 37 /* % */) {
        while (this.pos < this.end && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
      } else break;
    }
  }
  /** Следующее значение или оператор (как строка-слово). undefined — конец. */
  next(): PdfVal | { op: string } | undefined {
    this.skip();
    if (this.pos >= this.end) return undefined;
    const b = this.b;
    const c = b[this.pos];
    if (c === 47 /* / */) {
      let s = '';
      this.pos++;
      while (this.pos < this.end && !WS.has(b[this.pos]) && !DELIM.has(b[this.pos])) {
        if (b[this.pos] === 35 /* # */ && this.pos + 2 < this.end) {
          s += String.fromCharCode(parseInt(String.fromCharCode(b[this.pos + 1], b[this.pos + 2]), 16));
          this.pos += 3;
        } else s += String.fromCharCode(b[this.pos++]);
      }
      return new PdfName(s);
    }
    if (c === 40 /* ( */) return this.literal();
    if (c === 60 /* < */) {
      if (b[this.pos + 1] === 60) {
        this.pos += 2;
        return this.dict();
      }
      return this.hex();
    }
    if (c === 91 /* [ */) {
      this.pos++;
      const arr: PdfVal[] = [];
      for (;;) {
        this.skip();
        if (this.pos >= this.end) return arr;
        if (b[this.pos] === 93) {
          this.pos++;
          return arr;
        }
        const v = this.value();
        if (v === undefined) return arr;
        arr.push(v);
      }
    }
    if (c === 93 || c === 62 || c === 41 || c === 123 || c === 125) {
      this.pos++;
      return { op: String.fromCharCode(c) };
    }
    let s = '';
    while (this.pos < this.end && !WS.has(b[this.pos]) && !DELIM.has(b[this.pos])) s += String.fromCharCode(b[this.pos++]);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return Number(s);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (!s) {
      this.pos++;
      return { op: '' };
    }
    return { op: s };
  }
  /** Значение с учётом ссылок «n g R». */
  value(): PdfVal | undefined {
    const v = this.next();
    if (v === undefined || (typeof v === 'object' && v !== null && 'op' in v)) return undefined;
    if (typeof v === 'number' && Number.isInteger(v)) {
      const save = this.pos;
      const g = this.next();
      if (typeof g === 'number' && Number.isInteger(g)) {
        const r = this.next();
        if (r && typeof r === 'object' && 'op' in r && r.op === 'R') return new PdfRef(v, g);
      }
      this.pos = save;
    }
    return v as PdfVal;
  }
  dict(): PdfDict {
    const d: PdfDict = new Map();
    for (;;) {
      this.skip();
      if (this.pos >= this.end) return d;
      if (this.b[this.pos] === 62 && this.b[this.pos + 1] === 62) {
        this.pos += 2;
        return d;
      }
      const k = this.next();
      if (!(k instanceof PdfName)) {
        if (k === undefined) return d;
        continue;
      }
      const v = this.value();
      if (v !== undefined) d.set(k.n, v);
    }
  }
  literal(): PdfStr {
    const b = this.b;
    const out: number[] = [];
    let depth = 1;
    this.pos++;
    while (this.pos < this.end) {
      const c = b[this.pos++];
      if (c === 92 /* \ */) {
        const e = b[this.pos++];
        const map: Record<number, number> = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12, 40: 40, 41: 41, 92: 92 };
        if (e in map) out.push(map[e]);
        else if (e >= 48 && e <= 55) {
          let n = e - 48;
          for (let k = 0; k < 2 && b[this.pos] >= 48 && b[this.pos] <= 55; k++) n = n * 8 + (b[this.pos++] - 48);
          out.push(n & 255);
        } else if (e === 13) {
          if (b[this.pos] === 10) this.pos++;
        } else if (e !== 10) out.push(e);
      } else if (c === 40) {
        depth++;
        out.push(c);
      } else if (c === 41) {
        if (--depth === 0) break;
        out.push(c);
      } else out.push(c);
    }
    return new PdfStr(Uint8Array.from(out));
  }
  hex(): PdfStr {
    this.pos++;
    let s = '';
    while (this.pos < this.end && this.b[this.pos] !== 62) {
      const ch = String.fromCharCode(this.b[this.pos++]);
      if (/[0-9a-f]/i.test(ch)) s += ch;
    }
    this.pos++;
    if (s.length % 2) s += '0';
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    return new PdfStr(out);
  }
}

// ---------- Фильтры ----------

function inflate(data: Uint8Array): Uint8Array {
  try {
    return unzlibSync(data);
  } catch {
    // Бывает поток без заголовка zlib или с битой контрольной суммой — читаем как «голый» deflate.
    try {
      return inflateSync(data.subarray(2));
    } catch {
      return inflateSync(data);
    }
  }
}

function asciiHex(data: Uint8Array): Uint8Array {
  const s = new TextDecoder('latin1').decode(data).replace(/>[\s\S]*$/, '').replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(Math.ceil(s.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt((s.slice(i * 2, i * 2 + 2) + '0').slice(0, 2), 16);
  return out;
}

function ascii85(data: Uint8Array): Uint8Array {
  const s = new TextDecoder('latin1').decode(data).replace(/^<~/, '').replace(/~>[\s\S]*$/, '').replace(/\s+/g, '');
  const out: number[] = [];
  let group: number[] = [];
  const flush = (n: number) => {
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, n));
    group = [];
  };
  for (const ch of s) {
    if (ch === 'z' && !group.length) {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(ch.charCodeAt(0) - 33);
    if (group.length === 5) flush(4);
  }
  if (group.length) flush(group.length - 1);
  return Uint8Array.from(out);
}

/** PNG-предиктор (Predictor ≥ 10): у каждой строки свой фильтр. */
function unpredict(data: Uint8Array, parms: PdfDict | undefined): Uint8Array {
  const pred = numOf(parms?.get('Predictor')) ?? 1;
  if (pred < 10) return data;
  const colors = numOf(parms?.get('Colors')) ?? 1;
  const bpc = numOf(parms?.get('BitsPerComponent')) ?? 8;
  const cols = numOf(parms?.get('Columns')) ?? 1;
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const row = Math.ceil((colors * bpc * cols) / 8);
  const rows = Math.floor(data.length / (row + 1));
  const out = new Uint8Array(rows * row);
  for (let y = 0; y < rows; y++) {
    const f = data[y * (row + 1)];
    const src = data.subarray(y * (row + 1) + 1, (y + 1) * (row + 1));
    const o = y * row;
    for (let x = 0; x < row; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const up = y ? out[o - row + x] : 0;
      const c = y && x >= bpp ? out[o - row + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      out[o + x] = v & 255;
    }
  }
  return out;
}

// ---------- Документ ----------

class Doc {
  objs = new Map<number, PdfObj>();
  raw: Uint8Array;
  trailer: PdfDict = new Map();
  constructor(bytes: Uint8Array) {
    this.raw = bytes;
    this.scan();
  }

  private scan() {
    const b = this.raw;
    const text = new TextDecoder('latin1').decode(b);
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    const pending: { num: number; obj: PdfObj }[] = [];
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const num = Number(m[1]);
      const lx = new Lexer(b, m.index + m[0].length);
      const val = lx.value();
      if (val === undefined) continue;
      const obj: PdfObj = { val, ...(isDict(val) ? { dict: val } : {}) };
      lx.skip();
      if (isDict(val) && text.startsWith('stream', lx.pos)) {
        let start = lx.pos + 6;
        if (b[start] === 13) start++;
        if (b[start] === 10) start++;
        const lenV = val.get('Length');
        let len = typeof lenV === 'number' ? lenV : -1;
        if (len < 0 || start + len > b.length || !/^\s*endstream/.test(text.slice(start + len, start + len + 20))) {
          const e = text.indexOf('endstream', start);
          len = e < 0 ? b.length - start : e - start;
          while (len > 0 && (b[start + len - 1] === 10 || b[start + len - 1] === 13)) len--;
        }
        obj.stream = b.subarray(start, start + Math.min(len, MAX_STREAM));
        re.lastIndex = start + len;
      }
      pending.push({ num, obj });
      if (/\/Type\s*\/XRef\b/.test(text.slice(m.index, m.index + 400)) && isDict(val)) for (const [k, v] of val) if (k === 'Root' || k === 'Encrypt' || k === 'Info') this.trailer.set(k, v);
    }
    for (const p of pending) this.objs.set(p.num, p.obj);
    for (const m of text.matchAll(/trailer\s*<</g)) {
      const lx = new Lexer(b, m.index! + m[0].length);
      for (const [k, v] of lx.dict()) this.trailer.set(k, v);
    }
    // Потоки объектов: объекты внутри сжатого потока (так пишут почти все современные PDF).
    for (const p of pending) {
      if (nameOf(p.obj.dict?.get('Type')) !== 'ObjStm' || !p.obj.stream) continue;
      const data = this.decode(p.obj);
      if (!data) continue;
      const n = numOf(p.obj.dict!.get('N')) ?? 0;
      const first = numOf(p.obj.dict!.get('First')) ?? 0;
      const head = new Lexer(data, 0, first);
      const pairs: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = head.next();
        const o = head.next();
        if (typeof a !== 'number' || typeof o !== 'number') break;
        pairs.push([a, o]);
      }
      for (const [num, off] of pairs) {
        if (this.objs.has(num)) continue;
        const val = new Lexer(data, first + off).value();
        if (val !== undefined) this.objs.set(num, { val, ...(isDict(val) ? { dict: val } : {}) });
      }
    }
  }

  get(v: PdfVal | undefined, depth = 0): PdfVal | undefined {
    if (v instanceof PdfRef) return depth > 8 ? undefined : this.get(this.objs.get(v.num)?.val, depth + 1);
    return v;
  }
  dict(v: PdfVal | undefined): PdfDict | undefined {
    const r = this.get(v);
    return isDict(r) ? r : undefined;
  }
  obj(v: PdfVal | undefined): PdfObj | undefined {
    return v instanceof PdfRef ? this.objs.get(v.num) : undefined;
  }

  /** Раскодированный поток. null — фильтр не поддерживается (картинки DCT/JPX отдаются как есть в imageOf). */
  decode(o: PdfObj): Uint8Array | null {
    let data = o.stream;
    if (!data || !o.dict) return data ?? null;
    const f = this.get(o.dict.get('Filter'));
    const filters = (Array.isArray(f) ? f : f ? [f] : []).map((x) => nameOf(this.get(x as PdfVal)) ?? '');
    const p = this.get(o.dict.get('DecodeParms'));
    const parms = (Array.isArray(p) ? p : [p]).map((x) => this.dict(x as PdfVal));
    for (let i = 0; i < filters.length; i++) {
      const name = filters[i];
      try {
        if (name === 'FlateDecode' || name === 'Fl') data = unpredict(inflate(data), parms[i]);
        else if (name === 'ASCIIHexDecode' || name === 'AHx') data = asciiHex(data);
        else if (name === 'ASCII85Decode' || name === 'A85') data = ascii85(data);
        else return null;
      } catch {
        return null;
      }
      if (data.length > MAX_STREAM) return null;
    }
    return data;
  }

  /** Страницы по дереву /Pages (с наследованием Resources); если дерево битое — все объекты /Page по номерам. */
  pages(): { dict: PdfDict; res: PdfDict | undefined }[] {
    const out: { dict: PdfDict; res: PdfDict | undefined }[] = [];
    const seen = new Set<PdfDict>();
    const walk = (node: PdfDict | undefined, res: PdfDict | undefined, depth: number) => {
      if (!node || seen.has(node) || depth > 30 || out.length >= MAX_PAGES) return;
      seen.add(node);
      const r = this.dict(node.get('Resources')) ?? res;
      const kidsV = this.get(node.get('Kids'));
      if (Array.isArray(kidsV)) for (const k of kidsV) walk(this.dict(k), r, depth + 1);
      else if (nameOf(node.get('Type')) === 'Page' || node.has('Contents')) out.push({ dict: node, res: r });
    };
    const root = this.dict(this.trailer.get('Root')) ?? [...this.objs.values()].find((o) => nameOf(o.dict?.get('Type')) === 'Catalog')?.dict;
    walk(this.dict(root?.get('Pages')), undefined, 0);
    if (!out.length)
      for (const [, o] of [...this.objs].sort((a, b) => a[0] - b[0])) if (o.dict && nameOf(o.dict.get('Type')) === 'Page') out.push({ dict: o.dict, res: this.dict(o.dict.get('Resources')) });
    return out.slice(0, MAX_PAGES);
  }
}

// ---------- Шрифты: коды → Unicode ----------

/** Имена глифов, которые встречаются в Differences: кириллица (afii10017…), цифры, знаки. Остальное — uniXXXX или одна буква. */
const GLYPHS: Record<string, string> = {
  space: ' ', period: '.', comma: ',', colon: ':', semicolon: ';', hyphen: '-', endash: '–', emdash: '—', parenleft: '(', parenright: ')', exclam: '!', question: '?', quotedbl: '"', quotesingle: "'",
  quoteleft: '‘', quoteright: '’', quotedblleft: '“', quotedblright: '”', guillemotleft: '«', guillemotright: '»', slash: '/', percent: '%', plus: '+', equal: '=', minus: '−', numbersign: '#', bullet: '•',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', degree: '°', multiply: '×', afii61352: '№', afii10023: 'Ё', afii10071: 'ё'
};
const CYR = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
function glyphChar(name: string): string | undefined {
  if (GLYPHS[name]) return GLYPHS[name];
  let m = /^uni([0-9A-F]{4})/i.exec(name) ?? /^u([0-9A-F]{4,6})$/i.exec(name);
  if (m) return String.fromCodePoint(parseInt(m[1], 16));
  m = /^afii(\d{5})$/.exec(name);
  if (m) {
    const n = Number(m[1]);
    if (n >= 10017 && n <= 10048) return CYR[n - 10017];
    if (n >= 10065 && n <= 10096) return CYR[n - 10065].toLowerCase();
  }
  if (/^[A-Za-z]$/.test(name)) return name;
  return undefined;
}

const CP1251 = 'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\u0098™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕїАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя';

interface Font {
  /** Сколько байт на код: 1 или 2 (Type0 Identity-H). */
  two: boolean;
  map: Map<number, string>;
  /** Ширины глифов в тысячных долях кегля (Widths у простых шрифтов, W у составных) — по ним видно пробелы между кусками строки. */
  widths: Map<number, number>;
  dw: number;
  /** Без ToUnicode у составного шрифта текст не прочитать. */
  unreadable: boolean;
  /** Простой шрифт без карты: байты как cp1251 (старые русские PDF) или latin1. */
  cyr: boolean;
  bold: boolean;
}

function utf16(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return s;
}
const codeOf = (b: Uint8Array) => b.reduce((n, x) => n * 256 + x, 0);

/** ToUnicode CMap: bfchar и bfrange (обе формы). */
export function parseToUnicode(data: Uint8Array): { map: Map<number, string>; two: boolean } {
  const map = new Map<number, string>();
  const lx = new Lexer(data);
  let two = false;
  const vals: PdfVal[] = [];
  for (let t = lx.next(); t !== undefined; t = lx.next()) {
    if (typeof t === 'object' && t !== null && 'op' in t) {
      if (t.op === 'endcodespacerange') {
        for (const v of vals) if (v instanceof PdfStr && v.bytes.length >= 2) two = true;
      } else if (t.op === 'endbfchar') {
        for (let i = 0; i + 1 < vals.length; i += 2) {
          const s = vals[i];
          const d = vals[i + 1];
          if (s instanceof PdfStr && d instanceof PdfStr) map.set(codeOf(s.bytes), utf16(d.bytes));
        }
      } else if (t.op === 'endbfrange') {
        for (let i = 0; i + 2 < vals.length; i += 3) {
          const lo = vals[i];
          const hi = vals[i + 1];
          const d = vals[i + 2];
          if (!(lo instanceof PdfStr) || !(hi instanceof PdfStr)) continue;
          const a = codeOf(lo.bytes);
          const z = Math.min(codeOf(hi.bytes), a + 65535);
          if (d instanceof PdfStr) {
            const base = utf16(d.bytes);
            const last = base.charCodeAt(base.length - 1);
            for (let c = a; c <= z; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(last + (c - a)));
          } else if (Array.isArray(d)) d.forEach((x, k) => x instanceof PdfStr && a + k <= z && map.set(a + k, utf16(x.bytes)));
        }
      }
      vals.length = 0;
    } else if (t !== undefined) vals.push(t);
  }
  return { map, two };
}

function loadFont(doc: Doc, ref: PdfVal | undefined, cache: Map<PdfVal, Font>): Font {
  const hit = ref !== undefined ? cache.get(ref) : undefined;
  if (hit) return hit;
  const d = doc.dict(ref);
  const sub = nameOf(d?.get('Subtype'));
  const baseName = nameOf(d?.get('BaseFont')) ?? '';
  const font: Font = { two: sub === 'Type0', map: new Map(), widths: new Map(), dw: 500, unreadable: false, cyr: false, bold: /bold|black|heavy|semibold|demi/i.test(baseName) };
  if (sub === 'Type0') {
    const descV = doc.get(d?.get('DescendantFonts'));
    const desc = doc.dict(Array.isArray(descV) ? descV[0] : undefined);
    font.dw = numOf(doc.get(desc?.get('DW'))) ?? 1000;
    const w = doc.get(desc?.get('W'));
    if (Array.isArray(w))
      for (let i = 0; i < w.length; ) {
        const a = numOf(doc.get(w[i]));
        const next = doc.get(w[i + 1]);
        if (a === undefined) break;
        if (Array.isArray(next)) {
          next.forEach((x, k) => font.widths.set(a + k, numOf(doc.get(x)) ?? font.dw));
          i += 2;
        } else {
          const z = numOf(next) ?? a;
          const v = numOf(doc.get(w[i + 2])) ?? font.dw;
          for (let c = a; c <= Math.min(z, a + 65535); c++) font.widths.set(c, v);
          i += 3;
        }
      }
  } else {
    const first = numOf(doc.get(d?.get('FirstChar'))) ?? 0;
    const ws = doc.get(d?.get('Widths'));
    if (Array.isArray(ws)) ws.forEach((x, k) => font.widths.set(first + k, numOf(doc.get(x)) ?? 0));
  }
  const tu = doc.obj(d?.get('ToUnicode'));
  const data = tu ? doc.decode(tu) : null;
  if (data) {
    const r = parseToUnicode(data);
    font.map = r.map;

  } else if (sub === 'Type0') font.unreadable = true;
  else {
    const enc = doc.get(d?.get('Encoding'));
    const diffs = isDict(enc) ? doc.get(enc.get('Differences')) : undefined;
    if (Array.isArray(diffs)) {
      let code = 0;
      for (const x of diffs) {
        if (typeof x === 'number') code = x;
        else if (x instanceof PdfName) {
          const ch = glyphChar(x.n);
          if (ch) font.map.set(code, ch);
          code++;
        }
      }
    }
    // Старые русские PDF: TrueType без ToUnicode и без своей кодировки, байты — cp1251.
    font.cyr = !nameOf(enc) || nameOf(enc) === 'WinAnsiEncoding' ? /cyr|rus|1251/i.test(baseName) || !nameOf(enc) : false;
  }
  if (ref !== undefined) cache.set(ref, font);
  return font;
}

/** Байты строки → текст и продвижение (в долях кегля). */
function decodeText(font: Font | undefined, bytes: Uint8Array): { text: string; adv: number } {
  if (!font) return { text: new TextDecoder('latin1').decode(bytes), adv: bytes.length * 0.5 };
  let s = '';
  let adv = 0;
  const w = (code: number) => (font.widths.get(code) ?? font.dw) / 1000;
  if (font.two) {
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (!font.unreadable) s += font.map.get(code) ?? '';
      adv += w(code);
    }
    return { text: s, adv };
  }
  for (const c of bytes) {
    const m = font.map.get(c);
    if (m !== undefined) s += m;
    else if (c >= 128 && font.cyr) s += CP1251[c - 128];
    else if (c >= 32) s += String.fromCharCode(c);
    adv += w(c);
  }
  return { text: s, adv };
}

// ---------- Текст страницы ----------

interface Item {
  x: number;
  y: number;
  size: number;
  text: string;
  bold: boolean;
  /** Примерная ширина — для пробела между кусками одной строки. */
  w: number;
}

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

interface PageOut {
  items: Item[];
  images: PdfImage[];
  unreadable: boolean;
}

export type PdfImage = { kind: 'jpeg'; bytes: Uint8Array; w: number; h: number } | { kind: 'raw'; data: Uint8Array; w: number; h: number; comps: 1 | 3 };

function imageOf(doc: Doc, o: PdfObj): PdfImage | null {
  const d = o.dict!;
  const w = numOf(doc.get(d.get('Width'))) ?? 0;
  const h = numOf(doc.get(d.get('Height'))) ?? 0;
  if (w < 50 || h < 50 || !o.stream) return null;
  const f = doc.get(d.get('Filter'));
  const filters = (Array.isArray(f) ? f : f ? [f] : []).map((x) => nameOf(doc.get(x as PdfVal)));
  if (filters[filters.length - 1] === 'DCTDecode') {
    if (filters.length === 1) return { kind: 'jpeg', bytes: o.stream, w, h };
    return null;
  }
  const cs = doc.get(d.get('ColorSpace'));
  const iccN = Array.isArray(cs) && nameOf(cs[0]) === 'ICCBased' ? (numOf(doc.obj(cs[1])?.dict?.get('N')) ?? 3) : 0;
  const csName = nameOf(cs) ?? (iccN === 1 ? 'DeviceGray' : iccN === 3 ? 'DeviceRGB' : undefined);
  const comps = csName === 'DeviceGray' ? 1 : csName === 'DeviceRGB' ? 3 : 0;
  if (!comps || (numOf(doc.get(d.get('BitsPerComponent'))) ?? 8) !== 8) return null;
  const data = doc.decode(o);
  if (!data || data.length < w * h * comps) return null;
  return { kind: 'raw', data: data.subarray(0, w * h * comps), w, h, comps: comps as 1 | 3 };
}

function runContent(doc: Doc, content: Uint8Array, res: PdfDict | undefined, ctm0: M, out: PageOut, fonts: Map<PdfVal, Font>, depth: number) {
  const lx = new Lexer(content);
  const stack: PdfVal[] = [];
  let ctm: M = ctm0;
  const saved: M[] = [];
  let tm: M = [1, 0, 0, 1, 0, 0];
  let tlm: M = [1, 0, 0, 1, 0, 0];
  let leading = 0;
  let font: Font | undefined;
  let size = 12;
  const fontRes = doc.dict(res?.get('Font'));
  const xobj = doc.dict(res?.get('XObject'));
  const show = (s: string, adv: number) => {
    const m = mul(tm, ctm);
    const scale = Math.hypot(m[2], m[3]) || 1;
    const eff = size * scale;
    if (s.trim()) out.items.push({ x: m[4], y: m[5], size: eff, text: s, bold: font?.bold ?? false, w: adv * eff });
    tm = [tm[0], tm[1], tm[2], tm[3], tm[4] + adv * size * tm[0], tm[5] + adv * size * tm[1]];
  };
  const showStr = (v: PdfVal) => {
    if (!(v instanceof PdfStr)) return;
    const t = decodeText(font, v.bytes);
    if (font?.unreadable && v.bytes.length) out.unreadable = true;
    show(t.text, t.adv);
  };
  for (let t = lx.next(); t !== undefined; t = lx.next()) {
    if (!(typeof t === 'object' && t !== null && 'op' in t)) {
      if (stack.length > 64) stack.shift();
      stack.push(t as PdfVal);
      // «n g R» в потоке не бывает, ссылки не разбираем.
      continue;
    }
    const n = (i: number) => numOf(stack[stack.length - i]) ?? 0;
    switch (t.op) {
      case 'q':
        saved.push(ctm);
        break;
      case 'Q':
        ctm = saved.pop() ?? ctm;
        break;
      case 'cm':
        ctm = mul([n(6), n(5), n(4), n(3), n(2), n(1)], ctm);
        break;
      case 'BT':
        tm = tlm = [1, 0, 0, 1, 0, 0];
        break;
      case 'Tf': {
        const fname = nameOf(stack[stack.length - 2]);
        size = n(1) || size;
        const ref = fname ? fontRes?.get(fname) : undefined;
        font = ref !== undefined ? loadFont(doc, ref, fonts) : undefined;
        break;
      }
      case 'TL':
        leading = n(1);
        break;
      case 'Tm':
        tm = tlm = [n(6), n(5), n(4), n(3), n(2), n(1)];
        break;
      case 'Td':
      case 'TD':
        if (t.op === 'TD') leading = -n(1);
        tm = tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm);
        break;
      case 'T*':
        tm = tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        break;
      case 'Tj':
        showStr(stack[stack.length - 1]);
        break;
      case "'":
      case '"':
        tm = tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        showStr(stack[stack.length - 1]);
        break;
      case 'TJ': {
        const arr = stack[stack.length - 1];
        if (!Array.isArray(arr)) break;
        let buf = '';
        let adv = 0;
        for (const x of arr) {
          if (x instanceof PdfStr) {
            const s = decodeText(font, x.bytes);
            if (font?.unreadable && x.bytes.length) out.unreadable = true;
            buf += s.text;
            adv += s.adv;
          } else if (typeof x === 'number') {
            // Сдвиг больше четверти кегля — это пробел между словами (так набирают выключку по ширине).
            if (x < -250 && buf && !buf.endsWith(' ')) buf += ' ';
            adv -= x / 1000;
          }
        }
        show(buf, adv);
        break;
      }
      case 'Do': {
        const name = nameOf(stack[stack.length - 1]);
        const ref = name ? xobj?.get(name) : undefined;
        const o = doc.obj(ref);
        const sub = nameOf(o?.dict?.get('Subtype'));
        if (o && sub === 'Image') {
          const m = ctm;
          // Картинка на всю страницу или большая — кандидат «скан страницы».
          const img = Math.abs(m[0] * m[3]) > 40000 ? imageOf(doc, o) : null;
          if (img) out.images.push(img);
        } else if (o && sub === 'Form' && depth < 4) {
          const data = doc.decode(o);
          const fm = doc.get(o.dict!.get('Matrix'));
          const mat: M = Array.isArray(fm) && fm.length === 6 ? (fm.map((v) => numOf(v) ?? 0) as M) : [1, 0, 0, 1, 0, 0];
          if (data) runContent(doc, data, doc.dict(o.dict!.get('Resources')) ?? res, mul(mat, ctm), out, fonts, depth + 1);
        }
        break;
      }
    }
    stack.length = 0;
  }
}

/** Куски текста → строки (сверху вниз, слева направо) с размером и «жирностью». */
function toLines(items: Item[]): { text: string; size: number; y: number; bold: boolean }[] {
  const lines: { items: Item[]; y: number; size: number }[] = [];
  for (const it of items) {
    // Тот же базовый уровень (с допуском) — та же строка; иначе ищем подходящую среди прежних (колонки, сноски).
    const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(2, Math.min(l.size, it.size) * 0.45));
    if (line) {
      line.items.push(it);
      line.size = Math.max(line.size, it.size);
    } else lines.push({ items: [it], y: it.y, size: it.size });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    let text = '';
    let end = -Infinity;
    for (const it of l.items) {
      if (text && !text.endsWith(' ') && !it.text.startsWith(' ') && it.x - end > it.size * 0.15) text += ' ';
      text += it.text;
      end = it.x + it.w;
    }
    const letters = l.items.reduce((n, it) => n + it.text.trim().length, 0);
    const boldLetters = l.items.filter((it) => it.bold).reduce((n, it) => n + it.text.trim().length, 0);
    return { text: text.replace(/\s+/g, ' ').trim(), size: l.size, y: l.y, bold: letters > 0 && boldLetters / letters > 0.8 };
  });
}

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

/** Строки всех страниц → Markdown: крупные строки — заголовки, большие промежутки — абзацы, переносы склеиваются. */
function linesToMarkdown(pages: { text: string; size: number; y: number; bold: boolean }[][]): string {
  const all = pages.flat().filter((l) => l.text);
  // Основной кегль — по числу знаков, а не строк: заголовков мало, но строк у них столько же.
  const weighted: number[] = [];
  for (const l of all) for (let i = 0; i < Math.min(200, l.text.length); i += 10) weighted.push(Math.round(l.size * 10) / 10);
  const body = median(weighted) || 12;
  // Размеры заголовков от крупного к мелкому: самый крупный — «#», следующий — «##», остальные — «###».
  const heads = [...new Set(all.filter((l) => l.size >= body * 1.15 && l.text.length <= 100).map((l) => Math.round(l.size * 2) / 2))].sort((a, b) => b - a);
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(escLineStart(escInline(joinLines(para))));
    para = [];
  };
  for (const lines of pages) {
    let prevY: number | undefined;
    // Обычный шаг строк — самый маленький промежуток (не больше 1,3 кегля: если на странице одни однострочные абзацы).
    const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).filter((g) => g > body * 0.8);
    const step = Math.min(gaps.length ? Math.min(...gaps) : Infinity, body * 1.3);
    for (const l of lines) {
      if (!l.text) continue;
      const short = l.text.length <= 100 && !/[.,;:]$/.test(l.text);
      const big = short && l.size >= body * 1.15 ? heads.findIndex((h) => Math.abs(h - l.size) < 0.6) : -1;
      const level = big >= 0 ? Math.min(3, big + 1) : short && l.bold && l.text.length <= 80 ? 3 : 0;
      // Номер страницы внизу (одна цифра в строке) — не текст конспекта.
      if (/^\d{1,4}$/.test(l.text)) continue;
      if (level) {
        flush();
        out.push('#'.repeat(level) + ' ' + escInline(l.text));
      } else {
        if (prevY !== undefined && prevY - l.y > step * 1.45) flush();
        if (/^[•●▪■◦–-]\s/.test(l.text)) {
          flush();
          para.push('- ' + l.text.replace(/^[•●▪■◦–-]\s+/, ''));
          out.push(escInline(para.join(' ')));
          para = [];
        } else para.push(l.text);
      }
      prevY = l.y;
    }
    flush();
  }
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

export interface PdfResult {
  markdown: string;
  stats: FileStats;
  warnings: string[];
  /** PDF без текста (скан): картинки страниц для ветки «Фото». */
  scans: PdfImage[];
}

/** PDF → Markdown или (если это скан) картинки страниц. Бросает понятную ошибку, если PDF не прочитать. */
export function pdfToMarkdown(bytes: Uint8Array): PdfResult {
  if (bytes.length > MAX_BYTES) throw new Error('PDF больше 80 МБ — раздели его на части.');
  if (!/^%PDF-/.test(new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).trimStart()) && !new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-'))
    throw new Error('Файл не похож на PDF.');
  const doc = new Doc(bytes);
  if (doc.trailer.has('Encrypt')) throw new Error('PDF защищён (зашифрован). Открой его и сохрани заново как PDF без защиты — или «Печать → Сохранить как PDF».');
  const pages = doc.pages();
  if (!pages.length) throw new Error('В PDF не нашлось страниц.');
  const fonts = new Map<PdfVal, Font>();
  const perPage: { text: string; size: number; y: number; bold: boolean }[][] = [];
  const scans: PdfImage[] = [];
  let unreadable = false;
  let images = 0;
  for (const p of pages) {
    const out: PageOut = { items: [], images: [], unreadable: false };
    const c = doc.get(p.dict.get('Contents'));
    const parts = (Array.isArray(c) ? c : [p.dict.get('Contents')]).map((x) => doc.obj(x as PdfVal)).filter((o): o is PdfObj => Boolean(o));
    const chunks = parts.map((o) => doc.decode(o)).filter((x): x is Uint8Array => Boolean(x));
    const total = chunks.reduce((n, x) => n + x.length + 1, 0);
    const content = new Uint8Array(total);
    let off = 0;
    for (const ch of chunks) {
      content.set(ch, off);
      content[off + ch.length] = 10;
      off += ch.length + 1;
    }
    runContent(doc, content, p.res, [1, 0, 0, 1, 0, 0], out, fonts, 0);
    unreadable ||= out.unreadable;
    images += out.images.length;
    perPage.push(toLines(out.items));
    // Самая большая картинка страницы — её снимок (если это скан).
    const big = out.images.sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (big) scans.push(big);
  }
  const markdown = linesToMarkdown(perPage);
  const letters = markdown.replace(/[^\p{L}\p{N}]/gu, '').length;
  const warnings: string[] = [];
  const isScan = letters < pages.length * 40;
  if (isScan && unreadable && !scans.length) throw new Error('Текст в этом PDF набран шрифтом без таблицы символов — прочитать его нельзя. Открой PDF и сохрани как .docx (Word умеет) или «Печать → Сохранить как PDF».');
  if (!isScan && unreadable) warnings.push('Часть текста набрана шрифтом без таблицы символов и пропущена.');
  return { markdown: isScan ? '' : markdown, stats: { tables: 0, images, pages: pages.length }, warnings, scans: isScan ? scans : [] };
}
