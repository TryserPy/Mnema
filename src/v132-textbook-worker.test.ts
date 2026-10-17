// 1.32, п.7: разбор фото в фоновом потоке — передача буферов без копий и запасной путь в главном потоке,
// если поток не завёлся или вернул ошибку (пиксели должны вернуться в страницу).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzePixels, transferables, type PreparedPixels } from './textbookPrep';
import type { OcrLine } from './textbookText';

function page(w = 120, h = 80): PreparedPixels {
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  const d = new Uint8ClampedArray(w * h).fill(255);
  // «слово» — тёмный прямоугольник
  for (let y = 20; y < 32; y++)
    for (let x = 10; x < 60; x++) {
      d[y * w + x] = 20;
      rgba.fill(20, (y * w + x) * 4, (y * w + x) * 4 + 3);
    }
  return { rgba, gray: { w, h, d }, info: { quad: false, skew: 0, scale: 1, glyph: 10, noise: 0, w, h } };
}
const lines: OcrLine[] = [{ bbox: { x0: 10, y0: 20, x1: 60, y1: 32 }, para: 0, words: [{ text: 'клетка', conf: 90, bbox: { x0: 10, y0: 20, x1: 60, y1: 32 } }] }];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('передача пикселей в поток', () => {
  it('каждый буфер — один раз, даже если серая общая у целой страницы и её части', () => {
    const p = page();
    const list = transferables({ gray: p.gray }, p, { ...p, ocrPng: new Uint8Array(4) });
    expect(list).toHaveLength(3);
    expect(new Set(list).size).toBe(3);
  });
});

describe('запасной путь в главном потоке', () => {
  it('нет Worker/OffscreenCanvas — анализ идёт в окне, результат тот же', async () => {
    const { analyzeOffThread, prepStats } = await import('./textbookOffload');
    const p = page();
    const want = analyzePixels(page(), structuredClone(lines));
    const r = await analyzeOffThread(p, structuredClone(lines));
    expect(r.sharp).toBe(want.sharp);
    expect(r.cover).toBe(want.cover);
    expect(r.regions).toEqual(want.regions);
    expect(prepStats.main).toBe(1);
    expect(prepStats.worker).toBe(0);
  });

  it('поток не запустился — переходим в окно и больше его не пробуем', async () => {
    let made = 0;
    class BadWorker {
      onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
      constructor() {
        made++;
        throw new Error('SecurityError: worker-src');
      }
    }
    vi.stubGlobal('Worker', BadWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal('createImageBitmap', () => undefined);
    const { analyzeOffThread, prepStats, workerPossible } = await import('./textbookOffload');
    const r = await analyzeOffThread(page(), structuredClone(lines));
    expect(r.px.rgba.byteLength).toBeGreaterThan(0);
    expect(prepStats.main).toBe(1);
    expect(workerPossible()).toBe(false);
    await analyzeOffThread(page(), structuredClone(lines));
    expect(made).toBe(1);
  });

  it('поток вернул ошибку вместе с пикселями — окно доделывает работу по ним', async () => {
    class EchoWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      postMessage(m: { id: number; px: PreparedPixels }) {
        // Как настоящий поток: пиксели «переданы» — у отправителя пусто, в ответе с ошибкой — вернулись.
        const back = { rgba: m.px.rgba.slice(), gray: { ...m.px.gray, d: m.px.gray.d.slice() }, info: m.px.info };
        (m.px as { rgba: Uint8ClampedArray }).rgba = new Uint8ClampedArray(0);
        queueMicrotask(() => this.onmessage?.({ data: { id: m.id, type: 'error', message: 'RangeError: память', px: back } }));
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', EchoWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal('createImageBitmap', () => undefined);
    const { analyzeOffThread, prepStats } = await import('./textbookOffload');
    const r = await analyzeOffThread(page(), structuredClone(lines));
    expect(r.px.rgba.byteLength).toBe(120 * 80 * 4);
    expect(r.regions).toEqual(analyzePixels(page(), structuredClone(lines)).regions);
    expect(prepStats.main).toBe(1);
  });
});
