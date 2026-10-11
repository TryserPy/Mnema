// Конспект по фото: исправление текста, раскладка страницы (колонки, абзацы, списки, рамки), сборка, ответ ИИ, картинка.
import { describe, expect, it } from 'vitest';
import { analyzeRegions, strokeStat } from './textbookRegions';
import { boxBlur, findPageQuad, flattenLight, mapQuad, medianGlyphHeight, otsu, quadSize, rgbaToGray, skewOf, squareToQuad, warpQuad, type Gray, type Quad } from './textbookImage';
import { assemble, buildPage, fixOcrText, findGutters, isSoftHyphen, joinLines, judgeAiAnswer, mergeRows, neutralizeHtml, parseAiMarkdown, sanitizeAiText, splitAtGutters, type OcrLine, type PageResult } from './textbookText';

// ---------- помощники: строки «как из Tesseract» ----------

const CH = 15; // ширина знака, px
function line(x0: number, y: number, text: string, o: { block?: number; h?: number; conf?: number; gap?: number; bold?: boolean | ((w: string) => boolean) } = {}): OcrLine {
  const h = o.h ?? 26;
  const gap = o.gap ?? 14;
  let x = x0;
  const words = text.split(' ').map((t) => {
    const w = { text: t, bbox: { x0: x, y0: y, x1: x + t.length * CH, y1: y + h }, conf: o.conf ?? 95, bold: typeof o.bold === 'function' ? o.bold(t) : o.bold };
    x += t.length * CH + gap;
    return w;
  });
  return { bbox: { x0, y0: y, x1: x - gap, y1: y + h }, para: 0, block: o.block ?? 0, base: [x0, y + h - 5, x - gap, y + h - 5], words };
}

describe('fixOcrText', () => {
  it('латинские двойники внутри русских слов', () => {
    expect(fixOcrText('Pоссия отстaвала')).toBe('Россия отставала');
  });
  it('целые короткие слова латиницей в русской строке', () => {
    expect(fixOcrText('Это было OT века и Ha земле')).toContain('от века');
    expect(fixOcrText('Это было OT века и Ha земле')).toContain('на земле');
  });
  it('одинокая «B» между русскими словами — «в», а переменная в формуле остаётся', () => {
    expect(fixOcrText('участвуют B синтезе белка')).toBe('участвуют в синтезе белка');
    expect(fixOcrText('где $c$ — масса, c = 3')).toContain('c = 3');
  });
  it('цифры-двойники в русском слове', () => {
    expect(fixOcrText('Пол0жение тела')).toBe('Положение тела');
    expect(fixOcrText('в 1861 году')).toBe('в 1861 году');
  });
  it('буквы-двойники в числе', () => {
    expect(fixOcrText('в l861 году')).toBe('в 1861 году');
    expect(fixOcrText('в 19О5 г.')).toBe('в 1905 г.');
    expect(fixOcrText('около 2З млн')).toBe('около 23 млн');
  });
  it('знак параграфа', () => {
    expect(fixOcrText('## $ 7. Отмена крепостного права')).toBe('## § 7. Отмена крепостного права');
  });
  it('римские цифры после имени и тире', () => {
    expect(fixOcrText('император Александр П подписал')).toContain('Александр II');
    expect(fixOcrText('Москва - столица')).toBe('Москва — столица');
    expect(fixOcrText('в 1853-1856 годах')).toContain('1853–1856');
  });
  it('маркер списка в начале строки не превращается в тире', () => {
    expect(fixOcrText('- один;\n- два.')).toBe('- один;\n- два.');
  });
  it('формулы и числа не трогает', () => {
    const f = 'где $Q = c m (t_2 - t_1)$ и 3,5 кг';
    expect(fixOcrText(f)).toBe(f);
  });
  it('не ломает метки сомнительных слов и картинки', () => {
    const s = 'слово ⟦?:d3⟧ и ![Рис. 1](data:image/png;base64,AAAA)';
    expect(fixOcrText(s)).toBe(s);
  });
});

