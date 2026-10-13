// Стили Refrain (как темы Obsidian + плагин Style Settings): формат файла, проверка чужого стиля, сборка итогового CSS.
// Стиль — это только CSS и объявленные настройки; программ в нём нет. Всё, что приходит из файла, проверяется здесь.
// Чистые функции, без интерфейса — их проверяют тесты.
import { cleanBg, cleanBgParams, MAX_BG_SRC_FILE } from './bgImage';
import { cleanModName, MAX_CSS, safeColor, safeCssValue, safeFontFamily, safeVarName, sanitizeCss } from './safeCss';
import { STYLE_FORMAT_131, type Mod131, type StyleFont, type StyleRole } from './styleModel';
import { DEFAULT_ACCENT, migrateLook } from './themes';
import type { CssSnippet, Density, Look, Mod, Settings, StyleSetting, StyleSettingType, StyleValue } from './types';

export const STYLE_EXT = '.refrainstyle';
export const OLD_STYLE_EXT = '.mnemamod';
export const STYLE_KIND = 'refrain-style';
/** Версия формата файла 1.30: плотность, размер текста и фон в самом стиле, больше переменных. Файлы версии 1 открываются как раньше. */
export const STYLE_FORMAT = 2;
/** 1.31 пишет версию 3 (роль, шрифты, откуда стиль) и читает 1–3. */
export { STYLE_FORMAT_131 };

// ---------- Атрибуты оформления («раскладка») ----------

export interface AttrDef {
  label: string;
  doc: string;
  options: { value: string; label: string }[];
  default: string;
}

/** Атрибуты на корне окна (`<html data-ui-…>`), которыми стиль меняет раскладку. Значения в CSS: `:root[data-ui-sidebar='right'] …`. */
export const STYLE_ATTRS: Record<string, AttrDef> = {
  sidebar: {
    label: 'Боковая панель',
    doc: 'Где панель с предметами: слева (по умолчанию), справа, сверху полосой или узкая — только значки.',
    default: 'left',
    options: [
      { value: 'left', label: 'Слева' },
      { value: 'right', label: 'Справа' },
      { value: 'top', label: 'Сверху' },
      { value: 'rail', label: 'Узкая, со значками' }
    ]
  },
  content: {
    label: 'Ширина содержимого',
    doc: 'Насколько широкая колонка с содержимым экранов.',
    default: 'normal',
    options: [
      { value: 'narrow', label: 'Узкая' },
      { value: 'normal', label: 'Обычная' },
      { value: 'wide', label: 'Широкая' },
      { value: 'full', label: 'На весь экран' }
    ]
  },
  cards: {
    label: 'Вид карточек',
    doc: 'Как выглядят карточки и плашки: обычные, плоские (без тени и рамки), с рамкой, острые углы.',
    default: 'default',
    options: [
      { value: 'default', label: 'Обычные' },
      { value: 'flat', label: 'Плоские' },
      { value: 'outline', label: 'С рамкой' },
      { value: 'sharp', label: 'Острые углы' }
    ]
  },
  grades: {
    label: 'Кнопки оценки',
    doc: 'Как расположены «Снова / Трудно / Хорошо / Легко»: в ряд, сеткой 2×2 или высокими плитками.',
    default: 'row',
    options: [
      { value: 'row', label: 'В ряд' },
      { value: 'grid', label: 'Сеткой 2×2' },
      { value: 'tall', label: 'Крупные' }
    ]
  },
  topics: {
    label: 'Список тем',
    doc: 'Темы предмета — списком (по умолчанию) или плитками.',
    default: 'list',
    options: [
      { value: 'list', label: 'Списком' },
      { value: 'tiles', label: 'Плитками' }
    ]
  },
  tabs: {
    label: 'Вкладки',
    doc: 'Вкладки темы и переключатели: с линией снизу (по умолчанию), «таблетки» или в рамке.',
    default: 'underline',
    options: [
      { value: 'underline', label: 'С линией' },
      { value: 'pills', label: 'Таблетки' },
      { value: 'boxed', label: 'В рамке' }
    ]
  },
  anim: {
    label: 'Анимации',
    doc: 'Выключить все движения интерфейса (on — как обычно, off — без анимаций).',
    default: 'on',
    options: [
      { value: 'on', label: 'Включены' },
      { value: 'off', label: 'Выключены' }
    ]
  }
};

