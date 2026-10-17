// Импорт карточек из других приложений (1.32, N1): таблица CSV/TSV (Excel, Google Таблицы, Brainscape, Knowt),
// текстовый экспорт Quizlet (свои разделители), Mochi (.mochi — архив с data.json или data.edn) и RemNote (текст с «>>», «::»).
// Здесь только разбор — без интерфейса и без записи в данные. Чужой файл не доверенный: лимиты размера и числа строк,
// архив — через safeUnzip (защита от «бомбы»), ключи вида __proto__ не принимаются.
import type { CardType } from './types';

export const IMPORT_LIMITS = { text: 8 * 1024 * 1024, rows: 20000, field: 20000, cols: 30, depth: 64 };

export interface ImportedCard {
  type: CardType;
  front: string;
  back: string;
  why?: string;
}

export interface ImportedDeck {
  name: string;
  cards: ImportedCard[];
}

export interface ImportResult {
  format: string;
  decks: ImportedDeck[];
  /** Строки, которые пропустили (пустой вопрос или ответ). */
  skipped: number;
  /** Обрезано по лимиту (слишком много строк или слишком длинные поля). */
  cut: boolean;
}

// ---------- Таблица: CSV, TSV, Quizlet ----------

/** Разделитель столбцов: таб, запятая, точка с запятой, тире Quizlet « - » или свой. */
export type ColSep = 'tab' | 'comma' | 'semicolon' | 'dash' | { custom: string };
/** Разделитель строк: перенос строки, точка с запятой (Quizlet) или свой. */
export type RowSep = 'newline' | 'semicolon' | { custom: string };

export interface TableOptions {
  col: ColSep;
  row: RowSep;
  /** Первая строка — названия столбцов. */
  header: boolean;
}

export const colSepChar = (c: ColSep): string => (c === 'tab' ? '\t' : c === 'comma' ? ',' : c === 'semicolon' ? ';' : c === 'dash' ? ' - ' : c.custom);
export const rowSepChar = (r: RowSep): string => (r === 'newline' ? '\n' : r === 'semicolon' ? ';' : r.custom);

const clip = (s: string) => (s.length > IMPORT_LIMITS.field ? s.slice(0, IMPORT_LIMITS.field) : s);

/**
 * CSV по правилам RFC 4180: кавычки, "" внутри кавычек, переносы строк внутри кавычек.
 * Пустые строки пропускаются. Не больше IMPORT_LIMITS.rows строк.
 */
export function splitCsv(text: string, sep: string): { rows: string[][]; cut: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let atStart = true;
  let cut = false;
  const push = () => {
    row.push(clip(field));
    if (row.some((x) => x.trim() !== '')) rows.push(row.slice(0, IMPORT_LIMITS.cols));
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    if (rows.length >= IMPORT_LIMITS.rows) {
      cut = true;
      break;
    }
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') (field += '"'), i++;
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
      continue;
    }
    if (text.startsWith(sep, i)) {
      row.push(clip(field));
      field = '';
      atStart = true;
      i += sep.length - 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      push();
      field = '';
      atStart = true;
      if (ch === '\r' && text[i + 1] === '\n') i++;
      continue;
    }
    // Пробелы перед открывающей кавычкой («a, "b"») не мешают ей.
    if (!(atStart && (ch === ' ' || ch === '\t') && sep !== '\t')) atStart = false;
    if (!atStart || ch !== ' ') field += ch;
  }
  if (!cut && (field !== '' || row.length)) push();
  return { rows, cut };
}

/** Таблица по выбранным разделителям. Quizlet со своим разделителем строк — без кавычек, как он и выгружает. */
export function splitTable(text: string, o: TableOptions): { rows: string[][]; cut: boolean } {
  const clean = text.replace(/^﻿/, '');
  const col = colSepChar(o.col);
  const rowSep = rowSepChar(o.row);
  if (!col) return { rows: [], cut: false };
  if (rowSep === '\n') return splitCsv(clean, col);
  if (!rowSep) return { rows: [], cut: false };
  const parts = clean.split(rowSep);
  const cut = parts.length > IMPORT_LIMITS.rows;
  const rows = parts
    .slice(0, IMPORT_LIMITS.rows)
    .map((r) => r.replace(/^\r?\n|\r?\n$/g, ''))
    .filter((r) => r.trim())
    .map((r) => {
      const at = r.indexOf(col);
      // Quizlet: первый разделитель отделяет термин от определения, дальше — часть определения.
      return at < 0 ? [clip(r.trim())] : [clip(r.slice(0, at).trim()), clip(r.slice(at + col.length).trim())];
    });
  return { rows, cut };
}

