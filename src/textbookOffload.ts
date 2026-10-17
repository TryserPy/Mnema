// Тяжёлая работа с фото учебника вне главного потока (1.32, п.7). Пока фоновый поток выпрямляет страницу,
// кодирует картинки и ищет рисунки, окно отвечает на касания и рисует анимацию без пауз. Если поток недоступен —
// WebView без OffscreenCanvas, запрет CSP, файл потока не загрузился, нехватка памяти — тот же код идёт в главном
// потоке, с паузами для кадров (как до 1.32).
import { analyzePixels, finishPart, prepareParts, rotatePixels180, tickUi, transferables, type Analysis, type Part, type PrepJob, type PreparedJob, type PreparedPixels, type PrepProgress, type PrepReply, type PrepRequest, type PrepResult, type Want } from './textbookPrep';
import type { OcrLine } from './textbookText';

let worker: Worker | null = null;
/** Поток однажды не завёлся — больше не пробуем до перезапуска (каждая попытка — лишнее ожидание). */
let broken = false;
let seq = 0;
const pending = new Map<number, { resolve: (r: PrepResult) => void; reject: (e: Error) => void; progress?: PrepProgress }>();
type Req = PrepRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never;

/** Ошибка потока; px — пиксели, которые поток вернул (если вернул). */
class WorkerError extends Error {
  constructor(message: string, readonly px?: PreparedPixels) {
    super(message);
  }
}

/** Сколько раз работа прошла в фоновом потоке и сколько — в главном (для консоли разработчика и проверок). */
export const prepStats = { worker: 0, main: 0, lastError: '' };

/** Есть ли смысл пробовать фоновый поток в этом окружении. */
export function workerPossible(): boolean {
  return !broken && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';
}

function fail(why: string) {
  broken = true;
  prepStats.lastError = why;
  worker?.terminate();
  worker = null;
  const e = new Error(why);
  for (const p of pending.values()) p.reject(e);
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  // Поток — отдельный файл рядом с приложением (worker-src 'self'); в Electron — тот же file:// что и окно.
  const w = new Worker(new URL('./textbookWorker.ts', import.meta.url), { type: 'module', name: 'refrain-textbook' });
  w.onmessage = (e: MessageEvent<PrepReply>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === 'progress') return p.progress?.(m.text, m.frac);
    pending.delete(m.id);
    if (m.type === 'done') p.resolve(m.result);
    else p.reject(new WorkerError(m.message, m.px));
  };
  // Файл потока не загрузился или поток упал целиком (CSP, file://, нет памяти) — дальше без него.
  w.onerror = (e) => {
    e.preventDefault?.();
    fail('worker: ' + (e.message || 'не запустился'));
  };
  w.onmessageerror = () => fail('worker: сообщение не прочиталось');
  worker = w;
  return w;
}

function call(msg: Req, transfer: Transferable[], onProgress?: PrepProgress): Promise<PrepResult> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, progress: onProgress });
    try {
      getWorker().postMessage({ ...msg, id } as PrepRequest, transfer);
    } catch (e) {
      pending.delete(id);
      fail('worker: ' + (e as Error).message);
      reject(e as Error);
    }
  });
}

const mainCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/**
 * Сначала в потоке; любая его неудача — в главном потоке (ошибка самого фото повторится и там — её увидит ученик).
 * own — пиксели, отданные потоку: если поток их вернул, кладём обратно; если поток упал вместе с ними — доделать нечем.
 */
async function either<T>(inWorker: () => Promise<T>, onMain: () => Promise<T>, own?: PreparedPixels): Promise<T> {
  if (workerPossible()) {
    try {
      const r = await inWorker();
      prepStats.worker++;
      return r;
    } catch (e) {
      prepStats.lastError = (e as Error).message;
      if (own) {
        const back = (e as WorkerError).px;
        if (back) Object.assign(own, { rgba: back.rgba, gray: back.gray });
        else if (own.rgba.byteLength === 0) throw new Error('Не хватило памяти, чтобы разобрать фото. Закрой другие приложения и попробуй ещё раз.');
      }
    }
  }
  prepStats.main++;
  return onMain();
}

/** Подготовить фото: страница(ы), готовые к чтению. */
export function prepareOffThread(job: PrepJob, onProgress?: PrepProgress): Promise<PreparedJob> {
  return either(
    () => call({ op: 'prepare', job }, [], onProgress) as Promise<PreparedJob>,
    () => prepareParts(job, mainCanvas, onProgress, tickUi)
  );
}

/**
 * Страница вверх ногами. Пиксели уходят в поток (без копирования) — после вызова старые массивы px пусты,
 * пользоваться надо результатом.
 */
export function rotateOffThread(px: PreparedPixels, want: Want): Promise<Part> {
  const own = { rgba: px.rgba, gray: px.gray, info: px.info };
  return either(
    () => call({ op: 'rotate180', px: own, want }, transferables(own)) as Promise<Part>,
    () => finishPart(rotatePixels180(own), want, mainCanvas, false),
    own
  );
}

/**
 * Анализ после распознавания. Пиксели уходят в поток и возвращаются (px в ответе) — их нужно положить обратно
 * в страницу: в px после вызова массивы пусты.
 */
export function analyzeOffThread(px: PreparedPixels, lines: OcrLine[]): Promise<Analysis & { px: PreparedPixels }> {
  const own = { rgba: px.rgba, gray: px.gray, info: px.info };
  return either(
    () => call({ op: 'analyze', px: own, lines }, transferables(own)) as Promise<Analysis & { px: PreparedPixels }>,
    async () => ({ ...analyzePixels(own, lines), px: own }),
    own
  );
}
