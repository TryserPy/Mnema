// Refrain 1.30: «Оформление» — стиль как всё оформление целиком, стили с помощью ИИ, свой фон картинкой.
// Главное здесь — безопасность: файл стиля и ответ ИИ — недоверенные данные, из них остаются только проверенные переменные, атрибуты и CSS.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentAsMod, isPaletteVar, modToCurrent, resetCurrentPatch } from './appearance';
import { BG_SRC, bgCss, cleanBg, cleanBgParams, MAX_BG_SRC_FILE, newBg } from './bgImage';
import { contrast, fixTextColor, parseColor } from './color';
import { sanitizeCss } from './safeCss';
import { askStyle, aiReady, balanceCss, dropGlobalHiding, extractJson, parseAiStyle, styleReference, styleSystemPrompt, styleUserText } from './styleAi';
import { API_CLASSES, API_VARS } from './styleApi';
import { BASE_COLORS, contrastReport, fixContrast } from './styleContrast';
import { bgWithStyle, toggleStyle } from './styleActions';
import { cleanCustomMods, cleanMod, cleanMyStyle, cleanStyleBackup, compileStyles, parseStyleFile, STYLE_ATTRS, STYLE_FORMAT, styleToFile } from './styleSystem';
import { emptyData, getData, normalizeData, replaceData } from './store';
import { DEFAULT_ACCENT, DEFAULT_LOOK, THEMES } from './themes';
import type { Mod, Settings } from './types';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const BASE = { look: { ...DEFAULT_LOOK, custom: {} }, accent: DEFAULT_ACCENT };
/** В тестах без окна сохранение на диск невозможно и пишет в консоль «Не удалось сохранить» — это не ошибка теста. */
beforeEach(() => {
  const orig = console.error.bind(console);
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    if (!String(a[0]).startsWith('Не удалось сохранить')) orig(...a);
  });
});
afterEach(() => vi.restoreAllMocks());

const old = (settings: Record<string, unknown>) => ({ version: 1, subjects: [], topics: [], cards: [], settings });

// ---------- Свой фон картинкой ----------

