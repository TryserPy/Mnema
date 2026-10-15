// «Из тетради → Фото» в окне: снимок или скан PDF → страницы (разворот делится на две), светлая клетка убирается,
// длинная сторона — не больше 1600 px, JPEG для ИИ. Чистая часть (где резать, что белить) — в notebook.ts.
import type { PdfImage } from './fileImportPdf';
import { isSpreadShape, spreadCuts, whitenPaper, type Cut } from './notebook';
import { fitSide, REFRAIN_SIDE } from './refrain';

export interface PagePhoto {
  /** JPEG base64 без «data:» — то, что уходит ИИ. */
  data: string;
  mime: 'image/jpeg';
  /** Для показа рядом с текстом. */
  url: string;
}

async function bitmapOf(src: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(src);
  } catch {
    throw new Error('Не получилось открыть фото. Подойдут JPEG, PNG или WebP.');
  }
}

function render(src: CanvasImageSource, cut: Cut, whiten: boolean): PagePhoto {
  const size = fitSide(cut.w, cut.h, REFRAIN_SIDE);
  const c = document.createElement('canvas');
  c.width = size.w;
  c.height = size.h;
  const ctx = c.getContext('2d', { willReadFrequently: whiten })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.drawImage(src, cut.x, cut.y, cut.w, cut.h, 0, 0, size.w, size.h);
  if (whiten) {
    const img = ctx.getImageData(0, 0, size.w, size.h);
    whitenPaper(img.data);
    ctx.putImageData(img, 0, 0);
  }
  const url = c.toDataURL('image/jpeg', 0.85);
  return { mime: 'image/jpeg', data: url.slice(url.indexOf(',') + 1), url };
}

/** Снимок → одна или две страницы. split: 'auto' — делить, если снимок похож на разворот. */
export async function photoPages(file: Blob, o: { split: 'auto' | 'yes' | 'no'; whiten: boolean }): Promise<PagePhoto[]> {
  const bmp = await bitmapOf(file);
  try {
    const { width: w, height: h } = bmp;
    const split = o.split === 'yes' || (o.split === 'auto' && isSpreadShape(w, h));
    const cuts: Cut[] = split ? spreadCuts(w, h, null) : [{ x: 0, y: 0, w, h }];
    return cuts.map((c) => render(bmp, c, o.whiten));
  } finally {
    bmp.close?.();
  }
}

/** Картинка страницы из PDF-скана → Blob, который понимает photoPages. */
export async function pdfImageBlob(img: PdfImage): Promise<Blob> {
  if (img.kind === 'jpeg') return new Blob([img.bytes as BlobPart], { type: 'image/jpeg' });
  const c = document.createElement('canvas');
  c.width = img.w;
  c.height = img.h;
  const ctx = c.getContext('2d')!;
  const out = ctx.createImageData(img.w, img.h);
  for (let i = 0, j = 0; i < img.w * img.h; i++, j += img.comps) {
    const r = img.data[j] ?? 255;
    out.data[i * 4] = r;
    out.data[i * 4 + 1] = img.comps === 3 ? (img.data[j + 1] ?? 255) : r;
    out.data[i * 4 + 2] = img.comps === 3 ? (img.data[j + 2] ?? 255) : r;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Не получилось прочитать скан.'))), 'image/png'));
}
