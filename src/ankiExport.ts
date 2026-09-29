// Экспорт в Anki (.apkg): колоды «Мнема::Предмет::Тема», типы карточек Anki, прогресс повторений.
import { zipSync, strToU8 } from 'fflate';
import type { SqlJsStatic } from 'sql.js';
import { itemKey } from './srs';
import { sortedSubjects } from './store';
import type { AppData, Card } from './types';

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

const CSS = '.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }\n.cloze { font-weight: bold; color: blue; }\n.nightMode .cloze { color: lightblue; }';

const field = (name: string, ord: number) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] });
const tmpl = (name: string, ord: number, qfmt: string, afmt: string) => ({ name, ord, qfmt, afmt, did: null, bqfmt: '', bafmt: '' });

function models(now: number) {
  const base = { mod: now, usn: -1, sortf: 0, did: 1, css: CSS, latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n', latexPost: '\\end{document}', tags: [], vers: [] };
  return {
    basic: { ...base, id: 1700000000001, name: 'Мнема: вопрос — ответ', type: 0, flds: [field('Front', 0), field('Back', 1)], tmpls: [tmpl('Card 1', 0, '{{Front}}', '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}')], req: [[0, 'any', [0]]] },
    reverse: {
      ...base,
      id: 1700000000002,
      name: 'Мнема: в обе стороны',
      type: 0,
      flds: [field('Front', 0), field('Back', 1)],
      tmpls: [tmpl('Card 1', 0, '{{Front}}', '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}'), tmpl('Card 2', 1, '{{Back}}', '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}')],
      req: [
        [0, 'any', [0]],
        [1, 'any', [1]]
      ]
    },
    typing: { ...base, id: 1700000000003, name: 'Мнема: ввести ответ', type: 0, flds: [field('Front', 0), field('Back', 1)], tmpls: [tmpl('Card 1', 0, '{{Front}}\n\n{{type:Back}}', '{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}')], req: [[0, 'any', [0]]] },
    cloze: { ...base, id: 1700000000004, name: 'Мнема: с пропуском', type: 1, flds: [field('Text', 0), field('Back Extra', 1)], tmpls: [tmpl('Cloze', 0, '{{cloze:Text}}', '{{cloze:Text}}<br>\n{{Back Extra}}')], req: [[0, 'any', [0]]] }
  };
}

const DCONF = {
  '1': {
    id: 1, name: 'Default', mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, dyn: false,
    new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 },
    rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
    lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 }
  }
};

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Markdown Мнемы → HTML поля Anki. */
export function toAnkiHtml(md: string): string {
  const math: string[] = [];
  let s = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, t: string) => (math.push(`\\[${t.trim()}\\]`), `\u0000${math.length - 1}\u0000`));
  s = s.replace(/\$([^$\n]+?)\$/g, (_, t: string) => (math.push(`\\(${t.trim()}\\)`), `\u0000${math.length - 1}\u0000`));
  const imgs: string[] = [];
  s = s.replace(/!\[[^\]]*\]\((data:image\/[^)]+)\)/g, (_, u: string) => (imgs.push(`<img src="${u}">`), `\u0001${imgs.length - 1}\u0001`));
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>').replace(/==(.+?)==/g, '<u>$1</u>');
  s = s.replace(/\n/g, '<br>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => esc(math[Number(i)]));
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i: string) => imgs[Number(i)]);
  return s;
}

/** Пропуски Мнемы {{слово}} / {{c2::слово::подсказка}} → {{c1::…}} Anki. */
export function toAnkiCloze(front: string): string {
  let n = 0;
  const used = new Set<number>();
  for (const m of front.matchAll(/\{\{c(\d+)::/g)) used.add(Number(m[1]));
  return front.replace(/\{\{(?!c\d+::)([\s\S]+?)\}\}/g, (_, inner: string) => {
    do n++;
    while (used.has(n));
    return `{{c${n}::${inner}}}`;
  });
}

/** Номера пропусков карточки (ord Anki) по порядку. */
function ords0(c: Card): number[] {
  return [...new Set([...toAnkiCloze(c.front).matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]) - 1))].sort((a, b) => a - b);
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

async function csum(s: string): Promise<number> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(stripHtml(s))));
  return ((h[0] << 24) >>> 0) + (h[1] << 16) + (h[2] << 8) + h[3];
}

function guid(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~';
  let g = '';
  const r = crypto.getRandomValues(new Uint8Array(10));
  for (const b of r) g += chars[b % chars.length];
  return g;
}

export interface AnkiExportOptions {
  subjectIds?: string[]; // какие предметы (по умолчанию все)
  progress: boolean; // перенести интервалы повторений
}