/** Угадать разделители по началу текста: таб (Quizlet, Excel), точка с запятой (русский Excel), запятая, « - ». */
export function guessTable(text: string): TableOptions {
  const head = text.replace(/^﻿/, '').slice(0, 20000);
  const lines = head.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  const score = (s: string) => {
    const counts = lines.map((l) => l.split(s).length - 1);
    const has = counts.filter((c) => c > 0).length;
    return has / Math.max(1, lines.length);
  };
  const cands: [ColSep, number][] = [
    ['tab', score('\t')],
    ['semicolon', score(';')],
    ['comma', score(',')],
    ['dash', score(' - ')]
  ];
  // Таб и точка с запятой редко бывают внутри текста — им доверяем чуть больше, чем запятой.
  const weight: Record<string, number> = { tab: 1.2, semicolon: 1.05, comma: 1, dash: 0.9 };
  cands.sort((a, b) => b[1] * weight[b[0] as string] - a[1] * weight[a[0] as string]);
  const col = cands[0][1] > 0.5 ? cands[0][0] : 'tab';
  // Всё в одну строку, но много «;»: Quizlet с разделителем карточек «;».
  const row: RowSep = lines.length <= 1 && (head.match(/;/g)?.length ?? 0) >= 2 && col !== 'semicolon' ? 'semicolon' : 'newline';
  const first = splitTable(lines.slice(0, 2).join('\n'), { col, row: 'newline', header: false }).rows[0] ?? [];
  const header = first.length >= 2 && first.every((c) => ROLE_WORDS.some(([re]) => re.test(c.trim())));
  return { col, row, header };
}

/** Что взять из столбца: вопрос, ответ, пояснение, колоду (тему) или ничего. */
export type ColRole = 'front' | 'back' | 'why' | 'deck' | 'skip';

const ROLE_WORDS: [RegExp, ColRole][] = [
  [/^(вопрос|термин|слово|front|question|term|word|лицевая|передняя|q)$/i, 'front'],
  [/^(ответ|определение|перевод|значение|back|answer|definition|meaning|оборот|a)$/i, 'back'],
  [/^(пояснение|пример|примечание|подсказка|почему|notes?|example|hint|extra|explanation|комментарий)$/i, 'why'],
  [/^(колода|тема|раздел|deck|topic|category|set)$/i, 'deck']
];

/** Роли столбцов: по заголовку, иначе первый — вопрос, второй — ответ, третий — пояснение. */
export function guessRoles(rows: string[][], header: boolean): ColRole[] {
  const n = Math.min(IMPORT_LIMITS.cols, Math.max(0, ...rows.slice(0, 50).map((r) => r.length)));
  const roles: ColRole[] = Array.from({ length: n }, (_, i) => (i === 0 ? 'front' : i === 1 ? 'back' : i === 2 ? 'why' : 'skip'));
  if (header && rows[0]) {
    const named = rows[0].map((c) => ROLE_WORDS.find(([re]) => re.test(c.trim()))?.[1]);
    if (named.includes('front') || named.includes('back')) {
      for (let i = 0; i < n; i++) roles[i] = named[i] ?? 'skip';
      if (!roles.includes('front')) roles[roles.indexOf('skip')] = 'front';
    }
  }
  return roles;
}

/** Текст из таблицы → Markdown карточки: переносы строк сохраняются, HTML-переносы Quizlet и Excel — в переносы. */
function cell(s: string | undefined): string {
  return (s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\r\n?/g, '\n')
    .trim();
}

