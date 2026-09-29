import { describe, expect, it } from 'vitest';
import { aiInstructions, exportChanges, hideImages, imageToken, packToText, parseChangeFile, planChanges, revertChanges } from './changes';
import { emptyData } from './store';
import type { AppData } from './types';

let n = 0;
const env = { now: new Date('2026-09-29T10:00:00Z'), uid: () => 'id' + ++n };
const T0 = '2026-09-01T10:00:00.000Z';

function base(): AppData {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'Биология', color: '#2F9E5B', createdAt: T0 }];
  d.topics = [{ id: 't1', subjectId: 's1', name: '§12 Фотосинтез', note: 'Старый текст ![Рисунок](data:image/svg+xml;base64,AAAA)', createdAt: T0, updatedAt: T0 }];
  d.cards = [{ id: 'c1', topicId: 't1', type: 'basic', front: 'Что такое фотосинтез?', back: 'старый ответ', createdAt: T0, updatedAt: T0 }];
  d.states = { 'c1:0': { due: T0, stability: 5, difficulty: 5, elapsed_days: 1, scheduled_days: 3, learning_steps: 0, reps: 3, lapses: 0, state: 2 } };
  return d;
}

describe('1.7: файл изменений — чтение', () => {
  it('достаёт JSON из ответа нейросети с ```json и прощает висячие запятые', () => {
    const r = parseChangeFile('Вот файл:\n```json\n{"title":"Т","changes":[{"do":"subject","name":"Химия",},]}\n```\nУдачи!');
    expect(r.ok && r.pack.changes).toHaveLength(1);
    expect(r.ok && r.pack.title).toBe('Т');
  });
  it('понимает просто массив и текст вокруг без ```', () => {
    const r = parseChangeFile('держи [{"do":"folder","name":"8 класс"}] всё');
    expect(r.ok && r.pack.changes[0].do).toBe('folder');
  });
  it('не JSON и пустой список — понятная ошибка', () => {
    expect(parseChangeFile('привет').ok).toBe(false);
    expect(parseChangeFile('{"changes":[]}').ok).toBe(false);
  });
});

