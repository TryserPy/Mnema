// Папка с данными на компьютере: раскладка «Мои данные» / «Служебное», переезд со старого места %APPDATA%\Mnema без потерь,
// автокопии, ПРОЧТИ.txt. Логика в electron/dataLayout.cjs (без Electron) — проверяем во временных папках.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const L = createRequire(import.meta.url)('../electron/dataLayout.cjs');

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'refrain-layout-'));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const DATA = JSON.stringify({ version: 1, subjects: [{ id: 's1', name: 'Биология' }], topics: [], cards: [] });
const put = (file: string, text: string | Buffer) => {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
};
const tree = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? walk(join(d, e.name), rel + e.name + '/') : out.push(rel + e.name));
  };
  if (existsSync(dir)) walk(dir, '');
  return out.sort();
};

/** Старая установка: %APPDATA%\Mnema с данными, копиями, ключами и мусором Electron. */
function oldInstall(appData: string) {
  const old = join(appData, 'Mnema');
  put(join(old, 'mnema-data.json'), DATA);
  put(join(old, 'backups', 'mnema-2026-10-01.json'), DATA.replace('Биология', 'Старая'));
  put(join(old, 'backups', 'mnema-2026-10-02.json'), DATA);
  put(join(old, 'backups', 'secret.json'), '{"чужое":1}');
  put(join(old, 'secrets.json'), '{"cloud-pass":"enc:AAAA"}');
  put(join(old, 'ai.json'), '{"keys":{"a":"enc:BBBB"}}');
  put(join(old, 'Local State'), '{"os_crypt":{"encrypted_key":"KEY"}}');
  put(join(old, 'Cache', 'data_0'), 'x');
  put(join(old, 'GPUCache', 'index'), 'x');
  put(join(old, 'Local Storage', 'leveldb', '000003.log'), 'x');
  return old;
}

describe('раскладка папок', () => {
  it('обычный запуск: %APPDATA%\\Refrain → «Мои данные» и «Служебное»; старая Mnema — откуда переезжать', () => {
    const l = L.resolveLayout({ appData: join(tmp, 'AppData'), env: {} });
    expect(l.root).toBe(join(tmp, 'AppData', 'Refrain'));
    expect(l.dataFile).toBe(join(tmp, 'AppData', 'Refrain', 'Мои данные', 'refrain-data.json'));
    expect(l.backupsDir).toBe(join(tmp, 'AppData', 'Refrain', 'Мои данные', 'Резервные копии'));
    expect(l.systemDir).toBe(join(tmp, 'AppData', 'Refrain', 'Служебное'));
    expect(l.legacyDirs[0]).toBe(join(tmp, 'AppData', 'Mnema'));
    expect(l.custom).toBe(false);
  });
  it('REFRAIN_USER_DATA и прежняя MNEMA_USER_DATA задают корень; REFRAIN главнее', () => {
    const a = L.resolveLayout({ appData: tmp, env: { MNEMA_USER_DATA: join(tmp, 'a') } });
    expect(a.root).toBe(join(tmp, 'a'));
    expect(a.custom).toBe(true);
    expect(a.legacyDirs).toEqual([join(tmp, 'a')]);
    const b = L.resolveLayout({ appData: tmp, env: { MNEMA_USER_DATA: join(tmp, 'a'), REFRAIN_USER_DATA: join(tmp, 'b') } });
    expect(b.root).toBe(join(tmp, 'b'));
  });
});

