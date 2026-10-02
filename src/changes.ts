// Файл изменений: нейросеть (или сам ученик) пишет JSON со списком действий — «создай предмет»,
// «замени конспект темы», «добавь термины», «удали карточку»… Мнема показывает, что поменяется,
// и применяет одним нажатием (с кнопкой «Вернуть»). Всё находится по названиям, а не по внутренним номерам,
// поэтому такой файл легко написать руками или попросить у любой нейросети.
import { looksLikeMnemaText, MNEMA_TEXT_GUIDE, parseMnemaText, splitDash, toMnemaText } from './mnemaText';
import { autoChunk } from './poem';
import { noteEdit } from './noteText';
import { itemKey, itemOrds } from './srs';
import { LIST_PRESETS } from './store';
import type { AppData, Card, CardType, Folder, Homework, ListKind, ListMode, Poem, StudyList, Subject, Topic } from './types';

export const CHANGES_MARK = 'mnema-changes';

/** Одно действие из файла. Поле do — что сделать, остальные — зависят от действия (см. CHANGES_GUIDE). */
export type Change = { do: string; [k: string]: unknown };

export interface ChangePack {
  title?: string;
  changes: Change[];
  /** Что не удалось прочитать в самом файле (строки Мнема-текста без «::» и т. п.). */
  warnings?: string[];
}

export interface PlanLine {
  kind: 'add' | 'edit' | 'del';
  text: string;
}

export interface Plan {
  title?: string;
  data: AppData;
  lines: PlanLine[];
  warnings: string[];
  /** Какие темы и правила затронуты — для наглядного предпросмотра «как будет». */
  touched: string[];
}

// ---------- Чтение файла ----------

/** Разобрать текст файла. Понимает и ответ нейросети целиком: достаёт JSON из ```json … ```, прощает висячие запятые. */
/** Текст внутри рамки ```…``` (или ````…````). Закрывающая рамка — ПОСЛЕДНЯЯ строка из стольких же обратных кавычек:
 *  внутри конспекта бывает свой код в ```, и на нём ответ обрываться не должен. */
function fencedBody(src: string): string | null {
  const open = /^(`{3,})[^\n`]*\n/m.exec(src);
  if (!open) return null;
  const lines = src.slice(open.index + open[0].length).split('\n');
  const close = new RegExp('^\\s*`{' + open[1].length + ',}\\s*$');
  for (let i = lines.length - 1; i >= 0; i--) if (close.test(lines[i])) return lines.slice(0, i).join('\n');
  return null;
}

export function parseChangeFile(text: string): { ok: true; pack: ChangePack } | { ok: false; error: string } {
  // Настоящий файл изменений — десятки килобайт; огромный файл только подвесит окно.
  if (text.length > 3_000_000) return { ok: false, error: 'Файл слишком большой — раздели его на несколько поменьше' };
  let src = text.replace(/^﻿/, '').trim();
  // Простой формат (@предмет, @тема, @карточки…) — его нейросети пишут быстрее и без ошибок.
  if (looksLikeMnemaText(src)) {
    const fenced = fencedBody(src);
    const pack = parseMnemaText(fenced !== null && looksLikeMnemaText(fenced) ? fenced : src);
    return pack.changes.length ? { ok: true, pack } : { ok: false, error: 'В файле нет ни одного изменения — проверь строки «@предмет» и «@тема»' };
  }
  const fence = /```(?:json|JSON)?\s*\n([\s\S]*?)```/.exec(src);
  if (fence) src = fence[1].trim();
  else {
    // Текст вокруг JSON («Вот твой файл: {…} Удачи!») — берём от первой скобки до последней.
    const a = src.search(/[[{]/);
    const b = Math.max(src.lastIndexOf('}'), src.lastIndexOf(']'));
    if (a > 0 && b > a) src = src.slice(a, b + 1);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(src);
  } catch {
    try {
      raw = JSON.parse(src.replace(/,\s*([}\]])/g, '$1').replace(/[“”«»]/g, (q) => (q === '«' || q === '»' ? q : '"')));
    } catch (e) {
      return { ok: false, error: 'Это не похоже на файл изменений Мнемы: нужны строки «@предмет …», «@тема …». (Как JSON тоже не читается: ' + String((e as Error).message).slice(0, 100) + ')' };
    }
  }
  const obj = raw as { changes?: unknown; title?: unknown } | unknown[];
  const list = Array.isArray(obj) ? obj : Array.isArray((obj as { changes?: unknown }).changes) ? ((obj as { changes: unknown[] }).changes) : null;
  if (!list) return { ok: false, error: 'Это не похоже на файл изменений Мнемы: нужны строки «@предмет …», «@тема …» (или JSON с полем "changes")' };
  const changes = list.filter((c): c is Change => Boolean(c) && typeof c === 'object' && typeof (c as Change).do === 'string');
  if (!changes.length) return { ok: false, error: 'Список изменений пустой — нечего применять' };
  const title = !Array.isArray(obj) && typeof (obj as { title?: unknown }).title === 'string' ? ((obj as { title: string }).title) : undefined;
  return { ok: true, pack: { title, changes } };
}

// ---------- Помощники ----------

/** Сравнение названий: без регистра, ё = е, лишние пробелы и кавычки не важны. */
export function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
/** Поиск в словаре только по его собственным ключам: «constructor», «__proto__» и т. п. — не находятся. */
function pick<T>(dict: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
}
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);
const q = (s: string) => `«${s.length > 60 ? s.slice(0, 57) + '…' : s}»`;

const COLOR_NAMES: Record<string, string> = {
  красный: '#D64545', оранжевый: '#E07A2E', желтый: '#D6A21E', зеленый: '#2F9E5B', салатовый: '#7DB343', бирюзовый: '#1C9A8E', голубой: '#2E9BD6', синий: '#3A5BD9', фиолетовый: '#7B4FD6', розовый: '#D6457E', коричневый: '#8A5A3C', серый: '#6B7280',
  red: '#D64545', orange: '#E07A2E', yellow: '#D6A21E', green: '#2F9E5B', teal: '#1C9A8E', blue: '#3A5BD9', purple: '#7B4FD6', violet: '#7B4FD6', pink: '#D6457E', brown: '#8A5A3C', gray: '#6B7280', grey: '#6B7280'
};
const PALETTE = ['#3A5BD9', '#2F9E5B', '#D64545', '#E07A2E', '#7B4FD6', '#1C9A8E', '#D6457E', '#D6A21E', '#2E9BD6', '#8A5A3C'];
function color(v: unknown): string | undefined {
  const s = str(v)?.trim();
  if (!s) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + s.slice(1).split('').map((c) => c + c).join('')).toUpperCase();
  return pick(COLOR_NAMES, norm(s));
}

