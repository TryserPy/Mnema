// Тесты версии 1.8 (тестировщик): простой формат файла изменений, порядок тем, удаление нескольких, совместимость данных.
// Последний раздел — найденные тестером и уже исправленные ошибки (A, A2, B, C, E): проверки защищают от их возврата.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportChanges, parseChangeFile, planChanges } from './changes';
import { looksLikeMnemaText, parseMnemaText, toMnemaText } from './mnemaText';
import { childTopics, deleteMany, emptyData, getData, moveTopic, normalizeData, replaceData, subjectRules, topicOrder } from './store';
import { mergeData } from './sync';
import { applyLook } from './themes';
import type { AppData, Topic } from './types';

const T0 = '2026-09-01T10:00:00.000Z';
let n = 0;
const env = { now: new Date('2026-09-29T10:00:00Z'), uid: () => 'v180-' + ++n };

/** В тестах без окна сохранение на диск невозможно и пишет в консоль «Не удалось сохранить» — это не ошибка теста; остальное выводим как обычно. */
function quietSave() {
  beforeEach(() => {
    const orig = console.error.bind(console);
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      if (!String(a[0]).startsWith('Не удалось сохранить')) orig(...a);
    });
  });
  afterEach(() => vi.restoreAllMocks());
}

/** Пакет из текста: разбор должен пройти, иначе тест упадёт с понятной причиной. */
function pack(text: string) {
  const r = parseChangeFile(text);
  if (!r.ok) throw new Error(r.error);
  return r.pack;
}

/** Все изменения предмета (первый предмет) — как их отдаёт «Выгрузить для нейросети». */
const exportForTest = (d: AppData) => exportChanges(d, { subjectId: d.subjects[0].id }).changes;

