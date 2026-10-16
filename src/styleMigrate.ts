// Оформление 1.31: «стиль + дополнения + мои правки» (settings.appearance, см. styleModel.ts) и перенос из 1.30.
//
// settings.appearance — что выбрал человек. Прежние поля 1.30 (look, accent, density, fontScale, bgImage, myStyle, modsOn, styleValues)
// — его проекция: по ним окно рисует App.tsx, и по ним же работает 1.30 после отката. Каждое действие пишет и то и другое (styleActions.ts),
// а прочитать оформление можно всегда — appearanceOf() выводит его из полей, если они разошлись (откат, копия данных, старый файл).
// Чистые функции, без интерфейса — их проверяют тесты (v131-styles.test.ts).
import { cleanBg } from './bgImage';
import { allMods } from './mods';
import { safeColor } from './safeCss';
import type { Appearance, Migration130, Mod131, StyleRole } from './styleModel';
import { cleanLook, cleanMyStyle, type StyleValues } from './styleSystem';
import { BASE_STYLES, DEFAULT_ACCENT, DEFAULT_LOOK, PALETTE_VARS, schemeStyleFor, type Palette } from './themes';
import type { BgImage, CssSnippet, Density, Look, Mod, Settings } from './types';

/** Поля настроек, из которых складывается оформление (1.30) и которые пишет проекция. */
export type AppearanceFields = Pick<Settings, 'modsOn' | 'customMods' | 'styleValues'> & {
  /** В контракте переноса (Migration130) у look есть только стиль, схемы и свои цвета — остальное необязательно. */
  look: Partial<Look> & Pick<Look, 'light' | 'dark' | 'custom'>;
  accent?: string;
  density?: Density;
  fontScale?: number;
  bgImage?: BgImage;
  myStyle?: Mod;
  cssSnippets?: CssSnippet[];
  appearance?: unknown;
};

export type Projection = Pick<Settings, 'look' | 'accent' | 'density' | 'fontScale' | 'modsOn' | 'styleValues'> & { bgImage: BgImage | undefined; myStyle: Mod | undefined };

export const EDITS_ID = 'mine';
const PALETTE_KEYS = Object.keys(PALETTE_VARS) as (keyof Palette)[];
const PALETTE_BY_VAR = Object.fromEntries(PALETTE_KEYS.map((k) => [PALETTE_VARS[k], k])) as Record<string, keyof Palette>;
const LOOK_KEYS = ['style', 'light', 'dark', 'font', 'headFont', 'radius', 'background'] as const;
const TABS: NonNullable<Appearance['tab']>[] = ['style', 'addons', 'motion', 'code'];

// ---------- Роль стиля ----------

/** Переменные, которые задают цвета всего окна: если стиль их меняет, это стиль, а не дополнение. */
const COLOR_VARS = new Set([...Object.values(PALETTE_VARS), '--accent']);

/** Роль: явно заданная или по содержимому — цвета, фон, вид, шрифты → стиль, иначе дополнение (контракт styleModel.ts). */
export function classifyRole(m: Mod131): StyleRole {
  if (m.role === 'style' || m.role === 'addon') return m.role;
  const vars = { ...(m.vars?.light ?? {}), ...(m.vars?.dark ?? {}) };
  const colors = Object.keys(vars).some((k) => COLOR_VARS.has(k)) || Boolean(m.accent);
  const look = Boolean(m.look && (m.look.light || m.look.dark || m.look.style || m.look.font || m.look.headFont));
  return colors || look || Boolean(m.bg) || Boolean(m.fonts?.length) || Boolean(m.font) ? 'style' : 'addon';
}

/** Встроенный стиль без CSS («Современный», «Классический», схемы)? */
export const isBaseStyle = (id: string) => BASE_STYLES.some((b) => b.id === id);

// ---------- Основа стиля ----------

/** Основа оформления, которую задаёт стиль (и дополнения, если вдруг меняют её): то, от чего считаются «мои правки». */
export interface StyleBase {
  look: Look;
  accent: string;
  density: Density;
  fontScale: number;
  bg?: Partial<BgImage>;
}

const MODERN: StyleBase = { look: { ...DEFAULT_LOOK, ...BASE_STYLES[0].look, custom: {} }, accent: DEFAULT_ACCENT, density: 'normal', fontScale: 1 };

function withMod(b: StyleBase, m: Mod): StyleBase {
  const look = cleanLook(m.look);
  return {
    look: look ? { ...b.look, ...look } : b.look,
    accent: (m.accent && safeColor(m.accent)) || b.accent,
    density: m.density ?? b.density,
    fontScale: typeof m.fontScale === 'number' ? m.fontScale : b.fontScale,
    bg: m.bg ? { ...(b.bg ?? {}), ...m.bg } : b.bg
  };
}

