// Распознавание страниц прямо в окне (Android): Tesseract в фоновом потоке, файлы — внутри приложения (/ocr/).
import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    return createWorker(['rus', 'eng'], 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', gzip: true, workerBlobURL: false, cacheMethod: 'none' });
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
