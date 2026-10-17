// Фоновый поток для фото учебника (1.32, п.7): выпрямление, свет, наклон, разворот, PNG/JPEG, а после
// распознавания — жирный шрифт, рисунки и рамки. Холсты — OffscreenCanvas; пиксели ходят туда и обратно без копирования.
import { analyzePixels, finishPart, prepareParts, rotatePixels180, transferables, type PrepReply, type PrepRequest, type PrepResult } from './textbookPrep';

const scope = self as unknown as { onmessage: ((e: MessageEvent<PrepRequest>) => void) | null; postMessage: (m: PrepReply, t?: Transferable[]) => void };
const mk = (w: number, h: number) => new OffscreenCanvas(w, h);
const noPause = async () => undefined;

async function run(m: PrepRequest): Promise<[PrepResult, Transferable[]]> {
  if (m.op === 'prepare') {
    const r = await prepareParts(m.job, mk, (text, frac) => scope.postMessage({ id: m.id, type: 'progress', text, frac }), noPause, true);
    return [r, transferables(r.whole, ...r.parts)];
  }
  if (m.op === 'rotate180') {
    const r = await finishPart(rotatePixels180(m.px), m.want, mk, true);
    return [r, transferables(r)];
  }
  const a = analyzePixels(m.px, m.lines);
  return [{ ...a, px: m.px }, transferables(m.px)];
}

scope.onmessage = (e) => {
  const m = e.data;
  run(m).then(
    ([result, transfer]) => scope.postMessage({ id: m.id, type: 'done', result }, transfer),
    (err: unknown) => {
      const px = m.op === 'prepare' || m.px.rgba.byteLength === 0 ? undefined : m.px;
      scope.postMessage({ id: m.id, type: 'error', message: err instanceof Error ? `${err.name}: ${err.message}` : String(err), px }, px ? transferables(px) : []);
    }
  );
};