describe('переезд со старого места', () => {
  it('копирует данные, копии и ключи; старое не трогает; ставит метку; мусор Electron не переносит', () => {
    const appData = join(tmp, 'AppData');
    const old = oldInstall(appData);
    const before = tree(old);
    const l = L.resolveLayout({ appData, env: {} });
    L.ensureLayout(l);
    const r = L.migrateLegacy(l, { now: new Date('2026-10-11T10:00:00Z') });
    expect(r).toMatchObject({ from: old, data: 'copied', backups: 2, marked: true, valid: true, errors: [] });
    expect(r.system.sort()).toEqual(['Local State', 'ai.json', 'secrets.json']);
    // новое место
    expect(readFileSync(l.dataFile, 'utf8')).toBe(DATA);
    expect(tree(l.root)).toEqual(
      [
        'Мои данные/refrain-data.json',
        'Мои данные/ПРОЧТИ.txt',
        'Мои данные/Резервные копии/refrain-2026-10-01.json',
        'Мои данные/Резервные копии/refrain-2026-10-02.json',
        'Служебное/Local State',
        'Служебное/ai.json',
        'Служебное/secrets.json'
      ].sort()
    );
    expect(readFileSync(join(l.backupsDir, 'refrain-2026-10-01.json'), 'utf8')).toContain('Старая');
    expect(readFileSync(join(l.systemDir, 'Local State'), 'utf8')).toContain('KEY');
    // ключи — не рядом с данными
    expect(existsSync(join(l.dataDir, 'secrets.json'))).toBe(false);
    expect(existsSync(join(l.dataDir, 'ai.json'))).toBe(false);
    // старое: всё на месте и не изменилось, добавилась только метка
    expect(tree(old)).toEqual([...before, 'ПЕРЕНЕСЕНО-В-Refrain.txt'].sort());
    expect(readFileSync(join(old, 'mnema-data.json'), 'utf8')).toBe(DATA);
    const marker = readFileSync(join(old, 'ПЕРЕНЕСЕНО-В-Refrain.txt'), 'utf8');
    expect(marker).toContain(l.dataDir);
    expect(marker).toContain('НЕ УДАЛЕНЫ');
  });

  it('второй запуск ничего не делает', () => {
    const appData = join(tmp, 'AppData');
    oldInstall(appData);
    const l = L.resolveLayout({ appData, env: {} });
    L.ensureLayout(l);
    expect(L.migrateLegacy(l)).not.toBeNull();
    // человек уже работает в новом месте
    writeFileSync(l.dataFile, DATA.replace('Биология', 'Новое'));
    expect(L.migrateLegacy(l)).toBeNull();
    expect(readFileSync(l.dataFile, 'utf8')).toContain('Новое');
  });

  it('нечего переносить (чистая установка) — null, ничего не создаётся лишнего', () => {
    const l = L.resolveLayout({ appData: join(tmp, 'AppData'), env: {} });
    expect(L.migrateLegacy(l)).toBeNull();
    expect(existsSync(join(tmp, 'AppData'))).toBe(false);
  });

  it('на новом месте уже есть другие данные: не перезаписываем, метки нет', () => {
    const appData = join(tmp, 'AppData');
    const old = oldInstall(appData);
    const l = L.resolveLayout({ appData, env: {} });
    L.ensureLayout(l);
    writeFileSync(l.dataFile, '{"version":1,"новое":true}');
    const r = L.migrateLegacy(l);
    expect(r.data).toBe('conflict');
    expect(r.marked).toBe(false);
    expect(readFileSync(l.dataFile, 'utf8')).toBe('{"version":1,"новое":true}');
    expect(existsSync(join(old, 'ПЕРЕНЕСЕНО-В-Refrain.txt'))).toBe(false);
  });

  it('повреждённый файл данных копируется как есть (приложение само покажет, что файл не читается), valid=false', () => {
    const appData = join(tmp, 'AppData');
    const old = join(appData, 'Mnema');
    put(join(old, 'mnema-data.json'), '{"version":1, сломано');
    const l = L.resolveLayout({ appData, env: {} });
    L.ensureLayout(l);
    const r = L.migrateLegacy(l);
    expect(r.data).toBe('copied');
    expect(r.valid).toBe(false);
    expect(readFileSync(l.dataFile, 'utf8')).toBe('{"version":1, сломано');
  });

  it('копия не вышла: данные остаются на старом месте, метки нет, отчёт говорит об ошибке', () => {
    const appData = join(tmp, 'AppData');
    const old = oldInstall(appData);
    const l = L.resolveLayout({ appData, env: {} });
    // «Мои данные» — на самом деле файл: создать папку нельзя
    put(l.dataDir, 'я файл, а не папка');
    const r = L.migrateLegacy(l);
    expect(r.data).toBe('missing');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.marked).toBe(false);
    expect(existsSync(join(old, 'ПЕРЕНЕСЕНО-В-Refrain.txt'))).toBe(false);
    expect(readFileSync(join(old, 'mnema-data.json'), 'utf8')).toBe(DATA);
  });

  it('недоделанный переезд дорабатывается: уже скопированное не трогается, недостающее добавляется', () => {
    const appData = join(tmp, 'AppData');
    const old = oldInstall(appData);
    const l = L.resolveLayout({ appData, env: {} });
    L.ensureLayout(l);
    L.migrateLegacy(l);
    rmSync(join(old, 'ПЕРЕНЕСЕНО-В-Refrain.txt'));
    rmSync(join(l.backupsDir, 'refrain-2026-10-02.json'));
    writeFileSync(join(l.backupsDir, 'refrain-2026-10-01.json'), 'отредактировано');
    const r = L.migrateLegacy(l);
    expect(r).toMatchObject({ data: 'same', backups: 1, marked: true });
    expect(readFileSync(join(l.backupsDir, 'refrain-2026-10-01.json'), 'utf8')).toBe('отредактировано');
    expect(existsSync(join(l.backupsDir, 'refrain-2026-10-02.json'))).toBe(true);
  });

  it('отдельная папка данных (проверки, MNEMA_USER_DATA): плоская старая раскладка в корне переезжает внутрь', () => {
    const root = join(tmp, 'e2e');
    put(join(root, 'mnema-data.json'), DATA);
    put(join(root, 'backups', 'mnema-2026-10-01.json'), DATA);
    put(join(root, 'secrets.json'), '{}');
    const l = L.resolveLayout({ appData: join(tmp, 'AppData'), env: { MNEMA_USER_DATA: root } });
    L.ensureLayout(l);
    const r = L.migrateLegacy(l);
    expect(r).toMatchObject({ from: root, data: 'copied', backups: 1, marked: true });
    expect(readFileSync(join(root, 'Мои данные', 'refrain-data.json'), 'utf8')).toBe(DATA);
    expect(existsSync(join(root, 'Служебное', 'secrets.json'))).toBe(true);
    expect(existsSync(join(root, 'mnema-data.json'))).toBe(true);
    expect(existsSync(join(root, 'ПЕРЕНЕСЕНО-В-Refrain.txt'))).toBe(true);
    expect(L.migrateLegacy(l)).toBeNull();
  });
});