const CUSTOM_ATTR = /^[a-z][a-z0-9-]{0,24}$/;
const ATTR_VALUE = /^[a-z0-9-]{1,24}$/;

/** Имя атрибута на корне окна: для атрибутов оформления — `data-ui-имя`, для остальных, придуманных автором, — `data-st-имя`. */
export const attrName = (name: string) => (name in STYLE_ATTRS ? 'data-ui-' : 'data-st-') + name;

/** Подходит ли значение атрибута: у атрибутов оформления — из списка, у остальных — простые слова. */
export function validAttr(name: string, value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (name in STYLE_ATTRS) return STYLE_ATTRS[name].options.some((o) => o.value === value);
  return CUSTOM_ATTR.test(name) && ATTR_VALUE.test(value);
}

// ---------- Проверка настроек и значений ----------

const UNITS = ['', 'px', 'rem', 'em', '%', 'ms', 's', 'deg', 'vw', 'vh'];
const TYPES: StyleSettingType[] = ['color', 'slider', 'select', 'toggle', 'text', 'font'];
const ID = /^[a-z][a-z0-9-]{0,30}$/;
const label = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Одна настройка из файла: всё лишнее выбрасывается, неверное — отвергается (null). */
export function cleanSetting(raw: unknown): StyleSetting | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;
  const id = typeof r.id === 'string' ? r.id : '';
  const type = r.type as StyleSettingType;
  if (!ID.test(id) || !TYPES.includes(type)) return null;
  const name = label(r.label, 60);
  if (!name) return null;
  const out: Partial<StyleSetting> = { id, type, label: name };
  const d = label(r.description, 160);
  if (d) out.description = d;
  const v = r.var === undefined ? undefined : safeVarName(r.var);
  if (r.var !== undefined && !v) return null;
  const attr = r.attr === undefined ? undefined : typeof r.attr === 'string' && (r.attr in STYLE_ATTRS || CUSTOM_ATTR.test(r.attr)) ? r.attr : null;
  if (r.attr !== undefined && !attr) return null;
  if (v) out.var = v;
  if (attr) out.attr = attr;
  if ((type === 'color' || type === 'slider' || type === 'text' || type === 'font') && !v) return null; // их значение — только переменная
  if ((type === 'select' || type === 'toggle') && !v && !attr) {
    // Без привязки значение попадает в атрибут data-st-<id>: так автор пишет в CSS :root[data-st-id='…'].
    out.attr = id;
  }
  if (type === 'color') {
    const c = safeColor(r.default);
    if (!c) return null;
    out.default = c;
    const dc = r.defaultDark === undefined ? null : safeColor(r.defaultDark);
    if (dc) out.defaultDark = dc;
  } else if (type === 'slider') {
    const min = num(r.min);
    const max = num(r.max);
    const def = num(r.default);
    if (min === undefined || max === undefined || def === undefined || !(min < max) || Math.abs(min) > 1e6 || Math.abs(max) > 1e6) return null;
    const step = num(r.step);
    out.min = min;
    out.max = max;
    out.step = step !== undefined && step > 0 && step <= max - min ? step : (max - min) / 100;
    out.unit = UNITS.includes(String(r.unit ?? '')) ? String(r.unit ?? '') : '';
    out.default = Math.min(max, Math.max(min, def));
  } else if (type === 'select') {
    if (!Array.isArray(r.options)) return null;
    const options = r.options
      .slice(0, 24)
      .map((o) => {
        const x = o as Record<string, unknown>;
        const value = typeof x?.value === 'string' ? x.value : '';
        const lab = label(x?.label, 40);
        const ok = out.attr ? validAttr(out.attr, value) : safeCssValue(value) !== null;
        return ok && lab ? { value, label: lab } : null;
      })
      .filter((o): o is { value: string; label: string } => o !== null);
    if (options.length < 2) return null;
    out.options = options;
    const def = typeof r.default === 'string' && options.some((o) => o.value === r.default) ? r.default : options[0].value;
    out.default = def;
  } else if (type === 'toggle') {
    out.default = r.default === true;
    const on = r.on === undefined ? undefined : r.on;
    const off = r.off === undefined ? undefined : r.off;
    const okv = (x: unknown) => (out.attr ? validAttr(out.attr, x) : safeCssValue(x) !== null);
    if (on !== undefined) {
      if (!okv(on)) return null;
      out.on = on as string;
    }
    if (off !== undefined) {
      if (!okv(off)) return null;
      out.off = off as string;
    }
  } else if (type === 'font') {
    const f = safeFontFamily(r.default);
    if (!f) return null;
    out.default = f;
  } else {
    const t = safeCssValue(r.default);
    if (t === null) return null;
    out.default = t;
  }
  return out as StyleSetting;
}

