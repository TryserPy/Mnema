// Версия 1.29.0: подписи интервалов на кнопках оценки и прочие исправления этапа 1.
import { describe, expect, it } from 'vitest';
import { DAY, formatInterval, gradeItem, previewIntervals } from './srs';

describe('подписи интервалов на кнопках оценки', () => {
  it('коротко и по-русски', () => {
    expect(formatInterval(20_000)).toBe('<1 мин');
    expect(formatInterval(10 * 60_000)).toBe('10 мин');
    expect(formatInterval(3 * 3600_000)).toBe('3 ч');
    expect(formatInterval(DAY)).toBe('1 д');
    expect(formatInterval(3 * DAY)).toBe('3 д');
    expect(formatInterval(14 * DAY)).toBe('2 нед');
    expect(formatInterval(21 * DAY)).toBe('3 нед');
    expect(formatInterval(45 * DAY)).toBe('1,5 мес');
    expect(formatInterval(60 * DAY)).toBe('2 мес');
    expect(formatInterval(200 * DAY)).toBe('6,5 мес');
    expect(formatInterval(800 * DAY)).toBe('2,2 г');
  });
  it('показывает ровно то, что применит планировщик', () => {
    const now = new Date('2026-10-01T10:00:00');
    const s = gradeItem(undefined, now, 3, { retention: 0.9 });
    const later = new Date(s.due);
    const preview = previewIntervals(s, later, { retention: 0.9 });
    expect(preview).toHaveLength(4);
    // «Хорошо» из preview совпадает по порядку величины с реальным результатом (разница только в разбросе fuzz)
    const real = new Date(gradeItem(s, later, 3, { retention: 0.9 }).due).getTime() - later.getTime();
    expect(Math.abs(real - preview[2]) / Math.max(real, preview[2])).toBeLessThan(0.35);
    // чем лучше оценка, тем дальше повтор
    expect(preview[0]).toBeLessThan(preview[1]);
    expect(preview[1]).toBeLessThanOrEqual(preview[2]);
    expect(preview[2]).toBeLessThan(preview[3]);
  });
});

// ---------- Что показывать на главной кнопке: «Учить», «Учить новые», «Всё повторено», «Нечего повторять», «Нет карточек» ----------
import { buildQueue, itemKey } from './srs';
import { emptyData } from './store';
import { nextDueText, studyStatus } from './studyStatus';
import type { AppData, Card, ItemState } from './types';

const NOW = new Date('2026-10-11T12:00:00');
const card = (id: string, topicId = 't1'): Card => ({ id, topicId, type: 'basic', front: 'Q' + id, back: 'A' + id, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' });
const state = (dueInDays: number): ItemState => ({ due: new Date(NOW.getTime() + dueInDays * DAY).toISOString(), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 5, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: new Date(NOW.getTime() - 3 * DAY).toISOString() });
function world(cards: Card[], states: Record<string, ItemState> = {}): AppData {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'S', color: '#000', createdAt: '' }];
  d.topics = [
    { id: 't1', subjectId: 's1', name: 'T1', note: '', createdAt: '', updatedAt: '' },
    { id: 't2', subjectId: 's1', parentId: 't1', name: 'T2', note: '', createdAt: '', updatedAt: '' }
  ];
  d.cards = cards;
  d.states = Object.fromEntries(Object.entries(states).map(([id, s]) => [itemKey(id, 0), s]));
  return d;
}
const logToday = (d: AppData, id: string) => d.logs.push({ key: itemKey(id, 0), cardId: id, topicId: 't1', rating: 3, prevState: 2, at: new Date(NOW.getTime() - 3600_000).toISOString(), ms: 3000 });

