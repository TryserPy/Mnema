// «Из учебника»: как превратить прочитанные страницы в КОНСПЕКТ, а не в копию учебника.
//  • режимы «Конспект» / «Кратко» / «Дословно» и указания для ИИ к каждому;
//  • второй запрос к ИИ по нескольким страницам сразу (связный конспект по всему параграфу);
//  • без интернета — извлекающий конспект: заголовки, определения, даты, формулы, рамки «Запомните», первые предложения абзацев.
// Чистые функции без сети и canvas — их проверяют тесты (v130-textbook.test.ts).
import { DEFAULT_HIGHLIGHT, definitionOf, findInText, plainInline, sentences } from './important';
import { fixFormulas } from './textbookMath';
import { fixTables, tableTrouble } from './textbookTables';
import { assemble, judgeAiAnswer, neutralizeHtml, type PageResult } from './textbookText';
import type { HighlightSettings } from './types';

export type NoteStyle = 'summary' | 'brief' | 'verbatim';

export const NOTE_STYLES: { id: NoteStyle; label: string; hint: string; hintOffline: string }[] = [
  {
    id: 'summary',
    label: 'Конспект',
    hint: 'Главные мысли короткими пунктами своими словами: определения, даты, формулы, таблицы для сравнений. Примерно четверть учебника.',
    hintOffline: 'Без ИИ Refrain отберёт главное по признакам: заголовки, определения, даты, формулы, рамки «Запомните», первые предложения абзацев.'
  },
  {
    id: 'brief',
    label: 'Кратко',
    hint: 'Только самое главное: определения, даты, формулы и 5–10 пунктов. Для быстрого повторения.',
    hintOffline: 'Без ИИ — только определения, даты, формулы, рамки «Запомните» и самые важные предложения.'
  },
  { id: 'verbatim', label: 'Дословно', hint: 'Весь текст страниц как в учебнике, ничего не сокращая.', hintOffline: 'Весь текст страниц как в учебнике.' }
];

export function isNoteStyle(v: unknown): v is NoteStyle {
  return v === 'summary' || v === 'brief' || v === 'verbatim';
}

// ---------- Указания для ИИ ----------

/** Как читать страницу: порядок, колонки, врезки, сноски, подписи. Общее для всех режимов. */
const READING = `Как читать страницу:
- Порядок: сверху вниз; если текст в колонках — сначала левая колонка целиком, потом правая. Врезки и рамки («Запомните», «Это интересно», «Вопросы») ставь после текста, рядом с которым они стоят.
- Если на фото две страницы (разворот), читай сначала левую, потом правую.
- Колонтитулы (повторяющаяся строка вверху или внизу) и номер страницы в текст не пиши. Если номер страницы виден, в самом конце добавь строку [[СТРАНИЦА N]].
- Сноски (мелкий текст внизу страницы со «*» или цифрой) — отдельной строкой в конце: «Сноска: …».
- Подпись под рисунком, схемой, таблицей — это подпись к ним, а не обычный текст абзаца.
- Переносы слов в конце строк склей («раз-» + «витие» → «развитие»). Абзац — одной строкой, абзацы разделяй пустой строкой.
- Слово, которое не разобрать, пропусти и поставь «…». Ничего не выдумывай и не «исправляй» факты и даты.`;

/** Как писать Markdown: заголовки, таблицы, формулы, рисунки. */
const FORMAT = `Как оформлять:
- Заголовок параграфа («§ 12. …», «Глава …») — «## », подзаголовки — «### ». Других заголовков не придумывай.
- Списки — «- » или «1. ». Рамки «Запомните», «Это важно», «Вывод», «Определение» — цитатой: «> **Запомните:** текст».
- Таблицы — таблицами Markdown (GFM): первая строка — заголовки столбцов, вторая — «| --- | --- |», в каждой строке одинаковое число ячеек, «|» внутри ячейки пиши как «\\|». Если таблица сложная (объединённые ячейки, таблица в таблице, рисунки в ячейках) или плохо читается, не пиши её таблицей: вставь как рисунок (см. ниже) с подписью «Таблица: …».
- Формулы — LaTeX для KaTeX: в строке $…$, отдельной строкой $$…$$. Дроби \\frac{a}{b}, корни \\sqrt{x}, степени и индексы x^{2}, t_{1}, греческие буквы \\alpha \\Delta, умножение \\cdot или \\times, ≤ \\leq. Единицы и слова внутри формулы — \\text{кг}, \\text{м/с}. Химия: $H_2O$, $CO_2$, $2H_2 + O_2 \\to 2H_2O$. Не используй юникод-знаки (×, ², ≤, √) внутри $…$, не вкладывай $ в $. Обычные числа с единицами (5 кг, 1861 г.) оставляй текстом.
- Рисунки, схемы, графики, карты, фото НЕ описывай. Вместо каждого поставь отдельной строкой [[РИСУНОК x1 y1 x2 y2 | подпись]], где x1 y1 x2 y2 — рамка самого рисунка (без подписи) в тысячных долях ширины и высоты фото (0–1000: левый верхний угол, правый нижний), подпись — текст подписи («Рис. 12. …»), если есть (отдельно её тогда не пиши). Текст внутри рисунка не переписывай. Декоративные картинки (рамки, значки, орнамент, логотипы) пропускай.
- Не оборачивай ответ в \`\`\`. HTML, ссылки, картинки по адресу и свои пояснения не нужны.
- Если текста не видно или это не страница учебника, верни [[ПУСТО]].`;

