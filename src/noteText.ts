// Правки текста конспекта: когда и с какого устройства текст менялся в последний раз и как сравнить два текста «по смыслу».
// Нужно синхронизации (src/sync.ts: текст сливается отдельно от остальных полей темы) и защите от «фантомных» правок
// (редактор при закрытии отдаёт тот же текст в чуть другой записи — это не правка).
import type { Topic } from './types';

/** Текст без различий, которых не видно на экране: переводы строк, хвостовые пробелы, лишние пустые строки, «*» и «+» как маркеры списка. */
export function canonNote(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/^([ \t]*)[*+](?= )/gm, '$1-')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Один и тот же текст (с точностью до невидимых различий записи). */
export const sameNote = (a: string, b: string): boolean => a === b || canonNote(a) === canonNote(b);

/** 53-битная «подпись» строки (cyrb53) — для устойчивого id копии при конфликте. */
function cyrb53(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Короткая подпись произвольной строки (например, большой картинки — чтобы сравнивать её, не разбирая). */
export const hashText = (s: string): string => cyrb53(s).toString(36);

/** Короткая подпись текста конспекта (одинаковая на всех устройствах). */
export const noteHash = (note: string): string => hashText(canonNote(note));

export type NoteStamp = Pick<Topic, 'noteAt' | 'noteFrom' | 'noteBy'>;

/**
 * Отметки правки текста конспекта (вызывать, только когда текст реально поменялся).
 * noteAt — когда; noteBy — с какого устройства; noteFrom — noteAt той версии текста, от которой это устройство начало
 * править. Пока правки идут подряд с одного устройства, noteFrom не двигается (это одна цепочка); если перед правкой
 * текст пришёл с другого устройства — noteFrom становится его noteAt. По этим отметкам слияние отличает «продолжил
 * чужую правку» от «правил независимо» (src/sync.ts, independentNotes).
 */
export function noteEdit(t: NoteStamp, by: string | undefined, stamp: string): NoteStamp {
  const mine = Boolean(by) && Boolean(t.noteAt) && t.noteBy === by;
  return { noteAt: stamp, noteFrom: mine ? t.noteFrom : t.noteAt, noteBy: by || undefined };
}
