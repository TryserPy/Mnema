// Распознавание страниц: общие настройки Tesseract и разбор его ответа — одни и те же
// для Windows (главный процесс Electron) и для Android/браузера (окно приложения).

/**
 * Режим 3 — Tesseract сам находит колонки, рисунки и порядок блоков (в одном-единственном блоке,
 * как по умолчанию, колонки склеиваются в кашу). Пробелы между словами сохраняем — по ним видны отступы.
 */
export const OCR_PARAMS = { tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' };

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

/**
 * Ответ Tesseract → плоский список строк со словами.
 * Строка: { bbox, para, block, btype, base: [x0, y0, x1, y1], words: [{ text, bbox, conf, sub?: number[], sup?: number[] }] }
 * block — номер блока в порядке Tesseract, btype — тип блока (1 текст, 2 заголовок, 8 подпись, 6 таблица, 9–11 рисунок).
 * sub/sup — номера знаков слова, набранных ниже/выше строки (нижние индексы t₁, степени x²).
 */
export function shapeOcr(data) {
  const lines = [];
  let para = 0;
  let block = 0;
  for (const b of data?.blocks ?? []) {
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        const base = l.baseline ? [l.baseline.x0, l.baseline.y0, l.baseline.x1, l.baseline.y1] : undefined;
        const lineWords = l.words ?? [];
        const symH = median(lineWords.flatMap((w) => (w.symbols ?? []).filter((s) => /[\p{L}\p{N}]/u.test(s.text)).map((s) => s.bbox.y1 - s.bbox.y0)));
        const words = lineWords.map((w) => {
          const out = { text: w.text, bbox: w.bbox, conf: Math.round(w.confidence) };
          const syms = w.symbols ?? [];
          if (base && symH && syms.length === [...w.text].length && syms.length > 1) {
            const sub = [];
            const sup = [];
            const mid = (s) => (s.bbox.y0 + s.bbox.y1) / 2;
            const bAt = (s) => base[1] + ((base[3] - base[1]) * ((s.bbox.x0 + s.bbox.x1) / 2 - base[0])) / Math.max(1, base[2] - base[0]);
            syms.forEach((s, i) => {
              const h = s.bbox.y1 - s.bbox.y0;
              if (i === 0 || !/[\p{L}\p{N}]/u.test(s.text)) return;
              if (h < symH * 0.78 && s.bbox.y1 > bAt(s) + symH * 0.12) sub.push(i);
              else if (h < symH * 0.78 && mid(s) < bAt(s) - symH * 0.55) sup.push(i);
            });
            if (sub.length) out.sub = sub;
            if (sup.length) out.sup = sup;
          }
          return out;
        });
        lines.push({ bbox: l.bbox, para, block, btype: b.blocktype, base, words });
      }
      para++;
    }
    block++;
  }
  return lines;
}
