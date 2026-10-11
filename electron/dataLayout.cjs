// Где на компьютере лежат данные приложения и как они переезжают со старого места.
// Чистая логика без Electron: путь %APPDATA% приходит параметром, поэтому её можно проверить во временной папке (src/dataLayout.test.ts).
//
//   %APPDATA%\Refrain\
//     Мои данные\                 ← то, что принадлежит человеку: сюда ведёт кнопка «Открыть папку с данными»
//       refrain-data.json         ← все предметы, темы, карточки, прогресс, настройки
//       Резервные копии\          ← раз в день копия того, что было при запуске (последние 8)
//       ПРОЧТИ.txt                ← что тут лежит, как перенести и что можно удалять
//     Служебное\                  ← Electron: кэш, Local Storage, GPUCache, логи…; ключи ИИ и пароль облака (зашифрованы Windows)
//
// Старое место — %APPDATA%\Mnema (файл mnema-data.json, backups\, secrets.json, ai.json). Оттуда файлы КОПИРУЮТСЯ (с проверкой),
// старые не удаляются и не меняются; в старой папке остаётся только файл «ПЕРЕНЕСЕНО-В-Refrain.txt».
const fs = require('fs');
const path = require('path');

const NAMES = {
  rootDir: 'Refrain',
  legacyRootDir: 'Mnema',
  dataDir: 'Мои данные',
  backupsDir: 'Резервные копии',
  systemDir: 'Служебное',
  dataFile: 'refrain-data.json',
  legacyDataFile: 'mnema-data.json',
  legacyBackupsDir: 'backups',
  readme: 'ПРОЧТИ.txt',
  movedMarker: 'ПЕРЕНЕСЕНО-В-Refrain.txt'
};

/** Файлы со старого места в служебную папку: ключи ИИ, пароль облака и «Local State» — в нём ключ, которым Windows зашифровала эти файлы. */
const LEGACY_SYSTEM_FILES = ['secrets.json', 'ai.json', 'Local State'];

const BACKUP_NAME = /^(refrain|mnema)-(\d{4}-\d{2}-\d{2})\.json$/;
const MAX_BACKUPS = 8;

/**
 * Раскладка папок. env — переменные окружения (REFRAIN_USER_DATA или старая MNEMA_USER_DATA: отдельная папка для проверок и
 * запуска двух копий на одном компьютере; тогда она и есть «корень»). appData — %APPDATA%.
 */
function resolveLayout({ appData, env = {} }) {
  const custom = env.REFRAIN_USER_DATA || env.MNEMA_USER_DATA || '';
  const root = custom ? path.resolve(custom) : path.join(appData, NAMES.rootDir);
  const dataDir = path.join(root, NAMES.dataDir);
  return {
    custom: Boolean(custom),
    root,
    dataDir,
    dataFile: path.join(dataDir, NAMES.dataFile),
    backupsDir: path.join(dataDir, NAMES.backupsDir),
    readmeFile: path.join(dataDir, NAMES.readme),
    systemDir: path.join(root, NAMES.systemDir),
    // Где могли лежать данные раньше: %APPDATA%\Mnema, а также прямо в корне (так было у отдельной папки данных).
    legacyDirs: [...(custom ? [] : [path.join(appData, NAMES.legacyRootDir)]), root]
  };
}

const READMEV = 2;

function readmeText(layout, platform = process.platform) {
  const account = platform === 'win32' ? 'вашей учётной записи Windows' : 'вашей учётной записи в системе (связке ключей)';
  const sep = platform === 'win32' ? '\\' : '/';
  return `Это папка с вашими данными — Refrain (бывшая «Мнема») хранит здесь всё, что вы создали.
(Файл создан автоматически, версия ${READMEV}. Приложение его не читает — можно править и удалять.)

ЧТО ЗДЕСЬ ЛЕЖИТ
  ${NAMES.dataFile}
      Всё ваше: папки, предметы, темы, конспекты, карточки, прогресс повторений, настройки.
      Это обычный текстовый файл (JSON). Он ОДИН — других нет.
  ${NAMES.backupsDir}${sep}
      Резервные копии. Раз в день, при первом запуске, приложение кладёт сюда копию данных —
      такими они были до первых изменений дня. Хранятся 8 последних дней.
      Вернуть копию можно в приложении: Настройки → Данные → Автокопии.
  ${NAMES.readme}
      Этот файл.

КАК ПЕРЕНЕСТИ НА ДРУГОЙ КОМПЬЮТЕР
  Самый простой способ — в приложении: Настройки → Данные → «Сохранить копию», а на новом компьютере «Восстановить из копии».
  Вручную: закройте приложение, скопируйте файл ${NAMES.dataFile} на новый компьютер в такую же папку
  (${layout.dataDir}) и запустите приложение.
  Ключи ИИ и пароль облака хранятся отдельно, в зашифрованном виде и привязаны к ${account}, —
  на новом компьютере их нужно ввести заново.

ЧТО МОЖНО УДАЛЯТЬ, А ЧТО НЕЛЬЗЯ
  Нельзя: ${NAMES.dataFile} — без него приложение начнёт с пустого места (копии в «${NAMES.backupsDir}» вас выручат).
  Можно: файлы в «${NAMES.backupsDir}» — приложение само удаляет старые; если удалить все, потеряется только страховка.
  Папку «${NAMES.systemDir}» (рядом с этой, уровнем выше) открывать не нужно: там кэш и служебные файлы приложения.
  Кэш из неё удалять безопасно, но файлы secrets.json, ai.json и «Local State» лучше оставить — иначе ключи ИИ и пароль облака придётся ввести заново.

ПРОЧЕЕ
  Лучше не править ${NAMES.dataFile} вручную, пока приложение открыто: оно перезапишет его своей версией.
  Если вы обновились со старой «Мнемы»: прежняя папка (${NAMES.legacyRootDir}) осталась нетронутой — там лежит файл «${NAMES.movedMarker}».
  Когда убедитесь, что всё на месте, старую папку можно удалить вручную. Приложение само её никогда не удаляет.
`;
}

