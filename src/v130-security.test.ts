// 1.30: правки по итогам проверки безопасности (С1–С2, Н1–Н11).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { zstdCompressSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ANKI_LIMITS, parseAnki, safeUnzip, zstd } from './anki';
import { assertCloudEncrypted } from './cloud';
import { KATEX_CLASSES, KATEX_POSITIONED, safeClassList } from './katexClasses';
import { cleanColors, sanitizeCss, safeColor, safeStyleAttr } from './safeCss';
import { emptyData, getData, importTopics, normalizeData, replaceData, restoreFromTrash } from './store';
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

// ---------- Н2: цвет предмета и папки из файла ----------
describe('Н2: цвет из файла', () => {
  const bad = ['red;background:url(//evil)', 'url(https://evil/x)', '#12', 'var(--x)', '', 5, null, { a: 1 }, 'constructor'];
  it('cleanColors: годные цвета остаются (тот же массив), негодные заменяются', () => {
    const ok = [{ id: 'a', color: '#3F51D8' }, { id: 'b', color: 'rgb(1, 2, 3)' }];
    expect(cleanColors(ok)).toBe(ok);
    for (const c of bad) expect(cleanColors([{ id: 'x', color: c }])[0].color, String(c)).toBe('#3A3F4E');
    expect(safeColor('#3F51D8')).toBe('#3F51D8');
  });
  it('normalizeData чистит цвет предметов, папок и предметов в корзине', () => {
    const d = emptyData();
    d.subjects = [{ ...mkSubj('s1'), color: 'red;background:url(//evil)' }, { ...mkSubj('s2'), color: '#2F8F5B' }];
    d.folders = [{ id: 'f1', name: 'П', color: 'url(https://evil/x)', createdAt: T0, updatedAt: T0 }];
    d.trash = [{ id: 'tr', at: T0, label: 'x', removed: { subjects: [{ ...mkSubj('s3'), color: '"><img src=x>' }], topics: [], cards: [], states: {}, logs: [], marks: [] } }];
    const n = normalizeData(JSON.parse(JSON.stringify(d)));
    expect(n.subjects.map((s) => s.color)).toEqual(['#3A3F4E', '#2F8F5B']);
    expect(n.folders[0].color).toBe('#3A3F4E');
    expect(n.trash![0].removed.subjects[0].color).toBe('#3A3F4E');
  });
  it('импорт темы из файла (importTopics) не принимает чужой цвет предмета', () => {
    replaceData(emptyData());
    importTopics([{ subjectName: 'Из файла', subjectColor: 'red;background:url(//evil)', topic: { name: 'Т', note: '' }, cards: [] }]);
    expect(getData().subjects.find((s) => s.name === 'Из файла')!.color).toBe('#3A3F4E');
    importTopics([{ subjectName: 'Хороший', subjectColor: '#2F8F5B', topic: { name: 'Т', note: '' }, cards: [] }]);
    expect(getData().subjects.find((s) => s.name === 'Хороший')!.color).toBe('#2F8F5B');
  });
});

// ---------- Н3: ключи расписания ----------
describe('Н3: расписание с ключами __proto__ / constructor / toString', () => {
  const evil = () => JSON.parse('{"__proto__":["s1"],"constructor":["s1"],"toString":"x","hasOwnProperty":5,"1":["s1","s1"],"2":"не список","9":["s1"],"3":[1,null,"s1"]}');
  it('normalizeData оставляет только дни 0–6 со списком строк', () => {
    const d = emptyData();
    d.subjects = [mkSubj('s1')];
    const raw = JSON.parse(JSON.stringify(d));
    raw.settings.schedule = evil();
    const n = normalizeData(raw);
    expect(Object.keys(n.settings.schedule).sort()).toEqual(['1', '3']);
    expect(n.settings.schedule['1']).toEqual(['s1', 's1']);
    expect(n.settings.schedule['3']).toEqual(['s1']);
    expect(Object.getPrototypeOf(n.settings.schedule)).toBe(Object.prototype);
  });
  it('mergeData не падает и не портит прототип, даже если кривое расписание не прошло normalizeData', () => {
    const local = world(1);
    local.settings.schedule = { '1': ['s1'] };
    const remote = world(1);
    remote.settings.schedule = evil();
    const { data } = mergeData(local, remote);
    expect(Object.keys(data.settings.schedule).sort()).toEqual(['1', '3']);
    expect(data.settings.schedule['1']).toEqual(['s1', 's1']);
    expect(({} as Record<string, unknown>).toString).toBeTypeOf('function');
    expect(Array.isArray((Object.prototype as unknown as Record<string, unknown>)['constructor'])).toBe(false);
    // и с кривым расписанием у себя
    local.settings.schedule = evil();
    expect(() => mergeData(local, world(1))).not.toThrow();
  });
  it('обычное слияние расписания работает как раньше', () => {
    const local = world(1);
    local.settings.schedule = { '1': ['s1'] };
    const remote = world(1);
    remote.settings.schedule = { '1': ['s1', 's1'], '2': ['s1'] };
    expect(mergeData(local, remote).data.settings.schedule).toEqual({ '1': ['s1', 's1'], '2': ['s1'] });
  });
});

