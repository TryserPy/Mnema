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

// ---------- Режимы конспекта ----------
import { assembleMerged, extractiveNote, finalNote, isNoteStyle, mergeInput, mergeSystem, pageSystem, parseMerged, READ_SYSTEM } from './textbookNote';
import { isDecorative, normalizeCaption, refineFigureBox, remapFigureMarks, tidyFigures } from './textbookFigures';
import { judgeAiAnswer, parseAiMarkdown, type PageResult } from './textbookText';

const page = (n: number, markdown: string, figs: { caption: string }[] = []): PageResult => ({
  n,
  photo: '',
  markdown,
  figures: figs.map((f) => ({ box: { x: 0.1, y: 0.1, w: 0.5, h: 0.3 }, caption: f.caption, uri: 'data:image/png;base64,AAAA' })),
  doubts: []
});

const SAMPLE = `[стр. 47]

## § 12. Теплопроводность

Если один конец железного стержня нагреть в пламени, то через некоторое время нагреется и другой его конец. Значит, внутренняя энергия передаётся от одной части тела к другой. Это явление наблюдали ещё в древности, и оно часто встречается в быту: например, ручка металлической кастрюли становится горячей.

Такой способ передачи энергии называют **теплопроводностью**. При теплопроводности вещество не перемещается вдоль тела: переносится только энергия. Опыты показывают, что скорость передачи зависит от материала.

Хорошо проводят теплоту металлы, хуже — жидкости, а хуже всех — газы. Воздух между волокнами шерсти плохо проводит теплоту, поэтому в шерстяной одежде тепло. Птицы зимой распушают перья, и воздушная прослойка защищает их от холода.

![Рис. 25. Нагревание стержня](data:image/png;base64,AAAA)
*Рис. 25. Нагревание стержня*

![Рисунок](data:image/png;base64,BBBB)
*Рисунок*

Количество теплоты, которое получает тело при нагревании, вычисляют по формуле:

$$Q = c \\cdot m \\cdot (t_2 - t_1)$$

где c — удельная теплоёмкость вещества, m — масса тела. Измеряется она в джоулях на килограмм-градус.

> **Запомните:** Теплопроводность — это перенос энергии от более нагретых частей тела к менее нагретым.

| Вещество | Теплопроводность |
| --- | --- |
| Медь | высокая |
| Воздух | низкая |

### Вопросы

1. Как передаётся энергия в твёрдых телах?
2. Почему шерсть греет?

## § 13. Конвекция

Конвекцией называют перенос энергии потоками жидкости или газа. Тёплый воздух легче холодного, поэтому он поднимается вверх. Так появляется ветер у берега моря в 1861 г. и в другие годы.`;

describe('режимы конспекта: указания ИИ', () => {
  it('«Конспект» не требует переписывать дословно, а «Дословно» требует', () => {
    expect(pageSystem('summary')).not.toMatch(/дословно/i);
    expect(pageSystem('summary')).toMatch(/20–35%/);
    expect(pageSystem('summary')).toMatch(/\*\*Термин\*\* — определение/);
    expect(pageSystem('summary')).toMatch(/таблицей/);
    expect(pageSystem('summary')).toMatch(/> \*\*Запомните:\*\*/);
    expect(pageSystem('brief')).toMatch(/5–10 пунктов/);
    expect(pageSystem('verbatim')).toBe(READ_SYSTEM);
    expect(READ_SYSTEM).toMatch(/точно/);
  });
  it('указания про формулы, колонки, врезки, сноски и подписи', () => {
    for (const s of [READ_SYSTEM, pageSystem('summary'), pageSystem('brief')]) {
      expect(s).toMatch(/\\frac/);
      expect(s).toMatch(/\\text\{кг\}/);
      expect(s).toMatch(/колонк/);
      expect(s).toMatch(/Сноск/);
      expect(s).toMatch(/Подпись/);
      expect(s).toMatch(/РИСУНОК/);
    }
  });
  it('второй запрос: связный конспект по всему параграфу, с метками страниц и рисунков', () => {
    const m = mergeSystem('summary');
    expect(m).toMatch(/ОДИН связный конспект/);
    expect(m).toMatch(/\[стр\. N\]/);
    expect(m).toMatch(/\[\[РИС p\.i\]\]/);
  });
  it('isNoteStyle', () => {
    expect(isNoteStyle('summary') && isNoteStyle('brief') && isNoteStyle('verbatim')).toBe(true);
    expect(isNoteStyle('x') || isNoteStyle(undefined)).toBe(false);
  });
});

