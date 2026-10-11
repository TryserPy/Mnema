// Переносимый Markdown: имена файлов, пути, свойства, санитизация, карточки, «всё в папку» и обратно.
import { describe, expect, it } from 'vitest';
import { cardsToCsv, emitCards, emitList, emitPoems, parseCards, parseListTable, parsePoems } from './mdCards';
import { buildMarkdownExport, zipExport } from './mdExport';
import { LIMITS, packFromEntries, packFromZip, planImport } from './mdImport';
import { cleanPath, csvCell, emitFrontmatter, parseFrontmatter, relPath, resolveRel, safeFileName, sanitizeImportedMarkdown, safeSvgText, uniquePath } from './mdPortable';
import { sameNote } from './noteText';
import { emptyData } from './store';
import type { AppData, Card, Topic } from './types';

const T0 = '2026-09-01T10:00:00.000Z';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const WEBP = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
const svgOf = (extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 500" data-mnema="drawing" data-bg="theme"><path data-points="1,2 3,4" stroke="#1E2230" d="M1 2 L3 4"/>${extra}</svg>`;
const svgUri = (s: string) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');

describe('имена файлов и пути', () => {
  it('убирает запрещённое в Windows, держит кириллицу, обходит CON/PRN', () => {
    expect(safeFileName('Что? Где: когда*')).toBe('Что Где когда');
    expect(safeFileName('a/b\\c|d"e<f>g')).toBe('a b c d e f g');
    expect(safeFileName('Тема [1] #2 ^3')).toBe('Тема 1 2 3');
    expect(safeFileName('CON')).toBe('CON_');
    expect(safeFileName('nul.txt')).toBe('nul.txt_');
    expect(safeFileName('COM1')).toBe('COM1_');
    expect(safeFileName('Конец. . ')).toBe('Конец');
    expect(safeFileName('...')).toBe('Без названия');
    expect(safeFileName('', 'Тема')).toBe('Тема');
    expect(safeFileName('я'.repeat(200)).length).toBe(80);
  });
  it('повторы получают номер, регистр не различается', () => {
    const used = new Set<string>();
    expect(uniquePath(used, 'А/Тема.md')).toBe('А/Тема.md');
    expect(uniquePath(used, 'а/тема.md')).toBe('а/тема (2).md');
    expect(uniquePath(used, 'А/Тема.md')).toBe('А/Тема (3).md');
  });
  it('относительные пути', () => {
    expect(relPath('Физика', 'attachments/a.png')).toBe('../attachments/a.png');
    expect(relPath('Папка/Предмет/Тема', 'attachments/a.png')).toBe('../../../attachments/a.png');
    expect(relPath('Физика', 'Физика/Ом.md')).toBe('Ом.md');
    expect(relPath('Физика/Ом', 'Физика/Ток.md')).toBe('../Ток.md');
    expect(resolveRel('Физика/Ом', '../../attachments/a%20b.png')).toBe('attachments/a b.png');
    expect(resolveRel('Физика', '../../x.png')).toBeNull();
    expect(resolveRel('', 'https://x/y')).toBeNull();
  });
  it('cleanPath: zip-slip, абсолютные пути и диски отвергаются', () => {
    for (const bad of ['../x.md', 'a/../../x.md', '/etc/x.md', 'C:\\x.md', 'c:/x.md', 'a\\..\\..\\x.md', '', '..']) expect(cleanPath(bad)).toBeNull();
    expect(cleanPath('a\\b/./c.md')).toBe('a/b/c.md');
  });
});

describe('свойства YAML', () => {
  it('туда и обратно, включая двоеточия, кавычки, списки и объекты', () => {
    const meta = { title: 'Закон Ома: ток', subject: 'Физика', 'subject-color': '#2F8F5B', tags: ['refrain', 'физика'], important: true, order: 2, exam: '2026-12-01', created: T0, 'refrain-lists': [{ id: 'L1', title: 'Слова "a"', cols: ['a', 'b', 'c'] }], empty: '', q: 'true', n: '12' };
    const text = emitFrontmatter(meta) + '\nТекст\n';
    const r = parseFrontmatter(text);
    expect(r.body.trim()).toBe('Текст');
    expect(r.meta).toMatchObject({ title: 'Закон Ома: ток', subject: 'Физика', 'subject-color': '#2F8F5B', tags: ['refrain', 'физика'], important: true, order: 2, exam: '2026-12-01', created: T0, q: 'true', n: '12' });
    expect(r.meta['refrain-lists']).toEqual(meta['refrain-lists']);
  });
  it('свойства Obsidian: список через дефисы, кавычки, [a, b]', () => {
    const r = parseFrontmatter('---\ntags:\n  - bio\n  - клетка\naliases: [A, "B"]\ntitle: \'Фаза\'\ncssclass:\n---\nТекст');
    expect(r.meta.tags).toEqual(['bio', 'клетка']);
    expect(r.meta.aliases).toEqual(['A', 'B']);
    expect(r.meta.title).toBe('Фаза');
    expect(r.meta.cssclass).toBe('');
    expect(r.body).toBe('Текст');
  });
  it('без свойств текст не меняется', () => {
    expect(parseFrontmatter('# Заголовок\n---\nне свойства')).toEqual({ meta: {}, body: '# Заголовок\n---\nне свойства' });
  });
});

describe('санитизация чужого Markdown', () => {
  it('теги-ловушки превращаются в текст, безобидные остаются без атрибутов', () => {
    const out = sanitizeImportedMarkdown('Привет <script>alert(1)</script> <img src=x onerror=alert(1)> <iframe src="//e"></iframe> <b onclick="x()">ж</b> <u>п</u> <!-- скрыто -->');
    expect(out).not.toMatch(/<script|<img|<iframe|скрыто|<[a-z][^>]*\son\w+=/i);
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('<b>ж</b>');
    expect(out).toContain('<u>п</u>');
  });
  it('опасные адреса теряют ссылку, обычные остаются', () => {
    const out = sanitizeImportedMarkdown('[а](javascript:alert(1)) [б](https://ok.ru/x) [в](../Тема.md) [г](//server/share) ![д](file:///etc/passwd) [е](vbscript:x) [ж](mnema://topic/abc) ![з](data:image/png;base64,AAAA)');
    expect(out).not.toMatch(/javascript:|vbscript:|file:|\/\/server/);
    expect(out).toContain('[б](https://ok.ru/x)');
    expect(out).toContain('[в](../Тема.md)');
    expect(out).toContain('[ж](mnema://topic/abc)');
    expect(out).toContain('![з](data:image/png;base64,AAAA)');
  });
  it('код не трогается', () => {
    expect(sanitizeImportedMarkdown('```html\n<script>x</script>\n```\nи `<b onclick=1>`')).toBe('```html\n<script>x</script>\n```\nи `<b onclick=1>`');
  });
  it('SVG со скриптами не годится как картинка', () => {
    expect(safeSvgText(svgOf())).toBe(true);
    expect(safeSvgText(svgOf('<script>alert(1)</script>'))).toBe(false);
    expect(safeSvgText('<svg onload="x()"/>')).toBe(false);
    expect(safeSvgText('<svg><a href="https://e"><text>x</text></a></svg>')).toBe(false);
  });
  it('CSV: кавычки, запятые, переносы и формулы', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('1\n2')).toBe('"1\n2"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('-5')).toBe('-5');
  });
});

