// Этап 3 (2.0): слабые места, контрольная из нескольких тем, готовность и охват, план по дням, режим «заранее», слияние и совместимость данных.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dayPlan, daysLeftTo, readiness, topicCoverage } from './exams';
import { examsOf } from './examList';
import { buildQueue, DAY, examPlan, examPlanOf, itemKey } from './srs';
import { deleteExam, emptyData, getData, normalizeData, replaceData, saveExam, tagLastAnswer } from './store';
import { mergeData } from './sync';
import type { AppData, Card, Exam, ItemState, ReviewLogEntry, Topic } from './types';
import { weakCards, weakItems, WEAK_FROM } from './weakness';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T10:00:00'));
  const orig = console.error.bind(console);
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    if (!String(a[0]).startsWith('Не удалось сохранить')) orig(...a);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NOW = new Date('2026-10-05T10:00:00');
const T0 = '2026-09-01T10:00:00.000Z';
const iso = (d: Date) => d.toISOString();
const ago = (days: number) => iso(new Date(NOW.getTime() - days * DAY));

const topic = (id: string, extra: Partial<Topic> = {}): Topic => ({ id, subjectId: 's1', name: 'Тема ' + id, note: '', createdAt: T0, updatedAt: T0, ...extra });
const card = (id: string, topicId: string, front = 'Вопрос ' + id, back = 'Ответ ' + id): Card => ({ id, topicId, type: 'basic', front, back, createdAt: T0, updatedAt: T0 });
const st = (o: Partial<ItemState> = {}): ItemState => ({ due: ago(-3), stability: 10, difficulty: 5, elapsed_days: 1, scheduled_days: 5, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: ago(1), ...o });
const log = (cardId: string, o: Partial<ReviewLogEntry> = {}): ReviewLogEntry => ({ key: itemKey(cardId, 0), cardId, topicId: 't1', rating: 3, prevState: 2, at: ago(1), ms: 4000, ...o });

function base(): AppData {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'Биология', color: '#0a0', createdAt: T0 }];
  d.topics = [topic('t1'), topic('t2')];
  return d;
}

describe('слабые места', () => {
  it('ещё не начатое не считается слабым — оно просто не выучено', () => {
    const d = base();
    d.cards = [card('a', 't1')];
    expect(weakItems(d, NOW)).toEqual([]);
  });

  it('вот-вот забудется, забывал не раз, трудное — выше, чем надёжное', () => {
    const d = base();
    d.cards = [card('strong', 't1'), card('shaky', 't1')];
    d.states[itemKey('strong', 0)] = st({ stability: 40, difficulty: 4, last_review: ago(1) });
    d.states[itemKey('shaky', 0)] = st({ stability: 1.5, difficulty: 8.5, lapses: 3, last_review: ago(12), state: 2 });
    const w = weakItems(d, NOW);
    expect(w.map((x) => x.cardId)).toEqual(['shaky', 'strong']);
    expect(w[0].score).toBeGreaterThan(WEAK_FROM);
    expect(w[1].score).toBeLessThan(WEAK_FROM);
    expect(w[0].reasons).toEqual(expect.arrayContaining(['forget', 'lapses', 'young', 'hard']));
    expect(w[1].reasons).toEqual([]);
  });

  it('на день контрольной забывается больше, чем сейчас', () => {
    const d = base();
    d.cards = [card('a', 't1')];
    d.states[itemKey('a', 0)] = st({ stability: 6, last_review: ago(1) });
    const now = weakItems(d, NOW)[0];
    const exam = weakItems(d, NOW, { at: new Date(NOW.getTime() + 10 * DAY) })[0];
    expect(exam.recall).toBeLessThan(now.recall);
    expect(exam.score).toBeGreaterThan(now.score);
  });

  it('недавняя ошибка и своя пометка добавляют слабости', () => {
    const d = base();
    d.cards = [card('a', 't1'), card('b', 't1')];
    for (const id of ['a', 'b']) d.states[itemKey(id, 0)] = st({ stability: 20 });
    const clean = weakItems(d, NOW).find((x) => x.cardId === 'a')!;
    d.logs = [log('a', { rating: 1, at: ago(0.5), err: 'mixed', mix: itemKey('b', 0) })];
    const after = weakItems(d, NOW).find((x) => x.cardId === 'a')!;
    expect(after.score).toBeGreaterThan(clean.score);
    expect(after.reasons).toEqual(expect.arrayContaining(['miss', 'tag']));
    expect(weakItems(d, NOW).find((x) => x.cardId === 'b')!.score).toBe(clean.score); // соседняя карточка не затронута
  });

  it('weakCards: одна запись на карточку, только слабее порога, самые слабые первыми, с пределом', () => {
    const d = base();
    d.cards = [card('a', 't1'), card('b', 't1'), card('c', 't1')];
    d.states[itemKey('a', 0)] = st({ stability: 1, lapses: 4, difficulty: 9, last_review: ago(20) });
    d.states[itemKey('b', 0)] = st({ stability: 2, lapses: 2, difficulty: 7, last_review: ago(9) });
    d.states[itemKey('c', 0)] = st({ stability: 60, last_review: ago(1) });
    const list = weakCards(d, NOW);
    expect(list.map((x) => x.cardId)).toEqual(['a', 'b']);
    expect(weakCards(d, NOW, { limit: 1 }).map((x) => x.cardId)).toEqual(['a']);
    expect(weakCards(d, NOW, { cardIds: ['b'] }).map((x) => x.cardId)).toEqual(['b']);
  });
});

