// «Из тетради → Фото»: почерк ученика читает ИИ со зрением (задача notebook.read).
// Здесь чистые функции без сети и canvas — их проверяют тесты (v131-notebook.test.ts):
//  • разворот тетради → две страницы, светлая клетка и поля → белая бумага;
//  • запрос notebook.read (Refrain ИИ и свой ключ) и разбор ответа;
//  • неуверенные слова {?слово?}: найти, поправить, снять метки;
//  • «Как в тетради» — обратно к сокращениям ученика.
import { MARKS } from '../shared/prompts/markup';
import { lunaSystem, lunaUser } from '../shared/prompts/luna';
import { TASK_SPECS } from '../shared/prompts/tasks';
import { FIELD_LIMITS } from '../shared/refrain/api.mjs';
import { cardDraft, DEFAULT_HIGHLIGHT, findImportant, type ImportantItem } from './important';
import type { AiRequest } from './store';
import { fixFormulas } from './textbookMath';
import { normalizeAiBlocks, sanitizeAiText } from './textbookText';
import type { CardType } from './types';

// ---------- Разворот ----------

export interface Cut {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Снимок похож на разворот: заметно шире, чем выше (одна страница тетради — «стоячая»). */
export function isSpreadShape(w: number, h: number): boolean {
  return h > 0 && w / h >= 1.2;
}

/**
 * Разворот → левая и правая страницы (в пикселях снимка). spine — где корешок, если его нашли по картинке
 * (левая страница — [0, a), правая — [b, w)); иначе режем ровно посередине: у тетради корешок почти всегда в центре кадра.
 */
export function spreadCuts(w: number, h: number, spine?: { a: number; b: number } | null): [Cut, Cut] {
  let a = Math.round(w / 2);
  let b = a;
  if (spine && spine.a > w * 0.3 && spine.b < w * 0.7 && spine.b >= spine.a) {
    a = Math.round(spine.a);
    b = Math.round(spine.b);
  }
  return [
    { x: 0, y: 0, w: a, h },
    { x: b, y: 0, w: w - b, h }
  ];
}

/**
 * Клетка, линейка и поля — светлые цветные линии, а ручка и карандаш темнее. После выравнивания света всё светлее порога
 * становится белым: на фото остаются только записи. RGBA меняется на месте.
 */
export function whitenPaper(rgba: Uint8ClampedArray, threshold = 175): Uint8ClampedArray {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    // Синяя клетка (170,190,220) светлая в среднем. Красные поля (220,120,120) темнее, но это яркий цвет без тёмного канала,
    // а у ручки (40,60,150; 200,40,40) один канал всегда тёмный. Серый карандаш (160,160,160) не яркий — остаётся.
    const avg = (r + g + b) / 3;
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    if (avg >= threshold || (max >= 200 && min >= threshold - 70)) rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
  }
  return rgba;
}

// ---------- Запрос к ИИ ----------

/** Для своего ключа потолок ответа выше, чем у Luna: у чужих моделей рассуждение тоже съедает ответ. */
const OWN_KEY_TOKENS = 4000;

export interface NotebookContext {
  subject?: string;
  topic?: string;
  page?: number;
}

function clip(s: string | undefined, max: number): string | undefined {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
}

/**
 * Запрос «прочитать страницу тетради»: для Refrain ИИ — только данные (поле refrain), для своего ключа — тот же промт Luna.
 * Свои указания ученика и выбранный ИИ добавит aiRequest() у вызывающего.
 */
export function notebookRequest(image: { mime: 'image/jpeg'; data: string }, ctx: NotebookContext): AiRequest {
  const subject = clip(ctx.subject, FIELD_LIMITS.subject);
  const topic = clip(ctx.topic, FIELD_LIMITS.topic);
  const page = ctx.page && Number.isInteger(ctx.page) && ctx.page >= 1 && ctx.page <= FIELD_LIMITS.page ? ctx.page : undefined;
  return {
    // TODO(поток C): заменить на шаблон для других ИИ, когда он будет готов.
    system: lunaSystem('notebook.read'),
    text: lunaUser('notebook.read', { subject, topic, page }),
    image,
    maxTokens: OWN_KEY_TOKENS,
    refrain: { task: 'notebook.read', image, ...(subject ? { subject } : {}), ...(topic ? { topic } : {}), ...(page ? { page } : {}) }
  };
}

