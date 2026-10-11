// Копирование из конспекта в буфер обмена: чистый Markdown (для Obsidian, Typora, мессенджеров) и HTML, который понимают Word и Google Docs.
// Внутри приложения вставка идёт по HTML-копии редактора (там остаются формулы и рисунки); наружу уходит читаемое.
import type { Editor } from '@tiptap/core';
import { DOMSerializer, type Schema, type Slice } from '@tiptap/pm/model';

/** Markdown для вставки в другие программы: без data-картинок и внутренних ссылок. */
export function cleanForClipboard(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\(data:image\/[^)]*\)/g, (_m, alt: string) => (alt ? `*(${alt === 'Рисунок' ? 'рисунок' : 'картинка: ' + alt})*` : '*(картинка)*'))
    .replace(/!\[video\]\(([^)\s]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(mnema:\/\/(?:topic|card)\/[\w-]+\)/g, '$1')
    .replace(/\\?\[стр\.\s*(\d{1,4})\\?\]/g, '(стр. $1)')
    .replace(/\+\+([^+\n]+?)\+\+/g, '<u>$1</u>');
}

/** Выделенный кусок конспекта как Markdown; если не вышло — простой текст. */
export function sliceToMarkdown(editor: Editor, slice: Slice): string {
  const plain = () => slice.content.textBetween(0, slice.content.size, '\n\n', (n) => (n.type.name === 'inlineMath' || n.type.name === 'blockMath' ? `$${n.attrs.latex}$` : ''));
  try {
    if (!editor.markdown) return plain();
    let content = slice.content.toJSON() as Record<string, unknown>[] | null;
    if (!content || !content.length) return '';
    // Кусок строки (без абзаца вокруг) оборачиваем в абзац, чтобы сериализатору было что писать.
    if (slice.content.firstChild?.isInline) content = [{ type: 'paragraph', content }];
    const md = editor.markdown.serialize({ type: 'doc', content });
    return cleanForClipboard(md).trim();
  } catch {
    return plain();
  }
}

/** HTML для буфера: формулы $…$ видны текстом (Word и Docs не знают наших узлов), остальное — обычные теги. */
export function mathAsText(root: ParentNode): void {
  for (const el of root.querySelectorAll?.('[data-type="inline-math"], [data-type="block-math"]') ?? []) {
    const latex = el.getAttribute('data-latex') ?? '';
    // Атрибуты остаются: при вставке обратно в конспект узел формулы восстанавливается по ним.
    el.textContent = el.getAttribute('data-type') === 'block-math' ? `$$${latex}$$` : `$${latex}$`;
  }
}

export function clipboardSerializer(schema: Schema): DOMSerializer {
  const base = DOMSerializer.fromSchema(schema);
  class Math extends DOMSerializer {
    serializeFragment(...args: Parameters<DOMSerializer['serializeFragment']>) {
      const out = super.serializeFragment(...args);
      mathAsText(out);
      return out;
    }
  }
  return new Math(base.nodes, base.marks);
}