/** Создать папки и положить ПРОЧТИ.txt (если его нет или он от старой версии приложения). */
function ensureLayout(layout) {
  fs.mkdirSync(layout.backupsDir, { recursive: true });
  fs.mkdirSync(layout.systemDir, { recursive: true });
  let write = true;
  try {
    const cur = fs.readFileSync(layout.readmeFile, 'utf8');
    const m = /версия (\d+)\./.exec(cur.slice(0, 400));
    write = Boolean(m) && Number(m[1]) < READMEV; // чужой текст не трогаем
  } catch {
    /* файла нет */
  }
  if (write) fs.writeFileSync(layout.readmeFile, readmeText(layout), 'utf8');
}

// ---------- Надёжная запись и копирование ----------

let seq = 0;
const tmpName = (file) => `${file}.tmp-${process.pid}-${++seq}`;

/** Атомарная запись: сначала во временный файл, потом переименование. */
function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = tmpName(file);
  try {
    fs.writeFileSync(tmp, content, typeof content === 'string' ? 'utf8' : undefined);
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* временного файла нет */
    }
    throw e;
  }
}

/** Копия файла с проверкой: во временный файл, прочитать обратно, сравнить байты, только потом переименовать. */
function copyVerified(src, dest) {
  const bytes = fs.readFileSync(src);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = tmpName(dest);
  try {
    fs.writeFileSync(tmp, bytes);
    const back = fs.readFileSync(tmp);
    if (back.length !== bytes.length || !back.equals(bytes)) throw new Error('копия не совпала с оригиналом');
    fs.renameSync(tmp, dest);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* временного файла нет */
    }
    throw e;
  }
  return bytes.length;
}

const exists = (f) => {
  try {
    return fs.statSync(f).isFile();
  } catch {
    return false;
  }
};

const sameBytes = (a, b) => {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
};

const parsesAsJson = (f) => {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'));
    return true;
  } catch {
    return false;
  }
};

/** Имя копии на день: refrain-2026-10-11.json. */
function backupFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `refrain-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`;
}

// ---------- Переезд со старого места ----------

function markerText(from, layout, report, now) {
  return `Данные из этой папки перенесены в Refrain (бывшая «Мнема») — ${now.toISOString().slice(0, 10)}.

Новое место: ${layout.dataDir}
  (данные — файл ${NAMES.dataFile}, копии — «${NAMES.backupsDir}»; ключи ИИ и пароль облака — в «${NAMES.systemDir}» уровнем выше)

Перенесено: данные — ${report.data}${report.backups ? `, копий: ${report.backups}` : ''}${report.system.length ? `, служебных файлов: ${report.system.length}` : ''}.

ЭТИ ФАЙЛЫ НЕ УДАЛЕНЫ И НЕ ИЗМЕНЕНЫ — приложение их больше не читает и не пишет.
Когда убедитесь, что в новой папке всё на месте, эту папку можно удалить вручную.
Если вернуться на старую версию приложения, она продолжит с тех данных, что лежат здесь, — новые правки в неё не попадут.
`;
}

/**
 * Перенести данные со старого места. Ничего не удаляет и не перезаписывает: существующее на новом месте остаётся как есть.
 * Возвращает отчёт: { from, data: 'copied'|'same'|'conflict'|'missing', backups, system, errors, marked }.
 * Метку «ПЕРЕНЕСЕНО-В-Refrain.txt» ставит в старой папке только если файл данных теперь точно лежит на новом месте.
 * Если что-то не вышло, метки нет — при следующем запуске переезд повторится (уже скопированное пропускается).
 */