/** Основа для стиля `style` с дополнениями `addons` (их основа накладывается по порядку). */
export function styleBase(style: string, addons: string[], customMods: Mod[]): StyleBase {
  const byId = new Map(allMods(customMods).map((m) => [m.id, m]));
  const bs = BASE_STYLES.find((b) => b.id === style);
  let base: StyleBase = bs ? { ...MODERN, look: { ...MODERN.look, ...bs.look, custom: {} }, accent: bs.accent } : MODERN;
  const sm = bs ? undefined : byId.get(style);
  if (sm) base = withMod(base, sm);
  for (const id of addons) {
    const m = byId.get(id);
    if (m) base = withMod(base, m);
  }
  return base;
}

const sameBg = (a: Partial<BgImage> | undefined, b: Partial<BgImage> | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const withoutSrc = (bg: Partial<BgImage>) => {
  const { src: _s, ...rest } = bg;
  return rest;
};

// ---------- Проекция: оформление → поля 1.30 ----------

/** Свой фон итогом: правка (своя картинка или подстройка картинки стиля) поверх фона стиля. `src: ''` в правке — «фон стиля убран». */
function projectBg(base: StyleBase, e: Partial<BgImage> | undefined): BgImage | undefined {
  if (e?.src === '') return undefined;
  const src = e?.src ?? base.bg?.src;
  if (!src) return undefined;
  return cleanBg({ ...(base.bg ?? {}), ...(e ?? {}), v: 2, src }) ?? undefined;
}

/** Что записать в прежние поля, чтобы окно выглядело так, как велит оформление. */
export function projectAppearance(a: Appearance, customMods: Mod[]): Projection {
  const base = styleBase(a.style, a.addons, customMods);
  const e = a.edits;
  const custom: Look['custom'] = {};
  const rest: { light: Record<string, string>; dark: Record<string, string> } = { light: {}, dark: {} };
  for (const mode of ['light', 'dark'] as const)
    for (const [name, value] of Object.entries(e?.vars?.[mode] ?? {})) {
      const key = PALETTE_BY_VAR[name];
      const c = key ? safeColor(value) : null;
      if (key && c) (custom[mode] ??= {})[key] = c;
      else if (!key) rest[mode][name] = value;
    }
  const look: Look = { ...base.look, ...(cleanLook(e?.look) ?? {}), custom };
  const myStyle = e
    ? cleanMyStyle({
        vars: { ...(Object.keys(rest.light).length ? { light: rest.light } : {}), ...(Object.keys(rest.dark).length ? { dark: rest.dark } : {}) },
        attrs: e.attrs,
        css: e.css
      })
    : undefined;
  return {
    look,
    accent: (e?.accent && safeColor(e.accent)) || base.accent,
    density: e?.density ?? base.density,
    fontScale: typeof e?.fontScale === 'number' ? e.fontScale : base.fontScale,
    bgImage: projectBg(base, e?.bg),
    myStyle,
    modsOn: [...(isBaseStyle(a.style) ? [] : [a.style]), ...a.addons.filter((x) => x !== a.style)],
    styleValues: a.values
  };
}

// ---------- Вывод оформления из полей (перенос из 1.30) ----------

/** «Мои правки»: всё, чем поля отличаются от основы стиля. undefined — правок нет. */
export function diffEdits(base: StyleBase, f: Pick<AppearanceFields, 'look' | 'accent' | 'density' | 'fontScale' | 'bgImage' | 'myStyle'>): Mod131 | undefined {
  const e: Mod131 = { id: EDITS_ID, name: 'Мои правки', description: '' };
  const look: Partial<Look> = {};
  for (const k of LOOK_KEYS) {
    const v = f.look[k] ?? (k === 'style' ? 'modern' : undefined);
    if (v !== undefined && v !== base.look[k]) (look as Record<string, unknown>)[k] = v;
  }
  const clean = cleanLook(look);
  if (clean) e.look = clean;
  const vars: { light: Record<string, string>; dark: Record<string, string> } = { light: {}, dark: {} };
  for (const mode of ['light', 'dark'] as const) {
    for (const k of PALETTE_KEYS) {
      const c = safeColor(f.look.custom?.[mode]?.[k]);
      if (c) vars[mode][PALETTE_VARS[k]] = c;
    }
    Object.assign(vars[mode], f.myStyle?.vars?.[mode] ?? {});
  }
  if (Object.keys(vars.light).length || Object.keys(vars.dark).length) e.vars = { ...(Object.keys(vars.light).length ? { light: vars.light } : {}), ...(Object.keys(vars.dark).length ? { dark: vars.dark } : {}) };
  if (f.myStyle?.attrs && Object.keys(f.myStyle.attrs).length) e.attrs = { ...f.myStyle.attrs };
  if (f.myStyle?.css?.trim()) e.css = f.myStyle.css;
  if (f.accent && f.accent.toLowerCase() !== base.accent.toLowerCase()) e.accent = f.accent;
  if (f.density && f.density !== base.density) e.density = f.density;
  if (typeof f.fontScale === 'number' && Math.abs(f.fontScale - base.fontScale) > 0.001) e.fontScale = f.fontScale;
  const want = f.bgImage;
  const had = projectBg(base, undefined);
  if (!want && had) e.bg = { src: '' };
  else if (want && !sameBg(want, had)) e.bg = had && want.src === had.src ? withoutSrc(want) : { ...want };
  return Object.keys(e).length > 3 ? e : undefined;
}

/** Сколько правок поверх стиля — для сводки «Кофе · 3 правки поверх». */
export function countEdits(e: Mod131 | undefined): number {
  if (!e) return 0;
  const vars = new Set([...Object.keys(e.vars?.light ?? {}), ...Object.keys(e.vars?.dark ?? {})]);
  return Object.keys(e.look ?? {}).length + vars.size + Object.keys(e.attrs ?? {}).length + (e.css?.trim() ? 1 : 0) + (e.accent ? 1 : 0) + (e.density ? 1 : 0) + (e.fontScale !== undefined ? 1 : 0) + (e.bg ? 1 : 0);
}

/** Сохранённое оформление как подсказка: только известные значения (оно может прийти из чужой копии данных). */
function cleanHint(raw: unknown): { style?: string; tab?: Appearance['tab'] } {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return {};
  return {
    ...(typeof r.style === 'string' && r.style.length <= 40 ? { style: r.style } : {}),
    ...(TABS.includes(r.tab as never) ? { tab: r.tab as Appearance['tab'] } : {})
  };
}

/**
 * Перенос из 1.30 (Migration130 в styleModel.ts) и он же — «прочитать оформление из полей».
 *  - стиль = выбранный раньше (settings.appearance.style), если он ещё стоит; иначе последний включённый мод с ролью «стиль»;
 *    иначе look.style с палитрой (пара схем, совпавшая со встроенным стилем, — этот стиль);
 *  - остальные включённые моды — дополнения в прежнем порядке;
 *  - всё, чем оформление отличается от основы стиля (myStyle, свои цвета, схемы, шрифт, главный цвет, плотность, размер, фон), — «мои правки»;
 *  - styleValues → values как есть; customMods и cssSnippets не трогаются.
 * Идемпотентен: перенос уже перенесённого возвращает то же самое.
 */
export function migrateAppearance(s: AppearanceFields): Appearance {
  const mods = allMods(s.customMods);
  const byId = new Map(mods.map((m) => [m.id, m]));
  const on: string[] = [];
  for (const id of s.modsOn) if (byId.has(id) && !on.includes(id)) on.push(id);
  const hint = cleanHint(s.appearance);
  const styleMods = on.filter((id) => classifyRole(byId.get(id)!) === 'style');
  const lookStyle = s.look.style ?? 'modern';
  let style: string;
  if (hint.style && styleMods.includes(hint.style)) style = hint.style;
  else if (styleMods.length) style = styleMods[styleMods.length - 1];
  else if (hint.style && isBaseStyle(hint.style) && (BASE_STYLES.find((b) => b.id === hint.style)!.look.style ?? 'modern') === lookStyle) style = hint.style;
  else style = lookStyle === 'classic' ? 'classic' : (schemeStyleFor(s.look.light, s.look.dark)?.id ?? 'modern');
  const addons = on.filter((id) => id !== style);
  const edits = diffEdits(styleBase(style, addons, s.customMods), s);
  return { v: 1, style, addons, ...(edits ? { edits } : {}), values: (s.styleValues ?? {}) as StyleValues, ...(hint.tab ? { tab: hint.tab } : {}) };
}

/** Перенос по контракту styleModel.ts: те же правила, поля сверх контракта (главный цвет, плотность, размер, фон) — необязательны. */
export const migrate130: Migration130 = migrateAppearance;

/** Оформление, как оно есть сейчас. Поля — главнее: если их поменяли в обход (откат на 1.30, копия), оформление выводится из них заново. */
export function appearanceOf(s: AppearanceFields): Appearance {
  return migrateAppearance(s);
}

/** Название стиля для сводки и галереи. */
export function styleName(id: string, customMods: Mod[]): string {
  return BASE_STYLES.find((b) => b.id === id)?.name ?? allMods(customMods).find((m) => m.id === id)?.name ?? 'Стиль';
}