// ---------- Н4: защита сервера Wi-Fi синхронизации (electron/syncGuard.cjs) ----------
describe('Н4: syncGuard', () => {
  const { createGuard, ipOf } = createRequire(import.meta.url)('../electron/syncGuard.cjs') as {
    createGuard: (o?: Record<string, unknown>) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
    ipOf: (r: unknown) => string;
  };
  it('адрес блокируется после maxBad неудач и разблокируется по истечении срока; удача сбрасывает счёт', () => {
    let now = 1000;
    const g = createGuard({ maxBad: 3, blockMs: 500, now: () => now });
    g.fail('1.1.1.1');
    g.fail('1.1.1.1');
    g.ok('1.1.1.1');
    expect(g.fail('1.1.1.1')).toBe(false); // счёт начался заново
    g.fail('1.1.1.1');
    expect(g.fail('1.1.1.1')).toBe(true);
    expect(g.blocked('1.1.1.1')).toBe(true);
    expect(g.blocked('2.2.2.2')).toBe(false);
    g.ok('1.1.1.1'); // блок не снимается удачей
    expect(g.blocked('1.1.1.1')).toBe(true);
    now += 501;
    expect(g.blocked('1.1.1.1')).toBe(false);
  });
  it('билет одноразовый, живёт ограниченное время, выдаётся не больше maxTickets', () => {
    let now = 0;
    const g = createGuard({ ticketMs: 100, maxTickets: 2, now: () => now });
    const a = g.issueTicket()!;
    expect(g.useTicket(a)).toBe(true);
    expect(g.useTicket(a)).toBe(false);
    const b = g.issueTicket()!;
    g.issueTicket();
    expect(g.issueTicket()).toBeNull();
    now += 101;
    expect(g.useTicket(b)).toBe(false);
    expect(g.issueTicket()).not.toBeNull();
    expect(g.useTicket(undefined as unknown as string)).toBe(false);
  });
  it('одновременных обменов не больше maxSync', () => {
    const g = createGuard({ maxSync: 2 });
    expect([g.enterSync(), g.enterSync(), g.enterSync()]).toEqual([true, true, false]);
    g.leaveSync();
    expect(g.enterSync()).toBe(true);
    expect(g.syncing).toBe(2);
  });
  it('nonce: повтор, пустое значение и не строка — «повтор»', () => {
    const g = createGuard();
    expect(g.replayed('abc')).toBe(false);
    expect(g.replayed('abc')).toBe(true);
    for (const bad of ['', undefined, 5, null, 'x'.repeat(200)]) expect(g.replayed(bad), String(bad)).toBe(true);
  });
  it('ipOf: «::ffff:» у IPv4 снимается', () => {
    expect(ipOf({ socket: { remoteAddress: '::ffff:192.168.1.7' } })).toBe('192.168.1.7');
    expect(ipOf({})).toBe('');
  });
});

