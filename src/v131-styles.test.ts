// Refrain 1.31: «Оформление» — стиль + дополнения + мои правки, перенос из 1.30 без потерь, порядок CSS, шрифты внутри стиля.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from './mods';
import { sanitizeCss } from './safeCss';
import { appearanceOf, classifyRole, countEdits, migrateAppearance, projectAppearance, styleBase, type AppearanceFields } from './styleMigrate';
import type { Appearance, Mod131 } from './styleModel';
import { cleanMod, compileStyles, fontFaceCss, MAX_FONT_BYTES, parseStyleFile, STYLE_FORMAT_131, styleToFile } from './styleSystem';
import { normalizeData } from './store';
import { BASE_STYLES, DEFAULT_ACCENT, DEFAULT_LOOK } from './themes';
import type { Mod, Settings } from './types';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const WOFF = 'data:font/woff2;base64,' + 'A'.repeat(400);

beforeEach(() => {
  const orig = console.error.bind(console);
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    if (!String(a[0]).startsWith('Не удалось сохранить')) orig(...a);
  });
});
afterEach(() => vi.restoreAllMocks());

const old = (settings: Record<string, unknown>) => ({ version: 1, subjects: [], topics: [], cards: [], settings });
const fields = (p: Partial<AppearanceFields> = {}): AppearanceFields => ({
  look: { ...DEFAULT_LOOK, custom: {} },
  accent: DEFAULT_ACCENT,
  density: 'normal',
  fontScale: 1,
  modsOn: [],
  customMods: [],
  styleValues: {},
  cssSnippets: [],
  ...p
});
/** Проекция должна вернуть те же поля, из которых оформление выведено: тогда при переносе ничего не теряется. */
const sameFields = (s: AppearanceFields, a: Appearance) => {
  const p = projectAppearance(a, s.customMods);
  expect(p.look).toEqual({ ...DEFAULT_LOOK, ...s.look, custom: s.look.custom ?? {} });
  expect(p.accent.toLowerCase()).toBe((s.accent ?? DEFAULT_ACCENT).toLowerCase());
  expect(p.density).toBe(s.density ?? 'normal');
  expect(p.fontScale).toBe(s.fontScale ?? 1);
  expect(p.bgImage).toEqual(s.bgImage);
  expect(p.myStyle).toEqual(s.myStyle);
  expect(new Set(p.modsOn)).toEqual(new Set(s.modsOn));
  expect(p.styleValues).toBe(s.styleValues);
};

const bigStyle: Mod131 = { id: 'm-big', name: 'Большой', description: '', vars: { light: { '--bg': '#101010', '--ink': '#f0f0f0' }, dark: { '--bg': '#000000' } }, css: '.card{border-width:2px}', origin: 'file' };
const bigStyle2: Mod131 = { id: 'm-big2', name: 'Ещё большой', description: '', look: { dark: 'coffee' }, accent: '#E0A15B', origin: 'ai' };
const small: Mod131 = { id: 'm-small', name: 'Маленький', description: '', attrs: { grades: 'grid' }, css: '.grades{gap:4px}', origin: 'mine' };

describe('роль стиля', () => {
  it('цвета, фон, вид, шрифты → стиль, иначе дополнение; явная роль главнее', () => {
    expect(classifyRole(bigStyle)).toBe('style');
    expect(classifyRole(bigStyle2)).toBe('style');
    expect(classifyRole(small)).toBe('addon');
    expect(classifyRole({ ...small, bg: { opacity: 0.5 } })).toBe('style');
    expect(classifyRole({ ...small, fonts: [{ family: 'Рука', src: WOFF }] })).toBe('style');
    expect(classifyRole({ ...bigStyle, role: 'addon' })).toBe('addon');
    expect(classifyRole({ ...small, vars: { light: { '--rf-btn-h': '50px' } } })).toBe('addon');
  });
  it('в каталоге стиль — только «Стекло», остальное — дополнения, всё встроенное', () => {
    expect(CATALOG.filter((m) => classifyRole(m) === 'style').map((m) => m.id)).toEqual(['glass']);
    expect(CATALOG.every((m) => m.origin === 'builtin')).toBe(true);
  });
});