/** Строки таблицы → колоды. type — какой будет карточка; cloze выбирается сам, если в вопросе есть {{пропуск}}. */
export function rowsToDecks(rows: string[][], roles: ColRole[], o: { header: boolean; type: Extract<CardType, 'basic' | 'reverse' | 'typing'>; deck: string }): { decks: ImportedDeck[]; skipped: number } {
  const byDeck = new Map<string, ImportedCard[]>();
  let skipped = 0;
  const pick = (r: string[], role: ColRole) =>
    roles
      .map((x, i) => (x === role ? cell(r[i]) : ''))
      .filter(Boolean)
      .join('\n\n');
  for (const r of o.header ? rows.slice(1) : rows) {
    const front = pick(r, 'front');
    const back = pick(r, 'back');
    const why = pick(r, 'why');
    const cloze = /\{\{.+?\}\}/.test(front);
    if (!front || (!back && !cloze)) {
      skipped++;
      continue;
    }
    const deck = pick(r, 'deck').split('\n')[0].slice(0, 200) || o.deck;
    const card: ImportedCard = { type: cloze ? 'cloze' : o.type, front, back, ...(why ? { why } : {}) };
    if (!byDeck.has(deck)) byDeck.set(deck, []);
    byDeck.get(deck)!.push(card);
  }
  return { decks: [...byDeck].map(([name, cards]) => ({ name, cards })), skipped };
}

// ---------- RemNote ----------

/**
 * Текст RemNote (копирование или экспорт Markdown): «вопрос >> ответ», «<<» — наоборот, «::» и «<>» — в обе стороны,
 * «;;» — описание. Строки без разделителя с вложенными строками — названия колод. Пропуски {{…}} — как есть.
 */