export function cleanSettings(raw: unknown): StyleSetting[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: StyleSetting[] = [];
  for (const r of raw.slice(0, 40)) {
    const s = cleanSetting(r);
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out.length ? out : undefined;
}

/** Значение настройки: то, что сохранил человек, если оно подходит по типу; иначе — значение по умолчанию. */
export function settingValue(s: StyleSetting, stored: unknown): StyleValue {
  switch (s.type) {
    case 'color':
      return safeColor(stored) ?? (s.default as string);
    case 'slider': {
      const min = s.min ?? 0;
      const max = s.max ?? 100;
      const step = s.step && s.step > 0 ? s.step : 1;
      const n = typeof stored === 'number' && Number.isFinite(stored) ? stored : Number(s.default);
      const clamped = Math.min(max, Math.max(min, n));
      const snapped = Math.round((clamped - min) / step) * step + min;
      return Math.min(max, Math.round(snapped * 1e6) / 1e6);
    }
    case 'select':
      return typeof stored === 'string' && s.options?.some((o) => o.value === stored) ? stored : (s.default as string);
    case 'toggle':
      return typeof stored === 'boolean' ? stored : s.default === true;
    case 'font':
      return safeFontFamily(stored) ?? (s.default as string);
    default:
      return safeCssValue(stored) ?? (s.default as string);
  }
}

/** Что настройка делает в данный момент: переменная и/или атрибут. Значение уже проверено. */
export function settingEffect(s: StyleSetting, stored: unknown): { var?: [string, string]; darkVar?: [string, string]; attr?: [string, string] } {
  const val = settingValue(s, stored);
  const out: { var?: [string, string]; darkVar?: [string, string]; attr?: [string, string] } = {};
  if (s.type === 'toggle') {
    const on = val === true;
    if (s.var) out.var = [s.var, s.on !== undefined && on ? s.on : s.off !== undefined && !on ? s.off : on ? '1' : '0'];
    if (s.attr) {
      const v = on ? (s.on ?? 'on') : (s.off ?? 'off');
      if (validAttr(s.attr, v)) out.attr = [s.attr, v];
    }
    return out;
  }
  const str = s.type === 'slider' ? `${val}${s.unit ?? ''}` : String(val);
  if (s.var) {
    out.var = [s.var, str];
    // Цвет по умолчанию в тёмной теме — свой, пока человек не выбрал цвет сам.
    if (s.type === 'color' && s.defaultDark && safeColor(stored) === null) out.darkVar = [s.var, s.defaultDark];
  }
  if (s.attr && s.type === 'select' && validAttr(s.attr, str)) out.attr = [s.attr, str];
  return out;
}

// ---------- Чистка всего стиля (из файла и из сохранённых данных) ----------

function cleanVarMap(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 160)) {
    const name = safeVarName(k);
    const val = typeof v === 'string' ? (safeColor(v) ?? safeCssValue(v)) : null;
    if (name && val) out[name] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanAttrs(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) if (validAttr(k, v)) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

const DENSITIES: Density[] = ['compact', 'normal', 'comfy'];
const LOOK_STYLE = ['modern', 'classic'];
const LOOK_RADIUS = ['sharp', 'normal', 'round'];
const LOOK_BG = ['plain', 'dots', 'grid', 'lines'];
const LOOK_FONTS = ['onest', 'nunito', 'comfortaa', 'literata', 'system'];
const LOOK_HEAD = ['literata', 'same'];
const THEME_IDS = ['air', 'paper', 'snow', 'sky', 'mint', 'sakura', 'sand', 'contrast', 'night', 'graphite', 'midnight', 'ocean', 'forest', 'plum', 'coffee'];

/** Оформление из файла: только известные значения из списков (цвета тем и т. п. — не из файла). */
export function cleanLook(raw: unknown): Partial<Look> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: Partial<Look> = {};
  if (LOOK_STYLE.includes(r.style as string)) out.style = r.style as Look['style'];
  if (THEME_IDS.includes(r.light as string)) out.light = r.light as string;
  if (THEME_IDS.includes(r.dark as string)) out.dark = r.dark as string;
  if (LOOK_FONTS.includes(r.font as string)) out.font = r.font as string;
  if (LOOK_HEAD.includes(r.headFont as string)) out.headFont = r.headFont as Look['headFont'];
  if (LOOK_RADIUS.includes(r.radius as string)) out.radius = r.radius as Look['radius'];
  if (LOOK_BG.includes(r.background as string)) out.background = r.background as Look['background'];
  return Object.keys(out).length ? out : undefined;
}