const CARD_TYPES: Record<string, CardType> = {
  basic: 'basic', 'вопрос-ответ': 'basic', вопрос: 'basic', обычная: 'basic',
  reverse: 'reverse', 'в обе стороны': 'reverse', двусторонняя: 'reverse',
  cloze: 'cloze', пропуск: 'cloze', пропуски: 'cloze',
  typing: 'typing', ввод: 'typing', 'ввод ответа': 'typing',
  problem: 'problem', задача: 'problem'
};
const cardType = (v: unknown, front: string): CardType => pick(CARD_TYPES, norm(v)) ?? (/\{\{.+?\}\}/.test(front) ? 'cloze' : 'basic');

const LIST_KINDS: Record<string, ListKind> = { vocab: 'vocab', словарь: 'vocab', слова: 'vocab', terms: 'terms', термины: 'terms', dates: 'dates', даты: 'dates', formulas: 'formulas', формулы: 'formulas', custom: 'custom', список: 'custom', свой: 'custom' };
const LIST_MODES: Record<string, ListMode> = { basic: 'basic', reverse: 'reverse', typing: 'typing', 'в обе стороны': 'reverse', ввод: 'typing', обычный: 'basic' };
const listCardType = (mode: ListMode): CardType => (mode === 'reverse' ? 'reverse' : mode === 'typing' ? 'typing' : 'basic');

const DAYS: Record<string, string> = { '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', пн: '1', понедельник: '1', вт: '2', вторник: '2', ср: '3', среда: '3', чт: '4', четверг: '4', пт: '5', пятница: '5', сб: '6', суббота: '6' };

/** Строка списка из любого удобного вида: ["a","b","c"], {a,b,c}, {term, definition}, {word, translation, example}… */
function row(v: unknown): { a: string; b: string; c: string } | null {
  if (Array.isArray(v)) return v.length && str(v[0])?.trim() ? { a: str(v[0])!.trim(), b: (str(v[1]) ?? '').trim(), c: (str(v[2]) ?? '').trim() } : null;
  if (typeof v === 'string') {
    const ab = splitDash(v.trim());
    const bc = ab && splitDash(ab[1]);
    return ab ? { a: ab[0], b: bc ? bc[0] : ab[1], c: bc ? bc[1] : '' } : v.trim() ? { a: v.trim(), b: '', c: '' } : null;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const pick = (...keys: string[]) => (str(keys.map((k) => o[k]).find((x) => str(x) !== undefined)) ?? '').trim();
    const a = pick('a', 'term', 'word', 'date', 'name', 'question', 'front', 'термин', 'слово', 'дата', 'название', 'вопрос');
    if (!a) return null;
    return { a, b: pick('b', 'definition', 'translation', 'event', 'formula', 'answer', 'back', 'определение', 'перевод', 'событие', 'формула', 'ответ'), c: pick('c', 'example', 'details', 'note', 'meaning', 'why', 'пример', 'подробнее', 'пояснение') };
  }
  return null;
}

/** Короткая «подпись» картинки в конспекте: большие рисунки не отдаём нейросети, а потом возвращаем на место. */
export function imageToken(src: string): string {
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'mnema-img:' + (h >>> 0).toString(36);
}
const IMG_RE = /(!\[[^\]]*\]\()(data:[^)\s]+)(\))/g;
export const hideImages = (md: string) => md.replace(IMG_RE, (_m, a, src, b) => a + imageToken(src) + b);

// ---------- Применение ----------

export interface PlanEnv {
  now?: Date;
  uid?: () => string;
}

