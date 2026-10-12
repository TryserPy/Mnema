// 1.30: правки по итогам проверки безопасности (С1–С2, Н1–Н11).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KATEX_CLASSES, KATEX_POSITIONED, safeClassList } from './katexClasses';
import { safeStyleAttr } from './safeCss';

describe('С1: поддельное окно из class="katex"', () => {
  it('в тексте руками написанные классы KaTeX не остаются (ни обычные, ни с position:absolute)', () => {
    for (const c of KATEX_CLASSES) expect(safeClassList(c), c).toBe('');
    expect(safeClassList('katex rlap katex-inner')).toBe('');
    expect(safeClassList('math-block katex-display evil')).toBe('math-block');
    expect(safeClassList('language-js')).toBe('language-js');
  });
  it('в разметке самой формулы (помеченной renderTex) классы KaTeX остаются', () => {
    expect(safeClassList('katex rlap katex-inner evil', true)).toBe('katex rlap katex-inner');
  });
  it('список «абсолютных» классов совпадает с katex.css', () => {
    const css = readFileSync('node_modules/katex/dist/katex.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const abs = new Set<string>();
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/position:\s*(absolute|fixed|sticky)/.test(m[2])) continue;
      // у «.katex .llap > .katex-inner» абсолютным становится последний класс, у «.katex-display > .katex > .katex-html > .katex-tag» — тоже; сам .katex — только контейнер
      for (const sel of m[1].split(',')) {
        const last = sel.trim().split(/[\s>]+/).pop()!;
        for (const c of last.matchAll(/\.([\w-]+)/g)) abs.add(c[1]);
        // родитель-«рамка» (llap/rlap/clap) тоже нужен только вместе с абсолютным потомком
        for (const c of sel.matchAll(/\.(llap|rlap|clap)\b/g)) abs.add(c[1]);
      }
    }
    for (const c of abs) expect(KATEX_POSITIONED.has(c), 'нет в списке: ' + c).toBe(true);
    for (const c of KATEX_POSITIONED) expect(KATEX_CLASSES.has(c), c).toBe(true);
  });
  it('стиль внутри формулы: рамка \\fcolorbox остаётся, position — нет', () => {
    expect(safeStyleAttr('border-color:red;background-color:yellow')).toBe('border-color:red;background-color:yellow');
    expect(safeStyleAttr('position:absolute;top:-400px;left:-500px;width:1200px;height:800px;background-color:#ffffff')).toBe('top:-400px;left:-500px;width:1200px;height:800px;background-color:#ffffff');
  });
});
