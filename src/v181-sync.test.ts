// Тесты этапа 0 (2.0): правки конспекта не теряются при синхронизации.
// Topic.noteAt/noteFrom/noteBy, слияние темы по полям, копия темы при независимых правках текста, защита от «фантомных» правок.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseChangeFile, planChanges, revertChanges } from './changes';
import { importTopics, deleteTopic, emptyData, getData, normalizeData, replaceData, updateTopic } from './store';
import { sameLook } from './notePhantom';
import { canonNote, noteEdit, noteHash, sameNote } from './noteText';
import { CONFLICT_SUFFIX, independentNotes, mergeData, reportText } from './sync';
import type { AppData, Topic } from './types';

const T0 = '2026-09-01T10:00:00.000Z';
const day = (n: number, h = 10) => `2026-09-${String(n).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`;

/** В тестах без окна сохранение на диск невозможно и пишет в консоль «Не удалось сохранить» — это не ошибка теста. */
beforeEach(() => {
  vi.useFakeTimers();
  const orig = console.error.bind(console);
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    if (!String(a[0]).startsWith('Не удалось сохранить')) orig(...a);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const BASE_NOTE = '## Закон Ома\n\nI = U / R\n\nТок зависит от напряжения.';

function base(topic: Partial<Topic> = {}): AppData {
  const d = emptyData();
  d.subjects = [{ id: 's1', name: 'Физика', color: '#000', createdAt: T0 }];
  d.topics = [{ id: 't1', subjectId: 's1', name: 'Закон Ома', note: BASE_NOTE, createdAt: T0, updatedAt: T0, ...topic }];
  return d;
}

/** «Устройство»: берёт данные, в заданный момент делает правку настоящими функциями хранилища и отдаёт результат. */
function device(from: AppData, id: string, at: string, act: () => void): AppData {
  vi.setSystemTime(new Date(at));
  replaceData({ ...from, deviceId: id });
  act();
  return getData();
}
const top = (d: AppData, id = 't1') => d.topics.find((t) => t.id === id)!;
const copies = (d: AppData) => d.topics.filter((t) => t.id.startsWith('conflict-'));

describe('2.0, этап 0: noteAt ставится только при настоящей правке текста', () => {
  it('смена текста — noteAt, noteBy; звёздочка, название, дата, порядок вкладок — нет', () => {
    const d = device(base(), 'pc', day(10), () => {
      updateTopic('t1', { important: true });
      updateTopic('t1', { name: 'Ом' });
      updateTopic('t1', { examDate: '2026-10-01' });
      updateTopic('t1', { tabOrder: ['cards', 'note'] });
      updateTopic('t1', { note: BASE_NOTE }); // тот же текст — не правка
    });
    expect(top(d).noteAt).toBeUndefined();
    expect(top(d).noteBy).toBeUndefined();
    expect(top(d).updatedAt).toBe(day(10)); // но updatedAt, как и раньше, двигается
    const e = device(d, 'pc', day(11), () => updateTopic('t1', { note: BASE_NOTE + ' Новая строка.' }));
    expect(top(e).noteAt).toBe(day(11));
    expect(top(e).noteBy).toBe('pc');
    // и снова звёздочка — noteAt остался прежним
    const f = device(e, 'pc', day(12), () => updateTopic('t1', { important: false }));
    expect(top(f).noteAt).toBe(day(11));
    expect(top(f).updatedAt).toBe(day(12));
  });

  it('несколько правок подряд с одного устройства — noteFrom не двигается; чужой текст между ними — двигает', () => {
    const a = device(base(), 'pc', day(10), () => updateTopic('t1', { note: 'раз' }));
    expect(top(a).noteFrom).toBeUndefined(); // раньше noteAt не было
    const b = device(a, 'pc', day(11), () => updateTopic('t1', { note: 'раз два' }));
    expect(top(b).noteFrom).toBeUndefined();
    expect(top(b).noteAt).toBe(day(11));
    // текст пришёл с телефона (noteBy другой) — теперь правим от него
    const c = device({ ...b, topics: [{ ...top(b), noteBy: 'phone', noteAt: day(12) }] }, 'pc', day(13), () => updateTopic('t1', { note: 'раз два три' }));
    expect(top(c).noteFrom).toBe(day(12));
    expect(top(c).noteBy).toBe('pc');
  });

  it('noteEdit без устройства не падает', () => {
    expect(noteEdit({}, undefined, day(3))).toEqual({ noteAt: day(3), noteFrom: undefined, noteBy: undefined });
  });

  it('импорт тем: noteAt только у тем с текстом', () => {
    vi.setSystemTime(new Date(day(5)));
    replaceData({ ...emptyData(), deviceId: 'pc' });
    importTopics([
      { subjectName: 'Химия', topic: { name: 'С текстом', note: 'Атомы' } },
      { subjectName: 'Химия', topic: { name: 'Пустая (Anki)', note: '' } }
    ]);
    const d = getData();
    expect(d.topics.find((t) => t.name === 'С текстом')!.noteAt).toBe(day(5));
    expect(d.topics.find((t) => t.name === 'С текстом')!.noteBy).toBe('pc');
    expect(d.topics.find((t) => t.name === 'Пустая (Anki)')!.noteAt).toBeUndefined();
  });

  it('поле noteAt (и noteFrom, noteBy) переживает сохранение и загрузку', () => {
    const d = device(base(), 'pc', day(10), () => updateTopic('t1', { note: 'Новый текст' }));
    const back = normalizeData(JSON.parse(JSON.stringify(d)));
    expect(top(back).noteAt).toBe(day(10));
    expect(top(back).noteBy).toBe('pc');
    // Старый файл без этих полей открывается как раньше.
    const old = normalizeData(JSON.parse(JSON.stringify(base())));
    expect(top(old).noteAt).toBeUndefined();
    expect(top(old).note).toBe(BASE_NOTE);
  });
});

describe('2.0, этап 0: файл изменений и «Вернуть»', () => {
  const pack = (text: string) => {
    const r = parseChangeFile(text);
    if (!r.ok) throw new Error(r.error);
    return r.pack;
  };
  const env = { now: new Date(day(20)), uid: (() => { let n = 0; return () => 'cx-' + ++n; })() };

  it('замена и дописывание конспекта ставят noteAt, остальные поля темы — нет', () => {
    const src = { ...base(), deviceId: 'pc' };
    const replace = planChanges(src, pack('@предмет Физика\n@тема Закон Ома\nСовсем другой текст'), env);
    expect(top(replace.data).note).toBe('Совсем другой текст');
    expect(top(replace.data).noteAt).toBe(day(20));
    expect(top(replace.data).noteBy).toBe('pc');
    const star = planChanges(src, { changes: [{ do: 'topic', subject: 'Физика', topic: 'Закон Ома', important: true }] }, env);
    expect(top(star.data).important).toBe(true);
    expect(top(star.data).noteAt).toBeUndefined();
    const same = planChanges(src, { changes: [{ do: 'topic', subject: 'Физика', topic: 'Закон Ома', note: BASE_NOTE }] }, env);
    expect(top(same.data).noteAt).toBeUndefined();
  });

  it('новая тема с текстом из файла получает noteAt', () => {
    const p = planChanges({ ...emptyData(), deviceId: 'pc' }, pack('@предмет Химия\n@тема Атомы\nАтом — это…'), env);
    expect(p.data.topics[0].noteAt).toBe(day(20));
  });

  it('«Вернуть» старый текст — это правка текста со свежим noteAt (иначе другое устройство вернуло бы новый текст обратно)', () => {
    const before = { ...base(), deviceId: 'pc' };
    const applied = planChanges(before, pack('@предмет Физика\n@тема Закон Ома\nЗамена'), env).data;
    const back = revertChanges(before, applied, applied, new Date(day(21)));
    expect(top(back).note).toBe(BASE_NOTE);
    expect(top(back).noteAt).toBe(day(21));
    // Устройство, куда успела дойти замена, после слияния получает возвращённый текст.
    const other = mergeData(applied, back).data;
    expect(top(other).note).toBe(BASE_NOTE);
  });
});

describe('2.0, этап 0: слияние — (а) компьютер правит текст, телефон позже ставит важность', () => {
  it('итог содержит и правку текста, и важность (в обе стороны слияния)', () => {
    const b = base();
    const pc = device(b, 'pc', day(10), () => updateTopic('t1', { note: BASE_NOTE + '\n\nНовое на компьютере.' }));
    const phone = device(b, 'phone', day(11), () => updateTopic('t1', { important: true }));
    for (const merged of [mergeData(pc, phone), mergeData(phone, pc)]) {
      const t = top(merged.data);
      expect(t.note).toBe(BASE_NOTE + '\n\nНовое на компьютере.');
      expect(t.important).toBe(true);
      expect(t.noteAt).toBe(day(10));
      expect(t.updatedAt).toBe(day(11));
      expect(merged.data.topics).toHaveLength(1); // копий нет — конфликта не было
      expect(merged.report.conflicts ?? 0).toBe(0);
    }
  });

  it('другие поля по-прежнему «новее целиком», а текст — по noteAt: правка текста поздно, звёздочка раньше', () => {
    const b = base();
    const phone = device(b, 'phone', day(10), () => updateTopic('t1', { important: true, name: 'Ом (важно)' }));
    const pc = device(b, 'pc', day(11), () => updateTopic('t1', { note: 'Текст позже' }));
    const t = top(mergeData(phone, pc).data);
    expect(t.note).toBe('Текст позже');
    expect(t.name).toBe('Закон Ома'); // updatedAt компьютера новее — название от него, как всегда
    expect(t.important).toBeUndefined();
  });

  it('текст с noteAt побеждает текст без noteAt, даже если у того updatedAt новее', () => {
    const noAt = { ...top(base()), note: 'без отметки', updatedAt: day(15) };
    const withAt = { ...top(base()), note: 'с отметкой', noteAt: day(9), noteBy: 'pc', updatedAt: day(9) };
    const a = { ...base(), topics: [noAt] };
    const b = { ...base(), topics: [withAt] };
    expect(top(mergeData(a, b).data).note).toBe('с отметкой');
    expect(top(mergeData(b, a).data).note).toBe('с отметкой');
  });
});

describe('2.0, этап 0: слияние — (б) обе стороны правят текст независимо', () => {
  const A = BASE_NOTE + '\n\nДобавили на компьютере: U = I · R.';
  const B = '## Закон Ома (переписано)\n\nНа телефоне переписали с нуля.';

  function twoEdits(baseData = base()) {
    const pc = device(baseData, 'pc', day(10), () => updateTopic('t1', { note: A }));
    const phone = device(baseData, 'phone', day(11), () => updateTopic('t1', { note: B }));
    return { pc, phone };
  }

  it('побеждает новейший текст, проигравший — в копии рядом; в отчёте «копий при конфликте»', () => {
    const { pc, phone } = twoEdits();
    const m = mergeData(pc, phone);
    expect(top(m.data).note).toBe(B);
    const cs = copies(m.data);
    expect(cs).toHaveLength(1);
    expect(cs[0].note).toBe(A);
    expect(cs[0].subjectId).toBe('s1');
    expect(cs[0].name).toBe('Закон Ома' + CONFLICT_SUFFIX);
    expect(cs[0].id).toBe(`conflict-t1-${noteHash(A)}`);
    expect(cs[0].noteAt).toBe(day(10));
    expect(cs[0].createdAt).toBeTruthy();
    expect(cs[0].updatedAt).toBeTruthy();
    expect(m.report.conflicts).toBe(1);
    expect(reportText(m.report)).toContain('копий при конфликте: 1');
    expect(m.data.topics).toHaveLength(2);
  });

  it('результат не зависит от того, кто с кем сливается: тот же победитель и тот же id копии', () => {
    const { pc, phone } = twoEdits();
    const x = mergeData(pc, phone).data;
    const y = mergeData(phone, pc).data;
    expect(top(y).note).toBe(top(x).note);
    expect(copies(y).map((c) => c.id)).toEqual(copies(x).map((c) => c.id));
  });

  it('повторное слияние (в любую сторону, с любой старой копией) не плодит вторую копию', () => {
    const { pc, phone } = twoEdits();
    const once = mergeData(pc, phone).data;
    const results = [
      mergeData(once, phone),
      mergeData(once, pc),
      mergeData(phone, once),
      mergeData(pc, once),
      mergeData(mergeData(phone, pc).data, once),
      mergeData(once, once)
    ];
    for (const r of results) {
      expect(copies(r.data)).toHaveLength(1);
      expect(r.data.topics).toHaveLength(2);
      expect(top(r.data).note).toBe(B);
    }
    // Телефон слил то, что получилось у компьютера, и снова слил — тоже одна копия.
    const phoneAfter = mergeData(phone, once).data;
    expect(copies(mergeData(phoneAfter, once).data)).toHaveLength(1);
    // Отчёт: о конфликте сообщаем только когда копия действительно создана.
    expect(results[0].report.conflicts ?? 0).toBe(0);
  });

  it('то же, если у темы раньше уже была правка текста с третьего устройства (общий предок с noteAt)', () => {
    const ancestor = device(base(), 'tablet', day(5), () => updateTopic('t1', { note: BASE_NOTE + ' (планшет)' }));
    const { pc, phone } = twoEdits(ancestor);
    const m = mergeData(pc, phone);
    expect(top(m.data).note).toBe(B);
    expect(copies(m.data).map((c) => c.note)).toEqual([A]);
  });

  it('несколько правок подряд на телефоне и одна на компьютере: копия есть (правка с компьютера не теряется)', () => {
    const pc = device(base(), 'pc', day(10), () => updateTopic('t1', { note: A }));
    const phone = device(base(), 'phone', day(11), () => {
      updateTopic('t1', { note: B });
      vi.setSystemTime(new Date(day(12)));
      updateTopic('t1', { note: B + ' ещё строка' });
    });
    const m = mergeData(pc, phone).data;
    expect(top(m).note).toBe(B + ' ещё строка');
    expect(copies(m).map((c) => c.note)).toEqual([A]);
  });

  it('обычная работа по очереди — без копий: правил на компьютере, телефон получил и правил дальше (в том числе в середине текста)', () => {
    const pc = device(base(), 'pc', day(10), () => updateTopic('t1', { note: A }));
    const phoneGot = mergeData(base(), pc).data; // телефон получил текст компьютера
    const phone = device(phoneGot, 'phone', day(11), () => {
      updateTopic('t1', { note: A.replace('Ток зависит', 'Сила тока зависит') }); // правка в середине
      vi.setSystemTime(new Date(day(12)));
      updateTopic('t1', { note: 'Совсем новое начало. ' + A.replace('Ток зависит', 'Сила тока зависит') });
    });
    const m = mergeData(pc, phone);
    expect(top(m.data).note).toContain('Совсем новое начало');
    expect(m.data.topics).toHaveLength(1);
    expect(m.report.conflicts ?? 0).toBe(0);
    expect(mergeData(phone, pc).data.topics).toHaveLength(1);
  });

  it('правки с одного устройства (одна цепочка) копии не дают', () => {
    const earlier = device(base(), 'pc', day(10), () => updateTopic('t1', { note: A }));
    const later = device(earlier, 'pc', day(12), () => updateTopic('t1', { note: B }));
    const m = mergeData(earlier, later).data;
    expect(top(m).note).toBe(B);
    expect(m.topics).toHaveLength(1);
  });

  it('текст, продолженный или обрезанный (один — начало другого), копии не даёт', () => {
    const pc = device(base(), 'pc', day(10), () => updateTopic('t1', { note: BASE_NOTE + '\n\nДобавка.' }));
    const phone = device(base(), 'phone', day(11), () => updateTopic('t1', { note: BASE_NOTE + '\n\nДобавка. И ещё.' }));
    expect(mergeData(pc, phone).data.topics).toHaveLength(1);
    expect(mergeData(phone, pc).data.topics).toHaveLength(1);
  });

  it('если на новейшей стороне текст стёрт, а на другой правили независимо — старый текст не пропадает', () => {
    const pc = device(base(), 'pc', day(10), () => updateTopic('t1', { note: A }));
    const phone = device(base(), 'phone', day(11), () => updateTopic('t1', { note: '' }));
    const m = mergeData(pc, phone).data;
    expect(top(m).note).toBe('');
    expect(copies(m).map((c) => c.note)).toEqual([A]);
    // А если стёрт старый текст, а новый написан — копия пустого не нужна.
    const pc2 = device(base(), 'pc', day(10), () => updateTopic('t1', { note: '' }));
    const phone2 = device(base(), 'phone', day(11), () => updateTopic('t1', { note: B }));
    expect(mergeData(pc2, phone2).data.topics).toHaveLength(1);
  });

  it('копия правила остаётся правилом, у копии подтемы тот же родитель', () => {
    const b = base({ kind: 'rule' });
    b.topics.push({ id: 'p', subjectId: 's1', name: 'Родитель', note: '', createdAt: T0, updatedAt: T0 });
    b.topics[0] = { ...b.topics[0], parentId: 'p' };
    const pc = device(b, 'pc', day(10), () => updateTopic('t1', { note: A }));
    const phone = device(b, 'phone', day(11), () => updateTopic('t1', { note: B }));
    const c = copies(mergeData(pc, phone).data)[0];
    expect(c.kind).toBe('rule');
    expect(c.parentId).toBe('p');
  });

  it('удалил копию — слияние со старой копией её не воскрешает', () => {
    const { pc, phone } = twoEdits();
    const once = mergeData(pc, phone).data;
    vi.setSystemTime(new Date(day(20)));
    replaceData({ ...once, deviceId: 'pc' });
    deleteTopic(copies(once)[0].id);
    const afterDelete = getData();
    expect(copies(afterDelete)).toHaveLength(0);
    expect(copies(mergeData(afterDelete, pc).data)).toHaveLength(0);
    expect(copies(mergeData(afterDelete, phone).data)).toHaveLength(0);
    expect(copies(mergeData(pc, afterDelete).data)).toHaveLength(0);
  });

  it('независимость правок: правила', () => {
    const win = { ...top(base()), note: 'Новый текст B', noteAt: day(11), noteFrom: day(3), noteBy: 'phone' };
    const lose = { ...top(base()), note: 'Совсем другой A', noteAt: day(10), noteBy: 'pc' };
    expect(independentNotes(win, lose)).toBe(true);
    expect(independentNotes(win, { ...lose, noteAt: day(3) })).toBe(false); // это то, от чего правили
    expect(independentNotes(win, { ...lose, noteAt: day(2) })).toBe(false);
    expect(independentNotes(win, { ...lose, noteBy: 'phone' })).toBe(false); // одно устройство
    expect(independentNotes(win, { ...lose, note: 'Новый текст B ' })).toBe(false); // тот же текст
    expect(independentNotes(win, { ...lose, note: 'Новый' })).toBe(false); // начало другого
    expect(independentNotes({ ...win, noteFrom: undefined }, lose)).toBe(true); // предок неизвестен — берегём
  });
});

describe('2.0, этап 0: слияние — (в) старые данные без noteAt, как раньше', () => {
  it('новее по updatedAt побеждает целиком; копий и noteAt нет', () => {
    const pc = base();
    const phone = base();
    pc.topics[0] = { ...pc.topics[0], note: 'правка на компьютере', updatedAt: day(2) };
    phone.topics[0] = { ...phone.topics[0], note: 'правка на телефоне', important: true, updatedAt: day(3) };
    for (const m of [mergeData(pc, phone), mergeData(phone, pc)]) {
      const t = top(m.data);
      expect(t.note).toBe('правка на телефоне');
      expect(t.important).toBe(true);
      expect(t.noteAt).toBeUndefined();
      expect(m.data.topics).toHaveLength(1);
      expect(m.report.conflicts ?? 0).toBe(0);
    }
  });

  it('одинаковые версии — ничего не обновлено; новая тема добавляется', () => {
    const a = base();
    const b = base();
    b.topics.push({ id: 't2', subjectId: 's1', name: 'Новая', note: 'x', createdAt: T0, updatedAt: T0 });
    const m = mergeData(a, b);
    expect(m.report.updated).toBe(0);
    expect(m.report.added.topics).toBe(1);
    expect(reportText(m.report)).not.toContain('копий');
  });

  it('удаление темы с другого устройства по-прежнему стирает старую копию, а правка после удаления сохраняется', () => {
    const pc = base();
    const phone = base();
    phone.topics = [];
    phone.deleted = { 'topic:t1': day(3) };
    expect(mergeData(pc, phone).data.topics).toHaveLength(0);
    pc.topics[0] = { ...pc.topics[0], note: 'правил уже после удаления', updatedAt: day(4) };
    expect(mergeData(pc, phone).data.topics).toHaveLength(1);
  });
});

describe('2.0, этап 0: слияние — (г) удалённая тема не воскресает', () => {
  it('удалили на телефоне — на компьютере тема со своей правкой текста, но старше удаления: тема не возвращается и копий нет', () => {
    const pc = device(base(), 'pc', day(10), () => updateTopic('t1', { note: 'правка на компьютере' }));
    const phone = device(base(), 'phone', day(11), () => updateTopic('t1', { note: 'правка на телефоне' }));
    const phoneDeleted = device(phone, 'phone', day(12), () => deleteTopic('t1'));
    for (const m of [mergeData(pc, phoneDeleted), mergeData(phoneDeleted, pc)]) {
      expect(m.data.topics).toHaveLength(0);
      expect(m.report.conflicts ?? 0).toBe(0);
    }
  });

  it('правка текста после удаления тему возвращает (как раньше для любых правок)', () => {
    const phoneDeleted = device(base(), 'phone', day(10), () => deleteTopic('t1'));
    const pc = device(base(), 'pc', day(11), () => updateTopic('t1', { note: 'передумал, дописал' }));
    expect(mergeData(pc, phoneDeleted).data.topics.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('2.0, этап 0: noteText — сравнение текстов', () => {
  it('canonNote и sameNote: переводы строк, хвостовые пробелы, лишние пустые строки, маркеры списка', () => {
    expect(sameNote('a\r\nb  \n\n\n\nc\n', 'a\nb\n\nc')).toBe(true);
    expect(sameNote('* x\n* y', '- x\n- y')).toBe(true);
    expect(sameNote('a\nb', 'a\n\nb')).toBe(false); // абзац и мягкий перенос — разные вещи
    expect(canonNote('  текст \n')).toBe('текст');
  });
  it('noteHash: одинаков для одного текста, разный для разных', () => {
    expect(noteHash('abc')).toBe(noteHash('abc\n'));
    expect(noteHash('abc')).not.toBe(noteHash('abd'));
  });
});

describe('2.0, этап 0: «фантомные» правки — открытие темы не должно менять конспект', () => {
  // Пары «как хранится → как отдал редактор при закрытии» — сняты в настоящем браузере (Playwright, сборка 1.8).
  const pairs: [string, string][] = [
    ['## Что это\n\nТекст **жирный** и *курсив*.\n\n- пункт 1\n- пункт 2', '## Что это\n\nТекст **жирный** и *курсив*.\n\n- пункт 1\n- пункт 2\n\n'],
    ['* пункт\n* пункт 2\n\nТекст', '- пункт\n- пункт 2\n\nТекст'],
    ['Текст\n\n\n\nещё текст\n', 'Текст\n\n\n\nещё текст'],
    ['# Заголовок\nтекст сразу под заголовком\n1. раз\n2. два', '# Заголовок\n\nтекст сразу под заголовком\n\n1. раз\n2. два\n\n'],
    ['| a | b |\n|---|---|\n| 1 | 2 |', '\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\n\n'],
    ['Формула $E=mc^2$ и\n\n$$x^2$$\n\n> цитата\n\n---\n\n`код`', 'Формула $E=mc^2$ и\n\n$$\nx^2\n$$\n\n> цитата\n\n---\n\n`код`'],
    ['Текст [стр. 12] ещё\n\nТекст с \\* экранированием', 'Текст \\[стр. 12\\] ещё\n\nТекст с \\* экранированием'],
    ['abc  \ndef\n\nсписок:\n+ плюс\n+ плюс2', 'abc  \ndef\n\nсписок:\n\n- плюс\n- плюс2\n\n'],
    ['[сайт](https://example.com) и ![Рис](data:image/png;base64,iVBORw0KGgo=)\n\n1. один\n   - вложенный', '[сайт](https://example.com) и ![Рис](data:image/png;base64,iVBORw0KGgo=)\n\n1. один\n   - вложенный\n\n']
  ];
  it.each(pairs.map((p, i) => [i, ...p] as [number, string, string]))('запись %i: разница только в записи — не правка', (_i, was, now) => {
    expect(sameLook(was, now)).toBe(true);
  });
  it('настоящие правки отличаются', () => {
    expect(sameLook('Текст', 'Текст.')).toBe(false);
    expect(sameLook('Один абзац\nдве строки', 'Один абзац\n\nдва абзаца')).toBe(false);
    expect(sameLook('Текст', '**Текст**')).toBe(false);
    expect(sameLook('- a\n- b', '1. a\n2. b')).toBe(false);
    expect(sameLook('Формула $x^2$', 'Формула $x^3$')).toBe(false);
    expect(sameLook('', 'Новое')).toBe(false);
    expect(sameLook('![Рис](data:image/png;base64,AAAA)', '![Рис](data:image/png;base64,BBBB)')).toBe(false);
  });
});
