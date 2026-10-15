// «Всё в папку Markdown»: конспекты, карточки и картинки обычными файлами, которые открывает любая программа
// (Obsidian, Typora, VS Code, GitHub, Logseq) и которые Refrain умеет прочитать обратно (src/mdImport.ts).
//
//   README.md                   — что здесь лежит
//   Карточки.md, Карточки.csv   — все карточки одним файлом (для Anki, Quizlet, Excel)
//   attachments/                — картинки, рисунки (SVG), значки, фото страниц учебника
//   Папка/Предмет/Тема.md       — тема; подтемы — в папке «Тема/»; правила — «Правила/», общие термины — «Термины/»
//
// Разметка: CommonMark + GFM (таблицы), формулы $…$ и $$…$$, выделение ==…==, свойства YAML сверху, картинки — файлами.
// Рамки учебника «> **Запомните:** …» пишутся выносками Obsidian «> [!important] Запомните» (в других программах это обычная цитата).
// Выноски Refrain «> [!def] Термин» (shared/prompts/markup.ts) выгружаются без изменений.
// flavor 'obsidian' — ещё и ссылки между темами [[вики]] и видео ![](ссылка).
import { legacyFramesToCallouts } from './callout';
import { cardsToCsv, cardsToMarkdown, emitCards, emitList, emitPoems, type FlatCard, type PlainCard } from './mdCards';
import { b64ToBytes, bytesToB64, EXT_BY_MIME, emitFrontmatter, linkPath, parseImageUri, relPath, safeFileName, uniquePath } from './mdPortable';
import { hashText } from './noteText';
import { byOrder, childTopics, sortedFolders, subjectGlossaries, subjectRules } from './store';
import type { AppData, Subject, Topic } from './types';

export interface ExportFile {
  path: string;
  content: string; // текст или base64 (если base64: true)
  base64?: boolean;
}

export type Flavor = 'plain' | 'obsidian';
export const ATTACH_DIR = 'attachments';
export const README_NAME = 'README.md';
/** Метка в README.md: по ней импорт узнаёт папку, которую сделал Refrain, и снимает внешний каталог архива. */
export const EXPORT_MARK = 'refrain-markdown-export';

interface Planned {
  topic: Topic;
  subject: Subject;
  path: string;
  kids: Planned[];
}

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseOf = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/i, '');

