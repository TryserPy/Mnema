// Страница учебника → Markdown: чистые функции без canvas и без сети (их проверяют тесты).
//  • fixOcrText — типичные ошибки распознавания русского текста;
//  • buildPage — строки и слова Tesseract → колонки, порядок чтения, абзацы, заголовки, списки, рамки, формулы;
//  • assemble — страницы → итоговый конспект;
//  • parseAiMarkdown — ответ ИИ → безопасный чистый Markdown.

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface OcrWord {
  text: string;
  bbox: Rect;
  conf: number;
  sub?: number[];
  sup?: number[];
  bold?: boolean;
}
export interface OcrLine {
  bbox: Rect;
  para: number;
  block?: number;
  btype?: number;
  base?: number[];
  words: OcrWord[];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Figure {
  box: Box; // доли 0..1 на странице
  caption: string;
  uri: string;
}
export interface Doubt {
  id: string;
  text: string;
  crop: string; // data URI кусочка фото
}
export interface PageResult {
  n: number;
  photo: string; // data:image/jpeg (для просмотра и хранения)
  markdown: string; // с метками ⟦РИС:i⟧ и ⟦?:id⟧
  figures: Figure[];
  doubts: Doubt[];
  detectedPage?: number;
  /** Сколько слов не удалось разобрать уверенно (для подсказки «снимок получился плохо»). */
  quality?: { words: number; unsure: number; conf: number };
  /** Пояснение для пользователя (например, «ИИ не справился — прочитано без интернета»). */
  note?: string;
  /** Честные советы, если снимок плох: «темно», «размыто», «слишком мелко» (code — для тестов, text — для ученика). */
  advice?: { code: string; text: string }[];
  /** Страница была половиной разворота (две страницы на одном снимке). */
  spread?: 'left' | 'right';
}

// ---------- Общие мелочи ----------

const CYR = /[А-Яа-яЁё]/;
const LAT = /[A-Za-z]/;
const LETTER = /\p{L}/u;
const isCyr = (c: string) => CYR.test(c);

export function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
function percentile(a: number[], p: number): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))];
}
const lettersOf = (s: string) => s.replace(/[^\p{L}]/gu, '');

// ---------- Исправление типичных ошибок распознавания ----------

/** Латинские буквы, неотличимые от русских. */
const LAT2CYR: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У', a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у' };
/** Ещё латинские буквы, которые Tesseract путает с русскими, когда слово целиком в русской строке. */
const LAT2CYR_LOOSE: Record<string, string> = { ...LAT2CYR, u: 'и', n: 'п', r: 'г', m: 'т', b: 'ь', d: 'д', k: 'к', i: 'і', h: 'н', t: 'т', l: 'і' };
/** Короткие русские слова, которые бывают написаны латиницей-двойником: «OT», «Ha», «He», «ce». */
const SHORT_RU = new Set(['от', 'на', 'не', 'по', 'до', 'за', 'из', 'он', 'но', 'то', 'ее', 'её', 'ох', 'ах', 'как', 'так', 'что', 'это', 'все', 'для', 'при', 'под', 'над', 'или', 'они', 'мы', 'ты', 'вы', 'их', 'ли', 'же', 'бы', 'уж', 'ни', 'во', 'со', 'ко', 'об', 'обо', 'про', 'без', 'вот', 'тем', 'там', 'тот', 'эта', 'эти', 'его', 'нет', 'был', 'она', 'оно', 'вне', 'нас', 'нам', 'вам', 'ним', 'нее', 'неё', 'уже', 'еще', 'ещё', 'все', 'вся', 'чем', 'кто', 'при', 'чье', 'три', 'два', 'сто', 'ото', 'ей', 'ему', 'тех', 'тому', 'том', 'сам', 'или', 'ряд', 'век', 'год', 'лет']);
const DIGIT2CYR: Record<string, string> = { '0': 'о', '3': 'з', '6': 'б', '4': 'ч' };
const CYR2DIGIT: Record<string, string> = { О: '0', о: '0', З: '3', з: '3', б: '6', Б: '6', В: '8', l: '1', I: '1', '|': '1', S: '5', O: '0', o: '0', B: '8', Z: '2', z: '2', Ч: '4' };