describe('фон: перенос из 1.29 без изменения вида', () => {
  it('{ src, fade } → видимость = 1 − fade, размытие 10 px, по центру, неподвижно; панель закрывает на fade + 10 %, шапка — как была', () => {
    const b = cleanBg({ src: PNG, fade: 0.82 })!;
    expect(b).toMatchObject({ v: 2, src: PNG, opacity: 0.18, blur: 10, x: 50, y: 50, size: 'cover', fixed: true, dim: 0, underSide: true, sideAlpha: 0.92, underBar: false, barAlpha: 1 });
    const css = bgCss({ src: PNG, fade: 0.82 })!;
    // то же самое, что рисовал CSS 1.29: цвет темы на картинке с прозрачностью fade, панель — fade + 10 %
    expect(css.vars['--bg-fade']).toBe('0.82');
    expect(css.vars['--bg-side']).toBe('0.92');
    expect(css.vars['--bg-blur']).toBe('10px');
    expect(css.vars['--bg-size']).toBe('cover');
    expect(css.vars['--bg-pos']).toBe('50% 50%');
    expect(css.vars['--bg-dim']).toBe('transparent');
    expect(css.data).toMatchObject({ bgimg: '1', bgfix: 'fixed', bgside: 'under', bgbar: 'solid' });
  });
  it('границы старого fade (0,72–0,95) и «пустой» fade работают как раньше', () => {
    expect(cleanBg({ src: PNG, fade: 0.1 })!.fade).toBe(0.72);
    expect(cleanBg({ src: PNG, fade: 5 })!.fade).toBe(0.95);
    expect(cleanBg({ src: PNG })!.fade).toBe(0.78);
    expect(cleanBg({ src: PNG, fade: NaN })!.fade).toBe(0.78);
    expect(cleanBg({ src: PNG, fade: 'x' })!.opacity).toBeCloseTo(0.22);
  });
  it('новое: видимость честно от 0 до 100 %, остальное ограничено', () => {
    const b = cleanBg({ ...newBg(PNG), opacity: 1, blur: 999, dim: 5, zoom: 5000, x: -10, y: 300, sideAlpha: 0, barAlpha: 9 })!;
    expect(b).toMatchObject({ opacity: 1, blur: 40, dim: 0.85, zoom: 400, x: 0, y: 100, sideAlpha: 0.3, barAlpha: 1 });
    expect(cleanBg({ ...newBg(PNG), opacity: 0 })!.opacity).toBe(0);
    expect(bgCss({ ...newBg(PNG), opacity: 1 })!.vars['--bg-fade']).toBe('0');
    expect(bgCss({ ...newBg(PNG), opacity: 0 })!.vars['--bg-fade']).toBe('1');
  });
  it('размер: вписать, масштаб в % и плитка', () => {
    expect(bgCss({ ...newBg(PNG), size: 'contain' })!.vars['--bg-size']).toBe('contain');
    expect(bgCss({ ...newBg(PNG), size: 'zoom', zoom: 150 })!.vars['--bg-size']).toBe('150% auto');
    const tile = bgCss({ ...newBg(PNG), size: 'tile', zoom: 25 })!.vars;
    expect(tile['--bg-repeat']).toBe('repeat');
    expect(tile['--bg-size']).toBe('25% auto');
  });
  it('цвет поверх картинки; панель под фоном — по выбору; у прокручиваемой картинки панель всегда обычная', () => {
    expect(bgCss({ ...newBg(PNG), dim: 0.4, tint: '#112233' })!.vars['--bg-dim']).toBe('color-mix(in srgb, #112233 40%, transparent)');
    expect(bgCss({ ...newBg(PNG), tint: 'red; background: url(http://evil)' })!.vars['--bg-dim']).toBe('transparent');
    expect(bgCss({ ...newBg(PNG), underSide: false })!.data.bgside).toBe('solid');
    expect(bgCss({ ...newBg(PNG), fixed: false })!.data).toMatchObject({ bgfix: 'scroll', bgside: 'solid', bgbar: 'solid' });
    // выдвижная панель на телефоне лежит поверх текста — ей не меньше 94 %
    expect(bgCss({ ...newBg(PNG), sideAlpha: 0.4 })!.vars['--bg-side-drawer']).toBe('0.94');
    expect(bgCss({ ...newBg(PNG), underBar: true, barAlpha: 0.5 })!.data.bgbar).toBe('under');
  });
  it('чужое и битое отбрасывается; в CSS попадает только картинка внутри данных', () => {
    for (const src of [5, null, undefined, 'https://evil.example/x.png', 'javascript:alert(1)', 'data:text/html;base64,PGI+', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAA")}body{display:none', 'data:image/png;base64,' + 'A'.repeat(4_000_001)]) {
      expect(cleanBg({ src, fade: 0.8 }), String(src).slice(0, 30)).toBeNull();
      expect(cleanBg({ ...newBg(PNG), src }), String(src).slice(0, 30)).toBeNull();
      expect(bgCss({ src })).toBeNull();
    }
    expect(cleanBg(null)).toBeNull();
    expect(cleanBg('data:image/png;base64,AA==')).toBeNull();
    expect(BG_SRC.test(PNG)).toBe(true);
    const b = cleanBg({ ...newBg(PNG), size: 'evil', tint: 'url(x)', x: 'a', fixed: 'no' })!;
    expect(b).toMatchObject({ size: 'cover', tint: '#000000', x: 50, fixed: true });
  });
  it('в данных (normalizeData) старый фон переносится, чужой отбрасывается, повторная загрузка ничего не меняет', () => {
    const s1 = normalizeData(old({ bgImage: { src: PNG, fade: 0.8 } })).settings;
    expect(s1.bgImage).toMatchObject({ v: 2, opacity: 0.2, fade: 0.8 });
    const s2 = normalizeData({ ...old({}), settings: s1 }).settings;
    expect(s2.bgImage).toEqual(s1.bgImage);
    expect(normalizeData(old({ bgImage: { src: 'https://evil/x.png', fade: 0.8 } })).settings.bgImage).toBeUndefined();
  });
  it('параметры фона в файле стиля: картинка по желанию и только небольшая', () => {
    expect(cleanBgParams({ opacity: 0.3, blur: 5 })).toEqual({ opacity: 0.3, blur: 5 });
    expect(cleanBgParams({ nothing: 1 })).toBeUndefined();
    expect(cleanBgParams({ src: PNG, opacity: 0.5 })!.src).toBe(PNG);
    expect(cleanBgParams({ src: 'data:image/png;base64,' + 'A'.repeat(MAX_BG_SRC_FILE) })).toBeUndefined();
    expect(cleanBgParams({ src: 'http://evil/x.png', blur: 2 })).toEqual({ blur: 2 });
  });
  it('стиль с фоном: фон подстраивается под картинку, которая уже стоит; без картинки нигде — ничего', () => {
    const cur = newBg(PNG);
    expect(bgWithStyle(cur, { opacity: 0.9 })!.opacity).toBe(0.9);
    expect(bgWithStyle(undefined, { opacity: 0.9 })).toBeUndefined();
    expect(bgWithStyle(undefined, { src: PNG, opacity: 0.9 })!.src).toBe(PNG);
  });
});

// ---------- Всё оформление как стиль ----------

describe('«Настроить текущий»: оформление ⇄ стиль', () => {
  const settings = (): Pick<Settings, 'look' | 'accent' | 'density' | 'fontScale' | 'bgImage' | 'myStyle'> => ({ look: { ...DEFAULT_LOOK, custom: {} }, accent: DEFAULT_ACCENT, density: 'normal', fontScale: 1, bgImage: undefined, myStyle: undefined });
  it('туда и обратно без потерь: цвета темы, шрифт, плотность, размер текста, фон, «Мой вид»', () => {
    const s = settings();
    s.look = { ...s.look, font: 'nunito', radius: 'round', custom: { light: { bg: '#fafafa' }, dark: { ink: '#eeeeee' } } };
    s.density = 'comfy';
    s.fontScale = 1.15;
    s.bgImage = newBg(PNG);
    s.myStyle = cleanMyStyle({ vars: { light: { '--rf-btn-h': '50px' } }, attrs: { cards: 'flat' }, css: '.hero { color: red }' });
    const m = currentAsMod(s);
    expect(m.vars?.light).toMatchObject({ '--bg': '#fafafa', '--rf-btn-h': '50px' });
    expect(m.vars?.dark).toEqual({ '--ink': '#eeeeee' });
    const back = modToCurrent(m, s);
    expect(back).toEqual({ ...s, myStyle: s.myStyle });
  });
  it('цвета темы из редактора уходят в look.custom, остальные переменные — в «Мой вид»', () => {
    const s = settings();
    const m = { ...currentAsMod(s), vars: { light: { '--bg': '#101010', '--radius': '3px' }, dark: { '--surface': '#202020' } } };
    const out = modToCurrent(m, s);
    expect(out.look.custom).toEqual({ light: { bg: '#101010' }, dark: { surface: '#202020' } });
    expect(out.myStyle?.vars).toEqual({ light: { '--radius': '3px' } });
    expect(isPaletteVar('--bg')).toBe(true);
    expect(isPaletteVar('--radius')).toBe(false);
  });
  it('чужое из редактора не проходит: плохой акцент, плотность, масштаб, цвета', () => {
    const s = settings();
    const m: Mod = { ...currentAsMod(s), accent: 'red; x:y', density: 'huge' as never, fontScale: 99, vars: { light: { '--bg': 'url(http://evil)', '--x': 'url(http://evil)' } } };
    const out = modToCurrent(m, s);
    expect(out.accent).toBe(DEFAULT_ACCENT);
    expect(out.density).toBe('huge'); // плотность проверяет cleanMod при сохранении как стиля; в настройках её ограничивает интерфейс
    expect(out.fontScale).toBe(1.5);
    expect(out.look.custom).toEqual({});
    expect(out.myStyle).toBeUndefined();
  });
  it('сброс возвращает вид «как после установки», но не трогает включённые стили', () => {
    const p = resetCurrentPatch();
    expect(p).toMatchObject({ accent: DEFAULT_ACCENT, density: 'normal', fontScale: 1, bgImage: undefined, myStyle: undefined });
    expect(p.look).toEqual({ ...DEFAULT_LOOK, custom: {} });
    expect('modsOn' in p).toBe(false);
  });
  it('«Мой вид» применяется последним, поверх включённых стилей', () => {
    const a: Mod = { id: 'a', name: 'A', description: '', vars: { light: { '--accent': '#111111' } } };
    const mine = cleanMyStyle({ vars: { light: { '--accent': '#222222' } } })!;
    const out = compileStyles([{ mod: a }, { mod: mine }]).css;
    expect(out.lastIndexOf('#222222')).toBeGreaterThan(out.lastIndexOf('#111111'));
  });
});

describe('файл стиля версии 2', () => {
  it('плотность, размер текста и фон лежат в стиле; старые файлы открываются как раньше', () => {
    expect(STYLE_FORMAT).toBe(2);
    const m = cleanMod({ name: 'Всё', density: 'compact', fontScale: 1.2, bg: { opacity: 0.4, blur: 3 }, vars: { light: { '--bg': '#fff' } } }, 'x')!;
    expect(m).toMatchObject({ density: 'compact', fontScale: 1.2, bg: { opacity: 0.4, blur: 3 } });
    const back = parseStyleFile(styleToFile(m), 'y');
    expect(back).toMatchObject({ density: 'compact', fontScale: 1.2, bg: { opacity: 0.4, blur: 3 } });
    const v1 = JSON.stringify({ kind: 'refrain-style', formatVersion: 1, name: 'Старый', css: '.a{color:red}', vars: { light: { '--accent': '#112233' } } });
    expect(parseStyleFile(v1, 'z')).toMatchObject({ name: 'Старый', css: '.a{color:red}' });
    expect(() => parseStyleFile(JSON.stringify({ kind: 'refrain-style', formatVersion: 3, name: 'Новый', css: 'a{}' }), 'q')).toThrow(/новой версии/);
    expect(parseStyleFile(JSON.stringify({ kind: 'mnema-mod', name: 'Мод', css: 'a{}' }), 'q').name).toBe('Мод');
  });
  it('картинка фона попадает в файл только по просьбе и если небольшая; из файла — только настоящая картинка', () => {
    const m = cleanMod({ name: 'Фон', bg: { src: PNG, opacity: 0.5 } }, 'x')!;
    expect(JSON.parse(styleToFile(m)).bg).toEqual({ opacity: 0.5 });
    expect(JSON.parse(styleToFile(m, { image: true })).bg.src).toBe(PNG);
    const evil = JSON.stringify({ kind: 'refrain-style', name: 'Злой', bg: { src: 'https://evil/x.png', opacity: 0.5 }, css: 'a{}' });
    expect(parseStyleFile(evil, 'e').bg).toEqual({ opacity: 0.5 });
  });
  it('картинок в сохранённых стилях всего не больше ≈6 МБ', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(1_400_000);
    const list = Array.from({ length: 6 }, (_, i) => ({ id: 's' + i, name: 'S' + i, description: '', bg: { src: big, opacity: 0.3 } }));
    const out = cleanCustomMods(list);
    expect(out.filter((m) => m.bg?.src).length).toBeLessThanOrEqual(4);
    expect(out).toHaveLength(6);
  });
  it('запомненное «как было» тоже проверяется (из чужой копии данных)', () => {
    const b = cleanStyleBackup({ a: { look: DEFAULT_LOOK, accent: 'evil', density: 'comfy', fontScale: 50, bgImage: { src: 'http://evil/x', fade: 1 } }, b: 5, c: { look: 5 } })!;
    expect(Object.keys(b)).toEqual(['a']);
    expect(b.a).toMatchObject({ accent: DEFAULT_ACCENT, density: 'comfy', fontScale: 1.5 });
    expect(b.a.bgImage).toBeUndefined();
  });
  it('включили стиль с плотностью, размером текста и фоном — выключили: всё вернулось', () => {
    replaceData(emptyData());
    const s0 = getData().settings;
    const m: Mod = { id: 'full', name: 'Полный', description: '', density: 'compact', fontScale: 1.2, bg: { src: PNG, opacity: 0.6 } };
    toggleStyle(m, true);
    expect(getData().settings).toMatchObject({ density: 'compact', fontScale: 1.2 });
    expect(getData().settings.bgImage).toMatchObject({ src: PNG, opacity: 0.6 });
    toggleStyle(m, false);
    expect(getData().settings.density).toBe(s0.density);
    expect(getData().settings.fontScale).toBe(s0.fontScale);
    expect(getData().settings.bgImage).toBeUndefined();
    expect(getData().settings.styleBackup).toEqual({});
  });
  it('в справке (API_VARS) есть все цвета из CSS, а значения по умолчанию в BASE_COLORS совпадают с styles.css', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
    for (const [mode, sel] of [['light', ':root {'], ['dark', ":root[data-theme='dark'] {"]] as const) {
      const text = block(sel);
      for (const [name, value] of Object.entries(BASE_COLORS[mode])) {
        const m = new RegExp(name.replace(/[-]/g, '\\-') + ':\\s*(#[0-9A-Fa-f]{6})').exec(text);
        expect(m?.[1]?.toUpperCase(), `${mode} ${name}`).toBe(value.toUpperCase());
      }
    }
    const names = API_VARS.flatMap((g) => g.vars.map((v) => v.name));
    for (const n of ['--accent', '--bg', '--side', '--surface', '--ink', '--muted', '--line', '--again-bg', '--hard-ink', '--good-bg', '--easy-ink', '--tip-bg', '--mark', '--mono', '--rf-body-lh', '--rf-card-shadow']) expect(names, n).toContain(n);
  });
});

