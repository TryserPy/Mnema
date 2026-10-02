// История версий конспекта: страховка от потери текста; только на этом устройстве.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyData, exportJson, forSync, getData, normalizeData, replaceData, restoreNoteVersion, updateTopic, deleteTopic, restoreFromTrash } from './store';
import { mergeData } from './sync';
import type { AppData, Topic } from './types';

const T0 = '2026-09-01T10:00:00.000Z';
const base = (note = 'Первая версия конспекта.'): AppData => {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'Биология', color: '#0a0', createdAt: T0 }];
  d.topics = [{ id: 't1', subjectId: 's1', name: 'Клетка', note, createdAt: T0, updatedAt: T0 } as Topic];
  return d;
};
const at = (min: number) => new Date(new Date('2026-10-05T10:00:00').getTime() + min * 60_000);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(0));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('когда делается снимок', () => {
  it('первая правка запоминает прежний текст', () => {
    replaceData(base());
    updateTopic('t1', { note: 'Первая версия конспекта. Дописал.' });
    expect(getData().noteHistory!.t1.map((v) => v.note)).toEqual(['Первая версия конспекта.']);
  });

  it('правки подряд (как при наборе текста) не плодят версии: следующий снимок — через 10+ минут', () => {
    replaceData(base());
    let text = 'Первая версия конспекта.';
    for (let i = 0; i < 30; i++) {
      vi.setSystemTime(at(i * 0.1)); // 6 секунд между сохранениями, 3 минуты всего
      text += ' слово';
      updateTopic('t1', { note: text });
    }
    expect(getData().noteHistory!.t1).toHaveLength(1);
    vi.setSystemTime(at(15));
    updateTopic('t1', { note: text + ' ещё' });
    expect(getData().noteHistory!.t1).toHaveLength(2);
    expect(getData().noteHistory!.t1[0].note).toBe(text); // свежая версия первой
  });

  it('резкое сокращение текста (случайно стёрли) — снимок сразу', () => {
    replaceData(base('А'.repeat(400)));
    updateTopic('t1', { note: 'А'.repeat(400) + ' дописка' });
    vi.setSystemTime(at(1)); // всего минута
    updateTopic('t1', { note: 'А' });
    expect(getData().noteHistory!.t1).toHaveLength(2);
    expect(getData().noteHistory!.t1[0].note).toBe('А'.repeat(400) + ' дописка');
  });

  it('не-текстовые правки темы и тот же текст ничего не снимают', () => {
    replaceData(base());
    updateTopic('t1', { important: true });
    updateTopic('t1', { note: 'Первая версия конспекта.' });
    expect(getData().noteHistory).toBeUndefined();
  });

  it('пустой прежний текст не запоминается; не больше 15 версий и 60 дней', () => {
    replaceData(base(''));
    updateTopic('t1', { note: 'Текст' });
    expect(getData().noteHistory).toBeUndefined();
    for (let i = 0; i < 25; i++) {
      vi.setSystemTime(at(100 + i * 20));
      updateTopic('t1', { note: 'Текст ' + i });
    }
    expect(getData().noteHistory!.t1.length).toBeLessThanOrEqual(15);
    vi.setSystemTime(at(100 + 24 * 20 + 70 * 24 * 60)); // через 70 дней
    updateTopic('t1', { note: 'Новое' });
    expect(getData().noteHistory!.t1).toHaveLength(1);
  });
});

describe('возврат версии', () => {
  it('возвращает текст, а текущий сам становится версией — шаг обратим', () => {
    replaceData(base('Версия А'));
    updateTopic('t1', { note: 'Версия Б' });
    const a = getData().noteHistory!.t1[0];
    vi.setSystemTime(at(1));
    expect(restoreNoteVersion('t1', a.at)).toBe(true);
    expect(getData().topics[0].note).toBe('Версия А');
    expect(getData().noteHistory!.t1[0].note).toBe('Версия Б');
    // и обратно
    expect(restoreNoteVersion('t1', getData().noteHistory!.t1[0].at)).toBe(true);
    expect(getData().topics[0].note).toBe('Версия Б');
  });

  it('отмечает правку текста (noteAt) — синхронизация не потеряет возврат; неизвестная версия — false', () => {
    replaceData(base('Версия А'));
    updateTopic('t1', { note: 'Версия Б' });
    vi.setSystemTime(at(2));
    const before = getData().topics[0].noteAt;
    restoreNoteVersion('t1', getData().noteHistory!.t1[0].at);
    expect(getData().topics[0].noteAt).not.toBe(before);
    expect(restoreNoteVersion('t1', 'нет такой')).toBe(false);
    expect(restoreNoteVersion('нет темы', 'x')).toBe(false);
  });
});

describe('только на этом устройстве', () => {
  it('forSync и копия — без истории', () => {
    replaceData(base('Версия А'));
    updateTopic('t1', { note: 'Версия Б' });
    expect(forSync(getData()).noteHistory).toBeUndefined();
    expect(JSON.parse(exportJson()).noteHistory).toBeUndefined();
    expect(getData().noteHistory).toBeDefined();
  });

  it('слияние сохраняет свою историю и не берёт чужую', () => {
    replaceData(base('Версия А'));
    updateTopic('t1', { note: 'Версия Б' });
    const local = getData();
    const remote = JSON.parse(JSON.stringify(base('Версия А'))) as AppData;
    remote.noteHistory = { t1: [{ at: T0, note: 'ЧУЖАЯ' }] };
    expect(mergeData(local, normalizeData(remote)).data.noteHistory).toEqual(local.noteHistory);
  });

  it('normalizeData: мусор и история удалённых тем выбрасываются; тема из корзины сохраняет историю', () => {
    const d = base('Версия А');
    d.noteHistory = { t1: [{ at: T0, note: 'ок' }, { at: 5, note: 1 } as never], gone: [{ at: T0, note: 'сирота' }], t2: 'не список' as never };
    const n = normalizeData(JSON.parse(JSON.stringify(d)));
    expect(n.noteHistory).toEqual({ t1: [{ at: T0, note: 'ок' }] });
    // удалили тему: история остаётся (тема в корзине), вернули — история на месте
    replaceData(base('Версия А'));
    updateTopic('t1', { note: 'Версия Б' });
    deleteTopic('t1');
    const saved = normalizeData(JSON.parse(JSON.stringify(getData())));
    expect(saved.noteHistory!.t1).toHaveLength(1);
    replaceData(saved);
    restoreFromTrash(getData().trash![0].id);
    expect(getData().noteHistory!.t1[0].note).toBe('Версия А');
  });
});