describe('сведение страниц вторым запросом', () => {
  const pages = [page(47, 'Текст первой.\n\n⟦РИС:0⟧\n\nЕщё.', [{ caption: 'Рис. 1. Опыт' }]), page(48, 'Текст второй.\n\n⟦РИС:0⟧', [{ caption: '' }])];
  it('текст для ИИ: метки страниц и рисунков', () => {
    const [c] = mergeInput(pages);
    expect(c.text).toContain('[стр. 47]');
    expect(c.text).toContain('[[РИС 1.1 | Рис. 1. Опыт]]');
    expect(c.text).toContain('[[РИС 2.1]]');
  });
  it('длинный параграф делится на части по страницам', () => {
    const big = Array.from({ length: 6 }, (_, i) => page(i + 1, 'Слово '.repeat(1500)));
    const chunks = mergeInput(big);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.text.match(/\[стр\./g)!.length).reduce((a, b) => a + b, 0)).toBe(6);
  });
  it('ответ ИИ: оставляет настоящие метки, чужие страницы и рисунки убирает, повтор рисунка — один раз', () => {
    const raw = '```markdown\n## § 12\n\n[стр. 47]\n\n- Главная мысль первой страницы, которая достаточно длинная.\n\n[[РИС 1.1]]\n\n[[РИС 1.1]]\n\n[[РИС 9.9]]\n\n[стр. 99]\n\n- Мысль второй.\n```';
    const v = parseMerged(raw, pages, 400);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.markdown).toContain('[стр. 47]');
    expect(v.markdown).not.toContain('[стр. 99]');
    expect(v.markdown.match(/⟦Ф:1\.1⟧/g)).toHaveLength(1);
    expect(v.markdown).not.toContain('9.9');
    expect(v.markdown).not.toContain('```');
  });
  it('кривые ответы: отказ, пусто, пересказ длиннее учебника', () => {
    expect(parseMerged('', pages, 400).ok).toBe(false);
    expect(parseMerged('К сожалению, я не могу составить конспект.', pages, 400).ok).toBe(false);
    expect(parseMerged('- ' + 'длинный пересказ '.repeat(200), pages, 1000).ok).toBe(false);
  });
  it('метки заменяются картинками с подписью; скрытый рисунок исчезает', () => {
    const md = assembleMerged('## Тема\n\n- пункт\n\n⟦Ф:1.1⟧\n\n[стр. 48]\n\n⟦Ф:2.1⟧', pages);
    expect(md).toContain('![Рис. 1. Опыт](data:image/png;base64,AAAA)\n*Рис. 1. Опыт*');
    expect(md).toContain('![Рисунок](');
    pages[0].figures[0].hidden = true;
    expect(assembleMerged('⟦Ф:1.1⟧ текст', pages)).not.toContain('Опыт');
    pages[0].figures[0].hidden = false;
  });
  it('HTML в сведённом конспекте обезвреживается', () => {
    const v = parseMerged('- <script>alert(1)</script>Важная мысль о теплопроводности металлов.\n- [ссылка](http://evil.example) и ещё мысль о конвекции.', pages, 500);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.markdown).not.toMatch(/script|evil|http/);
  });
});

