import { linksToWiki } from './links';
// Экспорт в Obsidian: предмет → папка, тема → заметка (подтемы — во вложенной папке),
// картинки и рисунки → файлы во «_Вложения», карточки → раздел в формате плагина Spaced Repetition («Вопрос::Ответ»).
import { byOrder, childTopics, subjectRules } from './store';
import type { AppData, Card, Topic } from './types';

export interface ExportFile {
  path: string;
  content: string;
  base64?: boolean;
}

const safeName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|#^[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Без названия';

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/gif': 'gif' };

function cardLine(c: Card): string {
  const one = (s: string) => s.replace(/\n+/g, ' <br> ').trim();
  if (c.type === 'cloze') return one(c.front.replace(/\{\{(?:c\d+::)?(.+?)(?:::[^}]*)?\}\}/g, '==$1=='));
  if (c.type === 'reverse') return `${one(c.front)}:::${one(c.back)}`;
  if (c.type === 'problem') return `${one(c.front)}::${one(c.back)}`;
  return `${one(c.front)}::${one(c.back.split('|')[0])}`;
}

export function buildObsidianExport(data: AppData): ExportFile[] {
  const files: ExportFile[] = [];
  const used = new Map<string, number>();
  let imgN = 0;
  const unique = (p: string) => {
    const n = used.get(p.toLowerCase()) ?? 0;
    used.set(p.toLowerCase(), n + 1);
    return n ? p.replace(/(\.md)$/, ` (${n + 1})$1`) : p;
  };
  const titles = new Map(data.topics.map((t) => [t.id, safeName(t.name)]));

  function noteFor(t: Topic, subjectName: string, dir: string, depth: number) {
    const attach = '../'.repeat(depth) + '_Вложения/';
    let body = t.note.replace(/!\[([^\]]*)\]\((data:([^;]+);base64,([A-Za-z0-9+/=]+))\)/g, (_m, alt: string, _u: string, mime: string, b64: string) => {
      const ext = EXT[mime] ?? 'bin';
      const name = `мнема-${++imgN}.${ext}`;
      files.push({ path: `_Вложения/${name}`, content: b64, base64: true });
      return `![${alt}](${encodeURI(attach + name)})`;
    });
    body = body.replace(/\\?\[стр\.\s*(\d{1,4})\\?\]/g, '(стр. $1)');
    body = linksToWiki(body, data, (id) => titles.get(id));
    const cards = data.cards.filter((c) => c.topicId === t.id);
    const kids = childTopics(data, t.subjectId, t.id);
    const tags = ['мнема', safeName(subjectName).replace(/\s+/g, '_').toLowerCase()];
    if (t.important) tags.push('важное');
    const fm = ['---', `мнема-id: ${t.id}`, `предмет: "${subjectName.replace(/"/g, "'")}"`, ...(t.examDate ? [`контрольная: ${t.examDate}`] : []), `tags: [${tags.join(', ')}]`, '---', ''];
    const parts = [...fm, `# ${t.name}`, '', body.trim()];
    const cell = (x: string) => x.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
    for (const l of t.lists ?? []) {
      const rows = cards.filter((c) => c.listId === l.id);
      if (!rows.length) continue;
      parts.push('', `## ${l.title}`, '', `| ${l.cols.map(cell).join(' | ')} |`, '|---|---|---|', ...rows.map((c) => `| ${cell(c.front)} | ${cell(c.back)} | ${cell(c.why ?? '')} |`));
    }
    if (kids.length) parts.push('', '## Подтемы', '', ...kids.map((k) => `- [[${titles.get(k.id)}]]`));
    if (cards.length) parts.push('', '## Карточки', '', '#flashcards', '', ...cards.map(cardLine));
    const path = unique(`${dir}/${titles.get(t.id)}.md`);
    files.push({ path, content: parts.join('\n') + '\n' });
    for (const k of kids) noteFor(k, subjectName, `${dir}/${titles.get(t.id)}`, depth + 1);
  }

  for (const s of [...data.subjects].sort(byOrder)) {
    const dir = safeName(s.name);
    for (const t of childTopics(data, s.id)) noteFor(t, s.name, dir, 1);
    for (const r of subjectRules(data, s.id)) noteFor(r, s.name, `${dir}/Правила`, 2);
  }
  files.push({
    path: 'Мнема — как устроено.md',
    content:
      '# Экспорт из Мнемы\n\nКаждый предмет — папка, каждая тема — заметка. Картинки лежат в «_Вложения».\n\nКарточки записаны в разделе «Карточки» в формате плагина Spaced Repetition: `Вопрос::Ответ`, `Термин:::Значение` (в обе стороны), `==пропуск==`.\n\nПрогресс повторений остаётся в Мнеме.\n'
  });
  return files;
}