/** Применить изменения к копии данных. Исходные данные не трогаются — можно показать план и отменить. */
export function planChanges(src: AppData, pack: ChangePack, env: PlanEnv = {}): Plan {
  const stamp = (env.now ?? new Date()).toISOString();
  const uid = env.uid ?? (() => crypto.randomUUID());
  const d: AppData = { ...src, folders: [...src.folders], subjects: [...src.subjects], topics: [...src.topics], cards: [...src.cards], homework: [...(src.homework ?? [])], states: src.states, logs: src.logs, deleted: { ...(src.deleted ?? {}) }, settings: src.settings };
  const lines: PlanLine[] = [];
  const warnings: string[] = [...(pack.warnings ?? [])];
  const touched = new Set<string>(); // темы и правила, которые файл создал или поменял
  const add = (text: string) => lines.push({ kind: 'add', text });
  const edit = (text: string) => lines.push({ kind: 'edit', text });
  const del = (text: string) => lines.push({ kind: 'del', text });
  let removed = new Set<string>(); // id удалённых карточек (чтобы почистить прогресс)

  // Картинки конспектов по «подписям» — чтобы вернуть их, если нейросеть прислала конспект без самих картинок.
  const images = new Map<string, string>();
  for (const t of src.topics) for (const m of t.note.matchAll(IMG_RE)) images.set(imageToken(m[2]), m[2]);
  const restoreImages = (md: string) => md.replace(/(!\[[^\]]*\]\()(mnema-img:[a-z0-9]+)(\))/g, (all, a, tok, b) => (images.has(tok) ? a + images.get(tok) + b : all));

  const setTopic = (id: string, patch: Partial<Topic>) => {
    touched.add(id);
    // Текст конспекта поменялся — запоминаем когда и где (noteAt), чтобы синхронизация не потеряла эту правку.
    d.topics = d.topics.map((t) => (t.id === id ? { ...t, ...(patch.note !== undefined && patch.note !== t.note ? noteEdit(t, src.deviceId, stamp) : {}), ...patch, updatedAt: stamp } : t));
    return d.topics.find((t) => t.id === id)!;
  };

  function findFolder(name: string): Folder | undefined {
    return d.folders.find((f) => norm(f.name) === norm(name));
  }
  function ensureFolder(name: string): Folder {
    let f = findFolder(name);
    if (!f) {
      f = { id: uid(), name: name.trim(), color: PALETTE[d.folders.length % PALETTE.length], order: d.folders.length + 1, createdAt: stamp, updatedAt: stamp };
      d.folders.push(f);
      add(`Папка ${q(f.name)}`);
    }
    return f;
  }
  function findSubject(name: string): Subject | undefined {
    return d.subjects.find((s) => norm(s.name) === norm(name));
  }
  function ensureSubject(name: string): Subject {
    let s = findSubject(name);
    if (!s) {
      s = { id: uid(), name: name.trim(), color: PALETTE[d.subjects.length % PALETTE.length], order: d.subjects.length + 1, createdAt: stamp, updatedAt: stamp };
      d.subjects.push(s);
      add(`Предмет ${q(s.name)}`);
    }
    return s;
  }
  function findTopic(subjectId: string, name: string, kind?: Topic['kind'], parentId?: string | null): Topic | undefined {
    const all = d.topics.filter((t) => t.subjectId === subjectId && (t.kind ?? undefined) === kind && norm(t.name) === norm(name));
    // Родитель указан — только среди его подтем (null — только верхний уровень).
    if (parentId !== undefined) return all.find((t) => (t.parentId ?? null) === parentId);
    if (all.length <= 1) return all[0];
    // Одинаковые названия в разных главах: без "parent" берём тему верхнего уровня, иначе — неоднозначно.
    const top = all.filter((t) => !t.parentId);
    if (top.length === 1) return top[0];
    throw new Error(`тем ${q(name)} несколько — укажи главу в "parent" (например "Глава 1")`);
  }
  /** Тема по названию и пути глав ("Глава 1 / Раздел 2"); чего нет — создаётся. */
  function ensureTopic(subject: Subject, name: string, parentPath?: string): Topic {
    let parent: Topic | undefined;
    if (parentPath) {
      for (const part of parentPath.split(/\s+\/\s+/).map((x) => x.trim()).filter(Boolean)) {
        let next = parent ? findTopic(subject.id, part, undefined, parent.id) : findTopic(subject.id, part);
        if (!next) next = createTopic(subject, part, parent);
        parent = next;
      }
    }
    return (parent ? findTopic(subject.id, name, undefined, parent.id) : findTopic(subject.id, name)) ?? createTopic(subject, name, parent);
  }
  function createTopic(subject: Subject, name: string, parent?: Topic): Topic {
    const siblings = d.topics.filter((x) => x.subjectId === subject.id && !x.kind && (x.parentId ?? null) === (parent?.id ?? null));
    const t: Topic = { id: uid(), subjectId: subject.id, name: name.trim(), note: '', ...(parent ? { parentId: parent.id } : {}), order: siblings.reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1, createdAt: stamp, updatedAt: stamp };
    d.topics.push(t);
    add(`Тема ${q(t.name)}${parent ? ` в ${q(parent.name)}` : ''} (${subject.name})`);
    return t;
  }
  /** Тема из полей subject + topic (+ parent). Создаётся, если нет. */
  function topicOf(c: Change): { subject: Subject; topic: Topic } | null {
    const sn = str(c.subject)?.trim();
    const tn = str(c.topic)?.trim();
    if (!sn || !tn) {
      warnings.push(`«${c.do}»: нужно указать "subject" (предмет) и "topic" (тему)`);
      return null;
    }
    const subject = ensureSubject(sn);
    return { subject, topic: ensureTopic(subject, tn, str(c.parent)?.trim() || undefined) };
  }
  function dropCards(ids: string[]) {
    if (!ids.length) return;
    const set = new Set(ids);
    d.cards = d.cards.filter((x) => !set.has(x.id));
    for (const id of ids) d.deleted!['card:' + id] = stamp;
    removed = new Set([...removed, ...ids]);
  }
  function dropTopics(ids: Set<string>) {
    // вместе с подтемами
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of d.topics) if (t.parentId && ids.has(t.parentId) && !ids.has(t.id)) {
        ids.add(t.id);
        grew = true;
      }
    }
    d.topics = d.topics.filter((t) => !ids.has(t.id));
    for (const id of ids) d.deleted!['topic:' + id] = stamp;
    dropCards(d.cards.filter((x) => ids.has(x.topicId)).map((x) => x.id));
  }

  /** Строки словаря/списка: новые добавить, существующие (по первому столбцу) — обновить. */
  function upsertRows(topic: Topic, list: StudyList, rows: unknown[], replace: boolean): string {
    const type = listCardType(list.mode);
    const existing = d.cards.filter((x) => x.topicId === topic.id && x.listId === list.id);
    // Одинаковый первый столбец бывает (bank — берег, bank — банк): сопоставляем по порядку.
    const byA = new Map<string, Card[]>();
    for (const x of existing) byA.set(norm(x.front), [...(byA.get(norm(x.front)) ?? []), x]);
    let added = 0;
    let changed = 0;
    const keep = new Set<string>();
    const parsed = rows.map(row).filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (replace && rows.length && !parsed.length) {
      warnings.push(`${list.title} (${topic.name}): ни одной строки не понял — ничего не удаляю`);
      return 'без изменений';
    }
    for (const r of parsed) {
      const old = (byA.get(norm(r.a)) ?? []).find((x) => !keep.has(x.id));
      if (old) {
        keep.add(old.id);
        if (old.back.trim() !== r.b || (old.why ?? '').trim() !== r.c) {
          d.cards = d.cards.map((x) => (x.id === old.id ? { ...x, back: r.b, why: r.c || undefined, updatedAt: stamp } : x));
          changed++;
        }
      } else {
        const card: Card = { id: uid(), topicId: topic.id, listId: list.id, type, front: r.a, back: r.b, ...(r.c ? { why: r.c } : {}), createdAt: stamp, updatedAt: stamp };
        d.cards.push(card);
        keep.add(card.id);
        added++;
      }
    }
    const gone = replace ? existing.filter((x) => !keep.has(x.id)).map((x) => x.id) : [];
    dropCards(gone);
    return [added && `+${added}`, changed && `изменено ${changed}`, gone.length && `убрано ${gone.length}`].filter(Boolean).join(', ') || 'без изменений';
  }
  function ensureList(topic: Topic, c: Change): StudyList {
    const kind = pick(LIST_KINDS, norm(c.kind)) ?? 'terms';
    const title = str(c.title)?.trim();
    const lists = topic.lists ?? [];
    let list = title ? lists.find((l) => norm(l.title) === norm(title)) : lists.find((l) => l.kind === kind);
    const p = LIST_PRESETS[kind];
    const cols = Array.isArray(c.columns) ? (c.columns.map((x) => str(x) ?? '') as string[]) : null;
    const mode = pick(LIST_MODES, norm(c.mode));
    if (!list) {
      list = { id: uid().slice(0, 8), kind, title: title || p.title, cols: [cols?.[0] || p.cols[0], cols?.[1] || p.cols[1], cols?.[2] || p.cols[2]], mode: mode ?? p.mode, ...(str(c.lang) ? { lang: str(c.lang) } : p.lang ? { lang: p.lang } : {}) };
      topic = setTopic(topic.id, { lists: [...lists, list] });
      add(`${list.title} в теме ${q(topic.name)}`);
    } else if (cols || mode) {
      const upd: StudyList = { ...list, ...(cols ? { cols: [cols[0] || list.cols[0], cols[1] || list.cols[1], cols[2] || list.cols[2]] as [string, string, string] } : {}), ...(mode ? { mode } : {}) };
      if (upd.cols.join('|') === list.cols.join('|') && upd.mode === list.mode) return list; // ничего не поменялось
      setTopic(topic.id, { lists: lists.map((l) => (l.id === upd.id ? upd : l)) });
      edit(`${list.title} (${topic.name}): столбцы или способ учить`);
      if (mode && mode !== list.mode) d.cards = d.cards.map((x) => (x.topicId === topic.id && x.listId === upd.id ? { ...x, type: listCardType(mode), updatedAt: stamp } : x));
      list = upd;
    }
    return list;
  }

  for (const c of pack.changes) {
    const kind = norm(c.do);
    try {
      if (kind === 'folder' || kind === 'папка') {
        const name = str(c.name)?.trim();
        if (!name) {
          warnings.push('Папка без названия (нужно "name")');
          continue;
        }
        const f = ensureFolder(name);
        const patch: Partial<Folder> = {};
        const rn = str(c.rename)?.trim();
        if (rn && rn !== f.name) {
          if (findFolder(rn)) warnings.push(`Папка ${q(rn)} уже есть — не переименовываю`);
          else patch.name = rn;
        }
        if (color(c.color) && color(c.color) !== f.color) patch.color = color(c.color);
        if (str(c.icon) && str(c.icon) !== f.icon) patch.icon = str(c.icon);
        if (Object.keys(patch).length) {
          d.folders = d.folders.map((x) => (x.id === f.id ? { ...x, ...patch, updatedAt: stamp } : x));
          edit(patch.name ? `Папка ${q(f.name)} → ${q(patch.name)}` : `Папка ${q(f.name)}: цвет или значок`);
        }
      } else if (kind === 'subject' || kind === 'предмет') {
        const name = str(c.name)?.trim();
        if (!name) {
          warnings.push('Предмет без названия (нужно "name")');
          continue;
        }
        const s = ensureSubject(name);
        const patch: Partial<Subject> = {};
        const rn = str(c.rename)?.trim();
        if (rn && rn !== s.name) {
          if (findSubject(rn)) warnings.push(`Предмет ${q(rn)} уже есть — не переименовываю`);
          else patch.name = rn;
        }
        const col = color(c.color);
        if (col && col !== s.color.toUpperCase()) patch.color = col;
        else if (!col && str(c.color)) warnings.push(`Не понял цвет ${q(str(c.color)!)} — напиши, например, "#3A5BD9" или "зелёный"`);
        if (str(c.icon) && str(c.icon) !== s.icon) patch.icon = str(c.icon);
        if (c.folder !== undefined) {
          const fid = str(c.folder)?.trim() ? ensureFolder(str(c.folder)!).id : undefined;
          if (fid !== s.folderId) patch.folderId = fid;
        }
        if (Object.keys(patch).length) {
          d.subjects = d.subjects.map((x) => (x.id === s.id ? { ...x, ...patch, updatedAt: stamp } : x));
          if (patch.name) edit(`Предмет ${q(s.name)} → ${q(patch.name)}`);
          if ('folderId' in patch) edit(`Предмет ${q(patch.name ?? s.name)}: ${patch.folderId ? `в папке ${q(str(c.folder)!)}` : 'без папки'}`);
          if (patch.color || patch.icon) edit(`Предмет ${q(patch.name ?? s.name)}: цвет или значок`);
        }
      } else if (kind === 'topic' || kind === 'тема') {
        const got = topicOf({ ...c, topic: c.topic ?? c.name });
        if (!got) continue;
        const { topic } = got;
        const patch: Partial<Topic> = {};
        const note = str(c.note);
        if (note !== undefined) {
          const md = restoreImages(note);
          const how = norm(c.noteMode);
          const next = how === 'append' || how === 'добавить' ? (topic.note.trim() ? topic.note.trimEnd() + '\n\n' : '') + md : how === 'prepend' ? md + (topic.note.trim() ? '\n\n' + topic.note : '') : md;
          if (next.trim() !== topic.note.trim()) {
            patch.note = next;
            edit(`Конспект ${q(topic.name)}: ${how === 'append' || how === 'добавить' ? 'дописан' : how === 'prepend' ? 'дописан в начало' : topic.note.trim() ? `заменён, было ${topic.note.length} знаков, станет` : 'написан'} ${next.length} знаков`);
          }
        }
        const rn = str(c.rename)?.trim();
        if (rn && rn !== topic.name) {
          patch.name = rn;
          edit(`Тема ${q(topic.name)} → ${q(rn)}`);
        }
        if (c.examDate !== undefined) {
          const ex = str(c.examDate)?.trim();
          const date = ex && /^\d{4}-\d{2}-\d{2}$/.test(ex) ? ex : undefined;
          if (ex && !date) warnings.push(`Дата контрольной ${q(ex)}: нужен вид ГГГГ-ММ-ДД`);
          else if (date !== topic.examDate) {
            patch.examDate = date;
            edit(`Тема ${q(topic.name)}: ${date ? 'контрольная ' + date : 'без даты контрольной'}`);
          }
        }
        if (typeof c.important === 'boolean' && c.important !== Boolean(topic.important)) {
          patch.important = c.important;
          edit(`Тема ${q(topic.name)}: ${c.important ? 'важная ★' : 'не важная'}`);
        }
        if (Object.keys(patch).length) setTopic(topic.id, patch);
      } else if (kind === 'cards' || kind === 'card' || kind === 'карточки' || kind === 'карточка') {
        const got = topicOf(c);
        if (!got) continue;
        const { topic } = got;
        const items: unknown[] = Array.isArray(c.cards) ? c.cards : [c];
        const own = d.cards.filter((x) => x.topicId === topic.id && !x.listId);
        const byFront = new Map(own.map((x) => [norm(x.front), x]));
        let added = 0;
        let changed = 0;
        const keep = new Set<string>();
        for (const it of items) {
          const o = (it ?? {}) as Record<string, unknown>;
          const front = (str(o.front) ?? str(o.question) ?? str(o.вопрос) ?? '').trim();
          const find = str(o.find)?.trim();
          if (!front && !find) continue;
          const old = byFront.get(norm(find || front));
          const back = str(o.back) ?? str(o.answer) ?? str(o.ответ);
          const why = str(o.why) ?? str(o.почему);
          if (old) {
            keep.add(old.id);
            const next: Card = { ...old, ...(front && front !== old.front.trim() ? { front } : {}), ...(back !== undefined && back.trim() !== old.back.trim() ? { back: back.trim() } : {}), ...(why !== undefined && why.trim() !== (old.why ?? '').trim() ? { why: why.trim() || undefined } : {}), ...(o.type !== undefined ? { type: cardType(o.type, front || old.front) } : {}) };
            if (next.front !== old.front || next.back !== old.back || next.why !== old.why || next.type !== old.type) {
              d.cards = d.cards.map((x) => (x.id === old.id ? { ...next, updatedAt: stamp } : x));
              // Изменился текст с пропусками — прогресс пропусков, которых больше нет, убрать.
              if (next.front !== old.front || next.type !== old.type) {
                const ords = new Set(itemOrds(next).map((o2) => itemKey(next.id, o2)));
                const stale = Object.keys(d.states).filter((k) => k.startsWith(next.id + ':') && !ords.has(k));
                if (stale.length) {
                  d.states = { ...d.states };
                  for (const k of stale) delete d.states[k];
                }
              }
              changed++;
            }
          } else {
            if (!front) {
              warnings.push(`Карточка ${q(find!)} не нашлась в теме ${q(topic.name)}`);
              continue;
            }
            const type = cardType(o.type, front);
            const card: Card = { id: uid(), topicId: topic.id, type, front, back: (back ?? '').trim(), ...(why?.trim() ? { why: why.trim() } : {}), createdAt: stamp, updatedAt: stamp };
            d.cards.push(card);
            byFront.set(norm(front), card);
            keep.add(card.id);
            added++;
          }
        }
        let replace = norm(c.mode) === 'replace' || norm(c.mode) === 'заменить';
        if (replace && items.length && !keep.size) {
          // Ни одной карточки не понял (например, поля названы не так) — ничего не удаляем.
          warnings.push(`Карточки (${topic.name}): ни одной не понял — нужны поля "front" и "back"; старые не трогаю`);
          replace = false;
        }
        const gone = replace ? own.filter((x) => !keep.has(x.id)).map((x) => x.id) : [];
        dropCards(gone);
        if (added) add(`${added} ${plural(added, 'карточка', 'карточки', 'карточек')} в теме ${q(topic.name)}`);
        if (changed) edit(`${changed} ${plural(changed, 'карточка изменена', 'карточки изменены', 'карточек изменено')} в теме ${q(topic.name)}`);
        if (gone.length) del(`${gone.length} ${plural(gone.length, 'карточка', 'карточки', 'карточек')} из темы ${q(topic.name)}`);
      } else if (kind === 'list' || kind === 'словарь' || kind === 'список' || kind === 'terms' || kind === 'термины') {
        const got = topicOf(c);
        if (!got) continue;
        const list = ensureList(got.topic, kind === 'terms' || kind === 'термины' ? { ...c, kind: c.kind ?? 'terms' } : kind === 'словарь' ? { ...c, kind: c.kind ?? 'vocab' } : c);
        const topic = d.topics.find((t) => t.id === got.topic.id)!;
        const res = upsertRows(topic, list, Array.isArray(c.rows) ? c.rows : [], c.replace === true || norm(c.mode) === 'replace');
        if (res !== 'без изменений') edit(`${list.title} (${topic.name}): ${res}`);
      } else if (kind === 'glossary' || kind === 'общие термины') {
        const sn = str(c.subject)?.trim();
        if (!sn) {
          warnings.push('Общие термины: нужен "subject"');
          continue;
        }
        const subject = ensureSubject(sn);
        let topic = d.topics.find((t) => t.subjectId === subject.id && t.kind === 'glossary');
        if (!topic) {
          topic = { id: uid(), subjectId: subject.id, kind: 'glossary', name: 'Общие термины', note: '', createdAt: stamp, updatedAt: stamp };
          d.topics.push(topic);
        }
        const list = ensureList(topic, { ...c, kind: 'terms' });
        topic = d.topics.find((t) => t.id === topic!.id)!;
        const res = upsertRows(topic, list, Array.isArray(c.rows) ? c.rows : [], c.replace === true);
        if (res !== 'без изменений') edit(`Общие термины (${subject.name}): ${res}`);
      } else if (kind === 'rule' || kind === 'правило') {
        const sn = str(c.subject)?.trim();
        const name = str(c.name)?.trim();
        if (!sn || !name) {
          warnings.push('Правило: нужны "subject" и "name"');
          continue;
        }
        const subject = ensureSubject(sn);
        let rule = findTopic(subject.id, name, 'rule');
        if (!rule) {
          rule = { id: uid(), subjectId: subject.id, kind: 'rule', name, note: '', createdAt: stamp, updatedAt: stamp };
          d.topics.push(rule);
          add(`Правило ${q(name)} (${subject.name})`);
        }
        const patch: Partial<Topic> = {};
        const text = str(c.text) !== undefined ? restoreImages(str(c.text)!) : undefined;
        if (text !== undefined && text.trim() !== rule.note.trim()) patch.note = text;
        const words = Array.isArray(c.words) ? c.words.map((w) => str(w)?.trim() ?? '').filter(Boolean) : undefined;
        if (words && words.join('|') !== (rule.ruleWords ?? []).join('|')) patch.ruleWords = words;
        if (str(c.rename)?.trim() && str(c.rename)!.trim() !== rule.name) patch.name = str(c.rename)!.trim();
        if (Object.keys(patch).length) {
          const fresh = !rule.note && !rule.ruleWords?.length;
          setTopic(rule.id, patch);
          if (!fresh) edit(`Правило ${q(rule.name)} изменено`);
        }
      } else if (kind === 'poem' || kind === 'стих' || kind === 'стихотворение') {
        const got = topicOf(c);
        if (!got) continue;
        const title = (str(c.title) ?? str(c.name))?.trim();
        const text = str(c.text)?.trim();
        if (!title && !text) {
          warnings.push('Стихотворение: нужны "title" или "text"');
          continue;
        }
        const topic = d.topics.find((t) => t.id === got.topic.id)!;
        const poems = topic.poems ?? [];
        const t2 = title || text!.split('\n')[0].replace(/[,.;:!?…—-]+$/, '');
        const old = poems.find((p) => norm(p.title) === norm(t2));
        if (old) {
          const patch: Partial<Poem> = { ...(str(c.author) !== undefined && (str(c.author) || undefined) !== old.author ? { author: str(c.author) || undefined } : {}), ...(str(c.rename) && str(c.rename) !== old.title ? { title: str(c.rename) } : {}) };
          if (text && text !== old.text.trim()) Object.assign(patch, { text, chunk: autoChunk(text), learned: 0, lineMiss: [], review: undefined });
          if (Object.keys(patch).length) {
            setTopic(topic.id, { poems: poems.map((p) => (p.id === old.id ? { ...p, ...patch, updatedAt: stamp } : p)) });
            edit(`Стихотворение ${q(old.title)}${patch.text ? ' — новый текст (учить заново)' : ''}`);
          }
        } else {
          if (!text) {
            warnings.push(`Стихотворение ${q(t2)}: нет текста`);
            continue;
          }
          const p: Poem = { id: uid().slice(0, 8), title: t2, ...(str(c.author) ? { author: str(c.author) } : {}), text, chunk: autoChunk(text), learned: 0, createdAt: stamp, updatedAt: stamp };
          setTopic(topic.id, { poems: [...poems, p] });
          add(`Стихотворение ${q(t2)} в теме ${q(topic.name)}`);
        }
      } else if (kind === 'homework' || kind === 'домашка') {
        const text = str(c.text)?.trim();
        if (!text) {
          warnings.push('Домашка без текста (нужно "text")');
          continue;
        }
        const subject = str(c.subject)?.trim() ? ensureSubject(str(c.subject)!) : undefined;
        const due = str(c.due)?.trim();
        const old = d.homework.find((h) => norm(h.text) === norm(text) && (h.subjectId ?? '') === (subject?.id ?? ''));
        const patch: Partial<Homework> = { ...(due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? { due } : {}), ...(typeof c.done === 'boolean' ? { done: c.done, doneAt: c.done ? stamp : undefined } : {}) };
        if (due && !patch.due) warnings.push(`Срок домашки ${q(due)}: нужен вид ГГГГ-ММ-ДД`);
        if (old) {
          d.homework = d.homework.map((h) => (h.id === old.id ? { ...h, ...patch, updatedAt: stamp } : h));
          if (Object.keys(patch).length) edit(`Домашка ${q(text)}`);
        } else {
          d.homework.push({ id: uid(), text, ...(subject ? { subjectId: subject.id } : {}), ...patch, createdAt: stamp, updatedAt: stamp });
          add(`Домашка ${q(text)}${patch.due ? ' к ' + patch.due : ''}`);
        }
      } else if (kind === 'schedule' || kind === 'расписание') {
        const day = pick(DAYS, norm(c.day));
        if (!day) {
          warnings.push('Расписание: "day" — от 1 (понедельник) до 6 (суббота)');
          continue;
        }
        const names = Array.isArray(c.subjects) ? c.subjects.map((x) => str(x)?.trim() ?? '').filter(Boolean) : [];
        d.settings = { ...d.settings, schedule: { ...d.settings.schedule, [day]: names.map((n) => ensureSubject(n).id) }, features: { ...d.settings.features, schedule: true } };
        edit(`Расписание, ${['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'][+day]}: ${names.join(', ') || 'нет уроков'}`);
      } else if (kind === 'delete' || kind === 'удалить') {
        const what = norm(c.what);
        const s = str(c.subject) ? findSubject(str(c.subject)!) : undefined;
        const nm = (str(c.name) ?? str(c.title) ?? str(c.text) ?? str(c.find) ?? str(c.topic) ?? '').trim();
        const WHAT: Record<string, string> = { folder: 'папку', subject: 'предмет', topic: 'тему', rule: 'правило', card: 'карточку', list: 'список', row: 'строку', term: 'термин', poem: 'стихотворение' };
        const miss = () => warnings.push(`Удалить: не нашёл ${WHAT[what] ?? what} ${q(nm || '?')}`);
        if (what === 'folder' || what === 'папка') {
          const f = findFolder(nm);
          if (!f) miss();
          else {
            d.folders = d.folders.filter((x) => x.id !== f.id);
            d.subjects = d.subjects.map((x) => (x.folderId === f.id ? { ...x, folderId: undefined, updatedAt: stamp } : x));
            d.deleted!['folder:' + f.id] = stamp;
            del(`Папка ${q(f.name)} (предметы останутся)`);
          }
        } else if (what === 'subject' || what === 'предмет') {
          const sub = findSubject(nm);
          if (!sub) miss();
          else {
            d.subjects = d.subjects.filter((x) => x.id !== sub.id);
            d.deleted!['subj:' + sub.id] = stamp;
            dropTopics(new Set(d.topics.filter((t) => t.subjectId === sub.id).map((t) => t.id)));
            del(`Предмет ${q(sub.name)} со всеми темами и карточками`);
          }
        } else if (!s) warnings.push(`Удалить ${what || '?'}: нужен "subject"`);
        else if (what === 'topic' || what === 'тема' || what === 'rule' || what === 'правило') {
          const t = findTopic(s.id, nm, what === 'rule' || what === 'правило' ? 'rule' : undefined);
          if (!t) miss();
          else {
            dropTopics(new Set([t.id]));
            del(`${t.kind === 'rule' ? 'Правило' : 'Тема'} ${q(t.name)}${t.kind ? '' : ' с карточками'}`);
          }
        } else {
          const t = str(c.topic) ? findTopic(s.id, str(c.topic)!) : undefined;
          if (!t) warnings.push(`Удалить ${what}: нужна тема ("topic")`);
          else if (what === 'card' || what === 'карточка') {
            const card = d.cards.find((x) => x.topicId === t.id && norm(x.front) === norm(str(c.find) ?? str(c.front) ?? nm));
            if (!card) miss();
            else {
              dropCards([card.id]);
              del(`Карточка ${q(card.front)}`);
            }
          } else if (what === 'list' || what === 'словарь' || what === 'список') {
            const l = (t.lists ?? []).find((x) => norm(x.title) === norm(nm));
            if (!l) miss();
            else {
              setTopic(t.id, { lists: (t.lists ?? []).filter((x) => x.id !== l.id), tabOrder: t.tabOrder?.filter((v) => v !== 'list:' + l.id) });
              dropCards(d.cards.filter((x) => x.topicId === t.id && x.listId === l.id).map((x) => x.id));
              del(`${l.title} из темы ${q(t.name)}`);
            }
          } else if (what === 'row' || what === 'строка' || what === 'term' || what === 'термин') {
            const card = d.cards.find((x) => x.topicId === t.id && x.listId && norm(x.front) === norm(nm));
            if (!card) miss();
            else {
              dropCards([card.id]);
              del(`Строка ${q(card.front)}`);
            }
          } else if (what === 'poem' || what === 'стихотворение' || what === 'стих') {
            const p = (t.poems ?? []).find((x) => norm(x.title) === norm(nm));
            if (!p) miss();
            else {
              setTopic(t.id, { poems: (t.poems ?? []).filter((x) => x.id !== p.id), tabOrder: t.tabOrder?.filter((v) => v !== 'poem:' + p.id) });
              del(`Стихотворение ${q(p.title)}`);
            }
          } else warnings.push(`Удалить: не знаю, что такое ${q(what)}`);
        }
      } else {
        warnings.push(`Не знаю действие ${q(String(c.do))} — пропускаю`);
      }
    } catch (e) {
      warnings.push(`«${c.do}»: ${(e as Error).message}`);
    }
  }

  if (removed.size) {
    const states = { ...d.states };
    for (const k of Object.keys(states)) if (removed.has(k.split(':')[0])) delete states[k];
    d.states = states;
    d.logs = d.logs.filter((l) => !removed.has(l.cardId));
  }
  // Карточки, которые добавлены или изменены, — их темы тоже в предпросмотр.
  const oldCards = new Map(src.cards.map((c) => [c.id, c]));
  for (const c of d.cards) if (oldCards.get(c.id) !== c) touched.add(c.topicId);
  for (const t of d.topics) if (!src.topics.some((x) => x.id === t.id)) touched.add(t.id);
  return { title: pack.title, data: d, lines, warnings, touched: [...touched].filter((id) => d.topics.some((t) => t.id === id)) };
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