const MASK_RE = /(⟦[^⟧]*⟧|\$\$[\s\S]+?\$\$|\$[^$\n]+\$|!\[[^\]\n]*\]\([^)\n]*\)|`[^`\n]*`)/;

/** Применяет f ко всему тексту, кроме формул, картинок и меток. */
function outsideMasks(s: string, f: (part: string) => string): string {
  return s
    .split(MASK_RE)
    .map((part, i) => (i % 2 === 1 ? part : f(part)))
    .join('');
}

function fixWordLetters(w: string, lineCyr: boolean): string {
  // Слово из букв и цифр: «Пол0жение», «ПOЛ0Ж3НИЕ» — внутри русского слова цифры-двойники → буквы.
  if (/^[А-Яа-яЁё]{2,}\d+[А-Яа-яЁё]{2,}$/.test(w) || /^[А-Яа-яЁё]{3,}\d$/.test(w) || /^[036][А-Яа-яЁё]{3,}$/.test(w)) {
    const letters = w.replace(/\d/g, '');
    const upper = letters === letters.toUpperCase() && letters.length > 2;
    return w.replace(/\d/g, (d) => {
      const c = DIGIT2CYR[d];
      if (!c) return d;
      return upper ? c.toUpperCase() : c;
    });
  }
  const hasCyr = CYR.test(w);
  const hasLat = LAT.test(w);
  // Смешанное слово: кириллица + латинские двойники → всё кириллицей.
  if (hasCyr && hasLat && [...w].every((ch) => !LETTER.test(ch) || isCyr(ch) || LAT2CYR[ch])) return [...w].map((ch) => LAT2CYR[ch] ?? ch).join('');
  // Целиком латиница в русской строке: «OT», «Ha» → «от», «на» (только настоящие короткие слова).
  if (!hasCyr && hasLat && lineCyr && w.length >= 2 && w.length <= 4 && /^[A-Za-z]+$/.test(w)) {
    const cy = [...w].map((ch) => LAT2CYR_LOOSE[ch] ?? ch).join('');
    if (/^[а-яёіьд]+$/i.test(cy) && SHORT_RU.has(cy.toLowerCase())) return /^[A-Z]+$/.test(w) && w.length > 2 ? cy.toUpperCase() : w[0] === w[0].toUpperCase() && w.length > 1 && w.slice(1) === w.slice(1).toLowerCase() ? cy[0].toUpperCase() + cy.slice(1).toLowerCase() : cy.toLowerCase();
  }
  // Число с буквами-двойниками: «1S61» «l861» «2З» → цифры.
  if (/\d/.test(w) && /[OoОоlI|SBZзЗбБВЧ]/.test(w)) {
    const digits = (w.match(/\d/g) ?? []).length;
    const rest = w.replace(/[\d.,\-–]/g, '');
    if (digits >= 2 && rest.length <= 2 && digits >= w.replace(/[.,\-–]/g, '').length - 1 && /^[\dOoОоlI|SBZзЗбБВЧ.,\-–]+$/.test(w)) return w.replace(/[OoОоlI|SBZзЗбБВЧ]/g, (c) => CYR2DIGIT[c] ?? c);
  }
  if (/^\d[OoОоЗз]$/.test(w)) return w[0] + CYR2DIGIT[w[1]];
  return w;
}

/** Исправляет типичные ошибки распознавания русского текста. Формулы `$…$`, метки и картинки не трогает. */
export function fixOcrText(s: string): string {
  let t = s;
  t = t.replace(/(^|\n)((?:#{1,6}\s+)?(?:>\s*)?)(?:\$|S|§)\s?(?=\d{1,3}[.:]?\s)/g, '$1$2§ '); // «$ 7.» → «§ 7.»
  t = outsideMasks(t, (part) => {
    let p = part;
    p = p
      .split('\n')
      .map((line) => {
        const letters = lettersOf(line);
        const cyrShare = letters ? (letters.match(/[А-Яа-яЁё]/g)?.length ?? 0) / letters.length : 0;
        const lineCyr = cyrShare > 0.45;
        return line.replace(/[\p{L}\d][\p{L}\d]*/gu, (w) => fixWordLetters(w, lineCyr));
      })
      .join('\n');
    // Одинокая латинская «B», «a» между русскими словами — это «в», «а»; «ИЛИ» заглавными посреди строчных — «или».
    p = p.replace(/(?<=[а-яё,;] )([A-Za-z])(?= [а-яё])/g, (m, ch: string) => (LAT2CYR[ch] ? LAT2CYR[ch].toLowerCase() : m));
    p = p.replace(/(?<=[а-яё,;] )([А-ЯЁ]{2,4}|[А-ЯЁ][а-яё]{1,3})(?= [а-яё])/g, (m) => (SHORT_RU.has(m.toLowerCase()) ? m.toLowerCase() : m));
    // Римские цифры после имени: «Александр П» → «Александр II», «Пётр Т» → «Пётр I».
    p = p.replace(/([А-ЯЁ][а-яё]{2,}\**\s)(П|Ш|Т|Г)(?=[\s.,;:)*]|$)/gm, (_m, a: string, r: string) => a + ({ П: 'II', Ш: 'III', Т: 'I', Г: 'I' } as Record<string, string>)[r]);
    p = p.replace(/\*\*([^*\n]+)\*\* (I{1,3}|IV|VI{0,3}|IX|X{1,3})(?=[\s.,;:)]|$)/gm, '**$1 $2**');
    // «XIX века» набрано русскими Х и І → латинские римские цифры.
    p = p.replace(/(^|[\s(«])([IVXLCХІ]{2,7})(?=\s*(?:вв?\.?|век|века|веке|веков|веку|в\.))/g, (_m, a: string, r: string) => a + r.replace(/Х/g, 'X').replace(/І/g, 'I'));
    p = p.replace(/[‐‑‒]/g, '-').replace(/[¬­]/g, '-');
    // Предлог с большой буквы посреди предложения: «нести повинности В пользу» → «в пользу».
    p = p.replace(/(?<=[а-яё,] )([ВСКОУИА])(?= [а-яё])/g, (m) => m.toLowerCase());
    // Тире: « - » между словами → « — »; диапазон лет и страниц → «–».
    p = p.replace(/(?<=[\p{L}\d.,;:)»\]*]) [-–−] (?=[\p{L}\d«(\[*])/gu, ' — ');
    p = p.replace(/(?<=\S[ \t])[-–−](?=[ \t])/g, '—');
    p = p.replace(/(\b\d{3,4})-(\d{2,4}\b)/g, '$1–$2');
    // Пробелы вокруг знаков препинания.
    p = p.replace(/[ \t]+([,.;:!?)»\]])/g, '$1').replace(/([(«\[])[ \t]+/g, '$1');
    p = p.replace(/([,;:!?])(?=[А-Яа-яЁёA-Za-z])/g, '$1 ');
    p = p.replace(/(?<=[а-яё]{2})\.(?=[А-ЯЁ][а-яё])/g, '. ');
    // Кавычки: "слово" → «слово».
    p = p.replace(/"([^"\n]{1,120})"/g, '«$1»').replace(/[„“”]([^„“”\n]{1,120})[“”]/g, '«$1»');
    p = p.replace(/[ \t]{2,}/g, ' ');
    return p;
  });
  return t;
}

/** Склеивает строки абзаца, убирая переносы «раз-\nвитие». */
export function joinLines(lines: string[]): string {
  let out = '';
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (!out) out = l;
    else if (isSoftHyphen(out, l)) out = out.slice(0, -1) + l;
    else out += ' ' + l;
  }
  return out;
}

/** Слово оборвано переносом: «теп-» + «лоты» → «теплоты»; «кто-» + «то» → остаётся «кто-то». */
export function isSoftHyphen(prev: string, next: string): boolean {
  if (!/[а-яёa-z]{2}[-‐‑–¬]$/i.test(prev) && !/(?:^|[\s(«])[а-яёa-z]{1,2}[-¬]$/i.test(prev)) return false;
  if (!/^[а-яёa-z]/.test(next)) return false;
  // Частицы и приставки пишутся через дефис и при переносе: «кто-\nто», «из-\nза».
  if (/^(то|либо|нибудь|таки|ка)(?![а-яё])/i.test(next)) return false;
  if (/(?:^|[\s(«])(из|по|во|кое|как|что|кто|где|куда|когда)-$/i.test(prev) && /^(за|под|подо|над|то|либо|нибудь|русски|нашему|моему|новому|другому|прежнему)(?![а-яё])/i.test(next)) return false;
  return true;
}

// ---------- Рамки и подписи ----------

export const BOX_TITLES = /^(Запомни(те)?|Это важно|Важно|Вывод(ы)?|Главное|Обрати(те)? внимание|Правило|Определение|Это интересно|Интересно|Знаете ли вы|Примечание|Совет)\s*[:!.]?$/i;
const CAPTION_RE = /^(Рис(унок|\.|,)?|Схема|Таблица|Табл\.|Карта|Фото(графия)?|График|Диаграмма|Фиг\.?)\s*\d*[.:)]?(\s|$)/i;

// ---------- Раскладка страницы ----------

export interface LayoutInput {
  lines: OcrLine[];
  width: number;
  height: number;
  /** Найденные рисунки (пиксели страницы). */
  figures: Rect[];
  /** Рамки с заливкой или обводкой (пиксели страницы). */
  boxes?: Rect[];
  /** Отладка: получает порядок блоков. */
  debug?: (x: unknown) => void;
}
export interface LayoutDoubt {
  id: string;
  text: string;
  bbox: Rect;
}
export interface LayoutResult {
  markdown: string;
  doubts: LayoutDoubt[];
  /** Подписи к рисункам (по номеру в input.figures). */
  captions: string[];
  detectedPage?: number;
  quality: { words: number; unsure: number; conf: number };
}

interface Tok {
  text: string;
  bold: boolean;
  conf: number;
  bbox: Rect;
  sub?: number[];
  sup?: number[];
}
interface LineInfo {
  line: OcrLine;
  toks: Tok[];
  text: string;
  x0: number;
  x1: number;
  yb: number; // линия строки (baseline)
  h: number; // высота слов
  size: number; // относительный размер букв (1 — обычный)
  boldShare: number;
  col: string;
  box: number; // номер рамки или -1
  unit: number;
}

const rectW = (r: Rect) => r.x1 - r.x0;
const rectH = (r: Rect) => r.y1 - r.y0;
function overlapArea(a: Rect, b: Rect) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}
const unionRect = (rs: Rect[]): Rect => ({ x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1)) });

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function wordText(w: OcrWord, math: boolean): string {
  const chars = [...w.text];
  if (!w.sub?.length && !w.sup?.length) return w.text;
  return chars
    .map((ch, i) => {
      const d = /\d/.test(ch) ? Number(ch) : -1;
      if (w.sub?.includes(i)) return math ? `_${ch}` : d >= 0 ? SUBS[d] : ch;
      if (w.sup?.includes(i)) return math ? `^${ch}` : d >= 0 ? SUPS[d] : ch;
      return ch;
    })
    .join('');
}

/** Описание строки: слова, границы, размер букв. */
function describe(l: OcrLine): LineInfo {
  const toks: Tok[] = l.words.map((w) => ({ text: wordText(w, false), bold: Boolean(w.bold), conf: w.conf, bbox: w.bbox, sub: w.sub, sup: w.sup }));
  const letterWords = l.words.filter((w) => lettersOf(w.text).length >= 3);
  const hs = (letterWords.length ? letterWords : l.words).map((w) => w.bbox.y1 - w.bbox.y0);
  const base = l.base;
  const midX = (l.bbox.x0 + l.bbox.x1) / 2;
  const yb = base && base.length === 4 ? base[1] + ((base[3] - base[1]) * (midX - base[0])) / Math.max(1, base[2] - base[0]) : l.bbox.y1 - (l.bbox.y1 - l.bbox.y0) * 0.22;
  const bw = l.words.filter((w) => lettersOf(w.text).length >= 1);
  return {
    line: l,
    toks,
    text: toks.map((t) => t.text).join(' '),
    x0: l.bbox.x0,
    x1: l.bbox.x1,
    yb,
    h: median(hs) || rectH(l.bbox),
    size: 1,
    boldShare: bw.length ? bw.filter((w) => w.bold).length / bw.length : 0,
    col: '',
    box: -1,
    unit: 0
  };
}

interface Unit {
  rect: Rect;
  lines: LineInfo[];
  fig?: number;
  col: string;
  box: number;
}

/** Рекурсивное деление страницы по пустым полосам (сначала по горизонтали, потом по вертикали) → порядок чтения. */
export function xyCut(units: Unit[], tolX: number, tolY: number, col = ''): Unit[] {
  if (units.length <= 1) {
    for (const u of units) u.col = col;
    return units;
  }
  const groups = (key0: 'x0' | 'y0', key1: 'x1' | 'y1', tol: number): Unit[][] => {
    const s = [...units].sort((a, b) => a.rect[key0] - b.rect[key0] || a.rect.y0 - b.rect.y0);
    const out: Unit[][] = [];
    let end = -Infinity;
    for (const u of s) {
      if (!out.length || u.rect[key0] > end - tol) out.push([u]);
      else out[out.length - 1].push(u);
      end = out.length && out[out.length - 1].length === 1 ? u.rect[key1] : Math.max(end, u.rect[key1]);
    }
    return out;
  };
  const hg = groups('y0', 'y1', tolY);
  if (hg.length > 1) return hg.flatMap((g) => xyCut(g, tolX, tolY, col));
  const vg = groups('x0', 'x1', tolX);
  if (vg.length > 1) return vg.flatMap((g, i) => xyCut(g, tolX, tolY, col + String.fromCharCode(65 + i)));
  const s = [...units].sort((a, b) => a.rect.y0 - b.rect.y0 || a.rect.x0 - b.rect.x0);
  for (const u of s) u.col = col;
  return s;
}

const PARA_SIGN = /^(?:§|\$|S|&)\s?\d{1,3}[.:\s]/;
/**
 * Порядок чтения, когда известны просветы между колонками: полноширинные блоки (заголовок, рисунок во всю ширину)
 * делят страницу на полосы, в каждой полосе сначала левая колонка сверху вниз, потом правая.
 */
export function orderByGutters(units: Unit[], gs: Gutter[], mh: number): Unit[] {
  const crosses = (u: Unit) => gs.some((g) => u.rect.x0 < g.x0 + mh * 0.5 && u.rect.x1 > g.x1 - mh * 0.5);
  const full = units.filter(crosses).sort((a, b) => a.rect.y0 - b.rect.y0);
  const rest = units.filter((u) => !crosses(u));
  const segs: Unit[][] = full.map(() => []);
  segs.push([]);
  for (const u of rest) {
    const cy = (u.rect.y0 + u.rect.y1) / 2;
    let k = 0;
    while (k < full.length && cy > (full[k].rect.y0 + full[k].rect.y1) / 2) k++;
    segs[k].push(u);
  }
  const out: Unit[] = [];
  const side = (u: Unit) => sideOf(gs, (u.rect.x0 + u.rect.x1) / 2);
  segs.forEach((seg, k) => {
    const sides = new Set(seg.map(side));
    const bySide = [...sides].sort((a, b) => a - b);
    for (const sd of bySide) {
      const part = seg.filter((u) => side(u) === sd).sort((a, b) => a.rect.y0 - b.rect.y0 || a.rect.x0 - b.rect.x0);
      for (const u of part) u.col = bySide.length > 1 ? `c${sd}` : '';
      out.push(...part);
    }
    if (k < full.length) {
      full[k].col = '';
      out.push(full[k]);
    }
  });
  return out;
}

const SENT_END = /[.!?…:;»)\]]['"»*]*$/;
const BULLET_CLEAN = /^[•·●○▪■◦▫∙‣⁃]$/;
const BULLET_NOISE = /^[®©°*«»eEoOоО0]$/;
const DASHES = /^[-–—]$/;

/** Пустая страница без текста: нечего собирать. */
const EMPTY: LayoutResult = { markdown: '', doubts: [], captions: [], quality: { words: 0, unsure: 0, conf: 0 } };

function cleanWordText(t: string): string {
  return t.replace(/[​-‏﻿]/g, '').trim();
}

/** Слово — осколок от рисунка или пятна, а не текст. */
function isNoiseWord(w: OcrWord): boolean {
  const t = w.text;
  const alnum = t.replace(/[^\p{L}\p{N}]/gu, '');
  if (!t.trim()) return true;
  if (w.conf < 18) return true;
  if (!alnum.length) return !/^[—–\-.,:;!?()«»"'§%№=+×·•®©°*$&]$/.test(t) || w.conf < (/^[—–\-]$/.test(t) ? 15 : 40);
  if (alnum.length === 1 && w.conf < 40 && !/\d/.test(alnum)) return true;
  return false;
}

/** Строка — мусор от пятен, теней и рисунка. */
function isGarbageLine(l: OcrLine): boolean {
  const ws = l.words;
  if (!ws.length) return true;
  const alnum = ws.reduce((n, w) => n + w.text.replace(/[^\p{L}\p{N}]/gu, '').length, 0);
  const conf = ws.reduce((n, w) => n + w.conf, 0) / ws.length;
  if (alnum === 0) return true;
  if (alnum <= 2 && conf < 60 && ws.length <= 2) return true;
  if (conf < 38 && alnum < 14) return true;
  if (conf < 30) return true;
  // Много «слов» без гласных или из одной буквы при низкой уверенности — это шум.
  const noisy = ws.filter((w) => {
    const t = lettersOf(w.text);
    return (t.length >= 4 && !/[аеёиоуыэюяaeiouy]/i.test(t)) || (t.length <= 1 && w.conf < 70 && !/\d/.test(w.text));
  }).length;
  if (ws.length >= 3 && noisy / ws.length > 0.55 && conf < 72) return true;
  return false;
}

interface Para {
  type: 'p' | 'h2' | 'h3' | 'li' | 'cap' | 'formula' | 'fig';
  lines: LineInfo[];
  /** Номер рамки (если абзац внутри) или -1. */
  box: number;
  boxTitle?: boolean;
  marker?: string;
  fig?: number;
  col: string;
  ended?: boolean;
}

/** Слова строки → Markdown с жирным и метками сомнительных слов. */
function renderToks(toks: Tok[], doubts: LayoutDoubt[], idOf: () => string): string {
  const parts: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (!run.length) return;
    let s = run.join(' ');
    // Знаки вокруг жирного — наружу: «**слово**.»
    const lead = /^[«("[]+/.exec(s)?.[0] ?? '';
    s = s.slice(lead.length);
    const trail = /[.,;:!?)»\]…]+$/.exec(s)?.[0] ?? '';
    s = s.slice(0, s.length - trail.length);
    parts.push(s ? `${lead}**${s}**${trail}` : lead + trail);
    run = [];
  };
  for (const t of toks) {
    let text = t.text;
    if (t.conf < 62 && lettersOf(text).length >= 3 && !/⟦/.test(text)) {
      // Знаки препинания вокруг слова остаются снаружи метки: проверять нужно слово, а не точку.
      const m = /^([«("[]*)([\s\S]*?)([.,;:!?)»\]…]*)$/.exec(text)!;
      const id = idOf();
      doubts.push({ id, text: m[2] || text, bbox: t.bbox });
      text = `${m[1]}⟦?:${id}⟧${m[3]}`;
    }
    if (t.bold) run.push(text);
    else {
      flush();
      parts.push(text);
    }
  }
  flush();
  return parts.join(' ');
}

const mergeBold = (s: string) =>
  s
    .replace(/\*\*\s+\*\*/g, ' ')
    .replace(/\*\*([^*]*[А-ЯЁA-Z])\*\*\. \*\*/g, '**$1. ')
    .replace(/\*\*([^*]+)\*\*\s+\*\*([^*]+)\*\*/g, '**$1 $2**');

/** Формула ли эта строка: знак равенства или сравнения и почти нет русских слов. */
export function looksLikeFormula(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (!/[=≈≤≥≠→∝]/.test(t)) return false;
  const letters = lettersOf(t);
  const cyr = (letters.match(/[А-Яа-яЁё]/g) ?? []).length;
  const words = t.split(/\s+/).filter((w) => /[А-Яа-яЁё]{3,}/.test(w)).length;
  return words <= 1 && cyr <= Math.max(2, letters.length * 0.3) && !/[.!?]\s+[А-Я]/.test(t);
}

/** Строка формулы → LaTeX (приблизительно: операторы, индексы, греческие буквы). */
export function formulaToTex(text: string, toks?: Tok[]): string {
  let t = toks ? toks.map((k) => wordTextTok(k)).join(' ') : text;
  t = t
    .replace(/[−–—]/g, '-')
    .replace(/[·•∙⋅]/g, ' \\cdot ')
    .replace(/[×✕]/g, ' \\times ')
    .replace(/≈/g, ' \\approx ')
    .replace(/≤/g, ' \\le ')
    .replace(/≥/g, ' \\ge ')
    .replace(/≠/g, ' \\ne ')
    .replace(/→/g, ' \\to ')
    .replace(/Δ/g, '\\Delta ')
    .replace(/π/g, '\\pi ')
    .replace(/ρ/g, '\\rho ')
    .replace(/λ/g, '\\lambda ')
    .replace(/η/g, '\\eta ')
    .replace(/μ/g, '\\mu ')
    .replace(/ω/g, '\\omega ')
    .replace(/α/g, '\\alpha ')
    .replace(/β/g, '\\beta ')
    .replace(/∙/g, ' \\cdot ');
  // Кириллица посреди формулы (единицы измерения) — в \text{}.
  const CYR2LAT: Record<string, string> = { с: 'c', С: 'C', т: 'm', к: 'k', х: 'x', у: 'y', о: 'o', р: 'p', е: 'e', а: 'a', в: 'B', Т: 'T', М: 'M', Н: 'H', К: 'K', Х: 'X', А: 'A', Е: 'E', В: 'B', О: 'O', Р: 'P' };
  t = t.replace(/(?<![А-Яа-яЁё])[А-Яа-яЁё](?![А-Яа-яЁё])/g, (ch) => CYR2LAT[ch] ?? ch);
  t = t.replace(/[А-Яа-яЁё]+/g, (w) => `\\text{${w}}`);
  // Индексы вида t2 − t1: цифра после буквы, если у буквы есть пара с другой цифрой.
  const withDigit = new Map<string, Set<string>>();
  for (const m of t.matchAll(/(?<![A-Za-z\\])([A-Za-z])(\d)(?!\d)/g)) {
    if (!withDigit.has(m[1])) withDigit.set(m[1], new Set());
    withDigit.get(m[1])!.add(m[2]);
  }
  t = t.replace(/(?<![A-Za-z\\])([A-Za-z])(\d)(?!\d)/g, (m, a: string, d: string) => ((withDigit.get(a)?.size ?? 0) >= 2 ? `${a}_${d}` : m));
  // Расставленные тонкие пробелы и рваные операторы.
  t = t.replace(/\s*=\s*/g, ' = ').replace(/\s+/g, ' ').trim();
  t = t.replace(/(\w|\))\s*-\s*(\w|\()/g, '$1 - $2');
  return t;
}
function wordTextTok(k: Tok): string {
  const chars = [...k.text];
  if (!k.sub?.length && !k.sup?.length) return k.text;
  return chars.map((ch, i) => (k.sub?.includes(i) ? `_${ch}` : k.sup?.includes(i) ? `^${ch}` : ch)).join('');
}

/** Номер страницы: «47», «— 47 —», «стр. 47». */
function pageNumberOf(text: string): number | undefined {
  const m = /^[\s—–\-·•]*(?:стр\.?\s*)?(\d{1,4})[\s—–\-·•]*$/i.exec(text.trim());
  return m ? Number(m[1]) : undefined;
}

export function buildPage(input: LayoutInput): LayoutResult {
  const { height: H } = input;
  // 1. Чистим слова и строки.
  let lines: OcrLine[] = input.lines
    .map((l) => ({ ...l, words: l.words.map((w) => ({ ...w, text: cleanWordText(w.text) })).filter((w) => w.text && !isNoiseWord(w)) }))
    .filter((l) => l.words.length && !isGarbageLine(l))
    .map((l) => ({ ...l, bbox: unionRect(l.words.map((w) => w.bbox)) }));
  if (!lines.length) return EMPTY;
  let gutters: Gutter[] = [];
  {
    const mh0 = median(lines.map((l) => rectH(l.bbox))) || 30;
    const gs = findGutters(lines, mh0);
    gutters = gs;
    lines = mergeRows(splitAtGutters(lines, gs), gs, mh0).map((l) => ({ ...l, words: [...l.words].sort((a, b) => a.bbox.x0 - b.bbox.x0) }));
  }

  // 2. Слова внутри рисунков — подписи на самом рисунке, в текст не идут.
  if (input.figures.length) {
    lines = lines
      .map((l) => {
        const ws = l.words.filter((w) => !input.figures.some((f) => overlapArea(w.bbox, f) >= 0.5 * (rectW(w.bbox) * rectH(w.bbox))));
        return ws.length === l.words.length ? l : { ...l, words: ws, bbox: ws.length ? unionRect(ws.map((w) => w.bbox)) : l.bbox };
      })
      .filter((l) => l.words.length);
  }
  if (!lines.length && !input.figures.length) return EMPTY;

  let infos = lines.map(describe);
  const wordHs = infos.flatMap((i) => i.line.words.filter((w) => lettersOf(w.text).length >= 3).map((w) => w.bbox.y1 - w.bbox.y0));
  const mwh = median(wordHs) || 24;
  // Размер букв: высота слов зависит от выносных элементов («р», «й»), поэтому берём меньшее из отношений высоты и ширины знака.
  const widthPerChar = (ws: OcrWord[]) => median(ws.filter((w) => lettersOf(w.text).length >= 3).map((w) => (w.bbox.x1 - w.bbox.x0) / [...w.text].length));
  const mcw = widthPerChar(infos.flatMap((i) => i.line.words)) || 1;
  for (const i of infos) {
    const wl = widthPerChar(i.line.words);
    i.size = wl ? Math.min(i.h / mwh, wl / mcw) : i.h / mwh;
  }
  const mh = median(infos.map((i) => rectH(i.line.bbox))) || mwh * 1.4;

  // 3. Номер страницы и колонтитулы: одиночные строки у верхнего и нижнего края.
  let detectedPage: number | undefined;
  infos.sort((a, b) => a.line.bbox.y0 - b.line.bbox.y0);
  const bodyPitch = (() => {
    const gaps: number[] = [];
    for (let i = 1; i < infos.length; i++) {
      const d = infos[i].yb - infos[i - 1].yb;
      if (d > mh * 0.6 && d < mh * 2) gaps.push(d);
    }
    return median(gaps) || mh * 1.3;
  })();
  const dropped = new Set<LineInfo>();
  const topLine = infos[0];
  if (topLine && topLine.line.bbox.y1 < H * 0.1 && topLine.size < 1.12) {
    const next = infos.find((x) => x !== topLine && x.line.bbox.y0 > topLine.line.bbox.y1 - mh * 0.3);
    const isolated = !next || next.line.bbox.y0 - topLine.line.bbox.y1 > bodyPitch * 0.9 || next.yb - topLine.yb > bodyPitch * 1.8;
    const num = pageNumberOf(topLine.text);
    if (num !== undefined && (isolated || topLine.toks.length === 1)) (detectedPage = num), dropped.add(topLine);
    else if (isolated && topLine.toks.length <= 8 && !/[.!?]$/.test(topLine.text) && topLine.line.bbox.y1 < H * 0.085) dropped.add(topLine);
  }
  const botLine = infos[infos.length - 1];
  if (botLine && !dropped.has(botLine) && botLine.line.bbox.y0 > H * 0.84) {
    const prev = [...infos].reverse().find((x) => x !== botLine && x.line.bbox.y1 < botLine.line.bbox.y0 + mh * 0.3);
    const isolated = !prev || botLine.line.bbox.y0 - prev.line.bbox.y1 > bodyPitch * 0.9 || botLine.yb - prev.yb > bodyPitch * 1.8;
    const num = pageNumberOf(botLine.text);
    if (num !== undefined && (isolated || botLine.toks.length === 1)) (detectedPage = num), dropped.add(botLine);
    else if (isolated && botLine.line.bbox.y0 > H * 0.915 && botLine.toks.length <= 8 && botLine.size < 1.1 && !/[.!?]$/.test(botLine.text)) dropped.add(botLine);
  }
  // Номер в углу рядом с колонтитулом: «47   Отмена крепостного права».
  infos = infos.filter((i) => !dropped.has(i));
  if (!infos.length && !input.figures.length) return { ...EMPTY, detectedPage };

  // 4. Рамки: строки внутри рамки принадлежат ей.
  const boxes = input.boxes ?? [];
  for (const i of infos) {
    const cx = (i.line.bbox.x0 + i.line.bbox.x1) / 2;
    const cy = (i.line.bbox.y0 + i.line.bbox.y1) / 2;
    i.box = boxes.findIndex((b) => cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1);
  }

  // 5. Блоки → порядок чтения. Рамка и рисунок — отдельные блоки.
  const units: Unit[] = [];
  const byBlock = new Map<string, LineInfo[]>();
  for (const i of infos) {
    const key = i.box >= 0 ? `b${i.box}` : `t${i.line.block ?? 'x' + units.length}_${sideOf(gutters, (i.line.bbox.x0 + i.line.bbox.x1) / 2)}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key)!.push(i);
  }
  for (const [key, ls] of byBlock) {
    ls.sort((a, b) => a.yb - b.yb || a.x0 - b.x0);
    // Блок не должен «накрывать» рисунок или соседний текст: строки через большой просвет — отдельные блоки.
    const parts: LineInfo[][] = [[]];
    for (const l of ls) {
      const last = parts[parts.length - 1];
      if (last.length && l.line.bbox.y0 - last[last.length - 1].line.bbox.y1 > mh * 2.5) parts.push([l]);
      else last.push(l);
    }
    for (const part of parts) units.push({ rect: unionRect(part.map((l) => l.line.bbox)), lines: part, col: '', box: key.startsWith('b') ? Number(key.slice(1)) : -1 });
  }
  input.figures.forEach((f, idx) => units.push({ rect: f, lines: [], fig: idx, col: '', box: -1 }));
  const ordered = gutters.length ? orderByGutters(units, gutters, mh) : xyCut(units, mh * 0.5, mh * 0.2);
  input.debug?.(ordered.map((u) => `${u.col || '-'} ${Math.round(u.rect.x0)}-${Math.round(u.rect.x1)} y${Math.round(u.rect.y0)}-${Math.round(u.rect.y1)} ${u.fig !== undefined ? 'FIG' : u.lines.map((l) => l.text).join(' / ').slice(0, 50)}`));

  // 6. Линейный список: строки и рисунки в порядке чтения.
  type Item = { kind: 'line'; info: LineInfo } | { kind: 'fig'; idx: number; col: string };
  const items: Item[] = [];
  ordered.forEach((u, ui) => {
    if (u.fig !== undefined) items.push({ kind: 'fig', idx: u.fig, col: u.col });
    else
      for (const l of u.lines) {
        l.col = u.col;
        l.unit = ui;
        l.box = u.box;
        items.push({ kind: 'line', info: l });
      }
  });
  const lineItems = items.filter((x): x is Extract<Item, { kind: 'line' }> => x.kind === 'line').map((x) => x.info);
  if (!lineItems.length && !input.figures.length) return { ...EMPTY, detectedPage };

  // 7. Поля колонок и обычный шаг строк.
  const colStats = new Map<string, { left: number; right: number; width: number }>();
  const colKeys = [...new Set(lineItems.map((l) => l.col))];
  const globalBody = lineItems.filter((l) => l.toks.length >= 3);
  for (const c of colKeys) {
    const ls = lineItems.filter((l) => l.col === c && l.toks.length >= 3);
    const src = ls.length >= 3 ? ls : globalBody.length ? globalBody : lineItems;
    // Левое поле — самое частое значение начала строки (устойчиво к отступам красной строки).
    const xs = src.map((l) => l.x0).sort((a, b) => a - b);
    const bins = new Map<number, number>();
    for (const x of xs) bins.set(Math.round(x / (mh * 0.4)), (bins.get(Math.round(x / (mh * 0.4))) ?? 0) + 1);
    let bestBin = 0;
    let bestN = -1;
    for (const [b, n] of bins) if (n > bestN || (n === bestN && b < bestBin)) (bestN = n), (bestBin = b);
    const left = median(xs.filter((x) => Math.round(x / (mh * 0.4)) === bestBin));
    const right = percentile(src.map((l) => l.x1), 0.85);
    colStats.set(c, { left, right, width: Math.max(1, right - left) });
  }
  const pitches: number[] = [];
  for (let i = 1; i < lineItems.length; i++) {
    const a = lineItems[i - 1];
    const b = lineItems[i];
    if (a.unit === b.unit && a.size < 1.15 && b.size < 1.15) {
      const d = b.yb - a.yb;
      if (d > mh * 0.6 && d < mh * 2.2) pitches.push(d);
    }
  }
  const pitch = median(pitches) || bodyPitch;
  const justified = (() => {
    const full = lineItems.filter((l) => l.toks.length >= 4 && l.size < 1.15);
    if (full.length < 4) return false;
    const ok = full.filter((l) => {
      const st = colStats.get(l.col)!;
      return Math.abs(l.x1 - st.right) < mwh * 1.1;
    }).length;
    return ok / full.length > 0.45;
  })();

  const boxStats = new Map<number, { left: number; right: number }>();
  for (const bi of new Set(lineItems.filter((l) => l.box >= 0).map((l) => l.box))) {
    const ls = lineItems.filter((l) => l.box === bi);
    boxStats.set(bi, { left: median(ls.map((l) => l.x0)), right: percentile(ls.map((l) => l.x1), 0.85) });
  }
  // 8. Строки → абзацы.
  const paras: Para[] = [];
  let cur: Para | null = null;
  let prevInfo: LineInfo | null = null;
  const heads = lineItems.filter((l) => isHeadingLine(l, mwh)).map((l) => l.size);
  const maxHead = heads.length ? Math.max(...heads) : 1;
  const flush = () => {
    if (cur) paras.push(cur);
    cur = null;
  };
  const listIndents = new Map<string, number>(); // колонка → x начала текста пункта
  let figIdxNext = 0;
  void figIdxNext;
  for (const it of items) {
    if (it.kind === 'fig') {
      flush();
      paras.push({ type: 'fig', lines: [], box: -1, fig: it.idx, col: it.col });
      prevInfo = null;
      continue;
    }
    const l = it.info;
    const st0 = colStats.get(l.col)!;
    // Внутри рамки поля свои: текст сдвинут внутрь на поля рамки.
    const bs = l.box >= 0 ? boxStats.get(l.box) : undefined;
    const st = bs ? { left: bs.left, right: bs.right, width: Math.max(1, bs.right - bs.left) } : st0;
    const plain = l.text.replace(/\*\*/g, '');
    const gapUnit = pitch;
    const dy = prevInfo ? l.yb - prevInfo.yb : 0;
    const sameCol = prevInfo ? prevInfo.col === l.col : true;
    const marker = listMarker(l, mwh, lineItems);
    const heading = isHeadingLine(l, mwh);
    const caption = CAPTION_RE.test(plain) && l.toks.length <= 30;
    const boxTitle = BOX_TITLES.test(plain.replace(/[:!.]$/, '')) && l.toks.length <= 4;
    const formula = looksLikeFormula(plain) && !heading && (l.toks.length <= 14 && Math.abs((l.x0 + l.x1) / 2 - (st.left + st.right) / 2) < st.width * 0.2 || !/[А-Яа-яЁё]{4,}/.test(plain));
    const inBox = l.box >= 0;
    const prevBox = cur ? cur.box : -1;

    // Заголовок.
    if (heading) {
      const lvl: 'h2' | 'h3' = PARA_SIGN.test(plain) || /^(Глава|Тема|Раздел|Параграф|Урок|Лекция)\s+[\dIVXLC]+/i.test(plain) || l.size >= Math.max(1.3, maxHead * 0.88) ? 'h2' : 'h3';
      if (cur && (cur.type === 'h2' || cur.type === 'h3') && cur.type === lvl && Math.abs(prevInfo!.size - l.size) < 0.12 && dy < pitch * 1.6 * Math.max(1, l.size) && !/[.!?]$/.test(prevInfo!.text) && sameCol) cur.lines.push(l);
      else {
        flush();
        cur = { type: lvl, lines: [l], box: -1, col: l.col };
      }
      prevInfo = l;
      continue;
    }
    if (cur && (cur.type === 'h2' || cur.type === 'h3')) flush();

    if (boxTitle) {
      flush();
      cur = { type: 'p', lines: [l], box: inBox ? l.box : -2, boxTitle: true, col: l.col };
      prevInfo = l;
      continue;
    }
    if (formula) {
      flush();
      paras.push({ type: 'formula', lines: [l], box: inBox ? l.box : -1, col: l.col });
      prevInfo = l;
      continue;
    }
    if (caption) {
      flush();
      cur = { type: 'cap', lines: [l], box: -1, col: l.col };
      prevInfo = l;
      continue;
    }
    if (marker) {
      flush();
      cur = { type: 'li', lines: [l], box: inBox ? l.box : -1, marker: marker.text, col: l.col };
      listIndents.set(l.col, marker.textX0);
      prevInfo = l;
      continue;
    }

    // Обычная строка: продолжает текущий абзац или начинает новый.
    let newPara = !cur;
    if (cur && prevInfo) {
      const prevText = prevInfo.text.replace(/\*\*/g, '');
      const short = prevInfo.x1 < st.right - mwh * (justified ? 2.4 : 5.5);
      const prevEnds = SENT_END.test(prevText);
      const indented = l.x0 - st.left > mwh * 0.9 && l.x0 - st.left < st.width * 0.4;
      const gapBig = dy > gapUnit * 1.22 && sameCol;
      const gapHuge = dy > gapUnit * 1.9 && sameCol;
      if (cur.type === 'cap') newPara = !sameCol || gapBig || dy > gapUnit * 1.2 || !(l.size < 1.05) || (prevEnds && l.x0 < prevInfo.x0 - mwh) || short && prevEnds;
      else if (!sameCol) {
        // Абзац может перетекать из одной колонки в другую.
        newPara = !(!short && !prevEnds && /^[а-яё]/.test(plain) && !indented) || prevBox !== (inBox ? l.box : -1);
      } else if (prevBox !== (inBox ? l.box : -1) && !(cur.box === -2 && !inBox && !gapBig)) newPara = true;
      else if (cur.type === 'li') {
        const textX = listIndents.get(l.col) ?? st.left;
        const hanging = l.x0 >= textX - mwh * 0.9;
        newPara = !hanging || gapBig || (short && prevEnds && dy > gapUnit * 1.05) || l.x0 < textX - mwh * 1.1;
      } else if (cur.boxTitle) newPara = true;
      else if (gapHuge || gapBig) newPara = true;
      else if (indented && prevEnds) newPara = true;
      else if (indented && short) newPara = true;
      else if (short && prevEnds && (justified || /^[А-ЯЁA-Z0-9«"(]/.test(plain))) newPara = true;
      else if (short && !prevEnds && l.x0 - st.left > mwh * 0.9) newPara = true;
      else if (l.x0 < st.left - mwh * 1.2) newPara = true;
      else if (prevInfo.size >= 1.15 !== l.size >= 1.15) newPara = true;
      else if (!justified && prevEnds && l.x0 - prevInfo.x0 > mwh * 1.5) newPara = true;
      // Новый блок Tesseract и небольшая прибавка шага — тоже повод для нового абзаца.
      else if (l.line.block !== prevInfo.line.block && prevEnds && dy > gapUnit * 1.08) newPara = true;
    }
    if (newPara) {
      flush();
      cur = { type: 'p', lines: [l], box: inBox ? l.box : cur ? -1 : -1, col: l.col };
      if (cur.box === -1 && prevBox === -2 && !inBox) cur.box = -1;
    } else cur!.lines.push(l);
    prevInfo = l;
  }
  flush();

  // Последний шанс найти рамку по заголовку «Запомните» без обнаруженной заливки: рамка живёт до конца абзаца.
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p.boxTitle && p.box === -2 && paras[i + 1] && paras[i + 1].type === 'p' && paras[i + 1].box === -1 && paras[i + 1].col === p.col) paras[i + 1].box = -2;
  }

  // 9. Абзацы → Markdown.
  const doubts: LayoutDoubt[] = [];
  let doubtN = 0;
  const idOf = () => 'd' + doubtN++;
  const captions: string[] = [];
  const out: { kind: string; text: string; box: number; fig?: number }[] = [];
  const toksOf = (p: Para): Tok[][] => p.lines.map((l) => l.toks);
  const textOfPara = (p: Para) => {
    const rows = toksOf(p).map((toks) => toks);
    // Склейка переносов: последнее слово строки + первое слово следующей.
    const merged: Tok[][] = rows.map((r) => r.slice());
    for (let i = 0; i < merged.length - 1; i++) {
      const a = merged[i];
      const b = merged[i + 1];
      if (!a.length || !b.length) continue;
      const last = a[a.length - 1];
      const first = b[0];
      if (isSoftHyphen(last.text, first.text)) {
        a[a.length - 1] = { ...last, text: last.text.slice(0, -1) + first.text, bold: last.bold || first.bold, conf: Math.min(last.conf, first.conf), bbox: unionRect([last.bbox, first.bbox]) };
        merged[i + 1] = b.slice(1);
      }
    }
    return mergeBold(merged.map((toks) => renderToks(toks, doubts, idOf)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim());
  };
  for (const p of paras) {
    if (p.type === 'fig') {
      out.push({ kind: 'fig', text: '', box: -1, fig: p.fig });
      continue;
    }
    if (p.type === 'h2' || p.type === 'h3') {
      let text = textOfPara(p).replace(/\*\*/g, '');
      text = text.replace(/^(?:\$|S|&)\s?(?=\d{1,3}[.:]?\s)/, '§ ').replace(/^§\s*(?=\d)/, '§ ');
      out.push({ kind: p.type, text, box: -1 });
    } else if (p.type === 'formula') {
      const tex = formulaToTex(p.lines[0].text.replace(/\*\*/g, ''), p.lines[0].toks);
      out.push({ kind: 'formula', text: tex, box: p.box });
    } else if (p.type === 'cap') {
      out.push({ kind: 'cap', text: textOfPara(p).replace(/\*\*/g, '').replace(/⟦\?:\w+⟧/g, (m) => m), box: -1 });
    } else if (p.type === 'li') {
      out.push({ kind: 'li', text: (p.marker ?? '-') + ' ' + textOfPara({ ...p, lines: p.lines.map((l, i) => (i === 0 ? stripMarker(l) : l)) }), box: p.box });
    } else out.push({ kind: p.boxTitle ? 'boxTitle' : 'p', text: textOfPara(p), box: p.box });
  }

  // Подписи → к ближайшему рисунку (выше или ниже, не дальше пары абзацев).
  const keep: typeof out = [];
  for (let i = 0; i < out.length; i++) {
    const o = out[i];
    if (o.kind !== 'cap') {
      keep.push(o);
      continue;
    }
    let target = -1;
    // Сначала смотрим выше — рисунок над подписью, потом ниже.
    for (let j = i - 1; j >= Math.max(0, i - 2) && target < 0; j--) if (out[j].kind === 'fig' && !captions[out[j].fig!]) target = out[j].fig!;
    for (let j = i + 1; j <= Math.min(out.length - 1, i + 2) && target < 0; j++) if (out[j].kind === 'fig' && !captions[out[j].fig!]) target = out[j].fig!;
    if (target >= 0) captions[target] = o.text.replace(/⟦\?:(\w+)⟧/g, (_m, id: string) => `⟦?:${id}⟧`);
    else keep.push({ kind: 'italic', text: o.text, box: -1 });
  }

  const md: string[] = [];
  let boxOpen = false;
  for (let i = 0; i < keep.length; i++) {
    const o = keep[i];
    const next = keep[i + 1];
    if (o.kind === 'boxTitle') {
      const title = o.text.replace(/\*\*/g, '').replace(/[:!.]$/, '');
      // Заголовок рамки и первый абзац — вместе.
      if (next && (next.kind === 'p' || next.kind === 'li') && next.box === o.box) {
        md.push(`> **${title}:** ${next.text}`);
        i++;
        boxOpen = true;
      } else md.push(`> **${title}:**`);
      boxOpen = true;
      continue;
    }
    if (o.box >= 0 || (o.box === -2 && o.kind === 'p')) {
      // Внутри нарисованной рамки: первая короткая строка без точки — заголовок рамки.
      const prev = md[md.length - 1] ?? '';
      const first = !boxOpen || !prev.startsWith('>') || (keep[i - 1] && keep[i - 1].box !== o.box);
      if (first && o.kind === 'p' && o.text.replace(/\*\*/g, '').split(/\s+/).length <= 3 && !SENT_END.test(o.text.replace(/\*\*/g, '')) && next && next.box === o.box) {
        md.push(`> **${o.text.replace(/\*\*/g, '').replace(/[:!.]$/, '')}:** ${next.text}`);
        i++;
      } else if (o.kind === 'formula') md.push(`> $${o.text}$`);
      else if (!first && prev.startsWith('>')) md.push(`>\n> ${o.kind === 'li' ? o.text : o.text}`);
      else md.push(`> ${o.text}`);
      boxOpen = true;
      continue;
    }
    boxOpen = false;
    if (o.kind === 'h2') md.push('## ' + o.text);
    else if (o.kind === 'h3') md.push('### ' + o.text);
    else if (o.kind === 'fig') md.push(`⟦РИС:${o.fig}⟧`);
    else if (o.kind === 'formula') md.push(`$$${o.text}$$`);
    else if (o.kind === 'italic') md.push(`*${o.text.replace(/\*+/g, '')}*`);
    else if (o.kind === 'li') md.push(o.text);
    else md.push(o.text);
  }
  // Пункты списка идут подряд — одной группой без пустых строк.
  let markdown = md.join('\n\n');
  markdown = markdown.replace(/(\n\n)(?=(?:- |\d+[.)] )[^\n]*(?:\n\n(?:- |\d+[.)] ))?)/g, (m, _a, off: number) => {
    const before = markdown.slice(0, off);
    const prevLine = before.slice(before.lastIndexOf('\n') + 1);
    return /^(?:- |\d+[.)] )/.test(prevLine) ? '\n' : m;
  });
  markdown = fixOcrText(markdown);

  const allWords = lineItems.flatMap((l) => l.toks);
  const quality = { words: allWords.length, unsure: allWords.filter((w) => w.conf < 62).length, conf: allWords.length ? Math.round(allWords.reduce((n, w) => n + w.conf, 0) / allWords.length) : 0 };
  return { markdown, doubts, captions, detectedPage, quality };
}