describe('конспект без интернета (извлекающий)', () => {
  const sum = extractiveNote(SAMPLE, 'summary');
  const brief = extractiveNote(SAMPLE, 'brief');
  it('короче учебника, структура и важное на месте', () => {
    expect(sum.length).toBeLessThan(SAMPLE.length * 0.7);
    expect(sum).toContain('## § 12. Теплопроводность');
    expect(sum).toContain('## § 13. Конвекция');
    expect(sum).toContain('**теплопроводностью**');
    expect(sum).toContain('> **Запомните:**');
    expect(sum).toContain('$$Q = c');
    expect(sum).toContain('| Медь | высокая |');
    expect(sum).toContain('[стр. 47]');
    expect(sum).toMatch(/^- /m);
  });
  it('вопросы после параграфа и безымянный рисунок не берутся, рисунок с подписью — берётся', () => {
    expect(sum).not.toContain('Как передаётся энергия');
    expect(sum).not.toContain('BBBB');
    expect(sum).toContain('Рис. 25. Нагревание стержня');
  });
  it('«Кратко» заметно короче «Конспекта» и без картинок и таблиц', () => {
    expect(brief.length).toBeLessThan(sum.length * 0.75);
    expect(brief).not.toContain('data:image');
    expect(brief).toContain('> **Запомните:**');
    expect(brief).toContain('$$Q = c');
    expect((brief.match(/^- /gm) ?? []).length).toBeLessThanOrEqual(12);
  });
  it('определение «X — это Y» становится «**X** — Y», а перечисление через тире — нет', () => {
    const t = extractiveNote('## Тема\n\nКлетка — это наименьшая единица строения организма. Хорошо проводят теплоту металлы, хуже — жидкости, а хуже всех — газы.', 'summary');
    expect(t).toContain('**Клетка** — наименьшая единица строения организма.');
    expect(t).not.toMatch(/\*\*Хорошо/);
  });
  it('заголовки без содержимого и пустые метки страниц убираются', () => {
    const t = extractiveNote('[стр. 1]\n\n## Пустой\n\n[стр. 2]\n\n## Нужный\n\nТакой способ называют **теплопроводностью**.', 'summary');
    expect(t).not.toContain('Пустой');
    expect(t).not.toContain('[стр. 1]');
    expect(t).toContain('Нужный');
  });
  it('пустой текст не падает', () => {
    expect(extractiveNote('', 'summary')).toBe('');
  });
  it('finalNote: без интернета честно сказано про грубость; «Дословно» отдаёт весь текст', () => {
    const pg = [page(47, 'Такой способ называют **теплопроводностью**. ' + 'Другое предложение. '.repeat(30))];
    const a = finalNote(pg, {}, { style: 'summary', engine: 'offline', summary: null });
    expect(a.note).toMatch(/грубее/);
    expect(a.markdown.length).toBeLessThan(pg[0].markdown.length);
    const b = finalNote(pg, {}, { style: 'verbatim', engine: 'offline', summary: null });
    expect(b.note).toBe('');
    expect(b.markdown).toContain('Другое предложение');
    const c = finalNote(pg, {}, { style: 'summary', engine: 'ai', summary: '- пункт ИИ' });
    expect(c.markdown).toBe('- пункт ИИ');
    expect(c.note).toBe('');
  });
  it('finalNote чинит таблицы и формулы в итоге', () => {
    const r = finalNote([page(1, 'Масса $m = 5 кг$ и таблица:\n\n| A | B |\n| 1 | 2 |')], {}, { style: 'verbatim', engine: 'ai', summary: null });
    expect(r.markdown).toContain('\\text{кг}');
    expect(r.markdown).toContain('| --- | --- |');
  });
});

describe('ответ ИИ: таблицы и формулы чинятся сразу', () => {
  it('parseAiMarkdown: кривая таблица и юникод в формуле', () => {
    const p = parseAiMarkdown('## Тема\n\nОрган | Функция\nСердце | Насос\n\nСила $F = m × a$ и \\(v ≤ c\\).');
    expect(p.markdown).toContain('| Орган | Функция |');
    expect(p.markdown).toContain('| --- | --- |');
    expect(p.markdown).toContain('\\times');
    expect(p.markdown).toContain('\\leq');
    expect(p.markdown).not.toContain('×');
  });
  it('<br> внутри ячейки не рвёт строку таблицы', () => {
    const p = parseAiMarkdown('| A | B |\n|---|---|\n| раз<br>два | три |');
    expect(p.markdown).toContain('| раз; два | три |');
  });
  it('judgeAiAnswer: обёртка ``` снимается, формулы проходят KaTeX', () => {
    const v = judgeAiAnswer('```markdown\n## § 3\n\nСкорость $v = \\frac{s}{t}$ постоянна на участке пути.\n```');
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.parsed.markdown).not.toContain('```');
      expect(v.parsed.markdown).toContain('\\frac{s}{t}');
    }
  });
});

// ---------- Рисунки ----------

/** Белая страница w×h; рисунок — рамка с цветной заливкой и «деталями». */
function canvas(w: number, h: number) {
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  const rect = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d.set([...c, 255], (y * w + x) * 4);
  };
  const frame = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number] = [30, 30, 30]) => {
    rect(x0, y0, x1, y0 + 3, c);
    rect(x0, y1 - 3, x1, y1, c);
    rect(x0, y0, x0 + 3, y1, c);
    rect(x1 - 3, y0, x1, y1, c);
  };
  return { d, w, h, rect, frame };
}