export function buildMarkdownExport(data: AppData, opts: { flavor?: Flavor } = {}): ExportFile[] {
  const flavor = opts.flavor ?? 'plain';
  const files: ExportFile[] = [];
  const used = new Set<string>();
  const attachByHash = new Map<string, string>();
  const counters = { img: 0, draw: 0, page: 0 };

  function attach(kind: 'img' | 'draw' | 'page' | 'icon', mime: string, bytes: Uint8Array, nameHint = ''): string {
    const key = mime + hashText(bytesToB64(bytes));
    const have = attachByHash.get(key);
    if (have) return have;
    const ext = EXT_BY_MIME[mime] ?? 'bin';
    const stem = kind === 'draw' ? `рисунок-${++counters.draw}` : kind === 'page' ? `страница-${++counters.page}` : kind === 'icon' ? `значок-${safeFileName(nameHint, 'без-названия', 40)}` : `картинка-${++counters.img}`;
    const path = uniquePath(used, `${ATTACH_DIR}/${stem}.${ext}`);
    files.push({ path, content: bytesToB64(bytes), base64: true });
    attachByHash.set(key, path);
    return path;
  }

  // ---- 1. Куда какая тема ляжет ----
  const folders = sortedFolders(data);
  const folderOf = new Map(folders.map((f) => [f.id, f]));
  const dirs = new Set<string>();
  const unique = (parent: string, name: string) => {
    let n = name;
    for (let i = 2; dirs.has((parent + '/' + n).toLowerCase()); i++) n = `${name} (${i})`;
    dirs.add((parent + '/' + n).toLowerCase());
    return n;
  };
  const folderDir = new Map<string, string>();
  for (const f of folders) folderDir.set(f.id, unique('', safeFileName(f.name, 'Папка')));
  const subjectDir = new Map<string, string>();
  const subjects = [...data.subjects].sort(byOrder);
  for (const s of subjects) {
    const parent = s.folderId && folderDir.has(s.folderId) ? folderDir.get(s.folderId)! : '';
    subjectDir.set(s.id, (parent ? parent + '/' : '') + unique(parent, safeFileName(s.name, 'Предмет')));
  }

  const planned = new Map<string, Planned>();
  const pathsUsed = new Set<string>();
  const place = (topic: Topic, subject: Subject, dir: string): Planned => {
    const path = uniquePath(pathsUsed, `${dir}/${safeFileName(topic.name, 'Без названия')}.md`);
    const p: Planned = { topic, subject, path, kids: [] };
    planned.set(topic.id, p);
    return p;
  };
  const roots: Planned[] = [];
  const walk = (t: Topic, s: Subject, dir: string, parent?: Planned) => {
    if (planned.has(t.id)) return; // защита от петель в чужих данных
    const p = place(t, s, dir);
    (parent ? parent.kids : roots).push(p);
    for (const k of childTopics(data, s.id, t.id)) walk(k, s, p.path.replace(/\.md$/, ''), p);
  };
  for (const s of subjects) {
    const dir = subjectDir.get(s.id)!;
    for (const t of childTopics(data, s.id)) walk(t, s, dir);
    for (const r of subjectRules(data, s.id)) walk(r, s, `${dir}/Правила`);
    for (const g of subjectGlossaries(data, s.id)) walk(g, s, `${dir}/Термины`);
    // Всё, что не попало (родитель потерян, правило с подтемами…) — в корень предмета, чтобы ничего не пропало.
    for (const t of data.topics.filter((x) => x.subjectId === s.id && !planned.has(x.id)).sort(byOrder)) walk(t, s, dir);
  }

  // ---- 2. Текст ----
  const titleCount = new Map<string, number>();
  for (const p of planned.values()) titleCount.set(baseOf(p.path).toLowerCase(), (titleCount.get(baseOf(p.path).toLowerCase()) ?? 0) + 1);
  const wikiTarget = (p: Planned) => (titleCount.get(baseOf(p.path).toLowerCase()) === 1 ? baseOf(p.path) : p.path.replace(/\.md$/, ''));
  const cardTopic = new Map(data.cards.map((c) => [c.id, c.topicId]));

  function convertBody(note: string, from: Planned): string {
    const here = dirOf(from.path);
    let s = note.replace(/\r\n?/g, '\n');
    // Картинки и рисунки из самого текста — отдельными файлами.
    s = s.replace(/!\[([^\]]*)\]\((data:image\/[^)\s]+)\)/g, (m, alt: string, uri: string) => {
      const img = parseImageUri(uri);
      if (!img) return m;
      const svgText = img.mime === 'image/svg+xml' ? new TextDecoder().decode(img.bytes) : '';
      const drawing = /data-mnema="drawing"/.test(svgText.slice(0, 2000));
      const path = attach(drawing ? 'draw' : 'img', img.mime, img.bytes);
      return `![${alt}](${linkPath(relPath(here, path))})`;
    });
    // Видео
    s = s.replace(/!\[video\]\(([^)\s]+)\)/g, (_m, url: string) => (flavor === 'obsidian' ? `![](${url})` : `[▶ Видео](${url})`));
    // Номера страниц учебника: ссылка на фото страницы работает только в Refrain
    s = s.replace(/\\?\[стр\.\s*(\d{1,4})\\?\]/g, '(стр. $1)');
    // Подчёркивание ++x++ → <u>x</u> (так его понимают все)
    s = s.replace(/\+\+([^+\n]+?)\+\+/g, '<u>$1</u>');
    // Ссылки между темами и на карточки
    s = s.replace(/\[([^\]]+)\]\(mnema:\/\/(topic|card)\/([\w-]+)\)/g, (_m, text: string, kind: string, id: string) => {
      const tid = kind === 'topic' ? id : cardTopic.get(id);
      const target = tid ? planned.get(tid) : undefined;
      if (!target) return text;
      if (flavor === 'obsidian') return text === baseOf(target.path) ? `[[${wikiTarget(target)}]]` : `[[${wikiTarget(target)}|${text}]]`;
      return `[${text}](${linkPath(relPath(here, target.path))})`;
    });
    // Рамки учебника → выноски Obsidian; выноски «> [!def] …» уже в нужном виде и остаются как есть.
    s = legacyFramesToCallouts(s);
    return s.trim();
  }

  const cardsOf = (t: Topic) => data.cards.filter((c) => c.topicId === t.id);

  function emitTopic(p: Planned) {
    const { topic: t, subject: s } = p;
    const here = dirOf(p.path);
    const folder = s.folderId ? folderOf.get(s.folderId) : undefined;
    const rel = (path: string) => linkPath(relPath(here, path));
    const iconPath = (uri: string | undefined, name: string) => {
      const img = uri ? parseImageUri(uri) : null;
      return img ? rel(attach('icon', img.mime, img.bytes, name)) : undefined;
    };
    const pages = (t.pages ?? []).flatMap((pg) => {
      const img = parseImageUri(pg.img);
      return img ? [{ n: pg.n, file: rel(attach('page', img.mime, img.bytes)) }] : [];
    });
    const siblings = p.topic.parentId ? planned.get(p.topic.parentId)?.kids : roots.filter((r) => r.subject.id === s.id && !r.topic.kind);
    const tags = ['refrain', safeFileName(s.name, 'предмет').replace(/\s+/g, '_').toLowerCase(), ...(t.important ? ['важное'] : [])];
    const fm = emitFrontmatter({
      title: t.name,
      subject: s.name,
      'subject-color': s.color,
      'subject-icon': s.icon,
      'subject-icon-image': iconPath(s.iconImg, s.name),
      folder: folder?.name,
      'folder-color': folder?.color,
      'folder-icon': folder?.icon,
      'folder-icon-image': iconPath(folder?.iconImg, folder?.name ?? ''),
      tags,
      created: t.createdAt,
      updated: t.updatedAt,
      exam: t.examDate,
      important: t.important ? true : undefined,
      kind: t.kind,
      order: siblings && siblings.length > 1 ? siblings.findIndex((x) => x === p) + 1 : undefined,
      'refrain-id': t.id,
      'refrain-lists': t.lists?.length ? t.lists.map(({ id, kind, title, cols, mode, lang }) => ({ id, kind, title, cols, mode, ...(lang ? { lang } : {}) })) : undefined,
      'refrain-pages': pages.length ? pages : undefined
    });
    const parts: string[] = [fm, `# ${t.name}`, '', convertBody(t.note, p)];
    const cards = cardsOf(t);
    for (const l of t.lists ?? []) {
      const rows = cards.filter((c) => c.listId === l.id);
      if (rows.length) parts.push('', emitList(l, rows));
    }
    if (t.poems?.length) parts.push('', emitPoems(t.poems));
    const plain: PlainCard[] = cards.filter((c) => !c.listId).map(({ type, front, back, why }) => ({ type, front, back, why }));
    if (plain.length) parts.push('', emitCards(plain));
    if (p.kids.length) parts.push('', '## Подтемы', '', ...p.kids.map((k) => (flavor === 'obsidian' ? `- [[${wikiTarget(k)}]]` : `- [${k.topic.name}](${linkPath(relPath(here, k.path))})`)));
    files.push({ path: p.path, content: parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n' });
  }
  for (const p of planned.values()) emitTopic(p);

  // ---- 3. Все карточки одним файлом ----
  const flat: FlatCard[] = [];
  for (const s of subjects) {
    for (const t of data.topics.filter((x) => x.subjectId === s.id)) {
      for (const c of cardsOf(t)) flat.push({ subject: s.name, topic: t.name, type: c.type, front: c.front, back: c.back, why: c.why });
    }
  }
  if (flat.length) {
    files.push({ path: 'Карточки.md', content: cardsToMarkdown(flat) });
    files.push({ path: 'Карточки.csv', content: cardsToCsv(flat) });
  }

  files.push({ path: README_NAME, content: readme(flavor, planned.size, data.cards.length, flat.length > 0) });
  return files;
}

function readme(flavor: Flavor, topics: number, cards: number, hasCards: boolean): string {
  return `<!-- ${EXPORT_MARK} -->
# Конспекты из Refrain

Это обычные файлы: открой папку в Obsidian, Typora, VS Code или любом редакторе Markdown. Тем: ${topics}, карточек: ${cards}.

## Как устроено

- **Папки** — папки предметов, затем предметы, затем темы: \`Папка/Предмет/Тема.md\`. Подтемы лежат в папке с названием темы, правила — в «Правила», общие термины — в «Термины».
- **Картинки и рисунки** — отдельные файлы в \`attachments/\`. Рисунки — SVG: открываются в браузере и любом редакторе.
- **Свойства** сверху каждой темы (между \`---\`): название, предмет, теги, даты, контрольная. Начинающиеся с \`refrain-\` нужны Refrain, чтобы вернуть всё как было, — другим программам они не мешают.
- **Формулы** — \`$x^2$\` в строке и \`$$ … $$\` отдельным блоком (LaTeX). **Выделение маркером** — \`==текст==\`.
- **Ссылки между темами** — ${flavor === 'obsidian' ? 'вики-ссылки \\[\\[Тема]]' : 'обычные относительные ссылки \\[текст](путь/Тема.md)'}.
- **Видео** — ${flavor === 'obsidian' ? 'картинка-ссылка, Obsidian показывает плеер' : 'ссылка «▶ Видео»'}.
- **Карточки** лежат внизу темы, в разделе «Карточки»: \`Вопрос::Ответ\`, \`Термин:::Определение\` (в обе стороны), \`{{c1::пропуск}}\` в тексте.${hasCards ? ' Все карточки сразу: `Карточки.md` и `Карточки.csv` (для Anki, Quizlet, Excel).' : ''}
- Прогресс повторений в файлы не входит — он остаётся в приложении (для переноса в Anki используй «Экспорт в Anki» с переносом прогресса).

## Вернуть в Refrain

Настройки → Данные → Импорт → «Из папки Markdown или архива». Подойдёт и эта папка, и zip-архив, и хранилище Obsidian.
`;
}

/** Собрать zip. Всё внутри одной папки, чтобы «Распаковать здесь» не рассыпало файлы по каталогу. */
export async function zipExport(files: ExportFile[], root = 'Refrain — конспекты'): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import('fflate');
  const tree: Record<string, Uint8Array> = {};
  for (const f of files) tree[`${root}/${f.path}`] = f.base64 ? b64ToBytes(f.content) : strToU8(f.content);
  return zipSync(tree, { level: 6 });
}
