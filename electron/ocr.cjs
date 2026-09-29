// Распознавание страниц без интернета: Tesseract (русский + английский) в главном процессе.
// Возвращает строки со словами и рамками; жирный, рисунки и разметку достраивает интерфейс.
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let workerPromise = null;
let idleTimer = null;

function dataDir() {
  const packed = path.join(process.resourcesPath || '', 'ocr-data');
  if (app.isPackaged && fs.existsSync(packed)) return packed;
  return path.join(__dirname, '..', 'ocr-data');
}

function getWorker() {
  if (!workerPromise) {
    const { createWorker } = require('tesseract.js');
    const cache = path.join(app.getPath('userData'), 'ocr-cache');
    fs.mkdirSync(cache, { recursive: true });
    workerPromise = createWorker(['rus', 'eng'], 1, { langPath: dataDir(), cachePath: cache, gzip: true, logger: () => {} }).catch((e) => {
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
      if (!(bytes instanceof Uint8Array) || bytes.length > 25 * 1024 * 1024) return { ok: false, error: 'Слишком большой файл' };
      const worker = await getWorker();
      const r = await worker.recognize(Buffer.from(bytes), {}, { blocks: true, text: false });
      const lines = [];
      let para = 0;
      for (const b of r.data.blocks || [])
        for (const p of b.paragraphs || []) {
          for (const l of p.lines || [])
            lines.push({ bbox: l.bbox, para, words: (l.words || []).map((w) => ({ text: w.text, bbox: w.bbox, conf: Math.round(w.confidence) })) });
          para++;
        }
      return { ok: true, lines };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });
}

module.exports = { register };
