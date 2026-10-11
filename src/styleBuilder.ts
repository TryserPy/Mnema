// Конструктор стиля без кода: выбор раскладки, плотности, скруглений, шрифтов и цветов превращается в атрибуты и переменные стиля.
// Чистые функции над стилем (Mod) — их проверяют тесты, а редактор (StyleEditor.tsx) только показывает кнопки.
import { accentText, onAccent, parseHex, toHex } from './color';
import type { Mod } from './types';

export type Mode = 'light' | 'dark';

/** Положить или убрать атрибут оформления. */
export function setAttr(m: Mod, name: string, value: string | undefined): Mod {
  const attrs = { ...(m.attrs ?? {}) };
  if (value === undefined) delete attrs[name];
  else attrs[name] = value;
  const { attrs: _a, ...rest } = m;
  return Object.keys(attrs).length ? { ...rest, attrs } : rest;
}

/** Положить или убрать переменную (в светлой или тёмной теме). */
export function setVar(m: Mod, mode: Mode, name: string, value: string | undefined): Mod {
  const vars = { light: { ...(m.vars?.light ?? {}) }, dark: { ...(m.vars?.dark ?? {}) } };
  if (value === undefined) delete vars[mode][name];
  else vars[mode][name] = value;
  const out: NonNullable<Mod['vars']> = {};
  if (Object.keys(vars.light).length) out.light = vars.light;
  if (Object.keys(vars.dark).length) out.dark = vars.dark;
  const { vars: _v, ...rest } = m;
  return Object.keys(out).length ? { ...rest, vars: out } : rest;
}

/** Несколько переменных сразу (в светлой теме — для размеров). Пустой список значений — убрать их. */
export function setVars(m: Mod, names: string[], values: Record<string, string> | null, mode: Mode = 'light'): Mod {
  let out = m;
  for (const n of names) out = setVar(out, mode, n, values ? values[n] : undefined);
  return out;
}

export const getVar = (m: Mod, mode: Mode, name: string): string | undefined => m.vars?.[mode]?.[name];

// ---------- Плотность ----------

export type Density = 'default' | 'compact' | 'comfy';

const DENSITY: Record<Exclude<Density, 'default'>, Record<string, string>> = {
  compact: { '--pad': '12px', '--gap': '10px', '--rf-btn-h': '34px', '--rf-btn-h-small': '28px', '--rf-input-h': '34px', '--rf-nav-h': '34px', '--rf-tab-h': '36px', '--rf-grade-h': '54px', '--rf-row-pad': '10px 14px', '--rf-list-gap': '4px', '--rf-page-pad': '22px 28px 40px', '--rf-review-pad': '22px 26px', '--rf-note-size': '1rem', '--rf-note-lh': '1.55', '--rf-note-pad': '24px 32px 40px', '--rf-hero-pad': '18px 22px' },
  comfy: { '--pad': '24px', '--gap': '22px', '--rf-btn-h': '48px', '--rf-btn-h-small': '38px', '--rf-input-h': '48px', '--rf-nav-h': '48px', '--rf-tab-h': '50px', '--rf-grade-h': '84px', '--rf-row-pad': '20px 22px', '--rf-list-gap': '12px', '--rf-page-pad': '44px 52px 72px', '--rf-review-pad': '38px 44px', '--rf-note-size': '1.12rem', '--rf-note-lh': '1.8', '--rf-note-pad': '44px 60px 72px', '--rf-hero-pad': '32px 36px' }
};
const DENSITY_NAMES = [...new Set([...Object.keys(DENSITY.compact), ...Object.keys(DENSITY.comfy)])];

export function setDensity(m: Mod, d: Density): Mod {
  return setVars(m, DENSITY_NAMES, d === 'default' ? null : DENSITY[d]);
}

export function getDensity(m: Mod): Density {
  const h = getVar(m, 'light', '--rf-btn-h');
  return h === DENSITY.compact['--rf-btn-h'] ? 'compact' : h === DENSITY.comfy['--rf-btn-h'] ? 'comfy' : 'default';
}

// ---------- Скругления ----------

const RADIUS_VARS = ['--radius', '--rf-radius-btn', '--rf-radius-btn-big', '--rf-radius-input', '--rf-radius-grade', '--rf-radius-review', '--rf-radius-note', '--rf-radius-hero', '--rf-radius-row', '--rf-radius-modal', '--rf-radius-menu', '--rf-radius-nav'];

/** Одно число «скругление, px» → все скругления интерфейса. null — не менять. */
export function setRadius(m: Mod, px: number | null): Mod {
  if (px === null) return setVars(m, RADIUS_VARS, null);
  const r = Math.max(0, Math.min(40, Math.round(px)));
  const f = (k: number) => Math.round(r * k) + 'px';
  return setVars(m, RADIUS_VARS, { '--radius': f(1), '--rf-radius-btn': f(0.7), '--rf-radius-btn-big': f(0.9), '--rf-radius-input': f(0.7), '--rf-radius-grade': f(1), '--rf-radius-review': f(1.6), '--rf-radius-note': f(1.25), '--rf-radius-hero': f(1.5), '--rf-radius-row': f(0.9), '--rf-radius-modal': f(1.4), '--rf-radius-menu': f(0.9), '--rf-radius-nav': f(0.65) });
}

export function getRadius(m: Mod): number | null {
  const v = getVar(m, 'light', '--radius');
  const n = v ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

// ---------- Шрифты ----------

export const MONO_CSS = "ui-monospace, 'Cascadia Mono', Consolas, monospace";

/** Шрифт текста / заголовков. css — готовый список шрифтов; fontId — id шрифта из приложения, который надо подгрузить. */
export function setFont(m: Mod, which: 'body' | 'display', css: string | undefined, fontId?: string): Mod {
  let out = setVar(m, 'light', which === 'body' ? '--body' : '--display', css);
  if (which === 'body') {
    const { font: _f, ...rest } = out;
    out = fontId && css ? { ...rest, font: fontId } : rest;
  }
  return out;
}

// ---------- Цвета ----------

/** Главный цвет: заодно считаем цвет текста на нём и главный цвет как текст — иначе на светлом акценте текст не читается. */
export function setAccent(m: Mod, mode: Mode, color: string | undefined, surface = mode === 'dark' ? '#1B1E24' : '#FFFFFF'): Mod {
  let out = setVar(m, mode, '--accent', color);
  if (!color || !parseHex(color)) return setVar(setVar(out, mode, '--on-accent', undefined), mode, '--accent-text', undefined);
  const c = toHex(parseHex(color)!);
  out = setVar(out, mode, '--on-accent', onAccent(c));
  return setVar(out, mode, '--accent-text', accentText(c, surface));
}

/** Сколько всего «своего» в стиле — для подписи «Изменено: …». */
export function summary(m: Mod): string[] {
  const out: string[] = [];
  for (const k of Object.keys(m.attrs ?? {})) out.push(k);
  const n = Object.keys(m.vars?.light ?? {}).length + Object.keys(m.vars?.dark ?? {}).length;
  if (n) out.push(`переменных: ${n}`);
  if (m.css?.trim()) out.push('CSS');
  if (m.settings?.length) out.push(`настроек: ${m.settings.length}`);
  return out;
}