// ---------- Свои шрифты внутри стиля (1.31) ----------

const FONT_FAMILY = /^[\p{L}\p{N} -]{1,40}$/u;
const FONT_SRC = /^data:font\/(woff2|ttf);base64,([A-Za-z0-9+/]+={0,2})$/;
const FONT_WEIGHTS = ['400', '500', '600', '700', '400 700'];
/** Пределы из контракта: 400 КБ на шрифт и 1 МБ на стиль (считаем настоящие байты, а не длину base64). */
export const MAX_FONT_BYTES = 400 * 1024;
export const MAX_STYLE_FONT_BYTES = 1024 * 1024;

const b64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/** Шрифты стиля: только data:font/woff2 или ttf внутри файла, имя без кавычек и скобок; лишнее и большое выбрасывается. */
export function cleanFonts(raw: unknown): StyleFont[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: StyleFont[] = [];
  let total = 0;
  for (const x of raw.slice(0, 8)) {
    const r = x as Record<string, unknown> | null;
    if (!r || typeof r !== 'object' || typeof r.family !== 'string' || typeof r.src !== 'string') continue;
    const family = r.family.trim().replace(/\s+/g, ' ');
    const m = FONT_SRC.exec(r.src);
    if (!FONT_FAMILY.test(family) || !m) continue;
    const bytes = b64Bytes(m[2]);
    if (bytes > MAX_FONT_BYTES || total + bytes > MAX_STYLE_FONT_BYTES) continue;
    total += bytes;
    const f: StyleFont = { family, src: r.src };
    if (FONT_WEIGHTS.includes(r.weight as string)) f.weight = r.weight as StyleFont['weight'];
    if (r.style === 'normal' || r.style === 'italic') f.style = r.style;
    out.push(f);
  }
  return out.length ? out : undefined;
}

/** Имя семейства, под которым шрифт стиля виден в CSS: со своим id стиля, чтобы не пересечься с системными и чужими. */
export const fontFamilyName = (styleId: string, family: string) => `Refrain ${styleId.replace(/[^\w-]/g, '')} ${family}`;

/** @font-face для шрифтов стиля. Собирается здесь, а не берётся из CSS стиля: src — только проверенный data:font. */
export function fontFaceCss(m: Pick<Mod131, 'id' | 'fonts'>): string {
  return (m.fonts ?? [])
    .map((f) => {
      const fmt = f.src.startsWith('data:font/woff2') ? 'woff2' : 'truetype';
      return `@font-face { font-family: '${fontFamilyName(m.id, f.family)}'; src: url(${f.src}) format('${fmt}'); font-weight: ${f.weight ?? '400'}; font-style: ${f.style ?? 'normal'}; font-display: swap; }`;
    })
    .join('\n');
}

