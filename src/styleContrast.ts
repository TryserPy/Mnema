// Проверка читаемости стиля: хватает ли контраста между текстом и фоном в светлой и тёмной теме — и автоисправление.
// Нужна и редактору (показать «слабый контраст»), и стилям от ИИ: модель легко нарисует серый текст на сером фоне.
// Чистые функции — их проверяют тесты (v130-styles.test.ts).
import { accentText, contrast, fixTextColor, onAccent, parseColor, toHex, type RGB } from './color';
import { safeColor } from './safeCss';
import { setVar, type Mode } from './styleBuilder';
import { presetFor, PALETTE_VARS, type Palette } from './themes';
import type { Look, Mod } from './types';

/** Цвета, которые не входят в палитру темы: значения по умолчанию из styles.css (тест следит, чтобы списки не разошлись). */
export const BASE_COLORS: Record<Mode, Record<string, string>> = {
  light: {
    '--tip-bg': '#FFF7E6', '--tip-line': '#F0DDB5', '--tip-ink': '#6E4A10',
    '--again-bg': '#FBE9E7', '--again-ink': '#A3302A', '--hard-bg': '#FBF0DC', '--hard-ink': '#7A4F0E',
    '--good-bg': '#E3F3EA', '--good-ink': '#1F6B43', '--easy-bg': '#E4ECFB', '--easy-ink': '#2A5BB8', '--mark': '#FCEFB4'
  },
  dark: {
    '--tip-bg': '#2E2718', '--tip-line': '#4D4024', '--tip-ink': '#F0D9A8',
    '--again-bg': '#3A2224', '--again-ink': '#F2A09A', '--hard-bg': '#3A3020', '--hard-ink': '#EFCB8A',
    '--good-bg': '#1F3529', '--good-ink': '#8FD6AE', '--easy-bg': '#1F2A45', '--easy-ink': '#9DBAF2', '--mark': '#5A4B12'
  }
};

/** Что с чем сравнивается: цвет текста, фоны под ним, нужный контраст (4,5 — норма для обычного текста). */
const PAIRS: { text: string; bgs: string[]; min: number }[] = [
  { text: '--ink', bgs: ['--bg', '--surface', '--side', '--sunken'], min: 4.5 },
  { text: '--ink-2', bgs: ['--bg', '--surface'], min: 4.5 },
  { text: '--muted', bgs: ['--bg', '--surface'], min: 4.5 },
  { text: '--tip-ink', bgs: ['--tip-bg'], min: 4.5 },
  { text: '--again-ink', bgs: ['--again-bg'], min: 4.5 },
  { text: '--hard-ink', bgs: ['--hard-bg'], min: 4.5 },
  { text: '--good-ink', bgs: ['--good-bg'], min: 4.5 },
  { text: '--easy-ink', bgs: ['--easy-bg'], min: 4.5 }
];

export interface BaseAppearance {
  look: Look;
  accent: string;
}

/** Итоговые цвета в теме `mode`: цвета выбранной темы, свои цвета ученика, потом переменные стиля. */
export function effectiveColors(m: Mod, mode: Mode, base: BaseAppearance): Record<string, RGB> {
  const look: Look = { ...base.look, ...(m.look ?? {}), custom: base.look.custom };
  const preset = presetFor(look, mode === 'dark');
  const raw: Record<string, string> = { ...BASE_COLORS[mode] };
  for (const k of Object.keys(PALETTE_VARS) as (keyof Palette)[]) raw[PALETTE_VARS[k]] = safeColor(look.custom?.[mode]?.[k]) ?? preset.p[k];
  raw['--accent'] = m.accent ?? base.accent;
  Object.assign(raw, m.vars?.[mode] ?? {});
  const out: Record<string, RGB> = {};
  for (const [k, v] of Object.entries(raw)) {
    const c = parseColor(v);
    if (c) out[k] = c;
  }
  return out;
}

export interface ContrastRow {
  mode: Mode;
  text: string;
  bg: string;
  ratio: number;
  min: number;
  ok: boolean;
}