describe('переносы и склейка строк', () => {
  it('«тепло-» + «ты» → «теплоты»', () => {
    expect(joinLines(['при передаче тепло-', 'ты телу'])).toBe('при передаче теплоты телу');
  });
  it('частицы остаются через дефис', () => {
    expect(isSoftHyphen('кто-', 'то')).toBe(false);
    expect(isSoftHyphen('из-', 'за')).toBe(false);
    expect(isSoftHyphen('разви-', 'тие')).toBe(true);
    expect(isSoftHyphen('разви-', 'Тие')).toBe(false);
  });
  it('обычные строки склеиваются пробелом', () => {
    expect(joinLines(['раз', 'два', ''])).toBe('раз два');
  });
});

describe('колонки и порядок чтения', () => {
  // Две колонки по 8 строк, зазор ~ 90 px; сверху — полноширинный заголовок и абзац.
  const left = Array.from({ length: 8 }, (_, i) => line(100, 400 + i * 50, `левая строка номер ${i + 1} слова слова`, { block: 10 + (i >> 2) }));
  const right = Array.from({ length: 8 }, (_, i) => line(760, 400 + i * 50, `правая строка номер ${i + 1} слова слова`, { block: 20 + (i >> 2) }));
  const head = line(100, 100, '§ 5. Строение клетки', { h: 40 });
  const intro = [line(100, 200, 'Вводный абзац идёт через обе колонки и занимает всю ширину страницы целиком, до самого края', { block: 2 }), line(100, 250, 'и ещё строка вводного абзаца такая же длинная как предыдущая строка выше нас тут', { block: 2 })];
  const lines = [head, ...intro, ...left, ...right];

  it('находит просвет между колонками', () => {
    const gs = findGutters(lines, 30);
    expect(gs.length).toBe(1);
    expect(gs[0].x0).toBeGreaterThan(500);
    expect(gs[0].x1).toBeLessThan(780);
  });
  it('строка, захватившая обе колонки, рвётся по просвету, а обрывки одной колонки склеиваются', () => {
    const wide = line(100, 900, 'левый хвост слова слова', { block: 30 });
    const r = line(760, 900, 'правый хвост слова слова', { block: 30 });
    const merged = { ...wide, words: [...wide.words, ...r.words], bbox: { ...wide.bbox, x1: r.bbox.x1 } };
    const all = [...lines, merged];
    const gs = findGutters(all, 30);
    const split = splitAtGutters(all, gs);
    expect(split.length).toBe(all.length + 1);
    const pieces = [line(100, 1000, 'Хорошо', { block: 40 }), line(300, 1000, 'проводят теплоту', { block: 41 })];
    const joined = mergeRows([...pieces, ...left, ...right], findGutters([...pieces, ...left, ...right], 30), 30);
    expect(joined.some((l) => l.words.map((w) => w.text).join(' ') === 'Хорошо проводят теплоту')).toBe(true);
  });
  it('сначала левая колонка целиком, потом правая; заголовок — первым', () => {
    const md = buildPage({ lines, width: 1400, height: 1600, figures: [] }).markdown;
    expect(md.startsWith('## § 5. Строение клетки')).toBe(true);
    const iL1 = md.indexOf('левая строка номер 1');
    const iL8 = md.indexOf('левая строка номер 8');
    const iR1 = md.indexOf('правая строка номер 1');
    expect(iL1).toBeGreaterThan(0);
    expect(iL8).toBeGreaterThan(iL1);
    expect(iR1).toBeGreaterThan(iL8);
    expect(md.indexOf('Вводный абзац')).toBeLessThan(iL1);
  });
});

