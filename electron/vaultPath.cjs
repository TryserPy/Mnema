// Пути внутри папки Obsidian: чтение и запись только внутри выбранной папки, в том числе когда внутри лежат символические ссылки.
// Без Electron — чтобы проверять тестами. Прежняя проверка сравнивала только текст пути (startsWith), а ссылка «заметка.md → файл вне папки» её проходила.
const fs = require('fs');
const path = require('path');

const real = (p) => fs.realpathSync.native(p);

/** p — это base или лежит внутри base (оба пути уже «настоящие»). */
function within(base, p) {
  return p === base || p.startsWith(base.endsWith(path.sep) ? base : base + path.sep);
}

/** Настоящий путь самого близкого существующего звена пути (для файла, которого ещё нет — его папки). null — ни одного. */
function nearestReal(p) {
  let cur = p;
  for (;;) {
    try {
      return real(cur);
    } catch (e) {
      if (!e || (e.code !== 'ENOENT' && e.code !== 'ENOTDIR')) throw e;
    }
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
}

/**
 * Полный путь для rel внутри root. Бросает «Недопустимый путь», если: rel выходит из папки (.., абсолютный путь, диск),
 * сам файл или любая его папка — символическая ссылка, ведущая за пределы root. Файла может ещё не быть (запись).
 */
function resolveInside(root, rel) {
  const realRoot = real(root);
  const full = path.resolve(realRoot, String(rel));
  if (full === realRoot || !within(realRoot, full)) throw new Error('Недопустимый путь');
  const anc = nearestReal(full);
  if (!anc || !within(realRoot, anc)) throw new Error('Недопустимый путь');
  return full;
}

/** Настоящий файл (не ссылка наружу) внутри root: для чтения картинки, найденной при просмотре папки. */
function isRealInside(root, file) {
  try {
    return within(real(root), real(file));
  } catch {
    return false;
  }
}

/**
 * Папка «Refrain» внутри выбранной для экспорта: создаётся, если нет. Если «Refrain» там уже есть, но это ссылка на что-то вне выбранной папки — ошибка.
 * Возвращает путь к папке (настоящий).
 */
function exportRoot(chosen) {
  const realChosen = real(chosen);
  const root = path.join(realChosen, 'Refrain');
  fs.mkdirSync(root, { recursive: true });
  const realRoot = real(root);
  if (!within(realChosen, realRoot) || realRoot === realChosen) throw new Error('Недопустимый путь');
  return realRoot;
}

module.exports = { within, resolveInside, isRealInside, exportRoot };