describe('studyStatus: честная подпись главной кнопки', () => {
  it('нет карточек — «empty», а не «всё повторено»', () => {
    expect(studyStatus(world([]), NOW, { topicId: 't1' }).kind).toBe('empty');
  });
  it('пора повторять — «learn» с числом', () => {
    const d = world([card('a'), card('b')], { a: state(-1), b: state(-2) });
    expect(studyStatus(d, NOW, { topicId: 't1' })).toEqual({ kind: 'learn', due: 2, fresh: 0 });
  });
  it('только новые карточки в пределах дневного лимита — «learn»; когда лимит выбран — «new»', () => {
    const d = world([card('a'), card('b')]);
    expect(studyStatus(d, NOW, { topicId: 't1' }).kind).toBe('learn');
    d.settings = { ...d.settings, newPerDay: 0 };
    expect(studyStatus(d, NOW, { topicId: 't1' })).toEqual({ kind: 'new', fresh: 1 });
  });
  it('ничего не повторял, по расписанию пусто — «idle» со сроком следующего повтора, не «Всё повторено»', () => {
    const d = world([card('a')], { a: state(5) });
    const s = studyStatus(d, NOW, { topicId: 't1' });
    expect(s.kind).toBe('idle');
    if (s.kind === 'idle') expect(nextDueText(s.next)).toBe('через 5 д');
  });
  it('сегодня повторял и больше ничего нет — «done»', () => {
    const d = world([card('a')], { a: state(5) });
    logToday(d, 'a');
    expect(studyStatus(d, NOW, { topicId: 't1' }).kind).toBe('done');
  });
  it('повторял, но остались новые — «new», а не «done»', () => {
    const d = world([card('a'), card('n')], { a: state(5) });
    d.settings = { ...d.settings, newPerDay: 0 };
    logToday(d, 'a');
    expect(studyStatus(d, NOW, { topicId: 't1' }).kind).toBe('new');
  });
  it('карточки подтем считаются вместе с темой', () => {
    const d = world([card('a', 't2')], { a: state(-1) });
    expect(studyStatus(d, NOW, { topicId: 't1' }).kind).toBe('learn');
  });
  it('«Учить новые» действительно даёт новые карточки сверх дневного лимита', () => {
    const d = world([card('a'), card('b'), card('c')]);
    d.settings = { ...d.settings, newPerDay: 0 };
    expect(buildQueue(d, NOW, { topicId: 't1' }).length).toBe(0);
    const s = studyStatus(d, NOW, { topicId: 't1' });
    expect(s.kind).toBe('new');
    if (s.kind === 'new') expect(buildQueue(d, NOW, { topicId: 't1', extraNew: s.fresh }).length).toBe(s.fresh);
  });
  it('список по cardIds (термины) работает так же', () => {
    const d = world([card('a'), card('b')], { a: state(3), b: state(4) });
    expect(studyStatus(d, NOW, { cardIds: ['a', 'b'] }).kind).toBe('idle');
    expect(studyStatus(d, NOW, { cardIds: [] }).kind).toBe('empty');
  });
});

describe('nextDueText', () => {
  it('коротко', () => {
    expect(nextDueText(null)).toBe('');
    expect(nextDueText(3600_000)).toBe('завтра');
    expect(nextDueText(2 * DAY)).toBe('через 2 д');
    expect(nextDueText(21 * DAY)).toBe('через 3 нед');
  });
});

// ---------- Копировать / Вставить / Дублировать ----------
import { copyFolder, copySubject, copyTopic, pasteName } from './copy';
import { getData, pasteCopies, replaceData } from './store';

let uidN = 0;
const uid = () => 'u' + ++uidN;
const T0 = '2026-09-01T10:00:00.000Z';
const STAMP = '2026-10-11T10:00:00.000Z';
function copyWorld(): AppData {
  const d = emptyData();
  d.folders = [
    { id: 'f1', name: 'Естественные', color: '#0a0', order: 1, createdAt: T0 },
    { id: 'f2', name: 'Гуманитарные', color: '#a00', order: 2, createdAt: T0 }
  ];
  d.subjects = [
    { id: 's1', name: 'Биология', color: '#0a0', folderId: 'f1', order: 1, createdAt: T0 },
    { id: 's2', name: 'Физика', color: '#00a', folderId: 'f1', order: 2, createdAt: T0 },
    { id: 's3', name: 'История', color: '#aa0', order: 3, createdAt: T0 }
  ];
  d.topics = [
    { id: 't1', subjectId: 's1', name: 'Клетка', note: 'Конспект клетки', createdAt: T0, updatedAt: T0, lists: [{ id: 'L1', kind: 'vocab', title: 'Слова', cols: ['a', 'b', 'c'], mode: 'basic' }], poems: [{ id: 'P1', title: 'Стих', text: 'a\nb', chunk: 0, learned: 1, createdAt: T0, updatedAt: T0 }] },
    { id: 't1a', subjectId: 's1', parentId: 't1', name: 'Ядро', note: 'Ядро', createdAt: T0, updatedAt: T0 },
    { id: 't2', subjectId: 's2', name: 'Тепло', note: 'Тепло', createdAt: T0, updatedAt: T0 }
  ];
  d.cards = [
    { id: 'c1', topicId: 't1', type: 'basic', front: 'Q1', back: 'A1', createdAt: T0, updatedAt: T0 },
    { id: 'c2', topicId: 't1', listId: 'L1', type: 'basic', front: 'слово', back: 'перевод', createdAt: T0, updatedAt: T0 },
    { id: 'c3', topicId: 't1a', type: 'basic', front: 'Q3', back: 'A3', createdAt: T0, updatedAt: T0 }
  ];
  d.states[itemKey('c1', 0)] = { due: T0, stability: 4, difficulty: 5, elapsed_days: 1, scheduled_days: 3, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: T0 };
  return d;
}