describe('абзацы, списки, рамки, формулы', () => {
  const body = (y: number, text: string, extra: Partial<Parameters<typeof line>[3]> = {}) => line(100, y, text, { block: 1, ...extra });
  it('склеивает строки в абзац и убирает перенос', () => {
    const ls = [body(300, 'Теплота передаётся при теплопроводности вещество не перемещается и тепло-'), body(350, 'ты хватает на всё что нужно в этом мире и ещё немного сверх этого'), body(400, 'Конец.')];
    const md = buildPage({ lines: ls, width: 1400, height: 1600, figures: [] }).markdown;
    expect(md).toContain('и теплоты хватает');
    expect(md.split('\n\n').length).toBe(1);
  });
  it('рвёт абзац по короткой строке с точкой и красной строке', () => {
    const ls = [
      body(300, 'Первый абзац состоит из нескольких строк текста которые идут подряд друг за другом'),
      body(350, 'и заканчивается короткой.'),
      line(140, 400, 'Второй абзац начинается с отступа и тоже тянется до самого правого поля страницы', { block: 1 }),
      body(450, 'Третья строка второго абзаца доходит до правого поля страницы без всяких пробелов тут')
    ];
    const md = buildPage({ lines: ls, width: 1400, height: 1600, figures: [] }).markdown;
    expect(md.split('\n\n').length).toBe(2);
  });
  it('номер страницы и колонтитул уходят из текста', () => {
    const ls = [line(100, 40, 'Тепловые явления', { block: 0, h: 20 }), body(300, 'Просто текст страницы, достаточно длинный чтобы быть абзацем этой страницы'), body(350, 'и продолжение этого текста до конца страницы здесь и дальше вот'), line(700, 1500, '83', { block: 9 })];
    const r = buildPage({ lines: ls, width: 1400, height: 1600, figures: [] });
    expect(r.markdown).not.toContain('Тепловые');
    expect(r.markdown).not.toContain('83');
    expect(r.detectedPage).toBe(83);
  });
  it('список: маркер-«®», нумерация и продолжение строки', () => {
    const marker = (y: number, t: string, bullet = '®') => {
      const l = line(140, y, t, { block: 2 });
      const b = { text: bullet, bbox: { x0: 100, y0: y + 6, x1: 112, y1: y + 18 }, conf: 90 };
      return { ...l, words: [b, ...l.words], bbox: { ...l.bbox, x0: 100 } };
    };
    const ls = [body(300, 'Примеры теплопроводности перечислены ниже в этом списке для наглядности:'), marker(350, 'нагревание ложки в горячем'), line(140, 400, 'чае;', { block: 2 }), marker(450, 'остывание кирпичной стены;'), marker(500, 'таяние льда на ладони.')];
    const md = buildPage({ lines: ls, width: 1400, height: 1600, figures: [] }).markdown;
    expect(md).toContain('- нагревание ложки в горячем чае;\n- остывание кирпичной стены;\n- таяние льда на ладони.');
  });
  it('рамка «Запомните» — цитатой с жирным названием', () => {
    const ls = [body(300, 'Обычный абзац перед рамкой, он длинный и доходит до самого правого поля страницы.'), line(100, 420, 'Запомните', { block: 3, bold: true }), line(100, 470, 'Теплопроводность — это перенос энергии от нагретых частей тела к менее нагретым', { block: 3 })];
    const md = buildPage({ lines: ls, width: 1400, height: 1600, figures: [] }).markdown;
    expect(md).toContain('> **Запомните:** Теплопроводность — это перенос энергии');
  });
  it('жирный термин остаётся жирным, знак препинания — снаружи', () => {
    const ls = [body(300, 'Такой способ называют теплопроводностью. Дальше идёт длинный текст предложения до края', { bold: (w) => w.startsWith('теплопроводностью') })];
    const md = buildPage({ lines: ls, width: 1400, height: 1600, figures: [] }).markdown;
    expect(md).toContain('называют **теплопроводностью**. Дальше');
  });
  it('формула в $$…$$, русский текст рядом — нет', () => {
    const ls = [body(300, 'Количество теплоты вычисляют по формуле следующим образом из учебника по физике:'), line(300, 360, 'Q = c · m · (t2 - t1)', { block: 4 }), body(420, 'где c — удельная теплоёмкость вещества, а m — масса тела которое нагревают')];
    const md = buildPage({ lines: ls, width: 1400, height: 1600, figures: [] }).markdown;
    expect(md).toMatch(/\$\$Q = c \\cdot m \\cdot \(t_2 - t_1\)\$\$/);
    expect(md).toContain('где c — удельная');
  });
  it('заголовок по размеру букв, подзаголовок по жирному, § в начале', () => {
    const ls = [line(100, 100, '$ 7. Отмена крепостного права', { block: 1, h: 44 }), body(200, 'Текст абзаца идёт сразу после заголовка и доходит до самого края правого поля'), line(100, 260, 'Части клетки', { block: 2, bold: true, h: 28 }), body(310, 'Ещё текст который идёт после подзаголовка и тянется до самого правого поля тут')];
    const md = buildPage({ lines: ls, width: 1400, height: 1600, figures: [] }).markdown;
    expect(md).toContain('## § 7. Отмена крепостного права');
    expect(md).toContain('### Части клетки');
  });
  it('шум и осколки не попадают в конспект', () => {
    const ls = [body(300, 'Нормальный текст страницы, который нужно сохранить целиком и без потерь тут'), line(100, 600, '|', { block: 5, conf: 30 }), line(100, 650, 'Shee о О', { block: 6, conf: 28 })];
    const md = buildPage({ lines: ls, width: 1400, height: 1600, figures: [] }).markdown;
    expect(md).not.toContain('Shee');
    expect(md).not.toContain('|');
  });
  it('слова с низкой уверенностью → метки для проверки', () => {
    const l = line(100, 300, 'Хороший текст страницы содержит слово сомнительное тут ещё', { block: 1 });
    l.words[5].conf = 40;
    const r = buildPage({ lines: [l], width: 1400, height: 1600, figures: [] });
    expect(r.doubts.length).toBe(1);
    expect(r.doubts[0].text).toBe('сомнительное');
    expect(r.markdown).toContain('⟦?:d0⟧');
  });
  it('рисунок идёт на своё место, подпись переходит в рисунок', () => {
    const ls = [body(300, 'Абзац над рисунком, он длинный и доходит до самого правого поля страницы тут'), line(100, 760, 'Рис. 25. Нагревание стержня', { block: 7, h: 22 }), body(850, 'Абзац под рисунком, тоже длинный и тянется до самого правого поля страницы')];
    const r = buildPage({ lines: ls, width: 1400, height: 1600, figures: [{ x0: 100, y0: 420, x1: 700, y1: 740 }] });
    expect(r.markdown).toContain('⟦РИС:0⟧');
    expect(r.markdown.indexOf('над рисунком')).toBeLessThan(r.markdown.indexOf('⟦РИС:0⟧'));
    expect(r.markdown.indexOf('⟦РИС:0⟧')).toBeLessThan(r.markdown.indexOf('под рисунком'));
    expect(r.captions[0]).toBe('Рис. 25. Нагревание стержня');
    expect(r.markdown).not.toContain('Нагревание стержня');
  });
  it('пустая страница не падает', () => {
    expect(buildPage({ lines: [], width: 100, height: 100, figures: [] }).markdown).toBe('');
  });
});