export interface Gutter {
  x0: number;
  x1: number;
}

/** Вертикальные просветы между колонками: полосы, которые пересекают лишь отдельные полноширинные строки. */
export function findGutters(lines: OcrLine[], mh: number): Gutter[] {
  const body = lines.filter((l) => l.words.length >= 1);
  if (body.length < 10) return [];
  const xmin = Math.min(...body.map((l) => l.bbox.x0));
  const xmax = Math.max(...body.map((l) => l.bbox.x1));
  const step = 4;
  const n = Math.ceil((xmax - xmin) / step) + 1;
  const cov = new Int32Array(n);
  for (const l of body) {
    const mark = new Uint8Array(n);
    for (const w of l.words) for (let b = Math.floor((w.bbox.x0 - xmin) / step); b <= Math.floor((w.bbox.x1 - xmin) / step); b++) mark[Math.max(0, Math.min(n - 1, b))] = 1;
    for (let b = 0; b < n; b++) cov[b] += mark[b];
  }
  const maxCov = percentile([...cov], 0.95);
  const thr = Math.max(2, maxCov * 0.3);
  const out: Gutter[] = [];
  let b = 0;
  while (b < n) {
    if (cov[b] > thr) {
      b++;
      continue;
    }
    let e = b;
    while (e < n && cov[e] <= thr) e++;
    const g = { x0: xmin + b * step, x1: xmin + e * step };
    // Только внутри текста, не у краёв, и достаточно широкие.
    if (b > 0 && e < n && g.x1 - g.x0 >= mh * 1.1 && g.x0 - xmin > (xmax - xmin) * 0.12 && xmax - g.x1 > (xmax - xmin) * 0.12) {
      const allWords = body.flatMap((l) => l.words);
      const left = allWords.filter((w) => w.bbox.x1 <= g.x0 + mh * 0.3).length;
      const right = allWords.filter((w) => w.bbox.x0 >= g.x1 - mh * 0.3).length;
      if (left >= 14 && right >= 14) out.push(g);
    }
    b = e;
  }
  return out;
}

