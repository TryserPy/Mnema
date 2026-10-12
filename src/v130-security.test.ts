// 1.30: правки по итогам проверки безопасности (С1–С2, Н1–Н11).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertCloudEncrypted } from './cloud';
import { KATEX_CLASSES, KATEX_POSITIONED, safeClassList } from './katexClasses';
import { sanitizeCss, safeStyleAttr } from './safeCss';
import { emptyData, getData, replaceData, restoreFromTrash } from './store';
import { mergeData } from './sync';
import type { AppData, Card, Subject, Topic } from './types';

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

// ---------- С2: облако и слияние ----------
const T0 = '2026-09-01T10:00:00.000Z';
const mkSubj = (id: string): Subject => ({ id, name: id, color: '#000000', createdAt: T0, updatedAt: T0 });
const mkTopic = (id: string, subjectId: string): Topic => ({ id, subjectId, name: id, note: 'текст ' + id, createdAt: T0, updatedAt: T0 });
const mkCard = (id: string, topicId: string): Card => ({ id, topicId, type: 'basic', front: 'Q' + id, back: 'a', createdAt: T0, updatedAt: T0 });
function world(nCards: number): AppData {
  const d = emptyData();
  d.subjects = [mkSubj('s1')];
  d.topics = [mkTopic('t1', 's1')];
  d.cards = Array.from({ length: nCards }, (_, i) => mkCard('c' + i, 't1'));
  for (const c of d.cards) d.states[c.id + ':0'] = { due: T0, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: T0 };
  return d;
}

describe('С2: файл в облаке без шифра при включённом шифровании', () => {
  it('останавливает синхронизацию', () => {
    const plain = JSON.stringify({ version: 1, subjects: [], topics: [], cards: [] });
    expect(() => assertCloudEncrypted(plain, true)).toThrow(/не зашифрован/);
    expect(() => assertCloudEncrypted('не json', true)).toThrow(/не зашифрован/);
    expect(() => assertCloudEncrypted(JSON.stringify({ mnemaEncrypted: true }), true)).toThrow(/не зашифрован/);
    expect(() => assertCloudEncrypted(JSON.stringify({ mnemaEncrypted: '1' }), true)).toThrow(/не зашифрован/);
    expect(() => assertCloudEncrypted('null', true)).toThrow(/не зашифрован/);
  });
  it('зашифрованный файл и выключенное шифрование проходят', () => {
    expect(() => assertCloudEncrypted(JSON.stringify({ mnemaEncrypted: 1, salt: 'a', iv: 'b', data: 'c' }), true)).not.toThrow();
    expect(() => assertCloudEncrypted('{"version":1}', false)).not.toThrow();
  });
});

