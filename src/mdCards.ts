// Карточки, словари и стихи темы — в открытой Markdown-разметке (и обратно). Нужна и экспорту «Всё в папку Markdown»,
// и импорту такой папки. Формат читаем глазами и понятен плагину Spaced Repetition для Obsidian:
//
//   ## Карточки
//   ### Вопрос — ответ
//   Вопрос::Ответ
//   > Почему: объяснение
//   ### В обе стороны
//   Термин:::Определение
//   ### Пропуски
//   Ток {{c1::I}} измеряют в амперах
//   ### Ввод ответа
//   Столица Франции::Париж|париж
//   ### Задачи
//   Найди ток при U={U=10..220} В и R=10 Ом::{=U/R}
//
// Перевод строки внутри карточки — «<br>». Словари — таблицы под «## Название словаря», стихи — «## Стихи».
import { csvRow } from './mdPortable';
import type { CardType, Poem, StudyList } from './types';

export interface PlainCard {
  type: CardType;
  front: string;
  back: string;
  why?: string;
}

const SECTIONS: { type: CardType; title: string }[] = [
  { type: 'basic', title: 'Вопрос — ответ' },
  { type: 'reverse', title: 'В обе стороны' },
  { type: 'cloze', title: 'Пропуски' },
  { type: 'typing', title: 'Ввод ответа' },
  { type: 'problem', title: 'Задачи' }
];
export const CARDS_HEADING = 'Карточки';
export const POEMS_HEADING = 'Стихи';

const enc = (s: string) => String(s ?? '').replace(/\r\n?/g, '\n').trim().replace(/\n/g, '<br>');
const dec = (s: string) => s.replace(/<br\s*\/?>/gi, '\n');
const encFront = (s: string) => enc(s).replace(/::/g, ':\\:');
const decFront = (s: string) => dec(s).replace(/:\\:/g, '::');

/** Раздел «## Карточки» (пустая строка, если карточек нет). */
export function emitCards(cards: PlainCard[]): string {
  if (!cards.length) return '';
  const out: string[] = [`## ${CARDS_HEADING}`, ''];
  for (const sec of SECTIONS) {
    const list = cards.filter((c) => c.type === sec.type);
    if (!list.length) continue;
    out.push(`### ${sec.title}`, '');
    for (const c of list) {
      if (sec.type === 'cloze') {
        out.push(enc(c.front));
        if (c.back.trim()) out.push(`> Ответ: ${enc(c.back)}`);
      } else out.push(`${encFront(c.front)}${sec.type === 'reverse' ? ':::' : '::'}${enc(c.back)}`);
      if (c.why?.trim()) out.push(`> Почему: ${enc(c.why)}`);
      out.push('');
    }
  }
  return out.join('\n');
}

/** Раздел «## Карточки» из текста: карточки и текст без этого раздела. */
export function parseCards(body: string): { cards: PlainCard[]; rest: string } {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${CARDS_HEADING}\\s*$`).test(l));
  if (start < 0) return { cards: [], rest: body };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const cards: PlainCard[] = [];
  let type: CardType | null = null;
  for (const raw of lines.slice(start + 1, end)) {
    const line = raw.replace(/\s+$/, '');
    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) {
      type = SECTIONS.find((s) => s.title === h[1])?.type ?? null;
      continue;
    }
    if (!line.trim() || !type) continue;
    const last = cards[cards.length - 1];
    const note = /^>\s*(Почему|Ответ):\s*(.*)$/.exec(line);
    if (note && last) {
      if (note[1] === 'Почему') last.why = dec(note[2]);
      else last.back = dec(note[2]);
      continue;
    }
    if (type === 'cloze') cards.push({ type, front: dec(line), back: '' });
    else {
      const sep = type === 'reverse' ? ':::' : '::';
      const i = type === 'reverse' ? line.indexOf(':::') : line.search(/::(?!:)/);
      if (i < 0) continue; // строка без разделителя — не карточка
      cards.push({ type, front: decFront(line.slice(0, i)), back: dec(line.slice(i + sep.length)) });
    }
  }
  return { cards, rest: [...lines.slice(0, start), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n') };
}

// ---------- Словари ----------

const cell = (x: string) => String(x ?? '').replace(/\r\n?/g, '\n').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '<br>');

/** Словарь темы таблицей под заголовком «## Название». */
export function emitList(list: StudyList, rows: { front: string; back: string; why?: string }[]): string {
  return [`## ${list.title.replace(/\s+/g, ' ').trim() || 'Список'}`, '', `| ${list.cols.map(cell).join(' | ')} |`, '|---|---|---|', ...rows.map((r) => `| ${cell(r.front)} | ${cell(r.back)} | ${cell(r.why ?? '')} |`), ''].join('\n');
}

function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '\\' && i + 1 < t.length) {
      cur += t[i + 1] === '|' ? '|' : t[i + 1] === '\\' ? '\\' : ch + t[i + 1];
      i++;
    } else if (ch === '|') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.map(dec);
}