describe('карточки в Markdown', () => {
  const cards = [
    { type: 'basic' as const, front: 'Что такое клетка?', back: 'Единица жизни', why: 'Потому что' },
    { type: 'basic' as const, front: 'a::b', back: 'строка 1\nстрока 2' },
    { type: 'reverse' as const, front: 'mitosis', back: 'деление' },
    { type: 'cloze' as const, front: 'Ток {{c1::I}} в {{c2::амперах::ед.}}', back: 'Доп', why: 'Почему так' },
    { type: 'typing' as const, front: 'Столица Франции', back: 'Париж|париж' },
    { type: 'problem' as const, front: 'U={U=10..220} R=10', back: '{=U/R}' }
  ];
  it('туда и обратно без потерь', () => {
    const md = 'Текст темы\n\n' + emitCards(cards) + '\n## Другое\n\nконец';
    const r = parseCards(md);
    expect(r.cards).toEqual(cards.map((c) => ({ ...c, ...(c.why ? { why: c.why } : {}) })));
    expect(r.rest).toContain('Текст темы');
    expect(r.rest).toContain('## Другое');
    expect(r.rest).not.toContain('Вопрос — ответ');
  });
  it('словарь таблицей', () => {
    const list = { id: 'L', kind: 'vocab' as const, title: 'Слова', cols: ['EN', 'RU', 'Пример'] as [string, string, string], mode: 'reverse' as const };
    const rows = [{ front: 'a|b', back: 'вар\\иант', why: 'x\ny' }, { front: 'cat', back: 'кошка' }];
    const r = parseListTable('Начало\n\n' + emitList(list, rows) + '\nКонец', 'Слова')!;
    expect(r.rows).toEqual([{ front: 'a|b', back: 'вар\\иант', why: 'x\ny' }, { front: 'cat', back: 'кошка' }]);
    expect(r.rest).toContain('Начало');
    expect(r.rest).toContain('Конец');
    expect(r.rest).not.toContain('| EN');
  });
  it('стихи', () => {
    const poems = [{ title: 'Я помню', author: 'Пушкин', text: 'Я помню чудное мгновенье:\nПередо мной явилась ты\n\nКак мимолетное виденье', chunk: 0 }];
    const r = parsePoems('Текст\n\n' + emitPoems(poems));
    expect(r.poems).toEqual([{ title: 'Я помню', author: 'Пушкин', text: poems[0].text }]);
    expect(r.rest.trim()).toBe('Текст');
  });
  it('CSV с BOM и заголовком', () => {
    const csv = cardsToCsv([{ subject: 'Биология', topic: 'Клетка', type: 'basic', front: 'a, b', back: 'c' }]);
    expect(csv.startsWith('\uFEFFПредмет,Тема,Тип,Вопрос,Ответ,Почему\r\n')).toBe(true);
    expect(csv).toContain('"a, b"');
  });
});

