import { describe, expect, it } from 'vitest';
import { backupDay, dayLabel, sizeLabel } from './backups';

describe('Автокопии: подписи', () => {
  it('день по имени файла; чужие имена — нет', () => {
    expect(backupDay('mnema-2026-10-03.json')).toBe('2026-10-03');
    expect(backupDay('../mnema-2026-10-03.json')).toBeNull();
    expect(backupDay('mnema-backup-2026-10-03.json')).toBeNull();
    expect(backupDay('mnema-2026-10-03.json.bak')).toBeNull();
  });
  it('Сегодня, Вчера, дата и год', () => {
    const today = new Date(2026, 9, 3, 15, 0);
    expect(dayLabel('2026-10-03', today)).toBe('Сегодня');
    expect(dayLabel('2026-10-02', today)).toBe('Вчера');
    expect(dayLabel('2026-09-28', today)).toBe('28 сентября');
    expect(dayLabel('2025-12-31', today)).toBe('31 декабря 2025');
    expect(dayLabel('2026-02-28', new Date(2026, 2, 1))).toBe('Вчера');
  });
  it('размер', () => {
    expect(sizeLabel(820)).toBe('820 Б');
    expect(sizeLabel(12 * 1024 + 100)).toBe('12 КБ');
    expect(sizeLabel(1.4 * 1024 * 1024)).toBe('1,4 МБ');
  });
});
