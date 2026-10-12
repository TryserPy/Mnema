// Формулы из ответа ИИ: каждую проверяем KaTeX и чиним частое (лишние $, юникод × · − ² ≤ → √, кириллица, скобки).
// Что починить не удалось — оставляем читаемым текстом в `коде`, а не красной ошибкой. Чистые функции (тесты — v130-textbook.test.ts).
import katex from 'katex';

const MAX_TEX = 600;
// То, чего в формуле из учебника быть не должно: свои макросы, ссылки, картинки, HTML-вставки.
const FORBIDDEN = /\\(?:def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|href|url|includegraphics|html\w*|write|input|include|csname|expandafter|read|catcode)\b/;

/** Формула разбирается KaTeX без ошибок (и не содержит запрещённого). */
export function validTex(tex: string, display = false): boolean {
  const t = tex.trim();
  if (!t || t.length > MAX_TEX || FORBIDDEN.test(t)) return false;
  try {
    katex.renderToString(t, { throwOnError: true, displayMode: display, strict: false, maxExpand: 300, maxSize: 30, trust: false });
    return true;
  } catch {
    return false;
  }
}

const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', 'ⁿ': 'n' };
const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-' };
const SYM: Record<string, string> = {
  '×': '\\times ', '·': '\\cdot ', '∙': '\\cdot ', '⋅': '\\cdot ', '÷': '\\div ', '−': '-', '–': '-', '—': '-', '±': '\\pm ', '∓': '\\mp ',
  '≤': '\\leq ', '≥': '\\geq ', '⩽': '\\leq ', '⩾': '\\geq ', '≠': '\\neq ', '≈': '\\approx ', '≡': '\\equiv ', '∼': '\\sim ', '∝': '\\propto ',
  '→': '\\to ', '←': '\\leftarrow ', '↔': '\\leftrightarrow ', '⇒': '\\Rightarrow ', '⇔': '\\Leftrightarrow ', '⇄': '\\rightleftarrows ', '⇌': '\\rightleftharpoons ', '↑': '\\uparrow ', '↓': '\\downarrow ',
  '∞': '\\infty ', '∈': '\\in ', '∉': '\\notin ', '⊂': '\\subset ', '⊃': '\\supset ', '∪': '\\cup ', '∩': '\\cap ', '∅': '\\varnothing ', '∀': '\\forall ', '∃': '\\exists ',
  '∑': '\\sum ', '∏': '\\prod ', '∫': '\\int ', '∂': '\\partial ', '∇': '\\nabla ', '∠': '\\angle ', '⊥': '\\perp ', '∥': '\\parallel ', '△': '\\triangle ',
  '°': '^\\circ ', '′': "'", '″': "''", '‰': '\\text{‰}', '…': '\\ldots ', '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ',
  α: '\\alpha ', β: '\\beta ', γ: '\\gamma ', δ: '\\delta ', ε: '\\varepsilon ', ζ: '\\zeta ', η: '\\eta ', θ: '\\theta ', λ: '\\lambda ', μ: '\\mu ', ν: '\\nu ', ξ: '\\xi ', π: '\\pi ', ρ: '\\rho ', σ: '\\sigma ', τ: '\\tau ', φ: '\\varphi ', χ: '\\chi ', ψ: '\\psi ', ω: '\\omega ',
  Γ: '\\Gamma ', Δ: '\\Delta ', Θ: '\\Theta ', Λ: '\\Lambda ', Ξ: '\\Xi ', Π: '\\Pi ', Σ: '\\Sigma ', Φ: '\\Phi ', Ψ: '\\Psi ', Ω: '\\Omega ', '∆': '\\Delta ', '\u2126': '\\Omega ', '\u00b5': '\\mu '
};

/** Юникод-знаки → LaTeX: степени, индексы, ×, ≤, →, греческие буквы, √. */
export function unicodeToTex(s: string): string {
  let t = s;
  // Подряд идущие надстрочные/подстрочные знаки — в одну степень/индекс.
  t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ]+/g, (m) => {
    const v = [...m].map((c) => SUP[c] ?? '').join('');
    return `^{${v}}`;
  });
  t = t.replace(/[₀₁₂₃₄₅₆₇₈₉₊₋]+/g, (m) => `_{${[...m].map((c) => SUB[c] ?? '').join('')}}`);
  // Корень: √(…) , √x , √123
  t = t.replace(/√\s*\(([^()]*)\)/g, '\\sqrt{$1}').replace(/√\s*([A-Za-z0-9.,]+)/g, '\\sqrt{$1}').replace(/√/g, '\\sqrt{}');
  // «°C», «°F» — единица: градус и буква.
  t = t.replace(/°\s*([CFК])\b/g, (_m, c: string) => `^\\circ\\text{${c === 'К' ? 'K' : c}}`);
  let out = '';
  for (const ch of t) out += SYM[ch] ?? ch;
  return out;
}

