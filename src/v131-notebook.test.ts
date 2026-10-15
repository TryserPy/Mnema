// 1.31, поток F: «Из тетради» — фото (разворот, клетка, {?слово?}, «Как в тетради», запрос notebook.read) и файлы (.docx, PDF, Markdown/Notion, ДЗ).
import { strToU8, zipSync, zlibSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — генератор фикстуры на JS без типов
import { makeDocx, p, t } from '../test-fixtures/notebook/make-docx.mjs';
import { docSections, docxToMarkdown, dueDate, fileKindOf, homeworkOf, homeworkText, markdownDoc, matchTopic, notionTitle, parseSplitAnswer, parseXml, sectionNote, sectionsByStarts, splitOutline, splitSections, type XNode } from './fileImport';
import { pdfToMarkdown } from './fileImportPdf';
import { acceptUnsure, asInNotebook, cardDrafts, fixUnsure, hasAbbreviations, isSpreadShape, notebookRequest, parseNotebookAnswer, spreadCuts, tidyRequest, unsureCount, unsurePieces, whitenPaper } from './notebook';

describe('тетрадь: разворот', () => {
  it('широкий снимок — разворот, «стоячий» — одна страница', () => {
    expect(isSpreadShape(4000, 3000)).toBe(true);
    expect(isSpreadShape(3000, 4000)).toBe(false);
    expect(isSpreadShape(1100, 1000)).toBe(false);
  });
  it('без корешка режем посередине: две половины, вместе — весь снимок', () => {
    const [l, r] = spreadCuts(4000, 3000);
    expect(l).toEqual({ x: 0, y: 0, w: 2000, h: 3000 });
    expect(r).toEqual({ x: 2000, y: 0, w: 2000, h: 3000 });
  });
  it('найденный корешок: полоса у сгиба выбрасывается', () => {
    const [l, r] = spreadCuts(4000, 3000, { a: 1900, b: 2050 });
    expect(l.w).toBe(1900);
    expect(r.x).toBe(2050);
    expect(r.w).toBe(1950);
  });
  it('корешок у края кадра — не корешок, режем посередине', () => {
    const [l] = spreadCuts(4000, 3000, { a: 300, b: 350 });
    expect(l.w).toBe(2000);
  });
  it('клетка и поля белеют, ручка и карандаш остаются', () => {
    const px = (c: number[]) => Array.from(whitenPaper(new Uint8ClampedArray([...c, 255])).slice(0, 3));
    expect(px([170, 190, 220])).toEqual([255, 255, 255]); // клетка
    expect(px([220, 120, 120])).toEqual([255, 255, 255]); // поля
    expect(px([40, 60, 150])).toEqual([40, 60, 150]); // синяя ручка
    expect(px([200, 40, 40])).toEqual([200, 40, 40]); // красная ручка
    expect(px([150, 150, 150])).toEqual([150, 150, 150]); // карандаш
  });
});

describe('тетрадь: запрос и ответ ИИ', () => {
  const img = { mime: 'image/jpeg' as const, data: 'AAAA' };
  it('Refrain ИИ получает задачу notebook.read и только данные, свой ключ — промт тетради', () => {
    const r = notebookRequest(img, { subject: 'Биология', topic: '  Фотосинтез ', page: 3 });
    expect(r.refrain).toEqual({ task: 'notebook.read', image: img, subject: 'Биология', topic: 'Фотосинтез', page: 3 });
    expect(r.system).toMatch(/тетради/);
    expect(r.system).toMatch(/\{\?слово\?\}/);
    expect(r.text).toMatch(/Предмет: Биология\. Тема: Фотосинтез\. Страница 3\./);
    expect(r.image).toBe(img);
  });
  it('лишнего в refrain нет: пустые поля и кривой номер страницы не уходят', () => {
    const r = notebookRequest(img, { subject: ' ', page: 0 });
    expect(Object.keys(r.refrain!).sort()).toEqual(['image', 'task']);
    expect(notebookRequest(img, { topic: 'x'.repeat(500) }).refrain!.topic!.length).toBe(160);
  });
  it('«Конспектом» — задача textbook.merge с текстом, без фото', () => {
    const r = tidyRequest('Фотосинтез — образование веществ', { subject: 'Биология' });
    expect(r.refrain).toEqual({ task: 'textbook.merge', text: 'Фотосинтез — образование веществ', subject: 'Биология' });
    expect(r.image).toBeUndefined();
  });
  it('ответ: метки {?…?} целы, служебное убрано, номер страницы найден', () => {
    const p = parseNotebookAnswer('```markdown\n## Фотосинтез\n\nИдёт в {?хлоропластах?} (зелёные).\n\n<b>x</b>\n[[СТРАНИЦА 12]]\n```');
    expect(p.empty).toBe(false);
    expect(p.page).toBe(12);
    expect(p.markdown).toBe('## Фотосинтез\n\nИдёт в {?хлоропластах?} (зелёные).\n\nx');
  });
  it('[[ПУСТО]] — пустая страница', () => {
    expect(parseNotebookAnswer('[[ПУСТО]]')).toEqual({ markdown: '', empty: true });
  });
});

describe('тетрадь: неуверенные слова', () => {
  const md = 'Идёт в {?хлоропластах?} (зелёные).\n{?Световая?} фаза → АТФ.';
  it('подсветка: куски текста и слова по порядку', () => {
    expect(unsureCount(md)).toBe(2);
    expect(unsurePieces(md)).toEqual([{ text: 'Идёт в ' }, { unsure: 'хлоропластах', i: 0 }, { text: ' (зелёные).\n' }, { unsure: 'Световая', i: 1 }, { text: ' фаза → АТФ.' }]);
  });
  it('правка нажатием: снимает метку только с этого слова', () => {
    const fixed = fixUnsure(md, 1, 'Темновая');
    expect(fixed).toBe('Идёт в {?хлоропластах?} (зелёные).\nТемновая фаза → АТФ.');
    expect(fixUnsure(md, 0, '  ')).toBe('Идёт в хлоропластах (зелёные).\n{?Световая?} фаза → АТФ.');
  });
  it('в конспект метки не попадают', () => {
    expect(acceptUnsure(md)).toBe('Идёт в хлоропластах (зелёные).\nСветовая фаза → АТФ.');
  });
});

describe('тетрадь: «Как в тетради»', () => {
  it('сворачивает привычные сокращения обратно', () => {
    expect(asInNotebook('Фотосинтез — образование органических веществ, так как на свету.')).toBe('Фотосинтез — образование органических в-в, т.к. на свету.');
    expect(asInNotebook('Количество вещества, например, 2 моль.')).toBe('Кол-во в-ва, напр., 2 моль.');
  });
  it('«год» и «век» — только после числа', () => {
    expect(asInNotebook('Отмена в 1861 году, в XIX веке. Каждый год.')).toBe('Отмена в 1861 г., в XIX в. Каждый год.');
  });
  it('формулы и метки не трогает; без сокращений текст тот же', () => {
    expect(asInNotebook('$\\text{вещество}$ и {?раствор?}')).toBe('$\\text{вещество}$ и {?р-р?}');
    expect(hasAbbreviations('Клетка делится.')).toBe(false);
    expect(hasAbbreviations('то есть')).toBe(true);
  });
});

describe('тетрадь: черновики карточек без ИИ', () => {
  it('определения, даты и «Запомните» — по одной карточке на предложение, метки {?…?} сняты', () => {
    const d = cardDrafts('## Фотосинтез\n\nФотосинтез — это образование органических {?веществ?} на свету.\n\n> [!def] Хлорофилл\n> зелёный пигмент растений.\n\nОтмена крепостного права — 19 февраля 1861 г.\n\n> [!tip] Запомните\n> Свет нужен всегда.');
    expect(d.map((x) => x.front)).toEqual(['Что такое «фотосинтез»?', 'Что такое «хлорофилл»?', 'Отмена крепостного права — {{19 февраля 1861 г.}}', 'Что нужно запомнить? Свет нужен всегда.…']);
    expect(d[0].back).toBe('Образование органических веществ на свету.');
    expect(d[2].type).toBe('cloze');
  });
  it('не больше заданного числа', () => {
    const md = Array.from({ length: 30 }, (_, i) => `Слово${i} — это понятие номер ${i}.`).join('\n\n');
    expect(cardDrafts(md, 5)).toHaveLength(5);
  });
});

// ---------- Файл: .docx, Markdown/Notion, разделы, ДЗ, совпадение с темами ----------

describe('файл: .docx', () => {
  const fixture = () => new Uint8Array(readFileSync('test-fixtures/notebook/biology.docx'));
  it('фикстура: заголовки → разделы, таблицы, рисунок, список, выделение, формула', () => {
    const r = docxToMarkdown(fixture());
    expect(r.stats).toEqual({ tables: 2, images: 1, pages: 14 });
    expect(r.markdown).toMatch(/^# Биология 8 класс\n\n## § 12\. Фотосинтез\n\n\*\*Фотосинтез\*\* — это образование/);
    expect(r.markdown).toContain('Идёт в ==хлоропластах== клеток листа.');
    expect(r.markdown).toContain('- Световая фаза — образуется АТФ.\n- Темновая фаза — образуется глюкоза.');
    expect(r.markdown).toContain('| Фаза | Где идёт |\n| --- | --- |\n| Световая | мембраны тилакоидов |');
    expect(r.markdown).toMatch(/!\[Рисунок\]\(data:image\/png;base64,iVBOR/);
    expect(r.markdown).toContain('$\\frac{E полезная}{E света}$');
    expect(r.markdown).toContain('1. § 12, вопросы 1–3\n1. Выучить определения');
    const s = splitSections(r.markdown, 'Биология 8 класс');
    expect(s.map((x) => x.title)).toEqual(['§ 12. Фотосинтез', '§ 13. Дыхание растений', 'Домашнее задание на 14.10']);
    expect(s.map((x) => x.stats)).toEqual([{ tables: 1, images: 1 }, { tables: 1, images: 0 }, { tables: 0, images: 0 }]);
    expect(sectionNote(s[0])).toMatch(/^## § 12\. Фотосинтез\n\n\*\*Фотосинтез\*\*/);
  });
  it('без стилей заголовков: короткие жирные строки — заголовки', () => {
    const md = docxToMarkdown(makeDocx(p(t('Клетка', { b: true })) + p(t('Клетка — единица живого.')) + p(t('Ткани', { b: true })) + p(t('Ткань — группа клеток.')), { withStyles: false })).markdown;
    expect(md).toBe('## Клетка\n\nКлетка — единица живого.\n\n## Ткани\n\nТкань — группа клеток.');
  });
  it('текст Word не превращается в разметку: *, $, # и > в начале строки', () => {
    const md = docxToMarkdown(makeDocx(p(t('# не заголовок')) + p(t('> не цитата')) + p(t('Цена 5 $ и 2*3=6, [ссылка]')))).markdown;
    expect(md).toBe('\\# не заголовок\n\n\\> не цитата\n\nЦена 5 \\$ и 2\\*3=6, \\[ссылка\\]');
  });
  it('DOCTYPE и сущности из файла не раскрываются', () => {
    const x = parseXml('<!DOCTYPE a [<!ENTITY x "БОМБА">]><a b="1 &amp; 2">&x;&lt;ok&gt;</a>');
    const a = x.kids[0] as XNode;
    expect(a.attrs.b).toBe('1 & 2');
    expect(a.kids.join('')).toBe('&x;<ok>');
  });
  it('не .docx — понятная ошибка', () => {
    expect(() => docxToMarkdown(new TextEncoder().encode('просто текст'))).toThrow(/не похож на документ Word/);
  });
});

describe('файл: разделы', () => {
  it('название документа сверху не становится разделом; текст до первого заголовка — свой раздел', () => {
    const s = splitSections('Вступление.\n\n## Первая\n\nА\n\n### Под\n\nБ\n\n## Вторая\n\nВ', 'Файл');
    expect(s.map((x) => [x.title, x.body])).toEqual([
      ['Файл', 'Вступление.'],
      ['Первая', 'А\n\n### Под\n\nБ'],
      ['Вторая', 'В']
    ]);
  });
  it('без заголовков — один раздел с названием файла', () => {
    expect(splitSections('Просто текст.', 'Конспект').map((x) => x.title)).toEqual(['Конспект']);
  });
  it('разбивка ИИ: ответ «N | Название» → разделы по абзацам, мусор пропущен', () => {
    const md = 'Вступление\n\nФотосинтез идёт на свету.\n\nЕщё про свет.\n\nДыхание идёт всегда.';
    expect(splitOutline(md)).toBe('0: Вступление\n1: Фотосинтез идёт на свету.\n2: Ещё про свет.\n3: Дыхание идёт всегда.');
    const starts = parseSplitAnswer('Вот темы:\n1 | Фотосинтез\n3 | «Дыхание»\n99 | Лишнее');
    expect(starts).toEqual([{ block: 1, title: 'Фотосинтез' }, { block: 3, title: 'Дыхание' }, { block: 99, title: 'Лишнее' }]);
    const s = sectionsByStarts(md, starts, 'Тетрадь');
    expect(s.map((x) => [x.title, x.body])).toEqual([
      ['Тетрадь', 'Вступление'],
      ['Фотосинтез', 'Фотосинтез идёт на свету.\n\nЕщё про свет.'],
      ['Дыхание', 'Дыхание идёт всегда.']
    ]);
  });
});

describe('файл: похоже на ДЗ', () => {
  const now = new Date(2026, 9, 1);
  it('по названию и по началу короткого раздела, со сроком', () => {
    expect(homeworkOf('Домашнее задание на 14.10', '§ 12, вопросы 1–3', now)).toEqual({ due: '2026-10-14' });
    expect(homeworkOf('Д/З', 'упр. 45 к 3 марта', now)).toEqual({ due: '2027-03-03' });
    expect(homeworkOf('Итоги урока', 'ДЗ: выучить параграф', now)).toEqual({ due: undefined });
    expect(homeworkOf('Фотосинтез', 'Фотосинтез идёт на свету. Дома повторить.', now)).toBeNull();
    expect(homeworkOf('Задачи на домножение', 'Дробь домножаем на число.', now)).toBeNull();
  });
  it('сроки: число.месяц(.год), «к 5 мая», прошедшая дата — следующий год', () => {
    expect(dueDate('на 14.10.2026', now)).toBe('2026-10-14');
    expect(dueDate('к 5 мая', now)).toBe('2027-05-05');
    expect(dueDate('до 20/9', now)).toBe('2026-09-20');
    expect(dueDate('на 31.02', now)).toBeUndefined();
    expect(dueDate('без срока', now)).toBeUndefined();
  });
  it('текст для «Домашки» — без разметки', () => {
    expect(homeworkText('Домашнее задание на 14.10', '1. § 12, вопросы 1–3\n- **Выучить** определения')).toBe('1. § 12, вопросы 1–3\n• Выучить определения');
  });
});

describe('файл: совпадение с темами', () => {
  const topics = [
    { id: 'a', name: 'Дыхание' },
    { id: 'b', name: '§ 12 Фотосинтез' },
    { id: 'c', name: 'Тема' },
    { id: 'd', name: 'Строение клетки' }
  ];
  it('то же название или все слова темы в названии раздела', () => {
    expect(matchTopic('§ 13. Дыхание растений', topics)).toBe('a');
    expect(matchTopic('Фотосинтез', topics)).toBe('b');
    expect(matchTopic('Клетки: строение', topics)).toBe('d');
    expect(matchTopic('Тема 5. Почва', topics)).toBeUndefined();
    expect(matchTopic('Размножение', topics)).toBeUndefined();
  });
});

describe('файл: Markdown и Notion', () => {
  it('один .md режется по заголовкам', async () => {
    const doc = await markdownDoc('Конспект.md', new TextEncoder().encode('# Фотосинтез\n\nНа свету.\n\n# Дыхание\n\nВсегда.'));
    expect(doc.kind).toBe('md');
    expect(docSections(doc).map((x) => [x.title, x.body])).toEqual([
      ['Фотосинтез', 'На свету.'],
      ['Дыхание', 'Всегда.']
    ]);
  });
  it('экспорт Notion: страницы → разделы, id в именах и повтор «# Название» убраны, архив в архиве', async () => {
    const id = '0123456789abcdef0123456789abcdef';
    const inner = zipSync({ [`Биология ${id}/Фотосинтез ${id}.md`]: strToU8('# Фотосинтез\n\nИдёт на **свету**.'), [`Биология ${id}/Дыхание ${'f'.repeat(32)}.md`]: strToU8('# Дыхание\n\nИдёт всегда.\n\n## Где\n\nВ митохондриях.') });
    const doc = await markdownDoc('Export-1234abcd.zip', zipSync({ 'Export-Part-1.zip': inner }));
    expect(doc.kind).toBe('notion');
    expect(docSections(doc).map((x) => [x.title, x.body])).toEqual([
      ['Дыхание', 'Идёт всегда.\n\n### Где\n\nВ митохондриях.'],
      ['Фотосинтез', 'Идёт на **свету**.']
    ]);
    expect(notionTitle(`Фотосинтез ${id}`)).toBe('Фотосинтез');
  });
  it('какие файлы берёт «Файл»', () => {
    expect(['a.docx', 'b.PDF', 'c.md', 'd.zip', 'e.txt', 'f.jpg', 'g.doc'].map(fileKindOf)).toEqual(['docx', 'pdf', 'md', 'md', 'md', null, null]);
  });
});

describe('файл: PDF без сторонних библиотек', () => {
  /** Маленький PDF из объектов: строки как есть, потоки — { dict, data } (data сжимается, если flate). */
  const pdf = (objs: (string | { dict: string; data: Uint8Array | string; flate?: boolean })[], trailer = '/Root 1 0 R') => {
    const parts: (string | Uint8Array)[] = ['%PDF-1.7\n'];
    objs.forEach((o, i) => {
      if (typeof o === 'string') parts.push(`${i + 1} 0 obj\n${o}\nendobj\n`);
      else {
        const raw = typeof o.data === 'string' ? strToU8(o.data, true) : o.data;
        const data = o.flate ? zlibSync(raw) : raw;
        parts.push(`${i + 1} 0 obj\n<< ${o.dict}${o.flate ? ' /Filter /FlateDecode' : ''} /Length ${data.length} >>\nstream\n`, data, '\nendstream\nendobj\n');
      }
    });
    parts.push(`trailer\n<< ${trailer} >>\n%%EOF`);
    const bytes = parts.map((x) => (typeof x === 'string' ? strToU8(x, true) : x));
    const out = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
    let off = 0;
    for (const b of bytes) (out.set(b, off), (off += b.length));
    return out;
  };
  const page = (font: string, content: { dict: string; data: Uint8Array | string; flate?: boolean }, extra: string[] = []) =>
    pdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', content, font, ...extra]);

  it('фикстура из Chrome: шрифты с ToUnicode, заголовки по кеглю, абзацы', () => {
    const r = pdfToMarkdown(new Uint8Array(readFileSync('test-fixtures/notebook/biology.pdf')));
    expect(r.scans).toEqual([]);
    expect(r.stats.pages).toBe(1);
    expect(r.markdown).toBe(
      '# § 12. Фотосинтез\n\nФотосинтез — это образование органических веществ из углекислого газа и воды на свету. Он идёт в хлоропластах клеток листа и даёт кислород, которым мы дышим каждый день.\n\nСветовая фаза — образуется АТФ.\n\n## Где идёт\n\nВ хлоропластах (зелёные пластиды).\n\n# § 13. Дыхание растений\n\nДыхание — окисление органических веществ с выделением энергии. Цена 5 \\$.'
    );
    expect(splitSections(r.markdown, 'Биология').map((s) => s.title)).toEqual(['§ 12. Фотосинтез', '§ 13. Дыхание растений']);
  });
  it('скан без текста: картинка страницы (JPEG) для ветки «Фото»', () => {
    const r = pdfToMarkdown(new Uint8Array(readFileSync('test-fixtures/notebook/scan.pdf')));
    expect(r.markdown).toBe('');
    expect(r.scans).toHaveLength(1);
    expect(r.scans[0]).toMatchObject({ kind: 'jpeg', w: 600, h: 800 });
    const jpeg = (r.scans[0] as { bytes: Uint8Array }).bytes;
    expect([jpeg[0], jpeg[1], jpeg[2]]).toEqual([0xff, 0xd8, 0xff]);
  });
  it('ToUnicode с bfrange (обе формы), двухбайтные коды, перенос слова, TJ с пробелом', () => {
    const cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange 2 beginbfrange <0001> <0003> <0444> <0010> <0011> [<043E> <0442>] endbfrange 1 beginbfchar <0020> <0020> endbfchar endcmap end end';
    // ф ф х — о т: «фф» + перенос «х-» и пробел через TJ
    const text = 'BT /F1 12 Tf 72 700 Td [<00010002> -400 <0010>] TJ 0 -14 Td <00110003> Tj ET';
    const r = pdfToMarkdown(page('<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /ToUnicode 6 0 R /DescendantFonts [7 0 R] >>', { dict: '', data: text, flate: true }, [`<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`, '<< /Type /Font /Subtype /CIDFontType2 /DW 500 >>']));
    expect(r.markdown).toBe('фх о\n\nтц'.replace('\n\n', ' '));
  });
  it('простой шрифт: Differences с именами кириллицы и старый cp1251 без кодировки', () => {
    const diff = pdfToMarkdown(page('<< /Type /Font /Subtype /Type1 /BaseFont /Times /Encoding << /Differences [65 /afii10017 /afii10066 /space /uni0436] >> >>', { dict: '', data: 'BT /F1 12 Tf 10 10 Td (ABCD) Tj ET' }));
    expect(diff.markdown).toBe('Аб ж');
    const cp = pdfToMarkdown(page('<< /Type /Font /Subtype /TrueType /BaseFont /ArialCyr >>', { dict: '', data: strToU8('BT /F1 12 Tf 10 10 Td (\xcf\xf0\xe8\xe2\xe5\xf2) Tj ET', true) }));
    expect(cp.markdown).toBe('Привет');
  });
  it('потоки объектов (ObjStm) и ASCIIHex', () => {
    const inner = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    const objstm = `5 0 ${inner}`;
    const hex = Array.from(strToU8('BT /F1 12 Tf 10 10 Td (Hello world) Tj ET'), (b) => b.toString(16).padStart(2, '0')).join('') + '>';
    const r = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      { dict: '/Filter /ASCIIHexDecode', data: hex },
      'null',
      { dict: `/Type /ObjStm /N 1 /First ${'5 0 '.length}`, data: objstm, flate: true }
    ]);
    expect(pdfToMarkdown(r).markdown).toBe('Hello world');
  });
  it('зашифрованный PDF и не PDF — понятные ошибки', () => {
    const enc = pdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>'], '/Root 1 0 R /Encrypt << /Filter /Standard >>');
    expect(() => pdfToMarkdown(enc)).toThrow(/защищён/);
    expect(() => pdfToMarkdown(strToU8('<html></html>'))).toThrow(/не похож на PDF/);
  });
});
