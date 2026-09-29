import { describe, expect, it } from 'vitest';
import { emptyData } from './store';
import { mergeData } from './sync';
import type { AppData, Card, Subject, Topic } from './types';

const T0 = '2026-09-01T10:00:00.000Z';
const T1 = '2026-09-02T10:00:00.000Z';
const T2 = '2026-09-03T10:00:00.000Z';
const subj = (id: string, name: string, at = T0): Subject => ({ id, name, color: '#000', createdAt: T0, updatedAt: at });
const topic = (id: string, subjectId: string, note: string, at = T0): Topic => ({ id, subjectId, name: id, note, createdAt: T0, updatedAt: at });
const card = (id: string, topicId: string, front: string, at = T0): Card => ({ id, topicId, type: 'basic', front, back: 'a', createdAt: T0, updatedAt: at });
function base(): AppData {
  const d = emptyData();
  d.subjects = [subj('s1', 'Физика')];
  d.topics = [topic('t1', 's1', 'старый конспект')];
  d.cards = [card('c1', 't1', 'Q1')];
  return d;
}

describe('Слияние данных', () => {
  it('объединяет новое с обеих сторон и берёт более свежую правку', () => {
    const pc = base();
    const phone = base();
    pc.topics[0] = topic('t1', 's1', 'правка на компьютере', T1);
    phone.topics[0] = topic('t1', 's1', 'правка на телефоне', T2);
    phone.cards.push(card('c2', 't1', 'Q2'));
    pc.subjects.push(subj('s2', 'История'));
    const { data, report } = mergeData(pc, phone);
    expect(data.topics.find((x) => x.id === 't1')!.note).toBe('правка на телефоне');
    expect(data.cards.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(data.subjects.map((s) => s.name).sort()).toEqual(['История', 'Физика']);
    expect(report.added.cards).toBe(1);
    // И в обратную сторону — тот же результат.
    const back = mergeData(phone, pc).data;
    expect(back.topics.find((x) => x.id === 't1')!.note).toBe('правка на телефоне');
    expect(back.subjects.length).toBe(2);
  });
  it('удалённое не воскресает, но новая правка после удаления сохраняется', () => {
    const pc = base();
    const phone = base();
    phone.cards = [];
    phone.deleted = { 'card:c1': T1 };
    expect(mergeData(pc, phone).data.cards.length).toBe(0);
    pc.cards[0] = card('c1', 't1', 'исправлено позже', T2);
    expect(mergeData(pc, phone).data.cards.length).toBe(1);
  });
  it('прогресс: берётся последнее повторение, история объединяется', () => {
    const pc = base();
    const phone = base();
    const st = (reps: number, at: string) => ({ due: at, stability: reps, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps, lapses: 0, state: 2, last_review: at });
    pc.states['c1:0'] = st(2, T1);
    phone.states['c1:0'] = st(3, T2);
    pc.logs = [{ key: 'c1:0', cardId: 'c1', topicId: 't1', rating: 3, prevState: 0, at: T0, ms: 1 }];
    phone.logs = [
      { key: 'c1:0', cardId: 'c1', topicId: 't1', rating: 3, prevState: 0, at: T0, ms: 1 },
      { key: 'c1:0', cardId: 'c1', topicId: 't1', rating: 4, prevState: 2, at: T2, ms: 1 }
    ];
    const { data } = mergeData(pc, phone);
    expect(data.states['c1:0'].reps).toBe(3);
    expect(data.logs.length).toBe(2);
  });
  it('удаление предмета убирает его темы и карточки', () => {
    const pc = base();
    const phone = base();
    phone.subjects = [];
    phone.topics = [];
    phone.cards = [];
    phone.deleted = { 'subj:s1': T1, 'topic:t1': T1, 'card:c1': T1 };
    const { data } = mergeData(pc, phone);
    expect([data.subjects.length, data.topics.length, data.cards.length]).toEqual([0, 0, 0]);
  });
});

import { buildObsidianExport } from './obsidianExport';
import { decryptText, encryptText } from './cloud';

describe('Экспорт в Obsidian и шифрование облака', () => {
  it('папки, подтемы, картинки и карточки', () => {
    const d = base();
    d.topics[0] = { ...d.topics[0], name: 'Закон Ома', note: 'Текст [стр. 12]\n\n![Рис](data:image/png;base64,iVBORw0KGgo=)', important: true };
    d.topics.push({ id: 't2', subjectId: 's1', parentId: 't1', name: 'Сопротивление', note: 'R', createdAt: T0, updatedAt: T0 });
    d.cards.push({ id: 'c3', topicId: 't1', type: 'cloze', front: 'Ток {{c1::I}} в амперах', back: '', createdAt: T0, updatedAt: T0 });
    const files = buildObsidianExport(d);
    const note = files.find((f) => f.path === 'Физика/Закон Ома.md')!;
    expect(note.content).toContain('(стр. 12)');
    expect(note.content).toContain('![Рис](../_%D0%92%D0%BB%D0%BE%D0%B6%D0%B5%D0%BD%D0%B8%D1%8F/%D0%BC%D0%BD%D0%B5%D0%BC%D0%B0-1.png)');
    expect(note.content).toContain('Q1::a');
    expect(note.content).toContain('Ток ==I== в амперах');
    expect(note.content).toContain('[[Сопротивление]]');
    expect(note.content).toContain('важное');
    expect(files.some((f) => f.path === 'Физика/Закон Ома/Сопротивление.md')).toBe(true);
    expect(files.find((f) => f.path.startsWith('_Вложения/'))!.base64).toBe(true);
  });
  it('шифрование паролем туда и обратно', async () => {
    const e = await encryptText('{"a":1}', 'секрет');
    expect(e).not.toContain('"a"');
    expect(await decryptText(e, 'секрет')).toBe('{"a":1}');
    await expect(decryptText(e, 'не тот')).rejects.toThrow('не подходит');
  });
});
