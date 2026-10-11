// Чтение папки с Markdown (экспорт Refrain, хранилище Obsidian, любые .md с картинками) и zip-архива с ней.
// Чистая логика без интерфейса и без доступа к данным приложения: на выходе план импорта (ImportPlan),
// который store.importTree превращает в папки, предметы, темы и карточки.
// Безопасность: пути из архива проверяются на «..», абсолютные пути и диски (zip-slip); есть лимиты на число и размер файлов;
// HTML из чужих файлов обезвреживается (sanitizeImportedMarkdown), опасные адреса отбрасываются, SVG со скриптами не принимается,
// значки предметов проходят validIconImg.
import { validIconImg } from './iconImage';
import { parseCards, parseListTable, parsePoems, type PlainCard } from './mdCards';
import { b64ToBytes, bytesToB64, bytesToImageUri, cleanPath, isDrawingSvg, MIME_BY_EXT, metaStr, parseFrontmatter, resolveRel, safeSvgText, sanitizeImportedMarkdown } from './mdPortable';
import { CALLOUT_TITLES } from './obsidian';
import { validExamDate } from './safeData';
import type { CardType, ListKind, ListMode, PagePhoto, StudyList } from './types';
import { parseVideo } from './video';

export const LIMITS = {
  entries: 20000, // записей в архиве
  notes: 5000, // заметок .md
  noteBytes: 5 * 1024 * 1024,
  imageBytes: 3 * 1024 * 1024,
  totalBytes: 300 * 1024 * 1024, // всего после распаковки
  cardsPerNote: 5000
};

export const EXPORT_MARK = 'refrain-markdown-export';
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const PALETTE = ['#2F8F5B', '#B4452F', '#2A5BB8', '#6B3FC4', '#B7791F', '#1F7A6B', '#C2417A', '#3A3F4E', '#E0572E', '#0E8FA3'];

// ---------- Чтение набора файлов ----------

export interface Pack {
  files: Map<string, Uint8Array>; // чистые пути от корня → байты
  warnings: string[];
}

/** Занести файл в набор, если путь безопасный и размер в пределах. Возвращает false, если файл отброшен. */
function accept(pack: Pack, rawPath: string, bytes: Uint8Array, state: { total: number }): boolean {
  const path = cleanPath(rawPath);
  if (!path) {
    pack.warnings.push(`Пропущен файл с небезопасным путём: ${String(rawPath).slice(0, 80)}`);
    return false;
  }
  if (path.split('/').some((p) => p.startsWith('.'))) return false; // .obsidian, .git, .trash…
  const md = /\.md$/i.test(path);
  if (!md && !IMAGE_EXT.test(path)) return false;
  if (bytes.length > (md ? LIMITS.noteBytes : LIMITS.imageBytes)) {
    pack.warnings.push(`Пропущен слишком большой файл: ${path}`);
    return false;
  }
  state.total += bytes.length;
  if (state.total > LIMITS.totalBytes) throw new Error('Слишком много данных: больше 300 МБ после распаковки');
  pack.files.set(path, bytes);
  return true;
}

/** Набор файлов из уже прочитанных записей (папка, выбранная в окне: путь внутри папки → байты). */
export function packFromEntries(entries: { path: string; bytes: Uint8Array }[]): Pack {
  const pack: Pack = { files: new Map(), warnings: [] };
  const state = { total: 0 };
  let notes = 0;
  for (const e of entries) {
    if (/\.md$/i.test(e.path) && ++notes > LIMITS.notes) {
      pack.warnings.push(`Заметок больше ${LIMITS.notes} — лишние пропущены`);
      continue;
    }
    accept(pack, e.path, e.bytes, state);
  }
  return finishPack(pack);
}

/** Распаковать zip с защитой: путь, размер и число файлов проверяются до распаковки каждой записи. */
export async function packFromZip(zip: Uint8Array): Promise<Pack> {
  const { unzipSync } = await import('fflate');
  const pack: Pack = { files: new Map(), warnings: [] };
  const state = { total: 0 };
  let entries = 0;
  let notes = 0;
  let declared = 0;
  const raw = unzipSync(zip, {
    filter(f) {
      if (++entries > LIMITS.entries) throw new Error('В архиве слишком много файлов');
      if (f.name.endsWith('/')) return false;
      const p = cleanPath(f.name);
      if (!p) {
        pack.warnings.push(`Пропущен файл с небезопасным путём: ${f.name.slice(0, 80)}`);
        return false;
      }
      const md = /\.md$/i.test(p);
      if ((!md && !IMAGE_EXT.test(p)) || p.split('/').some((x) => x.startsWith('.'))) return false;
      if (f.originalSize > (md ? LIMITS.noteBytes : LIMITS.imageBytes)) {
        pack.warnings.push(`Пропущен слишком большой файл: ${p}`);
        return false;
      }
      if (md && ++notes > LIMITS.notes) return false;
      declared += f.originalSize;
      if (declared > LIMITS.totalBytes) throw new Error('Слишком много данных: больше 300 МБ после распаковки');
      return true;
    }
  });
  for (const [name, bytes] of Object.entries(raw)) accept(pack, name, bytes, state);
  return finishPack(pack);
}