/** Все проверенные пары (и хорошие, и плохие) в обеих темах. */
export function contrastReport(m: Mod, base: BaseAppearance): ContrastRow[] {
  const rows: ContrastRow[] = [];
  for (const mode of ['light', 'dark'] as const) {
    const c = effectiveColors(m, mode, base);
    for (const p of PAIRS) {
      const fg = c[p.text];
      if (!fg) continue;
      for (const bgName of p.bgs) {
        const bg = c[bgName];
        if (!bg) continue;
        const ratio = Math.round(contrast(fg, bg) * 10) / 10;
        rows.push({ mode, text: p.text, bg: bgName, ratio, min: p.min, ok: ratio >= p.min });
      }
    }
    // Главный цвет: текст на нём и он сам как текст.
    const acc = c['--accent'];
    if (acc) {
      const on = c['--on-accent'] ?? parseColor(onAccent(toHex(acc)))!;
      rows.push({ mode, text: '--on-accent', bg: '--accent', ratio: Math.round(contrast(on, acc) * 10) / 10, min: 4.5, ok: contrast(on, acc) >= 4.5 });
      const at = c['--accent-text'] ?? parseColor(accentText(toHex(acc), toHex(c['--surface'] ?? [255, 255, 255])))!;
      rows.push({ mode, text: '--accent-text', bg: '--surface', ratio: Math.round(contrast(at, c['--surface'] ?? [255, 255, 255]) * 10) / 10, min: 4.5, ok: contrast(at, c['--surface'] ?? [255, 255, 255]) >= 4.5 });
    }
  }
  return rows;
}

export interface Fix {
  mode: Mode;
  name: string;
  from: string;
  to: string;
  ratio: number;
}

/** Исправить слабый контраст: передвигаем цвет ТЕКСТА (фон — выбор автора). Возвращает новый стиль и список правок. */
export function fixContrast(m: Mod, base: BaseAppearance): { mod: Mod; fixes: Fix[] } {
  let out = m;
  const fixes: Fix[] = [];
  for (const mode of ['light', 'dark'] as const) {
    // Сначала главный цвет: от него зависят цвет текста на нём и «главный цвет как текст».
    const c0 = effectiveColors(out, mode, base);
    const acc = c0['--accent'];
    const setsAccent = out.vars?.[mode]?.['--accent'] !== undefined;
    const surface = c0['--surface'] ?? ([255, 255, 255] as RGB);
    if (acc && (setsAccent || out.vars?.[mode]?.['--surface'] !== undefined || out.vars?.[mode]?.['--bg'] !== undefined)) {
      const hex = toHex(acc);
      const at = accentText(hex, toHex(surface));
      if (at.toUpperCase() !== hex.toUpperCase() && out.vars?.[mode]?.['--accent-text'] === undefined) {
        out = setVar(out, mode, '--accent-text', at);
        fixes.push({ mode, name: '--accent-text', from: hex, to: at, ratio: Math.round(contrast(parseColor(at)!, surface) * 10) / 10 });
      }
      if (setsAccent && out.vars?.[mode]?.['--on-accent'] === undefined) out = setVar(out, mode, '--on-accent', onAccent(hex));
    }
    const c = effectiveColors(out, mode, base);
    for (const p of PAIRS) {
      const fg = c[p.text];
      if (!fg) continue;
      let cur = fg;
      for (const bgName of p.bgs) {
        const bg = c[bgName];
        if (bg && contrast(cur, bg) < p.min) cur = fixTextColor(cur, bg, p.min);
      }
      if (cur !== fg) {
        // Проверяем, что исправленный цвет читается на всех фонах (иначе берём белый или чёрный — что лучше для самого трудного фона).
        const worst = p.bgs.map((b) => c[b]).filter((x): x is RGB => Boolean(x));
        const ok = worst.every((b) => contrast(cur, b) >= p.min);
        if (!ok) {
          const white: RGB = [255, 255, 255];
          const dark: RGB = [16, 19, 28];
          cur = Math.min(...worst.map((b) => contrast(white, b))) >= Math.min(...worst.map((b) => contrast(dark, b))) ? white : dark;
        }
        const to = toHex(cur);
        out = setVar(out, mode, p.text, to);
        fixes.push({ mode, name: p.text, from: toHex(fg), to, ratio: Math.round(Math.min(...worst.map((b) => contrast(cur, b))) * 10) / 10 });
      }
    }
  }
  return { mod: out, fixes };
}