export function parseRemNote(text: string, fallbackDeck: string): ImportResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const cut = lines.length > IMPORT_LIMITS.rows;
  const byDeck = new Map<string, ImportedCard[]>();
  let skipped = 0;
  let deck = fallbackDeck;
  for (let i = 0; i < Math.min(lines.length, IMPORT_LIMITS.rows); i++) {
    const raw = lines[i];
    const indent = /^\s*/.exec(raw)![0].replace(/\t/g, '    ').length;
    const line = clip(raw.trim().replace(/^[-*+]\s+/, '').replace(/^#{1,6}\s+/, ''));
    if (!line) continue;
    const m = /^(.*?)\s*(>>>|>>|<<|<>|::|;;)\s*(.*)$/.exec(line);
    if (!m) {
      // Заголовок раздела верхнего уровня, если под ним есть вложенные строки — колода.
      const next = lines.slice(i + 1).find((l) => l.trim());
      if (indent === 0 && next && /^\s+/.test(next)) deck = line.replace(/[*_#]/g, '').slice(0, 200) || fallbackDeck;
      else if (/\{\{.+?\}\}/.test(line)) push({ type: 'cloze', front: line, back: '' });
      continue;
    }
    let [, a, sep, b] = m;
    if (sep === '>>>') {
      // Многострочный ответ: вложенные строки ниже.
      const body: string[] = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || !lines[i + 1].trim()) && lines[i + 1].trim() !== '') body.push(lines[++i].trim().replace(/^[-*+]\s+/, ''));
      b = body.join('\n');
    }
    if (!a.trim() || !b.trim()) {
      skipped++;
      continue;
    }
    if (sep === '<<') [a, b] = [b, a];
    push({ type: sep === '::' || sep === '<>' ? 'reverse' : 'basic', front: a.trim(), back: b.trim() });
  }
  function push(c: ImportedCard) {
    if (!byDeck.has(deck)) byDeck.set(deck, []);
    byDeck.get(deck)!.push(c);
  }
  return { format: 'RemNote', decks: [...byDeck].map(([name, cards]) => ({ name, cards })), skipped, cut };
}

// ---------- Mochi ----------

const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** Маленький разборщик EDN (формат Clojure, в нём Mochi хранит data.edn): словари, векторы, строки, ключевые слова, числа. */
export function parseEdn(src: string): unknown {
  let i = 0;
  let depth = 0;
  const ws = () => {
    for (;;) {
      while (i < src.length && /[\s,]/.test(src[i])) i++;
      if (src[i] === ';') while (i < src.length && src[i] !== '\n') i++;
      else if (src.startsWith('#_', i)) {
        i += 2;
        value();
      } else break;
    }
  };
  const fail = (what: string) => {
    throw new Error(`EDN: ${what} (позиция ${i})`);
  };
  const coll = (end: string): unknown[] => {
    if (++depth > IMPORT_LIMITS.depth) fail('слишком глубокая вложенность');
    const out: unknown[] = [];
    for (;;) {
      ws();
      if (i >= src.length) fail('нет конца');
      if (src[i] === end) {
        i++;
        depth--;
        return out;
      }
      out.push(value());
    }
  };
  const value = (): unknown => {
    ws();
    const ch = src[i];
    if (ch === '{') {
      i++;
      const xs = coll('}');
      const o: Record<string, unknown> = {};
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const key = String(xs[k]);
        if (!BAD_KEYS.has(key)) o[key] = xs[k + 1];
      }
      return o;
    }
    if (ch === '[' || ch === '(') {
      i++;
      return coll(ch === '[' ? ']' : ')');
    }
    if (src.startsWith('#{', i)) {
      i += 2;
      return coll('}');
    }
    if (ch === '"') {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          const e = src[++i];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e === 'u' ? String.fromCharCode(parseInt(src.slice(i + 1, (i += 4) + 1), 16)) : e;
        } else s += src[i];
        i++;
      }
      i++;
      return s;
    }
    if (ch === '#') {
      // Тег (#inst "…", #uuid "…") — берём значение после него.
      i++;
      while (i < src.length && /[^\s"{[(]/.test(src[i])) i++;
      return value();
    }
    const start = i;
    while (i < src.length && /[^\s,{}[\]()";]/.test(src[i])) i++;
    const tok = src.slice(start, i);
    if (!tok) fail('непонятный символ');
    if (tok === 'nil') return null;
    if (tok === 'true' || tok === 'false') return tok === 'true';
    if (tok[0] === ':') return tok.slice(1);
    if (tok[0] === '\\') return tok.slice(1);
    const n = Number(tok.replace(/[MN]$/, ''));
    return Number.isNaN(n) ? tok : n;
  };
  return value();
}

/** Ключ без пространства имён и «~:» (transit): «:card/content» и «~:content» → «content». */
const keyName = (k: string) => k.replace(/^~:/, '').replace(/^.*\//, '');

/** Объект Mochi с чистыми ключами (без __proto__ и прочего). */
function norm(x: unknown, depth = 0): unknown {
  if (depth > IMPORT_LIMITS.depth) return null;
  if (Array.isArray(x)) return x.map((v) => norm(v, depth + 1));
  if (x && typeof x === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) {
      const key = keyName(k);
      if (!BAD_KEYS.has(key)) o[key] = norm(v, depth + 1);
    }
    return o;
  }
  return x;
}

/** Карточка Mochi: стороны разделены строкой «---»; пропуски {{…}} — как у Refrain. */
function mochiCard(content: string): ImportedCard | null {
  const sides = content.split(/\r?\n-{3,}\s*(?:\r?\n|$)/);
  const front = clip(sides[0]?.trim() ?? '');
  const back = clip(sides.slice(1).join('\n\n').trim());
  if (!front) return null;
  if (/\{\{.+?\}\}/.test(front)) return { type: 'cloze', front, back };
  return back ? { type: 'basic', front, back } : null;
}

/** data.json или data.edn из Mochi → колоды (вложенные колоды — через «›»). */
export function parseMochiData(raw: unknown): ImportResult {
  const data = norm(raw) as { decks?: unknown } | null;
  const decks = Array.isArray(data?.decks) ? (data!.decks as Record<string, unknown>[]) : [];
  const byId = new Map(decks.filter((d) => d && typeof d === 'object').map((d) => [String(d.id ?? ''), d]));
  const nameOf = (d: Record<string, unknown>, seen = 0): string => {
    const own = String(d.name ?? 'Mochi').slice(0, 200);
    const parent = d['parent-id'] ?? d.parentId ?? d.parent;
    const p = parent ? byId.get(String(parent)) : undefined;
    return p && p !== d && seen < 10 ? `${nameOf(p, seen + 1)} › ${own}` : own;
  };
  let skipped = 0;
  let total = 0;
  const out: ImportedDeck[] = [];
  for (const d of decks) {
    if (!d || typeof d !== 'object') continue;
    const list = Array.isArray(d.cards) ? d.cards : d.cards && typeof d.cards === 'object' && Array.isArray((d.cards as { list?: unknown }).list) ? (d.cards as { list: unknown[] }).list : [];
    const cards: ImportedCard[] = [];
    for (const c of list as Record<string, unknown>[]) {
      if (total >= IMPORT_LIMITS.rows) break;
      const card = c && typeof c.content === 'string' ? mochiCard(c.content) : null;
      if (card) (cards.push(card), total++);
      else skipped++;
    }
    if (cards.length) out.push({ name: nameOf(d), cards });
  }
  return { format: 'Mochi', decks: out, skipped, cut: total >= IMPORT_LIMITS.rows };
}

/** Файл .mochi (zip с data.json / data.edn) или сами data.json / data.edn. */
export async function parseMochiFile(name: string, bytes: Uint8Array): Promise<ImportResult> {
  let text: string;
  let edn = /\.edn$/i.test(name);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const { safeUnzip } = await import('./anki');
    const zip = safeUnzip(bytes, { entries: 20000 });
    const json = Object.keys(zip).find((k) => /(^|\/)data\.json$/i.test(k));
    const ednName = Object.keys(zip).find((k) => /(^|\/)data\.edn$/i.test(k));
    if (!json && !ednName) throw new Error('В архиве Mochi нет data.json или data.edn.');
    edn = !json;
    const b = zip[(json ?? ednName)!];
    if (b.length > IMPORT_LIMITS.text * 4) throw new Error('Файл Mochi слишком большой.');
    text = new TextDecoder().decode(b);
  } else {
    if (bytes.length > IMPORT_LIMITS.text * 4) throw new Error('Файл Mochi слишком большой.');
    text = new TextDecoder().decode(bytes);
    if (!edn && /^\s*\{\s*:/.test(text)) edn = true;
  }
  const raw = edn ? parseEdn(text) : JSON.parse(text);
  return parseMochiData(raw);
}

// ---------- Откуда импорт ----------

export type ImportSource = 'quizlet' | 'table' | 'brainscape' | 'knowt' | 'remnote' | 'mochi';

export const SOURCES: { id: ImportSource; title: string; hint: string; how: string[]; accept: string; paste: boolean }[] = [
  {
    id: 'quizlet',
    title: 'Quizlet',
    hint: 'Скопируй текст набора и вставь сюда',
    how: ['Открой набор на сайте Quizlet (в приложении экспорта нет).', 'Нажми «…» → «Экспортировать».', 'Нажми «Копировать текст» и вставь его ниже.'],
    accept: '.txt,.tsv,.csv',
    paste: true
  },
  {
    id: 'table',
    title: 'Таблица (CSV, TSV, Excel)',
    hint: 'Столбцы «вопрос» и «ответ»',
    how: ['В Excel или Google Таблицах: «Файл» → «Скачать» → CSV.', 'Или выдели столбцы, скопируй и вставь ниже.'],
    accept: '.csv,.tsv,.txt',
    paste: true
  },
  {
    id: 'brainscape',
    title: 'Brainscape',
    hint: 'Колода в CSV',
    how: ['В Brainscape открой колоду → «Export» → CSV (нужна подписка Pro).', 'Без подписки: открой «Edit», выдели карточки, скопируй и вставь ниже.'],
    accept: '.csv,.txt',
    paste: true
  },
  {
    id: 'knowt',
    title: 'Knowt',
    hint: 'Набор текстом или CSV',
    how: ['В Knowt открой набор → «…» → «Export».', 'Скопируй текст (термин и определение через таб) и вставь ниже.'],
    accept: '.csv,.tsv,.txt',
    paste: true
  },
  {
    id: 'remnote',
    title: 'RemNote',
    hint: 'Карточки вида «вопрос >> ответ»',
    how: ['В RemNote выдели документ с карточками и скопируй (Ctrl+C) — или «Export» → Markdown.', 'Вставь текст ниже: «>>», «<<», «::» и «;;» станут карточками.'],
    accept: '.md,.txt',
    paste: true
  },
  {
    id: 'mochi',
    title: 'Mochi',
    hint: 'Файл .mochi',
    how: ['В Mochi: «Settings» → «Export» (или правый клик по колоде → «Export deck»).', 'Выбери полученный файл .mochi.'],
    accept: '.mochi,.json,.edn',
    paste: false
  }
];