describe('имя при вставке', () => {
  it('то же имя, если место свободно; «(2)» — только при конфликте', () => {
    expect(pasteName('Тема', ['Другая'])).toBe('Тема');
    expect(pasteName('Тема', ['Тема'])).toBe('Тема (2)');
    expect(pasteName('Тема', ['тема', 'Тема (2)'])).toBe('Тема (3)');
    expect(pasteName('Тема (2)', ['Тема', 'Тема (2)'])).toBe('Тема (3)');
  });
  it('тема: в другой предмет — без суффикса, в тот же — «(2)», «Дублировать» — «(копия)»', () => {
    const d = copyWorld();
    expect(copyTopic(d, 't1', uid, STAMP, { subjectId: 's2' }, 'paste')!.name).toBe('Клетка');
    expect(copyTopic(d, 't1', uid, STAMP, { subjectId: 's1' }, 'paste')!.name).toBe('Клетка (2)');
    expect(copyTopic(d, 't1', uid, STAMP)!.name).toBe('Клетка (копия)');
  });
  it('предмет: в другую папку — то же имя, в ту же — «(2)»; папка — «(2)», предметы внутри без суффикса', () => {
    const d = copyWorld();
    expect(copySubject(d, 's1', uid, STAMP, { folderId: 'f2' }, 'paste')!.name).toBe('Биология');
    expect(copySubject(d, 's1', uid, STAMP, { folderId: 'f1' }, 'paste')!.name).toBe('Биология (2)');
    expect(copySubject(d, 's1', uid, STAMP)!.name).toBe('Биология (копия)');
    const f = copyFolder(d, 'f1', uid, STAMP, 'paste')!;
    expect(f.name).toBe('Естественные (2)');
    expect(f.data.subjects.filter((s) => s.folderId === f.id).map((s) => s.name).sort()).toEqual(['Биология', 'Физика']);
  });
});

describe('«Вставить» (pasteCopies): куда и что приезжает', () => {
  it('тема на предмет — в корень этого предмета, со всем вложенным и без прогресса', () => {
    replaceData(copyWorld());
    const r = pasteCopies([{ kind: 'topic', id: 't1' }], { subjectId: 's2' });
    expect(r).toHaveLength(1);
    const d = getData();
    const copy = d.topics.find((t) => t.id === r[0].id)!;
    expect(copy.subjectId).toBe('s2');
    expect(copy.parentId).toBeUndefined();
    expect(copy.name).toBe('Клетка');
    expect(copy.note).toBe('Конспект клетки');
    expect(copy.lists).toHaveLength(1);
    expect(copy.poems![0].learned).toBe(0);
    const kid = d.topics.find((t) => t.parentId === copy.id)!;
    expect(kid.name).toBe('Ядро');
    expect(d.cards.filter((c) => c.topicId === copy.id || c.topicId === kid.id)).toHaveLength(3);
    expect(Object.keys(d.states)).toHaveLength(1); // прогресс остался только у оригинала
  });
  it('тема на тему — рядом с ней; повтор вставки в тот же предмет даёт «(2)»', () => {
    replaceData(copyWorld());
    pasteCopies([{ kind: 'topic', id: 't2' }], { subjectId: 's1', topicId: 't1a' });
    const d = getData();
    const copy = d.topics.find((t) => t.name === 'Тепло' && t.subjectId === 's1')!;
    expect(copy.parentId).toBe('t1'); // рядом с «Ядро» — в той же теме
    pasteCopies([{ kind: 'topic', id: 't2' }], { subjectId: 's1', topicId: 't1a' });
    expect(getData().topics.some((t) => t.name === 'Тепло (2)' && t.subjectId === 's1')).toBe(true);
  });
  it('тему некуда вставить без предмета — ничего не создаётся', () => {
    replaceData(copyWorld());
    const before = getData().topics.length;
    expect(pasteCopies([{ kind: 'topic', id: 't1' }], { root: true })).toHaveLength(0);
    expect(getData().topics).toHaveLength(before);
  });
  it('предмет: на папку — в эту папку; по свободному месту — вне папок; на другой предмет — в его папку', () => {
    replaceData(copyWorld());
    const a = pasteCopies([{ kind: 'subject', id: 's3' }], { folderId: 'f2' });
    expect(getData().subjects.find((s) => s.id === a[0].id)!.folderId).toBe('f2');
    expect(a[0].name).toBe('История');
    const b = pasteCopies([{ kind: 'subject', id: 's1' }], { root: true });
    expect(getData().subjects.find((s) => s.id === b[0].id)!.folderId).toBeUndefined();
    expect(b[0].name).toBe('Биология');
    const c = pasteCopies([{ kind: 'subject', id: 's3' }], { subjectId: 's2' });
    expect(getData().subjects.find((s) => s.id === c[0].id)!.folderId).toBe('f1');
  });
  it('папка вставляется на верхний уровень вместе с предметами, темами и карточками', () => {
    replaceData(copyWorld());
    const r = pasteCopies([{ kind: 'folder', id: 'f1' }], { folderId: 'f2' });
    const d = getData();
    expect(r[0].name).toBe('Естественные (2)');
    expect(d.subjects.filter((s) => s.folderId === r[0].id)).toHaveLength(2);
    expect(d.topics).toHaveLength(6);
    expect(d.cards).toHaveLength(6);
    expect(d.settings.treeOpen).toContain(r[0].id);
  });
});

