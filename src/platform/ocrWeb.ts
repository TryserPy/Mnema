// Распознавание страниц прямо в окне (Android и веб): Tesseract в фоновом потоке, файлы лежат рядом с приложением (ocr/).
import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    const dir = new URL('ocr', document.baseURI).href.replace(/\/?$/, '/');
    return createWorker(['rus', 'eng'], 1, { workerPath: dir + 'worker.min.js', corePath: dir.slice(0, -1), langPath: dir.slice(0, -1), gzip: true, workerBlobURL: false, cacheMethod: 'none' });
  })().catch((e) => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

export async function recognize(bytes: Uint8Array): Promise<{ ok: true; lines: unknown[] } | { ok: false; error: string }> {
  try {
    const w = await getWorker();
    const r = await w.recognize(new Blob([bytes as BlobPart], { type: 'image/jpeg' }), {}, { blocks: true, text: false });
    const lines: unknown[] = [];
    let para = 0;
    for (const b of r.data.blocks ?? [])
      for (const p of b.paragraphs ?? []) {
        for (const l of p.lines ?? []) lines.push({ bbox: l.bbox, para, words: (l.words ?? []).map((wd) => ({ text: wd.text, bbox: wd.bbox, conf: Math.round(wd.confidence) })) });
        para++;
      }
    return { ok: true, lines };
  } catch (e) {
    return { ok: false, error: (e as Error).message || String(e) };
  }
}
