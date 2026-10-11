// Распознавание страниц без интернета: Tesseract (русский + английский) в главном процессе.
// Возвращает строки со словами и рамками; жирный, рисунки и разметку достраивает интерфейс.
// Настройки и разбор ответа — в shared/ocrShape.mjs (те же, что на Android и в браузере).
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let workerPromise = null;
let idleTimer = null;
let shapePromise = null;

function dataDir() {
  const packed = path.join(process.resourcesPath || '', 'ocr-data');
  if (app.isPackaged && fs.existsSync(packed)) return packed;
  return path.join(__dirname, '..', 'ocr-data');
}

function shape() {
  shapePromise ??= import(pathToFileURL(path.join(__dirname, '..', 'shared', 'ocrShape.mjs')).href);
  return shapePromise;
}

function getWorker() {
  if (!workerPromise) {
    const { createWorker } = require('tesseract.js');
    const cache = path.join(app.getPath('userData'), 'ocr-cache');
    fs.mkdirSync(cache, { recursive: true });
    workerPromise = (async () => {
      const w = await createWorker(['rus', 'eng'], 1, { langPath: dataDir(), cachePath: cache, gzip: true, logger: () => {} });
      await w.setParameters((await shape()).OCR_PARAMS);
      return w;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  clearTimeout(idleTimer);
  // Освобождаем память, если долго не пользуются.
  idleTimer = setTimeout(async () => {
    const w = workerPromise;
    workerPromise = null;
    if (w) (await w).terminate().catch(() => {});
  }, 120000);
  return workerPromise;
}

function register() {
  ipcMain.handle('ocr:recognize', async (_e, bytes) => {
    try {
      if (!(bytes instanceof Uint8Array) || bytes.length > 40 * 1024 * 1024) return { ok: false, error: 'Слишком большой файл' };
      const worker = await getWorker();
      const r = await worker.recognize(Buffer.from(bytes), {}, { blocks: true, text: false });
      return { ok: true, lines: (await shape()).shapeOcr(r.data) };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });
}

module.exports = { register };