describe('контрольные: список и совместимость со старой датой темы', () => {
  it('старая дата у темы читается как контрольная без записи', () => {
    const d = base();
    d.topics[0] = topic('t1', { examDate: '2026-10-12' });
    const list = examsOf(d);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'topic:t1', virtual: true, topicIds: ['t1'], date: '2026-10-12', name: 'Тема t1' });
  });

  it('тема из записанной контрольной (и её подтема) отдельной строкой не повторяется; по порядку дат', () => {
    const d = base();
    d.topics = [topic('t1', { examDate: '2026-10-20' }), topic('t2'), topic('t3', { parentId: 't2', examDate: '2026-10-09' }), topic('t4', { examDate: '2026-10-08', kind: 'rule' })];
    d.exams = [{ id: 'e1', subjectId: 's1', name: 'Четверть', date: '2026-10-15', topicIds: ['t1', 't2', 'нет'], createdAt: T0, updatedAt: T0 }];
    const list = examsOf(d);
    expect(list.map((e) => e.id)).toEqual(['e1']); // t1 и t3 внутри e1, t4 — правило
    expect(list[0].topicIds).toEqual(['t1', 't2']); // лишняя тема отброшена
  });

  it('контрольная без существующих тем или предмета не показывается', () => {
    const d = base();
    d.exams = [
      { id: 'e1', subjectId: 's1', name: 'А', date: '2026-10-15', topicIds: ['нет'], createdAt: T0, updatedAt: T0 },
      { id: 'e2', subjectId: 'нет', name: 'Б', date: '2026-10-15', topicIds: ['t1'], createdAt: T0, updatedAt: T0 }
    ];
    expect(examsOf(d)).toEqual([]);
  });

  it('сколько дней осталось (начало дня — 4 утра)', () => {
    expect(daysLeftTo({ date: '2026-10-11' }, NOW, 4)).toBe(6);
    expect(daysLeftTo({ date: '2026-10-05' }, NOW, 4)).toBe(0);
    expect(daysLeftTo({ date: '2026-10-04' }, NOW, 4)).toBe(-1);
  });
});