describe('запись и автокопии', () => {
  it('атомарная запись: заменяет файл целиком и не оставляет временных', () => {
    const f = join(tmp, 'x', 'data.json');
    L.writeAtomic(f, 'один');
    L.writeAtomic(f, 'два');
    expect(readFileSync(f, 'utf8')).toBe('два');
    expect(readdirSync(join(tmp, 'x'))).toEqual(['data.json']);
  });
  it('копия раз в день, хранится 8 последних, чужие файлы не трогаются', () => {
    const l = L.resolveLayout({ appData: tmp, env: {} });
    L.ensureLayout(l);
    L.writeData(l, DATA);
    put(join(l.backupsDir, 'заметка.txt'), 'моё');
    for (let d = 1; d <= 10; d++) put(join(l.backupsDir, `refrain-2026-09-${String(d).padStart(2, '0')}.json`), DATA);
    expect(L.dailyBackup(l, { now: new Date(2026, 9, 11, 9) })).toBe('refrain-2026-10-11.json');
    expect(L.dailyBackup(l, { now: new Date(2026, 9, 11, 18) })).toBeNull(); // в тот же день — не дублируется
    const names = readdirSync(l.backupsDir).filter((f: string) => f.startsWith('refrain-'));
    expect(names).toHaveLength(8);
    expect(names).toContain('refrain-2026-10-11.json');
    expect(names).not.toContain('refrain-2026-09-01.json');
    expect(readdirSync(l.backupsDir)).toContain('заметка.txt');
  });
  it('нет данных — нет и копии', () => {
    const l = L.resolveLayout({ appData: tmp, env: {} });
    L.ensureLayout(l);
    expect(L.dailyBackup(l)).toBeNull();
  });
  it('список: новые выше, понимает и прежние mnema-…; чтение не выпускает за пределы папки', () => {
    const l = L.resolveLayout({ appData: tmp, env: {} });
    L.ensureLayout(l);
    put(join(l.backupsDir, 'refrain-2026-10-03.json'), 'a');
    put(join(l.backupsDir, 'mnema-2026-10-05.json'), 'bb');
    put(join(l.backupsDir, 'refrain-2026-10-04.json'), 'ccc');
    put(join(l.backupsDir, 'secret.json'), 'нет');
    expect(L.listBackups(l).map((x: { name: string }) => x.name)).toEqual(['mnema-2026-10-05.json', 'refrain-2026-10-04.json', 'refrain-2026-10-03.json']);
    expect(L.listBackups(l)[0].size).toBe(2);
    expect(L.readBackup(l, 'refrain-2026-10-04.json')).toBe('ccc');
    for (const bad of ['../refrain-data.json', 'secret.json', '..\\x.json', 'refrain-2026-10-04.json/../../x', 5, null]) expect(L.readBackup(l, bad)).toBeNull();
  });
});

describe('ПРОЧТИ.txt', () => {
  it('создаётся с путями и объяснением, чужой текст не затирается, старая версия обновляется', () => {
    const l = L.resolveLayout({ appData: tmp, env: {} });
    L.ensureLayout(l);
    const text = readFileSync(l.readmeFile, 'utf8');
    for (const s of ['refrain-data.json', 'Резервные копии', 'КАК ПЕРЕНЕСТИ', 'МОЖНО УДАЛЯТЬ', 'ПЕРЕНЕСЕНО-В-Refrain.txt', l.dataDir]) expect(text).toContain(s);
    writeFileSync(l.readmeFile, 'Мои заметки о папке');
    L.ensureLayout(l);
    expect(readFileSync(l.readmeFile, 'utf8')).toBe('Мои заметки о папке');
    writeFileSync(l.readmeFile, '(Файл создан автоматически, версия 1. старый текст');
    L.ensureLayout(l);
    expect(readFileSync(l.readmeFile, 'utf8')).toContain('КАК ПЕРЕНЕСТИ');
    expect(statSync(l.readmeFile).size).toBeGreaterThan(500);
  });
});
