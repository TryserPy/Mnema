// 1.32, N1: импорт карточек из Quizlet, таблиц (CSV/TSV), RemNote и Mochi.
import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { guessRoles, guessTable, IMPORT_LIMITS, parseEdn, parseMochiData, parseMochiFile, parseRemNote, rowsToDecks, splitCsv, splitTable } from './cardImport';

describe('таблицы и Quizlet', () => {
  it('CSV с кавычками, запятыми и переносами внутри поля', () => {
    const { rows } = splitCsv('вопрос,ответ\n"Столица Франции","Париж, город"\n"Две\nстроки","да ""так"""\n', ',');
    expect(rows).toEqual([
      ['вопрос', 'ответ'],
      ['Столица Франции', 'Париж, город'],
      ['Две\nстроки', 'да "так"']
    ]);
  });

  it('угадывает разделитель: Quizlet (таб), русский Excel (;), обычный CSV (,) и заголовок', () => {
    expect(guessTable('dog\tсобака\ncat\tкошка').col).toBe('tab');
    expect(guessTable('Термин;Определение\nатом;частица\nион;заряженная частица')).toEqual({ col: 'semicolon', row: 'newline', header: true });
    expect(guessTable('a,b\nc,d').col).toBe('comma');
    expect(guessTable('dog - собака\ncat - кошка').col).toBe('dash');
  });

  it('Quizlet со своими разделителями: « - » между словом и переводом, «;» между карточками', () => {
    const o = { col: 'dash' as const, row: 'semicolon' as const, header: false };
    expect(splitTable('dog - собака;cat - кошка, кот;a-b - тире - внутри', o).rows).toEqual([
      ['dog', 'собака'],
      ['cat', 'кошка, кот'],
      ['a-b', 'тире - внутри']
    ]);
  });

  it('роли столбцов по заголовку и строки → колоды, пустые пропускаются', () => {
    const rows = [['Колода', 'Ответ', 'Вопрос', 'Пример'], ['Био', 'митохондрия', 'Где энергия?', 'клетка'], ['Био', '', 'пусто?', ''], ['Хим', 'H₂O', 'Вода', '']];
    const roles = guessRoles(rows, true);
    expect(roles).toEqual(['deck', 'back', 'front', 'why']);
    const r = rowsToDecks(rows, roles, { header: true, type: 'basic', deck: 'Импорт' });
    expect(r.skipped).toBe(1);
    expect(r.decks.map((d) => d.name)).toEqual(['Био', 'Хим']);
    expect(r.decks[0].cards[0]).toEqual({ type: 'basic', front: 'Где энергия?', back: 'митохондрия', why: 'клетка' });
  });

  it('пропуск {{…}} в вопросе — карточка с пропуском даже без ответа', () => {
    const r = rowsToDecks([['Столица России — {{Москва}}']], ['front', 'back'], { header: false, type: 'reverse', deck: 'Д' });
    expect(r.decks[0].cards[0].type).toBe('cloze');
  });

  it('лимит строк: огромная таблица обрезается, а не вешает приложение', () => {
    const big = Array.from({ length: IMPORT_LIMITS.rows + 50 }, (_, i) => `q${i}\ta${i}`).join('\n');
    const r = splitCsv(big, '\t');
    expect(r.rows.length).toBe(IMPORT_LIMITS.rows);
    expect(r.cut).toBe(true);
  });
});

describe('RemNote', () => {
  it('>> << :: ;; и колоды по заголовкам', () => {
    const r = parseRemNote(['Клетка', '  - Митохондрия >> энергия', '  - ATP << аденозинтрифосфат', '  - ДНК :: дезоксирибонуклеиновая кислота', 'Физика', '  - Сила ;; векторная величина', '  - пусто >> '].join('\n'), 'RemNote');
    expect(r.decks.map((d) => [d.name, d.cards.length])).toEqual([
      ['Клетка', 3],
      ['Физика', 1]
    ]);
    expect(r.decks[0].cards[1]).toEqual({ type: 'basic', front: 'аденозинтрифосфат', back: 'ATP' });
    expect(r.decks[0].cards[2].type).toBe('reverse');
    expect(r.skipped).toBe(1);
  });
});

describe('Mochi', () => {
  const data = {
    version: 2,
    decks: [
      { id: 'a', name: 'Английский', cards: [{ content: 'dog\n---\nсобака' }, { content: 'Столица — {{Лондон}}' }, { content: 'без ответа' }] },
      { id: 'b', name: 'Глаголы', 'parent-id': 'a', cards: { '~:list': [] } }
    ]
  };
  it('data.json: стороны через ---, пропуски, вложенные колоды', () => {
    const r = parseMochiData(data);
    expect(r.decks).toEqual([{ name: 'Английский', cards: [{ type: 'basic', front: 'dog', back: 'собака' }, { type: 'cloze', front: 'Столица — {{Лондон}}', back: '' }] }]);
    expect(r.skipped).toBe(1);
  });

  it('data.edn и архив .mochi', async () => {
    const edn = '{:version 2 :decks [{:id "p" :name "Химия"} {:id "c" :name "Элементы" :parent-id "p" :cards [{:content "Fe\\n---\\nжелезо" :pos "a"} #_ {:content "скрыто"}]}]} ; комментарий';
    expect(parseMochiData(parseEdn(edn)).decks).toEqual([{ name: 'Химия › Элементы', cards: [{ type: 'basic', front: 'Fe', back: 'железо' }] }]);
    const zip = zipSync({ 'data.json': strToU8(JSON.stringify(data)) });
    expect((await parseMochiFile('my.mochi', zip)).decks[0].cards).toHaveLength(2);
  });

  it('__proto__ в файле не меняет прототипы', () => {
    const r = parseMochiData(JSON.parse('{"__proto__":{"polluted":1},"decks":[{"name":"x","__proto__":{"a":1},"cards":[{"content":"a\\n---\\nb"}]}]}'));
    expect(r.decks[0].cards).toHaveLength(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const e = parseEdn('{"__proto__" {:polluted 1} :ok 1}') as Record<string, unknown>;
    expect(Object.getPrototypeOf(e)).toBe(Object.prototype);
    expect(e.ok).toBe(1);
  });

  it('слишком глубокий EDN — ошибка, а не переполнение стека', () => {
    expect(() => parseEdn('['.repeat(500) + ']'.repeat(500))).toThrow(/вложенность/);
  });
});

describe('готовые колоды', () => {
  it('у каждой колоды — непустые карточки допустимых типов, формулы KaTeX без ошибок', async () => {
    const katex = (await import('katex')).default;
    const { READY_DECKS } = await import('./decks');
    expect(READY_DECKS.length).toBeGreaterThanOrEqual(6);
    const ids = new Set<string>();
    for (const d of READY_DECKS) {
      expect(ids.has(d.id)).toBe(false);
      ids.add(d.id);
      for (const it of d.items()) {
        expect(it.cards.length).toBeGreaterThan(10);
        const fronts = new Set<string>();
        for (const c of it.cards) {
          expect(['basic', 'reverse']).toContain(c.type);
          expect(c.front.trim() && c.back.trim()).toBeTruthy();
          expect(fronts.has(c.front)).toBe(false);
          fronts.add(c.front);
          for (const m of `${c.front} ${c.back} ${c.why ?? ''}`.matchAll(/\$([^$]+)\$/g)) expect(() => katex.renderToString(m[1], { throwOnError: true })).not.toThrow();
        }
      }
    }
  });
});
