// Автовыделение важного: правила находят в конспекте жирное, определения, даты, имена,
// формулы, рамки «Запомните» и свои слова. Всё считается на устройстве, без интернета.
import type { CardType, HighlightSettings, ImportantType } from './types';

export const IMPORTANT_TYPES: { id: ImportantType; label: string; plural: string; color: string; hint: string }[] = [
  { id: 'bold', label: 'Жирное', plural: 'Жирное', color: '#E0A100', hint: 'Всё, что набрано жирным' },
  { id: 'definition', label: 'Определение', plural: 'Определения', color: '#2A5BB8', hint: '«X — это…», «называют», «понимают»' },
  { id: 'date', label: 'Дата', plural: 'Даты', color: '#D2691E', hint: 'Годы, века, полные даты, диапазоны' },
  { id: 'name', label: 'Имя', plural: 'Имена', color: '#7B3FC4', hint: 'Имена с инициалами, «Александр II»' },
  { id: 'formula', label: 'Формула', plural: 'Формулы и единицы', color: '#1F7A6B', hint: 'Формулы и числа с единицами: 220 В, 5 м/с' },
  { id: 'term', label: 'Термин', plural: 'Курсив', color: '#8A5A2B', hint: 'Слова курсивом — часто новые термины' },
  { id: 'box', label: 'Рамка', plural: 'Рамки учебника', color: '#3F51D8', hint: 'Блоки «Запомните», «Это важно», «Вывод»' },
  { id: 'mine', label: 'Моё', plural: 'Мои слова', color: '#C2417A', hint: 'Слова и фразы из твоего списка' }
];

export const DEFAULT_HIGHLIGHT: HighlightSettings = {
  rules: { bold: true, definition: true, date: true, name: true, formula: true, term: true, box: true, mine: true },
  strict: 'normal',
  custom: [],
  show: true
};

export interface ImportantItem {
  id: string;
  type: ImportantType;
  text: string; // что именно найдено
  sentence: string; // предложение, где найдено (обычный текст)
  page?: number; // страница учебника, если известна
}

export interface Range {
  from: number;
  to: number;
  type: ImportantType;
}

const MONTHS = 'января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря';
const UNITS = 'мВ|кВ|В|мА|А|кОм|МОм|Ом|кВт|МВт|Вт|кДж|Дж|кН|Н|кПа|Па|м/с²|м/с\\^2|м/с|км/ч|кг/м³|кг|мг|г|км|дм|см|мм|м|мс|мин|ч|сут|с|°C|°С|К|моль|мл|л|Гц|кГц|Тл|Кл|Ф|%';