describe('рисунки: уточнение рамки по пикселям', () => {
  const W = 800;
  const H = 1000;
  const mk = () => {
    const c = canvas(W, H);
    // рисунок: рамка 200..600 × 300..600 и круг-деталь внутри
    c.frame(200, 300, 600, 600);
    c.rect(300, 380, 420, 500, [200, 50, 50]);
    c.rect(450, 420, 560, 560, [40, 80, 200]);
    // текст-подпись ниже, с зазором
    for (let k = 0; k < 2; k++) c.rect(210, 625 + k * 22, 560, 636 + k * 22, [40, 40, 40]);
    return c;
  };
  const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;
  it('лишние поля срезаются (рамка ИИ с большим запасом)', () => {
    const c = mk();
    const r = refineFigureBox(c.d, W, H, { x: 0.15, y: 0.26, w: 0.7, h: 0.36 })!;
    expect(r).not.toBeNull();
    // слева было 0.15, а рисунок с 0.25
    expect(r.box.x).toBeGreaterThan(0.22);
    expect(near(r.box.x, 0.25, 0.03)).toBe(true);
    expect(near(r.box.x + r.box.w, 0.75, 0.03)).toBe(true);
    expect(near(r.box.y, 0.3, 0.03)).toBe(true);
    // подпись внизу в рамку не попала
    expect(r.box.y + r.box.h).toBeLessThan(0.625);
  });
  it('обрезанный рисунок расширяется до его краёв, но не захватывает подпись', () => {
    const c = mk();
    const r = refineFigureBox(c.d, W, H, { x: 0.3, y: 0.34, w: 0.38, h: 0.2 })!;
    expect(r.box.x).toBeLessThan(0.27);
    expect(r.box.x + r.box.w).toBeGreaterThan(0.73);
    expect(r.box.y).toBeLessThan(0.32);
    expect(r.box.y + r.box.h).toBeGreaterThan(0.58);
    expect(r.box.y + r.box.h).toBeLessThan(0.625);
  });
  it('пустое место — null', () => {
    const c = canvas(W, H);
    expect(refineFigureBox(c.d, W, H, { x: 0.1, y: 0.1, w: 0.3, h: 0.2 })).toBeNull();
  });
  it('цветной рисунок на тёмном фоне и светлая заливка тоже находятся', () => {
    const c = canvas(W, H);
    c.rect(100, 100, 500, 400, [230, 240, 255]); // бледная заливка
    c.rect(180, 160, 300, 300, [200, 40, 40]);
    const r = refineFigureBox(c.d, W, H, { x: 0.1, y: 0.08, w: 0.6, h: 0.36 })!;
    expect(r).not.toBeNull();
    expect(r.box.w).toBeLessThan(0.45);
  });
  it('мелочь и украшения отбрасываются', () => {
    expect(isDecorative({ x: 0.1, y: 0.1, w: 0.04, h: 0.03 }, 0.2, 800, 1000)).toBe(true); // значок
    expect(isDecorative({ x: 0.1, y: 0.5, w: 0.8, h: 0.01 }, 0.9, 800, 1000)).toBe(true); // линия
    expect(isDecorative({ x: 0.1, y: 0.5, w: 0.5, h: 0.3 }, 0.003, 800, 1000)).toBe(true); // пусто
    expect(isDecorative({ x: 0.1, y: 0.3, w: 0.5, h: 0.3 }, 0.12, 800, 1000)).toBe(false);
  });
  it('tidyFigures: мелкие уходят, повтор склеивается, карта соответствий', () => {
    const c = mk();
    c.rect(20, 20, 40, 34, [10, 10, 10]); // значок
    const res = tidyFigures(c.d, W, H, [
      { box: { x: 0.15, y: 0.26, w: 0.7, h: 0.36 }, caption: 'рис 3 - нагревание стержня' },
      { box: { x: 0.01, y: 0.01, w: 0.08, h: 0.04 }, caption: '' }, // значок
      { box: { x: 0.2, y: 0.28, w: 0.6, h: 0.34 }, caption: '' } // тот же рисунок
    ]);
    expect(res.figures).toHaveLength(1);
    expect(res.map).toEqual([0, -1, 0]);
    expect(res.figures[0].caption).toBe('Рис. 3. нагревание стержня');
    expect(res.dropped).toBe(1);
  });
  it('метки в тексте правятся по карте', () => {
    expect(remapFigureMarks('а\n\n⟦РИС:0⟧\n\nб\n\n⟦РИС:1⟧\n\nв\n\n⟦РИС:2⟧', [0, -1, 0])).toBe('а\n\n⟦РИС:0⟧\n\nб\n\nв');
  });
  it('подписи: «Рис. N. …»', () => {
    expect(normalizeCaption('Рис 12 Строение клетки')).toBe('Рис. 12. Строение клетки');
    expect(normalizeCaption('рис.5 — Опыт')).toBe('Рис. 5. Опыт');
    expect(normalizeCaption('**Схема 2.** Путь армии')).toBe('Схема 2. Путь армии');
    expect(normalizeCaption('Просто подпись')).toBe('Просто подпись');
    expect(normalizeCaption('  ')).toBe('');
    expect(normalizeCaption('x'.repeat(300)).length).toBeLessThanOrEqual(160);
  });
});