/** Таблица под заголовком «## title»: строки словаря и текст без неё. */
export function parseListTable(body: string, title: string): { rows: { front: string; back: string; why?: string }[]; rest: string } | null {
  const lines = body.split('\n');
  const want = title.replace(/\s+/g, ' ').trim() || 'Список';
  const start = lines.findIndex((l) => {
    const m = /^##\s+(.+?)\s*$/.exec(l);
    return m !== null && m[1] === want;
  });
  if (start < 0) return null;
  let i = start + 1;
  while (i < lines.length && !lines[i].trim()) i++;
  if (!lines[i]?.trim().startsWith('|')) return null;
  const head = i;
  i += 2; // шапка и «|---|---|»
  const rows: { front: string; back: string; why?: string }[] = [];
  for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    const c = splitRow(lines[i]);
    if (c[0] || c[1]) rows.push({ front: c[0] ?? '', back: c[1] ?? '', ...(c[2] ? { why: c[2] } : {}) });
  }
  void head;
  return { rows, rest: [...lines.slice(0, start), ...lines.slice(i)].join('\n').replace(/\n{3,}/g, '\n\n') };
}

// ---------- Стихи ----------

/** Раздел «## Стихи»: название, автор, текст в блоке кода (строки и строфы сохраняются). Прогресс заучивания не переносится. */
export function emitPoems(poems: Pick<Poem, 'title' | 'author' | 'text' | 'chunk'>[]): string {
  if (!poems.length) return '';
  const out: string[] = [`## ${POEMS_HEADING}`, ''];
  for (const p of poems) {
    out.push(`### ${(p.title || 'Без названия').replace(/\s+/g, ' ').trim()}`, '');
    if (p.author) out.push(`Автор: ${p.author.replace(/\n/g, ' ')}`, '');
    out.push('```text', p.text.replace(/\r\n?/g, '\n').replace(/```/g, "'''"), '```', '');
  }
  return out.join('\n');
}

export function parsePoems(body: string): { poems: { title: string; author?: string; text: string }[]; rest: string } {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${POEMS_HEADING}\\s*$`).test(l));
  if (start < 0) return { poems: [], rest: body };
  let end = lines.length;
  let fence = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^```/.test(lines[i])) fence = !fence;
    if (!fence && /^#{1,2}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const poems: { title: string; author?: string; text: string }[] = [];
  let cur: { title: string; author?: string; text: string } | null = null;
  let inFence = false;
  const text: string[] = [];
  for (const line of lines.slice(start + 1, end)) {
    if (!inFence) {
      const h = /^###\s+(.+?)\s*$/.exec(line);
      if (h) {
        cur = { title: h[1], text: '' };
        poems.push(cur);
        continue;
      }
      const a = /^Автор:\s*(.+)$/.exec(line);
      if (a && cur) cur.author = a[1].trim();
      else if (/^```/.test(line) && cur) {
        inFence = true;
        text.length = 0;
      }
    } else if (/^```/.test(line)) {
      inFence = false;
      if (cur) cur.text = text.join('\n');
    } else text.push(line);
  }
  return { poems: poems.filter((p) => p.text.trim()), rest: [...lines.slice(0, start), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n') };
}

// ---------- Все карточки одним файлом ----------

export const TYPE_LABEL: Record<CardType, string> = { basic: 'Вопрос — ответ', reverse: 'В обе стороны', cloze: 'С пропуском', typing: 'Ввод ответа', problem: 'Задача', occlusion: 'Закрыть часть картинки' };

export interface FlatCard extends PlainCard {
  subject: string;
  topic: string;
}

/** CSV для Anki, Quizlet, Excel: Предмет, Тема, Тип, Вопрос, Ответ, Почему. UTF-8 с меткой BOM, чтобы Excel не ломал кириллицу. */
export function cardsToCsv(cards: FlatCard[]): string {
  const lines = [csvRow(['Предмет', 'Тема', 'Тип', 'Вопрос', 'Ответ', 'Почему']), ...cards.map((c) => csvRow([c.subject, c.topic, TYPE_LABEL[c.type], c.front, c.back, c.why ?? '']))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Один читаемый файл со всеми карточками: заголовок на предмет, на тему и разделы по типам. */
export function cardsToMarkdown(cards: FlatCard[]): string {
  const out: string[] = ['# Карточки', ''];
  let subj = '';
  let topic = '';
  for (const c of cards) {
    if (c.subject !== subj) {
      subj = c.subject;
      topic = '';
      out.push(`## ${subj}`, '');
    }
    if (c.topic !== topic) {
      topic = c.topic;
      out.push(`### ${topic}`, '');
    }
    const sep = c.type === 'reverse' ? ':::' : '::';
    out.push(c.type === 'cloze' ? enc(c.front) : `${encFront(c.front)}${sep}${enc(c.back)}`);
    if (c.why?.trim()) out.push(`> Почему: ${enc(c.why)}`);
    out.push('');
  }
  return out.join('\n');
}
