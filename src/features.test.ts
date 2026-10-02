import { describe, expect, it } from 'vitest';
import { boldTerms, mentioned, suggestFromSelection } from './noteTools';
import { convertObsidian, noteTitle, topFolder } from './obsidian';
import { isTopicPackage } from './share';
import { buildQueue, isLeech, tomorrowSubjects, DAY } from './srs';
import { emptyData } from './store';
import { buildTest, itemAnswer, schoolGrade } from './testgen';
import type { AppData, Card } from './types';

const card = (p: Partial<Card>): Card => ({ id: 'c1', topicId: 't1', type: 'basic', front: 'Q', back: 'A', createdAt: '', updatedAt: '', ...p });

function base(): AppData {
  const d = emptyData();
  d.subjects = [
    { id: 's1', name: 'Биология', color: '#000', createdAt: '' },
    { id: 's2', name: 'История', color: '#111', createdAt: '' }
  ];
  d.topics = [
    { id: 't1', subjectId: 's1', name: 'T1', note: '', createdAt: '', updatedAt: '' },
    { id: 't2', subjectId: 's2', name: 'T2', note: '', createdAt: '', updatedAt: '' }
  ];
  return d;
}

describe('карточка из выделения', () => {
  it('«Термин — определение» становится вопросом', () => {
    expect(suggestFromSelection('**Фотосинтез** — образование органических веществ на свету')).toEqual({
      type: 'basic',
      front: 'Что такое фотосинтез?',
      back: 'образование органических веществ на свету.'
    });
  });
  it('короткое — двусторонняя, длинное — с пропуском', () => {
    expect(suggestFromSelection('Хлорофилл').type).toBe('reverse');
    expect(suggestFromSelection('Световая фаза идёт в мембранах тилакоидов').type).toBe('cloze');
  });
  it('формулы из выделения сохраняются', () => {
    expect(suggestFromSelection('Закон Ома — $I = \\frac{U}{R}$').back).toBe('$I = \\frac{U}{R}$.');
  });
});

describe('«Закрой и перескажи»', () => {
  it('находит жирные понятия и узнаёт их в другой форме слова', () => {
    const terms = boldTerms('**Фотосинтез** идёт при участии **хлорофилла**. **Итог:** ...');
    expect(terms).toEqual(['Фотосинтез', 'хлорофилла']);
    expect(mentioned('хлорофилла', 'нужен хлорофилл')).toBe(true);
    expect(mentioned('Фотосинтез', 'растения дышат')).toBe(false);
  });
});

describe('Obsidian', () => {
  it('убирает свойства, ссылки, комментарии и выноски', () => {
    const md = '---\ntags: [bio]\n---\n# Заголовок\nСм. [[Клетка|клетку]] и [[Митоз#Фазы]].\n%%скрыто%%\n> [!tip] Запомни\n> текст\nСтрока ^abc123';
    expect(convertObsidian(md)).toBe('# Заголовок\nСм. клетку и Митоз.\n\n> **Запомни**\n> текст\nСтрока');
  });
  it('встраивает найденные картинки и помечает ненайденные', () => {
    const out = convertObsidian('![[схема.png|300]] ![[нет.png]] ![[Другая заметка]]', { 'схема.png': 'data:image/png;base64,AAA' });
    expect(out).toContain('![схема.png](data:image/png;base64,AAA)');
    expect(out).toContain('картинка «нет.png» не найдена');
    expect(out).toContain('см. заметку «Другая заметка»');
  });
  it('название и папка', () => {
    expect(noteTitle('Биология/Клетка.md')).toBe('Клетка');
    expect(topFolder('Биология/Раздел/Клетка.md')).toBe('Биология');
    expect(topFolder('Клетка.md')).toBeNull();
  });
});

describe('пробная контрольная', () => {
  it('ответы элементов', () => {
    expect(itemAnswer(card({ type: 'reverse', front: 'термин', back: 'значение' }), 1)).toBe('термин');
    expect(itemAnswer(card({ type: 'cloze', front: 'a {{b}} c {{d}}' }), 1)).toBe('d');
    expect(itemAnswer(card({ type: 'typing', back: 'кислород|O2' }), 0)).toBe('кислород');
  });
  it('варианты ответа из других карточек, без повторов', () => {
    const d = base();
    d.cards = ['один', 'два', 'три', 'четыре', 'пять'].map((a, i) => card({ id: 'c' + i, front: 'Вопрос ' + i, back: a }));
    const t = buildTest(d, 't1', 5, () => 0.42);
    expect(t).toHaveLength(5);
    for (const q of t) {
      expect(q.kind).toBe('choice');
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.answer);
    }
  });
  it('если вариантов мало — самопроверка; ввод остаётся вводом', () => {
    const d = base();
    d.cards = [card({ id: 'a', back: 'x' }), card({ id: 'b', back: 'y' }), card({ id: 'c', type: 'typing', back: '1861' })];
    const t = buildTest(d, 't1', 3, () => 0.3);
    expect(t.find((q) => q.cardId === 'a')!.kind).toBe('self');
    expect(t.find((q) => q.cardId === 'c')!.kind).toBe('typed');
  });
  it('примерная оценка', () => {
    expect(schoolGrade(9, 10)).toBe(5);
    expect(schoolGrade(7, 10)).toBe(4);
    expect(schoolGrade(5, 10)).toBe(3);
    expect(schoolGrade(4, 10)).toBe(2);
  });
});

describe('расписание уроков', () => {
  it('завтрашние предметы идут первыми', () => {
    const d = base();
    d.settings.features.schedule = true;
    const now = new Date('2026-09-24T10:00:00'); // четверг → завтра пятница (5)
    d.settings.schedule = { '5': ['s2'] };
    expect(tomorrowSubjects(d, now)).toEqual(['s2']);
    d.cards = [card({ id: 'a1', topicId: 't1' }), card({ id: 'a2', topicId: 't1' }), card({ id: 'b1', topicId: 't2' })];
    d.settings.newPerDay = 0;
    const past = new Date(now.getTime() - DAY).toISOString();
    for (const c of d.cards) d.states[c.id + ':0'] = { due: past, stability: 5, difficulty: 5, elapsed_days: 5, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: past };
    const q = buildQueue(d, now, {}, () => 0.1);
    expect(q[0].cardId).toBe('b1');
  });
  it('в субботу вечером воскресенье пропускается', () => {
    const d = base();
    d.settings.schedule = { '1': ['s1'] };
    expect(tomorrowSubjects(d, new Date('2026-09-26T18:00:00'))).toEqual([]);
  });
});

describe('трудные карточки', () => {
  it('карточка трудная после порога ошибок', () => {
    const d = base();
    const c = card({ id: 'x' });
    d.cards = [c];
    d.states['x:0'] = { due: '', stability: 1, difficulty: 8, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 9, lapses: 5, state: 3 };
    expect(isLeech(d, c)).toBe(true);
    d.states['x:0'] = { ...d.states['x:0'], lapses: 2 };
    expect(isLeech(d, c)).toBe(false); // меньше порога (по умолчанию 5)
  });
});

describe('файл темы', () => {
  it('проверяет формат', () => {
    expect(isTopicPackage({ kind: 'mnema-topic', version: 1, topic: { name: 'Т', note: '' }, cards: [] })).toBe(true);
    expect(isTopicPackage({ kind: 'другое' })).toBe(false);
  });
});