// ---------- Читаемость ----------

describe('контраст текста и фона', () => {
  it('parseColor понимает #rgb, #rrggbbaa, rgb(), hsl(); мусор — null', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#112233ff')).toEqual([17, 34, 51]);
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseColor('rgba(10 20 30 / 0.5)')).toEqual([10, 20, 30]);
    expect(parseColor('hsl(0, 100%, 50%)')).toEqual([255, 0, 0]);
    expect(parseColor('red')).toBeNull();
    expect(parseColor('url(x)')).toBeNull();
  });
  it('fixTextColor сохраняет оттенок и добивается 4,5:1', () => {
    const bg = parseColor('#1B1E24')!;
    const fg = parseColor('#3A3F4E')!;
    const fixed = fixTextColor(fg, bg);
    expect(contrast(fixed, bg)).toBeGreaterThanOrEqual(4.5);
    expect(fixTextColor(parseColor('#ffffff')!, bg)).toEqual([255, 255, 255]);
  });
  it('серый текст на сером фоне исправляется, обе темы', () => {
    const m: Mod = { id: 'x', name: 'x', description: '', vars: { light: { '--bg': '#888888', '--surface': '#8A8A8A', '--ink': '#999999' }, dark: { '--bg': '#303030', '--surface': '#353535', '--ink': '#444444', '--muted': '#505050' } } };
    expect(contrastReport(m, BASE).some((r) => !r.ok)).toBe(true);
    const { mod, fixes } = fixContrast(m, BASE);
    expect(fixes.length).toBeGreaterThan(0);
    expect(contrastReport(mod, BASE).filter((r) => !r.ok && r.text !== '--accent-text')).toEqual([]);
  });
  it('тёмный фон без указанного текста: текст темы тоже подтягивается', () => {
    const m: Mod = { id: 'x', name: 'x', description: '', vars: { light: { '--bg': '#0B1020', '--surface': '#101830', '--side': '#0B1020', '--sunken': '#182040' } } };
    const { mod } = fixContrast(m, BASE);
    expect(mod.vars?.light?.['--ink']).toBeDefined();
    expect(contrastReport(mod, BASE).filter((r) => !r.ok && r.mode === 'light')).toEqual([]);
  });
  it('нормальный стиль не трогается', () => {
    const m: Mod = { id: 'x', name: 'x', description: '', vars: { light: { '--accent': '#1F7A6B' } } };
    expect(fixContrast(m, BASE).fixes).toEqual([]);
    expect(fixContrast({ id: 'x', name: 'x', description: '' }, BASE).fixes).toEqual([]);
  });
  it('светлый акцент в тёмной теме: подсчитывается цвет текста на нём и сам акцент как текст', () => {
    const m: Mod = { id: 'x', name: 'x', description: '', accent: '#FFE680', vars: { light: { '--accent': '#FFE680', '--surface': '#FFFFFF' } } };
    const { mod } = fixContrast(m, BASE);
    expect(mod.vars?.light?.['--accent-text']).toBeDefined();
  });
});