describe('контрольные: создать, изменить, удалить, вернуть', () => {
  it('saveExam записывает контрольную и снимает дату с тем — она больше не считается дважды', () => {
    const d = base();
    d.topics[0] = topic('t1', { examDate: '2026-10-12' });
    replaceData(d);
    const e = saveExam({ subjectId: 's1', name: 'Контрольная по клетке', date: '2026-10-12', topicIds: ['t1', 't2'] });
    const now = getData();
    expect(now.exams).toHaveLength(1);
    expect(now.topics.find((t) => t.id === 't1')!.examDate).toBeUndefined();
    expect(examsOf(now).map((x) => [x.id, x.virtual, x.topicIds])).toEqual([[e.id, false, ['t1', 't2']]]);
  });

  it('контрольная из старой даты становится записанной при первом изменении', () => {
    const d = base();
    d.topics[0] = topic('t1', { examDate: '2026-10-12' });
    replaceData(d);
    const e = saveExam({ id: 'topic:t1', subjectId: 's1', name: 'Новое имя', date: '2026-10-13', topicIds: ['t1', 't2'] });
    const now = getData();
    expect(e.id).not.toBe('topic:t1');
    expect(examsOf(now)).toHaveLength(1);
    expect(examsOf(now)[0]).toMatchObject({ name: 'Новое имя', date: '2026-10-13', virtual: false });
  });

  it('изменение записанной контрольной не создаёт вторую', () => {
    replaceData(base());
    const e = saveExam({ subjectId: 's1', name: 'А', date: '2026-10-12', topicIds: ['t1'] });
    saveExam({ id: e.id, subjectId: 's1', name: 'Б', date: '2026-10-14', topicIds: ['t1', 't2'] });
    const list = getData().exams!;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: e.id, name: 'Б', date: '2026-10-14', topicIds: ['t1', 't2'] });
  });

  it('удалить записанную — и «Вернуть»; удалить старую дату темы — и «Вернуть»', () => {
    const d = base();
    d.topics[1] = topic('t2', { examDate: '2026-10-12' });
    replaceData(d);
    const e = saveExam({ subjectId: 's1', name: 'А', date: '2026-10-12', topicIds: ['t1'] });
    const undo = deleteExam(e.id);
    expect(examsOf(getData()).map((x) => x.id)).toEqual(['topic:t2']);
    expect(getData().deleted?.['exam:' + e.id]).toBeTruthy();
    undo();
    expect(examsOf(getData()).map((x) => x.id).sort()).toEqual([e.id, 'topic:t2'].sort());
    expect(getData().deleted?.['exam:' + e.id]).toBeUndefined();
    const undo2 = deleteExam('topic:t2');
    expect(examsOf(getData()).map((x) => x.id)).toEqual([e.id]);
    undo2();
    expect(getData().topics.find((t) => t.id === 't2')!.examDate).toBe('2026-10-12');
  });
});

