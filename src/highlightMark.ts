// Маркер ==текст== (1.33): один разбор для просмотра (Markdown.tsx) и редактора (TipTap).
// Внутри можно всё, кроме перевода строки и «==»: пробелы, знаки препинания, кавычки, скобки, кириллица,
// одиночные «=» (x = 5) и формулы $…$ целиком (в них «=» и даже «==» не закрывают маркер).
// Незакрытое «==» остаётся обычным текстом; маркер не «протекает» за конец строки.
import Highlight from '@tiptap/extension-highlight';
import { markInputRule, markPasteRule } from '@tiptap/core';

/** Содержимое маркера: формула $…$, одиночное «=» или любой символ, кроме «=», «$» и перевода строки (одиночный «$» — тоже). */
const INNER = String.raw`(?:\$[^$\n]+\$|=(?!=)|[^=\n$]|\$)+?`;

/** ==текст== в начале строки разбора. Пустое и только из пробелов — не маркер. */
export const HIGHLIGHT_AT = new RegExp(String.raw`^==(?!\s*==)(${INNER})==(?!=)`);

/** Ввод: «==текст==» в конце набранного, перед ним — начало строки, пробел, скобка, кавычка или тире. */
const INPUT = new RegExp(String.raw`(?:^|[\s(\[{«"„'—–-])(==(?!\s)(${INNER})==)$`);
const PASTE = new RegExp(String.raw`(?:^|[\s(\[{«"„'—–-])(==(?!\s)(${INNER})==)`, 'g');

/** Разобрать маркер: внутренний текст (без крайних пробелов) или null. */
export function matchHighlight(src: string): { raw: string; inner: string } | null {
  const m = HIGHLIGHT_AT.exec(src);
  if (!m) return null;
  const inner = m[1].trim();
  return inner ? { raw: m[0], inner } : null;
}

/** Highlight для редактора с тем же разбором Markdown и правилами ввода/вставки. */
export const MnemaHighlight = Highlight.extend({
  markdownTokenizer: {
    name: 'highlight',
    level: 'inline',
    start: (src: string) => src.indexOf('=='),
    tokenize(src, _tokens, h) {
      const m = matchHighlight(src);
      if (!m) return undefined;
      return { type: 'highlight', raw: m.raw, text: m.inner, tokens: h.inlineTokens(m.inner) };
    }
  },
  addInputRules() {
    return [markInputRule({ find: INPUT, type: this.type })];
  },
  addPasteRules() {
    return [markPasteRule({ find: PASTE, type: this.type })];
  }
});