const sideOf = (gs: Gutter[], x: number) => gs.filter((g) => (g.x0 + g.x1) / 2 < x).length;

/** Строка, захватившая обе колонки, рвётся по просвету. */
export function splitAtGutters(lines: OcrLine[], gs: Gutter[]): OcrLine[] {
  if (!gs.length) return lines;
  const out: OcrLine[] = [];
  for (const l of lines) {
    const ws = [...l.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    let cur: OcrWord[] = [];
    const flush = () => {
      if (cur.length) out.push({ ...l, words: cur, bbox: unionRect(cur.map((w) => w.bbox)) });
      cur = [];
    };
    for (let i = 0; i < ws.length; i++) {
      const prev = ws[i - 1];
      if (prev) {
        const cut = gs.some((g) => {
          const mid = (g.x0 + g.x1) / 2;
          return prev.bbox.x1 <= mid && ws[i].bbox.x0 >= mid && ws[i].bbox.x0 - prev.bbox.x1 >= (g.x1 - g.x0) * 0.6;
        });
        if (cut) flush();
      }
      cur.push(ws[i]);
    }
    flush();
  }
  return out;
}

const baseY = (l: OcrLine) => {
  const base = l.base;
  const midX = (l.bbox.x0 + l.bbox.x1) / 2;
  return base && base.length === 4 ? base[1] + ((base[3] - base[1]) * (midX - base[0])) / Math.max(1, base[2] - base[0]) : l.bbox.y1 - (l.bbox.y1 - l.bbox.y0) * 0.22;
};

/** Обрывки одной строки (Tesseract рвёт строку по широким пробелам) собираем обратно — в пределах колонки. */
export function mergeRows(lines: OcrLine[], gs: Gutter[], mh: number): OcrLine[] {
  const sorted = [...lines].sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const used = new Set<OcrLine>();
  const out: OcrLine[] = [];
  for (const a of sorted) {
    if (used.has(a)) continue;
    used.add(a);
    let cur = a;
    let grown = true;
    while (grown) {
      grown = false;
      for (const b of sorted) {
        if (used.has(b)) continue;
        if (Math.abs(baseY(cur) - baseY(b)) > mh * 0.3) continue;
        if (Math.abs(rectH(cur.bbox) - rectH(b.bbox)) > mh * 0.8) continue;
        const gap = b.bbox.x0 - cur.bbox.x1;
        if (gap < -mh * 0.3 || gap > mh * 12) continue;
        if (sideOf(gs, cur.bbox.x1) !== sideOf(gs, b.bbox.x0)) continue;
        used.add(b);
        const words = [...cur.words, ...b.words].sort((x, y) => x.bbox.x0 - y.bbox.x0);
        cur = { ...cur, words, bbox: unionRect([cur.bbox, b.bbox]) };
        grown = true;
      }
    }
    out.push(cur);
  }
  return out;
}

function isHeadingLine(l: LineInfo, mwh: number): boolean {
  void mwh;
  const plain = l.text.replace(/\*\*/g, '');
  const words = l.toks.length;
  if (words > 14 || words === 0) return false;
  if (/^§\s*\d|^(?:\$|S|&)\s?\d{1,3}[.:]\s+\p{Lu}/u.test(plain) && words <= 14) return true;
  if (looksLikeFormula(plain) && !/[А-Яа-яЁё]{4,}/.test(plain)) return false;
  if (/^(Глава|Тема|Раздел|Параграф|Урок|Лекция)\s+[\dIVXLC]+/i.test(plain) && words <= 10) return true;
  if (BOX_TITLES.test(plain.replace(/[:!.]$/, ''))) return false;
  if (CAPTION_RE.test(plain)) return false;
  if (l.size >= 1.22 && !/[,;:]$/.test(plain) && plain.length <= 110) return true;
  if (l.boldShare >= 0.99 && words <= 9 && plain.length <= 70 && !/[.,;:!?]$/.test(plain) && l.size >= 0.95 && !/^[-–—•]/.test(plain)) return true;
  if (l.line.btype === 2 && words <= 8 && !/[.,;:]$/.test(plain) && l.size >= 1.05 && lettersOf(plain).length >= 4) return true;
  return false;
}

function stripMarker(l: LineInfo): LineInfo {
  const toks = l.toks.slice();
  if (toks.length && (toks[0].text.length <= 2 || BULLET_CLEAN.test(toks[0].text[0] ?? ''))) {
    const first = toks[0].text;
    if (/^(\d{1,2}[.)]|[а-яa-z]\))$/i.test(first) || toks[0].text.length === 1 || /^[•·●○▪■◦▫∙‣⁃®©°*«»-]$/.test(first)) toks.shift();
    else if (/^[•·●○▪■◦▫∙‣⁃]/.test(first)) toks[0] = { ...toks[0], text: first.slice(1) };
  }
  return { ...l, toks, text: toks.map((t) => t.text).join(' ') };
}

