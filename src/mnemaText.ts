// «Мнема-текст» — простой формат файла изменений, который нейросети легко писать (как CSV в Anki, только
// для всего сразу). Строки с @ задают, куда писать, остальное — обычный текст: конспект в Markdown,
// карточки «вопрос :: ответ», термины «термин — определение».
//
//   @предмет Русский язык | цвет: синий
//   @тема §1. Язык как развивающееся явление
//   ## Язык меняется
//   **Язык** — …
//   @карточки
//   Что изучает лексика? :: Словарный состав языка
//   @термины
//   Лексика — словарный состав языка
//
// Внутри получается тот же «пакет изменений», что и из JSON (см. changes.ts).
import type { Change, ChangePack } from './changes';

/** Похоже ли на Мнема-текст: есть строки-команды @предмет / @тема / … */
export function looksLikeMnemaText(text: string): boolean {
  // \b в JS не понимает русские буквы, поэтому граница слова — пробел, «|» или конец строки.
  return /^\s*@(предмет|тема|папка|карточки|термины|словарь|даты|формулы|список|правило|стих|стихотворение|домашка|расписание|общие термины|удалить)(?=\s|\||$)/im.test(text);
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/** «Название | ключ: значение | ключ: значение» → название и свойства. */
function head(rest: string): { name: string; props: Record<string, string> } {
  // «\|» — это палочка внутри названия, а не разделитель свойств.
  const parts = rest.split(/(?<!\\)\|/).map((x) => x.replace(/\\\|/g, '|').trim());
  const props: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const m = /^([^:]+):\s*(.*)$/.exec(p);
    if (m) props[norm(m[1])] = m[2].trim();
    else if (p) props[norm(p)] = 'да';
  }
  return { name: parts[0] ?? '', props };
}
const yes = (v?: string) => v !== undefined && /^(да|yes|true|1|\+)$/i.test(v.trim());

/** Строка карточки: «вопрос :: ответ :: почему», табуляция тоже годится. Пропуски {{…}} — без ответа. */
function cardLine(line: string): Record<string, string> | null {
  const t = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
  if (!t) return null;
  const cols = splitCols(t);
  const parts = cols.length > 1 ? cols.map((x) => x.trim()) : t.includes('\t') ? t.split('\t') : null;
  if (parts) {
    const [front, back = '', why = ''] = parts.map((x) => x.trim());
    return front ? { front, back, ...(why ? { why } : {}) } : null;
  }
  // «Вопрос? — ответ» — тоже карточка (нейросети часто пишут через тире).
  const q = splitDash(t, (a) => a.endsWith('?'));
  if (q) return { front: q[0], back: q[1] };
  return /\{\{.+?\}\}/.test(t) ? { front: t, back: '' } : null;
}

/** Разделить строку на столбцы по «::» вне пропусков {{…}} (внутри пропуска «::» — подсказка: {{49 лет::сколько?}}).
 *  Если есть « :: » с пробелами — делим только по нему: в тексте бывает std::cout или a[::2]. */
export function splitCols(t: string): string[] {
  const spaced = scanCols(t, true);
  return spaced.length > 1 || /\{\{/.test(t) ? spaced : scanCols(t, false);
}
function scanCols(t: string, spaced: boolean): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    if (t.startsWith('{{', i)) {
      depth++;
      i++;
    } else if (depth && t.startsWith('}}', i)) {
      depth--;
      i++;
    } else if (!depth && t.startsWith('::', i) && (!spaced || (/\s/.test(t[i - 1] ?? '') && /\s/.test(t[i + 2] ?? '')))) {
      out.push(t.slice(start, i));
      start = i + 2;
      i++;
    }
  }
  out.push(t.slice(start));
  return out;
}

/** Разделить «слово — значение» по первому тире в пробелах (accept — какая левая часть подходит).
 *  Без регулярки: длинная строка не подвесит разбор. */
export function splitDash(t: string, accept: (left: string) => boolean = () => true): [string, string] | null {
  for (let i = 1; i < t.length - 1; i++) {
    const ch = t[i];
    if ((ch === '—' || ch === '–' || ch === '-') && /\s/.test(t[i - 1]) && /\s/.test(t[i + 1])) {
      const a = t.slice(0, i).trim();
      const b = t.slice(i + 1).trim();
      if (a && b && accept(a)) return [a, b];
    }
  }
  return null;
}