/** «Конспектом»: прочитанный текст тетради сводится в опрятный конспект той же задачей, что «Свести параграф». */
export function tidyRequest(text: string, ctx: NotebookContext): AiRequest {
  const subject = clip(ctx.subject, FIELD_LIMITS.subject);
  const topic = clip(ctx.topic, FIELD_LIMITS.topic);
  const body = text.slice(0, TASK_SPECS['textbook.merge'].textMax);
  return {
    system: lunaSystem('textbook.merge'),
    text: lunaUser('textbook.merge', { subject, topic, text: body }),
    maxTokens: OWN_KEY_TOKENS,
    refrain: { task: 'textbook.merge', text: body, ...(subject ? { subject } : {}), ...(topic ? { topic } : {}) }
  };
}

export interface NotebookPage {
  markdown: string;
  /** Номер страницы, если ИИ его увидел ([[СТРАНИЦА N]]). */
  page?: number;
  /** На фото нет записей ([[ПУСТО]]). */
  empty: boolean;
}

/** Ответ ИИ → Markdown страницы. Метки {?слово?} сохраняются, всё служебное ([[…]], HTML, ```) убирается. */
export function parseNotebookAnswer(raw: string): NotebookPage {
  let md = sanitizeAiText(String(raw ?? '')).trim();
  if (MARKS.empty.test(md) || (/\[\[ПУСТО\]\]/.test(md) && md.replace(/\[\[ПУСТО\]\]/g, '').trim().length < 20)) return { markdown: '', empty: true };
  let page: number | undefined;
  md = md.replace(/\[\[\s*СТРАНИЦА\s*[:№#]?\s*(\d{1,4})\s*\]\]/gi, (_m, n: string) => {
    page = Number(n);
    return '';
  });
  md = md.replace(/\[\[[^\]\n]{0,80}\]\]/g, '');
  md = md.replace(/\\\(([\s\S]+?)\\\)/g, (_m, t: string) => `$${t.trim()}$`).replace(/\\\[([\s\S]+?)\\\]/g, (_m, t: string) => `$$${t.trim()}$$`);
  md = normalizeAiBlocks(md);
  md = fixFormulas(md).md;
  md = md.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { markdown: md, page, empty: !md };
}

// ---------- Неуверенные слова ----------

export type Piece = { text: string } | { unsure: string; i: number };

/** Текст на куски: обычный текст и неуверенные слова по порядку (i — номер метки в тексте). */
export function unsurePieces(md: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  let i = 0;
  for (const m of md.matchAll(new RegExp(MARKS.unsure.source, 'g'))) {
    if (m.index! > last) out.push({ text: md.slice(last, m.index) });
    out.push({ unsure: m[1], i: i++ });
    last = m.index! + m[0].length;
  }
  if (last < md.length) out.push({ text: md.slice(last) });
  return out;
}

export function unsureCount(md: string): number {
  return (md.match(new RegExp(MARKS.unsure.source, 'g')) ?? []).length;
}

/** Поправить i-е неуверенное слово: метка снимается, слово становится обычным текстом. Пустая правка — слово как было. */
export function fixUnsure(md: string, i: number, word: string): string {
  let k = 0;
  return md.replace(new RegExp(MARKS.unsure.source, 'g'), (all, w: string) => (k++ === i ? word.trim() || w : all));
}

/** Все метки снимаются (ученик согласен с прочитанным): в конспект {?…?} как текст не попадает. */
export function acceptUnsure(md: string): string {
  return md.replace(new RegExp(MARKS.unsure.source, 'g'), '$1');
}

// ---------- «Как в тетради» ----------

/**
 * Привычные школьные сокращения: ИИ их раскрывает («в-в» → «веществ»), «Как в тетради» сворачивает обратно.
 * Только устойчивые сокращения: свои словечки ученика по тексту не восстановить, их видно на фото рядом.
 */
const ABBREVIATIONS: [string, string][] = [
  ['так как', 'т.к.'],
  ['то есть', 'т.е.'],
  ['и так далее', 'и т.д.'],
  ['и тому подобное', 'и т.п.'],
  ['так называемый', 'т.н.'],
  ['так называемая', 'т.н.'],
  ['так называемые', 'т.н.'],
  ['например', 'напр.'],
  ['смотри', 'см.'],
  ['вещество', 'в-во'],
  ['вещества', 'в-ва'],
  ['веществ', 'в-в'],
  ['веществами', 'в-вами'],
  ['веществом', 'в-вом'],
  ['количество', 'кол-во'],
  ['количества', 'кол-ва'],
  ['уравнение', 'ур-е'],
  ['уравнения', 'ур-я'],
  ['уравнений', 'ур-й'],
  ['реакция', 'р-ция'],
  ['реакции', 'р-ции'],
  ['раствор', 'р-р'],
  ['раствора', 'р-ра'],
  ['растворы', 'р-ры'],
  ['формула', 'ф-ла'],
  ['формулы', 'ф-лы'],
  ['определение', 'опр.'],
  ['правило', 'пр.'],
  ['рисунок', 'рис.'],
  ['страница', 'стр.'],
  ['упражнение', 'упр.'],
  ['тысяч', 'тыс.'],
  ['миллионов', 'млн'],
  ['миллиона', 'млн'],
  ['миллион', 'млн'],
  ['миллиардов', 'млрд'],
  ['миллиард', 'млрд'],
  ['человек', 'чел.'],
  ['век', 'в.'],
  ['века', 'в.'],
  ['веке', 'в.'],
  ['годы', 'гг.'],
  ['годах', 'гг.'],
  ['году', 'г.'],
  ['года', 'г.'],
  ['год', 'г.']
];
/** Слова, которые сворачиваются только после числа: «1861 год» → «1861 г.», «XIX век» → «XIX в.», а «каждый год» остаётся. */
const AFTER_NUMBER = new Set(['век', 'века', 'веке', 'годы', 'годах', 'году', 'года', 'год', 'тысяч', 'миллионов', 'миллиона', 'миллион', 'миллиардов', 'миллиард', 'человек']);

function sameCase(src: string, abbr: string): string {
  return src[0] && src[0] !== src[0].toLowerCase() ? abbr[0].toUpperCase() + abbr.slice(1) : abbr;
}

/** Обратно к сокращениям. Формулы ($…$) и код не трогаются, метки {?…?} остаются на месте. */
export function asInNotebook(md: string): string {
  const parts = md.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`\n]+`)/g);
  const sorted = [...ABBREVIATIONS].sort((a, b) => b[0].length - a[0].length);
  return parts
    .map((part, k) => {
      if (k % 2 === 1) return part;
      let t = part;
      for (const [full, abbr] of sorted) {
        const words = full.split(' ').join('\\s+');
        const num = AFTER_NUMBER.has(full);
        // Точка конца предложения после сокращения с точкой не удваивается: «в XIX веке.» → «в XIX в.».
        const re = new RegExp(`${num ? '(?<=(?:\\d|\\b[IVXLC]+)\\s)' : '(?<![\\p{L}\\d-])'}(${words})(?![\\p{L}\\d-])(\\.?)`, 'giu');
        t = t.replace(re, (_m: string, w: string, dot: string) => sameCase(w, abbr) + (abbr.endsWith('.') ? '' : dot));
      }
      return t;
    })
    .join('');
}

