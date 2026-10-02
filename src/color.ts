// Цвета и контраст. Нужны, чтобы любая тема и любой акцент оставались читаемыми:
// белый текст на светлом акценте тёмных тем давал контраст 2,2–3,5:1 (норма 4,5), а тёмный акцент как цвет ссылок на тёмной теме был почти невидим.

export type RGB = [number, number, number];

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Относительная яркость по WCAG. */
export function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Контраст двух цветов (1…21). */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE: RGB = [255, 255, 255];
const DARK: RGB = [16, 19, 28];

/** Цвет текста на заливке акцентом: белый или тёмный — тот, что читается лучше. */
export function onAccent(accent: string): string {
  const a = parseHex(accent);
  if (!a) return '#FFFFFF';
  return contrast(a, WHITE) >= contrast(a, DARK) ? '#FFFFFF' : toHex(DARK);
}

function toHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Акцент как цвет ТЕКСТА (ссылки, значки, подчёркивание) на фоне `bg`: если читается — как есть, иначе сдвигаем яркость
 *  (на тёмном фоне светлее, на светлом темнее), сохраняя оттенок, пока контраст не станет ≥ min. */
export function accentText(accent: string, bg: string, min = 4.5): string {
  const a = parseHex(accent);
  const b = parseHex(bg);
  if (!a || !b) return accent;
  if (contrast(a, b) >= min) return accent;
  const [h, s, l0] = toHsl(a);
  const darkBg = luminance(b) < 0.5;
  for (let i = 1; i <= 100; i++) {
    const l = darkBg ? Math.min(1, l0 + i * 0.01) : Math.max(0, l0 - i * 0.01);
    const hex = toHex(fromHsl(h, s, l));
    // Проверяем уже округлённый цвет: после перевода в #RRGGBB контраст может чуть упасть.
    if (contrast(parseHex(hex)!, b) >= min) return hex;
    if (l === 0 || l === 1) break;
  }
  return darkBg ? '#FFFFFF' : toHex(DARK);
}
