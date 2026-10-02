// Партия «защита»: чужой файл не должен запускать код, уводить пароль облака, прятать части окна или грузить что-то из сети.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOG, modsCss, sanitizeCss } from './mods';
import { cleanModName, safeColor, safeStyleAttr } from './safeCss';
import { emptyData, neutralizeForeign, normalizeData } from './store';

describe('безопасные цвета из файлов стилей', () => {
  it('принимает обычные цвета', () => {
    for (const c of ['#fff', '#1A2b3C', '#11223344', 'rgb(10, 20, 30)', 'rgba(10,20,30,0.5)', 'hsl(200 50% 40%)']) expect(safeColor(c)).toBe(c);
  });
  it('отвергает всё, что не цвет', () => {
    for (const c of ['url("file://host/x")', 'url(https://evil/x)', 'red; background: url(x)', '#12', 'var(--x)', '', 5, null, undefined, {}]) expect(safeColor(c)).toBeNull();
  });
});

describe('style="…" внутри формул', () => {
  it('оставляет размеры и сдвиги, которые кладёт KaTeX', () => {
    expect(safeStyleAttr('height:0.8641em;vertical-align:-0.0833em;')).toBe('height:0.8641em;vertical-align:-0.0833em');
    expect(safeStyleAttr('top:-3.063em;margin-right:0.05em;')).toBe('top:-3.063em;margin-right:0.05em');
    expect(safeStyleAttr('color:#cc0000;')).toBe('color:#cc0000');
  });
  it('выбрасывает подделку на всё окно и загрузку по сети', () => {
    expect(safeStyleAttr('position:fixed;inset:0;z-index:99999')).toBe('');
    expect(safeStyleAttr('height:1em;position:absolute;top:0')).toBe('height:1em;top:0');
    expect(safeStyleAttr('background:url(https://evil/x)')).toBe('');
    expect(safeStyleAttr('background-color:url(https://evil/x)')).toBe('');
    expect(safeStyleAttr('width:100vw;height:100vh')).toBe(''); // vw/vh — на всё окно
  });
});

describe('sanitizeCss: известные обходы', () => {
  const evil = /evil/;
  it('экранированный url', () => expect(sanitizeCss('.a{background:\\75rl(https://evil/x)}')).not.toMatch(evil));
  it('экранированный @import', () => expect(sanitizeCss('@\\69mport url(https://evil/x.css);')).not.toMatch(evil));
  it('import с пробелом и комментарием', () => expect(sanitizeCss('@ import "https://evil/x.css";')).not.toMatch(evil));
  it('url, разорванный комментарием', () => expect(sanitizeCss('.a{background:u/**/rl(https://evil/x)}')).not.toMatch(evil));
  it('image-set и родственники', () => {
    for (const f of ['image-set', '-webkit-image-set', 'cross-fade', 'element', 'image', 'src']) expect(sanitizeCss(`.a{background:${f}("https://evil/x" 1x)}`)).not.toMatch(new RegExp(`(^|[^\\w-])${f}\\(`));
  });
  it('данные внутри файла — можно (картинка из data:image)', () => expect(sanitizeCss('.a{background:url("data:image/png;base64,AAAA")}')).toContain('data:image/png'));
  it('обычный CSS и все встроенные стили не меняются', () => {
    for (const m of CATALOG) if (m.css) expect(sanitizeCss(m.css)).toBe(m.css);
    expect(sanitizeCss('.btn { color: red; background: linear-gradient(135deg, #fff, #000); }')).toContain('linear-gradient(135deg, #fff, #000)');
  });
});

describe('имя стиля не вылезает из комментария', () => {
  it('«**//@import…/*» не открывает CSS наружу', () => {
    const css = modsCss(['m'], [{ id: 'm', name: '**//@import url(https://evil/x);/*', description: '', css: '.a{}' } as never], '');
    const firstLine = css.split('\n')[0];
    expect(firstLine.startsWith('/* мод: ')).toBe(true);
    expect(firstLine.endsWith(' */')).toBe(true);
    expect(firstLine.slice(2, -2)).not.toMatch(/\*\/|\/\*/);
    expect(css).not.toMatch(/@import/);
  });
  it('буквы, цифры и простые знаки остаются', () => expect(cleanModName('Крупные кнопки (2)')).toBe('Крупные кнопки (2)'));
});

describe('копия из файла («Восстановить»)', () => {
  const evilCopy = () => {
    const d = emptyData();
    const s = d.settings as unknown as Record<string, unknown>;
    s.pluginsSafe = false;
    s.plugins = [{ id: 'p', name: 'Чужой', version: '1', description: '', code: 'export default {}', enabled: true }];
    s.cloud = { url: 'https://evil.example', user: 'x', folder: 'f', encrypt: false, auto: true };
    (s.features as Record<string, boolean>).mods = true;
    return normalizeData(JSON.parse(JSON.stringify(d)));
  };
  it('моды из копии не запускаются: безопасный режим включён', () => {
    const { data } = neutralizeForeign(evilCopy(), emptyData());
    expect(data.settings.pluginsSafe).toBe(true);
    expect(data.settings.plugins).toHaveLength(1); // в списке остаются — пользователь решит сам
  });
  it('облако берётся у этого устройства, а не из копии', () => {
    const local = emptyData();
    local.settings.cloud = { url: 'https://webdav.yandex.ru', user: 'я', folder: 'Mnema', encrypt: true, auto: true };
    const r1 = neutralizeForeign(evilCopy(), local);
    expect(r1.data.settings.cloud).toEqual(local.settings.cloud);
    const r2 = neutralizeForeign(evilCopy(), emptyData());
    expect(r2.data.settings.cloud).toBeNull();
  });
  it('человеку говорят, что не перенесено', () => {
    const { notes } = neutralizeForeign(evilCopy(), emptyData());
    expect(notes.join(' ')).toMatch(/облако/);
    expect(notes.join(' ')).toMatch(/моды/);
  });
  it('своя копия без чужого облака и модов — без замечаний', () => {
    const own = emptyData();
    expect(neutralizeForeign(own, emptyData()).notes).toEqual([]);
  });
});

describe('мост и защитные правила не ослаблены', () => {
  const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  it('Electron: у http — список методов, у секретов — список имён', () => {
    expect(read('electron/sync.cjs')).toMatch(/HTTP_METHODS = new Set\(\[[^\]]*'MKCOL'[^\]]*\]\)/);
    expect(read('electron/sync.cjs')).toMatch(/HTTP_METHODS\.has\(/);
    const main = read('electron/main.cjs');
    expect(main).toMatch(/SECRET_NAMES = new Set\(\['cloud-pass', 'cloud-enc'\]\)/);
    expect((main.match(/SECRET_NAMES\.has\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('Android: у http — список методов, у настроек — список имён', () => {
    const j = read('android/src/app/mnema/study/Bridge.java');
    expect(j).toMatch(/prefAllowed\(String name\)/);
    expect((j.match(/prefAllowed\(name\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(j).toMatch(/Arrays\.asList\("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "MKCOL", "PROPFIND"\)\.contains\(method\)/);
  });
  it('CSP: нет inline-обработчиков, чужих воркеров и <base>', () => {
    const csp = /Content-Security-Policy" content="([^"]*)"/.exec(read('index.html'))![1];
    for (const d of ["base-uri 'none'", "worker-src 'self'", "script-src-attr 'none'", "manifest-src 'none'", "object-src 'none'", "form-action 'none'"]) expect(csp).toContain(d);
    expect(csp).not.toMatch(/'unsafe-eval'/); // 'wasm-unsafe-eval' нужен sql.js (импорт Anki) и распознаванию текста
  });
});