// ---------- Выгрузка для нейросети ----------

/** Предмет или тема — в виде файла изменений: отдаёшь нейросети, она правит и возвращает. */
export function exportChanges(data: AppData, scope: { subjectId?: string; topicId?: string }): ChangePack {
  const changes: Change[] = [];
  const topics = scope.topicId ? data.topics.filter((t) => t.id === scope.topicId) : data.topics.filter((t) => t.subjectId === scope.subjectId);
  const subjectId = scope.subjectId ?? topics[0]?.subjectId;
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (!subject) return { changes };
  if (!scope.topicId) {
    const folder = data.folders.find((f) => f.id === subject.folderId);
    changes.push({ do: 'subject', name: subject.name, color: subject.color, ...(subject.icon ? { icon: subject.icon } : {}), ...(folder ? { folder: folder.name } : {}) });
  }
  const byId = new Map(data.topics.map((t) => [t.id, t]));
  for (const t of topics) {
    if (t.kind === 'rule') {
      changes.push({ do: 'rule', subject: subject.name, name: t.name, text: hideImages(t.note), words: t.ruleWords ?? [] });
      continue;
    }
    const lists = t.lists ?? [];
    if (t.kind === 'glossary') {
      const l = lists[0];
      if (l) changes.push({ do: 'glossary', subject: subject.name, rows: data.cards.filter((c) => c.topicId === t.id && c.listId === l.id).map((c) => [c.front, c.back, c.why ?? '']) });
      continue;
    }
    // Путь глав: "Глава 1 / Раздел 2" — чтобы одинаковые названия в разных главах не путались.
    const path: string[] = [];
    for (let p = t.parentId ? byId.get(t.parentId) : undefined; p && path.length < 10; p = p.parentId ? byId.get(p.parentId) : undefined) path.unshift(p.name);
    const parent = path.length ? path.join(' / ') : undefined;
    changes.push({ do: 'topic', subject: subject.name, topic: t.name, ...(parent ? { parent } : {}), note: hideImages(t.note), ...(t.examDate ? { examDate: t.examDate } : {}), ...(t.important ? { important: true } : {}) });
    const own = data.cards.filter((c) => c.topicId === t.id && !c.listId);
    const at = { subject: subject.name, topic: t.name, ...(parent ? { parent } : {}) };
    if (own.length) changes.push({ do: 'cards', ...at, cards: own.map((c) => ({ front: c.front, back: c.back, ...(c.type !== 'basic' ? { type: c.type } : {}), ...(c.why ? { why: c.why } : {}) })) });
    for (const l of lists)
      changes.push({ do: 'list', ...at, title: l.title, kind: l.kind, columns: l.cols, mode: l.mode, rows: data.cards.filter((c) => c.topicId === t.id && c.listId === l.id).map((c) => [c.front, c.back, c.why ?? '']) });
    for (const p of t.poems ?? []) changes.push({ do: 'poem', ...at, title: p.title, ...(p.author ? { author: p.author } : {}), text: p.text });
  }
  return { title: scope.topicId ? `Тема «${topics[0]?.name ?? ''}»` : `Предмет «${subject.name}»`, changes };
}