// ---------- ИИ: разбор ответа ----------

const GOOD = { name: 'Космос', description: 'Тёмный космос', icon: '🚀', look: { dark: 'midnight' }, accent: '#7C8CFF', vars: { light: { '--bg': '#EEF0FF' }, dark: { '--bg': '#05060F', '--ink': '#EAF0FF' } }, attrs: { cards: 'flat' }, css: '.hero { box-shadow: 0 0 24px #7C8CFF; }' };
const ok = (text: string) => parseAiStyle(text, { id: 'ai1', base: BASE });

describe('ИИ: ответ разбирается, даже если он кривой', () => {
  it('чистый JSON', () => {
    const r = ok(JSON.stringify(GOOD));
    expect(r.mod).toMatchObject({ name: 'Космос', icon: '🚀', accent: '#7C8CFF', look: { dark: 'midnight' }, attrs: { cards: 'flat' } });
    expect(r.mod.css).toContain('.hero');
    expect(r.mod.where).toBe('ИИ');
  });
  it('в ```json-обёртке, с текстом до и после', () => {
    const r = ok('Конечно! Вот стиль:\n```json\n' + JSON.stringify(GOOD, null, 2) + '\n```\nНадеюсь, понравится.');
    expect(r.mod.name).toBe('Космос');
    expect(ok('```\n' + JSON.stringify(GOOD) + '\n```').mod.name).toBe('Космос');
    expect(ok('Держи: ' + JSON.stringify(GOOD) + ' — готово!').mod.name).toBe('Космос');
  });
  it('лишние запятые, комментарии, настоящие переводы строк внутри css', () => {
    const text = '{\n "name": "Т", // название\n "accent": "#112233",\n /* цвета */ "vars": {"light": {"--bg": "#fafafa",},},\n "css": ".a {\n  color: red;\n}\n",\n}';
    const r = ok(text);
    expect(r.mod).toMatchObject({ name: 'Т', accent: '#112233' });
    expect(r.mod.css).toContain('color: red');
    expect(r.mod.vars?.light?.['--bg']).toBe('#fafafa');
  });
  it('обрезанный ответ: закрываем скобки, обрезанный CSS урезаем до целых правил', () => {
    const full = JSON.stringify({ ...GOOD, css: '.hero { color: red; } .card { border-radius: 4px; } .btn { background: linear-gradient(red, ' });
    for (const cut of [full.length - 3, full.length - 40, full.indexOf('"attrs"') + 4, full.indexOf('"vars"') + 20]) {
      const r = ok(full.slice(0, cut));
      expect(r.mod.name).toBe('Космос');
    }
    const r = ok(full.slice(0, full.length - 3));
    expect(r.mod.css).toBe('.hero { color: red; } .card { border-radius: 4px; }');
    expect(r.notes.join(' ')).toMatch(/Обрезанный/);
  });
  it('стиль внутри обёртки {"style": {…}} и vars без деления на темы', () => {
    expect(ok(JSON.stringify({ style: GOOD })).mod.name).toBe('Космос');
    const r = ok(JSON.stringify({ name: 'П', vars: { '--accent': '#112233', '--radius': '20px' } }));
    expect(r.mod.vars?.light).toMatchObject({ '--radius': '20px' });
    expect(r.mod.vars?.dark).toMatchObject({ '--radius': '20px' });
  });
  it('нет названия — берём из просьбы; нет JSON, пустой ответ, пустой стиль — понятная ошибка', () => {
    expect(parseAiStyle('{"accent":"#112233"}', { id: 'a', fallbackName: 'Мой космос', base: BASE }).mod.name).toBe('Мой космос');
    expect(() => ok('Извини, не могу.')).toThrow(/не стилем/);
    expect(() => ok('')).toThrow();
    expect(() => ok('{"name":"Пусто"}')).toThrow(/не придумал/);
    expect(() => ok('{"name":"Пусто","vars":{"light":{"не переменная":"#fff"}},"css":"   "}')).toThrow(/не придумал/);
  });
  it('JSON рядом с текстом, где есть фигурные скобки', () => {
    const r = ok('Стиль {будет} такой: ' + JSON.stringify(GOOD));
    expect(r.mod.name).toBe('Космос');
  });
});