/** Начало пункта списка: маркер в начале строки. Возвращает текст маркера («-» или «1.») и x начала текста. */
function listMarker(l: LineInfo, mwh: number, all: LineInfo[]): { text: string; textX0: number } | null {
  const ws = l.line.words;
  if (ws.length < 2) return null;
  const f = ws[0];
  const t = f.text;
  const second = ws[1];
  const gap = second.bbox.x0 - f.bbox.x1;
  const fh = f.bbox.y1 - f.bbox.y0;
  const fw = f.bbox.x1 - f.bbox.x0;
  const num = /^(\d{1,2})[.)]$/.exec(t);
  if (num) return gap > mwh * 0.25 ? { text: `${num[1]}.`, textX0: second.bbox.x0 } : null;
  if (/^[а-яa-z]\)$/i.test(t) && gap > mwh * 0.25) return { text: `${t.slice(0, -1)})`, textX0: second.bbox.x0 };
  if (BULLET_CLEAN.test(t)) return { text: '-', textX0: second.bbox.x0 };
  // Склеенный маркер: «•нагревание».
  if (/^[•·●○▪■◦▫∙‣⁃]\S/.test(t)) return { text: '-', textX0: f.bbox.x0 + fw * 0.2 };
  if (BULLET_NOISE.test(t) && gap > mwh * 0.35 && fh <= mwh * 0.66 && fw <= mwh * 0.9) return { text: '-', textX0: second.bbox.x0 };
  if (DASHES.test(t) && gap > mwh * 0.3) {
    // Тире в начале строки — пункт списка, если так начинаются несколько строк колонки или выше идёт двоеточие.
    const i = all.indexOf(l);
    const mates = all.filter((x) => x.col === l.col && DASHES.test(x.line.words[0]?.text ?? '') && x.line.words.length > 1).length;
    const prev = all[i - 1];
    if (mates >= 2 || (prev && prev.col === l.col && /:$/.test(prev.text.replace(/\*\*/g, '')))) return { text: '-', textX0: second.bbox.x0 };
  }
  return null;
}