describe('готовность к контрольной', () => {
  const exam = (topicIds: string[], date = '2026-10-11'): Exam & { virtual: boolean } => ({ id: 'e1', subjectId: 's1', name: 'К', date, topicIds, createdAt: T0, updatedAt: T0, virtual: false });

  it('не начатое считается нулём: готовность — прогноз по ВСЕМ карточкам, а не по начатым', () => {
    const d = base();
    d.cards = [card('a', 't1'), card('b', 't1'), card('c', 't2'), card('d', 't2')];
    d.states[itemKey('a', 0)] = st({ stability: 200, last_review: ago(0.1) });
    d.states[itemKey('b', 0)] = st({ stability: 200, last_review: ago(0.1) });
    const r = readiness(d, exam(['t1', 't2']), NOW);
    expect(r.items).toBe(4);
    expect(r.started).toBe(2);
    expect(r.recallOnDate).toBeGreaterThan(0.45);
    expect(r.recallOnDate).toBeLessThan(0.5);
    expect(r.cardIds.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(r.perTopic.map((t) => [t.topicId, t.items, t.started])).toEqual([['t1', 2, 2], ['t2', 2, 0]]);
    expect(r.perTopic[0].recall).toBeGreaterThan(0.95);
    expect(r.perTopic[1].recall).toBe(0);
    expect(r.daysLeft).toBe(6);
  });

  it('слабые места берутся на день контрольной; пустая контрольная не падает', () => {
    const d = base();
    d.cards = [card('a', 't1')];
    d.states[itemKey('a', 0)] = st({ stability: 3, last_review: ago(2), lapses: 2, difficulty: 8 });
    const r = readiness(d, exam(['t1']), NOW);
    expect(r.weak.map((w) => w.cardId)).toEqual(['a']);
    const empty = readiness(base(), exam(['t1']), NOW);
    expect(empty).toMatchObject({ items: 0, started: 0, recallOnDate: 0, coverage: null });
  });

  it('охват: важное место конспекта считается закрытым, если оно есть в карточке (в любой форме слова)', () => {
    const d = base();
    d.topics[0] = topic('t1', { note: '**Фотосинтез** — образование органических веществ на свету.\n\n**Хлорофилл** — зелёный пигмент листьев.' });
    d.cards = [card('a', 't1', 'Что такое фотосинтеза?', 'Образование веществ на свету')];
    const cov = topicCoverage(d, 't1')!;
    expect(cov.places).toBeGreaterThanOrEqual(2);
    expect(cov.covered).toBeGreaterThanOrEqual(1);
    expect(cov.covered).toBeLessThan(cov.places);
    d.cards.push(card('b', 't1', 'Что такое хлорофилл?', 'Зелёный пигмент'));
    expect(topicCoverage(d, 't1')!.covered).toBe(topicCoverage(d, 't1')!.places);
  });

  it('охват: в конспекте нечего считать — null, а не 0 из 0', () => {
    const d = base();
    d.cards = [card('a', 't1')];
    expect(topicCoverage(d, 't1')).toBeNull();
    expect(topicCoverage(d, 'нет')).toBeNull();
  });
});

describe('план по дням', () => {
  const ex = (date: string, topicIds = ['t1']): Exam & { virtual: boolean } => ({ id: 'e1', subjectId: 's1', name: 'К', date, topicIds, createdAt: T0, updatedAt: T0, virtual: false });

  it('новое — поровну и до последних двух дней, потом — последний проход по слабому', () => {
    const d = base();
    d.cards = Array.from({ length: 12 }, (_, i) => card('n' + i, 't1')).concat([card('w', 't1')]);
    d.states[itemKey('w', 0)] = st({ stability: 1, lapses: 4, difficulty: 9, last_review: ago(20) });
    const plan = dayPlan(d, ex('2026-10-11'), NOW); // 6 дней
    expect(plan).toHaveLength(6);
    expect(plan.map((p) => p.kind)).toEqual(['new', 'new', 'new', 'new', 'weak', 'weak']);
    expect(plan.filter((p) => p.kind === 'new').reduce((a, p) => a + p.n, 0)).toBe(12);
    expect(plan[0].date).toBe('2026-10-05');
    expect(plan[5].date).toBe('2026-10-10'); // накануне контрольной
  });

  it('до контрольной мало дней: всё новое — каждый день; сегодня или в прошлом — плана нет', () => {
    const d = base();
    d.cards = [card('a', 't1'), card('b', 't1')];
    expect(dayPlan(d, ex('2026-10-07'), NOW).map((p) => p.kind)).toEqual(['new', 'new']);
    expect(dayPlan(d, ex('2026-10-05'), NOW)).toEqual([]);
    expect(dayPlan(d, ex('2026-10-01'), NOW)).toEqual([]);
  });

  it('нечего учить и нечего слабого — дни отдыха', () => {
    const d = base();
    d.cards = [card('a', 't1')];
    d.states[itemKey('a', 0)] = st({ stability: 300, last_review: ago(0.1) });
    expect(dayPlan(d, ex('2026-10-11'), NOW).every((p) => p.kind === 'rest')).toBe(true);
  });
});

describe('очередь «заранее» и план новых карточек для нескольких тем', () => {
  it('ahead: только начатые, в порядке, как передали (слабые первыми), срок не важен', () => {
    const d = base();
    d.cards = [card('a', 't1'), card('b', 't1'), card('c', 't1')];
    d.states[itemKey('a', 0)] = st({ due: ago(-9) }); // ждать ещё 9 дней
    d.states[itemKey('b', 0)] = st({ due: ago(-5) });
    const q = buildQueue(d, NOW, { cardIds: ['b', 'c', 'a'], ahead: true });
    expect(q.map((x) => x.cardId)).toEqual(['b', 'a']); // c не начата, a и b не просрочены — и всё равно в очереди
    expect(buildQueue(d, NOW, { cardIds: ['b', 'c', 'a'] }).map((x) => x.cardId)).not.toEqual(['b', 'a']); // обычная очередь устроена иначе
  });

  it('контрольная из двух тем: план считает карточки обеих; старая дата у одной темы работает как раньше', () => {
    const d = base();
    d.cards = [card('a', 't1'), card('b', 't2'), card('c', 't2')];
    d.exams = [{ id: 'e1', subjectId: 's1', name: 'К', date: '2026-10-09', topicIds: ['t1', 't2'], createdAt: T0, updatedAt: T0 }];
    const p = examPlanOf(d, NOW, 'e1')!;
    expect(p).toMatchObject({ examId: 'e1', total: 3, daysLeft: 4 });
    expect(examPlan(d, NOW, 't2')!.examId).toBe('e1'); // по любой теме контрольной
    const old = base();
    old.topics[0] = topic('t1', { examDate: '2026-10-09' });
    old.cards = [card('a', 't1'), card('b', 't1')];
    expect(examPlan(old, NOW, 't1')).toMatchObject({ examId: 'topic:t1', total: 2, daysLeft: 4 });
  });
});

describe('синхронизация и старые данные', () => {
  const e1: Exam = { id: 'e1', subjectId: 's1', name: 'К', date: '2026-10-12', topicIds: ['t1', 't2'], createdAt: T0, updatedAt: '2026-10-01T10:00:00.000Z' };

  it('контрольная с другого устройства добавляется; более новая правка побеждает', () => {
    const a = base();
    const b = base();
    b.exams = [e1];
    expect(mergeData(a, b).data.exams).toHaveLength(1);
    a.exams = [{ ...e1, name: 'Старое', updatedAt: '2026-09-20T10:00:00.000Z' }];
    expect(mergeData(a, b).data.exams![0].name).toBe('К');
  });

  it('удалённая контрольная не воскресает со старой копии', () => {
    const a = base();
    a.deleted = { 'exam:e1': '2026-10-03T10:00:00.000Z' };
    const b = base();
    b.exams = [e1];
    expect(mergeData(a, b).data.exams).toEqual([]);
  });

  it('удалённая тема убирается из контрольной, контрольная без тем исчезает', () => {
    const a = base();
    a.topics = [topic('t1')];
    a.deleted = { 'topic:t2': '2026-10-03T10:00:00.000Z' }; // тему t2 удалили здесь, а с другого устройства она ещё приходит
    const b = base();
    b.exams = [e1, { ...e1, id: 'e2', topicIds: ['t2'] }];
    const m = mergeData(a, b).data;
    expect(m.exams!.map((e) => [e.id, e.topicIds])).toEqual([['e1', ['t1']]]);
  });

  it('старый файл без контрольных открывается; мусор в списке отбрасывается', () => {
    const d = normalizeData({ version: 1, subjects: [], topics: [], cards: [], settings: {} });
    expect(d.exams).toEqual([]);
    const dirty = normalizeData({ version: 1, subjects: [], topics: [], cards: [], settings: {}, exams: [e1, null, { id: 5 }, { id: 'x', date: 'д', topicIds: 'нет' }, 'ой'] });
    expect(dirty.exams!.map((e) => e.id)).toEqual(['e1']);
  });

  it('пометка ошибки: ставится на последний ответ по элементу, снимается, не трогает остальное', () => {
    const d = base();
    d.cards = [card('a', 't1'), card('b', 't1')];
    d.logs = [log('a', { at: ago(3) }), log('a', { at: ago(1) }), log('b', { at: ago(1) })];
    replaceData(d);
    tagLastAnswer(itemKey('a', 0), 'mixed', itemKey('b', 0));
    let logs = getData().logs;
    expect(logs[0].err).toBeUndefined();
    expect(logs[1]).toMatchObject({ err: 'mixed', mix: itemKey('b', 0) });
    expect(logs[2].err).toBeUndefined();
    tagLastAnswer(itemKey('a', 0), null);
    logs = getData().logs;
    expect('err' in logs[1]).toBe(false);
    expect('mix' in logs[1]).toBe(false);
    tagLastAnswer('нет:0', 'forgot'); // нет такого элемента — ничего не ломается
    expect(getData().logs).toHaveLength(3);
  });
});
