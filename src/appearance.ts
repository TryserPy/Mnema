// «Настроить текущий»: всё оформление, которое сейчас стоит (тема, цвета, шрифты, углы, плотность, размер текста, фон, «Мой вид»),
// как один стиль (Mod) — и обратно. Так один редактор работает и для сохранённого стиля, и для текущего оформления,
// а «Сохранить мой вид как стиль» — просто копия такого стиля. Чистые функции, без интерфейса — их проверяют тесты.
import { cleanBg } from './bgImage';
import { safeColor } from './safeCss';
import { cleanLook, cleanMyStyle, MINE_ID } from './styleSystem';
import { DEFAULT_ACCENT, DEFAULT_LOOK, PALETTE_VARS, type Palette } from './themes';
import type { Look, Mod, Settings } from './types';

const PALETTE_KEYS = Object.keys(PALETTE_VARS) as (keyof Palette)[];
const KEY_BY_VAR = Object.fromEntries(PALETTE_KEYS.map((k) => [PALETTE_VARS[k], k])) as Record<string, keyof Palette>;
const HEX = /^#[0-9a-f]{6}$/i;

/** Переменная — это цвет темы из «Свои цвета» (хранится в look.custom, а не в «Моём виде»)? */
export const isPaletteVar = (name: string) => name in KEY_BY_VAR;

/** Текущее оформление как стиль. Цвета темы, которые человек менял, попадают в `vars` (отдельно для светлой и тёмной). */
export function currentAsMod(s: Pick<Settings, 'look' | 'accent' | 'density' | 'fontScale' | 'bgImage' | 'myStyle'>): Mod {
  const { custom, ...look } = s.look;
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const k of PALETTE_KEYS) {
    const l = safeColor(custom?.light?.[k]);
    const d = safeColor(custom?.dark?.[k]);
    if (l) light[PALETTE_VARS[k]] = l;
    if (d) dark[PALETTE_VARS[k]] = d;
  }
  Object.assign(light, s.myStyle?.vars?.light);
  Object.assign(dark, s.myStyle?.vars?.dark);
  const vars = { ...(Object.keys(light).length ? { light } : {}), ...(Object.keys(dark).length ? { dark } : {}) };
  return {
    id: MINE_ID,
    name: 'Мой вид',
    description: '',
    icon: '🎨',
    where: 'мой вид',
    look,
    accent: s.accent,
    density: s.density,
    fontScale: s.fontScale,
    ...(s.bgImage ? { bg: s.bgImage } : {}),
    ...(Object.keys(vars).length ? { vars } : {}),
    ...(s.myStyle?.attrs ? { attrs: { ...s.myStyle.attrs } } : {}),
    ...(s.myStyle?.css ? { css: s.myStyle.css } : {})
  };
}

/** Что записать в настройки, чтобы оформление стало таким, как в стиле `m` (после правки в редакторе). */
export function modToCurrent(m: Mod, s: Pick<Settings, 'look' | 'accent' | 'density' | 'fontScale'>): Pick<Settings, 'look' | 'accent' | 'density' | 'fontScale' | 'bgImage' | 'myStyle'> {
  const custom: NonNullable<Look['custom']> = {};
  const mine: { light: Record<string, string>; dark: Record<string, string> } = { light: {}, dark: {} };
  for (const mode of ['light', 'dark'] as const) {
    for (const [name, value] of Object.entries(m.vars?.[mode] ?? {})) {
      const key = KEY_BY_VAR[name];
      if (key) {
        const c = safeColor(value);
        if (c) (custom[mode] ??= {})[key] = c;
      } else mine[mode][name] = value;
    }
  }
  const look: Look = { ...DEFAULT_LOOK, ...s.look, ...(cleanLook(m.look) ?? {}), custom };
  const myStyle = cleanMyStyle({
    vars: { ...(Object.keys(mine.light).length ? { light: mine.light } : {}), ...(Object.keys(mine.dark).length ? { dark: mine.dark } : {}) },
    attrs: m.attrs,
    css: m.css
  });
  return {
    look,
    accent: typeof m.accent === 'string' && HEX.test(m.accent) ? m.accent : s.accent,
    density: m.density ?? s.density,
    fontScale: typeof m.fontScale === 'number' && Number.isFinite(m.fontScale) ? Math.min(1.5, Math.max(0.85, m.fontScale)) : s.fontScale,
    bgImage: m.bg ? (cleanBg({ ...m.bg, v: 2 }) ?? undefined) : undefined,
    myStyle
  };
}

/** «Сбросить всё оформление»: тема, цвета, шрифты, углы, плотность, размер текста, фон и «Мой вид» — как после установки. Включённые стили и сниппеты остаются. */
export function resetCurrentPatch(): Pick<Settings, 'look' | 'accent' | 'density' | 'fontScale' | 'bgImage' | 'myStyle'> {
  return { look: { ...DEFAULT_LOOK, custom: {} }, accent: DEFAULT_ACCENT, density: 'normal', fontScale: 1, bgImage: undefined, myStyle: undefined };
}