/** Если всё лежит в одной внешней папке, сделанной Refrain (README с меткой или attachments/), снять её. */
function finishPack(pack: Pack): Pack {
  const names = [...pack.files.keys()];
  const tops = new Set(names.map((n) => n.split('/')[0]));
  if (tops.size === 1 && names.every((n) => n.includes('/'))) {
    const top = [...tops][0];
    const readme = pack.files.get(`${top}/README.md`);
    const ours = readme ? new TextDecoder().decode(readme.subarray(0, 300)).includes(EXPORT_MARK) : false;
    if (ours) {
      const files = new Map<string, Uint8Array>();
      for (const [n, b] of pack.files) files.set(n.slice(top.length + 1), b);
      return { files, warnings: pack.warnings };
    }
  }
  return pack;
}

// ---------- План импорта ----------

export interface ImportedCard {
  type: CardType;
  front: string;
  back: string;
  why?: string;
  /** id словаря из файла (ключ в ImportedTopic.lists) */
  listId?: string;
}

export interface ImportedTopic {
  key: string; // pk-N: на него ссылаются placeholders mnema://topic/pk-N в конспектах
  path: string;
  name: string;
  note: string;
  subjectName: string;
  subjectColor?: string;
  subjectIcon?: string;
  subjectIconImg?: string;
  folderName?: string;
  folderColor?: string;
  folderIcon?: string;
  folderIconImg?: string;
  parentKey?: string;
  kind?: 'rule' | 'glossary';
  examDate?: string;
  important?: boolean;
  order?: number;
  createdAt?: string;
  lists?: StudyList[];
  pages?: PagePhoto[];
  poems?: { title: string; author?: string; text: string }[];
  cards: ImportedCard[];
}

export interface ImportPlan {
  topics: ImportedTopic[];
  warnings: string[];
  stats: { notes: number; subjects: number; folders: number; cards: number; images: number };
}

const LIST_KINDS = new Set<ListKind>(['vocab', 'terms', 'dates', 'formulas', 'custom']);
const LIST_MODES = new Set<ListMode>(['basic', 'reverse', 'typing']);
const HEX = /^#[0-9a-fA-F]{6}$/;

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const stem = (p: string) => baseName(p).replace(/\.md$/i, '');
const noExt = (p: string) => p.replace(/\.md$/i, '');
const lc = (s: string) => s.toLowerCase();

const asEmoji = (v: unknown) => (typeof v === 'string' && v.trim() && !/[<>&"]/.test(v) ? [...v.trim()].slice(0, 4).join('') : undefined);
const asColor = (v: unknown) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : undefined);
const asDate = (v: unknown) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : undefined);

/** Картинка из набора как data URI: растр проверяется по первым байтам, SVG — на безопасность. null — нельзя. */
function imageUri(bytes: Uint8Array, path: string): string | null {
  const ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;
  if (mime === 'image/svg+xml') {
    const text = new TextDecoder().decode(bytes);
    if (!safeSvgText(text)) return null;
    return `data:image/svg+xml;base64,${bytesToB64(bytes)}`;
  }
  const uri = bytesToImageUri(mime, bytes);
  const head = String.fromCharCode(...bytes.subarray(0, 12));
  const ok = mime === 'image/png' ? head.startsWith('\x89PNG') : mime === 'image/jpeg' ? head.startsWith('\xff\xd8\xff') : mime === 'image/gif' ? head.startsWith('GIF8') : head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
  return ok ? uri : null;
}

/** Значок предмета или папки: после проверки validIconImg (маленький растр) или ничего. */
function iconUri(pack: Pack, fromDir: string, href: unknown): string | undefined {
  if (typeof href !== 'string' || !href) return undefined;
  const p = resolveRel(fromDir, href);
  const bytes = p ? pack.files.get(p) : undefined;
  if (!bytes || /\.svg$/i.test(p ?? '')) return undefined;
  const uri = imageUri(bytes, p ?? '');
  return uri && validIconImg(uri) ? uri : undefined;
}