// ---------- Сборка конспекта ----------

/** Страницы → итоговый Markdown: метки [стр. N], рисунки, исправленные слова, склейка абзацев. */
export function assemble(pages: PageResult[], fixes: Record<string, string>): string {
  const parts: string[] = [];
  for (const p of pages) {
    let md = p.markdown.replace(/⟦\?:(\w+)⟧/g, (_m, id: string) => fixes[`${p.n}:${id}`] ?? p.doubts.find((d) => d.id === id)?.text ?? '');
    md = md.replace(/⟦РИС:(\d+)⟧/g, (_m, i: string) => {
      const f = p.figures[Number(i)];
      if (!f) return '';
      const cap = f.caption.replace(/[[\]]/g, '').replace(/⟦\?:(\w+)⟧/g, (_x, id: string) => fixes[`${p.n}:${id}`] ?? p.doubts.find((d) => d.id === id)?.text ?? '');
      // Картинка и подпись — одним абзацем: картинка в отдельном абзаце в конце конспекта ломает редактор.
      return `![${cap || 'Рисунок'}](${f.uri})\n*${(cap || 'Рисунок').replace(/\*+/g, '')}*`;
    });
    md = md.trim();
    if (!md) continue;
    // Абзац, разорванный между страницами, склеиваем.
    const prev = parts[parts.length - 1];
    const first = md.split('\n\n')[0];
    if (prev && /[а-яёa-z,\-–—]$/i.test(prev.trimEnd()) && /^[а-яё]/.test(first) && !/^[#>!*\-]/.test(first) && !prev.startsWith('[стр.') && !/^(#|>|!\[|\$\$|- |\d+\. )/.test(prev)) {
      const joined = /[а-яё]-$/i.test(prev.trimEnd()) ? prev.trimEnd().slice(0, -1) + first : prev.trimEnd() + ' ' + first;
      parts[parts.length - 1] = joined;
      md = md.slice(first.length).trim();
      parts.push(`[стр. ${p.n}]`);
      if (md) parts.push(md);
      continue;
    }
    parts.push(`[стр. ${p.n}]`);
    parts.push(md);
  }
  return neutralizeHtml(parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim());
}

/** Тексту из распознавания или ответа ИИ не место сырому HTML: «<» перед буквой экранируем (формулы и картинки не трогаем). */
export function neutralizeHtml(md: string): string {
  return outsideMasks(md, (part) => part.replace(/<(?=[A-Za-z!/?])/g, '&lt;'));
}

// ---------- Ответ ИИ ----------

export interface AiParsed {
  markdown: string;
  figures: { box: Box; caption: string }[];
  detectedPage?: number;
  empty: boolean;
}

/** Всё лишнее из ответа ИИ: HTML, ссылки, картинки, скрипты, обёртки ```. Остаётся только Markdown. */
export function sanitizeAiText(s: string): string {
  let t = s.replace(/\r\n?/g, '\n');
  // Целиком обёрнутый в ```…``` ответ.
  const fence = /^\s*```[a-zA-Z]*\n([\s\S]*?)\n?```\s*$/.exec(t);
  if (fence) t = fence[1];
  t = t.replace(/^\s*```(?:markdown|md|text)?[ \t]*\n/i, '').replace(/\n```\s*$/, '');
  // Блоки <script>/<style>/<iframe> уходят вместе с содержимым, остальные теги — только сами теги.
  t = t.replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/?[a-zA-Z][^>\n]{0,200}>/g, '');
  // Картинки и ссылки модели не нужны: оставляем подпись/текст.
  t = t.replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, '');
  t = t.replace(/\[([^\]\n]+)\]\((?!\s*mnema:)(?:[^()\n]|\([^()\n]*\))*\)/g, '$1');
  t = t.replace(/\[([^\]\n]+)\]:\s*\S+/g, (m, a: string) => (/^\[(РИСУНОК|СТРАНИЦА|ПУСТО)/.test(m) ? m : a));
  t = t.replace(/\b(?:javascript|vbscript|data|file):[^\s)]*/gi, '');
  return t;
}