describe('assemble', () => {
  const page = (n: number, markdown: string, extra: Partial<PageResult> = {}): PageResult => ({ n, photo: '', markdown, figures: [], doubts: [], ...extra });
  it('метки страниц и исправленные слова', () => {
    const md = assemble([page(3, 'Слово ⟦?:d0⟧ тут.', { doubts: [{ id: 'd0', text: 'сомнит', crop: '' }] })], { '3:d0': 'сомнительное' });
    expect(md).toBe('[стр. 3]\n\nСлово сомнительное тут.');
    expect(assemble([page(3, 'Слово ⟦?:d0⟧ тут.', { doubts: [{ id: 'd0', text: 'сомнит', crop: '' }] })], {})).toContain('сомнит');
  });
  it('рисунок с подписью → картинка и курсив', () => {
    const md = assemble([page(1, 'Текст.\n\n⟦РИС:0⟧', { figures: [{ box: { x: 0, y: 0, w: 1, h: 1 }, caption: 'Рис. 1. Клетка', uri: 'data:image/png;base64,AAAA' }] })], {});
    expect(md).toContain('![Рис. 1. Клетка](data:image/png;base64,AAAA)');
    expect(md).toContain('*Рис. 1. Клетка*');
    expect(md).toContain('AAAA)\n*Рис. 1. Клетка*');
  });
  it('рисунок без подписи тоже получает строку подписи (одиночная картинка ломает редактор)', () => {
    const md = assemble([page(1, '⟦РИС:0⟧', { figures: [{ box: { x: 0, y: 0, w: 1, h: 1 }, caption: '', uri: 'data:image/png;base64,AAAA' }] })], {});
    expect(md).toContain('AAAA)\n*Рисунок*');
  });
  it('абзац, разорванный между страницами, склеивается', () => {
    const md = assemble([page(1, 'Первая страница заканчивается на полусло-'), page(2, 'ве и продолжается дальше.\n\nНовый абзац.')], {});
    expect(md).toContain('полуслове и продолжается дальше.');
    expect(md).toContain('[стр. 2]');
    expect(md).toContain('Новый абзац.');
  });
  it('не склеивает с заголовком и списком', () => {
    const md = assemble([page(1, '## Заголовок'), page(2, 'продолжение маленькими буквами')], {});
    expect(md).toBe('[стр. 1]\n\n## Заголовок\n\n[стр. 2]\n\nпродолжение маленькими буквами');
  });
  it('пустые страницы пропускаются', () => {
    expect(assemble([page(1, ''), page(2, 'Текст.')], {})).toBe('[стр. 2]\n\nТекст.');
  });
  it('сырой HTML не проходит', () => {
    expect(assemble([page(1, 'Строка <script>alert(1)</script> и <img src=x onerror=alert(1)> а 5 < 6')], {})).not.toMatch(/<script|<img/i);
  });
});