describe('1.7: файл изменений — применение', () => {
  it('создаёт папку, предмет в ней, тему с конспектом по названиям', () => {
    const p = planChanges(base(), { changes: [
      { do: 'subject', name: 'Химия', color: 'синий', folder: '8 класс' },
      { do: 'topic', subject: 'химия', topic: 'Атомы', note: '## Атом\n**Атом** — частица' }
    ] }, env);
    const chem = p.data.subjects.find((s) => s.name === 'Химия')!;
    expect(chem.color).toBe('#3A5BD9');
    expect(p.data.folders[0].name).toBe('8 класс');
    expect(chem.folderId).toBe(p.data.folders[0].id);
    expect(p.data.topics.find((t) => t.name === 'Атомы')?.note).toContain('**Атом**');
    expect(p.lines.filter((l) => l.kind === 'add').length).toBeGreaterThanOrEqual(3);
    expect(p.warnings).toEqual([]);
  });

  it('не трогает исходные данные (можно показать план и отменить)', () => {
    const d = base();
    const snapshot = JSON.stringify(d);
    planChanges(d, { changes: [{ do: 'delete', what: 'subject', name: 'Биология' }] }, env);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it('карточки: совпадающие по вопросу обновляются с сохранением прогресса, новые добавляются, replace убирает лишние', () => {
    const d = base();
    d.cards.push({ id: 'c2', topicId: 't1', type: 'basic', front: 'Лишняя', back: 'x', createdAt: T0, updatedAt: T0 });
    const p = planChanges(d, { changes: [{ do: 'cards', subject: 'Биология', topic: '§12 фотосинтез', mode: 'replace', cards: [
      { front: 'что такое  фотосинтез?', back: 'Синтез органики на свету' },
      { front: 'Где идёт фотосинтез?', back: 'В хлоропластах' }
    ] }] }, env);
    const c1 = p.data.cards.find((c) => c.id === 'c1')!;
    expect(c1.back).toBe('Синтез органики на свету');
    expect(p.data.states['c1:0']).toBeDefined(); // прогресс не потерян
    expect(p.data.cards.some((c) => c.id === 'c2')).toBe(false);
    expect(p.data.deleted?.['card:c2']).toBeDefined();
    expect(p.data.cards.filter((c) => c.topicId === 't1')).toHaveLength(2);
  });

  it('словарь: создаётся, строки в любом виде, обновление по первому столбцу', () => {
    const p1 = planChanges(base(), { changes: [{ do: 'list', subject: 'Биология', topic: '§12 Фотосинтез', kind: 'terms', rows: [['хлорофилл', 'пигмент'], { term: 'стома', definition: 'устьице' }, 'квант — порция света'] }] }, env);
    const t = p1.data.topics.find((x) => x.id === 't1')!;
    expect(t.lists?.[0].kind).toBe('terms');
    expect(p1.data.cards.filter((c) => c.listId === t.lists![0].id).map((c) => c.front)).toEqual(['хлорофилл', 'стома', 'квант']);
    const p2 = planChanges(p1.data, { changes: [{ do: 'list', subject: 'Биология', topic: '§12 Фотосинтез', title: 'Термины', rows: [['Хлорофилл', 'зелёный пигмент']] }] }, env);
    expect(p2.data.cards.find((c) => c.front === 'хлорофилл')?.back).toBe('зелёный пигмент');
    expect(p2.data.cards.filter((c) => c.listId)).toHaveLength(3);
  });

  it('правило, общие термины, стихотворение, домашка, расписание', () => {
    const p = planChanges(base(), { changes: [
      { do: 'rule', subject: 'Русский язык', name: 'Н и НН', text: 'Правило…', words: ['деревянный'] },
      { do: 'glossary', subject: 'Биология', rows: [['клетка', 'единица живого']] },
      { do: 'poem', subject: 'Литература', topic: 'Пушкин', title: 'Зимнее утро', text: 'Мороз и солнце; день чудесный!\nЕщё ты дремлешь, друг прелестный' },
      { do: 'homework', subject: 'Биология', text: '§ 12', due: '2026-10-01' },
      { do: 'schedule', day: 'пн', subjects: ['Биология', 'Литература'] }
    ] }, env);
    expect(p.data.topics.find((t) => t.kind === 'rule')?.ruleWords).toEqual(['деревянный']);
    expect(p.data.topics.find((t) => t.kind === 'glossary' && t.subjectId === 's1')).toBeDefined();
    expect(p.data.topics.find((t) => t.name === 'Пушкин')?.poems?.[0].title).toBe('Зимнее утро');
    expect(p.data.homework[0]).toMatchObject({ text: '§ 12', due: '2026-10-01', subjectId: 's1' });
    expect(p.data.settings.schedule['1']).toHaveLength(2);
    expect(p.data.settings.features.schedule).toBe(true);
    expect(p.warnings).toEqual([]);
  });

  it('удаление темы убирает карточки и прогресс, отмечает для синхронизации', () => {
    const p = planChanges(base(), { changes: [{ do: 'delete', what: 'topic', subject: 'Биология', name: '§12 Фотосинтез' }] }, env);
    expect(p.data.topics).toHaveLength(0);
    expect(p.data.cards).toHaveLength(0);
    expect(p.data.states['c1:0']).toBeUndefined();
    expect(p.data.deleted?.['topic:t1']).toBeDefined();
    expect(p.lines[0].kind).toBe('del');
  });

  it('непонятное — предупреждение, а не падение', () => {
    const p = planChanges(base(), { changes: [{ do: 'fly' }, { do: 'cards', cards: [] }, { do: 'delete', what: 'topic', subject: 'Биология', name: 'Нет такой' }] }, env);
    expect(p.warnings).toHaveLength(3);
  });
});

describe('1.7: выгрузка для нейросети и обратно', () => {
  it('картинки уходят «подписью» и возвращаются на место', () => {
    const d = base();
    const pack = exportChanges(d, { subjectId: 's1' });
    const topic = pack.changes.find((c) => c.do === 'topic')!;
    expect(String(topic.note)).not.toContain('data:image');
    expect(String(topic.note)).toContain(imageToken('data:image/svg+xml;base64,AAAA'));
    // нейросеть дописала текст и вернула файл
    const back = parseChangeFile(packToText({ changes: [{ ...topic, note: String(topic.note) + '\n\nНовый абзац' }] }));
    expect(back.ok).toBe(true);
    const p = planChanges(d, back.ok ? back.pack : { changes: [] }, env);
    expect(p.data.topics[0].note).toContain('data:image/svg+xml;base64,AAAA');
    expect(p.data.topics[0].note).toContain('Новый абзац');
  });

  it('выгрузка и загрузка обратно ничего не меняют', () => {
    const d = base();
    const p = planChanges(d, exportChanges(d, { subjectId: 's1' }), env);
    expect(p.data.cards).toEqual(d.cards);
    expect(p.data.topics[0].note).toBe(d.topics[0].note);
  });

  it('инструкция перечисляет, что уже есть', () => {
    expect(aiInstructions(base())).toContain('§12 Фотосинтез');
    expect(hideImages('![a](data:x)')).toMatch(/mnema-img:/);
  });
});

describe('1.7: файл изменений — защита данных', () => {
  it('подтемы с одинаковым названием в разных главах не сливаются (выгрузка → загрузка)', () => {
    const d = base();
    d.topics.push(
      { id: 'g1', subjectId: 's1', name: 'Глава 1', note: '', createdAt: T0, updatedAt: T0 },
      { id: 'g2', subjectId: 's1', name: 'Глава 2', note: '', createdAt: T0, updatedAt: T0 },
      { id: 'z1', subjectId: 's1', name: 'Задачи', parentId: 'g1', note: 'первая', examDate: '2026-10-01', createdAt: T0, updatedAt: T0 },
      { id: 'z2', subjectId: 's1', name: 'Задачи', parentId: 'g2', note: 'вторая', createdAt: T0, updatedAt: T0 }
    );
    d.cards.push({ id: 'k2', topicId: 'z2', type: 'basic', front: 'Q2', back: 'A2', createdAt: T0, updatedAt: T0 });
    const p = planChanges(d, exportChanges(d, { subjectId: 's1' }), env);
    expect(p.data.topics).toEqual(d.topics);
    expect(p.data.cards).toEqual(d.cards);
    expect(p.lines).toEqual([]);
    // без главы — неоднозначно: предупреждение, а не правка наугад
    const amb = planChanges(d, { changes: [{ do: 'topic', subject: 'Биология', topic: 'Задачи', note: 'x' }] }, env);
    expect(amb.warnings[0]).toMatch(/несколько/);
    expect(amb.data.topics.find((t) => t.id === 'z1')?.note).toBe('первая');
  });

  it('«constructor», «__proto__» и прочие встроенные имена не портят данные', () => {
    const p = planChanges(base(), { changes: [
      { do: 'subject', name: 'Биология', color: 'constructor' },
      { do: 'list', subject: 'Биология', topic: '§12 Фотосинтез', mode: 'constructor', kind: '__proto__', rows: [['a', 'b']] },
      { do: 'cards', subject: 'Биология', topic: '§12 Фотосинтез', cards: [{ front: 'Q', back: 'A', type: 'constructor' }] },
      { do: 'schedule', day: '__proto__', subjects: ['Биология'] }
    ] }, env);
    const d = JSON.parse(JSON.stringify(p.data)) as AppData;
    expect(typeof d.subjects[0].color).toBe('string');
    expect(d.topics[0].lists?.[0].mode).toBe('basic');
    expect(d.cards.find((c) => c.front === 'Q')?.type).toBe('basic');
    expect(Object.keys(d.settings.schedule)).not.toContain('[object Object]');
  });

  it('replace с непонятыми полями ничего не удаляет', () => {
    const p = planChanges(base(), { changes: [{ do: 'cards', subject: 'Биология', topic: '§12 Фотосинтез', mode: 'replace', cards: [{ q: 'вопрос', a: 'ответ' }] }] }, env);
    expect(p.data.cards).toHaveLength(1);
    expect(p.warnings[0]).toMatch(/не понял/);
  });

  it('«Вернуть» отменяет только файл и не боится синхронизации', () => {
    const before = base();
    const p = planChanges(before, { changes: [
      { do: 'topic', subject: 'Химия', topic: 'Атомы', note: 'x' },
      { do: 'delete', what: 'topic', subject: 'Биология', name: '§12 Фотосинтез' }
    ] }, env);
    // после применения ученик успел добавить домашку
    const current: AppData = { ...p.data, homework: [{ id: 'h9', text: 'новое', createdAt: T0, updatedAt: T0 }] };
    const back = revertChanges(before, p.data, current, new Date('2026-09-29T11:00:00Z'));
    expect(back.topics.map((t) => t.id)).toEqual(['t1']);
    expect(back.topics[0].updatedAt).toBe('2026-09-29T11:00:00.000Z'); // свежая отметка — синхронизация не «вернёт» удаление
    expect(back.deleted?.['topic:t1']).toBeUndefined();
    expect(back.subjects.some((s) => s.name === 'Химия')).toBe(false);
    expect(Object.keys(back.deleted ?? {}).some((k) => k.startsWith('subj:'))).toBe(true);
    expect(back.cards.map((c) => c.id)).toEqual(['c1']);
    expect(back.states['c1:0']).toBeDefined();
    expect(back.homework).toHaveLength(1); // сделанное после — на месте
  });
});