/** Выгрузка для нейросети — простым текстом (его легче читать и править). */
export function packToMnemaText(pack: ChangePack): string {
  return toMnemaText(pack);
}

export function packToText(pack: ChangePack): string {
  return JSON.stringify({ [CHANGES_MARK]: 1, ...pack }, null, 2);
}

// ---------- Инструкция для нейросети ----------

export const CHANGES_GUIDE = `Ты помогаешь ученику с приложением «Мнема» (конспекты, карточки, повторение). Ответь ОДНИМ файлом JSON — «файлом изменений». Ученик загрузит его в Мнему («Настройки → Данные → Файл изменений» или просто перетащит), увидит список изменений и применит.

Формат:
{
  "mnema-changes": 1,
  "title": "Коротко, что делает файл",
  "changes": [ { "do": "…", … }, … ]
}

Всё находится по НАЗВАНИЯМ (предмет, тема, словарь…). Если такого ещё нет — создаётся, если есть — правится. Действия выполняются по порядку.

Действия ("do"):
• "folder" — папка предметов: {"do":"folder","name":"8 класс","color":"синий","rename":"новое имя"}
• "subject" — предмет: {"do":"subject","name":"Биология","color":"зелёный","icon":"🌿","folder":"8 класс","rename":"…"}
• "topic" — тема и её конспект: {"do":"topic","subject":"Биология","topic":"§12 Фотосинтез","parent":"Глава 3 (необязательно — сделает подтему)","note":"Конспект в Markdown","noteMode":"replace | append | prepend","examDate":"2026-10-20","rename":"…"}
   Конспект — Markdown: **жирное** (станет «важным»), ==маркер==, заголовки ##, списки, формулы $E=mc^2$ и $$…$$. Картинки вида ![Рисунок](mnema-img:…) не трогай — Мнема вернёт их на место.
• "cards" — карточки темы: {"do":"cards","subject":"…","topic":"…","mode":"add | replace","cards":[{"front":"Вопрос","back":"Ответ","why":"почему так (необязательно)","type":"basic | reverse | cloze | typing"}]}
   add — добавить новые и обновить совпадающие по вопросу; replace — оставить только эти (прогресс совпадающих сохранится).
   Изменить одну: {"find":"старый вопрос","front":"новый вопрос","back":"новый ответ"}. Пропуск (cloze): "front":"Столица Франции — {{Париж}}".
• "list" — словарь/термины/даты/формулы темы: {"do":"list","subject":"…","topic":"…","kind":"terms | vocab | dates | formulas | custom","title":"Термины","columns":["Термин","Определение","Пример"],"mode":"basic | reverse | typing","replace":false,"rows":[["хлорофилл","зелёный пигмент растений",""]]}
   Строки совпадают по первому столбцу. Для vocab можно "lang":"en-US".
• "glossary" — общие термины предмета: {"do":"glossary","subject":"Биология","rows":[["клетка","единица строения живого",""]]}
• "rule" — правило предмета: {"do":"rule","subject":"Русский язык","name":"Н и НН в прилагательных","text":"Текст правила (Markdown)","words":["деревянный","стеклянный"]}
• "poem" — стихотворение наизусть: {"do":"poem","subject":"Литература","topic":"Пушкин","title":"Зимнее утро","author":"А. С. Пушкин","text":"строки…\\n\\nстрофы через пустую строку"}
• "homework" — домашка: {"do":"homework","subject":"Алгебра","text":"§ 12, № 345","due":"2026-10-01","done":false}
• "schedule" — уроки в день недели: {"do":"schedule","day":1,"subjects":["Алгебра","История"]} (1 — понедельник … 6 — суббота)
• "delete" — удалить: {"do":"delete","what":"subject | topic | rule | card | list | row | poem | folder","subject":"…","topic":"…","name":"что удалить"} (для карточки — "find":"вопрос")

Правила для хороших карточек: одна карточка — один факт; вопрос понятен без конспекта; ответ короткий; для терминов лучше "list" с kind "terms".
Даты — в виде ГГГГ-ММ-ДД. Ответь только JSON, без пояснений вокруг.`;