describe('ответ ИИ: безопасность и разбор', () => {
  it('HTML, ссылки и картинки вычищаются, формулы остаются', () => {
    const t = sanitizeAiText('Текст <b onclick="x()">жирный</b> <script>steal()</script> [ссылка](javascript:alert(1)) ![](http://evil/p.png) $a<b$');
    expect(t).not.toMatch(/<b onclick|<script|javascript:|evil|steal/);
    expect(t).toContain('жирный');
    expect(t).toContain('ссылка');
    expect(t).toContain('$a<b$');
  });
  it('обёртка ``` снимается', () => {
    expect(parseAiMarkdown('```markdown\n## Заголовок\n\nТекст.\n```').markdown).toBe('## Заголовок\n\nТекст.');
  });
  it('заголовок первого уровня → «##», списки, рамки', () => {
    const md = parseAiMarkdown('# § 5. Клетка\n\n• первый\n* второй\n\nЗапомните: клетка — единица жизни.').markdown;
    expect(md).toContain('## § 5. Клетка');
    expect(md).toContain('- первый\n- второй');
    expect(md).toContain('> **Запомните:** клетка — единица жизни.');
  });
  it('рисунки: рамка в тысячных, в долях и в процентах; страница; пусто', () => {
    const r = parseAiMarkdown('Текст.\n\n[[РИСУНОК 100 200 500 600 | Рис. 1. Клетка]]\n\n[[РИСУНОК 0.1 0.2 0.5 0.6]]\n\n[[СТРАНИЦА 47]]');
    expect(r.figures.length).toBe(2);
    expect(r.figures[0].caption).toBe('Рис. 1. Клетка');
    expect(r.figures[0].box.x).toBeCloseTo(0.088, 2);
    expect(r.figures[1].box.w).toBeCloseTo(0.424, 2);
    expect(r.markdown).toContain('⟦РИС:0⟧');
    expect(r.detectedPage).toBe(47);
    expect(parseAiMarkdown('[[ПУСТО]]').empty).toBe(true);
  });
  it('\\( \\) и \\[ \\] → $…$', () => {
    expect(parseAiMarkdown('Формула \\(F = ma\\) и\n\n\\[E = mc^2\\]').markdown).toBe('Формула $F = ma$ и\n\n$$E = mc^2$$');
  });
  it('судья: хороший ответ принимает', () => {
    const v = judgeAiAnswer('## § 7. Отмена крепостного права\n\nВ середине XIX века Россия отставала от европейских стран. Поражение в **Крымской войне** показало, что прежние порядки мешают развитию страны.\n\n> **Запомните:** Реформа 1861 г. освободила около 23 млн крестьян.');
    expect(v.ok).toBe(true);
  });
  it.each([
    ['пустой', ''],
    ['отказ', 'К сожалению, я не могу прочитать это изображение.'],
    ['json', '{"text": "страница", "blocks": [1, 2, 3]}'],
    ['английский', 'This page of the textbook describes the abolition of serfdom in Russia in 1861. '.repeat(6)],
    ['зацикливание', Array.from({ length: 12 }, () => 'Реформа 1861 года освободила крестьян.').join('\n')],
    ['сломанная разметка', Array.from({ length: 8 }, (_, i) => `Строка ${i} с **незакрытым жирным и ещё текст тут`).join('\n\n')],
    ['одна строка', 'Слово '.repeat(900)]
  ])('судья: %s → откат на офлайн', (_n, text) => {
    expect(judgeAiAnswer(text).ok).toBe(false);
  });
  it('судья: «пусто» не откатывается, а сообщается', () => {
    const v = judgeAiAnswer('[[ПУСТО]]');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.empty).toBe(true);
  });
  it('neutralizeHtml экранирует «<» перед буквой, но не трогает формулы', () => {
    expect(neutralizeHtml('a <b>c</b> $x<y$ и 3 < 4')).toBe('a &lt;b>c&lt;/b> $x<y$ и 3 < 4');
  });
});