describe('С2: записи удаления из будущего', () => {
  it('дата позже «сейчас + сутки» отбрасывается и не удаляет данные', () => {
    const local = world(3);
    const remote = world(3);
    remote.deleted = { 'card:c0': '2999-01-01T00:00:00.000Z', 'topic:t1': new Date(Date.now() + 3 * 86400000).toISOString() };
    const { data } = mergeData(local, remote);
    expect(data.cards.length).toBe(3);
    expect(data.topics.length).toBe(1);
    expect(data.deleted).toEqual({});
  });
  it('то же для отметок, которые уже лежат у нас', () => {
    const local = world(2);
    local.deleted = { 'card:c0': '2999-01-01T00:00:00.000Z' };
    expect(mergeData(local, world(2)).data.deleted).toEqual({});
  });
  it('обычная свежая отметка (часы чуть вперёд) работает как раньше', () => {
    const local = world(3);
    const remote = world(3);
    remote.cards = remote.cards.slice(1);
    remote.deleted = { 'card:c0': new Date(Date.now() + 3600000).toISOString() };
    const { data, report } = mergeData(local, remote);
    expect(data.cards.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(report.removed).toBe(1);
    expect(data.trash).toBeUndefined();
  });
});

describe('С2: массовое удаление при слиянии идёт в корзину', () => {
  const massRemote = (local: AppData, n: number) => {
    const remote = JSON.parse(JSON.stringify(local)) as AppData;
    const gone = remote.cards.slice(0, n);
    remote.cards = remote.cards.slice(n);
    remote.deleted = Object.fromEntries(gone.map((c) => ['card:' + c.id, new Date().toISOString()]));
    return remote;
  };
  it('удалено больше 20% и больше 5 карточек — они в корзине вместе с прогрессом, в отчёте есть trashed', () => {
    const local = world(20);
    const { data, report } = mergeData(local, massRemote(local, 10));
    expect(data.cards.length).toBe(10);
    expect(report.trashed).toEqual({ subjects: 0, topics: 0, cards: 10 });
    expect(data.trash?.length).toBe(1);
    expect(data.trash![0].removed.cards.length).toBe(10);
    expect(Object.keys(data.trash![0].removed.states).length).toBe(10);
    expect(data.trash![0].removed.marks).toContain('card:c0');
  });
  it('из корзины всё возвращается через обычное «Вернуть»', () => {
    const local = world(20);
    const { data } = mergeData(local, massRemote(local, 10));
    replaceData(data);
    expect(getData().cards.length).toBe(10);
    expect(restoreFromTrash(getData().trash![0].id)).toBe(true);
    expect(getData().cards.length).toBe(20);
    expect(getData().trash?.length ?? 0).toBe(0);
  });
  it('мало удалено (5 штук из 20 или меньше пятой части) — как раньше, без корзины', () => {
    const local = world(20);
    expect(mergeData(local, massRemote(local, 5)).data.trash).toBeUndefined();
    const big = world(60);
    const r = mergeData(big, massRemote(big, 10));
    expect(r.data.cards.length).toBe(50);
    expect(r.data.trash).toBeUndefined();
    expect(r.report.trashed).toBeUndefined();
  });
  it('удалён предмет целиком (тема и карточки) — в корзине всё', () => {
    const local = world(8);
    const remote = JSON.parse(JSON.stringify(local)) as AppData;
    remote.subjects = [];
    remote.topics = [];
    remote.cards = [];
    remote.deleted = { 'subj:s1': new Date().toISOString(), 'topic:t1': new Date().toISOString() };
    const { data, report } = mergeData(local, remote);
    expect(data.cards.length).toBe(0);
    expect(report.trashed).toEqual({ subjects: 1, topics: 1, cards: 8 });
    expect(data.trash![0].removed.cards.length).toBe(8);
  });
});

// ---------- Н1: незакрытый url( ----------
describe('Н1: незакрытый url( в конце листа', () => {
  const cases = ['body{background:url(https://evil.example/x', 'body{background:url("https://evil.example/x', "a{background:URL('https://e/x", 'a{background:u\\rl(https://e/x', 'a{b:\\75rl(https://e/x', 'a{c:u/**/rl(http://e/x', 'a{b:url(', 'a{background:UrL (  https://e/x\n}'];
  it('не остаётся ни url(, ни адреса', () => {
    for (const c of cases) {
      const out = sanitizeCss(c);
      expect(out, c).not.toMatch(/url\s*\(/i);
      expect(out, c).not.toMatch(/https?:/i);
    }
  });
  it('вырезается до конца объявления — остальной CSS цел', () => {
    expect(sanitizeCss('a{color:red;background:url(\'https://e/x\n}\nb{color:blue}')).toBe('a{color:red;background:none}\nb{color:blue}');
    expect(sanitizeCss('a{b:URL ( https://e/x;color:red}')).toBe('a{b:none;color:red}');
  });
  it('закрытый url(data:image…) и обычный CSS не портятся', () => {
    const img = 'a{background:url(data:image/png;base64,AAAA)}';
    expect(sanitizeCss(img)).toBe(img);
    expect(sanitizeCss('.btn{min-height:48px;background:linear-gradient(red,blue)}')).toBe('.btn{min-height:48px;background:linear-gradient(red,blue)}');
  });
});
