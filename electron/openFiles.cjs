// Открытие файлов Refrain (.mnema, .refrainstyle, .mnemamod) двойным щелчком или командой «refrain файл»:
// путь приходит в аргументах запуска (первый запуск) или во втором запуске (second-instance).
// Файл читаем здесь и отдаём окну текстом — окно само решает, что с ним делать.
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const EXTS = new Set(['.mnema', '.refrainstyle', '.mnemamod']);
const MAX_BYTES = 20 * 1024 * 1024;

/** Пути к файлам Refrain из аргументов запуска. Файловые менеджеры передают то путь, то file:///… */
function filesFromArgv(argv, cwd) {
  const out = [];
  for (const raw of Array.isArray(argv) ? argv.slice(1) : []) {
    if (typeof raw !== 'string' || !raw || raw.startsWith('-')) continue;
    let p = raw;
    if (/^file:\/\//i.test(raw)) {
      try {
        p = fileURLToPath(raw);
      } catch {
        continue;
      }
    }
    if (!EXTS.has(path.extname(p).toLowerCase())) continue;
    const abs = path.resolve(cwd || process.cwd(), p);
    if (!out.includes(abs)) out.push(abs);
  }
  return out.slice(0, 10);
}

let getWin = () => null;
let ready = false; // окно подписалось на файлы
const pending = [];

function send(file) {
  const w = getWin();
  if (!w || w.isDestroyed()) return false;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_BYTES) return true;
    w.webContents.send('file:open', { name: path.basename(file), text: fs.readFileSync(file, 'utf8') });
  } catch {
    /* файл пропал или не читается — пропускаем */
  }
  return true;
}

function flush() {
  while (pending.length && ready) {
    if (!send(pending[0])) break;
    pending.shift();
  }
}

function showWindow() {
  const w = getWin();
  if (!w || w.isDestroyed()) return;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
}

/** Аргументы запуска или второго запуска: файлы — окну (или в очередь, пока оно не готово). */
function handleArgv(argv, cwd) {
  const files = filesFromArgv(argv, cwd);
  if (!files.length) return false;
  pending.push(...files);
  if (ready) {
    flush();
    showWindow();
  }
  return true;
}

function register(winGetter) {
  getWin = winGetter;
  const { ipcMain } = require('electron'); // здесь, а не вверху: чистые функции файла проверяются тестами без Electron
  ipcMain.on('openfile:ready', () => {
    ready = true;
    flush();
  });
}

module.exports = { register, handleArgv, filesFromArgv, EXTS, MAX_BYTES };
