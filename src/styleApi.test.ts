// Описание API оформления не должно устаревать: каждая переменная и класс из справки есть в настоящем CSS и коде.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_CLASSES, API_PARTS, API_VARS } from './styleApi';
import { STYLE_ATTRS } from './styleSystem';

const dir = new URL('.', import.meta.url).pathname;
const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)]));
const all = files(dir).filter((f) => /\.(css|tsx|ts)$/.test(f) && !/\.test\.ts$/.test(f) && !f.endsWith('styleApi.ts'));
const css = all.filter((f) => f.endsWith('.css')).map((f) => readFileSync(f, 'utf8')).join('\n');
const src = all.map((f) => readFileSync(f, 'utf8')).join('\n');

describe('API оформления', () => {
  it('каждая переменная из справки где-то используется в CSS (или задаётся приложением)', () => {
    for (const g of API_VARS) for (const v of g.vars) expect(css.includes(`var(${v.name}`) || css.includes(`${v.name}:`) || src.includes(`'${v.name}'`), v.name).toBe(true);
  });
  it('каждая переменная --rf-* из CSS описана в справке', () => {
    const documented = new Set(API_VARS.flatMap((g) => g.vars.map((v) => v.name)));
    const used = new Set([...css.matchAll(/var\((--rf-[a-z0-9-]+)/g)].map((m) => m[1]));
    for (const u of used) expect(documented.has(u) || u.startsWith('--rf-ui'), u).toBe(true);
  });
  it('каждый класс из справки есть в CSS', () => {
    for (const c of API_CLASSES) expect(css.includes(c.name), c.name).toBe(true);
  });
  it('каждый data-part из справки стоит в разметке', () => {
    for (const p of API_PARTS) expect(src.includes(`data-part="${p.name}"`), p.name).toBe(true);
  });
  it('атрибуты раскладки описаны в api.css', () => {
    const apiCss = readFileSync(join(dir, 'api.css'), 'utf8');
    for (const [k, d] of Object.entries(STYLE_ATTRS)) for (const o of d.options) if (o.value !== d.default && k !== 'anim' && !(k === 'sidebar' && o.value === 'rail')) expect(apiCss.includes(`data-ui-${k}='${o.value}'`), `${k}=${o.value}`).toBe(true);
    expect(apiCss.includes("data-ui-anim='off'")).toBe(true);
  });
});
