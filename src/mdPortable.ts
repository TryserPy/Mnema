// Общие кирпичики переносимого Markdown: безопасные имена файлов, YAML-свойства (frontmatter), относительные пути,
// data:-картинки ↔ байты, санитизация чужого текста. Чистые функции без интерфейса (работают и в тестах без браузера).

// ---------- Имена файлов ----------

/** Имена, которые Windows не даёт использовать для файлов (в любом регистре, с расширением или без). */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Имя файла или папки, безопасное для Windows, macOS и Linux: без запрещённых символов (\ / : * ? " < > | и управляющих),
 * без # ^ [ ] (они ломают ссылки в Obsidian), без точек и пробелов в конце, без зарезервированных CON/PRN/AUX/NUL/COM1…LPT9.
 * Кириллица остаётся как есть.
 */
export function safeFileName(s: string, fallback = 'Без названия', max = 80): string {
  let n = String(s ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  n = n.slice(0, max).replace(/[. ]+$/g, '').replace(/^\.+/, '').trim();
  if (!n) return fallback;
  if (RESERVED.test(n.split('.')[0].trim())) n += '_';
  return n;
}

/** Путь, которого ещё нет среди `used` (без учёта регистра: Windows и macOS их не различают). Дубль получает « (2)», « (3)»… перед расширением. */
export function uniquePath(used: Set<string>, path: string): string {
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  const hasExt = dot > slash + 1;
  const stem = hasExt ? path.slice(0, dot) : path;
  const ext = hasExt ? path.slice(dot) : '';
  let p = path;
  for (let n = 2; used.has(p.toLowerCase()); n++) p = `${stem} (${n})${ext}`;
  used.add(p.toLowerCase());
  return p;
}

/** Относительный путь из папки `fromDir` к файлу `to` (оба — от корня архива, через «/»): «../../attachments/a.png». */
export function relPath(fromDir: string, to: string): string {
  const a = fromDir ? fromDir.split('/').filter(Boolean) : [];
  const b = to.split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

/** Ссылка на файл для Markdown: пробелы, скобки и кириллица кодируются, «/» остаются. */
export const linkPath = (p: string): string => p.split('/').map((x) => (x === '..' ? x : encodeURIComponent(x).replace(/[()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()))).join('/');

/**
 * Привести путь из архива или ссылки к безопасному виду: «/» вместо «\», без «.» и пустых частей;
 * null, если путь абсолютный, с диском («C:») или выходит за корень через «..» (zip-slip).
 */
export function cleanPath(raw: string): string | null {
  const p = String(raw).replace(/\\/g, '/');
  if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.includes('\0')) return null;
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') return null;
    out.push(part);
  }
  return out.length ? out.join('/') : null;
}

/** Разобрать относительную ссылку из .md (с %-кодированием и #якорем) и приложить к папке файла. null, если уходит за корень. */
export function resolveRel(fromDir: string, href: string): string | null {
  let h = href.trim().replace(/^<|>$/g, '');
  h = h.split('#')[0].split('?')[0];
  try {
    h = decodeURIComponent(h);
  } catch {
    /* оставляем как есть */
  }
  h = h.replace(/\\/g, '/');
  if (!h || h.startsWith('/') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(h)) return null;
  const parts = fromDir ? fromDir.split('/').filter(Boolean) : [];
  for (const part of h.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length ? parts.join('/') : null;
}

// ---------- Картинки ----------

export const EXT_BY_MIME: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
export const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** data:image/…;base64,… или data:image/svg+xml,%3Csvg… → тип и байты; не картинка → null. */
export function parseImageUri(uri: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml))(;[^,]*)?,([\s\S]*)$/i.exec(uri.trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  try {
    if (/;base64/i.test(m[2] ?? '')) return { mime, bytes: b64ToBytes(m[3]) };
    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(m[3])) };
  } catch {
    return null;
  }
}

export const bytesToImageUri = (mime: string, bytes: Uint8Array): string => `data:${mime};base64,${bytesToB64(bytes)}`;

/** Рисунок Refrain: SVG, который приложение само создало (по нему можно дорисовать). */
export const isDrawingSvg = (text: string): boolean => /data-mnema="drawing"/.test(text.slice(0, 2000));

/** SVG без скриптов, обработчиков событий, внешних ссылок и вложенного HTML: годится как картинка. */
export function safeSvgText(text: string): boolean {
  if (isDrawingSvg(text)) return !/<script|\son\w+\s*=|<foreignObject|javascript:/i.test(text);
  return !/<script|\son\w+\s*=|<foreignObject|javascript:|<iframe|<embed|<object|href\s*=\s*["']?(?!#)|xlink:href\s*=\s*["']?(?!#)/i.test(text);
}

// ---------- YAML-свойства ----------

const PLAIN = /^[\p{L}\p{N}_][\p{L}\p{N}_ .\-/()+,]*$/u;

function yamlValue(v: unknown): string {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    // Простое слово или фраза пишем как есть; всё, что YAML понял бы иначе (true, 12, дата, двоеточие, кавычки…), — в двойных кавычках.
    if (PLAIN.test(v) && !/^(true|false|null|yes|no|on|off|~)$/i.test(v) && !/^[\d.+-]/.test(v) && !/[\s]$/.test(v) && !/: /.test(v)) return v;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // даты ГГГГ-ММ-ДД читаются как даты (Obsidian показывает календарь)
    return JSON.stringify(v);
  }
  return JSON.stringify(v); // списки и объекты — JSON в одну строку (это тоже верный YAML)
}

