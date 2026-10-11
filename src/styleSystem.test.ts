// Стили: проверка чужого CSS, формат файла .refrainstyle, настройки стиля, сборка итогового CSS.
import { describe, expect, it } from 'vitest';
import { CATALOG } from './mods';
import { safeCssValue, safeFontFamily, safeVarName, sanitizeCss } from './safeCss';
import { attrName, cleanCustomMods, cleanMod, cleanSetting, cleanSettings, cleanSnippets, cleanStyleValues, compileStyles, parseStyleFile, settingEffect, settingValue, STYLE_ATTRS, styleToFile, validAttr } from './styleSystem';
import type { Mod, StyleSetting } from './types';

describe('sanitizeCss: ничего не грузится из сети и не выполняется', () => {
  const bad = (css: string) => sanitizeCss(css);
  it('обычные правила и переменные остаются как есть', () => {
    const css = ':root { --x: 12px; } .a:hover > .b { color: red; background: linear-gradient(135deg, #fff, #000); animation: k 1s; } @keyframes k { to { opacity: 0 } } @media (max-width: 700px) { .a { margin: 0 } }';
    expect(bad(css)).toBe(css);
  });
  it('@import и @namespace убираются, в том числе с экранированием и комментарием', () => {
    for (const css of ['@import url(https://evil/x.css);', '@\\69mport "https://evil/x.css";', '@/**/import "https://evil/x";', '@ IMPORT url("//evil/x")', '@namespace evil url(http://evil);']) expect(bad(css)).not.toMatch(/evil|import/i);
  });
  it('url() — только картинка из самого файла (png, jpeg, webp, gif)', () => {
    expect(bad('.a{background:url("https://evil/x.png")}')).toBe('.a{background:none}');
    expect(bad("a{background:url('//evil/x')}")).toBe('a{background:none}');
    expect(bad('a{background:url(evil.png)}')).toBe('a{background:none}');
    expect(bad('a{background:url("data:image/png;base64,AAAA")}')).toContain('data:image/png;base64,AAAA');
    expect(bad('a{background:url(data:image/jpeg;base64,/9j/4AAQ)}')).toContain('data:image/jpeg');
    expect(bad('a{background:url("data:image/svg+xml;base64,PHN2Zz4=")}')).toBe('a{background:none}');
    expect(bad('a{background:url("data:text/html;base64,PHNjcmlwdD4=")}')).toBe('a{background:none}');
  });
  it('обходы через экранирование, комментарии, регистр и склейку', () => {
    for (const css of ['a{background:\\75rl(https://evil/x)}', 'a{background:\\000075rl(https://evil/x)}', 'a{background:u/**/rl(https://evil/x)}', 'a{background:URL(https://evil/x)}', 'a{background:ur\\6c(https://evil/x)}', 'a{background:u/**/r/**/l(https://evil/x)}']) expect(bad(css)).not.toMatch(/evil/);
    expect(bad('a{background:\\5c 75rl(https://evil/x)}')).not.toMatch(/url\(/i);
    expect(bad('a{x:expreexpression(ssion(1)}')).not.toMatch(/expression\s*\(/i);
    expect(bad('a{x:javajavascript:script:alert(1)}')).not.toMatch(/javascript:/i);
  });
  it('функции, которые тоже умеют грузить картинки, и привязки кода', () => {
    for (const f of ['image-set', '-webkit-image-set', 'cross-fade', 'element', 'image', 'src', 'paint']) expect(bad(`a{b:${f}("https://evil/x" 1x)}`)).not.toMatch(new RegExp(`(^|[^\\w-])${f}\\(`));
    for (const css of ['a{width:expression(alert(1))}', 'a{-moz-binding:url(http://evil/x#y)}', 'a{behavior:url(x.htc)}', 'a{background:javascript:alert(1)}', 'a{b:vbscript:x}']) expect(bad(css)).not.toMatch(/expression\s*\(|-moz-binding|behavior\s*:|javascript:|vbscript:|evil/i);
  });
  it('нельзя вырваться из <style>', () => {
    expect(bad('a{}</style><script>alert(1)</script>')).not.toMatch(/</);
    expect(bad('a{}\\3c /style>')).not.toMatch(/</);
    expect(bad('a{} <!-- x --> b{}')).not.toMatch(/</);
  });
  it('управляющие знаки убираются; размер ограничен', () => {
    expect(bad('a{color:red\u0000}')).toBe('a{color:red}');
    expect(sanitizeCss('a{}'.repeat(100000)).length).toBeLessThanOrEqual(150000);
  });
  it('встроенные стили проходят проверку без изменений', () => {
    for (const m of CATALOG) if (m.css) expect(sanitizeCss(m.css)).toBe(m.css);
  });
});

describe('значения настроек', () => {
  it('safeCssValue пропускает размеры, calc() и списки шрифтов; блокирует всё, что заканчивает объявление или грузит что-то', () => {
    for (const v of ['12px', '1.5rem', 'calc(100% - 20px)', 'var(--accent)', 'color-mix(in srgb, red 20%, white)', "'Comfortaa', sans-serif", '10px 20px']) expect(safeCssValue(v)).toBe(v);
    for (const v of ['red; } body { display: none', 'url(https://evil/x)', 'a /* b */', '}', '{', 'x!important', 'expression(1)', 'calc(1px', '"x', 'a\\b', '<b>', '', 'x'.repeat(200), 'image-set(x)']) expect(safeCssValue(v)).toBeNull();
  });
  it('safeFontFamily и safeVarName', () => {
    expect(safeFontFamily("'Comfortaa', Georgia, serif")).toBe("'Comfortaa', Georgia, serif");
    expect(safeFontFamily('a;b')).toBeNull();
    expect(safeFontFamily('url(x)')).toBeNull();
    expect(safeVarName('--my-var')).toBe('--my-var');
    for (const v of ['my-var', '--', '--A', '--x;y', '--x y', 'color']) expect(safeVarName(v)).toBeNull();
  });
});

describe('настройки стиля (как Style Settings)', () => {
  const color: StyleSetting = { id: 'c', type: 'color', label: 'Цвет', var: '--c', default: '#112233', defaultDark: '#aabbcc' };
  const slider: StyleSetting = { id: 's', type: 'slider', label: 'Размер', var: '--s', min: 10, max: 30, step: 5, unit: 'px', default: 20 };
  const select: StyleSetting = { id: 'f', type: 'select', label: 'Вид', var: '--f', default: 'a', options: [{ value: 'a', label: 'A' }, { value: '12px', label: 'B' }] };
  const toggle: StyleSetting = { id: 't', type: 'toggle', label: 'Вкл', attr: 'sidebar', on: 'right', off: 'left', default: false };

  it('cleanSetting: правильные принимает, неправильные отвергает', () => {
    for (const s of [color, slider, select, toggle]) expect(cleanSetting(s)).toMatchObject({ id: s.id, type: s.type });
    expect(cleanSetting({ ...color, default: 'red; x' })).toBeNull();
    expect(cleanSetting({ ...color, default: 'url(x)' })).toBeNull();
    expect(cleanSetting({ ...color, var: 'color' })).toBeNull();
    expect(cleanSetting({ ...color, var: undefined })).toBeNull();
    expect(cleanSetting({ ...slider, min: 30, max: 10 })).toBeNull();
    expect(cleanSetting({ ...slider, unit: 'url(' })).toMatchObject({ unit: '' });
    expect(cleanSetting({ ...select, options: [{ value: 'a', label: 'A' }] })).toBeNull();
    expect(cleanSetting({ ...select, options: [{ value: 'x;y', label: 'A' }, { value: 'b', label: 'B' }] })).toBeNull();
    expect(cleanSetting({ ...toggle, on: 'middle' })).toBeNull(); // не из списка значений атрибута
    expect(cleanSetting({ ...toggle, attr: 'Bad Attr' })).toBeNull();
    expect(cleanSetting({ id: 'Bad', type: 'toggle', label: 'x', attr: 'x', default: true })).toBeNull();
    expect(cleanSetting({ id: 'x', type: 'unknown', label: 'x' })).toBeNull();
    expect(cleanSetting(null)).toBeNull();
  });
  it('select и toggle без привязки пишут в data-st-<id>', () => {
    const s = cleanSetting({ id: 'grid', type: 'toggle', label: 'Сетка', default: true })!;
    expect(s.attr).toBe('grid');
    expect(attrName('grid')).toBe('data-st-grid');
    expect(attrName('sidebar')).toBe('data-ui-sidebar');
  });
  it('cleanSettings: повторы id и мусор отбрасываются', () => {
    expect(cleanSettings([color, color, { nope: 1 }, slider])!.map((s) => s.id)).toEqual(['c', 's']);
    expect(cleanSettings('x')).toBeUndefined();
    expect(cleanSettings(Array.from({ length: 100 }, (_, i) => ({ ...color, id: 'c' + i })))!.length).toBe(40);
  });
  it('settingValue: значение проверяется по типу, иначе — по умолчанию', () => {
    expect(settingValue(color, '#ff0000')).toBe('#ff0000');
    expect(settingValue(color, 'red; x')).toBe('#112233');
    expect(settingValue(slider, 999)).toBe(30);
    expect(settingValue(slider, -5)).toBe(10);
    expect(settingValue(slider, 17)).toBe(15);
    expect(settingValue(slider, 'x')).toBe(20);
    expect(settingValue(select, 'zzz')).toBe('a');
    expect(settingValue(select, '12px')).toBe('12px');
    expect(settingValue(toggle, true)).toBe(true);
    expect(settingValue(toggle, 'yes')).toBe(false);
  });
  it('settingEffect: переменная с единицей, цвет для тёмной темы, атрибут', () => {
    expect(settingEffect(slider, 25).var).toEqual(['--s', '25px']);
    expect(settingEffect(color, undefined)).toMatchObject({ var: ['--c', '#112233'], darkVar: ['--c', '#aabbcc'] });
    expect(settingEffect(color, '#ff0000').darkVar).toBeUndefined();
    expect(settingEffect(toggle, true).attr).toEqual(['sidebar', 'right']);
    expect(settingEffect(toggle, false).attr).toEqual(['sidebar', 'left']);
    expect(settingEffect({ ...toggle, attr: undefined, var: '--t', on: undefined, off: undefined }, true).var).toEqual(['--t', '1']);
  });
});

const mod = (extra: Partial<Mod> = {}): Mod => ({ id: 'm1', name: 'Пример', description: 'д', ...extra });

describe('сборка итогового CSS', () => {
  it('порядок: нижний стиль перекрывает верхний; переменные — !important (иначе тему на <html> не перекрыть)', () => {
    const a = mod({ id: 'a', name: 'A', vars: { light: { '--accent': '#111111' } }, css: '.x { color: red }', attrs: { sidebar: 'right', content: 'wide' } });
    const b = mod({ id: 'b', name: 'B', vars: { light: { '--accent': '#222222' }, dark: { '--accent': '#333333' } }, attrs: { sidebar: 'top' } });
    const out = compileStyles([{ mod: a }, { mod: b }]);
    expect(out.css.indexOf('/* стиль: A */')).toBeLessThan(out.css.indexOf('/* стиль: B */'));
    expect(out.css).toContain(':root { --accent: #111111 !important; }');
    expect(out.css).toContain(":root[data-theme='dark'] { --accent: #333333 !important; }");
    expect(out.attrs).toEqual({ sidebar: 'top', content: 'wide' });
  });
  it('значения настроек попадают в CSS и атрибуты, чужое в них не пролезает', () => {
    const m = mod({
      settings: [
        { id: 'sz', type: 'slider', label: 's', var: '--sz', min: 0, max: 50, step: 1, unit: 'px', default: 10 },
        { id: 'side', type: 'toggle', label: 't', attr: 'sidebar', on: 'right', off: 'left', default: false },
        { id: 'col', type: 'color', label: 'c', var: '--col', default: '#000000' }
      ]
    });
    const out = compileStyles([{ mod: m, values: { sz: 33, side: true, col: 'red; } body { display:none' } }]);
    expect(out.css).toContain('--sz: 33px !important');
    expect(out.css).toContain('--col: #000000 !important');
    expect(out.css).not.toContain('display:none');
    expect(out.attrs.sidebar).toBe('right');
  });
  it('сниппеты «мой CSS» идут после стилей, выключенные пропускаются, CSS проверяется', () => {
    const out = compileStyles([{ mod: mod({ css: '.a{}' }) }], [{ id: '1', name: 'Один', css: '.b{background:url(https://evil/x)}', on: true }, { id: '2', name: 'Два', css: '.c{}', on: false }]);
    expect(out.css.indexOf('.b{')).toBeGreaterThan(out.css.indexOf('.a{}'));
    expect(out.css).not.toMatch(/evil|\.c\{/);
  });
  it('имя стиля не вырывается из комментария', () => {
    const out = compileStyles([{ mod: mod({ name: '*/ @import url(https://evil/x); /*' }) }]);
    expect(out.css.split('\n')[0]).not.toMatch(/\*\/.*\*\/|@import/);
  });
  it('все встроенные стили собираются: настройки и атрибуты проходят проверку', () => {
    for (const m of CATALOG) {
      if (m.settings) expect(cleanSettings(m.settings)!.length, m.id).toBe(m.settings.length);
      for (const [k, v] of Object.entries(m.attrs ?? {})) expect(validAttr(k, v), `${m.id} ${k}`).toBe(true);
      const out = compileStyles([{ mod: m }]);
      expect(out.css.length, m.id).toBeGreaterThan(10);
      expect(out.css, m.id).not.toMatch(/blocked-fn|: none;/);
    }
  });
});

describe('файл .refrainstyle', () => {
  const full: Mod = mod({ author: 'Аня', version: '1.2', icon: '🌸', css: '.a{color:red}', accent: '#336699', look: { radius: 'round', dark: 'night' }, vars: { light: { '--x': '3px' } }, attrs: { topics: 'tiles' }, settings: [{ id: 'k', type: 'toggle', label: 'К', default: true }] });
  it('сохраняется и читается без потерь', () => {
    const back = parseStyleFile(styleToFile(full), 'new1');
    expect(back).toMatchObject({ id: 'new1', name: 'Пример', author: 'Аня', version: '1.2', icon: '🌸', accent: '#336699', where: 'из файла' });
    expect(back.css).toBe('.a{color:red}');
    expect(back.look).toEqual({ radius: 'round', dark: 'night' });
    expect(back.vars).toEqual({ light: { '--x': '3px' } });
    expect(back.attrs).toEqual({ topics: 'tiles' });
    expect(back.settings![0]).toMatchObject({ id: 'k', type: 'toggle', default: true });
    expect(JSON.parse(styleToFile(full)).kind).toBe('refrain-style');
  });
  it('старые .mnemamod читаются (миграция)', () => {
    const old = JSON.stringify({ kind: 'mnema-mod', name: 'Старый', description: 'x', css: '.btn{min-height:48px}', accent: '#aa0000', look: { radius: 'sharp' } });
    expect(parseStyleFile(old, 'o1')).toMatchObject({ name: 'Старый', css: '.btn{min-height:48px}', accent: '#aa0000', look: { radius: 'sharp' } });
  });
  it('мусор, чужие файлы и стили из будущего — понятные ошибки', () => {
    expect(() => parseStyleFile('{', 'x')).toThrow(/повреждён/);
    expect(() => parseStyleFile('{"kind":"other","name":"x","css":""}', 'x')).toThrow(/не стиль/);
    expect(() => parseStyleFile('[]', 'x')).toThrow(/не стиль/);
    expect(() => parseStyleFile(JSON.stringify({ kind: 'refrain-style', formatVersion: 99, name: 'x', css: '.a{}' }), 'x')).toThrow(/новой версии/);
  });
  it('опасное из файла не проходит: CSS, цвет, оформление, переменные, атрибуты', () => {
    const evil = parseStyleFile(
      JSON.stringify({ kind: 'refrain-style', name: '<b>Хитрый</b>', description: 'd', icon: '<script>', css: '@import url(https://evil/x); .a{background:url(https://evil/y)}', accent: 'red; x', look: { radius: 'bomb', light: 'url(x)', font: 'comic' }, vars: { light: { '--ok': '1px', bad: '2px', '--url': 'url(https://evil/z)' } }, attrs: { sidebar: 'nowhere', tabs: 'pills', 'x y': 'z' } }),
      'e1'
    );
    expect(JSON.stringify(evil)).not.toMatch(/evil|<|import/);
    expect(evil.accent).toBeUndefined();
    expect(evil.look).toBeUndefined();
    expect(evil.vars).toEqual({ light: { '--ok': '1px' } });
    expect(evil.attrs).toEqual({ tabs: 'pills' });
    expect(evil.icon).toBe('📄');
  });
  it('cleanCustomMods: из сохранённых данных берёт только годное и чистит его', () => {
    const out = cleanCustomMods([{ id: 'a', name: 'ок', description: '', css: 'a{b:url(https://evil/x)}' }, { id: 'a', name: 'дубль' }, { name: 'без id' }, null, { id: 'b!', name: '' }]);
    expect(out.map((m) => m.id)).toEqual(['a']);
    expect(out[0].css).toBe('a{b:none}');
  });
  it('cleanMod ограничивает размеры', () => {
    const m = cleanMod({ name: 'x'.repeat(500), description: 'y'.repeat(2000), css: 'a{}', version: 'z'.repeat(50) }, 'id')!;
    expect(m.name.length).toBeLessThanOrEqual(50);
    expect(m.description.length).toBeLessThanOrEqual(240);
    expect(m.version).toBeUndefined();
  });
});

describe('сохранённые сниппеты и значения', () => {
  it('прежний «Свой CSS» становится первым сниппетом', () => {
    const out = cleanSnippets([{ id: 'x', name: 'Два', css: '.b{}', on: false }], '.a{}');
    expect(out.map((s) => [s.id, s.on])).toEqual([['legacy', true], ['x', false]]);
    expect(cleanSnippets(undefined, '   ')).toEqual([]);
    expect(cleanSnippets('x')).toEqual([]);
  });
  it('значения настроек: только строки, числа и да/нет с правильными ключами', () => {
    expect(cleanStyleValues({ s1: { a: 1, b: 'x', c: true, d: { x: 1 }, 'Bad Key': 2 }, s2: 'x', s3: {} })).toEqual({ s1: { a: 1, b: 'x', c: true } });
    expect(cleanStyleValues(null)).toEqual({});
  });
});

describe('атрибуты оформления', () => {
  it('у каждого есть значение по умолчанию из списка и подпись', () => {
    for (const [k, d] of Object.entries(STYLE_ATTRS)) {
      expect(d.options.some((o) => o.value === d.default), k).toBe(true);
      expect(d.label && d.doc).toBeTruthy();
    }
  });
});