/** Подробный текст страницы «как в учебнике»: режим «Дословно» и первый шаг при нескольких страницах. */
export const READ_SYSTEM = `Ты переводишь фото страницы школьного учебника в Markdown для ученика. Верни ТОЛЬКО Markdown.
Перепиши весь текст страницы точно, ничего не пересказывая, не сокращая и не добавляя. Жирный **…** и курсив *…* — только там, где в учебнике так набрано (термины, определения, даты); сам ничего не выделяй.

${READING}

${FORMAT}`;

const SUMMARY_RULES = `Правила конспекта:
- Это НЕ пересказ подряд и не копия учебника. Выбери главное и скажи коротко.
- Структура по заголовкам учебника: параграф — «## », подзаголовки — «### ». Своих разделов не придумывай.
- Под заголовком — главные мысли короткими пунктами «- » (одна мысль — одна строка), своими словами, но без искажений и выдумок. Примеры, подробности, повторы, «воду» и вопросы после параграфа не включай.
- Определения: «- **Термин** — определение». Жирным выделяй только термин в определении.
- Даты, имена, числа, единицы и формулы переноси ТОЧНО, как в учебнике.
- Сравнения, классификации и перечни свойств (чем отличается, виды, признаки) — таблицей Markdown.
- Рамки «Запомните», «Вывод», «Главное» — цитатой: «> **Запомните:** …».
- Рисунки оставляй только содержательные (схема, график, карта, важная иллюстрация), обязательно с подписью.
- Объём: примерно 20–35% от текста учебника. Ничего сверх того, что есть на страницах: не добавляй свои факты, примеры и даты.`;

const BRIEF_RULES = `Правила краткого конспекта:
- Только самое главное, чтобы быстро повторить перед уроком. Объём — 5–10 пунктов на параграф плюс определения и формулы.
- Структура: заголовок параграфа «## », при необходимости несколько «### ». Под ними — короткие пункты «- » своими словами, без искажений и выдумок.
- Определения: «- **Термин** — определение». Даты, имена, числа, единицы и формулы — ТОЧНО, как в учебнике.
- Сравнение двух-трёх понятий — маленькая таблица Markdown. Рамки «Запомните», «Вывод» — «> **Запомните:** …».
- Примеры, подробности, повторы и вопросы пропусти. Рисунков не нужно, кроме одного важнейшего с подписью.
- Ничего сверх того, что есть на страницах.`;

/** Одна страница → сразу конспект (режимы «Конспект» и «Кратко» для одного фото). */
export function pageSystem(style: NoteStyle): string {
  if (style === 'verbatim') return READ_SYSTEM;
  const goal = style === 'brief' ? 'КРАТКИЙ конспект' : 'КОНСПЕКТ';
  return `Ты помогаешь школьнику сделать ${goal} по фото страницы учебника. Верни ТОЛЬКО Markdown.

${style === 'brief' ? BRIEF_RULES : SUMMARY_RULES}

${READING}

${FORMAT}`;
}