describe('1.8: Мнема-текст — граничные случаи разбора', () => {
  it('Windows-переводы строк (\\r\\n) и BOM дают тот же результат, что обычные', () => {
    const lf = '@предмет Химия\n@тема Атомы\nтекст\n\nещё\n@карточки\nЧто? :: Это\n';
    expect(pack('﻿' + lf.replace(/\n/g, '\r\n'))).toEqual(pack(lf));
  });

  it('пустой или пробельный файл — понятная ошибка, а не падение', () => {
    for (const t of ['', '   \n  \n', '﻿']) {
      const r = parseChangeFile(t);
      expect(r.ok).toBe(false);
      expect(r.ok ? '' : r.error).toMatch(/Мнемы|изменен/);
    }
    expect(parseMnemaText('')).toEqual({ changes: [], warnings: [] });
  });

  it('только «@предмет» без названия не ломает разбор, а даёт предупреждение при применении', () => {
    const p = planChanges(emptyData(), pack('@предмет'), env);
    expect(p.data.subjects).toHaveLength(0);
    expect(p.warnings.join(' ')).toMatch(/без названия/);
  });

  it('строки с @, которые не команды, и «::» в конспекте остаются текстом конспекта', () => {
    const c = parseMnemaText('@предмет Информатика\n@тема Почта\nПиши на @mail\n@Пушкин — поэт\nstd::cout и a :: b\n@карточки\nК :: О').changes.find((x) => x.do === 'topic')!;
    expect(c.note).toBe('Пиши на @mail\n@Пушкин — поэт\nstd::cout и a :: b');
  });

  it('пустые строки внутри конспекта сохраняются, по краям — убираются', () => {
    const c = parseMnemaText('@предмет А\n@тема Б\n\n\nпервый\n\n\nвторой\n\n@карточки\nК :: О').changes.find((x) => x.do === 'topic')!;
    expect(c.note).toBe('первый\n\n\nвторой');
  });

  it('конспект из одних пробелов не затирает старый', () => {
    const d = emptyData();
    d.subjects = [{ id: 's', name: 'А', color: '#000', createdAt: T0 }];
    d.topics = [{ id: 't', subjectId: 's', name: 'Б', note: 'старый конспект', createdAt: T0, updatedAt: T0 }];
    const p = planChanges(d, pack('@предмет А\n@тема Б\n   \n\n@карточки\nК :: О'), env);
    expect(p.data.topics.find((t) => t.id === 't')!.note).toBe('старый конспект');
  });

  it('код ``` внутри конспекта без внешней рамки остаётся в конспекте, @property в коде — не команда', () => {
    const r = pack('@предмет Информатика\n@тема Python\nПример:\n```python\n@property\nprint(1)\n```\nХвост\n@карточки\nЧто печатает print(1)? :: 1');
    const note = String(r.changes.find((c) => c.do === 'topic')!.note);
    expect(note).toContain('```python\n@property\nprint(1)\n```');
    expect(r.changes.some((c) => c.do === 'cards')).toBe(true);
  });

  it('ответ в рамке ```: текст до и после рамки отбрасывается', () => {
    const r = pack('Вот файл:\n```\n@предмет Химия\n@тема Атомы\nтекст\n```\nУдачи!');
    expect(String(r.changes.find((c) => c.do === 'topic')!.note)).toBe('текст');
  });

  it('номер в начале строки карточки убирается, табуляция и «почему» читаются', () => {
    const cards = parseMnemaText('@предмет И\n@тема В\n@карточки\n1) Сколько будет 2+2? :: 4\n- К\tО\tпочему').changes.find((c) => c.do === 'cards')!.cards as Record<string, string>[];
    expect(cards).toEqual([
      { front: 'Сколько будет 2+2?', back: '4' },
      { front: 'К', back: 'О', why: 'почему' }
    ]);
  });

  it('строка карточки без «::» пропускается с предупреждением, пустые строки — молча', () => {
    const r = parseMnemaText('@предмет А\n@тема Б\n@карточки\n\nК :: О\n\nпросто текст\n');
    expect(r.warnings).toHaveLength(1);
    expect((r.changes.find((c) => c.do === 'cards')!.cards as unknown[]).length).toBe(1);
  });

  it('тема или карточки до «@предмет» дают предупреждения и ничего не создают', () => {
    const r = parseMnemaText('@тема Ж\nтекст\n@карточки\nК :: О');
    expect(r.changes).toEqual([]);
    expect((r.warnings ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('looksLikeMnemaText: командой считается только @-слово в начале строки', () => {
    expect(looksLikeMnemaText('Привет\n@тема x')).toBe(true);
    expect(looksLikeMnemaText('{"changes":[]}')).toBe(false);
    expect(looksLikeMnemaText('пиши на почту @тема')).toBe(false);
    expect(looksLikeMnemaText('@темаX')).toBe(false);
  });

  it('JSON-файл 1.7 по-прежнему читается', () => {
    const r = parseChangeFile('```json\n{"changes":[{"do":"subject","name":"Химия"},]}\n```');
    expect(r.ok && r.pack.changes).toEqual([{ do: 'subject', name: 'Химия' }]);
  });
});

describe('1.8: «@удалить» безопасно', () => {
  const d = (): AppData => {
    const x = emptyData();
    x.subjects = [
      { id: 's1', name: 'Русский', color: '#000', createdAt: T0 },
      { id: 's2', name: 'Физика', color: '#000', createdAt: T0 }
    ];
    x.topics = [
      { id: 't1', subjectId: 's1', name: 'Старая', note: '', createdAt: T0, updatedAt: T0 },
      { id: 't2', subjectId: 's2', name: 'Старая', note: '', createdAt: T0, updatedAt: T0 }
    ];
    return x;
  };

  it('без предмета ничего не удаляет, а говорит почему', () => {
    const p = planChanges(d(), pack('@удалить тему Старая\n@предмет Русский\n@тема Новая\nтекст'), env);
    expect(p.data.topics.filter((t) => t.name === 'Старая')).toHaveLength(2);
    expect(p.warnings.join(' ')).toMatch(/subject|предмет/i);
  });

  it('«@удалить предмет Физика» удаляет названный предмет, а не тот, что стоит выше в файле', () => {
    const p = planChanges(d(), pack('@предмет Русский\n@тема Х\nтекст\n@удалить предмет Физика'), env);
    expect(p.data.subjects.map((s) => s.name)).toEqual(['Русский']);
    expect(p.data.topics.some((t) => t.id === 't2')).toBe(false);
    expect(p.data.topics.some((t) => t.id === 't1')).toBe(true);
  });

  it('«@удалить тему» берёт тему текущего предмета, одноимённая в другом предмете остаётся', () => {
    const p = planChanges(d(), pack('@предмет Русский\n@удалить тему Старая'), env);
    expect(p.data.topics.map((t) => t.id)).toEqual(['t2']);
  });

  it('неизвестное слово после «@удалить» не удаляет ничего (в том числе «constructor»)', () => {
    for (const w of ['constructor', 'toString', '__proto__', 'что-то']) {
      const p = planChanges(d(), pack(`@предмет Русский\n@удалить ${w} Старая`), env);
      expect(p.data.topics).toHaveLength(2);
      expect(p.warnings.length).toBeGreaterThan(0);
    }
  });
});

describe('1.8: предпросмотр — какие темы затронуты (touched)', () => {
  const base = (): AppData => {
    const x = emptyData();
    x.subjects = [{ id: 's', name: 'Физика', color: '#000', createdAt: T0 }];
    x.topics = [
      { id: 'a', subjectId: 's', name: 'А', note: 'конспект А', createdAt: T0, updatedAt: T0 },
      { id: 'b', subjectId: 's', name: 'Б', note: 'конспект Б', createdAt: T0, updatedAt: T0 }
    ];
    x.cards = [
      { id: 'ca', topicId: 'a', type: 'basic', front: 'Q', back: 'A', createdAt: T0, updatedAt: T0 },
      { id: 'cb', topicId: 'b', type: 'basic', front: 'Q2', back: 'A2', createdAt: T0, updatedAt: T0 }
    ];
    return x;
  };

  it('новый конспект и новые карточки: тема в touched, соседняя нетронутая тема — нет', () => {
    const p = planChanges(base(), pack('@предмет Физика\n@тема А\nновый конспект\n@карточки\nНовый вопрос :: Ответ'), env);
    expect(p.touched).toEqual(['a']);
  });

  it('повторная загрузка того же файла ничего не затрагивает', () => {
    const p = planChanges(base(), pack('@предмет Физика\n@тема А\nконспект А\n@карточки\nQ :: A'), env);
    expect(p.lines).toEqual([]);
    expect(p.touched).toEqual([]);
  });

  it('только карточки (без конспекта) — тема тоже в touched', () => {
    const p = planChanges(base(), pack('@предмет Физика\n@тема Б\n@карточки\nЕщё :: Так'), env);
    expect(p.touched).toEqual(['b']);
  });

  it('удалённая тема в touched не попадает (её видно в строках «удалено»)', () => {
    const p = planChanges(base(), pack('@предмет Физика\n@удалить тему А'), env);
    expect(p.touched).toEqual([]);
    expect(p.lines.filter((l) => l.kind === 'del')).toHaveLength(1);
  });

  it('новая тема и её правило — обе в touched', () => {
    const p = planChanges(base(), pack('@предмет Физика\n@тема В\nтекст\n@правило Ом | слова: ток\nI = U/R'), env);
    expect(p.touched).toHaveLength(2);
    expect(p.data.topics.filter((t) => p.touched.includes(t.id)).map((t) => t.name).sort()).toEqual(['В', 'Ом']);
  });
});

describe('1.8: выгрузка в Мнема-текст и обратно', () => {
  it('глава (подтема), стих и правило переживают выгрузку без изменений', () => {
    const d = emptyData();
    d.subjects = [{ id: 's', name: 'Литература', color: '#2F9E5B', createdAt: T0 }];
    d.topics = [
      { id: 'ch', subjectId: 's', name: 'Глава 1', note: '', createdAt: T0, updatedAt: T0 },
      { id: 't', subjectId: 's', name: 'Пушкин', parentId: 'ch', note: '## Жизнь\n**Пушкин** — поэт.', createdAt: T0, updatedAt: T0, poems: [{ id: 'p1', title: 'Зимнее утро', author: 'А. С. Пушкин', text: 'Мороз и солнце;\nдень чудесный!\n\nЕщё ты дремлешь', chunk: 2, learned: 0, createdAt: T0, updatedAt: T0 }] },
      { id: 'r', subjectId: 's', kind: 'rule', name: 'Рифма', note: 'Созвучие.', ruleWords: ['рифма'], createdAt: T0, updatedAt: T0 }
    ];
    d.cards = [{ id: 'c', topicId: 't', type: 'basic', front: 'Кто автор?', back: 'Пушкин', createdAt: T0, updatedAt: T0 }];
    const p = planChanges(d, pack(toMnemaText({ changes: exportForTest(d) })), env);
    expect(p.lines).toEqual([]);
    expect(p.data.topics).toEqual(d.topics);
    expect(p.data.cards).toEqual(d.cards);
  });

  it('название темы с палочкой («Модуль |x|») не превращается в свойства', () => {
    const d = emptyData();
    d.subjects = [{ id: 's', name: 'Алгебра', color: '#3A5BD9', createdAt: T0 }];
    d.topics = [{ id: 't', subjectId: 's', name: 'Модуль |x|', note: 'текст', createdAt: T0, updatedAt: T0 }];
    const p = planChanges(d, pack(toMnemaText({ changes: exportForTest(d) })), env);
    expect(p.data.topics.map((t) => t.name)).toEqual(['Модуль |x|']);
    expect(p.lines).toEqual([]);
  });

  it('строка конспекта, начинающаяся с @-команды, при выгрузке не становится командой', () => {
    const d = emptyData();
    d.subjects = [{ id: 's', name: 'Информатика', color: '#3A5BD9', createdAt: T0 }];
    d.topics = [{ id: 't', subjectId: 's', name: 'Тема', note: 'до\n@карточки\nпосле', createdAt: T0, updatedAt: T0 }];
    const p = planChanges(d, pack(toMnemaText({ changes: exportForTest(d) })), env);
    expect(p.data.topics[0].note).toBe('до\n@карточки\nпосле');
    expect(p.data.cards).toHaveLength(0);
  });
});

// ---------- Порядок тем ----------
// «По названию» или «свой порядок» — свойство ПРЕДМЕТА (Subject.topicSort), а не всего приложения.

const t = (id: string, name: string, order: number, extra: Partial<Topic> = {}, subjectId = 's'): Topic => ({ id, subjectId, name, note: '', order, createdAt: T0, updatedAt: T0, ...extra });

/** Предмет «s»: три темы верхнего уровня, у «§2» две подтемы, у «§1» одна, два правила и «общие термины»; предмет «s2»: две темы. */
function order180(): AppData {
  const d = emptyData();
  d.subjects = [
    { id: 's', name: 'Русский', color: '#000', createdAt: T0 },
    { id: 's2', name: 'Физика', color: '#000', createdAt: T0 }
  ];
  d.topics = [
    t('t2', '§2. Б', 1),
    t('t10', '§10. В', 2),
    t('t1', '§1. А', 3),
    t('c1', 'Подтема Я', 1, { parentId: 't1' }),
    t('k1', 'Я-под', 1, { parentId: 't2' }), // по названию «А-под» раньше, по порядку создания — «Я-под»
    t('k2', 'А-под', 2, { parentId: 't2' }),
    t('r1', 'Н и НН', 1, { kind: 'rule' }),
    t('r2', 'Запятые', 2, { kind: 'rule' }),
    t('g', 'Общие термины', 1, { kind: 'glossary' }),
    t('p1', 'Тема Б', 1, {}, 's2'),
    t('p2', 'Тема А', 2, {}, 's2')
  ];
  return d;
}
const sortOf = (d: AppData, id: string) => d.subjects.find((x) => x.id === id)?.topicSort;
const withSort = (d: AppData, id: string, topicSort: unknown): AppData => ({ ...d, subjects: d.subjects.map((x) => (x.id === id ? { ...x, topicSort: topicSort as never } : x)) });

describe('1.8: порядок тем по названию', () => {
  quietSave();
  it('числа в названиях сравниваются как числа: тема 1, 2, 10; ё = е; регистр не важен', () => {
    const d = emptyData();
    d.subjects = [{ id: 's', name: 'А', color: '#000', createdAt: T0 }];
    d.topics = [t('a', 'Тема 10', 1), t('b', 'тема 2', 2), t('c', 'Тема 1', 3), t('d', 'Ёж', 4), t('e', 'Ель', 5), t('f', 'Ежевика', 6)];
    expect(childTopics(d, 's').map((x) => x.name)).toEqual(['Ёж', 'Ежевика', 'Ель', 'Тема 1', 'тема 2', 'Тема 10']);
  });

  it('«§», «№», «#» и пробел после них не мешают: «§2», «№ 3» — это просто числа; «1. Введение» стоит рядом с «§1», а не после всех «§»', () => {
    const d = emptyData();
    d.subjects = [{ id: 's', name: 'А', color: '#000', createdAt: T0 }];
    d.topics = [t('a', '§10. Наречие', 1), t('b', '§2. Глагол', 2), t('c', '1. Введение', 3), t('d', '§1. Имя', 4), t('e', '№ 3. Союз', 5), t('f', '# 4. Частица', 6)];
    const names = childTopics(d, 's').map((x) => x.name);
    const at = (n: string) => names.indexOf(n);
    expect(Math.max(at('1. Введение'), at('§1. Имя'))).toBeLessThan(at('§2. Глагол'));
    expect(at('§2. Глагол')).toBeLessThan(at('№ 3. Союз'));
    expect(at('№ 3. Союз')).toBeLessThan(at('# 4. Частица'));
    expect(at('# 4. Частица')).toBeLessThan(at('§10. Наречие'));
  });

  it('«§ 3» и «§3» стоят рядом — между «§2» и «§4», а не в разных концах списка', () => {
    const d = emptyData();
    d.subjects = [{ id: 's', name: 'А', color: '#000', createdAt: T0 }];
    d.topics = [t('a', '§4', 1), t('sp', '§ 3', 2), t('b', '§2', 3), t('nosp', '§3', 4), t('c', '§10', 5)];
    const ids = childTopics(d, 's').map((x) => x.id);
    expect(ids[0]).toBe('b');
    expect(ids.slice(1, 3).sort()).toEqual(['nosp', 'sp']);
    expect(ids.slice(3)).toEqual(['a', 'c']);
  });

  it('одинаковые названия идут в порядке «order», потом по дате создания', () => {
    const d = emptyData();
    d.subjects = [{ id: 's', name: 'А', color: '#000', createdAt: T0 }];
    d.topics = [t('x2', 'Повторение', 2), t('x1', 'повторение', 1), t('x0', 'Повторение', 3, { createdAt: '2026-01-01T00:00:00.000Z' })];
    expect(childTopics(d, 's').map((x) => x.id)).toEqual(['x1', 'x2', 'x0']);
  });

  it('«в своём порядке» берёт order только у того предмета, где включено; неизвестное значение не ломает список', () => {
    const d = order180();
    const manual = withSort(d, 's', 'manual');
    expect(childTopics(manual, 's').map((x) => x.id)).toEqual(['t2', 't10', 't1']);
    expect(childTopics(manual, 's2').map((x) => x.id)).toEqual(['p2', 'p1']); // соседний предмет — по названию
    expect(childTopics(withSort(d, 's', 'zzz'), 's').map((x) => x.id)).toEqual(['t1', 't2', 't10']); // мусор в поле — как по умолчанию, по названию
    expect([...d.topics].sort(topicOrder(d, 's')).length).toBe(d.topics.length); // сортировка не теряет темы
  });

  it('подтемы, правила и общие термины в дереве тем не смешиваются', () => {
    const d = order180();
    expect(childTopics(d, 's', 't1').map((x) => x.id)).toEqual(['c1']);
    expect(childTopics(d, 's').some((x) => x.kind)).toBe(false);
  });

  it('перетащил тему между соседями — «свой порядок» включается у этого предмета и совпадает с тем, что было видно', () => {
    replaceData(order180());
    // Видно: §1, §2, §10. Ставим §10 перед §1.
    expect(childTopics(getData(), 's').map((x) => x.id)).toEqual(['t1', 't2', 't10']);
    expect(moveTopic('t10', { subjectId: 's', beforeId: 't1' })).toBe(true);
    expect(sortOf(getData(), 's')).toBe('manual');
    expect(childTopics(getData(), 's').map((x) => x.id)).toEqual(['t10', 't1', 't2']);
  });

  it('перетаскивание в предмете A не меняет порядок и режим в предмете B', () => {
    replaceData(order180());
    const before = childTopics(getData(), 's2').map((x) => x.id);
    expect(before).toEqual(['p2', 'p1']); // по названию: «Тема А», «Тема Б» (по созданию было бы наоборот)
    moveTopic('t10', { subjectId: 's', beforeId: 't1' });
    expect(sortOf(getData(), 's2')).toBeUndefined();
    expect(childTopics(getData(), 's2').map((x) => x.id)).toEqual(before);
  });

  it('перенос темы в другой предмет между соседями включает «свой порядок» только там, куда перенесли', () => {
    replaceData(order180());
    expect(moveTopic('t10', { subjectId: 's2', beforeId: 'p2' })).toBe(true);
    expect(sortOf(getData(), 's2')).toBe('manual');
    expect(sortOf(getData(), 's')).toBeUndefined();
    expect(childTopics(getData(), 's2').map((x) => x.id)).toEqual(['t10', 'p2', 'p1']);
    expect(childTopics(getData(), 's').map((x) => x.id)).toEqual(['t1', 't2']);
  });

  it('вложить тему в другую («внутрь») не переключает порядок на «свой»', () => {
    replaceData(order180());
    expect(moveTopic('t2', { subjectId: 's', parentId: 't10' })).toBe(true);
    expect(sortOf(getData(), 's')).toBeUndefined();
    expect(childTopics(getData(), 's', 't10').map((x) => x.id)).toEqual(['t2']);
  });

  it('нельзя положить тему внутрь её же подтемы', () => {
    replaceData(order180());
    expect(moveTopic('t1', { subjectId: 's', parentId: 'c1' })).toBe(false);
  });

  it('старые данные с общей настройкой settings.topicSort (dev-сборка 1.8) не ломают открытие файла', () => {
    const d = normalizeData({ version: 1, subjects: [{ id: 's', name: 'А', color: '#000', createdAt: T0 }], topics: [], cards: [], settings: { topicSort: 'manual' } });
    expect(sortOf(d, 's')).toBeUndefined();
    expect(() => childTopics(d, 's')).not.toThrow();
  });
});

// ---------- Удаление нескольких ----------

function many180(): AppData {
  const d = emptyData();
  d.folders = [{ id: 'f', name: '7 класс', color: '#000', createdAt: T0 }];
  d.subjects = [
    { id: 's1', name: 'Русский', color: '#000', folderId: 'f', createdAt: T0 },
    { id: 's2', name: 'Физика', color: '#000', folderId: 'f', createdAt: T0 },
    { id: 's3', name: 'Химия', color: '#000', createdAt: T0 }
  ];
  d.topics = [t('a', 'А', 1, {}, 's1'), t('b', 'Б', 1, {}, 's2'), t('b2', 'Б-под', 1, { parentId: 'b' }, 's2'), t('c', 'В', 1, {}, 's3')];
  d.cards = [
    { id: 'ca', topicId: 'a', type: 'basic', front: 'q', back: 'a', createdAt: T0, updatedAt: T0 },
    { id: 'cb2', topicId: 'b2', type: 'basic', front: 'q', back: 'a', createdAt: T0, updatedAt: T0 },
    { id: 'cc', topicId: 'c', type: 'basic', front: 'q', back: 'a', createdAt: T0, updatedAt: T0 }
  ];
  d.states = { 'ca:0': { due: T0, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, reps: 1, lapses: 0, state: 2, last_review: T0 } as never };
  d.logs = [{ key: 'ca:0', cardId: 'ca', topicId: 'a', at: T0, rating: 3, ms: 1000 } as never];
  return d;
}

describe('1.8: удалить несколько сразу', () => {
  quietSave();
  it('предмет и его же тема в одном выборе не мешают друг другу; прогресс и журнал уходят и возвращаются', () => {
    replaceData(many180());
    const undo = deleteMany({ subjects: ['s1'], topics: ['a', 'b'] });
    const gone = getData();
    expect(gone.subjects.map((s) => s.id)).toEqual(['s2', 's3']);
    expect(gone.topics.map((x) => x.id)).toEqual(['c']); // «А» ушла с предметом, «Б» с подтемой
    expect(gone.cards.map((c) => c.id)).toEqual(['cc']);
    expect(gone.states['ca:0']).toBeUndefined();
    expect(gone.logs).toHaveLength(0);
    undo();
    const back = getData();
    expect(back.subjects.map((s) => s.id).sort()).toEqual(['s1', 's2', 's3']);
    expect(back.topics.map((x) => x.id).sort()).toEqual(['a', 'b', 'b2', 'c']);
    expect(back.cards).toHaveLength(3);
    expect(back.states['ca:0']).toBeDefined();
    expect(back.logs).toHaveLength(1);
    expect(Object.keys(back.deleted ?? {})).toEqual([]);
  });

  it('папка вместе с одним из своих предметов: второй предмет остаётся без папки, «Вернуть» возвращает всё как было', () => {
    replaceData(many180());
    const undo = deleteMany({ folders: ['f'], subjects: ['s1'] });
    const gone = getData();
    expect(gone.folders).toHaveLength(0);
    expect(gone.subjects.map((s) => [s.id, s.folderId])).toEqual([['s2', undefined], ['s3', undefined]]);
    undo();
    const back = getData();
    expect(back.folders.map((f) => f.id)).toEqual(['f']);
    expect(back.subjects.find((s) => s.id === 's1')?.folderId).toBe('f');
    expect(back.subjects.find((s) => s.id === 's2')?.folderId).toBe('f');
    expect(back.subjects.find((s) => s.id === 's3')?.folderId).toBeUndefined();
  });

  it('лишние и пустые номера ничего не ломают', () => {
    replaceData(many180());
    const before = getData();
    const undo = deleteMany({ folders: ['нет'], subjects: ['нет'], topics: ['нет'] });
    expect(getData().subjects).toEqual(before.subjects);
    expect(getData().topics).toEqual(before.topics);
    undo();
    expect(getData().topics.map((x) => x.id)).toEqual(before.topics.map((x) => x.id));
    expect(() => deleteMany({})()).not.toThrow();
  });

  it('синхронизация: удалённое не воскресает со старой копии, а возвращённое — не пропадает', () => {
    // Часы ставим сами: отметки времени — с точностью до миллисекунды, а тест нажимает «Удалить» и «Вернуть» подряд.
    // Если они попадут в одну и ту же миллисекунду (быстрый компьютер), отметка об удалении окажется «не старше» возвращённой записи
    // и слияние её уберёт. Человек так быстро не нажмёт, поэтому между шагами проходит минута.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-09-29T10:00:00.000Z'));
      replaceData(many180());
      const old = getData(); // «другое устройство» ещё помнит всё
      const undo = deleteMany({ folders: ['f'], subjects: ['s1'], topics: ['b'] });
      const afterDelete = getData();
      const merged = mergeData(afterDelete, old).data;
      expect(merged.folders).toHaveLength(0);
      expect(merged.subjects.map((s) => s.id)).toEqual(['s2', 's3']);
      expect(merged.topics.map((x) => x.id)).toEqual(['c']);
      expect(merged.cards.map((c) => c.id)).toEqual(['cc']);
      // Передумал: «Вернуть». Устройство, которое уже получило отметки об удалении, возвращённое не стирает.
      vi.setSystemTime(new Date('2026-09-29T10:01:00.000Z'));
      undo();
      const restored = mergeData(getData(), afterDelete).data;
      expect(restored.folders.map((f) => f.id)).toEqual(['f']);
      expect(restored.subjects.map((s) => s.id).sort()).toEqual(['s1', 's2', 's3']);
      expect(restored.topics.map((x) => x.id).sort()).toEqual(['a', 'b', 'b2', 'c']);
      expect(restored.cards).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------- Совместимость данных ----------

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const old180 = (settings: Record<string, unknown>) => ({ version: 1, subjects: [], topics: [], cards: [], settings });

describe('1.8: старые файлы данных открываются', () => {
  it('файл без topicSort и bgImage: темы по названию, фона нет, значок как был', () => {
    for (const icon of ['default', 'theme', undefined]) {
      const d = normalizeData({ ...old180({ theme: 'dark', appIcon: icon }), subjects: [{ id: 's', name: 'А', color: '#000', createdAt: T0 }] });
      expect(d.settings.appIcon).toBe(icon);
      expect(sortOf(d, 's')).toBeUndefined();
      expect(d.settings.bgImage).toBeUndefined();
    }
  });

  it('значок — id темы (строка) и «свой порядок» предмета сохраняются', () => {
    const d = normalizeData({ ...old180({ appIcon: 'sakura' }), subjects: [{ id: 's', name: 'А', color: '#000', topicSort: 'manual', createdAt: T0 }] });
    expect(d.settings.appIcon).toBe('sakura');
    expect(sortOf(d, 's')).toBe('manual');
  });

  it('фон: своя картинка сохраняется, чужое и битое отбрасывается', () => {
    expect(normalizeData(old180({ bgImage: { src: PNG_1PX, fade: 0.5 } })).settings.bgImage).toEqual({ src: PNG_1PX, fade: 0.5 });
    expect(normalizeData(old180({ bgImage: { src: PNG_1PX } })).settings.bgImage?.fade).toBe(0.78);
    expect(normalizeData(old180({ bgImage: { src: PNG_1PX, fade: NaN } })).settings.bgImage?.fade).toBe(0.78);
    for (const src of [5, null, 'https://evil.example/x.png', 'javascript:alert(1)', 'data:text/html;base64,PGI+', 'data:image/png;base64,AAA")}body{display:none', 'data:image/svg+xml;base64,PHN2Zz4=']) {
      expect(normalizeData(old180({ bgImage: { src, fade: 0.5 } })).settings.bgImage).toBeUndefined();
    }
  });

  it('новые поля не мешают старым: расписание, ключи, значок остаются', () => {
    const s = normalizeData(old180({ schedule: { '1': ['a'] }, keys: { makeCard: 'Ctrl+K' }, appIcon: 'night' })).settings;
    expect(s.schedule).toEqual({ '1': ['a'] });
    expect(s.keys).toEqual({ makeCard: 'Ctrl+K' });
    expect(s.appIcon).toBe('night');
  });
});

describe('1.8: фон картинкой в окне', () => {
  const fakeRoot = () => {
    const props = new Map<string, string>();
    const root = { style: { setProperty: (k: string, v: string) => props.set(k, v), removeProperty: (k: string) => props.delete(k) }, dataset: {} as Record<string, string | undefined> };
    return { root: root as unknown as HTMLElement, props, dataset: root.dataset };
  };
  const withBg = (bg: unknown): AppData['settings'] => ({ ...emptyData().settings, bgImage: bg as never });

  it('«насколько видно» ограничено 0,72–0,95 (как ползунок в настройках), флаг фона ставится и снимается', () => {
    const a = fakeRoot();
    applyLook(a.root, withBg({ src: PNG_1PX, fade: 2 }), false);
    expect(a.props.get('--bg-fade')).toBe('0.95');
    expect(a.props.get('--bg-img')).toBe(`url("${PNG_1PX}")`);
    expect(a.dataset.bgimg).toBe('1');
    applyLook(a.root, withBg({ src: PNG_1PX, fade: 0 }), true);
    expect(a.props.get('--bg-fade')).toBe('0.72');
    applyLook(a.root, withBg(undefined), false);
    expect(a.props.has('--bg-img')).toBe(false);
    expect(a.dataset.bgimg).toBeUndefined();
  });

  it('битая картинка или fade без числа не ломают оформление', () => {
    const a = fakeRoot();
    applyLook(a.root, withBg({ src: 'https://evil.example/x.png', fade: 0.5 }), false);
    expect(a.props.has('--bg-img')).toBe(false);
    applyLook(a.root, withBg({ src: PNG_1PX, fade: 'много' }), false);
    expect(a.props.get('--bg-fade')).toBe('0.82');
  });
});

// ---------- Ошибки, найденные тестером (исправлены) ----------
// Каждая проверка описывает правильное поведение и защищает от возврата ошибки.

describe('1.8 — найденные ошибки (исправлены)', () => {
  quietSave();
  it('A: ответ в рамке ``` с кодом ``` внутри конспекта читается целиком, а не обрезается на коде', () => {
    // Раньше parseChangeFile брал текст до ПЕРВОГО ``` внутри — карточки и остаток конспекта пропадали без предупреждения.
    const r = pack('```\n@предмет Информатика\n@тема Python\nПример:\n```python\nprint(1)\n```\nХвост\n@карточки\nЧто печатает print(1)? :: 1\n```');
    expect(String(r.changes.find((c) => c.do === 'topic')!.note)).toContain('print(1)');
    expect(r.changes.some((c) => c.do === 'cards')).toBe(true);
  });

  it('A2: рамка из четырёх ```` (нейросети так делают, если внутри есть код) тоже читается целиком', () => {
    const r = pack('````\n@предмет Информатика\n@тема Python\nПример:\n```python\nprint(1)\n```\n@карточки\nЧто печатает print(1)? :: 1\n````');
    expect(r.changes.some((c) => c.do === 'cards')).toBe(true);
  });

  it('B: «::» внутри вопроса (std::cout, a[::2]) не рвёт карточку; делить надо по « :: » с пробелами', () => {
    const cards = parseMnemaText('@предмет C++\n@тема Ввод\n@карточки\nЧто делает std::cout? :: Печатает на экран').changes.find((c) => c.do === 'cards')!.cards as Record<string, string>[];
    expect(cards).toEqual([{ front: 'Что делает std::cout?', back: 'Печатает на экран' }]);
  });

  it('C: перетаскивание темы не меняет порядок правил и «общих терминов» предмета', () => {
    // Раньше moveTopic перенумеровывал и правила со словарём предмета (kind), и в режиме «по названию»
    // правила переставлялись по алфавиту: «Н и НН, Запятые» → «Запятые, Н и НН».
    replaceData(order180());
    const rulesBefore = subjectRules(getData(), 's').map((x) => x.id);
    moveTopic('t10', { subjectId: 's', beforeId: 't1' });
    expect(subjectRules(getData(), 's').map((x) => x.id)).toEqual(rulesBefore);
  });

  it('E: первое перетаскивание в предмете не меняет порядок подтем у других родителей этого же предмета', () => {
    // Раньше подтемы «§2» внезапно перестраивались («А-под, Я-под» → «Я-под, А-под»): при первом переключении
    // на «свой» порядок нумеровались только соседи перетащенной темы, а у остальных групп оставался порядок создания.
    // Теперь при переключении закрепляется видимый порядок ВСЕХ групп предмета.
    replaceData(order180());
    const before = childTopics(getData(), 's', 't2').map((x) => x.id);
    expect(before).toEqual(['k2', 'k1']);
    moveTopic('t10', { subjectId: 's', beforeId: 't1' });
    expect(childTopics(getData(), 's', 't2').map((x) => x.id)).toEqual(before);
  });
});
