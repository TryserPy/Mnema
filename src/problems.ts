// «Задачи с новыми числами»: в условии переменные {U=10..220}, в ответе формула {=U/R}.
// При каждом повторении числа новые — запоминаешь способ решения, а не ответ.

export interface ProblemVar {
  name: string;
  min: number;
  max: number;
  step: number;
}

const VAR_RE = /\{([A-Za-zА-Яа-яЁё_][\wА-Яа-яЁё]*)\s*=\s*(-?\d+(?:[.,]\d+)?)\s*\.\.\s*(-?\d+(?:[.,]\d+)?)(?:\s*(?::|шаг)\s*(\d+(?:[.,]\d+)?))?\}/g;
const EXPR_RE = /\{=\s*([^{}]+?)\s*\}/g;

const num = (s: string) => Number(s.replace(',', '.'));

export function problemVars(text: string): ProblemVar[] {
  const out: ProblemVar[] = [];
  for (const m of text.matchAll(VAR_RE)) {
    const min = num(m[2]);
    const max = num(m[3]);
    const step = m[4] ? num(m[4]) : Number.isInteger(min) && Number.isInteger(max) ? 1 : 0.1;
    if (!out.some((v) => v.name === m[1])) out.push({ name: m[1], min: Math.min(min, max), max: Math.max(min, max), step: step > 0 ? step : 1 });
  }
  return out;
}

/** Случайные значения; seed — чтобы в одном показе числа не прыгали. */
export function pickValues(vars: ProblemVar[], seed: number): Record<string, number> {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
  const out: Record<string, number> = {};
  for (const v of vars) {
    const n = Math.floor((v.max - v.min) / v.step + 1e-9) + 1;
    const k = Math.floor(rnd() * n);
    out[v.name] = roundTo(v.min + k * v.step, 6);
  }
  return out;
}

function roundTo(x: number, digits: number) {
  const p = 10 ** digits;
  return Math.round(x * p) / p;
}

/** Число по-русски: запятая, до 3 значащих знаков после запятой. */
export function formatNumber(x: number): string {
  if (!Number.isFinite(x)) return '—';
  const abs = Math.abs(x);
  const digits = abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
  let r = roundTo(x, digits).toString();
  if (r.includes('e')) r = x.toPrecision(3);
  return r.replace('.', ',');
}

// ---------- Безопасный калькулятор: числа, + - * / ^, скобки, sqrt, sin, cos, tan, abs, pi ----------

type Tok = { t: 'n'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:[.,]\d+)?(?:e-?\d+)?)|([A-Za-zА-Яа-яЁё_][\wА-Яа-яЁё]*)|(\*\*|[-+*/^()·×:]))/gy;
  let m: RegExpExecArray | null;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(pos))) break;
      throw new Error('Не понял формулу: ' + src.slice(pos, pos + 10));
    }
    pos = re.lastIndex;
    if (m[1]) out.push({ t: 'n', v: num(m[1]) });
    else if (m[2]) out.push({ t: 'id', v: m[2] });
    else if (m[3]) out.push({ t: 'op', v: m[3] === '**' ? '^' : m[3] === '·' || m[3] === '×' ? '*' : m[3] === ':' ? '/' : m[3] });
  }
  return out;
}

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  корень: Math.sqrt,
  abs: Math.abs,
  sin: (x) => Math.sin((x * Math.PI) / 180),
  cos: (x) => Math.cos((x * Math.PI) / 180),
  tan: (x) => Math.tan((x * Math.PI) / 180),
  tg: (x) => Math.tan((x * Math.PI) / 180),
  ln: Math.log,
  lg: Math.log10,
  round: Math.round
};