/** Второй запрос: подробный текст нескольких страниц → один связный конспект. */
export function mergeSystem(style: Exclude<NoteStyle, 'verbatim'>): string {
  const goal = style === 'brief' ? 'КРАТКИЙ конспект' : 'КОНСПЕКТ';
  return `Ты помогаешь школьнику сделать ${goal} по параграфу учебника. Ниже подробный текст его страниц подряд. Составь ОДИН связный конспект по всему параграфу целиком (не по страницам по отдельности): объедини повторы, расположи мысли по смыслу учебника. Верни ТОЛЬКО Markdown.

${style === 'brief' ? BRIEF_RULES : SUMMARY_RULES}

Метки в тексте:
- «[стр. N]» — начало страницы N. В конспекте поставь «[стр. N]» отдельной строкой перед разделом или пунктами, взятыми с этой страницы (если раздел идёт с нескольких страниц — метка каждой в нужном месте). Других номеров страниц не придумывай.
- «[[РИС p.i | подпись]]» — рисунок страницы. Содержательные рисунки оставь в конспекте отдельной строкой ровно в таком виде «[[РИС p.i]]» (p и i не меняй) там, где они нужны по смыслу; декоративные и не нужные для понимания пропусти.

Оформление:
- Заголовки «## » и «### », списки «- », таблицы Markdown (GFM, одинаковое число ячеек в строках), рамки «> **Запомните:** …».
- Формулы остаются в LaTeX ($…$, $$…$$) точно такими же.
- Не оборачивай ответ в \`\`\`. HTML, ссылки и картинки не нужны.`;
}

// ---------- Второй запрос ----------

/** Сколько знаков текста отдаём ИИ за один запрос на сведение (длинные параграфы сводим кусками). */
export const MERGE_CHUNK = 28000;

/** Метка страницы, как её видит ученик и ИИ. */
const pageNo = (p: PageResult) => p.detectedPage ?? p.n;

/**
 * Подробный текст страниц для второго запроса: «[стр. N]», рисунки как «[[РИС p.i | подпись]]»
 * (p — номер страницы в списке с 1, i — номер рисунка на странице с 1). Сомнительные слова берём как прочитаны.
 */
export function mergeInput(pages: PageResult[]): { text: string; chars: number }[] {
  const parts = pages.map((p, pi) => {
    let md = p.markdown.replace(/⟦\?:(\w+)⟧/g, (_m, id: string) => p.doubts.find((d) => d.id === id)?.text ?? '');
    md = md.replace(/⟦РИС:(\d+)⟧/g, (_m, i: string) => {
      const f = p.figures[Number(i)];
      if (!f || f.hidden) return '';
      return `[[РИС ${pi + 1}.${Number(i) + 1}${f.caption ? ' | ' + f.caption.replace(/[[\]|]/g, ' ').trim() : ''}]]`;
    });
    return `[стр. ${pageNo(p)}]\n\n${md.trim()}`;
  });
  // Куски по размеру: страницы не режем.
  const chunks: { text: string; chars: number }[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const part of parts) {
    if (cur.length && len + part.length > MERGE_CHUNK) {
      chunks.push({ text: cur.join('\n\n'), chars: len });
      cur = [];
      len = 0;
    }
    cur.push(part);
    len += part.length;
  }
  if (cur.length) chunks.push({ text: cur.join('\n\n'), chars: len });
  return chunks;
}

export type MergeVerdict = { ok: true; markdown: string } | { ok: false; why: string };

/**
 * Ответ ИИ на сведение → чистый Markdown с метками ⟦Ф:p.i⟧ (рисунки) и [стр. N] (только настоящие страницы).
 * Кривой ответ (пустой, отказ, зациклился, сплошной текст) — не годится: вернём ok:false, и останется подробный текст.
 */
export function parseMerged(raw: string, pages: PageResult[], sourceChars: number): MergeVerdict {
  // Метки рисунков берём до общей чистки (она вычищает все «[[…]]»).
  const pre = String(raw ?? '').replace(/\[\[\s*РИС\s*(\d+)\.(\d+)[^\]\n]*\]\]/gi, (_m, p: string, i: string) => `\n\n⟦Ф:${p}.${i}⟧\n\n`);
  const verdict = judgeAiAnswer(pre);
  if (!verdict.ok) return { ok: false, why: verdict.why };
  let md = verdict.parsed.markdown;
  // Рисунки: каждая метка один раз и только существующие.
  const used = new Set<string>();
  md = md.replace(/⟦Ф:(\d+)\.(\d+)⟧/g, (_m, p: string, i: string) => {
    const f = pages[Number(p) - 1]?.figures[Number(i) - 1];
    const key = `${p}.${i}`;
    if (!f || f.hidden || used.has(key)) return '';
    used.add(key);
    return `⟦Ф:${key}⟧`;
  });
  // Номера страниц: только те, что у нас есть.
  const nums = new Set(pages.map(pageNo));
  md = md.replace(/\\?\[стр\.\s*(\d{1,4})\\?\]/g, (_m, n: string) => (nums.has(Number(n)) ? `[стр. ${n}]` : ''));
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  const plain = md.replace(/⟦Ф:[\d.]+⟧/g, '').replace(/\[стр\. \d+\]/g, '').trim();
  if (plain.length < 30) return { ok: false, why: 'ИИ вернул слишком короткий конспект.' };
  // Конспект длиннее самого учебника — это не конспект (ИИ просто переписал текст).
  if (sourceChars > 800 && plain.length > sourceChars * 1.1) return { ok: false, why: 'ИИ не сократил текст.' };
  return { ok: true, markdown: md };
}