// ---------- «Всё в папку» и обратно ----------

function world(): AppData {
  const d = emptyData();
  d.folders = [{ id: 'f1', name: 'Естественные науки', color: '#0E8FA3', icon: '🔬', iconImg: PNG, order: 1, createdAt: T0 }];
  d.subjects = [
    { id: 's1', name: 'Физика', color: '#2A5BB8', icon: '⚡', iconImg: WEBP, folderId: 'f1', order: 1, createdAt: T0 },
    { id: 's2', name: 'Русский: язык?', color: '#B4452F', order: 2, createdAt: T0 }
  ];
  const t = (id: string, subjectId: string, name: string, note: string, extra: Partial<Topic> = {}): Topic => ({ id, subjectId, name, note, createdAt: T0, updatedAt: T0, ...extra });
  d.topics = [
    t('t1', 's1', 'Закон Ома', `Ток $I=U/R$ и блок:\n\n$$\nI = \\frac{U}{R}\n$$\n\n==важно== **жирно** ++под++ [стр. 12]\n\n![схема](${PNG})\n\n![Рисунок](${svgUri(svgOf())})\n\n![video](https://youtu.be/dQw4w9WgXcQ)\n\n> **Запомните:** ток течёт\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nСм. [сопротивление](mnema://topic/t2) и [карточку](mnema://card/c1).`, { examDate: '2026-12-01', important: true, order: 1, lists: [{ id: 'L1', kind: 'vocab', title: 'Слова', cols: ['EN', 'RU', 'Пример'], mode: 'reverse', lang: 'en-US' }], poems: [{ id: 'p1', title: 'Стих', author: 'А. П.', text: 'раз\nдва', chunk: 0, learned: 1, createdAt: T0, updatedAt: T0 }], pages: [{ n: 12, img: PNG }] }),
    t('t2', 's1', 'Сопротивление', 'R — сопротивление [закон](mnema://topic/t1)', { parentId: 't1', order: 1 }),
    t('t3', 's1', 'CON', 'Зарезервированное имя'),
    t('t4', 's2', 'Правило ЖИ/ШИ', 'После ж и ш пишем и', { kind: 'rule' }),
    t('t5', 's2', 'Закон Ома', 'Одноимённая тема в другом предмете')
  ];
  const card = (id: string, topicId: string, extra: Partial<Card>): Card => ({ id, topicId, type: 'basic', front: '', back: '', createdAt: T0, updatedAt: T0, ...extra });
  d.cards = [
    card('c1', 't1', { front: 'Формула тока?', back: '$I=U/R$', why: 'Закон Ома' }),
    card('c2', 't1', { type: 'cloze', front: 'Ток {{c1::I}} в амперах' }),
    card('c3', 't1', { type: 'reverse', front: 'cat', back: 'кошка', listId: 'L1' }),
    card('c4', 't1', { type: 'reverse', front: 'dog', back: 'собака', why: 'a good dog', listId: 'L1' }),
    card('c5', 't2', { type: 'typing', front: 'Единица R', back: 'Ом|ом' }),
    card('c6', 't4', { front: 'ж и ш', back: 'и' })
  ];
  return d;
}