/** Строка словаря/терминов: «a :: b :: c», иначе «a — b» (делим только по первому тире: в определении тоже бывают тире). */
function rowLine(line: string): string[] | null {
  const t = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
  if (!t) return null;
  const cols = splitCols(t);
  if (cols.length > 1) return cols.map((x) => x.trim());
  if (t.includes('\t')) return t.split('\t').map((x) => x.trim());
  return splitDash(t) ?? [t];
}

const LIST_WORDS: Record<string, string> = { термины: 'terms', словарь: 'vocab', слова: 'vocab', даты: 'dates', формулы: 'formulas', список: 'custom' };
const DELETE_WORDS: Record<string, string> = { папку: 'folder', папка: 'folder', предмет: 'subject', тему: 'topic', тема: 'topic', правило: 'rule', карточку: 'card', карточка: 'card', список: 'list', словарь: 'list', термин: 'row', строку: 'row', стих: 'poem', стихотворение: 'poem' };

/** Разобрать Мнема-текст в пакет изменений. Ошибки строк — в warnings (покажутся в плане как пропущенное). */
export function parseMnemaText(text: string): ChangePack {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const changes: Change[] = [];
  const warnings: string[] = [];
  let title: string | undefined;
  let folder: string | undefined;
  let subject: string | undefined;
  let topic: string | undefined;
  let parent: string | undefined;
  // Текущий раздел, куда складываются обычные строки.
  type Block = { kind: 'note' | 'cards' | 'rows' | 'rule' | 'poem' | 'homework' | 'schedule' | 'glossary' | 'none'; buf: string[]; flush: () => void };
  let block: Block = { kind: 'none', buf: [], flush: () => {} };
  const at = () => ({ subject, topic, ...(parent ? { parent } : {}) });
  const needTopic = (what: string) => {
    if (subject && topic) return true;
    warnings.push(`${what}: перед ним нужны строки «@предмет …» и «@тема …»`);
    return false;
  };
  const trimBlock = (buf: string[]) => {
    const b = [...buf];
    while (b.length && !b[0].trim()) b.shift();
    while (b.length && !b[b.length - 1].trim()) b.pop();
    return b;
  };

  for (const raw of lines) {
    // «@слово остаток» (или «@общие термины остаток»)
    const cmd = /^\s*@(общие\s+термины|[a-zа-яё]+)(?:\s*(\|.*|\s.*))?$/i.exec(raw.trimEnd());
    const known = cmd && /^(название|папка|предмет|тема|карточки|термины|словарь|слова|даты|формулы|список|общие термины|правило|стих|стихотворение|домашка|расписание|удалить|конспект)$/i.test(norm(cmd[1]));
    if (!cmd || !known) {
      // «\@…» в начале строки — обычный текст, который начинается с @ (так его сохраняет выгрузка).
      block.buf.push(raw.replace(/^(\s*)\\(\\*@)/, '$1$2'));
      continue;
    }
    block.flush();
    const word = norm(cmd[1]);
    const { name, props } = head((cmd[2] ?? '').trim());
    block = { kind: 'none', buf: [], flush: () => {} };

    if (word === 'название') {
      title = name;
    } else if (word === 'папка') {
      folder = name || undefined;
      if (folder) changes.push({ do: 'folder', name: folder, ...(props['цвет'] ? { color: props['цвет'] } : {}), ...(props['значок'] ? { icon: props['значок'] } : {}) });
    } else if (word === 'предмет') {
      subject = name;
      topic = undefined;
      parent = undefined;
      changes.push({ do: 'subject', name, ...(folder ? { folder } : {}), ...(props['цвет'] ? { color: props['цвет'] } : {}), ...(props['значок'] ? { icon: props['значок'] } : {}), ...(props['новое название'] ? { rename: props['новое название'] } : {}) });
    } else if (word === 'тема') {
      if (!subject) {
        warnings.push(`Тема «${name}»: перед ней нужна строка «@предмет …»`);
        continue;
      }
      topic = name;
      parent = props['глава'] || undefined;
      const base: Change = { do: 'topic', subject, topic, ...(parent ? { parent } : {}), ...(props['контрольная'] ? { examDate: props['контрольная'] } : {}), ...('важная' in props ? { important: yes(props['важная']) } : {}), ...(props['новое название'] ? { rename: props['новое название'] } : {}) };
      const mode = props['конспект'] ? norm(props['конспект']) : '';
      const noteMode = /дописать|в конец|append/.test(mode) ? 'append' : /в начало|prepend/.test(mode) ? 'prepend' : 'replace';
      changes.push(base);
      block = {
        kind: 'note',
        buf: [],
        flush() {
          const body = trimBlock(this.buf);
          if (body.length) base.note = body.join('\n');
          if (body.length) base.noteMode = noteMode;
        }
      };
    } else if (word === 'конспект') {
      // «@конспект» после карточек — вернуться к тексту темы (дописать)
      if (!needTopic('Конспект')) continue;
      const c: Change = { do: 'topic', subject, topic, ...(parent ? { parent } : {}), noteMode: 'append' };
      block = {
        kind: 'note',
        buf: [],
        flush() {
          const body = trimBlock(this.buf);
          if (body.length) {
            c.note = body.join('\n');
            changes.push(c);
          }
        }
      };
    } else if (word === 'карточки') {
      if (!needTopic('Карточки')) continue;
      const c: Change = { do: 'cards', ...at(), cards: [] as unknown[], ...('заменить' in props ? { mode: 'replace' } : {}) };
      block = {
        kind: 'cards',
        buf: [],
        flush() {
          for (const l of this.buf) {
            const card = cardLine(l);
            if (card) (c.cards as unknown[]).push(card);
            else if (l.trim()) warnings.push(`Карточка без «::» пропущена: «${l.trim().slice(0, 60)}»`);
          }
          if ((c.cards as unknown[]).length) changes.push(c);
        }
      };
    } else if (word in LIST_WORDS || word === 'общие термины') {
      const glossary = word === 'общие термины';
      if (glossary ? !subject : !needTopic(word)) {
        if (glossary) warnings.push('Общие термины: перед ними нужна строка «@предмет …»');
        continue;
      }
      const cols = props['столбцы']?.split(',').map((x) => x.trim());
      const c: Change = glossary
        ? { do: 'glossary', subject, rows: [] as unknown[], ...('заменить' in props ? { replace: true } : {}) }
        : { do: 'list', ...at(), kind: LIST_WORDS[word], ...(name ? { title: name } : {}), ...(cols ? { columns: cols } : {}), ...(props['язык'] ? { lang: props['язык'] } : {}), ...('заменить' in props ? { replace: true } : {}), rows: [] as unknown[] };
      block = {
        kind: glossary ? 'glossary' : 'rows',
        buf: [],
        flush() {
          for (const l of this.buf) {
            const r = rowLine(l);
            if (r) (c.rows as unknown[]).push(r);
          }
          if ((c.rows as unknown[]).length) changes.push(c);
        }
      };
    } else if (word === 'правило') {
      if (!subject) {
        warnings.push(`Правило «${name}»: перед ним нужна строка «@предмет …»`);
        continue;
      }
      const c: Change = { do: 'rule', subject, name, ...(props['слова'] ? { words: props['слова'].split(',').map((x) => x.trim()).filter(Boolean) } : {}) };
      changes.push(c);
      block = {
        kind: 'rule',
        buf: [],
        flush() {
          const body = trimBlock(this.buf);
          if (body.length) c.text = body.join('\n');
        }
      };
    } else if (word === 'стих' || word === 'стихотворение') {
      if (!needTopic('Стихотворение')) continue;
      const c: Change = { do: 'poem', ...at(), title: name, ...(props['автор'] ? { author: props['автор'] } : {}) };
      block = {
        kind: 'poem',
        buf: [],
        flush() {
          const body = trimBlock(this.buf);
          if (body.length || name) {
            if (body.length) c.text = body.join('\n');
            changes.push(c);
          }
        }
      };
    } else if (word === 'домашка') {
      const sub = name || subject;
      block = {
        kind: 'homework',
        buf: [],
        flush() {
          for (const l of this.buf) {
            const t = l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
            if (!t) continue;
            const [text, due] = t.split('::').map((x) => x.trim());
            changes.push({ do: 'homework', ...(sub ? { subject: sub } : {}), text, ...(due ? { due } : {}) });
          }
        }
      };
    } else if (word === 'расписание') {
      block = {
        kind: 'schedule',
        buf: [],
        flush() {
          for (const l of this.buf) {
            const m = /^\s*([^:]+):\s*(.*)$/.exec(l);
            if (m) changes.push({ do: 'schedule', day: m[1].trim(), subjects: m[2].split(',').map((x) => x.trim()).filter(Boolean) });
          }
        }
      };
    } else if (word === 'удалить') {
      const m = /^(\S+)\s+(.+)$/.exec(name);
      const what = m && Object.prototype.hasOwnProperty.call(DELETE_WORDS, norm(m[1])) ? DELETE_WORDS[norm(m[1])] : undefined;
      if (!m || !what) {
        warnings.push(`«@удалить ${name}»: напиши, что удалить — тему, предмет, правило, карточку, термин, стих, папку`);
        continue;
      }
      changes.push({ do: 'delete', what, ...(subject ? { subject } : {}), ...(topic && what !== 'topic' && what !== 'rule' ? { topic, ...(parent ? { parent } : {}) } : {}), name: m[2].trim(), ...(what === 'card' ? { find: m[2].trim() } : {}) });
    }
  }
  block.flush();
  return { title, changes, warnings };
}

