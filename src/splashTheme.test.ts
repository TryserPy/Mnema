// Скрипт заставки (public/splash-theme.js) ставит на <html> только цвета вида #rrggbb из сохранённой темы.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const code = readFileSync(new URL('../public/splash-theme.js', import.meta.url), 'utf8');

function run(stored: string | null, throws = false) {
  const set: Record<string, string> = {};
  const localStorage = { getItem: () => { if (throws) throw new Error('закрыто'); return stored; } };
  const document = { documentElement: { style: { setProperty: (k: string, v: string) => (set[k] = v) } } };
  new Function('localStorage', 'sessionStorage', 'document', code)(localStorage, { getItem: () => null, removeItem: () => undefined }, document);
  return set;
}

describe('заставка в цвет темы', () => {
  it('ставит сохранённые цвета', () => {
    expect(run(JSON.stringify({ bg: '#1a1511', ink: '#f5eee6', muted: '#ae9f8e', accent: '#e0a15b', onAccent: '#10131c' }))).toEqual({ '--rs-bg': '#1a1511', '--rs-ink': '#f5eee6', '--rs-muted': '#ae9f8e', '--rs-accent': '#e0a15b', '--rs-on-accent': '#10131c' });
  });
  it('без кэша, с закрытым хранилищем и с мусором — ничего не ставит и не падает', () => {
    expect(run(null)).toEqual({});
    expect(run(null, true)).toEqual({});
    expect(run('{не json')).toEqual({});
    expect(run(JSON.stringify({ bg: 'red; } body { display: none', accent: 'url(https://evil/x)', ink: '#12', muted: 5, onAccent: '#fff' }))).toEqual({});
  });
  it('берёт только правильные цвета, остальное пропускает', () => {
    expect(run(JSON.stringify({ bg: '#000000', accent: 'expression(1)' }))).toEqual({ '--rs-bg': '#000000' });
  });
});

describe('заставка не играет дважды за один заход', () => {
  function runWith(flag: string | null) {
    const attrs: Record<string, string> = {};
    const removed: string[] = [];
    const sessionStorage = { getItem: (k: string) => (k === 'refrain-no-splash' ? flag : null), removeItem: (k: string) => removed.push(k) };
    const localStorage = { getItem: () => null };
    const document = { documentElement: { style: { setProperty: () => undefined }, setAttribute: (k: string, v: string) => (attrs[k] = v) } };
    new Function('localStorage', 'sessionStorage', 'document', code)(localStorage, sessionStorage, document);
    return { attrs, removed };
  }
  it('после перезагрузки ради обновления заставка скрыта, флаг использован один раз', () => {
    const r = runWith(String(Date.now() - 1500));
    expect(r.attrs['data-no-splash']).toBe('1');
    expect(r.removed).toEqual(['refrain-no-splash']);
  });
  it('старый флаг (давний заход) заставку не отключает, обычный заход — тоже', () => {
    expect(runWith(String(Date.now() - 60000)).attrs['data-no-splash']).toBeUndefined();
    expect(runWith(null).attrs['data-no-splash']).toBeUndefined();
  });
});