// ---------- Домашка: удалить любую, сделанные исчезают на следующий день ----------
import { splitDoneHomework } from './homework';
import { deleteHomeworkMany, pruneDoneHomework, restoreHomework, toggleHomework, addHomework } from './store';
import type { Homework } from './types';

const hw = (id: string, extra: Partial<Homework> = {}): Homework => ({ id, text: 'ДЗ ' + id, createdAt: T0, updatedAt: T0, ...extra });

describe('сделанная домашка', () => {
  const NOW11 = new Date('2026-10-11T15:00:00');
  it('сегодняшнее остаётся в «Сделано», вчерашнее и без даты отметки — уходит', () => {
    const list = [hw('a', { done: true, doneAt: new Date('2026-10-11T09:00:00').toISOString() }), hw('b', { done: true, doneAt: new Date('2026-10-10T20:00:00').toISOString() }), hw('c', { done: true }), hw('d')];
    const { keep, old } = splitDoneHomework(list, NOW11, 4);
    expect(keep.map((h) => h.id)).toEqual(['a', 'd']);
    expect(old.map((h) => h.id)).toEqual(['b', 'c']);
  });
  it('ночью до начала учебного дня «сегодня» — ещё вчерашний день', () => {
    const list = [hw('a', { done: true, doneAt: new Date('2026-10-10T22:00:00').toISOString() })];
    expect(splitDoneHomework(list, new Date('2026-10-11T02:00:00'), 4).old).toHaveLength(0);
    expect(splitDoneHomework(list, new Date('2026-10-11T05:00:00'), 4).old).toHaveLength(1);
  });
  it('удаление любой домашки и «Вернуть»; невыполненная не трогается при очистке', () => {
    const d = emptyData();
    d.homework = [hw('a'), hw('b', { done: true, doneAt: T0 }), hw('c')];
    replaceData(d);
    const undo = deleteHomeworkMany(['a', 'b']);
    expect(getData().homework.map((h) => h.id)).toEqual(['c']);
    expect(getData().deleted?.['hw:a']).toBeTruthy();
    undo();
    expect(getData().homework.map((h) => h.id).sort()).toEqual(['a', 'b', 'c']);
    expect(getData().deleted?.['hw:a']).toBeUndefined();
    restoreHomework([hw('a')]); // повторный возврат ничего не дублирует
    expect(getData().homework).toHaveLength(3);
  });
  it('pruneDoneHomework убирает только сделанное в прошлые дни', () => {
    const d = emptyData();
    d.homework = [hw('old', { done: true, doneAt: '2026-10-01T10:00:00.000Z' }), hw('open'), hw('fresh')];
    replaceData(d);
    toggleHomework('fresh'); // отмечено «сейчас» — остаётся до конца дня
    expect(pruneDoneHomework()).toBe(1);
    expect(getData().homework.map((h) => h.id).sort()).toEqual(['fresh', 'open']);
    const x = addHomework({ text: 'новое' });
    expect(getData().homework.some((h) => h.id === x.id)).toBe(true);
  });
});