// ---------- Запись (выгрузка для нейросети) ----------

/** Поле карточки или строки списка: « :: » вне пропуска стал бы новым столбцом — делаем « : »;
 *  std::cout и подсказку внутри {{…}} оставляем как есть. */
const esc = (s: string) => {
  const one = s.replace(/\n+/g, ' ').trim();
  return scanCols(one, true).join(':').trim();
};
const escCard = esc;
/** Название в строке «@…»: палочка — «\|», чтобы не стать свойством. */
const nm = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|');
/** Текст конспекта, правила, стиха: строка с @ в начале не должна стать командой — ставим перед ней «\». */
const bodyText = (s: unknown) => String(s).replace(/^(\s*)(\\*@)/gm, '$1\\$2');

/** Пакет изменений → Мнема-текст: так нейросети проще прочитать и поправить готовое. */
export function toMnemaText(pack: ChangePack): string {
  const out: string[] = [];
  if (pack.title) out.push(`@название ${nm(pack.title)}`, '');
  let subject: string | undefined;
  for (const c of pack.changes) {
    const s = String(c.subject ?? (c.do === 'subject' ? c.name : '') ?? '');
    if (c.do === 'subject') {
      const props = [c.folder ? `папка: ${c.folder}` : '', c.color ? `цвет: ${c.color}` : '', c.icon ? `значок: ${c.icon}` : ''].filter(Boolean);
      if (c.folder) out.push(`@папка ${nm(c.folder)}`);
      out.push(`@предмет ${nm(c.name)}${props.filter((p) => !p.startsWith('папка')).length ? ' | ' + props.filter((p) => !p.startsWith('папка')).join(' | ') : ''}`, '');
      subject = String(c.name);
      continue;
    }
    if (s && s !== subject) {
      out.push(`@предмет ${nm(s)}`, '');
      subject = s;
    }
    const tp = c.parent ? ` | глава: ${c.parent}` : '';
    if (c.do === 'topic') {
      const props = [c.parent ? `глава: ${nm(c.parent)}` : '', c.examDate ? `контрольная: ${c.examDate}` : '', c.important ? 'важная: да' : ''].filter(Boolean);
      out.push(`@тема ${nm(c.topic)}${props.length ? ' | ' + props.join(' | ') : ''}`);
      if (c.note) out.push(bodyText(c.note));
      out.push('');
    } else if (c.do === 'cards') {
      out.push(`@карточки${tp ? '' : ''}`);
      for (const k of (c.cards as Record<string, string>[]) ?? []) {
        const [front, back, why] = [escCard(k.front ?? ''), escCard(k.back ?? ''), k.why ? escCard(k.why) : ''];
        // Карточка-пропуск без ответа — одной строкой, как её и пишут: «Столица — {{Москва::город}}».
        out.push(!back && !why && /\{\{.+?\}\}/.test(front) ? front : [front, back, why].filter((x, i) => i < 2 || x).join(' :: '));
      }
      out.push('');
    } else if (c.do === 'list') {
      const word = Object.entries(LIST_WORDS).find(([, v]) => v === c.kind)?.[0] ?? 'список';
      const cols = Array.isArray(c.columns) ? ` | столбцы: ${(c.columns as string[]).join(', ')}` : '';
      out.push(`@${word}${c.title ? ' ' + nm(c.title) : ''}${cols}`);
      for (const r of (c.rows as string[][]) ?? []) out.push(r.map((x) => esc(String(x ?? ''))).filter((x, i) => i < 2 || x).join(' :: '));
      out.push('');
    } else if (c.do === 'glossary') {
      out.push('@общие термины');
      for (const r of (c.rows as string[][]) ?? []) out.push(r.map((x) => esc(String(x ?? ''))).filter((x, i) => i < 2 || x).join(' :: '));
      out.push('');
    } else if (c.do === 'rule') {
      const words = Array.isArray(c.words) && c.words.length ? ` | слова: ${(c.words as string[]).join(', ')}` : '';
      out.push(`@правило ${nm(c.name)}${words}`);
      if (c.text) out.push(bodyText(c.text));
      out.push('');
    } else if (c.do === 'poem') {
      out.push(`@стих ${nm(c.title)}${c.author ? ` | автор: ${nm(c.author)}` : ''}`);
      if (c.text) out.push(bodyText(c.text));
      out.push('');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------- Инструкция для нейросети ----------

export const MNEMA_TEXT_GUIDE = `Ты помогаешь ученику с приложением «Мнема» (конспекты, карточки, повторение). Ответь ОДНИМ текстом в формате «Мнема-текст» — ученик загрузит его в Мнему, увидит, как всё будет выглядеть, и применит.

ФОРМАТ. Строки, которые начинаются с @, говорят, куда писать. Всё остальное — обычный текст.

@предмет Русский язык            ← предмет (есть — дополнится, нет — создастся)
@тема §1. Язык как развивающееся явление   ← тема; ниже до следующей @-строки — её конспект
(конспект в Markdown)
@карточки                         ← карточки этой темы, по одной в строке
Вопрос :: Ответ
Вопрос :: Ответ :: почему так (необязательно)
Столица России — {{Москва}}       ← карточка с пропуском
@термины                          ← термины этой темы
Термин :: Определение
@словарь  /  @даты  /  @формулы   ← так же, по строке: «слово :: перевод», «1812 :: Бородинское сражение», «Закон Ома :: $I = U/R$»

Ещё (если нужно):
@папка 7 класс                    ← папка для следующих предметов
@предмет Алгебра | цвет: синий | значок: 📐
@тема Задачи | глава: Глава 2 | контрольная: 2026-10-20   ← подтема главы; дата — ГГГГ-ММ-ДД
@общие термины                    ← термины всего предмета (не одной темы)
@правило Н и НН в прилагательных | слова: деревянный, стеклянный   ← правило предмета, ниже его текст
@стих Зимнее утро | автор: А. С. Пушкин   ← ниже текст стиха, строфы через пустую строку
@домашка                          ← строки «что задали :: 2026-10-01»
@расписание                       ← строки «пн: Алгебра, История»
@удалить тему §5 …                ← удалить (тему, предмет, правило, карточку, термин, стих, папку)
@карточки | заменить              ← оставить в теме только эти карточки (без «заменить» — добавить)
@тема … | конспект: дописать      ← дописать конспект, а не заменить

КАК ПИСАТЬ КОНСПЕКТ (Мнема это красиво показывает):
- ## и ### — разделы; **жирным** — главные понятия (Мнема сама найдёт их в «Важном»)
- > **Запомни:** … — рамка «Важное» для правил и выводов (используй для каждого правила)
- списки через «- », примеры отдельными строками, ==маркер== для самого главного
- таблицы в Markdown, если сравниваешь: | Часть речи | Вопросы | Пример |
- формулы: $a^2 + b^2 = c^2$
- коротко и по делу: одна тема — один параграф, конспект на 1–2 экрана

КАРТОЧКИ: одна карточка — один факт; вопрос понятен без конспекта; ответ короткий; 5–15 на тему. Определения — в @термины, а не в @карточки.
НЕ ставь «важная: да» и не удаляй ничего, если ученик прямо об этом не попросил.

ПРИМЕР:
@предмет Русский язык
@тема §12. Имя прилагательное
## Что это
**Имя прилагательное** — часть речи, которая обозначает признак предмета и отвечает на вопросы *какой? чей?*
> **Запомни:** прилагательное зависит от существительного и стоит в том же роде, числе и падеже.
## Разряды
| Разряд | Что обозначает | Пример |
|---|---|---|
| Качественные | признак, который бывает больше или меньше | красивый |
| Относительные | признак через отношение | деревянный |
| Притяжательные | принадлежность | лисий |
@термины
Имя прилагательное :: часть речи, обозначающая признак предмета
Качественное прилагательное :: обозначает признак, который бывает в большей или меньшей степени
@карточки
На какие вопросы отвечает прилагательное? :: Какой? Чей?
Какие бывают разряды прилагательных? :: Качественные, относительные, притяжательные

Ответь только таким текстом, без пояснений до и после.`;