export async function buildApkg(data: AppData, SQL: SqlJsStatic, opts: AnkiExportOptions): Promise<{ bytes: Uint8Array; notes: number; cards: number }> {
  const db = new SQL.Database();
  db.run(SCHEMA);
  const nowMs = Date.now();
  const now = Math.floor(nowMs / 1000);
  const crtDate = new Date();
  crtDate.setHours(4, 0, 0, 0);
  const crt = Math.floor(crtDate.getTime() / 1000) - 3650 * 86400; // коллекция «создана» давно — сроки считаются от этой даты
  const M = models(now);
  const decks: Record<string, unknown> = {};
  const deckBase = { mod: now, usn: -1, desc: '', dyn: 0, conf: 1, collapsed: false, browserCollapsed: false, newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0], extendNew: 10, extendRev: 50 };
  decks['1'] = { ...deckBase, id: 1, name: 'Default' };
  let deckId = 1700000000100;
  const deckFor = new Map<string, number>();
  const ensureDeck = (name: string) => {
    if (deckFor.has(name)) return deckFor.get(name)!;
    const id = ++deckId;
    decks[String(id)] = { ...deckBase, id, name };
    deckFor.set(name, id);
    return id;
  };
  ensureDeck('Мнема');

  const subjects = sortedSubjects(data).filter((s) => !opts.subjectIds || opts.subjectIds.includes(s.id));
  const topicPath = (id: string): string[] => {
    const out: string[] = [];
    for (let t = data.topics.find((x) => x.id === id); t; t = data.topics.find((x) => x.id === t!.parentId)) out.unshift(t.name.replace(/::/g, ':'));
    return out;
  };
  const insNote = db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const insCard = db.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insRev = db.prepare('INSERT INTO revlog VALUES (?,?,?,?,?,?,?,?,?)');
  let nid = nowMs * 1000;
  let cid = nowMs * 1000;
  let pos = 0;
  let nNotes = 0;
  let nCards = 0;
  const dayNum = (iso: string) => Math.max(0, Math.round((new Date(iso).getTime() / 1000 - crt) / 86400));

  const cardRow = (c: Card, ord: number, did: number, noteId: number) => {
    const st = opts.progress ? data.states[itemKey(c.id, c.type === 'cloze' ? ords0(c).indexOf(ord) : ord)] : undefined;
    let type = 0;
    let queue = 0;
    let due = pos;
    let ivl = 0;
    let factor = 0;
    if (st && st.state === 2) {
      type = 2;
      queue = 2;
      due = dayNum(st.due);
      ivl = Math.max(1, st.scheduled_days || Math.round(st.stability));
      factor = Math.round(Math.min(3500, Math.max(1300, 2500 + (5 - st.difficulty) * 150)));
    }
    insCard.run([++cid, noteId, did, ord, now, -1, type, queue, due, ivl, factor, st?.reps ?? 0, st?.lapses ?? 0, 0, 0, 0, 0, '']);
    nCards++;
    // Короткая история ответов: Anki покажет её в статистике, а сроки возьмёт из карточки
    if (st && st.state === 2) {
      const last = new Date(st.last_review ?? Date.now()).getTime();
      insRev.run([last + (nCards % 997), cid, -1, 3, ivl, Math.max(1, Math.round(ivl / 2.5)), factor, 8000, 1]);
    }
  };

  for (const s of subjects) {
    const topics = data.topics.filter((t) => t.subjectId === s.id);
    for (const t of topics) {
      const cards = data.cards.filter((c) => c.topicId === t.id);
      if (!cards.length) continue;
      const deck = ensureDeck(['Мнема', s.name.replace(/::/g, ':'), ...(t.kind === 'rule' ? ['Правила'] : []), ...topicPath(t.id)].join('::'));
      for (const c of cards) {
        pos++;
        const why = c.why ? `<br><br><i>${toAnkiHtml(c.why)}</i>` : '';
        let mid: number;
        let flds: string[];
        let ords: number[];
        if (c.type === 'cloze') {
          mid = M.cloze.id;
          const text = toAnkiHtml(toAnkiCloze(c.front));
          flds = [text, toAnkiHtml(c.back || '') + why];
          ords = [...new Set([...text.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]) - 1))].sort((a, b) => a - b);
        } else if (c.type === 'reverse') {
          mid = M.reverse.id;
          flds = [toAnkiHtml(c.front), toAnkiHtml(c.back) + why];
          ords = [0, 1];
        } else if (c.type === 'typing') {
          mid = M.typing.id;
          flds = [toAnkiHtml(c.front) + why, c.back.split('|')[0].trim()];
          ords = [0];
        } else {
          mid = M.basic.id;
          flds = [toAnkiHtml(c.front), toAnkiHtml(c.back) + why];
          ords = [0];
        }
        const noteId = ++nid;
        const tags = ` Мнема ${s.name.replace(/\s+/g, '_')} ${t.important ? 'важное ' : ''}`;
        insNote.run([noteId, guid(), mid, now, -1, tags, flds.join('\u001f'), stripHtml(flds[0]), await csum(flds[0]), 0, '']);
        nNotes++;
        for (const o of ords) cardRow(c, o, deck, noteId);
      }
    }
  }
  insNote.free();
  insCard.free();
  insRev.free();
  const conf = { nextPos: pos + 1, estTimes: true, activeDecks: [1], sortType: 'noteFld', timeLim: 0, sortBackwards: false, addToCur: true, curDeck: 1, newBury: true, newSpread: 0, dueCounts: true, curModel: String(M.basic.id), collapseTime: 1200 };
  const modelsJson = Object.fromEntries(Object.values(M).map((m) => [String(m.id), m]));
  db.run('INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)', [crt, nowMs, nowMs, JSON.stringify(conf), JSON.stringify(modelsJson), JSON.stringify(decks), JSON.stringify(DCONF), '{}']);
  const file = db.export();
  db.close();
  const bytes = zipSync({ 'collection.anki2': file, media: strToU8('{}') }, { level: 6 });
  return { bytes, notes: nNotes, cards: nCards };
}