export function evaluate(expr: string, vars: Record<string, number>): number {
  const toks = tokenize(expr);
  let i = 0;
  const peek = () => toks[i];
  const take = () => toks[i++];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  function primary(): number {
    const t = take();
    if (!t) throw new Error('Формула обрывается');
    if (t.t === 'n') return t.v;
    if (t.t === 'op' && t.v === '(') {
      const v = sum();
      if (!isOp(')')) throw new Error('Нет закрывающей скобки');
      take();
      return v;
    }
    if (t.t === 'op' && t.v === '-') return -power();
    if (t.t === 'op' && t.v === '+') return power();
    if (t.t === 'id') {
      const name = t.v;
      if (FUNCS[name.toLowerCase()] && isOp('(')) {
        take();
        const v = sum();
        if (!isOp(')')) throw new Error('Нет закрывающей скобки');
        take();
        return FUNCS[name.toLowerCase()](v);
      }
      if (/^(pi|пи)$/i.test(name)) return Math.PI;
      if (name === 'g' && !(name in vars)) return 9.8;
      if (name in vars) return vars[name];
      throw new Error(`Нет переменной «${name}»`);
    }
    throw new Error('Не понял формулу');
  }
  function power(): number {
    const b = primary();
    if (isOp('^')) {
      take();
      return b ** unary();
    }
    return b;
  }
  function unary(): number {
    if (isOp('-')) {
      take();
      return -unary();
    }
    return power();
  }
  function product(): number {
    let v = unary();
    for (;;) {
      if (isOp('*')) {
        take();
        v *= unary();
      } else if (isOp('/')) {
        take();
        v /= unary();
      } else if (peek() && (peek()!.t === 'id' || peek()!.t === 'n' || (peek()!.t === 'op' && peek()!.v === '('))) {
        v *= unary(); // неявное умножение: 2U, m g
      } else return v;
    }
  }
  function sum(): number {
    let v = product();
    for (;;) {
      if (isOp('+')) {
        take();
        v += product();
      } else if (isOp('-')) {
        take();
        v -= product();
      } else return v;
    }
  }
  const v = sum();
  if (i < toks.length) throw new Error('Лишнее в формуле');
  return v;
}

export interface ProblemInstance {
  question: string;
  answer: string; // ответ с подставленными числами (Markdown)
  expected: number[]; // числа, которые надо получить
}

/** Условие и ответ с конкретными числами. */
export function instantiate(front: string, back: string, seed: number): ProblemInstance {
  const vars = problemVars(front);
  const vals = pickValues(vars, seed);
  const question = front.replace(VAR_RE, (_m, name: string) => formatNumber(vals[name]));
  const expected: number[] = [];
  const answer = back.replace(EXPR_RE, (_m, expr: string) => {
    try {
      const v = evaluate(expr, vals);
      expected.push(v);
      return `**${formatNumber(v)}**`;
    } catch (e) {
      return `⚠ ${(e as Error).message}`;
    }
  });
  return { question, answer, expected };
}

/** Проверка введённого числа: допуск 1% (и округление до сотых). */
export function checkNumber(input: string, expected: number[]): boolean | undefined {
  const m = /-?\d+(?:[.,]\d+)?/.exec(input.replace(/\s/g, ''));
  if (!m || expected.length === 0) return undefined;
  const x = num(m[0]);
  return expected.some((e) => Math.abs(x - e) <= Math.max(Math.abs(e) * 0.01, 0.005));
}

/** Ошибки в шаблоне задачи — показываются в редакторе. */
export function problemErrors(front: string, back: string): string[] {
  const errs: string[] = [];
  const vars = problemVars(front);
  if (vars.length === 0) errs.push('В условии нет чисел-переменных. Пример: {U=10..220}');
  if (!EXPR_RE.test(back)) errs.push('В ответе нет формулы. Пример: {=U/R}');
  EXPR_RE.lastIndex = 0;
  const vals = pickValues(vars, 1);
  for (const m of back.matchAll(EXPR_RE)) {
    try {
      evaluate(m[1], vals);
    } catch (e) {
      errs.push((e as Error).message);
    }
  }
  return errs;
}