/** В CSS и переменных стиля его шрифт пишут по имени в кавычках ('Мой шрифт') — подставляем имя со своим id стиля. */
export function withFontNames(text: string, m: Pick<Mod131, 'id' | 'fonts'>): string {
  let out = text;
  for (const f of m.fonts ?? []) {
    const esc = f.family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(['"])${esc}\\1`, 'g'), `'${fontFamilyName(m.id, f.family)}'`);
  }
  return out;
}

const ROLES: StyleRole[] = ['style', 'addon'];
const ORIGINS = ['builtin', 'file', 'ai', 'mine'] as const;

/** Привести что угодно к безопасному стилю. null — это не стиль. `id` и `where` задаёт приложение, а не файл. */
export function cleanMod(raw: unknown, id: string, where?: string): Mod131 | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || typeof r.name !== 'string' || !r.name.trim()) return null;
  const icon = typeof r.icon === 'string' ? [...r.icon.trim()].slice(0, 4).join('') : '';
  const accent = typeof r.accent === 'string' ? safeColor(r.accent) : null;
  const m: Mod131 = {
    id,
    name: label(r.name, 50) || 'Стиль',
    description: label(r.description, 240),
    icon: icon && !/[<>&"']/.test(icon) ? icon : '📄'
  };
  if (typeof r.author === 'string' && r.author.trim()) m.author = label(r.author, 40);
  if (typeof r.version === 'string' && /^[\w.\-+ ]{1,20}$/.test(r.version)) m.version = r.version;
  if (typeof r.css === 'string' && r.css.trim()) m.css = sanitizeCss(r.css);
  const look = cleanLook(r.look);
  if (look) m.look = look;
  if (accent) m.accent = accent;
  if (DENSITIES.includes(r.density as Density)) m.density = r.density as Density;
  if (typeof r.fontScale === 'number' && Number.isFinite(r.fontScale)) m.fontScale = Math.round(Math.min(1.5, Math.max(0.85, r.fontScale)) * 100) / 100;
  const bg = cleanBgParams(r.bg);
  if (bg) m.bg = bg;
  if (typeof r.font === 'string' && LOOK_FONTS.includes(r.font)) m.font = r.font;
  const light = cleanVarMap((r.vars as Record<string, unknown> | undefined)?.light);
  const dark = cleanVarMap((r.vars as Record<string, unknown> | undefined)?.dark);
  if (light || dark) m.vars = { ...(light ? { light } : {}), ...(dark ? { dark } : {}) };
  const attrs = cleanAttrs(r.attrs);
  if (attrs) m.attrs = attrs;
  const settings = cleanSettings(r.settings);
  if (settings) m.settings = settings;
  if (r.desktopOnly === true) m.desktopOnly = true;
  if (ROLES.includes(r.role as StyleRole)) m.role = r.role as StyleRole;
  if (ORIGINS.includes(r.origin as (typeof ORIGINS)[number])) m.origin = r.origin as Mod131['origin'];
  const fonts = cleanFonts(r.fonts);
  if (fonts) m.fonts = fonts;
  if (where) m.where = where;
  else if (typeof r.where === 'string') m.where = label(r.where, 30);
  return m;
}

/** Это файл стиля (новый .refrainstyle или старый .mnemamod)? */
export function isStyleFile(x: unknown): boolean {
  const m = x as Record<string, unknown> | null;
  return Boolean(m && typeof m === 'object' && (m.kind === STYLE_KIND || m.kind === 'mnema-mod') && typeof m.name === 'string' && (typeof m.css === 'string' || typeof m.look === 'object' || typeof m.settings === 'object' || typeof m.attrs === 'object' || typeof m.vars === 'object' || typeof m.bg === 'object' || typeof m.density === 'string' || typeof m.fontScale === 'number' || Array.isArray(m.fonts)));
}

/** Разобрать текст файла стиля. Бросает понятную ошибку по-русски. */
export function parseStyleFile(text: string, id: string): Mod131 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён или это не стиль.');
  }
  if (!isStyleFile(raw)) throw new Error('Это не стиль Refrain.');
  const f = raw as Record<string, unknown>;
  if (f.kind === STYLE_KIND && typeof f.formatVersion === 'number' && f.formatVersion > STYLE_FORMAT_131) throw new Error('Стиль сделан в более новой версии Refrain — обнови приложение.');
  // «Откуда» и «где видно» задаёт приложение: в 1.30 сюда писалось «из файла», и подпись в галерее путала одно с другим.
  const { where: _w, origin: _o, ...rest } = f;
  const m = cleanMod({ ...rest, origin: 'file' }, id);
  if (!m) throw new Error('В файле нет названия стиля.');
  return m;
}