/** Рисунок как картинка с подписью (одним абзацем: картинка отдельно в конце конспекта ломает редактор). */
function figureMd(f: PageResult['figures'][number]): string {
  const cap = (f.caption || '').replace(/[[\]]/g, '').replace(/\*+/g, '');
  return `![${cap || 'Рисунок'}](${f.uri})\n*${cap || 'Рисунок'}*`;
}

/** Связный конспект ИИ + страницы → итоговый Markdown (метки рисунков заменены картинками). */
export function assembleMerged(summary: string, pages: PageResult[]): string {
  const md = summary.replace(/⟦Ф:(\d+)\.(\d+)⟧/g, (_m, p: string, i: string) => {
    const f = pages[Number(p) - 1]?.figures[Number(i) - 1];
    return f && !f.hidden ? figureMd(f) : '';
  });
  return neutralizeHtml(md.replace(/\n{3,}/g, '\n\n').trim());
}

// ---------- Конспект без интернета ----------

const CUE = /(итак|таким образом|следовательно|главн|основн|важн|называ|определени|закон|правил|теорем|свойств|причин|итог|результат|значени|т\. ?е\.|например)/i;
const EXERCISE_HEAD = /^(вопросы|задани|упражнени|проверь|подумай|домашн|вспомни|обсудим|практическ|лабораторн)/i;

interface Scored {
  text: string;
  score: number;
  def?: { term: string; meaning: string; verb?: string };
}