/** Инструкция + что уже есть у ученика (названия), чтобы нейросеть правила существующее, а не плодила дубли. */
export function aiInstructions(data: AppData, withStructure = true): string {
  if (!withStructure || !data.subjects.length) return MNEMA_TEXT_GUIDE;
  const lines: string[] = [];
  for (const s of data.subjects) {
    const folder = data.folders.find((f) => f.id === s.folderId);
    lines.push(`- ${s.name}${folder ? ` (папка «${folder.name}»)` : ''}`);
    for (const t of data.topics.filter((x) => x.subjectId === s.id)) {
      const extra = [(t.lists ?? []).map((l) => l.title).join(', '), (t.poems ?? []).map((p) => '«' + p.title + '»').join(', ')].filter(Boolean).join('; ');
      lines.push(`  - ${t.kind === 'rule' ? 'правило: ' : t.kind === 'glossary' ? '' : ''}${t.name}${extra ? ` [${extra}]` : ''}`);
    }
  }
  return MNEMA_TEXT_GUIDE + '\n\nЧто уже есть у ученика (используй эти названия, чтобы дополнять, а не создавать заново):\n' + lines.join('\n').slice(0, 6000);
}

// ---------- «Вернуть» ----------

type Keyed = { id: string; updatedAt?: string };
const TOMB: [keyof AppData & ('folders' | 'subjects' | 'topics' | 'cards' | 'homework'), string][] = [
  ['folders', 'folder:'],
  ['subjects', 'subj:'],
  ['topics', 'topic:'],
  ['cards', 'card:'],
  ['homework', 'hw:']
];

