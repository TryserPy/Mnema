// 1.31, поток F: «Из тетради» — фото (разворот, клетка, {?слово?}, «Как в тетради», запрос notebook.read) и файлы (.docx, PDF, Markdown/Notion, ДЗ).
import { describe, expect, it } from 'vitest';
import { acceptUnsure, asInNotebook, fixUnsure, hasAbbreviations, isSpreadShape, notebookRequest, parseNotebookAnswer, spreadCuts, tidyRequest, unsureCount, unsurePieces, whitenPaper } from './notebook';

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