describe('перенос из 1.30', () => {
  it('настройки по умолчанию → «Современный» без дополнений и правок', () => {
    const a = migrateAppearance(fields());
    expect(a).toEqual({ v: 1, style: 'modern', addons: [], values: {} });
  });
  it('несколько стилей: стиль — последний включённый «большой», остальные — дополнения в прежнем порядке', () => {
    const s = fields({ customMods: [bigStyle, bigStyle2, small], modsOn: ['notebook', 'm-big', 'glass', 'm-small', 'm-big2'], styleValues: { notebook: { cell: 30 }, glass: { blur: 20 } } });
    s.look = { ...s.look, dark: 'coffee' };
    s.accent = '#E0A15B';
    const a = migrateAppearance(s);
    expect(a.style).toBe('m-big2');
    expect(a.addons).toEqual(['notebook', 'm-big', 'glass', 'm-small']);
    expect(a.values).toEqual({ notebook: { cell: 30 }, glass: { blur: 20 } });
    // look.dark и главный цвет пришли от самого стиля — это не правки
    expect(a.edits).toBeUndefined();
    sameFields(s, a);
  });
  it('myStyle, свои цвета, схема, шрифт, главный цвет, плотность, размер текста и фон → мои правки; ничего не теряется', () => {
    const myStyle = cleanMod({ name: 'Мой вид', vars: { light: { '--rf-btn-h': '48px' } }, attrs: { cards: 'flat' }, css: '.hero{color:red}' }, 'mine', 'мой вид')!;
    const mine: Mod = { id: myStyle.id, name: myStyle.name, description: '', vars: myStyle.vars, attrs: myStyle.attrs, css: myStyle.css };
    const s = fields({
      look: { ...DEFAULT_LOOK, light: 'snow', font: 'nunito', radius: 'round', background: 'grid', custom: { light: { bg: '#FAFAFA' }, dark: { ink: '#EEEEEE' } } },
      accent: '#C2417A',
      density: 'compact',
      fontScale: 1.15,
      bgImage: { v: 2, src: PNG, fade: 0.55, x: 50, y: 50, size: 'cover', zoom: 100, opacity: 0.45, blur: 6, dim: 0, tint: '#000000', fixed: true, underSide: true, sideAlpha: 0.7, underBar: true, barAlpha: 0.78 },
      myStyle: mine,
      cssSnippets: [{ id: 's1', name: 'Скрыть счётчики', css: '.badge{display:none}', on: true }]
    });
    const a = migrateAppearance(s);
    expect(a.style).toBe('modern');
    expect(a.edits).toMatchObject({
      look: { light: 'snow', font: 'nunito', radius: 'round', background: 'grid' },
      accent: '#C2417A',
      density: 'compact',
      fontScale: 1.15,
      attrs: { cards: 'flat' },
      css: '.hero{color:red}',
      vars: { light: { '--bg': '#FAFAFA', '--rf-btn-h': '48px' }, dark: { '--ink': '#EEEEEE' } }
    });
    expect(a.edits!.bg!.src).toBe(PNG);
    expect(countEdits(a.edits)).toBe(4 + 1 + 1 + 1 + 3 + 1 + 1 + 1);
    sameFields(s, a);
    // кусочки CSS переносом не трогаются: их в оформлении нет вовсе
    expect(JSON.stringify(a)).not.toContain('Скрыть счётчики');
  });
  it('«Классический» и пары схем узнаются; одиночная схема — правка поверх «Современного»', () => {
    expect(migrateAppearance(fields({ look: { ...DEFAULT_LOOK, style: 'classic', light: 'paper', dark: 'graphite', headFont: 'literata', custom: {} }, accent: '#3F51D8' }))).toMatchObject({ style: 'classic', addons: [] });
    expect(migrateAppearance(fields({ look: { ...DEFAULT_LOOK, light: 'sand', dark: 'coffee', custom: {} }, accent: '#E0A15B' }))).toEqual({ v: 1, style: 'scheme:coffee', addons: [], values: {} });
    const one = migrateAppearance(fields({ look: { ...DEFAULT_LOOK, dark: 'coffee', custom: {} } }));
    expect(one.style).toBe('modern');
    expect(one.edits?.look).toEqual({ dark: 'coffee' });
  });
  it('по контракту: на входе только поля Migration130 (без главного цвета и плотности) — тоже переносится', () => {
    const a = migrateAppearance({ modsOn: ['m-small'], customMods: [small], myStyle: undefined, styleValues: {}, cssSnippets: [], look: { style: 'classic', light: 'paper', dark: 'graphite', custom: {} } });
    expect(a.style).toBe('classic');
    expect(a.addons).toEqual(['m-small']);
  });
  it('перенос идемпотентен: повторный запуск на перенесённом ничего не меняет', () => {
    const cases: AppearanceFields[] = [
      fields(),
      fields({ customMods: [bigStyle, bigStyle2, small], modsOn: ['m-big', 'glass', 'm-small', 'm-big2'], look: { ...DEFAULT_LOOK, dark: 'coffee', custom: {} }, accent: '#E0A15B' }),
      fields({ modsOn: ['glass', 'notebook'], look: { ...DEFAULT_LOOK, light: 'sky', dark: 'ocean', custom: { dark: { bg: '#000000' } } }, accent: '#4FA3F7', fontScale: 1.2 }),
      fields({ look: { ...DEFAULT_LOOK, style: 'classic', light: 'mint', dark: 'coffee', headFont: 'literata', custom: {} } })
    ];
    for (const s of cases) {
      const a1 = migrateAppearance(s);
      const a2 = migrateAppearance({ ...s, appearance: a1 });
      expect(a2).toEqual(a1);
      // и проекция переноса снова даёт то же оформление
      const p = projectAppearance(a1, s.customMods);
      expect(migrateAppearance({ ...s, ...p, appearance: a1 })).toEqual(a1);
    }
  });
  it('выбранный встроенный стиль запоминается, пока подходит к полям', () => {
    const s = fields({ look: { ...DEFAULT_LOOK, light: 'air', dark: 'coffee', custom: {} }, accent: '#E0A15B' });
    const a = migrateAppearance({ ...s, appearance: { v: 1, style: 'scheme:coffee', addons: [], values: {}, tab: 'addons' } });
    expect(a.style).toBe('scheme:coffee');
    expect(a.edits?.look).toEqual({ light: 'air' });
    expect(a.tab).toBe('addons');
    // откат на 1.30 и выбор «Классического» там: поля главнее, стиль выводится заново
    const back = migrateAppearance({ ...fields({ look: { ...DEFAULT_LOOK, style: 'classic', light: 'paper', dark: 'graphite', headFont: 'literata', custom: {} }, accent: '#3F51D8' }), appearance: a });
    expect(back.style).toBe('classic');
    // чужое значение в сохранённом оформлении не попадает дальше
    expect(migrateAppearance({ ...s, appearance: { style: 42, tab: 'evil' } }).tab).toBeUndefined();
  });
  it('загрузка данных 1.30 переносит оформление, и сохранение с загрузкой его не меняют', () => {
    const d1 = normalizeData(old({ modsOn: ['notebook', 'glass'], customMods: [small], myStyle: { vars: { light: { '--rf-btn-h': '50px' } } }, look: { style: 'modern', light: 'air', dark: 'night', custom: {} }, styleValues: { glass: { blur: 10 } }, cssSnippets: [{ id: 'a', name: 'A', css: '.a{}', on: true }] }));
    const a = d1.settings.appearance!;
    expect(a).toMatchObject({ style: 'glass', addons: ['notebook'], values: { glass: { blur: 10 } }, edits: { vars: { light: { '--rf-btn-h': '50px' } } } });
    const d2 = normalizeData(JSON.parse(JSON.stringify(d1)));
    expect(d2.settings.appearance).toEqual(a);
    expect(d2.settings.modsOn).toEqual(['notebook', 'glass']); // прежние поля остаются для отката
    expect(d2.settings.customMods.map((m) => m.id)).toEqual(['m-small']);
  });
});

