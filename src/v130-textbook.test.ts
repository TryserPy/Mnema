// «Из учебника» 1.30: режимы конспекта, таблицы, формулы, рисунки, снимок «как в жизни». Чистые функции, без сети.
import { describe, expect, it } from 'vitest';
import { fixTables, splitRow, tableTrouble } from './textbookTables';
import { balanceBraces, fixFormulas, repairTex, unicodeToTex, validTex, wrapCyrillic } from './textbookMath';

describe('таблицы: починка', () => {
  const ok = '| Орган | Функция |\n| --- | --- |\n| Сердце | Насос |';
  it('ровная таблица остаётся', () => {
    expect(fixTables(ok)).toBe(ok);
  });
  it('нет строки-разделителя', () => {
    const r = fixTables('| Орган | Функция |\n| Сердце | Насос |\n| Лёгкие | Дыхание |');
    expect(r.split('\n')[1]).toMatch(/^\| --- \| --- \|$/);
    expect(r.split('\n')).toHaveLength(4);
  });
  it('нет крайних «|»', () => {
    const r = fixTables('Орган | Функция\n--- | ---\nСердце | Насос');
    expect(r).toBe(ok);
  });
  it('разное число ячеек: добавляет пустые, лишние склеивает в последнюю', () => {
    const r = fixTables('| A | B | C |\n|---|---|---|\n| 1 | 2 |\n| 1 | 2 | 3 | 4 |').split('\n');
    expect(r[2]).toBe('| 1 | 2 |  |');
    expect(r[3]).toBe('| 1 | 2 | 3 / 4 |');
  });
  it('«|» внутри формулы и кода не делит ячейку', () => {
    expect(splitRow('| $|x|$ | `a|b` | текст |')).toEqual(['$|x|$', '`a|b`', 'текст']);
    expect(splitRow('| a \\| b | c |')).toEqual(['a \\| b', 'c']);
  });
  it('пустые строки внутри таблицы убираются, пустая строка-«призрак» тоже', () => {
    const r = fixTables('| A | B |\n|---|---|\n| 1 | 2 |\n\n| 3 | 4 |\n|  |  |\n| 5 | 6 |');
    expect(r.split('\n')).toEqual(['| A | B |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |', '| 5 | 6 |']);
  });
  it('две таблицы с пустой строкой между ними остаются двумя', () => {
    const r = fixTables('| A | B |\n|---|---|\n| 1 | 2 |\n\n| C | D |\n|---|---|\n| 3 | 4 |');
    expect(r.split('\n\n')).toHaveLength(2);
  });
  it('выравнивание ячеек сохраняется', () => {
    expect(fixTables('| A | B |\n|:---:|---:|\n| 1 | 2 |').split('\n')[1]).toBe('| :---: | ---: |');
  });
  it('обычный текст с одним «|» не становится таблицей; код и $$ не трогаются', () => {
    const t = 'Скажи так: а | б.\n\n```\n| x | y |\n| 1 | 2 |\n```\n\n$$\n|x| = 3\n$$';
    expect(fixTables(t)).toBe(t);
  });
  it('таблица внутри текста отделяется пустыми строками', () => {
    const r = fixTables('Вот:\n| A | B |\n|---|---|\n| 1 | 2 |\nДальше текст.');
    expect(r).toBe('Вот:\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nДальше текст.');
  });
  it('рассыпавшаяся таблица замечается', () => {
    expect(tableTrouble(ok)).toEqual({ tables: 1, broken: 0 });
    expect(tableTrouble('| A | B |\n| --- | --- |\n|  |  |\n|  | x |\n|  |  |').broken).toBe(1);
  });
});

describe('формулы: KaTeX и починка', () => {
  it('правильная формула проходит как есть', () => {
    expect(fixFormulas('Скорость $v = \\frac{s}{t}$.')).toMatchObject({ md: 'Скорость $v = \\frac{s}{t}$.', total: 1, fixed: 0, bad: 0 });
  });
  it('юникод превращается в LaTeX', () => {
    expect(unicodeToTex('a × b ≤ c')).toContain('\\times');
    expect(unicodeToTex('x²')).toBe('x^{2}');
    expect(unicodeToTex('H₂O')).toBe('H_{2}O');
    expect(unicodeToTex('√(a+b)')).toBe('\\sqrt{a+b}');
    expect(unicodeToTex('20 °C')).toContain('^\\circ\\text{C}');
    const r = fixFormulas('Путь $s = v · t$ при $a ≥ 0$ и $F = m·a$.');
    expect(r.bad).toBe(0);
    expect(r.md).toContain('\\cdot');
    expect(r.md).toContain('\\geq');
  });
  it('пробелы после $ и \\( \\) \\[ \\] приводятся к виду $…$', () => {
    expect(fixFormulas('Это \\(x^2\\) и $ y $.').md).toBe('Это $x^2$ и $y$.');
    expect(fixFormulas('\\[E = mc^2\\]').md).toBe('$$E = mc^2$$');
  });
  it('кириллица внутри формулы — \\text{}', () => {
    expect(wrapCyrillic('5 кг')).toBe('5 \\text{кг}');
    const r = fixFormulas('Масса $m = 5 кг$.');
    expect(r.md).toBe('Масса $m = 5 \\text{кг}$.');
    expect(r.bad).toBe(0);
  });
  it('скобки: недостающие дописываются, лишние убираются', () => {
    expect(balanceBraces('\\frac{a}{b')).toBe('\\frac{a}{b}');
    expect(balanceBraces('a}{b')).toBe('a{b}');
    expect(repairTex('\\frac{a}{b')).toBe('\\frac{a}{b}');
  });
  it('sin, sqrt(x), x^10, %', () => {
    expect(repairTex('sin x + sqrt(2)')).toBe('\\sin x + \\sqrt{2}');
    expect(repairTex('x^10')).toBe('x^{10}');
    expect(validTex(repairTex('p = 50%')!)).toBe(true);
  });
  it('неисправимое — `кодом`, а не красной ошибкой', () => {
    const r = fixFormulas('Странно: $\\frac{a}{\\nonsense b}$ ну и ладно.');
    expect(r.bad).toBe(1);
    expect(r.md).not.toContain('$');
    expect(r.md).toMatch(/`[^`]+`/);
  });
  it('опасные макросы и ссылки не проходят', () => {
    expect(validTex('\\href{http://x}{y}')).toBe(false);
    expect(validTex('\\def\\a{b}\\a')).toBe(false);
    expect(fixFormulas('$\\includegraphics{x}$').bad).toBe(1);
    expect(validTex('a'.repeat(700))).toBe(false);
  });
  it('доллары в тексте не считаются формулой', () => {
    const r = fixFormulas('Цена 5 $ и 6 $ за штуку.');
    expect(r.total).toBe(0);
    expect(r.md).toContain('\\$');
  });
  it('блок $$ на нескольких строках и внутри ``` не ломается', () => {
    expect(fixFormulas('$$\nE = mc^2\n$$').md).toBe('$$E = mc^2$$');
    const code = '```\n$x ≤ y$\n```';
    expect(fixFormulas(code).md).toBe(code);
    expect(fixFormulas('`$a$`').md).toBe('`$a$`');
  });
  it('$$ посреди строки становится $', () => {
    expect(fixFormulas('Тогда $$x+1$$ всегда.').md).toBe('Тогда $x+1$ всегда.');
  });
});