/** Разбор ответа ИИ в чистый Markdown + рамки рисунков. Не падает на кривом ответе. */
export function parseAiMarkdown(raw: string): AiParsed {
  let md = sanitizeAiText(String(raw ?? '')).trim();
  if (/\[\[ПУСТО\]\]/.test(md) && md.replace(/\[\[ПУСТО\]\]/g, '').trim().length < 20) return { markdown: '', figures: [], empty: true };
  md = md.replace(/\[\[ПУСТО\]\]/g, '');
  let detectedPage: number | undefined;
  md = md.replace(/\[\[\s*СТРАНИЦА\s*[:№#]?\s*(\d{1,4})\s*\]\]/gi, (_m, n: string) => {
    detectedPage = Number(n);
    return '';
  });
  const figures: { box: Box; caption: string }[] = [];
  const RIS = /\[\[\s*РИСУНОК\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)[\s,;]+(-?\d+(?:[.,]\d+)?)[\s,;]+(-?\d+(?:[.,]\d+)?)[\s,;]+(-?\d+(?:[.,]\d+)?)\s*(?:[|:]\s*([^\]]*))?\]\]/gi;
  md = md.replace(RIS, (_m, a: string, b: string, c: string, d: string, cap?: string) => {
    let [x1, y1, x2, y2] = [a, b, c, d].map((v) => Number(v.replace(',', '.')));
    if (![x1, y1, x2, y2].every(Number.isFinite)) return '';
    // Модели иногда отдают доли 0–1 или проценты.
    const mx = Math.max(x1, y1, x2, y2);
    if (mx <= 1.001) [x1, y1, x2, y2] = [x1, y1, x2, y2].map((v) => v * 1000);
    else if (mx <= 100.5 && mx > 1.001 && Math.min(x1, y1, x2, y2) >= 0 && x2 - x1 <= 100 && mx <= 100) [x1, y1, x2, y2] = [x1, y1, x2, y2].map((v) => v * 10);
    const pad = 12;
    const lx = Math.max(0, Math.min(x1, x2, 1000) - pad);
    const ly = Math.max(0, Math.min(y1, y2, 1000) - pad);
    const hx = Math.min(1000, Math.max(x1, x2) + pad);
    const hy = Math.min(1000, Math.max(y1, y2) + pad);
    const box = { x: lx / 1000, y: ly / 1000, w: (hx - lx) / 1000, h: (hy - ly) / 1000 };
    if (box.w < 0.03 || box.h < 0.03) return '';
    const caption = (cap ?? '').replace(/[\n[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    figures.push({ box, caption });
    return `\n\n⟦РИС:${figures.length - 1}⟧\n\n`;
  });
  // Остатки наших меток, которые модель исказила, убираем.
  md = md.replace(/\[\[[^\]\n]{0,80}\]\]/g, '');
  md = md.replace(/\\\(([\s\S]+?)\\\)/g, (_m, t: string) => `$${t.trim()}$`).replace(/\\\[([\s\S]+?)\\\]/g, (_m, t: string) => `$$${t.trim()}$$`);
  md = normalizeAiBlocks(md);
  md = fixAiText(md);
  md = md.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { markdown: md, figures, detectedPage, empty: !md.replace(/⟦РИС:\d+⟧/g, '').trim() };
}

export type AiVerdict = { ok: true; parsed: AiParsed } | { ok: false; why: string; empty?: boolean };

const AI_REFUSAL = /(^|\s)(не могу|к сожалению|извините|я не вижу|не удалось|sorry|i can(?:no|')t|unable to|as an ai|i'm unable)/i;

/**
 * Годится ли ответ ИИ как страница: пустой, отказ, чужой язык, JSON/HTML вместо Markdown, зацикленные повторы,
 * рассыпавшаяся разметка — всё это «кривой ответ», по нему лучше прочитать страницу без интернета.
 */
export function judgeAiAnswer(raw: string): AiVerdict {
  const text = String(raw ?? '');
  const parsed = parseAiMarkdown(text);
  if (parsed.empty && /\[\[ПУСТО\]\]/.test(text)) return { ok: false, why: 'ИИ не нашёл на фото текста учебника.', empty: true };
  const plain = parsed.markdown.replace(/⟦РИС:\d+⟧/g, '').trim();
  if (!plain && !parsed.figures.length) return { ok: false, why: 'ИИ вернул пустой ответ.' };
  if (!plain) return { ok: true, parsed };
  if (plain.length < 200 && AI_REFUSAL.test(plain) && !/[.!?]\s*[А-ЯЁ]/.test(plain.slice(60))) return { ok: false, why: 'ИИ ответил не по делу.' };
  const t = text.trim();
  if (/^[{[]/.test(t) && /"\s*:\s*/.test(t.slice(0, 200))) return { ok: false, why: 'ИИ вернул данные вместо текста страницы.' };
  if ((t.match(/<\/?[a-z][^>]*>/gi) ?? []).length > 6 && /^<(!doctype|html|body|div|p)\b/i.test(t)) return { ok: false, why: 'ИИ вернул веб-страницу вместо текста.' };
  const letters = plain.replace(/\$\$?[^$]*\$\$?/g, '').replace(/[^\p{L}]/gu, '');
  if (letters.length > 150) {
    const cyr = (letters.match(/[А-Яа-яЁё]/g) ?? []).length;
    if (cyr / letters.length < 0.35) return { ok: false, why: 'ИИ ответил не по-русски или выдал мусор.' };
  }
  const lines = plain.split('\n').map((l) => l.trim()).filter((l) => l.length > 3);
  if (lines.length >= 6) {
    const counts = new Map<string, number>();
    for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
    const top = Math.max(...counts.values());
    if (top >= 5 || lines.length - counts.size > lines.length * 0.5) return { ok: false, why: 'ИИ зациклился и повторяет одно и то же.' };
  }
  const oddBold = lines.filter((l) => ((l.match(/\*\*/g) ?? []).length & 1) === 1).length;
  if (oddBold >= 4 && oddBold > lines.length * 0.35) return { ok: false, why: 'У ИИ рассыпалась разметка.' };
  if (plain.length > 4000 && !/\n\n/.test(plain) && !/^#{2,3} /m.test(plain)) return { ok: false, why: 'ИИ выдал страницу одной сплошной строкой.' };
  return { ok: true, parsed };
}

/** Единый вид блоков: заголовки «## », рамки «> **Запомните:** …», списки «- », без двойных пробелов. */
export function normalizeAiBlocks(md: string): string {
  const lines = md.split('\n').map((ln) => {
    let l = ln.replace(/\s+$/, '');
    // Заголовок первого уровня → «##» (в теме заголовок первого уровня уже есть).
    l = l.replace(/^#\s+/, '## ').replace(/^#{4,}\s+/, '### ');
    // Рамка: «Запомните: …» без «>» — тоже рамка.
    if (!/^>/.test(l) && /^\**(Запомни(те)?|Это важно|Важно|Вывод(ы)?|Главное|Обрати(те)? внимание|Правило)\**\s*[:!]/i.test(l.trim())) l = '> ' + l.trim().replace(/^\**([^*:!]+?)\**\s*[:!]\s*/, '**$1:** ');
    // Списки: «•», «*», «–» → «-».
    l = l.replace(/^(\s*)[•●▪■◦·]\s+/, '$1- ').replace(/^(\s*)\*\s+(?!\*)/, '$1- ').replace(/^(\s*)[–—]\s+(?=\S)/, (m, sp: string) => (/^[–—]\s+[А-ЯЁA-Z]/.test(m + l.slice(m.length)) ? m : `${sp}- `));
    return l;
  });
  return lines.join('\n');
}

/** Лёгкая правка ИИ-текста: пробелы, тире и кавычки; формулы не трогаем. */
export function fixAiText(md: string): string {
  return outsideMasks(md, (p) =>
    p
      .replace(/(?<=[\p{L}\d.,;:)»\]*]) [-–−] (?=[\p{L}\d«(\[*])/gu, ' — ')
      .replace(/(\b\d{3,4})-(\d{2,4}\b)/g, '$1–$2')
      .replace(/"([^"\n]{1,120})"/g, '«$1»')
      .replace(/[ \t]{2,}/g, ' ')
  );
}