/** Оценка предложения: чем больше, тем важнее. */
export function sentenceScore(md: string, first: boolean, hs: HighlightSettings = DEFAULT_HIGHLIGHT): Scored {
  const plain = plainInline(md);
  let score = 0;
  let def = definitionOf(plain) ?? undefined;
  // «Хорошо проводят теплоту металлы, хуже — жидкости» и «где c — масса» — не определения.
  if (def && (/[,;:]/.test(def.term) || def.term.split(/\s+/).length > 4 || !/^[«"(]?[А-ЯЁA-Z]/.test(def.term) || / — /.test(def.meaning))) def = undefined;
  if (def) score += 3;
  if (/\*\*[^*]+\*\*/.test(md)) score += 2;
  const found = findInText(plain, hs);
  const types = new Set(found.map((r) => r.type));
  if (types.has('date')) score += 1.5;
  if (types.has('formula') || /\$[^$]+\$/.test(md)) score += 2;
  if (types.has('name')) score += 0.5;
  if (CUE.test(plain)) score += 1;
  if (first) score += 1.5;
  if (plain.length < 25) score -= 1;
  if (plain.length > 320) score -= 0.5;
  if (/\?\s*$/.test(plain)) score -= 2;
  if (/:\s*$/.test(plain)) score -= 1.5;
  return { text: md.trim(), score, def };
}

/** Рисунок с настоящей подписью («Рис. 3. …») — содержательный; безымянный — нет. */
function figureCaptionOf(block: string): string {
  const m = /\*([^*\n]+)\*\s*$/.exec(block.split('\n').slice(1).join('\n'));
  return m ? m[1].trim() : '';
}

type Kind = 'page' | 'h' | 'box' | 'table' | 'math' | 'fig' | 'list' | 'p';
interface Block {
  kind: Kind;
  text: string;
  level?: number;
}

function blocksOf(md: string): Block[] {
  const out: Block[] = [];
  for (const raw of md.replace(/\r/g, '').split(/\n{2,}/)) {
    const text = raw.trim();
    if (!text) continue;
    if (/^\[стр\.\s*\d+\]$/.test(text)) out.push({ kind: 'page', text });
    else if (/^#{1,6}\s/.test(text) && !text.includes('\n')) out.push({ kind: 'h', text, level: /^#+/.exec(text)![0].length });
    else if (/^>/.test(text)) out.push({ kind: 'box', text });
    else if (/^\|/.test(text) && text.includes('\n')) out.push({ kind: 'table', text });
    else if (/^\$\$[\s\S]*\$\$$/.test(text)) out.push({ kind: 'math', text });
    else if (/^!\[/.test(text)) out.push({ kind: 'fig', text });
    else if (/^(?:[-*]\s|\d+[.)]\s)/.test(text)) out.push({ kind: 'list', text });
    else out.push({ kind: 'p', text });
  }
  return out;
}

/**
 * Извлекающий конспект: из подробного Markdown оставляет заголовки, определения, предложения с важным
 * (жирное, даты, формулы), рамки «Запомните», таблицы и формулы, первые предложения абзацев. Без ИИ — грубее, но честно.
 */
export function extractiveNote(md: string, style: Exclude<NoteStyle, 'verbatim'>, hs: HighlightSettings = DEFAULT_HIGHLIGHT): string {
  const brief = style === 'brief';
  const blocks = blocksOf(md);
  // 1. Оценка всех предложений.
  interface Item {
    bi: number;
    seg: number;
    sc: Scored;
    list: boolean;
  }
  const items: Item[] = [];
  let seg = 0; // номер страницы-куска: бюджет считаем по каждому, чтобы не потерять конец параграфа
  let skipLevel = 0; // внутри раздела «Вопросы» (ниже заголовка этого уровня) ничего не берём
  const skip = new Set<number>();
  blocks.forEach((b, bi) => {
    if (b.kind === 'page') seg++;
    if (b.kind === 'h') {
      if (skipLevel && b.level! <= skipLevel) skipLevel = 0;
      if (EXERCISE_HEAD.test(b.text.replace(/^#+\s*/, '').replace(/[*_]/g, ''))) skipLevel = b.level!;
    }
    if (skipLevel) skip.add(bi);
    if (skipLevel) return;
    if (b.kind === 'p') {
      sentences(b.text.replace(/\n/g, ' ')).forEach((s, si) => items.push({ bi, seg, sc: sentenceScore(s.text, si === 0, hs), list: false }));
    } else if (b.kind === 'list') {
      for (const ln of b.text.split('\n')) {
        const t = ln.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '');
        if (t.trim()) items.push({ bi, seg, sc: sentenceScore(t, true, hs), list: true });
      }
    }
  });
  const limit = brief ? 0.14 : 0.36;
  const floor = brief ? 3 : 1.2;
  const kept: Item[] = [];
  const segs = [...new Set(items.map((it) => it.seg))];
  for (const sg of segs) {
    const mine = items.filter((it) => it.seg === sg);
    const total = mine.reduce((a, it) => a + it.sc.text.length, 0);
    const budget = Math.max(brief ? 90 : 140, total * limit);
    // Самые важные предложения, пока не заполнится доля текста; при равенстве — те, что раньше.
    const order = mine.map((it, i) => ({ it, i })).filter((x) => x.it.sc.score >= floor).sort((a, b) => b.it.sc.score - a.it.sc.score || a.i - b.i);
    let used = 0;
    for (const { it } of order) {
      if (used && used + it.sc.text.length > budget) continue;
      kept.push(it);
      used += it.sc.text.length;
    }
  }
  // «Кратко»: не больше 10 пунктов из обычных предложений (определения и формулы сверх этого не считаем).
  if (brief) {
    const ordinary = kept.filter((it) => !it.sc.def && it.sc.score < 5);
    if (ordinary.length > 10) {
      const drop = new Set(ordinary.sort((a, b) => b.sc.score - a.sc.score).slice(10));
      for (let i = kept.length - 1; i >= 0; i--) if (drop.has(kept[i])) kept.splice(i, 1);
    }
  }
  // Список берём целиком, если в нём нашлось важное (пункты списка сами по себе короткие).
  if (!brief) {
    const lists = new Set(kept.filter((it) => it.list).map((it) => it.bi));
    for (const it of items) if (it.list && lists.has(it.bi) && !kept.includes(it)) kept.push(it);
  }
  // Вводная фраза перед формулой, таблицей или списком («…вычисляют по формуле:») нужна вместе с ними.
  blocks.forEach((b, bi) => {
    const nx = blocks[bi + 1];
    if (b.kind !== 'p' || !nx || skip.has(bi) || !/:\s*$/.test(b.text)) return;
    const need = nx.kind === 'math' || (nx.kind === 'table' && !brief) || (nx.kind === 'list' && kept.some((it) => it.bi === bi + 1));
    if (!need) return;
    const last = items.filter((it) => it.bi === bi).pop();
    if (last && !kept.includes(last)) kept.push(last);
  });
  const keptSet = new Set(kept);
  // 3. Сборка по блокам в исходном порядке.
  const lines: string[] = [];
  const seen = new Set<string>();
  const bulletOf = (it: Item) => {
    const d = it.sc.def;
    // «X — это Y» → «**X** — Y»; прочие определения оставляем фразой учебника
    if (d && !d.verb && !/\*\*/.test(it.sc.text)) return `**${d.term}** — ${d.meaning.replace(/\.$/, '')}.`;
    return it.sc.text.replace(/^[-*]\s+/, '');
  };
  const out: { kind: Kind; text: string; level?: number }[] = [];
  blocks.forEach((b, bi) => {
    if (skip.has(bi)) return;
    if (b.kind === 'h' || b.kind === 'page' || b.kind === 'box' || b.kind === 'math') {
      if (b.kind === 'box' && brief && b.text.length > 400) return;
      out.push(b);
    } else if (b.kind === 'table') {
      if (!brief) out.push(b);
    } else if (b.kind === 'fig') {
      const cap = figureCaptionOf(b.text);
      if (!brief && cap && cap !== 'Рисунок') out.push(b);
    } else {
      const mine = items.filter((it) => it.bi === bi && keptSet.has(it));
      const texts: string[] = [];
      for (const it of mine) {
        const t = bulletOf(it).trim();
        const k = plainInline(t).toLowerCase();
        if (!t || seen.has(k)) continue;
        seen.add(k);
        texts.push(`- ${t}`);
      }
      if (texts.length) out.push({ kind: 'list', text: texts.join('\n') });
    }
  });
  // 4. Заголовки и метки страниц без содержимого убираем.
  const has = (i: number, stop: (b: { kind: Kind; level?: number }) => boolean) => {
    for (let k = i + 1; k < out.length; k++) {
      if (stop(out[k])) return false;
      if (out[k].kind !== 'h' && out[k].kind !== 'page') return true;
    }
    return false;
  };
  out.forEach((b, i) => {
    if (b.kind === 'h' && !has(i, (x) => x.kind === 'h' && x.level! <= b.level!) && !(i === 0 && out.length === 1)) return;
    if (b.kind === 'page' && !has(i, (x) => x.kind === 'page')) return;
    lines.push(b.text);
  });
  return lines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- Итог ----------

export interface FinalNote {
  markdown: string;
  /** Что сказать ученику о способе сборки (пусто — ничего). */
  note: string;
}

/**
 * Итоговый Markdown конспекта по результатам чтения.
 * summary — связный конспект ИИ (если был); иначе — страницы подряд; без интернета и не «Дословно» — извлекающий конспект.
 * Таблицы и формулы приводим в порядок в любом случае.
 */
export function finalNote(pages: PageResult[], fixes: Record<string, string>, o: { style: NoteStyle; engine: 'ai' | 'offline'; summary: string | null }): FinalNote {
  let md: string;
  let note = '';
  if (o.summary) md = assembleMerged(o.summary, pages);
  else {
    md = assemble(pages, fixes);
    if (o.engine === 'offline' && o.style !== 'verbatim') {
      const short = extractiveNote(md, o.style);
      if (short.replace(/\[стр\. \d+\]/g, '').trim()) {
        md = short;
        note = 'Без ИИ конспект грубее: Refrain отобрала главное по признакам (заголовки, определения, даты, формулы, рамки). Проверь и дополни — или выбери «Дословно», чтобы получить весь текст.';
      }
    }
  }
  md = fixTables(md);
  const math = fixFormulas(md);
  md = math.md;
  // Что не удалось починить — честно скажем, чтобы ученик сверил с фото.
  const trouble = tableTrouble(md);
  const warns: string[] = [];
  if (trouble.broken) warns.push(trouble.broken === 1 ? 'Одна таблица распознана плохо' : `${trouble.broken} таблицы распознаны плохо`);
  if (math.bad) warns.push(math.bad === 1 ? 'одна формула не разобралась и оставлена текстом' : `${math.bad} формулы не разобрались и оставлены текстом`);
  if (warns.length) note = (note ? note + ' ' : '') + warns.join(', ').replace(/^./, (c) => c.toUpperCase()) + ' — сверь с фото страницы.';
  return { markdown: md, note };
}
