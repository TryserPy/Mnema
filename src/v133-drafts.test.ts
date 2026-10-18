// 1.33, №10 и №2: черновики (хранилище, срок, лимит, сбой хранилища) и формулы в карточке с «убрать».
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, hasDraft, loadDraft, saveDraft } from './drafts';
import { cardDraftKey, formulasIn, removeFormula } from './components/CardEditor';

class MemStorage {
  m = new Map<string, string>();
  broken = false;
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.broken) throw new Error('QuotaExceededError');
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const g = globalThis as unknown as { localStorage?: MemStorage };
let store: MemStorage;
beforeEach(() => {
  store = new MemStorage();
  g.localStorage = store;
});
afterEach(() => {
  delete g.localStorage;
});

describe('черновики', () => {
  it('сохраняется, читается и стирается', () => {
    saveDraft('new:t1', { front: 'Фотосинтез', back: '' });
    expect(loadDraft<{ front: string }>('new:t1')?.value.front).toBe('Фотосинтез');
    expect(hasDraft('new:t1')).toBe(true);
    clearDraft('new:t1');
    expect(hasDraft('new:t1')).toBe(false);
  });

  it('старше 30 дней — забывается', () => {
    const t = Date.parse('2026-10-01T00:00:00Z');
    saveDraft('new:t1', { front: 'x' }, t);
    expect(loadDraft('new:t1', t + 29 * 864e5)).not.toBeNull();
    expect(loadDraft('new:t1', t + 31 * 864e5)).toBeNull();
  });

  it('хранится не больше 40, самые старые уходят', () => {
    for (let i = 0; i < 45; i++) saveDraft('new:t' + i, { front: String(i) }, Date.now() - 1000 + i);
    expect(hasDraft('new:t0')).toBe(false);
    expect(hasDraft('new:t44')).toBe(true);
    expect([...store.m.keys()].filter((k) => k.startsWith('refrain-draft:')).length).toBe(40);
  });

  it('хранилище переполнено или закрыто — без исключения', () => {
    store.broken = true;
    expect(saveDraft('new:t1', { front: 'x' })).toBe(false);
    delete g.localStorage;
    expect(loadDraft('new:t1')).toBeNull();
    expect(() => clearDraft('new:t1')).not.toThrow();
  });

  it('ключ по месту: новая карточка в теме, из выделенного, правка', () => {
    expect(cardDraftKey('t1')).toBe('new:t1');
    expect(cardDraftKey('t1', { id: 'c9' })).toBe('card:c9');
    expect(cardDraftKey('t1', undefined, { front: 'а' })).not.toBe(cardDraftKey('t1', undefined, { front: 'б' }));
  });
});

describe('формулы в карточке', () => {
  it('находит $…$ и $$…$$ и убирает формулу без лишних пробелов', () => {
    const t = 'Площадь $S=a\\cdot h$ параллелограмма';
    const f = formulasIn(t);
    expect(f.map((x) => x.tex)).toEqual(['S=a\\cdot h']);
    expect(removeFormula(t, f[0])).toBe('Площадь параллелограмма');
    expect(removeFormula('$x^2$', formulasIn('$x^2$')[0])).toBe('');
    expect(formulasIn('$$\\frac{a}{b}$$ и $c$').map((x) => x.tex)).toEqual(['\\frac{a}{b}', 'c']);
  });
});
