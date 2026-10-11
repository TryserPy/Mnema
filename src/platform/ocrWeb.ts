// Распознавание страниц прямо в окне (Android и веб): Tesseract в фоновом потоке, файлы лежат рядом с приложением (ocr/).
import type { Worker } from 'tesseract.js';
import { OCR_PARAMS, shapeOcr } from '../../shared/ocrShape.mjs';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    const dir = new URL('ocr', document.baseURI).href.replace(/\/?$/, '/');
    const w = await createWorker(['rus', 'eng'], 1, { workerPath: dir + 'worker.min.js', corePath: dir.slice(0, -1), langPath: dir.slice(0, -1), gzip: true, workerBlobURL: false, cacheMethod: 'none' });
    await w.setParameters(OCR_PARAMS);
    return w;
  })().catch((e) => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

export async function recognize(bytes: Uint8Array): Promise<{ ok: true; lines: unknown[] } | { ok: false; error: string }> {
  try {
    const w = await getWorker();
    const r = await w.recognize(new Blob([bytes as BlobPart], { type: 'image/png' }), {}, { blocks: true, text: false });
    return { ok: true, lines: shapeOcr(r.data) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || String(e) };
  }
}
