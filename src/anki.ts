// Импорт из Anki: .apkg (старый и новый формат), .colpkg, .anki2/.anki21 и текстовый экспорт (.txt/.tsv/.csv).
// Колоды превращаются в предметы и темы, карточки — в карточки Мнемы, картинки встраиваются,
// звук пропускается. Прогресс можно перенести: история ответов прогоняется через FSRS.
import { unzipSync } from 'fflate';
import { decompress as zstd } from 'fzstd';
import type { Database, SqlJsStatic } from 'sql.js';
import { clozeOrdForAnki, gradeItem } from './srs';
import type { CardType, ItemState, Settings } from './types';

export interface AnkiLog {
  ord: number;
  rating: 1 | 2 | 3 | 4;
  prevState: number;
  at: string;
  ms: number;
}

export interface AnkiCard {
  type: CardType;
  front: string; // Markdown
  back: string; // Markdown
  states: Record<number, ItemState>;
  logs: AnkiLog[];
}

export interface AnkiDeck {
  path: string[]; // «Биология::Клетка» → ['Биология', 'Клетка']
  cards: AnkiCard[];
}

export interface AnkiReport {
  format: string;
  notes: number;
  cards: number;
  images: number;
  sounds: number; // звук не переносится
  missingMedia: number;
  skipped: number; // заметки, которые не удалось превратить в карточки (например, Image Occlusion)
  withProgress: number; // карточки с историей ответов
}

export interface AnkiParsed {
  decks: AnkiDeck[];
  report: AnkiReport;
}

export interface ParseOptions {
  progress: boolean; // переносить историю ответов
  settings: Pick<Settings, 'retention'>;
}

const MAX_IMAGE = 3 * 1024 * 1024;
const MAX_ALL_IMAGES = 80 * 1024 * 1024;

// ---------- Мелочи ----------

const td = new TextDecoder();

function isZstd(b: Uint8Array) {
  return b.length > 4 && b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;
}
function isSqlite(b: Uint8Array) {
  return td.decode(b.subarray(0, 15)) === 'SQLite format 3';
}
function isZip(b: Uint8Array) {
  return b[0] === 0x50 && b[1] === 0x4b;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif'
};

/** Разбор protobuf-списка медиафайлов нового формата: MediaEntries { repeated MediaEntry entries = 1 }. */
function readMediaEntries(buf: Uint8Array): { name: string; zipName: string }[] {
  let p = 0;
  const varint = (b: Uint8Array, end: number) => {
    let r = 0;
    let shift = 0;
    while (p < end) {
      const x = b[p++];
      r += (x & 0x7f) * 2 ** shift;
      if (!(x & 0x80)) break;
      shift += 7;
    }
    return r;
  };
  const out: { name: string; zipName: string }[] = [];
  while (p < buf.length) {
    const key = varint(buf, buf.length);
    const wire = key & 7;
    if (wire !== 2) {
      if (wire === 0) varint(buf, buf.length);
      else break;
      continue;
    }
    const len = varint(buf, buf.length);
    const end = p + len;
    if (key >>> 3 === 1) {
      let name = '';
      let legacy: number | undefined;
      while (p < end) {
        const k = varint(buf, end);
        const f = k >>> 3;
        const w = k & 7;
        if (w === 2) {
          const l = varint(buf, end);
          if (f === 1) name = td.decode(buf.subarray(p, p + l));
          p += l;
        } else if (w === 0) {
          const v = varint(buf, end);
          if (f === 255) legacy = v;
        } else break;
      }
      out.push({ name, zipName: String(legacy ?? out.length) });
    }
    p = end;
  }
  return out;
}

// ---------- HTML Anki → Markdown Мнемы ----------

const ENT: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', shy: '' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export interface MediaCtx {
  image(name: string): string | null; // data URI или null
  onSound(): void;
}