function migrateLegacy(layout, { now = new Date() } = {}) {
  const seen = new Set();
  for (const from of layout.legacyDirs) {
    if (seen.has(from)) continue;
    seen.add(from);
    const legacyData = path.join(from, NAMES.legacyDataFile);
    if (!exists(legacyData) || exists(path.join(from, NAMES.movedMarker))) continue;
    const report = { from, data: 'missing', backups: 0, system: [], errors: [], marked: false };
    try {
      if (!exists(layout.dataFile)) {
        copyVerified(legacyData, layout.dataFile);
        report.data = 'copied';
      } else report.data = sameBytes(legacyData, layout.dataFile) ? 'same' : 'conflict';
    } catch (e) {
      report.data = 'missing';
      report.errors.push(`данные: ${e.message}`);
    }
    // Автокопии: mnema-ГГГГ-ММ-ДД.json → Резервные копии\refrain-ГГГГ-ММ-ДД.json
    try {
      const dir = path.join(from, NAMES.legacyBackupsDir);
      const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => BACKUP_NAME.test(f)) : [];
      for (const f of names) {
        const dest = path.join(layout.backupsDir, f.replace(/^mnema-/, 'refrain-'));
        try {
          if (!exists(dest)) {
            copyVerified(path.join(dir, f), dest);
            report.backups++;
          }
        } catch (e) {
          report.errors.push(`копия ${f}: ${e.message}`);
        }
      }
    } catch (e) {
      report.errors.push(`копии: ${e.message}`);
    }
    // Служебное: ключи ИИ, пароль облака, «Local State» (ключ их шифрования) — в служебную папку, не в «Мои данные».
    for (const f of LEGACY_SYSTEM_FILES) {
      const src = path.join(from, f);
      const dest = path.join(layout.systemDir, f);
      if (src === dest || !exists(src) || exists(dest)) continue;
      try {
        copyVerified(src, dest);
        report.system.push(f);
      } catch (e) {
        report.errors.push(`${f}: ${e.message}`);
      }
    }
    const ok = (report.data === 'copied' || report.data === 'same') && !report.errors.length;
    if (ok) {
      try {
        fs.writeFileSync(path.join(from, NAMES.movedMarker), markerText(from, layout, report, now), 'utf8');
        report.marked = true;
      } catch (e) {
        report.errors.push(`метка: ${e.message}`); // старая папка только для чтения — не страшно: повторим в следующий раз
      }
    }
    report.valid = exists(layout.dataFile) ? parsesAsJson(layout.dataFile) : false;
    return report;
  }
  return null;
}

// ---------- Файл данных и автокопии ----------

function readData(layout) {
  try {
    return fs.readFileSync(layout.dataFile, 'utf8');
  } catch {
    return null;
  }
}

function writeData(layout, json) {
  writeAtomic(layout.dataFile, json);
}

/** Раз в день (при запуске) копия данных; хранятся последние `max`. Возвращает имя созданной копии или null. */
function dailyBackup(layout, { now = new Date(), max = MAX_BACKUPS } = {}) {
  const current = readData(layout);
  if (!current) return null;
  fs.mkdirSync(layout.backupsDir, { recursive: true });
  const name = backupFileName(now);
  const target = path.join(layout.backupsDir, name);
  let made = null;
  if (!fs.existsSync(target)) {
    writeAtomic(target, current);
    made = name;
  }
  const files = fs.readdirSync(layout.backupsDir).filter((f) => /^refrain-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  while (files.length > max) fs.unlinkSync(path.join(layout.backupsDir, files.shift()));
  return made;
}

/** Список копий для окна «Автокопии» (имена как на телефоне — приложение понимает оба префикса). */
function listBackups(layout) {
  if (!fs.existsSync(layout.backupsDir)) return [];
  return fs
    .readdirSync(layout.backupsDir)
    .filter((f) => BACKUP_NAME.test(f))
    .sort((a, b) => a.replace(/^[a-z]+-/, '').localeCompare(b.replace(/^[a-z]+-/, '')))
    .reverse()
    .map((f) => ({ name: f, size: fs.statSync(path.join(layout.backupsDir, f)).size }));
}

/** Прочитать копию по имени: имя проверяется, путь из окна не принимается. */
function readBackup(layout, name) {
  if (typeof name !== 'string' || !BACKUP_NAME.test(name)) return null;
  try {
    return fs.readFileSync(path.join(layout.backupsDir, name), 'utf8');
  } catch {
    return null;
  }
}

module.exports = { NAMES, BACKUP_NAME, MAX_BACKUPS, LEGACY_SYSTEM_FILES, resolveLayout, readmeText, ensureLayout, writeAtomic, copyVerified, backupFileName, migrateLegacy, readData, writeData, dailyBackup, listBackups, readBackup };
