// Правила предмета в конспекте: слова-подсказки. Если в конспекте встречается слово, привязанное к правилу
// (в любой форме: «причастие», «причастия», «причастием»), оно подчёркивается, а при наведении всплывает правило.
import type { AppData, Topic } from './types';

export interface RuleMatcher {
  key: string;
  items: { id: string; re: RegExp }[];
}

const L = '\\p{L}\\p{N}';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Основа слова: без окончания, чтобы находить другие формы. */
export function stem(w: string): string {
  const s = w.toLowerCase().replace(/ё/g, 'е');
  if (s.length >= 7) return s.slice(0, -2);
  if (s.length >= 5) return s.slice(0, -1);
  return s;
}

/** Выражение для слова или фразы: последнее слово — по основе, остальные — как есть. */
function wordRe(word: string): string | null {
  const parts = word.trim().toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  if (!parts.length || parts.join('').length < 2) return null;
  const last = parts.pop()!;
  const head = parts.map((p) => esc(p) + '\\s+').join('');
  const st = stem(last);
  const tail = st.length < last.length ? esc(st) + `[${L}]{0,4}` : esc(last);
  return head + tail;
}

export function ruleWordsOf(t: Topic): string[] {
  return (t.ruleWords ?? []).map((w) => w.trim()).filter(Boolean);
}

/** Сборщик для конспектов одного предмета. null — если подсказывать нечего. */
export function makeRuleMatcher(data: AppData, subjectId: string, exceptId?: string): RuleMatcher | null {
  const rules = data.topics.filter((t) => t.subjectId === subjectId && t.kind === 'rule' && t.id !== exceptId && ruleWordsOf(t).length);
  if (!rules.length) return null;
  const items: RuleMatcher['items'] = [];
  for (const r of rules) {
    const alts = ruleWordsOf(r)
      .map(wordRe)
      .filter((x): x is string => Boolean(x))
      .sort((a, b) => b.length - a.length);
    if (!alts.length) continue;
    items.push({ id: r.id, re: new RegExp(`(?<![${L}])(?:${alts.join('|')})(?![${L}])`, 'giu') });
  }
  if (!items.length) return null;
  return { key: rules.map((r) => r.id + ':' + ruleWordsOf(r).join(',')).join('|'), items };
}

/** Где в тексте слова-подсказки. Пересечения не допускаются: побеждает то, что раньше. */
export function findRuleWords(text: string, m: RuleMatcher): { from: number; to: number; id: string }[] {
  const low = text.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
  const out: { from: number; to: number; id: string }[] = [];
  for (const it of m.items) {
    it.re.lastIndex = 0;
    for (const x of low.matchAll(it.re)) out.push({ from: x.index!, to: x.index! + x[0].length, id: it.id });
  }
  out.sort((a, b) => a.from - b.from || b.to - a.to);
  const res: typeof out = [];
  let end = -1;
  for (const r of out) {
    if (r.from < end) continue;
    res.push(r);
    end = r.to;
  }
  return res;
}

/** Формула простым текстом: \\frac{U}{I} → U/I. */
export function texPlain(f: string): string {
  return f
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\(?:cdot|times)/g, '·')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Первые строки правила простым текстом — для карточек и подсказок. */
export function rulePreview(note: string, max = 180): string {
  const t = note
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\$\$?([^$]*)\$\$?/g, (_m, f: string) => texPlain(f))
    .replace(/^\s*(?:[-*+]|\d+[.)]|#+|>)\s*/gm, '')
    .replace(/==|[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t;
}