describe('проекция и порядок CSS', () => {
  it('выбор встроенного стиля ставит его основу; стиль-мод идёт первым, потом дополнения', () => {
    const p = projectAppearance({ v: 1, style: 'scheme:coffee', addons: ['notebook'], values: {} }, []);
    expect(p.look).toMatchObject({ light: 'sand', dark: 'coffee', style: 'modern' });
    expect(p.accent).toBe(BASE_STYLES.find((b) => b.id === 'scheme:coffee')!.accent);
    expect(p.modsOn).toEqual(['notebook']);
    expect(projectAppearance({ v: 1, style: 'glass', addons: ['notebook', 'compact'], values: {} }, []).modsOn).toEqual(['glass', 'notebook', 'compact']);
    expect(styleBase('classic', [], []).look).toMatchObject({ style: 'classic', headFont: 'literata' });
  });
  it('правка «фон стиля убран» и подстройка картинки стиля без копии картинки', () => {
    const withBg: Mod131 = { id: 'm-bg', name: 'Фон', description: '', bg: { src: PNG, opacity: 0.6 } };
    expect(projectAppearance({ v: 1, style: 'm-bg', addons: [], values: {} }, [withBg]).bgImage?.opacity).toBe(0.6);
    const s = fields({ customMods: [withBg], modsOn: ['m-bg'], bgImage: undefined });
    expect(migrateAppearance(s).edits?.bg).toEqual({ src: '' });
    const moved = projectAppearance({ v: 1, style: 'm-bg', addons: [], values: {} }, [withBg]).bgImage!;
    const a = migrateAppearance({ ...s, bgImage: { ...moved, blur: 20 } });
    expect(a.edits?.bg?.src).toBeUndefined();
    expect(projectAppearance(a, [withBg]).bgImage).toEqual({ ...moved, blur: 20 });
  });
  it('стиль → дополнения → кусочки CSS → мои правки', () => {
    const style: Mod = { id: 's', name: 'S', description: '', css: '.a{color:#111111}' };
    const addon: Mod = { id: 'd', name: 'D', description: '', css: '.a{color:#222222}' };
    const edits: Mod = { id: 'mine', name: 'Мой вид', description: '', css: '.a{color:#444444}' };
    const css = compileStyles([{ mod: style }, { mod: addon }], [{ id: 'x', name: 'X', css: '.a{color:#333333}', on: true }], edits).css;
    const at = (c: string) => css.indexOf(c);
    expect(at('#111111')).toBeLessThan(at('#222222'));
    expect(at('#222222')).toBeLessThan(at('#333333'));
    expect(at('#333333')).toBeLessThan(at('#444444'));
  });
  it('оформление можно прочитать всегда — даже без settings.appearance', () => {
    const s = { ...fields({ modsOn: ['glass'] }) } as Partial<Settings> as AppearanceFields;
    expect(appearanceOf(s).style).toBe('glass');
  });
});