/** Содержимое файла `.refrainstyle` для стиля. Картинка фона кладётся в файл только по просьбе (`image`) и если она небольшая: файлом делятся. */
export function styleToFile(m: Mod131, opts: { image?: boolean } = {}): string {
  const { id: _id, where: _where, origin: _origin, bg, ...rest } = m;
  const out: Record<string, unknown> = { kind: STYLE_KIND, formatVersion: STYLE_FORMAT_131, ...rest };
  if (bg) {
    const { src, ...params } = bg;
    const withImage = opts.image && src && src.length < MAX_BG_SRC_FILE;
    out.bg = withImage ? { ...params, src } : params;
  }
  return JSON.stringify(out, null, 1);
}

// ---------- Сборка итогового CSS ----------

export type StyleValues = Record<string, Record<string, StyleValue>>;

export interface Compiled {
  css: string;
  /** Атрибуты на корне окна: имя (sidebar, grid…) → значение. */
  attrs: Record<string, string>;
}

const decl = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `${k}: ${v} !important;`)
    .join(' ');

/** Сборка одного стиля: переменные (светлая и тёмная тема), значения настроек, сам CSS. */
export function compileOne(m: Mod131, values: Record<string, StyleValue> | undefined, out: Compiled) {
  const light: Record<string, string> = { ...(m.vars?.light ?? {}) };
  const dark: Record<string, string> = { ...(m.vars?.dark ?? {}) };
  for (const [k, v] of Object.entries(m.attrs ?? {})) if (validAttr(k, v)) out.attrs[k] = v;
  for (const s of m.settings ?? []) {
    const e = settingEffect(s, values?.[s.id]);
    if (e.var) {
      light[e.var[0]] = e.var[1];
      delete dark[e.var[0]];
    }
    if (e.darkVar) dark[e.darkVar[0]] = e.darkVar[1];
    if (e.attr) out.attrs[e.attr[0]] = e.attr[1];
  }
  const parts: string[] = [`/* стиль: ${cleanModName(m.name)} */`];
  const fonts = m.fonts?.length ? (t: string) => withFontNames(t, m) : (t: string) => t;
  if (m.fonts?.length) parts.push(fontFaceCss(m));
  if (Object.keys(light).length) parts.push(fonts(`:root { ${decl(light)} }`));
  if (Object.keys(dark).length) parts.push(fonts(`:root[data-theme='dark'] { ${decl(dark)} }`));
  if (m.css) parts.push(fonts(sanitizeCss(m.css)));
  out.css += (out.css ? '\n\n' : '') + parts.join('\n');
}

/** Все включённые стили сверху вниз (следующий перекрывает предыдущий) и сниппеты «мой CSS». */
export function compileStyles(stack: { mod: Mod; values?: Record<string, StyleValue> }[], snippets: CssSnippet[] = []): Compiled {
  const out: Compiled = { css: '', attrs: {} };
  for (const l of stack) compileOne(l.mod, l.values, out);
  for (const sn of snippets) if (sn.on && sn.css.trim()) out.css += (out.css ? '\n\n' : '') + `/* сниппет: ${cleanModName(sn.name)} */\n${sanitizeCss(sn.css)}`;
  return out;
}

// ---------- Сохранённые данные ----------