const bytes = (s: string) => new TextEncoder().encode(s);

async function roundTrip(d: AppData, flavor: 'plain' | 'obsidian' = 'plain') {
  const files = buildMarkdownExport(d, { flavor });
  const zip = await zipExport(files);
  const pack = await packFromZip(zip);
  return { files, zip, pack, plan: planImport(pack, { fallbackName: 'Импорт' }) };
}

describe('Всё в папку Markdown', () => {
  it('структура: папки, предметы, темы, подтемы, правила, attachments, README, карточки', () => {
    const paths = buildMarkdownExport(world()).map((f) => f.path).sort();
    expect(paths).toContain('README.md');
    expect(paths).toContain('Карточки.md');
    expect(paths).toContain('Карточки.csv');
    expect(paths).toContain('Естественные науки/Физика/Закон Ома.md');
    expect(paths).toContain('Естественные науки/Физика/Закон Ома/Сопротивление.md');
    expect(paths).toContain('Естественные науки/Физика/CON_.md');
    expect(paths).toContain('Русский язык/Правила/Правило ЖИ ШИ.md');
    expect(paths).toContain('Русский язык/Закон Ома.md');
    expect(paths.filter((p) => p.startsWith('attachments/')).length).toBe(3); // png (одинаковые картинки — один файл), svg, webp
    expect(paths.some((p) => /[:*?"<>|\\]/.test(p))).toBe(false);
  });
  it('в текстах нет data URI и mnema://, картинки — относительными ссылками, ссылки — на .md', () => {
    const files = buildMarkdownExport(world());
    const ohm = files.find((f) => f.path === 'Естественные науки/Физика/Закон Ома.md')!.content;
    expect(ohm).not.toMatch(/data:image|mnema:\/\//);
    expect(ohm).toMatch(/!\[схема\]\(\.\.\/\.\.\/attachments\/[^)]+\.png\)/);
    expect(ohm).toMatch(/!\[Рисунок\]\(\.\.\/\.\.\/attachments\/[^)]+\.svg\)/);
    expect(ohm).toContain('[сопротивление](%D0%97%D0%B0%D0%BA%D0%BE%D0%BD%20%D0%9E%D0%BC%D0%B0/%D0%A1%D0%BE%D0%BF%D1%80%D0%BE%D1%82%D0%B8%D0%B2%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5.md)');
    expect(ohm).toContain('[▶ Видео](https://youtu.be/dQw4w9WgXcQ)');
    expect(ohm).toContain('<u>под</u>');
    expect(ohm).toContain('(стр. 12)');
    expect(ohm).toContain('$I=U/R$');
    expect(ohm).toContain('==важно==');
    expect(ohm.startsWith('---\n')).toBe(true);
    expect(ohm).toContain('refrain-id: t1');
    const sub = files.find((f) => f.path.endsWith('Сопротивление.md'))!.content;
    expect(sub).toContain('](../%D0%97%D0%B0%D0%BA%D0%BE%D0%BD%20%D0%9E%D0%BC%D0%B0.md)');
  });
  it('режим Obsidian: вики-ссылки, видео-встраивание, выноска', () => {
    const files = buildMarkdownExport(world(), { flavor: 'obsidian' });
    const ohm = files.find((f) => f.path === 'Естественные науки/Физика/Закон Ома.md')!.content;
    expect(ohm).toContain('[[Естественные науки/Физика/Сопротивление|сопротивление]]'.replace('Естественные науки/Физика/', ''));
    expect(ohm).toContain('![](https://youtu.be/dQw4w9WgXcQ)');
    expect(ohm).toContain('> [!important] Запомните\n> ток течёт');
    expect(buildMarkdownExport(world()).find((f) => f.path.endsWith('Закон Ома.md'))!.content).toContain('> [!important] Запомните\n> ток течёт');
  });
  it('round-trip: те же темы, конспекты, карточки, словари, стихи, значки', async () => {
    const d = world();
    const { plan } = await roundTrip(d);
    expect(plan.warnings).toEqual([]);
    expect(plan.topics.map((t) => t.name).sort()).toEqual(['CON', 'Закон Ома', 'Закон Ома', 'Правило ЖИ/ШИ', 'Сопротивление']);
    const by = (name: string, subject: string) => plan.topics.find((t) => t.name === name && t.subjectName === subject)!;
    const ohm = by('Закон Ома', 'Физика');
    // предмет, папка, значки, цвета
    expect(ohm).toMatchObject({ subjectName: 'Физика', subjectColor: '#2A5BB8', subjectIcon: '⚡', subjectIconImg: WEBP, folderName: 'Естественные науки', folderColor: '#0E8FA3', folderIcon: '🔬', folderIconImg: PNG, examDate: '2026-12-01', important: true });
    expect(by('Правило ЖИ/ШИ', 'Русский: язык?')).toMatchObject({ kind: 'rule', subjectName: 'Русский: язык?' });
    // подтема
    const sub = by('Сопротивление', 'Физика');
    expect(sub.parentKey).toBe(ohm.key);
    // конспект: формулы, выделение, таблица, видео, картинка (data URI вернулся), рисунок, ссылки на темы
    expect(ohm.note).toContain('$I=U/R$');
    expect(ohm.note).toContain('$$\nI = \\frac{U}{R}\n$$');
    expect(ohm.note).toContain('==важно== **жирно** ++под++ (стр. 12)');
    expect(ohm.note).toContain(`![схема](${PNG})`);
    expect(ohm.note).toContain('![Рисунок](data:image/svg+xml;base64,');
    expect(ohm.note).toContain('![video](https://youtu.be/dQw4w9WgXcQ)');
    expect(ohm.note).toContain('| a | b |');
    expect(ohm.note).toContain('> **Запомните:** ток течёт');
    expect(ohm.note).toContain(`[сопротивление](mnema://topic/${sub.key})`);
    expect(ohm.note).toContain('[карточку](mnema://topic/' + ohm.key + ')'); // ссылка на карточку ведёт в её тему
    expect(sub.note).toBe(`R — сопротивление [закон](mnema://topic/${ohm.key})`);
    expect(sameNote(by('Закон Ома', 'Русский: язык?').note, 'Одноимённая тема в другом предмете')).toBe(true);
    // карточки
    const got = ohm.cards.map(({ type, front, back, why, listId }) => ({ type, front, back, ...(why ? { why } : {}), ...(listId ? { listId } : {}) }));
    const want = d.cards.filter((c) => c.topicId === 't1').map(({ type, front, back, why, listId }) => ({ type, front, back, ...(why ? { why } : {}), ...(listId ? { listId } : {}) }));
    expect(got.sort((a, b) => a.front.localeCompare(b.front))).toEqual(want.sort((a, b) => a.front.localeCompare(b.front)));
    expect(ohm.lists).toEqual([{ id: 'L1', kind: 'vocab', title: 'Слова', cols: ['EN', 'RU', 'Пример'], mode: 'reverse', lang: 'en-US' }]);
    expect(ohm.poems).toEqual([{ title: 'Стих', author: 'А. П.', text: 'раз\nдва' }]);
    expect(ohm.pages).toEqual([{ n: 12, img: PNG }]);
    expect(sub.cards).toEqual([{ type: 'typing', front: 'Единица R', back: 'Ом|ом' }]);
    expect(plan.stats).toMatchObject({ notes: 5, subjects: 2, folders: 1, cards: 6 });
  });
  it('round-trip в режиме Obsidian сохраняет ссылки между темами', async () => {
    const { plan } = await roundTrip(world(), 'obsidian');
    const ohm = plan.topics.find((t) => t.name === 'Закон Ома' && t.subjectName === 'Физика')!;
    const sub = plan.topics.find((t) => t.name === 'Сопротивление')!;
    expect(ohm.note).toContain(`[сопротивление](mnema://topic/${sub.key})`);
    expect(ohm.note).toContain('![video](https://youtu.be/dQw4w9WgXcQ)');
    expect(ohm.note).toContain('> **Запомните:** ток течёт');
  });
  it('внешняя папка архива снимается, README и Карточки.md не становятся темами', async () => {
    const { pack } = await roundTrip(world());
    expect([...pack.files.keys()].some((p) => p.startsWith('Refrain'))).toBe(false);
    expect(pack.files.has('README.md')).toBe(true);
    expect(planImport(pack).topics.some((t) => t.name === 'Карточки' || /Конспекты из/.test(t.note))).toBe(false);
  });
});

describe('импорт: чужие хранилища', () => {
  it('Obsidian без свойств: верхняя папка — предмет, вики-ссылки, ![[картинка]], выноски, комментарии', () => {
    const pack = packFromEntries([
      { path: 'Биология/Клетка.md', bytes: bytes('---\ntags: [bio]\n---\n# Клетка\nСм. [[Митоз|деление]] и [[Нет такой]].\n%%скрыто%%\n![[схема.png|300]]\n> [!tip] Запомни\n> текст ^abc\n') },
      { path: 'Биология/Клетка/Митоз.md', bytes: bytes('Митоз') },
      { path: 'Заметка.md', bytes: bytes('Просто') },
      { path: 'attachments/схема.png', bytes: Uint8Array.from(Buffer.from(PNG.split(',')[1], 'base64')) },
      { path: '.obsidian/app.json', bytes: bytes('{}') }
    ]);
    const plan = planImport(pack, { fallbackName: 'Мой vault' });
    const cell = plan.topics.find((t) => t.name === 'Клетка')!;
    const mit = plan.topics.find((t) => t.name === 'Митоз')!;
    expect(cell.subjectName).toBe('Биология');
    expect(mit.parentKey).toBe(cell.key);
    expect(plan.topics.find((t) => t.name === 'Заметка')!.subjectName).toBe('Мой vault');
    expect(cell.note).toBe(`См. [деление](mnema://topic/${mit.key}) и Нет такой.\n\n![схема.png](${PNG})\n> **Запомни**\n> текст`);
    expect(plan.topics).toHaveLength(3);
  });
  it('HTML и опасные ссылки из файла не попадают в конспект', () => {
    const pack = packFromEntries([{ path: 'Х/Опасное.md', bytes: bytes('Привет <script>alert(1)</script>\n\n[клик](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n\n![](https://example.com/a.png)') }]);
    const note = planImport(pack).topics[0].note;
    expect(note).not.toMatch(/<script|<img|javascript:|<[a-z][^>]*\son\w+=/i);
    expect(note).toContain('![](https://example.com/a.png)');
  });
  it('SVG со скриптом и подложный png не принимаются как картинки', () => {
    const pack = packFromEntries([
      { path: 'Х/Т.md', bytes: bytes('![](bad.svg) ![](fake.png) ![](ok.svg)') },
      { path: 'Х/bad.svg', bytes: bytes('<svg onload="alert(1)"><script>1</script></svg>') },
      { path: 'Х/fake.png', bytes: bytes('<svg xmlns="http://www.w3.org/2000/svg"/>') },
      { path: 'Х/ok.svg', bytes: bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>') }
    ]);
    const plan = planImport(pack);
    expect(plan.topics[0].note).toContain('картинка «bad.svg» не найдена');
    expect(plan.topics[0].note).toContain('картинка «fake.png» не найдена');
    expect(plan.topics[0].note).toContain('![ok.svg](data:image/svg+xml;base64,');
    expect(plan.warnings.join()).toContain('Не нашлось картинок: 2');
  });
  it('значок предмета из чужого файла проходит проверку: SVG и большой растр отбрасываются', () => {
    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60000)]);
    const pack = packFromEntries([
      { path: 'А/Т.md', bytes: bytes('---\nsubject: А\nsubject-icon-image: i.png\nsubject-color: red\nsubject-icon: "<b>"\n---\nТекст') },
      { path: 'А/i.png', bytes: big }
    ]);
    const t = planImport(pack).topics[0];
    expect(t.subjectIconImg).toBeUndefined();
    expect(t.subjectIcon).toBeUndefined();
    expect(t.subjectColor).toMatch(/^#[0-9A-F]{6}$/i); // «red» не цвет — взят из палитры
  });
});

describe('zip: защита и лимиты', () => {
  const zipOf = async (entries: Record<string, Uint8Array>) => (await import('fflate')).zipSync(entries);
  it('пути с «..», абсолютные и с диском пропускаются с предупреждением', async () => {
    const zip = await zipOf({ '../evil.md': bytes('x'), 'a/../../evil2.md': bytes('x'), '/abs.md': bytes('x'), 'C:/disk.md': bytes('x'), 'ok/Тема.md': bytes('норм') });
    const pack = await packFromZip(zip);
    expect([...pack.files.keys()]).toEqual(['ok/Тема.md']);
    expect(pack.warnings.length).toBe(4);
  });
  it('лишние типы файлов и скрытые папки пропускаются', async () => {
    const pack = await packFromZip(await zipOf({ 'a.exe': bytes('x'), '.git/config.md': bytes('x'), 'a/b.md': bytes('x'), 'a/c.txt': bytes('x') }));
    expect([...pack.files.keys()]).toEqual(['a/b.md']);
  });
  it('слишком большая заметка и картинка пропускаются', async () => {
    const pack = await packFromZip(await zipOf({ 'big.md': new Uint8Array(LIMITS.noteBytes + 1), 'big.png': new Uint8Array(LIMITS.imageBytes + 1), 'ok.md': bytes('ok') }));
    expect([...pack.files.keys()]).toEqual(['ok.md']);
    expect(pack.warnings).toHaveLength(2);
  });
  it('слишком много записей — ошибка', async () => {
    const e: Record<string, Uint8Array> = {};
    for (let i = 0; i <= LIMITS.entries; i++) e[`f${i}.md`] = new Uint8Array(0);
    await expect(packFromZip(await zipOf(e))).rejects.toThrow('слишком много');
  });
  it('заметок больше предела — лишние отбрасываются', () => {
    const entries = Array.from({ length: LIMITS.notes + 5 }, (_, i) => ({ path: `n${i}.md`, bytes: bytes('x') }));
    const pack = packFromEntries(entries);
    expect(pack.files.size).toBe(LIMITS.notes);
    expect(pack.warnings.join()).toContain('Заметок больше');
  });
});
