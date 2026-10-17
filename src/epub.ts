// Книга EPUB → главы обычным текстом (1.32, N2: карточки по главе книги). Разбор только здесь, на устройстве:
// архив — через safeUnzip (лимиты числа и размера записей), разметка — без DOM (shared/readable.mjs), книги с DRM не читаем.
import { decodeEntities, htmlToPlain } from '../shared/readable.mjs';

export interface EpubChapter {
  title: string;
  text: string;
}
export interface EpubBook {
  title: string;
  author: string;
  chapters: EpubChapter[];
}

export const EPUB_MAX_BYTES = 60 * 1024 * 1024;
const MAX_CHAPTERS = 400;

const td = new TextDecoder();
const attr = (tag: string, name: string) => decodeEntities((new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(tag) ?? [])[2] ?? '');
const tagText = (xml: string, name: string) => decodeEntities((new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i').exec(xml) ?? [])[1] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Путь относительно файла base внутри архива: «OEBPS/text/» + «../img/a.png» → «OEBPS/img/a.png». */
export function resolvePath(base: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0].split('?')[0]);
  const parts = (clean.startsWith('/') ? [] : base.split('/').slice(0, -1)).concat(clean.replace(/^\/+/, '').split('/'));
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}

/** Оглавление: файл главы → название (EPUB 3 — nav.xhtml, EPUB 2 — toc.ncx). Первое упоминание файла главнее. */
function tocTitles(files: Record<string, Uint8Array>, opf: string, opfPath: string): Map<string, string> {
  const map = new Map<string, string>();
  const items = [...opf.matchAll(/<item\b[^>]*>/gi)].map((m) => m[0]);
  const nav = items.find((t) => /\bproperties\s*=\s*["'][^"']*\bnav\b/i.test(t));
  const ncx = items.find((t) => /application\/x-dtbncx\+xml/i.test(attr(t, 'media-type')));
  if (nav) {
    const path = resolvePath(opfPath, attr(nav, 'href'));
    const html = files[path] ? td.decode(files[path]) : '';
    const toc = /<nav\b[^>]*(?:epub:)?type\s*=\s*["'][^"']*toc[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i.exec(html)?.[1] ?? html;
    for (const a of toc.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const file = resolvePath(path, attr(a[1], 'href'));
      const title = decodeEntities(a[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      if (file && title && !map.has(file)) map.set(file, title);
    }
  } else if (ncx) {
    const path = resolvePath(opfPath, attr(ncx, 'href'));
    const xml = files[path] ? td.decode(files[path]) : '';
    for (const p of xml.matchAll(/<navPoint\b[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\b([^>]*)\/?>/gi)) {
      const file = resolvePath(path, attr(p[2], 'src'));
      const title = decodeEntities(p[1]).replace(/\s+/g, ' ').trim();
      if (file && title && !map.has(file)) map.set(file, title);
    }
  }
  return map;
}

/** Разобрать книгу. Обложка, титул и другие почти пустые страницы пропускаются. */
export async function parseEpub(bytes: Uint8Array): Promise<EpubBook> {
  if (bytes.length > EPUB_MAX_BYTES) throw new Error('Книга слишком большая (больше 60 МБ).');
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error('Это не книга EPUB. Подходят файлы .epub без защиты.');
  const { safeUnzip } = await import('./anki');
  const files = safeUnzip(bytes, { entries: 20000 });
  const container = files['META-INF/container.xml'];
  if (!container) throw new Error('Книга повреждена: нет описания содержимого.');
  const enc = files['META-INF/encryption.xml'] ? td.decode(files['META-INF/encryption.xml']) : '';
  // Шифруют иногда только шрифты (это не мешает читать текст); зашифрованные главы — DRM.
  if ([...enc.matchAll(/<(?:\w+:)?CipherReference\b([^>]*)>/gi)].some((m) => /\.(x?html?|xml)$/i.test(attr(m[1], 'URI')))) throw new Error('Книга защищена от копирования (DRM) — её текст не прочитать. Подойдёт книга без защиты.');
  const opfPath = attr((/<rootfile\b[^>]*>/i.exec(td.decode(container)) ?? [''])[0], 'full-path');
  const opf = opfPath && files[opfPath] ? td.decode(files[opfPath]) : '';
  if (!opf) throw new Error('Книга повреждена: не нашлось списка глав.');
  const manifest = new Map<string, { href: string; type: string }>();
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) manifest.set(attr(m[0], 'id'), { href: resolvePath(opfPath, attr(m[0], 'href')), type: attr(m[0], 'media-type') });
  const spine = [...opf.matchAll(/<itemref\b[^>]*>/gi)].map((m) => attr(m[0], 'idref'));
  const toc = tocTitles(files, opf, opfPath);
  const chapters: EpubChapter[] = [];
  for (const id of spine) {
    const it = manifest.get(id);
    if (!it || !/html|xml/i.test(it.type) || !files[it.href]) continue;
    const html = td.decode(files[it.href]);
    const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
    const text = htmlToPlain(body.replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')).trim();
    if (text.replace(/\s/g, '').length < 200) continue;
    const heading = /^## (.+)$/m.exec(text)?.[1]?.trim();
    chapters.push({ title: (toc.get(it.href) || heading || `Часть ${chapters.length + 1}`).slice(0, 200), text });
    if (chapters.length >= MAX_CHAPTERS) break;
  }
  if (!chapters.length) throw new Error('В книге не нашлось текста.');
  return { title: tagText(opf, 'title').slice(0, 200) || 'Книга', author: tagText(opf, 'creator').slice(0, 120), chapters };
}