export function cleanSnippets(raw: unknown, legacyUserCss?: unknown): CssSnippet[] {
  const out: CssSnippet[] = [];
  if (Array.isArray(raw))
    for (const x of raw.slice(0, 30)) {
      const r = x as Record<string, unknown>;
      if (r && typeof r.id === 'string' && typeof r.css === 'string') out.push({ id: r.id.slice(0, 20), name: label(r.name, 40) || 'Сниппет', css: r.css.slice(0, MAX_CSS), on: r.on !== false });
    }
  // Прежний единственный «Свой CSS» становится первым сниппетом.
  if (typeof legacyUserCss === 'string' && legacyUserCss.trim() && !out.some((s) => s.id === 'legacy')) out.unshift({ id: 'legacy', name: 'Мой CSS', css: legacyUserCss.slice(0, MAX_CSS), on: true });
  return out;
}

export function cleanStyleValues(raw: unknown): StyleValues {
  const out: StyleValues = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [sid, vals] of Object.entries(raw as Record<string, unknown>).slice(0, 100)) {
    if (!vals || typeof vals !== 'object') continue;
    const o: Record<string, StyleValue> = {};
    for (const [k, v] of Object.entries(vals as Record<string, unknown>).slice(0, 60)) if (ID.test(k) && (typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)))) o[k] = typeof v === 'string' ? v.slice(0, 140) : v;
    if (Object.keys(o).length) out[sid.slice(0, 40)] = o;
  }
  return out;
}

/** Сохранённые стили пользователя (из своих данных или копии): каждый проходит ту же проверку, что и стиль из файла. */
export function cleanCustomMods(raw: unknown): Mod[] {
  if (!Array.isArray(raw)) return [];
  const out: Mod[] = [];
  const seen = new Set<string>();
  let imgBudget = 6_000_000; // картинки фона внутри стилей: всего не больше ≈6 МБ, остальные стили остаются без картинки
  for (const x of raw.slice(0, 60)) {
    const id = typeof (x as Mod)?.id === 'string' ? (x as Mod).id.replace(/[^\w-]/g, '').slice(0, 30) : '';
    if (!id || seen.has(id)) continue;
    const m = cleanMod(x, id);
    if (m) {
      seen.add(id);
      if (m.bg?.src) {
        if (m.bg.src.length <= imgBudget) imgBudget -= m.bg.src.length;
        else delete m.bg.src;
      }
      out.push(m);
    }
  }
  return out;
}

export const MINE_ID = 'mine';

/** Новый случайный id для своего стиля или сниппета. */
export const newStyleId = () => 'm-' + Math.random().toString(36).slice(2, 9);

/** «Мой вид»: правки из «Настроить текущий» (переменные, раскладка, CSS). Остальное оформление лежит в самих настройках. */
export function cleanMyStyle(raw: unknown): Mod | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = cleanMod({ ...(raw as object), name: 'Мой вид' }, MINE_ID, 'мой вид');
  if (!m) return undefined;
  const mine: Mod = { id: m.id, name: m.name, description: '', ...(m.vars ? { vars: m.vars } : {}), ...(m.attrs ? { attrs: m.attrs } : {}), ...(m.css?.trim() ? { css: m.css } : {}) };
  return mine.vars || mine.attrs || mine.css ? mine : undefined;
}

/** «Как было до стиля»: запомненное оформление тоже проверяем (оно может прийти из чужой копии данных). */
export function cleanStyleBackup(raw: unknown): Settings['styleBackup'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: NonNullable<Settings['styleBackup']> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>).slice(0, 60)) {
    const r = v as Record<string, unknown> | null;
    if (!r || typeof r !== 'object' || !r.look || typeof r.look !== 'object') continue;
    const e: NonNullable<Settings['styleBackup']>[string] = {
      look: migrateLook(r.look as Partial<Look>, typeof r.accent === 'string' ? r.accent : undefined).look,
      accent: safeColor(r.accent) ?? DEFAULT_ACCENT
    };
    if (DENSITIES.includes(r.density as Density)) e.density = r.density as Density;
    if (typeof r.fontScale === 'number' && Number.isFinite(r.fontScale)) e.fontScale = Math.min(1.5, Math.max(0.85, r.fontScale));
    if (r.bgImage === null) e.bgImage = null;
    else if (r.bgImage !== undefined) {
      const bg = cleanBg(r.bgImage);
      if (bg) e.bgImage = bg;
    }
    out[id.slice(0, 40)] = e;
  }
  return Object.keys(out).length ? out : undefined;
}
