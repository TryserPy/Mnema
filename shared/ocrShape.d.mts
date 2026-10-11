export const OCR_PARAMS: Record<string, string>;
export interface OcrWordRaw {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  conf: number;
  sub?: number[];
  sup?: number[];
}
export interface OcrLineRaw {
  bbox: { x0: number; y0: number; x1: number; y1: number };
  para: number;
  block: number;
  btype?: number;
  base?: number[];
  words: OcrWordRaw[];
}
export function shapeOcr(data: unknown): OcrLineRaw[];
