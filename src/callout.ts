// Выноски Obsidian «> [!def] Термин» в конспекте: разбор текста (общий для просмотра — Markdown.tsx — и редактора — calloutEditor.ts),
// вид выноски и перевод старых «рамок учебника» («> **Запомните:** …») в выноски при экспорте и обратно при импорте.
import { CALLOUT_HEAD, calloutDef, MARKS } from '../shared/prompts/markup';
import { CALLOUT_TITLES } from './obsidian';

export type CalloutFold = '' | '+' | '-';

export interface CalloutMatch {
  raw: string;
  /** Тип как в тексте, строчными: def, tip, note… */
  kind: string;
  fold: CalloutFold;
  /** Заголовок как в тексте (Markdown), может быть пустым. */
  title: string;
  /** Текст выноски без «> » в начале строк. */
  body: string;
}

// Строка цитаты: до трёх пробелов отступа, «>».
const QUOTE_LINE = /^ {0,3}>/;
const NEXT_QUOTE_LINE = /\n {0,3}>[^\n]*/y;

/** Выноска в начале src: строка «> [!type]…» и все следующие строки, начинающиеся с «>». Пустая строка или строка без «>» её заканчивает. */
export function matchCallout(src: string): CalloutMatch | null {
  const first = /^ {0,3}(>[^\n]*)/.exec(src);
  if (!first) return null;
  const h = CALLOUT_HEAD.exec(first[1]);
  if (!h) return null;
  const body: string[] = [];
  let pos = first[0].length;
  NEXT_QUOTE_LINE.lastIndex = pos;
  for (let m = NEXT_QUOTE_LINE.exec(src); m; m = NEXT_QUOTE_LINE.exec(src)) {
    body.push(m[0].slice(1).replace(/^ {0,3}> ?/, ''));
    pos = NEXT_QUOTE_LINE.lastIndex;
  }
  if (src[pos] === '\n') pos++;
  return { raw: src.slice(0, pos), kind: h[1].toLowerCase(), fold: h[2] as CalloutFold, title: h[3].trim(), body: body.join('\n') };
}

/** Где в src может начаться выноска (только с начала строки) — для marked: абзац перед ней обрывается. */
export function calloutStart(src: string): number | undefined {
  const m = /(?:^|\n) {0,3}>[ \t]*\[![A-Za-z]/.exec(src);
  if (!m) return undefined;
  return m.index + (m[0].startsWith('\n') ? 1 : 0);
}

export interface CalloutLook {
  kind: string;
  icon: string;
  /** Заголовок по умолчанию (когда в тексте его нет). */
  title: string;
  /** Тип из справочника Refrain (def, rule, tip, ex, warn); остальные — обычная рамка. */
  known: boolean;
}

export function calloutLook(kind: string): CalloutLook {
  const k = kind.toLowerCase();
  const d = calloutDef(k);
  if (d) return { kind: d.type, icon: d.icon, title: d.title, known: true };
  return { kind: k, icon: '', title: CALLOUT_TITLES[k] ?? k, known: false };
}

/** Первая строка выноски в Markdown. */
export function calloutHeadLine(kind: string, fold: CalloutFold, title: string): string {
  const t = title.replace(/\s*\n\s*/g, ' ').trim();
  return `> [!${kind}]${fold}${t ? ' ' + t : ''}`;
}

// ---------- [стр. N] и {?слово?} ----------

/** «[стр. 12]» в начале строки; «\[стр. 12\]» — так её мог записать прежний редактор. Сама метка — MARKS.pageChip. */
export const PAGE_CHIP_AT = new RegExp(`^(?:${MARKS.pageChip.source}|\\\\\\[стр\\.\\s*(\\d{1,4})\\\\\\])`);
export const pageChipStart = (src: string): number | undefined => {
  const i = src.search(/\\?\[стр\./);
  return i < 0 ? undefined : i;
};

/** «{?слово?}» в начале строки — неуверенно прочитанное слово «Тетради» (MARKS.unsure). */
export const UNSURE_AT = new RegExp(`^${MARKS.unsure.source}`);

// ---------- Старые рамки учебника ----------

/** Рамки учебника «> **Запомните:** …», которые экспорт пишет выносками Obsidian. Импорт заметки Refrain переводит их обратно. */
export const LEGACY_FRAMES: Record<string, string> = { запомните: 'important', 'это важно': 'important', важно: 'important', вывод: 'summary', правило: 'note', определение: 'note', пример: 'example', внимание: 'warning' };

/** Текст, разбитый на цитаты (подряд идущие строки с «>») и остальное. Блоки кода не трогаем. */
function mapQuotes(s: string, fn: (lines: string[]) => string[]): string {
  const lines = s.split('\n');
  const out: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; ) {
    const l = lines[i];
    const f = /^ {0,3}(```|~~~)/.exec(l);
    if (fence) {
      if (f && f[1] === fence) fence = null;
      out.push(l);
      i++;
    } else if (f) {
      fence = f[1];
      out.push(l);
      i++;
    } else if (QUOTE_LINE.test(l)) {
      const block: string[] = [];
      while (i < lines.length && QUOTE_LINE.test(lines[i])) block.push(lines[i++]);
      out.push(...fn(block));
    } else {
      out.push(l);
      i++;
    }
  }
  return out.join('\n');
}

const isCalloutBlock = (block: string[]) => CALLOUT_HEAD.test(block[0].trimStart());

/** Экспорт: «> **Запомните:** текст» → «> [!important] Запомните» + «> текст». Выноски остаются как есть. */
export function legacyFramesToCallouts(s: string): string {
  return mapQuotes(s, (block) =>
    isCalloutBlock(block)
      ? block
      : block.flatMap((line) => {
          const m = /^> \*\*([^*\n]+?)\*\*[:.]?[ \t]*(.*)$/.exec(line);
          if (!m) return [line];
          const title = m[1].replace(/[:.\s]+$/, '');
          const kind = LEGACY_FRAMES[title.toLowerCase()];
          return kind ? [`> [!${kind}] ${title}`, ...(m[2] ? [`> ${m[2]}`] : [])] : [line];
        })
  );
}

/** Импорт заметки, записанной Refrain: выноска, которую сделал экспорт из рамки учебника, снова становится рамкой. Остальные выноски — как есть. */
export function calloutsToLegacyFrames(s: string): string {
  return mapQuotes(s, (block) => {
    if (block.length > 2) return block;
    const h = /^>\s*\[!(\w+)\]\s*(.+?)\s*$/.exec(block[0]);
    if (!h || LEGACY_FRAMES[h[2].toLowerCase()] !== h[1].toLowerCase()) return block;
    const rest = block[1]?.replace(/^>[ \t]?/, '') ?? '';
    return [`> **${h[2]}:** ${rest}`.trimEnd()];
  });
}