describe('.refrainstyle версии 3: роль, шрифты, откуда', () => {
  it('сохраняется и читается; origin задаёт приложение, а не файл', () => {
    const m = cleanMod({ name: 'Рукописный', role: 'style', fonts: [{ family: 'Рука', src: WOFF, weight: '400 700' }], vars: { light: { '--display': "'Рука', serif" } }, origin: 'builtin' }, 'm-hand')!;
    const text = styleToFile(m);
    const raw = JSON.parse(text);
    expect(raw.formatVersion).toBe(STYLE_FORMAT_131);
    expect(raw.origin).toBeUndefined();
    expect(raw.role).toBe('style');
    const back = parseStyleFile(text, 'n1') as Mod131;
    expect(back.origin).toBe('file');
    expect(back.fonts).toEqual([{ family: 'Рука', src: WOFF, weight: '400 700' }]);
    expect(() => parseStyleFile(JSON.stringify({ ...raw, formatVersion: STYLE_FORMAT_131 + 1 }), 'z')).toThrow(/новой версии/);
  });
  it('шрифт: только data:font woff2/ttf, не больше 400 КБ на шрифт и 1 МБ на стиль; имя без кавычек', () => {
    const big = 'data:font/woff2;base64,' + 'A'.repeat(Math.ceil(((MAX_FONT_BYTES + 10) * 4) / 3));
    const near = 'data:font/ttf;base64,' + 'A'.repeat(Math.floor((MAX_FONT_BYTES * 4) / 3) - 8);
    const m = cleanMod(
      {
        name: 'Ш',
        fonts: [
          { family: 'Сеть', src: 'https://evil.example.com/f.woff2' },
          { family: "Кав'ычка", src: WOFF },
          { family: 'Большой', src: big },
          { family: 'Один', src: near },
          { family: 'Два', src: near },
          { family: 'Три', src: near },
          { family: 'Норм', src: WOFF, style: 'italic', weight: '900' }
        ]
      },
      'x'
    )!;
    expect(m.fonts!.map((f) => f.family)).toEqual(['Один', 'Два', 'Норм']);
    expect(m.fonts![2]).toEqual({ family: 'Норм', src: WOFF, style: 'italic' });
  });
  it('@font-face в CSS стиля вырезается; собирает его приложение из поля fonts, с именем внутри стиля', () => {
    expect(sanitizeCss("@font-face { font-family: X; src: url(https://evil.example.com/x.woff2) } .a{color:red}")).not.toMatch(/font-face|evil/);
    const m = cleanMod({ name: 'Ш', fonts: [{ family: 'Рука', src: WOFF }], vars: { light: { '--display': "'Рука', serif" } }, css: ".h { font-family: 'Рука' }" }, 'm-1')!;
    const css = compileStyles([{ mod: m }]).css;
    expect(fontFaceCss(m)).toContain("font-family: 'Refrain m-1 Рука'");
    expect(css).toContain('@font-face');
    expect(css).toContain("--display: 'Refrain m-1 Рука', serif");
    expect(css).toContain(".h { font-family: 'Refrain m-1 Рука' }");
    expect(css).not.toContain('evil');
  });
});

describe('справочник стилей для ИИ (shared/prompts/styleReference.ts)', () => {
  it('совпадает со свежей генерацией из styleApi/styleSystem/themes', async () => {
    const { STYLE_REFERENCE } = await import('../shared/prompts/styleReference');
    const { styleReference } = await import('./styleAi');
    expect(STYLE_REFERENCE).toBe(styleReference());
  });
});