/**
 * Отменить применённый файл изменений, не трогая то, что поменялось потом в другом месте.
 * Созданное — удалить (с отметкой для синхронизации), удалённое — вернуть, изменённое — вернуть как было.
 * Всё со свежей отметкой времени: иначе синхронизация «вернула бы» изменения обратно.
 */
export function revertChanges(before: AppData, applied: AppData, current: AppData, now = new Date()): AppData {
  const stamp = now.toISOString();
  const out: AppData = { ...current, deleted: { ...(current.deleted ?? {}) } };
  for (const [key, prefix] of TOMB) {
    const b = new Map(((before[key] ?? []) as Keyed[]).map((x) => [x.id, x]));
    const a = new Map(((applied[key] ?? []) as Keyed[]).map((x) => [x.id, x]));
    let list = [...((current[key] ?? []) as Keyed[])];
    // созданное файлом — убрать
    const created = new Set([...a.keys()].filter((id) => !b.has(id)));
    if (created.size) {
      list = list.filter((x) => !created.has(x.id));
      for (const id of created) out.deleted![prefix + id] = stamp;
    }
    // изменённое — вернуть как было (если вернулся другой текст конспекта — это правка текста со свежим noteAt, иначе другое устройство вернуло бы файл обратно)
    list = list.map((x) => {
      if (!(b.has(x.id) && a.has(x.id) && a.get(x.id) !== b.get(x.id))) return x;
      const old = b.get(x.id)!;
      const cur = x as unknown as Topic;
      const noteBack = key === 'topics' && (old as unknown as Topic).note !== cur.note ? noteEdit(cur, current.deviceId, stamp) : {};
      return { ...old, ...noteBack, updatedAt: stamp };
    });
    // удалённое — вернуть
    const have = new Set(list.map((x) => x.id));
    for (const [id, x] of b) {
      if (a.has(id) || have.has(id)) continue;
      list.push({ ...x, updatedAt: stamp });
      delete out.deleted![prefix + id];
    }
    (out as unknown as Record<string, unknown>)[key] = list;
  }
  // прогресс удалённых карточек
  const states = { ...out.states };
  for (const [k, v] of Object.entries(before.states)) if (!(k in applied.states) && !(k in states)) states[k] = v;
  out.states = states;
  if (applied.logs !== before.logs) {
    const kept = new Set(applied.logs);
    const logIds = new Set(out.logs.map((l) => l.at + l.key));
    out.logs = [...out.logs, ...before.logs.filter((l) => !kept.has(l) && !logIds.has(l.at + l.key))];
  }
  // расписание
  if (applied.settings.schedule !== before.settings.schedule) out.settings = { ...out.settings, schedule: before.settings.schedule, features: { ...out.settings.features, schedule: before.settings.features.schedule } };
  return out;
}
