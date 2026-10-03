import { describe, expect, it } from 'vitest';
import { CATALOG } from './mods';
import { cssForDemo, demoParts } from './styleDemo';

const css = (id: string) => CATALOG.find((m) => m.id === id)?.css ?? '';

describe('demoParts — что показать в примере стиля', () => {
  it('каждый готовый стиль показывает то, что меняет', () => {
    expect(demoParts(css('pastel-grades'))).toEqual(['grades']);
    expect(demoParts(css('sticky-notes'))).toEqual(['card']);
    expect(demoParts(css('big-cards'))).toEqual(['card']);
    expect(demoParts(css('notebook'))).toEqual(['note']);
    expect(demoParts(css('wide-note'))).toEqual(['note']);
    expect(demoParts(css('calm'))).toEqual(['nav', 'hero']);
    expect(demoParts(css('big-buttons'))).toEqual(['grades', 'controls']);
    expect(demoParts(css('glow'))).toEqual(['hero', 'controls']);
    expect(demoParts(css('mono'))).toEqual(['title', 'card']);
  });

  it('не больше двух частей; незнакомый CSS — заголовок и карточка', () => {
    expect(demoParts('.grade{} .review-card{} .note-doc{} .btn{}').length).toBe(2);
    expect(demoParts('.my-own-thing { color: red }')).toEqual(['title', 'card']);
    expect(demoParts('')).toEqual(['title', 'card']);
  });
});

describe('cssForDemo — CSS стиля внутри примера', () => {
  it(':root, html и body становятся :host', () => {
    expect(cssForDemo(':root { --body: monospace; }')).toBe(':host { --body: monospace; }');
    expect(cssForDemo("html .btn { color: red } body{margin:0}")).toBe(':host .btn { color: red } :host{margin:0}');
  });

  it('правила для тёмной темы работают через атрибут хоста', () => {
    expect(cssForDemo(":root[data-theme='dark'] .grade { filter: none; }")).toBe(":host([data-theme='dark']) .grade { filter: none; }");
    expect(cssForDemo(':root[data-theme="dark"][data-style="classic"] .x{}')).toBe(':host([data-theme="dark"][data-style="classic"]) .x{}');
  });

  it('переменные и значения со словом body не трогаются', () => {
    expect(cssForDemo('.a { font-family: var(--body); } .tbody { color: red }')).toBe('.a { font-family: var(--body); } .tbody { color: red }');
  });

  it('CSS проходит ту же проверку, что и в приложении', () => {
    expect(cssForDemo('.a { background: url(https://evil.example/x.png) }')).not.toContain('evil');
    expect(cssForDemo('@import "https://evil.example/a.css"; .b{}')).not.toContain('@import');
  });
});