/** Кириллица в формуле — обычным текстом: \text{кг}, \text{Дано}. */
export function wrapCyrillic(tex: string): string {
  const isCyr = (c: string) => /[А-Яа-яЁё]/.test(c);
  if (!/[А-Яа-яЁё]/.test(tex)) return tex;
  let out = '';
  let i = 0;
  while (i < tex.length) {
    // уже внутри \text{…} и подобных — пропускаем целиком
    const m = /^\\(?:text|textrm|mathrm|mbox|operatorname|textbf|textit)\s*\{/.exec(tex.slice(i));
    if (m) {
      let depth = 1;
      let j = i + m[0].length;
      while (j < tex.length && depth) {
        if (tex[j] === '{') depth++;
        else if (tex[j] === '}') depth--;
        j++;
      }
      out += tex.slice(i, j);
      i = j;
      continue;
    }
    if (isCyr(tex[i])) {
      // слово или несколько слов через пробел/дефис
      let j = i;
      while (j < tex.length && (isCyr(tex[j]) || ((tex[j] === ' ' || tex[j] === '-') && j + 1 < tex.length && isCyr(tex[j + 1])))) j++;
      out += `\\text{${tex.slice(i, j)}}`;
      i = j;
      continue;
    }
    out += tex[i];
    i++;
  }
  return out;
}

/** Скобки { } сбалансированы: лишние закрывающие убираем, недостающие дописываем. */
export function balanceBraces(tex: string): string {
  let depth = 0;
  let out = '';
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i];
    if (c === '\\') {
      out += c + (tex[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      if (!depth) continue;
      depth--;
    }
    out += c;
  }
  return out + '}'.repeat(depth);
}

const RU_FUNCS: Record<string, string> = { tg: '\\operatorname{tg}', ctg: '\\operatorname{ctg}', arctg: '\\operatorname{arctg}', arcctg: '\\operatorname{arcctg}' };

/** Частые мелочи: sin → \sin, sqrt(x) → \sqrt{x}, x^10 → x^{10}, % → \%, лишние & #. */
export function patchTex(tex: string): string {
  let t = tex;
  t = t.replace(/(?<![\\A-Za-z])sqrt\s*\(([^()]*)\)/g, '\\sqrt{$1}');
  t = t.replace(/(?<![\\A-Za-z])(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|log|ln|lg|exp)(?![A-Za-z])/g, '\\$1');
  t = t.replace(/(?<![\\A-Za-z])(arcctg|arctg|ctg|tg)(?![A-Za-z])/g, (_m, f: string) => RU_FUNCS[f]);
  t = t.replace(/\^(-?\d{2,})/g, '^{$1}').replace(/_(-?\d{2,})(?![\d}])/g, '_{$1}');
  t = t.replace(/(?<!\\)%/g, '\\%').replace(/(?<!\\)#/g, '\\#');
  // «&» вне таблиц и «\\» в конце — лишние
  if (!/\\begin\{/.test(t)) t = t.replace(/(?<!\\)&/g, ' ').replace(/(\\\\\s*)+$/, '');
  // \left без \right и наоборот — обычные скобки
  const lefts = (t.match(/\\left\b/g) ?? []).length;
  const rights = (t.match(/\\right\b/g) ?? []).length;
  if (lefts !== rights) t = t.replace(/\\left\s*(?=[([|.])/g, '').replace(/\\right\s*(?=[)\]|.])/g, '');
  return t.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Пытается сделать из строки правильную формулу. Возвращает починенный TeX или null, если не вышло.
 * Сначала как есть, потом по шагам (каждый шаг проверяется).
 */
export function repairTex(raw: string, display = false): string | null {
  let t = raw.replace(/^\s*\$+|\$+\s*$/g, '').replace(/^\\[([]|\\[)\]]$/g, '').trim();
  t = t.replace(/\\\(|\\\)|\\\[|\\\]/g, '').trim();
  if (!t) return null;
  // Всегда приводим к красивому виду (кириллица, sin, юникод), если после этого формула остаётся правильной.
  const nice = patchTex(wrapCyrillic(unicodeToTex(t)));
  if (validTex(nice, display)) return nice;
  if (validTex(t, display)) return t;
  const steps: ((s: string) => string)[] = [unicodeToTex, wrapCyrillic, patchTex, balanceBraces];
  let cur = t;
  for (const f of steps) {
    cur = f(cur);
    if (validTex(cur, display)) return cur.trim();
  }
  // Все шаги сразу в другом порядке (скобки до кириллицы).
  const alt = wrapCyrillic(patchTex(balanceBraces(unicodeToTex(t))));
  return validTex(alt, display) ? alt.trim() : null;
}

/** Формула, которую не удалось починить, — читаемым текстом: LaTeX-команды → знаки, фигурные скобки долой. */
export function texToPlain(tex: string): string {
  return tex
    .replace(/\\(?:text|mathrm|operatorname|mathbf|mathit)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\(leq|le)\b/g, '≤')
    .replace(/\\(geq|ge)\b/g, '≥')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\(?:to|rightarrow)\b/g, '→')
    .replace(/\\circ\b/g, '°')
    .replace(/\\[a-zA-Z]+\s?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MathReport {
  md: string;
  /** Формул всего. */
  total: number;
  /** Починено (были с ошибкой или оформлением). */
  fixed: number;
  /** Не починились — оставлены `кодом`. */
  bad: number;
}

/** Обратные кавычки в тексте формулы не нужны: заменяем на одинарные, чтобы не порвать `код`. */
const codeSpan = (s: string) => '`' + s.replace(/`/g, "'").replace(/\s+/g, ' ').trim() + '`';

/** Одна строка (не в блоке ```): находим $…$ и $$…$$, проверяем. */
function fixLine(line: string, rep: MathReport): string {
  // 1. \( … \) и \[ … \] → $ … $ и $$ … $$
  let s = line.replace(/\\\(([\s\S]+?)\\\)/g, (_m, t: string) => `$${t}$`).replace(/\\\[([\s\S]+?)\\\]/g, (_m, t: string) => `$$${t}$$`);
  if (!s.includes('$')) return s;
  // Экранированные \$ — обычные доллары, прячем на время.
  const ESC = '\u0001';
  s = s.replace(/\\\$/g, ESC);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    // `код` не трогаем
    if (c === '`') {
      const e = s.indexOf('`', i + 1);
      if (e > 0) {
        out += s.slice(i, e + 1);
        i = e + 1;
        continue;
      }
    }
    if (c !== '$') {
      out += c;
      i++;
      continue;
    }
    // «5 $ и 6 $» — доллары в тексте, а не формула
    if (/\d\s*$/.test(s.slice(Math.max(0, i - 4), i)) && /\s/.test(s[i + 1] ?? ' ')) {
      out += '\\$';
      i++;
      continue;
    }
    const dbl = s[i + 1] === '$';
    const open = dbl ? 2 : 1;
    // ищем закрывающую пару того же вида
    let j = i + open;
    let end = -1;
    while (j < s.length) {
      if (s[j] === '$') {
        if (dbl ? s[j + 1] === '$' : true) {
          end = j;
          break;
        }
      }
      j++;
    }
    if (end < 0) {
      // одинокий «$»: если рядом число — это доллары, иначе мусор
      out += /\d/.test(s[i - 1] ?? '') || /\d/.test(s[i + 1] ?? '') ? '\\$' : '';
      i += 1;
      continue;
    }
    const inner = s.slice(i + open, end);
    if (!inner.trim()) {
      i = end + open;
      continue;
    }
    rep.total++;
    const whole = dbl && s.trim() === s.slice(i, end + 2).trim();
    const fixed = repairTex(inner, dbl);
    const ok = fixed === inner.trim();
    if (fixed === null) {
      rep.bad++;
      out += codeSpan(texToPlain(inner.replace(new RegExp(ESC, 'g'), '$')));
    } else {
      if (!ok || inner !== inner.trim()) rep.fixed++;
      // Целая строка из $$ … $$ остаётся блоком, внутри строки $$ … $$ → $ … $ (блоку нужна своя строка).
      out += whole ? `$$${fixed}$$` : `$${fixed}$`;
    }
    i = end + open;
  }
  return out.replace(new RegExp(ESC, 'g'), '\\$');
}

/**
 * Проверяет и чинит все формулы в Markdown. Блоки ``` и `код` не трогает.
 * Многострочные $$ … $$ собираем в одну формулу.
 */
export function fixFormulas(md: string): MathReport {
  const rep: MathReport = { md: '', total: 0, fixed: 0, bad: 0 };
  const lines = md.split('\n');
  const out: string[] = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*(```|~~~)/.test(ln)) {
      fence = !fence;
      out.push(ln);
      continue;
    }
    if (fence) {
      out.push(ln);
      continue;
    }
    // Блок $$ на нескольких строках.
    if (/^\s*\$\$\s*$/.test(ln)) {
      let j = i + 1;
      const body: string[] = [];
      while (j < lines.length && !/^\s*\$\$\s*$/.test(lines[j])) body.push(lines[j++]);
      if (j < lines.length) {
        const inner = body.join(' ').trim();
        i = j;
        if (!inner) continue;
        rep.total++;
        const fixed = repairTex(inner, true);
        const ok = fixed === inner;
        if (fixed === null) {
          rep.bad++;
          out.push(codeSpan(texToPlain(inner)));
        } else {
          if (!ok) rep.fixed++;
          out.push(`$$${fixed}$$`);
        }
        continue;
      }
    }
    out.push(fixLine(ln, rep));
  }
  rep.md = out.join('\n');
  return rep;
}