/** Есть ли что сворачивать — чтобы не показывать кнопку, которая ничего не меняет. */
export function hasAbbreviations(md: string): boolean {
  return asInNotebook(md) !== md;
}

// ---------- Черновики карточек ----------

export interface CardDraft {
  type: CardType;
  front: string;
  back: string;
}

/** Сколько черновиков на тему: больше — долг повторений на недели, лучше начать с малого. */
export const DRAFTS_PER_TOPIC = 12;

/** Выноски «> [!def] Термин» → обычная цитата, которую понимает поиск «Важного»: заголовок определения встаёт в начало текста. */
function calloutsAsQuotes(md: string): string {
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^>\s*\[!(\w+)\][+-]?\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, type, title] = m;
    const body = /^>\s?(.*)$/.exec(lines[i + 1] ?? '')?.[1]?.trim();
    if (type === 'def' && title && body && !body.toLowerCase().startsWith(title.toLowerCase())) lines[i + 1] = `> ${title} — ${body}`;
    lines[i] = type === 'tip' || type === 'rule' ? '> Запомните:' : '>';
    if (!body) lines[i] = title ? `> ${type === 'tip' || type === 'rule' ? 'Запомните: ' : ''}${title}` : '';
  }
  return lines.join('\n');
}

/** «Черновики карточек» без ИИ: определения, даты и рамки «Запомните» из текста — ученик выберет, какие оставить. */
export function cardDrafts(md: string, limit = DRAFTS_PER_TOPIC): CardDraft[] {
  // Одно предложение — одна карточка. Если в определении есть дата, лучше спросить дату: «Что такое отмена крепостного права?» — не вопрос.
  const rank = { date: 0, box: 1, definition: 2 } as Record<string, number>;
  const best = new Map<string, ImportantItem>();
  for (const item of findImportant(calloutsAsQuotes(acceptUnsure(md)), DEFAULT_HIGHLIGHT)) {
    if (!(item.type in rank)) continue;
    const key = item.sentence.trim().toLowerCase();
    const had = best.get(key);
    if (!had || rank[item.type] < rank[had.type]) best.set(key, item);
  }
  const out: CardDraft[] = [];
  for (const item of best.values()) {
    const d = cardDraft(item);
    if (d.front.trim()) out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}