function reDates(strict: HighlightSettings['strict']): RegExp[] {
  const list = [
    new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})(?:\\s+\\d{3,4}\\s*(?:г\\.|года|году)?)?`, 'gi'),
    /\b\d{3,4}\s*[–—-]\s*\d{2,4}\s*(?:гг?\.|годах|годы|годов)?/g,
    /(?<![\p{L}])(?:[IVXLC]{1,6})\s+(?:век[а-я]*|в\.|вв\.)/gu,
    /\b(?:1\d{3}|20\d{2}|[1-9]\d{2})\s*(?:г\.|гг\.|год[а-я]*)/g
  ];
  if (strict !== 'strict') list.push(/(?<![\d.,])\b(?:1[0-9]\d{2}|20[0-4]\d)\b(?![\d.,]|\s*(?:руб|кг|м\b|%|шт))/g);
  return list;
}

function reNames(strict: HighlightSettings['strict']): RegExp[] {
  const B = '(?<![\\p{L}\\p{N}])';
  const E = '(?![\\p{L}\\p{N}])';
  const list = [
    new RegExp(`${B}(?<!\\d\\s?)[А-ЯЁ]\\.\\s?(?:[А-ЯЁ]\\.\\s?)?[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?`, 'gu'), // А. С. Пушкин
    new RegExp(`${B}[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\\s[А-ЯЁ]\\.\\s?[А-ЯЁ]\\.`, 'gu'), // Пушкин А. С.
    new RegExp(`${B}[А-ЯЁ][а-яё]{2,}\\s(?:I{1,3}|IV|VI{0,3}|IX|XI{0,3})${E}`, 'gu') // Александр II
  ];
  if (strict === 'all') list.push(new RegExp(`(?<=[а-яё,;:]\\s)[А-ЯЁ][а-яё]{2,}\\s[А-ЯЁ][а-яё]{2,}(?:ов|ев|ин|ын|ский|цкий|ова|ева|ина|ская)${E}`, 'gu'));
  return list;
}

const reUnits = new RegExp(`(?<![\\p{L}\\p{N}])\\d+(?:[.,]\\d+)?\\s?(?:${UNITS})(?![\\p{L}])`, 'gu');
const reInlineMath = /\$\$[^$]+\$\$|\$[^$\n]+\$/g;
const reDefinition = [
  /^(.{2,70}?)\s+[—–]\s+(?:это\s+)?(.{8,})$/, // X — это Y  /  X — Y
  /^(?:Под\s+)?(.{2,60}?)\s+(?:называ(?:ют|ли|ется|ются|лся|лась|лось|лись)|понима(?:ют|ли|ется)|именуют|принято называть)\s+(.{6,})$/i,
  /^(.{6,}?),?\s+(?:называ(?:ют|ли|ется|ются))\s+(.{2,60})$/i
];

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Находит важное в обычном тексте абзаца. */
export function findInText(text: string, hs: HighlightSettings): Range[] {
  const out: Range[] = [];
  const add = (re: RegExp, type: ImportantType) => {
    if (!hs.rules[type]) return;
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) out.push({ from: m.index!, to: m.index! + m[0].trim().length, type });
  };
  for (const re of reDates(hs.strict)) add(re, 'date');
  for (const re of reNames(hs.strict)) add(re, 'name');
  add(reUnits, 'formula');
  add(reInlineMath, 'formula');
  if (hs.rules.mine)
    for (const w of hs.custom.map((x) => x.trim()).filter((x) => x.length > 1)) add(new RegExp(`(?<![\\p{L}])${escapeRe(w)}`, 'giu'), 'mine');
  if (hs.rules.definition) {
    // Определение — термин в начале предложения.
    for (const s of sentences(text)) {
      const d = definitionOf(s.text);
      if (d) {
        const i = s.text.indexOf(d.term);
        if (i >= 0) out.push({ from: s.start + i, to: s.start + i + d.term.length, type: 'definition' });
      }
    }
  }
  // Пересечения: оставляем более длинное (определение и дата важнее единиц).
  out.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));
  const res: Range[] = [];
  for (const r of out) {
    const last = res[res.length - 1];
    if (last && r.from < last.to) {
      if (r.to - r.from > last.to - last.from && r.type !== 'formula') res[res.length - 1] = r;
      continue;
    }
    res.push(r);
  }
  return res;
}

export function definitionOf(sentence: string): { term: string; meaning: string; verb?: string } | null {
  const s = sentence.trim().replace(/[.;]$/, '');
  for (let i = 0; i < reDefinition.length; i++) {
    const m = reDefinition[i].exec(s);
    if (!m) continue;
    const [term, meaning] = i === 2 ? [m[2], m[1]] : [m[1], m[2]];
    const t = term.replace(/^[«"]|[»"]$/g, '').replace(/^Под\s+/i, '').trim();
    if (t.split(/\s+/).length > 6 || /^(это|он|она|они|оно|так|там|здесь|который)$/i.test(t)) continue;
    const verb = i === 0 ? undefined : /(называ\S*|понима\S*|именуют|принято называть)/i.exec(s)?.[1];
    return { term: t, meaning: meaning.trim(), verb };
  }
  return null;
}

export function sentences(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const end = /[.!?…]+(?=\s+[А-ЯЁA-Z0-9«"(]|\s*$)/g;
  let start = 0;
  for (const m of text.matchAll(end)) {
    const stop = m.index! + m[0].length;
    const before = text.slice(start, stop).trimEnd();
    // Не режем на сокращениях: «г.», «в.», «рис.», «т. е.», инициалах «А.».
    if (m[0] === '.' && /(?:^|[\s(])(?:г|гг|в|вв|р|рис|стр|см|ок|им|т\. ?е|т\. ?д|и др|[А-ЯЁ])\.$/.test(before) && stop < text.length) continue;
    const piece = text.slice(start, stop);
    const lead = piece.length - piece.trimStart().length;
    if (piece.trim()) out.push({ text: piece.trim(), start: start + lead });
    start = stop;
  }
  const rest = text.slice(start);
  if (rest.trim()) out.push({ text: rest.trim(), start: start + (rest.length - rest.trimStart().length) });
  return out;
}

/** Markdown → обычный текст абзаца (без ** и т. п.), с сохранением формул. */
export function plainInline(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|==/g, '')
    .replace(/(?<![*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1')
    .replace(/^#+\s*/, '')
    .replace(/^>\s?/, '')
    .replace(/^[-*]\s+|^\d+\.\s+/, '')
    .trim();
}

const PAGE_RE = /\\?\[стр\.\s*(\d{1,4})\\?\]/;

function hashId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Всё важное в конспекте темы — для меню «Важное». */
export function findImportant(note: string, hs: HighlightSettings): ImportantItem[] {
  const items: ImportantItem[] = [];
  const seen = new Set<string>();
  let page: number | undefined;
  const push = (type: ImportantType, text: string, sentence: string) => {
    const t = text.trim();
    if (!t || t.length > 160) return;
    const id = hashId(type + '|' + t.toLowerCase() + '|' + sentence.slice(0, 80));
    if (seen.has(id)) return;
    seen.add(id);
    items.push({ id, type, text: t, sentence, page });
  };
  // Абзацы: пустая строка разделяет; цитата «>» — один блок.
  const blocks = note.replace(/\r/g, '').split(/\n{2,}/);
  for (const raw of blocks) {
    const lines = raw.split('\n');
    for (const line of lines) {
      const pm = PAGE_RE.exec(line);
      if (pm) page = Number(pm[1]);
    }
    const block = raw.replace(/\\?\[стр\.\s*\d{1,4}\\?\]/g, '').trim();
    if (!block || /^!\[/.test(block)) continue;
    const isQuote = /^>/.test(block);
    const md = block
      .split('\n')
      .map((l) => l.replace(/^>\s?/, ''))
      .join(' ');
    const plain = plainInline(md);
    if (!plain) continue;
    if (isQuote && hs.rules.box && /^(\*\*)?(Запомни(те)?|Это важно|Важно|Вывод|Главное|Обрати внимание)/i.test(md.trim())) {
      push('box', plain.replace(/^(Запомни(те)?|Это важно|Важно|Вывод|Главное|Обрати внимание)[:.!]?\s*/i, ''), plain);
    }
    const sents = sentences(plain);
    const sentenceAt = (pos: number) => sents.find((s) => pos >= s.start && pos < s.start + s.text.length)?.text ?? plain;
    if (hs.rules.bold)
      for (const m of md.matchAll(/\*\*(.+?)\*\*/g)) {
        const t = plainInline(m[1]).replace(/[:,]$/, '');
        if (t.length < 2 || /^(Запомни(те)?|Это важно|Важно|Вывод)$/i.test(t)) continue;
        const pos = plain.indexOf(t);
        push('bold', t, sentenceAt(Math.max(0, pos)));
      }
    if (hs.rules.term)
      for (const m of md.matchAll(/(?<![*\w])\*(?!\*|\s)([^*\n]+?)\*(?!\*)/g)) {
        const t = m[1].trim();
        if (t.split(/\s+/).length > 5 || /^Рис/i.test(t)) continue;
        push('term', t, sentenceAt(Math.max(0, plain.indexOf(t))));
      }
    for (const r of findInText(plain, hs)) {
      if (r.type === 'definition') {
        const s = sentenceAt(r.from);
        push('definition', plain.slice(r.from, r.to), s);
      } else push(r.type, plain.slice(r.from, r.to), sentenceAt(r.from));
    }
  }
  return items;
}

/** Черновик карточки из найденного. */
export function cardDraft(item: ImportantItem): { type: CardType; front: string; back: string } {
  const s = item.sentence.trim();
  const hide = (text: string) => {
    const i = s.indexOf(text);
    if (i < 0) return null;
    return s.slice(0, i) + '{{' + text + '}}' + s.slice(i + text.length);
  };
  if (item.type === 'definition') {
    const d = definitionOf(s);
    if (d) {
      const term = d.term.charAt(0).toLowerCase() + d.term.slice(1);
      if (d.verb && /^называ/i.test(d.verb)) return { type: 'basic', front: `Кого или что ${d.verb.toLowerCase()} «${term}»?`, back: capitalize(d.meaning.replace(/\.$/, '')) + '.' };
      if (d.verb) return { type: 'basic', front: `Что ${d.verb.toLowerCase()} под «${term}»?`, back: capitalize(d.meaning.replace(/\.$/, '')) + '.' };
      return { type: 'basic', front: `Что такое «${term}»?`, back: capitalize(d.meaning.replace(/\.$/, '')) + '.' };
    }
  }
  if (item.type === 'box') return { type: 'basic', front: 'Что нужно запомнить? ' + firstWords(item.text, 5) + '…', back: item.text };
  if (item.type === 'term' && item.text.split(/\s+/).length <= 3) {
    const d = definitionOf(s);
    if (d) return { type: 'reverse', front: item.text, back: capitalize(d.meaning.replace(/\.$/, '')) };
  }
  const c = hide(item.text);
  if (c && s.length <= 260) return { type: 'cloze', front: c, back: '' };
  return { type: 'basic', front: s, back: item.text };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function firstWords(s: string, n: number) {
  return s.split(/\s+/).slice(0, n).join(' ');
}

/** Год для ленты времени: «19 февраля 1861 г.» → 1861, «XIX век» → 1850, «1853–1856» → 1853. */
export function yearOf(text: string): number | null {
  const y = /\b(\d{3,4})\b/.exec(text);
  if (y && !/век|в\./.test(text)) return Number(y[1]);
  const c = /\b([IVXLC]{1,6})\s+(?:век|в\.|вв\.)/.exec(text);
  if (c) {
    const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
    let n = 0;
    const r = c[1];
    for (let i = 0; i < r.length; i++) {
      const v = map[r[i]];
      n += i + 1 < r.length && map[r[i + 1]] > v ? -v : v;
    }
    return (n - 1) * 100 + 50;
  }
  return null;
}