// ---------- картинка ----------

function rgbaOf(w: number, h: number, f: (x: number, y: number) => [number, number, number]) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      const i = (y * w + x) * 4;
      a[i] = r;
      a[i + 1] = g;
      a[i + 2] = b;
      a[i + 3] = 255;
    }
  return a;
}
const grayOf = (w: number, h: number, f: (x: number, y: number) => number): Gray => {
  const d = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = f(x, y);
  return { w, h, d };
};

describe('картинка: страница на столе, перспектива, свет, наклон', () => {
  it('проективное отображение переводит углы квадрата в углы четырёхугольника', () => {
    const q: Quad = [{ x: 10, y: 20 }, { x: 210, y: 10 }, { x: 230, y: 310 }, { x: 0, y: 290 }];
    const m = squareToQuad(q);
    const c = [mapQuad(m, 0, 0), mapQuad(m, 1, 0), mapQuad(m, 1, 1), mapQuad(m, 0, 1)];
    c.forEach((p, i) => {
      expect(p.x).toBeCloseTo(q[i].x, 5);
      expect(p.y).toBeCloseTo(q[i].y, 5);
    });
    expect(quadSize(q).w).toBeGreaterThan(200);
  });
  it('находит светлую страницу на тёмном столе, не находит, когда страница во весь кадр', () => {
    const W = 600;
    const H = 800;
    // Страница: повёрнутый светлый прямоугольник.
    const inside = (x: number, y: number) => {
      const a = (-4 * Math.PI) / 180;
      const dx = x - 300;
      const dy = y - 400;
      const u = dx * Math.cos(a) - dy * Math.sin(a);
      const v = dx * Math.sin(a) + dy * Math.cos(a);
      return Math.abs(u) < 220 && Math.abs(v) < 310;
    };
    const g = grayOf(W, H, (x, y) => (inside(x, y) ? 225 : 70));
    const q = findPageQuad(g);
    expect(q).not.toBeNull();
    if (q) {
      expect(Math.abs(q[0].x - 80)).toBeLessThan(40);
      expect(q[2].x).toBeGreaterThan(480);
    }
    expect(findPageQuad(grayOf(W, H, () => 220))).toBeNull();
  });
  it('выпрямление: полоса, наклонённая перспективой, становится прямоугольной', async () => {
    const src = rgbaOf(300, 300, (x, y) => (x > 100 && x < 200 && y > 100 && y < 200 ? [0, 0, 0] : [255, 255, 255]));
    const q: Quad = [{ x: 50, y: 50 }, { x: 250, y: 50 }, { x: 250, y: 250 }, { x: 50, y: 250 }];
    const out = await warpQuad(src, 300, 300, q, 100, 100);
    // Чёрный квадрат занимает середину (25%..75%) выпрямленной картинки.
    expect(out[(50 * 100 + 50) * 4]).toBe(0);
    expect(out[(5 * 100 + 5) * 4]).toBe(255);
  });
  it('выравнивание света: градиент и тень исчезают, текст остаётся тёмным', async () => {
    const W = 400;
    const H = 300;
    const rgba = rgbaOf(W, H, (x, y) => {
      const light = 90 + (x / W) * 165; // от тёмного края к светлому
      const ink = x % 40 < 3 && y > 100 && y < 140; // штрихи текста
      const v = ink ? light * 0.25 : light;
      return [v, v, v];
    });
    const { gray } = await flattenLight(rgba, W, H);
    const bg = [gray.d[10 * W + 20], gray.d[10 * W + 380], gray.d[250 * W + 200]];
    for (const v of bg) expect(v).toBeGreaterThan(225);
    expect(gray.d[120 * W + 41]).toBeLessThan(120);
  });
  it('наклон строк находится и по знаку, и по величине', () => {
    const mk = (deg: number) => {
      const t = Math.tan((deg * Math.PI) / 180);
      return grayOf(500, 500, (x, y) => {
        const yy = y - x * t;
        return Math.floor(yy / 20) % 2 === 0 && Math.floor(yy) % 20 < 6 ? 30 : 250;
      });
    };
    expect(skewOf(mk(0))).toBe(0);
    expect(skewOf(mk(3))).toBeGreaterThan(2.4);
    expect(skewOf(mk(3))).toBeLessThan(3.6);
    expect(skewOf(mk(-4))).toBeLessThan(-3.2);
  });
  it('размер букв: медиана высоты пятен', () => {
    const g = grayOf(600, 300, (x, y) => ((x % 30) < 12 && (y % 50) < 20 && y < 250 ? 20 : 250));
    expect(medianGlyphHeight(g)).toBeGreaterThan(17);
    expect(medianGlyphHeight(g)).toBeLessThan(23);
  });
  it('штрих жирного слова толще обычного', () => {
    const w = 120;
    const mk = (stem: number) => grayOf(w, 40, (x, y) => (y > 8 && y < 32 && x % 12 < stem ? 20 : 250));
    const thin = strokeStat(mk(2), { x0: 0, y0: 0, x1: w, y1: 40 });
    const thick = strokeStat(mk(5), { x0: 0, y0: 0, x1: w, y1: 40 });
    expect(thick.stem).toBeGreaterThan(thin.stem * 1.8);
    expect(thick.density).toBeGreaterThan(thin.density * 1.8);
  });
  it('рисунок находится, рамка с текстом — нет (это рамка)', () => {
    const W = 800;
    const H = 800;
    const rgba = rgbaOf(W, H, (x, y) => {
      // Рисунок: красный круг в (250, 250).
      if (Math.hypot(x - 250, y - 250) < 90) return [200, 40, 40];
      // Рамка с текстом: тонкая обводка вокруг (150..650, 500..650).
      const onFrame = x >= 150 && x <= 650 && y >= 500 && y <= 650 && (x < 153 || x > 647 || y < 503 || y > 647);
      return onFrame ? [30, 30, 30] : [255, 255, 255];
    });
    const g = rgbaToGray(rgba, W, H);
    const text = [{ x0: 170, y0: 540, x1: 630, y1: 570 }, { x0: 170, y0: 585, x1: 500, y1: 615 }];
    const r = analyzeRegions(rgba, g, text, 30);
    expect(r.figures.length).toBe(1);
    expect(r.figures[0].x0).toBeLessThan(170);
    expect(r.figures[0].x1).toBeGreaterThan(330);
    expect(r.boxes.length).toBe(1);
  });
  it('служебные: otsu и размытие', () => {
    expect(otsu(grayOf(10, 10, (x) => (x < 5 ? 30 : 220)))).toBeGreaterThanOrEqual(30);
    expect(boxBlur(grayOf(5, 5, () => 100), 1).d[12]).toBe(100);
  });
});