/** Найти заметку по пути, названию или refrain-id. */
interface Index {
  byPath: Map<string, string>; // путь без .md (строчные) → key
  byName: Map<string, string | null>; // название файла (строчные) → key; null — неоднозначно
  byId: Map<string, string>; // refrain-id → key
}

function lookupNote(ix: Index, fromDir: string, target: string): string | undefined {
  let t = target.trim().replace(/^<|>$/g, '').split('#')[0].split('^')[0].trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    /* как есть */
  }
  t = noExt(t.replace(/\\/g, '/'));
  if (!t) return undefined;
  const rel = resolveRel(fromDir, t);
  if (rel && ix.byPath.has(lc(rel))) return ix.byPath.get(lc(rel));
  const abs = cleanPath(t);
  if (abs && ix.byPath.has(lc(abs))) return ix.byPath.get(lc(abs));
  if (!t.includes('/')) {
    const k = ix.byName.get(lc(t));
    if (k) return k;
  } else {
    // [[Предмет/Тема]] без точного пути: по последним частям пути
    const tail = '/' + lc(t);
    const hits = [...ix.byPath].filter(([p]) => ('/' + p).endsWith(tail));
    if (hits.length === 1) return hits[0][1];
  }
  return undefined;
}

export function planImport(pack: Pack, opts: { fallbackName?: string } = {}): ImportPlan {
  const warnings = [...pack.warnings];
  const fallback = (opts.fallbackName ?? 'Импорт').trim() || 'Импорт';
  const names = [...pack.files.keys()].filter((p) => /\.md$/i.test(p)).sort((a, b) => a.localeCompare(b, 'ru'));
  const ours = [...pack.files].some(([p, b]) => p === 'README.md' && new TextDecoder().decode(b.subarray(0, 300)).includes(EXPORT_MARK));
  const parsed: { path: string; meta: Record<string, unknown>; body: string }[] = [];
  for (const path of names.slice(0, LIMITS.notes)) {
    if (ours && (path === 'README.md' || path === 'Карточки.md')) continue;
    const text = new TextDecoder('utf-8').decode(pack.files.get(path)!);
    const { meta, body } = parseFrontmatter(text);
    parsed.push({ path, meta, body });
  }

  // Ключи и указатель для ссылок
  const keyOf = new Map<string, string>();
  const ix: Index = { byPath: new Map(), byName: new Map(), byId: new Map() };
  parsed.forEach((n, i) => {
    const key = `pk-${i + 1}`;
    keyOf.set(n.path, key);
    ix.byPath.set(lc(noExt(n.path)), key);
    const nm = lc(stem(n.path));
    ix.byName.set(nm, ix.byName.has(nm) ? null : key);
    const id = metaStr(n.meta, 'refrain-id');
    if (id) ix.byId.set(id, key);
  });

  let imgCount = 0;
  let missing = 0;

  const topics: ImportedTopic[] = parsed.map((n) => {
    const key = keyOf.get(n.path)!;
    const here = dirOf(n.path);
    const meta = n.meta;
    const hasMeta = Object.keys(meta).length > 0;
    const name = metaStr(meta, 'title') ?? stem(n.path);
    const parts = n.path.split('/');
    const subjectName = metaStr(meta, 'subject') ?? (parts.length > 1 ? parts[0] : fallback);

    let body = sanitizeImportedMarkdown(n.body.replace(/\r\n?/g, '\n'));

    // Разделы, которые Refrain написал сам
    const lists: StudyList[] = [];
    const rawLists = Array.isArray(meta['refrain-lists']) ? (meta['refrain-lists'] as unknown[]) : [];
    const cards: ImportedCard[] = [];
    for (const l of rawLists) {
      const o = l as Partial<StudyList>;
      if (!o || typeof o.id !== 'string' || typeof o.title !== 'string' || !Array.isArray(o.cols) || o.cols.length !== 3 || !LIST_KINDS.has(o.kind as ListKind)) continue;
      const mode: ListMode = LIST_MODES.has(o.mode as ListMode) ? (o.mode as ListMode) : 'basic';
      const list: StudyList = { id: o.id, kind: o.kind as ListKind, title: o.title.slice(0, 120), cols: o.cols.map((c) => String(c).slice(0, 80)) as [string, string, string], mode, ...(typeof o.lang === 'string' ? { lang: o.lang.slice(0, 12) } : {}) };
      const t = parseListTable(body, list.title);
      if (!t) continue;
      body = t.rest;
      lists.push(list);
      const type: CardType = mode === 'reverse' ? 'reverse' : mode === 'typing' ? 'typing' : 'basic';
      for (const r of t.rows) cards.push({ type, front: r.front, back: r.back, ...(r.why ? { why: r.why } : {}), listId: list.id });
    }
    const pc = parseCards(body);
    body = pc.rest;
    cards.push(...pc.cards.map((c: PlainCard): ImportedCard => ({ type: c.type, front: c.front, back: c.back, ...(c.why ? { why: c.why } : {}) })));
    const pp = parsePoems(body);
    body = pp.rest;
    if (hasMeta) body = body.replace(/\n## Подтемы\n(?:\s*\n)?(?:[ \t]*[-*] .*(?:\n|$))+/g, '\n');

    // Название первой строкой — это заголовок файла, а не текст конспекта
    body = body.replace(new RegExp(`^\\s*#\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`, 'i'), '');

    // Obsidian: комментарии, выноски, блочные ссылки
    body = body.replace(/%%[\s\S]*?%%/g, '');
    body = body.replace(/^>\s*\[!(\w+)\][+-]?\s*(.*)$/gm, (_m, type: string, title: string) => `> **${title.trim() || CALLOUT_TITLES[type.toLowerCase()] || type}**`);
    body = body.replace(/[ \t]\^[a-zA-Z0-9-]+$/gm, '');

    // Встроенные картинки ![[файл|300]] и обычные ![alt](путь)
    const findImage = (href: string): string | null => {
      let h = href.trim().replace(/^<|>$/g, '');
      try {
        h = decodeURIComponent(h);
      } catch {
        /* как есть */
      }
      const p = resolveRel(here, h) ?? cleanPath(h);
      let bytes = p ? pack.files.get(p) : undefined;
      let at = p ?? h;
      if (!bytes) {
        const want = lc(baseName(h.replace(/\\/g, '/')));
        const hit = [...pack.files.keys()].find((k) => lc(baseName(k)) === want && IMAGE_EXT.test(k));
        if (hit) {
          bytes = pack.files.get(hit);
          at = hit;
        }
      }
      return bytes ? imageUri(bytes, at) : null;
    };
    body = body.replace(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, (_m, target: string) => {
      const base = baseName(target.trim());
      if (!IMAGE_EXT.test(base)) return `*(см. заметку «${noExt(base)}»)*`;
      const uri = findImage(target);
      if (uri) {
        imgCount++;
        return `![${base}](${uri})`;
      }
      missing++;
      return `*(картинка «${base}» не найдена)*`;
    });
    body = body.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (m, alt: string, src: string) => {
      if (/^data:image\//i.test(src)) return m;
      if (/^https?:/i.test(src)) return parseVideo(src) && !alt ? `![video](${src})` : m;
      if (alt === 'video' && parseVideo(src)) return m;
      const uri = findImage(src);
      if (uri) {
        imgCount++;
        const drawing = /^data:image\/svg\+xml/.test(uri) && isDrawingSvg(new TextDecoder().decode(b64ToBytes(uri.split(',')[1])));
        return `![${drawing ? 'Рисунок' : alt || baseName(src)}](${uri})`;
      }
      missing++;
      return `*(картинка «${baseName(src)}» не найдена)*`;
    });
    // Видео: «[▶ Видео](ссылка)» → плеер
    body = body.replace(/\[▶ Видео\]\((https?:[^)\s]+)\)/g, (m, url: string) => (parseVideo(url) ? `![video](${url})` : m));

    // Ссылки на другие заметки: [[Тема|текст]] и [текст](Тема.md)
    body = body.replace(/(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => {
      const text = (alias ?? target.split('#')[0]).trim();
      const k = lookupNote(ix, here, target);
      return k ? `[${text}](mnema://topic/${k})` : text;
    });
    body = body.replace(/(?<!!)\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (m, text: string, href: string) => {
      if (/^(#|https?:|mailto:|mnema:|data:)/i.test(href)) return m;
      const k = lookupNote(ix, here, href);
      return k ? `[${text}](mnema://topic/${k})` : IMAGE_EXT.test(href) ? m : text;
    });

    // Простые HTML-теги → разметка Refrain
    body = body
      .replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, '**$2**')
      .replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, '*$2*')
      .replace(/<(s|del)>([\s\S]*?)<\/\1>/gi, '~~$2~~')
      .replace(/<mark>([\s\S]*?)<\/mark>/gi, '==$1==')
      .replace(/<u>([\s\S]*?)<\/u>/gi, '++$1++');

    const note = body.replace(/\n{3,}/g, '\n\n').trim();

    const kindRaw = metaStr(meta, 'kind');
    const pagesRaw = Array.isArray(meta['refrain-pages']) ? (meta['refrain-pages'] as unknown[]) : [];
    const pages: PagePhoto[] = [];
    for (const pg of pagesRaw) {
      const o = pg as { n?: unknown; file?: unknown };
      const p = typeof o?.file === 'string' ? resolveRel(here, o.file) : null;
      const bytes = p ? pack.files.get(p) : undefined;
      const uri = bytes && p ? imageUri(bytes, p) : null;
      if (uri && typeof o.n === 'number' && Number.isFinite(o.n)) pages.push({ n: Math.trunc(o.n), img: uri });
    }

    const exam = metaStr(meta, 'exam');
    const order = typeof meta.order === 'number' && Number.isFinite(meta.order) ? meta.order : undefined;
    if (cards.length > LIMITS.cardsPerNote) {
      warnings.push(`В «${name}» карточек больше ${LIMITS.cardsPerNote} — лишние пропущены`);
      cards.length = LIMITS.cardsPerNote;
    }
    return {
      key,
      path: n.path,
      name: name.slice(0, 200),
      note,
      subjectName: subjectName.slice(0, 120),
      subjectColor: asColor(meta['subject-color']),
      subjectIcon: asEmoji(meta['subject-icon']),
      subjectIconImg: iconUri(pack, here, meta['subject-icon-image']),
      folderName: metaStr(meta, 'folder')?.slice(0, 120),
      folderColor: asColor(meta['folder-color']),
      folderIcon: asEmoji(meta['folder-icon']),
      folderIconImg: iconUri(pack, here, meta['folder-icon-image']),
      kind: kindRaw === 'rule' || kindRaw === 'glossary' ? kindRaw : undefined,
      examDate: exam && validExamDate(exam) ? exam : undefined,
      important: meta.important === true ? true : undefined,
      order,
      createdAt: asDate(meta.created),
      ...(lists.length ? { lists } : {}),
      ...(pages.length ? { pages } : {}),
      ...(pp.poems.length ? { poems: pp.poems } : {}),
      cards
    };
  });

  // Подтемы: «Предмет/Тема/Подтема.md» — подтема темы «Предмет/Тема.md»
  const byKey = new Map(topics.map((t) => [t.key, t]));
  for (const t of topics) {
    if (t.kind) continue;
    const dir = dirOf(t.path);
    if (!dir) continue;
    const parentKey = ix.byPath.get(lc(dir));
    const parent = parentKey ? byKey.get(parentKey) : undefined;
    if (parent && parent !== t && !parent.kind && parent.subjectName === t.subjectName) t.parentKey = parent.key;
  }
  // Родитель всегда раньше ребёнка, соседи — по order, затем по имени
  const depth = (t: ImportedTopic): number => {
    let d = 0;
    for (let p = t.parentKey ? byKey.get(t.parentKey) : undefined; p && d < 50; p = p.parentKey ? byKey.get(p.parentKey) : undefined) d++;
    return d;
  };
  const sorted = [...topics].sort((a, b) => depth(a) - depth(b) || (a.order ?? 1e9) - (b.order ?? 1e9) || a.path.localeCompare(b.path, 'ru'));

  // Цвета предметов: заданный в файле, иначе по кругу
  const colors = new Map<string, string>();
  for (const t of sorted) if (t.subjectColor && !colors.has(t.subjectName)) colors.set(t.subjectName, t.subjectColor);
  let ci = 0;
  for (const t of sorted) {
    if (!colors.has(t.subjectName)) colors.set(t.subjectName, PALETTE[ci++ % PALETTE.length]);
    t.subjectColor = colors.get(t.subjectName);
  }

  if (missing) warnings.push(`Не нашлось картинок: ${missing}`);
  const subjects = new Set(topics.map((t) => t.subjectName));
  const folders = new Set(topics.map((t) => t.folderName).filter(Boolean));
  return {
    topics: sorted,
    warnings,
    stats: { notes: topics.length, subjects: subjects.size, folders: folders.size, cards: topics.reduce((n, t) => n + t.cards.length, 0), images: imgCount }
  };
}