/** Переводит поле Anki (HTML) в Markdown. */
export function ankiHtmlToMarkdown(html: string, media?: MediaCtx): string {
  let s = html.replace(/\r/g, '');
  // Звук и видео — пропускаем.
  s = s.replace(/\[sound:[^\]]*\]/g, () => {
    media?.onSound();
    return '';
  });
  // Формулы: \( \) и \[ \], а также старые [$]…[/$], [$$]…[/$$], [latex]…[/latex].
  const math: string[] = [];
  const keep = (tex: string, block: boolean) => {
    const clean = decodeEntities(tex.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).trim();
    math.push(block ? `$$${clean}$$` : `$${clean}$`);
    return `\u0000${math.length - 1}\u0000`;
  };
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, t: string) => keep(t, true));
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, t: string) => keep(t, false));
  s = s.replace(/\[\$\$\]([\s\S]+?)\[\/\$\$\]/g, (_, t: string) => keep(t, true));
  s = s.replace(/\[\$\]([\s\S]+?)\[\/\$\]/g, (_, t: string) => keep(t, false));
  s = s.replace(/\[latex\]([\s\S]+?)\[\/latex\]/gi, (_, t: string) => keep(t, true));
  // Картинки.
  s = s.replace(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi, (_, a?: string, b?: string, c?: string) => {
    let name = decodeEntities(a ?? b ?? c ?? '');
    try {
      name = decodeURIComponent(name);
    } catch {
      /* имя без кодирования */
    }
    const uri = media?.image(name);
    return uri ? `\n\n![](${uri})\n\n` : '';
  });
  // Переносы и блоки.
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(div|p|li|h[1-6]|tr|blockquote)>/gi, '\n');
  s = s.replace(/<li\b[^>]*>/gi, '- ');
  s = s.replace(/<(div|p|ul|ol|table|tr|h[1-6]|blockquote)\b[^>]*>/gi, '\n');
  s = s.replace(/<\/t[dh]>/gi, ' · ');
  // Жирный и курсив: пробелы выносим наружу, иначе Markdown их не поймёт.
  const wrap = (tags: string, mark: string) => {
    const re = new RegExp(`<(${tags})\\b[^>]*>([\\s\\S]*?)</\\1>`, 'gi');
    s = s.replace(re, (_, _t: string, inner: string) => {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
      return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
    });
  };
  wrap('b|strong', '**');
  wrap('i|em', '*');
  s = s.replace(/<(mark)\b[^>]*>([\s\S]*?)<\/mark>/gi, (_, _t: string, inner: string) => `==${inner}==`);
  // Остальные теги убираем.
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => math[Number(i)]);
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\*\*\*\*/g, '')
    .trim();
  // Блочная формула — отдельным абзацем.
  s = s.replace(/[ \t]*(\$\$[^$]+\$\$)[ \t]*/g, '\n\n$1\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

/** Текст без разметки — для карточек «с вводом ответа». */
function plain(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\*\*|==|\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Общая сборка карточек ----------

interface NoteIn {
  kind: 'normal' | 'cloze';
  fields: string[]; // HTML
  fieldNames: string[];
  templates: number; // сколько шаблонов у типа
  typing: boolean;
  cardOrds: number[]; // какие карточки реально есть у заметки
  deck: string; // полное имя колоды «A::B»
}

function noteToCard(n: NoteIn, media: MediaCtx): { card: AnkiCard; ankiToOrd: (ord: number) => number } | null {
  const md = n.fields.map((f) => ankiHtmlToMarkdown(f, media));
  const joinedHtml = n.fields.join(' ');
  if (/image-occlusion:/i.test(joinedHtml)) return null;
  const hasCloze = /\{\{c\d+::/i.test(joinedHtml);
  if (n.kind === 'cloze' || hasCloze) {
    const idx = md.findIndex((f) => /\{\{c\d+::/i.test(f));
    if (idx < 0) return null;
    const text = md[idx];
    const extra = md.filter((_, i) => i !== idx && md[i]).join('\n\n');
    return { card: { type: 'cloze', front: text, back: extra, states: {}, logs: [] }, ankiToOrd: (ord) => clozeOrdForAnki(text, ord + 1) };
  }
  const idx = md.map((f, i) => ({ f, i })).filter(({ f, i }) => f && !/reverse|обратн/i.test(n.fieldNames[i] ?? ''));
  if (idx.length === 0) return null;
  const front = idx[0].f;
  const back = idx
    .slice(1)
    .map((x) => x.f)
    .join('\n\n');
  if (!back) return null;
  if (n.typing) return { card: { type: 'typing', front, back: plain(idx[1].f), states: {}, logs: [] }, ankiToOrd: () => 0 };
  const reverse = n.templates >= 2 && n.cardOrds.includes(1);
  return { card: { type: reverse ? 'reverse' : 'basic', front, back, states: {}, logs: [] }, ankiToOrd: (ord) => (reverse ? Math.min(ord, 1) : 0) };
}

function makeMedia(files: Map<string, () => Uint8Array | null>, report: AnkiReport): MediaCtx {
  const cache = new Map<string, string | null>();
  let total = 0;
  return {
    image(name) {
      if (cache.has(name)) {
        const hit = cache.get(name)!;
        if (hit) report.images++;
        return hit;
      }
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      const get = files.get(name);
      const bytes = get?.() ?? null;
      let uri: string | null = null;
      if (bytes && MIME[ext] && bytes.length <= MAX_IMAGE && total + bytes.length <= MAX_ALL_IMAGES) {
        total += bytes.length;
        uri = `data:${MIME[ext]};base64,${b64(bytes)}`;
        report.images++;
      } else report.missingMedia++;
      cache.set(name, uri);
      return uri;
    },
    onSound() {
      report.sounds++;
    }
  };
}

function deckPath(name: string): string[] {
  const parts = name
    .split(/\x1f|::/)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts : ['Anki'];
}

function pushCard(decks: Map<string, AnkiDeck>, deck: string, card: AnkiCard) {
  const path = deckPath(deck);
  const key = path.join('::');
  let d = decks.get(key);
  if (!d) {
    d = { path, cards: [] };
    decks.set(key, d);
  }
  d.cards.push(card);
}

// ---------- Коллекция SQLite ----------

interface RevRow {
  cid: number;
  id: number;
  ease: number;
  type: number;
  time: number;
}

function rows<T>(db: Database, sql: string): T[] {
  const st = db.prepare(sql);
  const out: T[] = [];
  while (st.step()) out.push(st.getAsObject() as T);
  st.free();
  return out;
}

function readCollection(db: Database, media: MediaCtx, opts: ParseOptions, report: AnkiReport): Map<string, AnkiDeck> {
  const tables = new Set(rows<{ name: string }>(db, "select name from sqlite_master where type='table'").map((r) => r.name));
  // Типы заметок и колоды.
  const types = new Map<number, { kind: 'normal' | 'cloze'; fields: string[]; templates: number; typing: boolean }>();
  const decks = new Map<number, string>();
  if (tables.has('notetypes')) {
    for (const nt of rows<{ id: number; config: Uint8Array }>(db, 'select id, config from notetypes')) {
      const cfg = nt.config;
      const kind = cfg && cfg[0] === 0x08 && cfg[1] === 1 ? 'cloze' : 'normal';
      types.set(nt.id, { kind, fields: [], templates: 0, typing: false });
    }
    for (const f of rows<{ ntid: number; ord: number; name: string }>(db, 'select ntid, ord, name from fields order by ntid, ord')) types.get(f.ntid)?.fields.push(f.name);
    for (const t of rows<{ ntid: number; config: Uint8Array }>(db, 'select ntid, config from templates order by ntid, ord')) {
      const nt = types.get(t.ntid);
      if (!nt) continue;
      nt.templates++;
      if (nt.templates === 1 && t.config && td.decode(t.config).includes('{{type:')) nt.typing = true;
    }
    for (const d of rows<{ id: number; name: string }>(db, 'select id, name from decks')) decks.set(d.id, d.name);
  } else {
    const col = rows<{ models: string; decks: string }>(db, 'select models, decks from col')[0];
    const models = JSON.parse(col.models) as Record<string, { type: number; flds: { name: string }[]; tmpls: { qfmt: string }[] }>;
    for (const [id, m] of Object.entries(models))
      types.set(Number(id), { kind: m.type === 1 ? 'cloze' : 'normal', fields: m.flds.map((f) => f.name), templates: m.tmpls.length, typing: (m.tmpls[0]?.qfmt ?? '').includes('{{type:') });
    for (const [id, d] of Object.entries(JSON.parse(col.decks) as Record<string, { name: string }>)) decks.set(Number(id), d.name);
  }

  const cards = rows<{ id: number; nid: number; did: number; odid: number; ord: number }>(db, 'select id, nid, did, odid, ord from cards order by nid, ord');
  const byNote = new Map<number, typeof cards>();
  for (const c of cards) {
    const list = byNote.get(c.nid) ?? [];
    list.push(c);
    byNote.set(c.nid, list);
  }
  const revs = new Map<number, RevRow[]>();
  if (opts.progress)
    for (const r of rows<RevRow>(db, 'select id, cid, ease, type, time from revlog order by id')) {
      const list = revs.get(r.cid) ?? [];
      list.push(r);
      revs.set(r.cid, list);
    }

  const out = new Map<string, AnkiDeck>();
  for (const note of rows<{ id: number; mid: number; flds: string }>(db, 'select id, mid, flds from notes order by id')) {
    report.notes++;
    const nt = types.get(note.mid);
    const ncards = byNote.get(note.id) ?? [];
    if (!nt || ncards.length === 0) {
      report.skipped++;
      continue;
    }
    const first = ncards[0];
    const deck = decks.get(first.odid || first.did) ?? 'Anki';
    const res = noteToCard(
      { kind: nt.kind, fields: note.flds.split('\x1f'), fieldNames: nt.fields, templates: nt.templates, typing: nt.typing, cardOrds: ncards.map((c) => c.ord), deck },
      media
    );
    if (!res) {
      report.skipped++;
      continue;
    }
    const { card, ankiToOrd } = res;
    if (opts.progress) {
      let had = false;
      for (const c of ncards) {
        const ord = ankiToOrd(c.ord);
        if (ord < 0) continue;
        let st: ItemState | undefined = card.states[ord];
        for (const r of revs.get(c.id) ?? []) {
          if (r.type === 4 || r.type === 5) {
            if (r.ease === 0 && r.type === 4) st = undefined; // «Забыть» в Anki
            continue;
          }
          if (r.ease < 1 || r.ease > 4) continue;
          const at = new Date(r.id);
          const rating = r.ease as 1 | 2 | 3 | 4;
          card.logs.push({ ord, rating, prevState: st?.state ?? 0, at: at.toISOString(), ms: Math.max(0, Math.min(60000, r.time)) });
          st = gradeItem(st, at, rating, opts.settings);
        }
        if (st) {
          card.states[ord] = st;
          had = true;
        }
      }
      if (had) report.withProgress++;
    }
    report.cards++;
    pushCard(out, deck, card);
  }
  return out;
}

// ---------- Текстовый экспорт ----------

function splitDelimited(text: string, sep: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let quoted = false;
  let atStart = true;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
      i++;
      continue;
    }
    if (ch === sep) {
      row.push(field);
      field = '';
      atStart = true;
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      row.push(field);
      if (row.some((x) => x !== '')) out.push(row);
      row = [];
      field = '';
      atStart = true;
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    atStart = false;
    i++;
  }
  row.push(field);
  if (row.some((x) => x !== '')) out.push(row);
  return out;
}

const SEPS: Record<string, string> = { tab: '\t', comma: ',', semicolon: ';', pipe: '|', space: ' ', colon: ':' };

export function parseAnkiText(fileName: string, text: string, report: AnkiReport): Map<string, AnkiDeck> {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const head: Record<string, string> = {};
  let bodyStart = 0;
  for (; bodyStart < lines.length; bodyStart++) {
    const m = /^#([a-z ]+):(.*)$/i.exec(lines[bodyStart]);
    if (!m) break;
    head[m[1].trim().toLowerCase()] = m[2].trim();
  }
  const body = lines.slice(bodyStart).join('\n');
  let sep = SEPS[head.separator?.toLowerCase() ?? ''] ?? head.separator;
  if (!sep) sep = body.includes('\t') ? '\t' : body.split('\n')[0].includes(';') ? ';' : ',';
  const html = head.html ? head.html === 'true' : /<[a-z][^>]*>/i.test(body);
  const col = (k: string) => (head[k + ' column'] ? Number(head[k + ' column']) - 1 : -1);
  const ntCol = col('notetype');
  const deckCol = col('deck');
  const tagsCol = col('tags');
  const guidCol = col('guid');
  const special = new Set([ntCol, deckCol, tagsCol, guidCol].filter((x) => x >= 0));
  const fallbackDeck = head.deck ?? fileName.replace(/\.[^.]+$/, '');
  const media: MediaCtx = { image: () => (report.missingMedia++, null), onSound: () => report.sounds++ };
  const out = new Map<string, AnkiDeck>();
  for (const r of splitDelimited(body, sep)) {
    report.notes++;
    const fields = r.filter((_, i) => !special.has(i)).map((f) => (html ? f : f.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')));
    const nt = ntCol >= 0 ? (r[ntCol] ?? '') : head.notetype ?? '';
    while (fields.length && !fields[fields.length - 1].trim()) fields.pop();
    const res = noteToCard(
      {
        kind: /cloze|пропуск/i.test(nt) ? 'cloze' : 'normal',
        fields,
        fieldNames: [],
        templates: /revers|обе стороны|обратн/i.test(nt) ? 2 : 1,
        typing: /type in|ввод/i.test(nt),
        cardOrds: [0, 1],
        deck: ''
      },
      media
    );
    if (!res) {
      report.skipped++;
      continue;
    }
    report.cards++;
    pushCard(out, deckCol >= 0 && r[deckCol] ? r[deckCol] : fallbackDeck, res.card);
  }
  return out;
}

// ---------- Точка входа ----------

export const ANKI_EXTENSIONS = ['.apkg', '.colpkg', '.anki2', '.anki21', '.txt', '.tsv', '.csv'];
export const isAnkiFileName = (n: string) => ANKI_EXTENSIONS.some((e) => n.toLowerCase().endsWith(e));

export function parseAnki(fileName: string, bytes: Uint8Array, SQL: SqlJsStatic, opts: ParseOptions): AnkiParsed {
  const report: AnkiReport = { format: '', notes: 0, cards: 0, images: 0, sounds: 0, missingMedia: 0, skipped: 0, withProgress: 0 };
  const lower = fileName.toLowerCase();
  let decks: Map<string, AnkiDeck>;

  if (isZip(bytes)) {
    const zip = unzipSync(bytes);
    const media = new Map<string, () => Uint8Array | null>();
    const raw = (zipName: string) => () => {
      const b = zip[zipName];
      if (!b) return null;
      return isZstd(b) ? zstd(b) : b;
    };
    const mediaFile = zip['media'];
    if (mediaFile) {
      if (isZstd(mediaFile)) for (const e of readMediaEntries(zstd(mediaFile))) media.set(e.name, raw(e.zipName));
      else {
        try {
          for (const [zipName, name] of Object.entries(JSON.parse(td.decode(mediaFile)) as Record<string, string>)) media.set(name, raw(zipName));
        } catch {
          /* нет списка медиа */
        }
      }
    }
    let colBytes: Uint8Array | undefined;
    if (zip['collection.anki21b']) {
      colBytes = zstd(zip['collection.anki21b']);
      report.format = 'Anki 23.10+';
    } else if (zip['collection.anki21']) {
      colBytes = zip['collection.anki21'];
      report.format = 'Anki 2.1';
    } else if (zip['collection.anki2']) {
      colBytes = zip['collection.anki2'];
      report.format = 'Anki 2.0';
    }
    if (!colBytes) throw new Error('В архиве нет колоды Anki.');
    if (lower.endsWith('.colpkg')) report.format += ', вся коллекция';
    const db = new SQL.Database(colBytes);
    try {
      decks = readCollection(db, makeMedia(media, report), opts, report);
    } finally {
      db.close();
    }
  } else if (isSqlite(bytes)) {
    report.format = 'Коллекция Anki (без картинок)';
    const db = new SQL.Database(bytes);
    try {
      decks = readCollection(db, makeMedia(new Map(), report), opts, report);
    } finally {
      db.close();
    }
  } else {
    report.format = 'Текст из Anki';
    decks = parseAnkiText(fileName, td.decode(bytes), report);
  }
  // Пустую «Default» и колоды без карточек не показываем.
  const list = [...decks.values()].filter((d) => d.cards.length > 0).sort((a, b) => a.path.join('::').localeCompare(b.path.join('::'), 'ru'));
  for (const d of list) if (d.path.length === 1 && /^(default|по умолчанию)$/i.test(d.path[0])) d.path = ['Anki'];
  return { decks: list, report };
}