/** Блок свойств «---\nключ: значение\n---\n». Пустые значения пропускаются. */
export function emitFrontmatter(meta: Record<string, unknown>): string {
  const lines = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${yamlValue(v)}`);
  return lines.length ? `---\n${lines.join('\n')}\n---\n` : '';
}

function yamlScalar(raw: string): unknown {
  const s = raw.trim();
  if (!s || s === '~' || s === 'null') return '';
  if (/^["[{]/.test(s)) {
    try {
      return JSON.parse(s);
    } catch {
      /* не JSON: дальше как YAML */
    }
  }
  if (s.startsWith('[') && s.endsWith(']')) return s.slice(1, -1).split(',').map((x) => String(yamlScalar(x))).filter(Boolean);
  if (s.startsWith("'") && s.endsWith("'") && s.length > 1) return s.slice(1, -1).replace(/''/g, "'");
  if (s.startsWith('"') && s.endsWith('"') && s.length > 1) return s.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^(true|yes)$/i.test(s)) return true;
  if (/^(false|no)$/i.test(s)) return false;
  return s;
}

/** Отделить свойства от текста. Понимает наш формат и обычные свойства Obsidian (в том числе списки «- элемент»). */
export function parseFrontmatter(md: string): { meta: Record<string, unknown>; body: string } {
  const text = md.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, unknown> = {};
  let listKey: string | null = null;
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (meta[listKey] as unknown[]).push(yamlScalar(item[1]));
      continue;
    }
    const kv = /^([^\s:#][^:]*?):(?:\s+(.*))?$/.exec(line);
    if (!kv) continue;
    const key = kv[1].trim();
    if (kv[2] === undefined || kv[2].trim() === '') {
      meta[key] = [];
      listKey = key;
    } else {
      meta[key] = yamlScalar(kv[2]);
      listKey = null;
    }
  }
  // Ключ без значения и без списка под ним — пустая строка.
  for (const [k, v] of Object.entries(meta)) if (Array.isArray(v) && !v.length) meta[k] = '';
  return { meta, body: text.slice(m[0].length) };
}

export const metaStr = (meta: Record<string, unknown>, key: string): string | undefined => {
  const v = meta[key];
  return typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined;
};

// ---------- Санитизация чужого текста ----------

const KEEP_TAGS = new Set(['br', 'u', 'mark', 'sub', 'sup', 'b', 'i', 'em', 'strong', 's', 'del', 'kbd', 'small']);

/**
 * Markdown из чужих файлов: HTML-теги, кроме безобидного форматирования (без атрибутов), превращаются в текст; комментарии <!-- --> убираются;
 * ссылки и картинки с опасным адресом (javascript:, vbscript:, data:text/html, file:, //сервер) теряют адрес. Код в ``` и `…` не трогается.
 * Это первая линия защиты на входе; вторая — DOMPurify при каждом показе конспекта (Markdown.tsx) и разбор схемой редактора.
 */
export function sanitizeImportedMarkdown(md: string): string {
  const parts = md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : cleanProse(part)))
    .join('');
}

function cleanProse(s: string): string {
  let t = s.replace(/<!--[\s\S]*?-->/g, '');
  // Безобидные теги прячем под служебные знаки, остальное экранируем, потом возвращаем безобидные.
  t = t.replace(/<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (all, name: string) => {
    const tag = name.toLowerCase();
    if (!KEEP_TAGS.has(tag)) return all.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (all.startsWith('</')) return `\u0001/${tag}\u0002`;
    return `\u0001${tag}\u0002`;
  });
  // Незакрытый «<тег» без «>» не тег, но экранируем «<», за которым идёт буква, чтобы он не склеился с чужим текстом.
  t = t.replace(/<(?=[a-zA-Z!?/])/g, '&lt;').replace(/\u0001(\/?[a-z]+)\u0002/g, '<$1>');
  // Адреса в [текст](адрес) и ![alt](адрес); в адресе допускаются скобки на один уровень.
  t = t.replace(/(!?\[[^\]\n]*\])\(\s*<?((?:[^()\s>]|\([^()]*\))*)>?((?:\s+"[^"]*")?)\s*\)/g, (all, label: string, href: string) => {
    const h = href.trim();
    const ok = h === '' || /^(#|https?:|mailto:|mnema:\/\/|data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,])/i.test(h) || (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(h) && !h.startsWith('//') && !h.startsWith('\\\\'));
    return ok ? all : label.startsWith('!') ? `*(картинка не перенесена)*` : label.slice(1, -1) || '';
  });
  return t;
}

// ---------- CSV ----------

/** Ячейка CSV (RFC 4180): кавычки при запятой, «;», кавычке или переводе строки; ведущие = + - @ не должны запускать формулы в таблицах. */
export function csvCell(v: string): string {
  let s = String(v ?? '').replace(/\r\n?/g, '\n');
  if (/^[=+\-@]/.test(s) && !/^[+-]?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells: string[]): string => cells.map(csvCell).join(',');