// ---------- Н5: .apkg без лимитов ----------
describe('Н5: распаковка чужого .apkg', () => {
  /** Zip из записей (без сжатия), в центральном каталоге у записи name заявлен размер declared. */
  const zipWith = (files: Record<string, Uint8Array>, declared: Record<string, number> = {}): Uint8Array => {
    const z = zipSync(Object.fromEntries(Object.entries(files).map(([n, b]) => [n, [b, { level: 0 }] as [Uint8Array, { level: 0 }]])));
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    for (let i = 0; i + 46 < z.length; i++) {
      if (dv.getUint32(i, true) !== 0x02014b50) continue;
      const nameLen = dv.getUint16(i + 28, true);
      const name = new TextDecoder().decode(z.subarray(i + 46, i + 46 + nameLen));
      if (name in declared) dv.setUint32(i + 24, declared[name], true);
    }
    return z;
  };
  const MB = 1024 * 1024;

  it('база коллекции с заявленным размером в гигабайты — понятная ошибка до распаковки', () => {
    const z = zipWith({ 'collection.anki2': new Uint8Array(10) }, { 'collection.anki2': 3000 * MB });
    expect(() => safeUnzip(z)).toThrow(/слишком большая/);
  });
  it('список медиа и сумма записей тоже ограничены', () => {
    expect(() => safeUnzip(zipWith({ media: new Uint8Array(4) }, { media: ANKI_LIMITS.mediaList + 1 }))).toThrow(/слишком большая/);
    // много номерных записей по 3 МБ (заявлено) — в сумме больше предела
    const files: Record<string, Uint8Array> = {};
    const declared: Record<string, number> = {};
    const n = Math.ceil(ANKI_LIMITS.total / (3 * MB)) + 1;
    for (let i = 0; i < n; i++) {
      files[String(i)] = new Uint8Array(1);
      declared[String(i)] = 3 * MB;
    }
    expect(() => safeUnzip(zipWith(files, declared))).toThrow(/слишком большая/);
  });
  it('запись крупнее картинки (звук, видео) пропускается без ошибки, обычная распаковывается', () => {
    const z = zipWith({ '0': new Uint8Array([1, 2, 3]), '1': new Uint8Array(4), 'collection.anki2': new Uint8Array([9]) }, { '1': 50 * MB });
    const out = safeUnzip(z);
    expect(Object.keys(out).sort()).toEqual(['0', 'collection.anki2']);
  });
  it('слишком много записей — ошибка', () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 6; i++) files['f' + i] = new Uint8Array(1);
    expect(() => safeUnzip(zipSync(files), { entries: 5 })).toThrow(/слишком много файлов/);
    expect(Object.keys(safeUnzip(zipSync(files), { entries: 6 }))).toHaveLength(6);
  });
  it('parseAnki отказывает на огромном заявленном размере (а не пытается распаковать)', () => {
    const z = zipWith({ 'collection.anki21': new Uint8Array(10) }, { 'collection.anki21': 4000 * MB });
    expect(() => parseAnki('bomb.apkg', z, {} as never, { progress: false, settings: { retention: 0.9 } })).toThrow(/слишком большая/);
  });
  it('zstd: предел по факту (заявленный в кадре размер не доверяем)', () => {
    const packed = new Uint8Array(zstdCompressSync(Buffer.alloc(3 * MB)));
    expect(() => zstd(packed, 1 * MB)).toThrow(/слишком большая/);
    expect(zstd(packed, 4 * MB).length).toBe(3 * MB);
  });
});

// ---------- Н6: внешние ссылки в Android ----------
describe('Н6: AppActivity.java — внешние ссылки', () => {
  const java = readFileSync('android/src/app/mnema/study/AppActivity.java', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // без комментариев
  it('только http, https, mailto; CATEGORY_BROWSABLE; без Intent.parseUri', () => {
    expect(java).not.toMatch(/parseUri/);
    expect(java).toMatch(/CATEGORY_BROWSABLE/);
    expect(java).toMatch(/s\.equals\("http"\) \|\| s\.equals\("https"\) \|\| s\.equals\("mailto"\)/);
    // ссылка не уходит в startActivity мимо проверки схемы
    expect(java.match(/new Intent\(Intent\.ACTION_VIEW, u\)/g)).toHaveLength(1);
    expect(java).toMatch(/if \(u == null \|\| !externalScheme\(u\.getScheme\(\)\)\) return false;/);
  });
});

// ---------- Н7: резервная копия Android ----------
describe('Н7: android:allowBackup без ключей', () => {
  const manifest = readFileSync('android/AndroidManifest.xml', 'utf8');
  const build = readFileSync('android/build.sh', 'utf8');
  it('манифест ссылается на правила для Android 6–11 и 12+; cleartext остаётся (нужен Wi-Fi синхронизации)', () => {
    expect(manifest).toMatch(/android:fullBackupContent="@xml\/backup_rules"/);
    expect(manifest).toMatch(/android:dataExtractionRules="@xml\/data_extraction_rules"/);
    expect(manifest).toMatch(/android:usesCleartextTraffic="true"/);
  });
  it('оба файла правил исключают shared_prefs/mnema.xml (ключ ИИ и пароли облака), и облачную копию, и перенос на телефон', () => {
    const full = readFileSync('android/res/xml/backup_rules.xml', 'utf8');
    expect(full).toMatch(/<full-backup-content>[\s\S]*<exclude domain="sharedpref" path="mnema\.xml" \/>/);
    const ext = readFileSync('android/res/xml/data_extraction_rules.xml', 'utf8');
    expect(ext).toMatch(/<cloud-backup>\s*<exclude domain="sharedpref" path="mnema\.xml" \/>\s*<\/cloud-backup>/);
    expect(ext).toMatch(/<device-transfer>\s*<exclude domain="sharedpref" path="mnema\.xml" \/>\s*<\/device-transfer>/);
  });
  it('имя файла в правилах — то, под которым Bridge.java хранит настройки', () => {
    expect(readFileSync('android/src/app/mnema/study/Bridge.java', 'utf8')).toMatch(/getSharedPreferences\("mnema", Context\.MODE_PRIVATE\)/);
  });
  it('build.sh собирает res/xml (aapt2 compile --dir res) и убирает dataExtractionRules только для android.jar старше API 31', () => {
    expect(build).toMatch(/aapt2 compile --dir res/);
    expect(build).toMatch(/\[ "\$API" -lt 31 \]/);
    expect(build).toMatch(/grep -v 'android:dataExtractionRules'/);
  });
});