describe('ИИ: вредный ответ вычищается полностью', () => {
  const evil = {
    name: 'Злой <script>alert(1)</script>',
    description: 'd',
    css: [
      '@import url("https://evil.example/x.css");',
      '.a { background: url(https://evil.example/pixel.png); }',
      '.b { background: url("//evil.example/x"); width: expression(alert(1)); -moz-binding: url(http://evil#x); behavior: url(x.htc); }',
      '.c { background: \\75rl(http://evil.example/e.png) }',
      '.d { background-image: image-set("http://evil.example/e.png" 1x) }',
      '</style><script>alert(1)</script>',
      '.e { color: red }'
    ].join('\n'),
    vars: { light: { '--accent': 'url(http://evil.example/x)', '--bg': 'red; } body { display: none', '--ok': '#112233', 'bad name': '#fff', '--x': 'javascript:alert(1)' } },
    attrs: { sidebar: 'right; evil', cards: 'flat', unknownattr: 'a b' },
    look: { font: 'evil-font', light: 'air', radius: '9999' },
    bg: { src: 'https://evil.example/x.png', opacity: 0.5 }
  };
  it('нет ссылок в сеть, @import, выражений, скриптов, вырвавшихся значений', () => {
    const r = ok(JSON.stringify(evil));
    const out = compileStyles([{ mod: r.mod }]).css;
    expect(out).not.toMatch(/@import|expression\s*\(|-moz-binding|behavior\s*:|javascript:|<|url\s*\(/i);
    expect(out.replace(/blocked-fn\([^)]*\)/g, '')).not.toMatch(/https?:|\/\/evil/i); // image-set(…) переименована в нерабочую blocked-fn(…)
    expect(out).toContain('.e { color: red }');
    expect(r.mod.name).not.toMatch(/[<>]/);
    expect(r.mod.vars?.light?.['--ok']).toBe('#112233');
    expect(r.mod.vars?.light?.['--accent']).toBeUndefined();
    expect(r.mod.vars?.light?.['--bg']).toBeUndefined();
    expect(Object.keys(r.mod.vars?.light ?? {}).every((k) => /^--[a-z]/.test(k))).toBe(true);
    expect(r.mod.attrs).toEqual({ cards: 'flat' });
    expect(r.mod.look).toEqual({ light: 'air' });
    expect(r.mod.bg?.src).toBeUndefined();
    expect(r.notes.length).toBeGreaterThan(0);
  });
  it('огромный CSS отрезается, цельные правила остаются', () => {
    const rule = '.card { border-radius: 8px; }\n';
    const huge = rule.repeat(5000); // ≈150 000 знаков
    const r = ok(JSON.stringify({ name: 'Огромный', css: huge }));
    expect((r.mod.css ?? '').length).toBeLessThanOrEqual(12000);
    expect(r.mod.css!.endsWith('}')).toBe(true);
    expect(balanceCss('a { b: c; } d { e: ')).toBe('a { b: c; }');
    expect(balanceCss('a { b: "}" } c {')).toBe('a { b: "}" }');
    expect(balanceCss('} a { }')).toBe('');
  });
  it('правила, которые прячут весь интерфейс, выбрасываются', () => {
    const r = ok(JSON.stringify({ name: 'Пустой экран', css: 'body { display: none } .app, .main { visibility: hidden } * { pointer-events: none } .card { color: red } .sidebar { position: fixed; inset: 0 }' }));
    expect(r.mod.css).toContain('.card { color: red }');
    expect(r.mod.css).not.toMatch(/display:\s*none|visibility|pointer-events|position:\s*fixed/);
    expect(dropGlobalHiding('.hero { display: none }').dropped).toBe(0); // отдельные элементы можно скрывать (стиль «Спокойный»)
  });
  it('без стиля в ответе (только вредное) — всё равно безопасно', () => {
    expect(() => ok('{"name":"Х","css":"@import url(http://evil/x.css);"}')).toThrow(/не придумал/);
  });
  it('ИИ не может положить свою картинку фона, а числа фона проходят проверку', () => {
    const r = ok(JSON.stringify({ name: 'Фон', bg: { src: PNG, opacity: 7, blur: -5 }, accent: '#112233' }));
    expect(r.mod.bg).toEqual({ opacity: 1, blur: 0 });
  });
  it('в итоговом стиле контраст исправлен автоматически', () => {
    const r = ok(JSON.stringify({ name: 'Серый', vars: { light: { '--bg': '#808080', '--surface': '#858585', '--ink': '#909090' } } }));
    expect(r.fixes.length).toBeGreaterThan(0);
    expect(contrastReport(r.mod, BASE).filter((x) => !x.ok && x.mode === 'light' && ['--ink', '--ink-2'].includes(x.text))).toEqual([]);
  });
});

describe('ИИ: запрос к модели', () => {
  it('справочник собран из styleApi.ts и styleSystem.ts: все переменные, атрибуты и классы на месте', () => {
    const ref = styleReference();
    for (const g of API_VARS) for (const v of g.vars) expect(ref, v.name).toContain(v.name);
    for (const k of Object.keys(STYLE_ATTRS)) expect(ref, k).toContain(k + ':');
    for (const c of API_CLASSES) expect(ref, c.name).toContain(c.name);
    for (const t of THEMES) expect(ref, t.id).toContain(t.id);
    expect(ref.length).toBeLessThan(14000);
  });
  it('системный текст — через aiSystem и без обещаний лишнего', () => {
    const p = styleSystemPrompt();
    expect(p).toMatch(/ТОЛЬКО один JSON/);
    expect(p).toMatch(/не ниже 4\.5/);
    expect(p).toMatch(/@import/);
  });
  it('просьба и текущий стиль для «доработать»: без картинки фона, длина ограничена', () => {
    const cur: Mod = { id: 'a', name: 'А', description: '', css: '.a{}', bg: { src: PNG, opacity: 0.3 } };
    const t = styleUserText('  сделай   темнее ', cur);
    expect(t).toContain('сделай темнее');
    expect(t).toContain('"css":".a{}"');
    expect(t).not.toContain('base64');
    expect(styleUserText('х'.repeat(5000)).length).toBeLessThan(900);
  });
  it('askStyle: запрос уходит в aiAsk, ответ превращается в безопасный стиль; ошибки по-русски', async () => {
    const calls: { system?: string; text: string }[] = [];
    const w = globalThis as unknown as { window?: unknown };
    const prev = w.window;
    w.window = { mnemaApi: { aiAsk: async (r: { system?: string; text: string }) => (calls.push(r), { ok: true as const, text: '```json\n' + JSON.stringify({ name: 'Тест', css: '.a{background:url(http://evil/x)}', accent: '#112233' }) + '\n```' }) } };
    try {
      const r = await askStyle('тёмный космос', { id: 'n1', base: BASE });
      expect(calls[0].system).toContain('СПРАВОЧНИК');
      expect(calls[0].text).toContain('тёмный космос');
      expect(r.mod.css).not.toMatch(/url\(/);
      expect(r.mod.id).toBe('n1');
      w.window = { mnemaApi: { aiAsk: async () => ({ ok: false as const, error: '401: bad' }) } };
      await expect(askStyle('х', { id: 'n', base: BASE })).rejects.toThrow(/ключ/);
      w.window = { mnemaApi: { aiAsk: async () => ({ ok: true as const, text: 'Извини, не могу' }) } };
      await expect(askStyle('х', { id: 'n', base: BASE })).rejects.toThrow(/не стилем/);
      w.window = {};
      await expect(askStyle('х', { id: 'n', base: BASE })).rejects.toThrow(/ИИ-помощник/);
    } finally {
      w.window = prev;
    }
  });
  it('aiReady подсказывает, куда зайти', async () => {
    const w = globalThis as unknown as { window?: unknown };
    const prev = w.window;
    const data = emptyData();
    try {
      w.window = {};
      expect(await aiReady(data)).toMatchObject({ ok: false });
      w.window = { mnemaApi: { aiAsk: async () => ({ ok: true, text: '' }) } };
      expect(await aiReady(data)).toMatchObject({ ok: false, go: 'features' });
      data.settings.features.ai = true;
      w.window = { mnemaApi: { aiAsk: async () => ({ ok: true, text: '' }), aiGetConfig: async () => ({ provider: 'anthropic', custom: [], hasKey: { anthropic: false, gemini: false } }) } };
      expect(await aiReady(data)).toMatchObject({ ok: false, go: 'ai' });
      w.window = { mnemaApi: { aiAsk: async () => ({ ok: true, text: '' }), aiGetConfig: async () => ({ provider: 'anthropic', custom: [], hasKey: { anthropic: true, gemini: false } }) } };
      expect(await aiReady(data)).toEqual({ ok: true });
    } finally {
      w.window = prev;
    }
  });
});

describe('extractJson', () => {
  it('не зависает на длинном мусоре со скобками', () => {
    const t0 = Date.now();
    expect(extractJson('{'.repeat(30000))).toBeUndefined();
    expect(extractJson('{"a": ' + '['.repeat(20000))).toBeDefined();
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  it('sanitizeCss — последний рубеж: то, что осталось после разбора, ещё раз проходит проверку', () => {
    const r = ok(JSON.stringify({ name: 'Н', css: '.a { background: u/**/rl(http://evil/x) }' }));
    expect(sanitizeCss(r.mod.css ?? '')).toBe(r.mod.css);
    expect(r.mod.css).not.toMatch(/url\s*\(\s*['"]?http/i);
  });
  it('все цвета из STYLE_ATTRS/vars проходят через cleanMod: ничего лишнего в стиле', () => {
    const m = cleanMod({ name: 'x', vars: { light: { '--a': 'calc(1px + 2px)', '--b': 'url(x)' } }, attrs: { sidebar: 'rail' } }, 'x')!;
    expect(m.vars?.light).toEqual({ '--a': 'calc(1px + 2px)' });
  });
});
