// Перевод заметки Obsidian в конспект Мнемы.

const CALLOUT_TITLES: Record<string, string> = {
  note: 'Заметка',
  info: 'Информация',
  tip: 'Совет',
  hint: 'Подсказка',
  important: 'Важно',
  warning: 'Внимание',
  caution: 'Осторожно',
  danger: 'Опасно',
  example: 'Пример',
  quote: 'Цитата',
  question: 'Вопрос',
  summary: 'Итог',
  abstract: 'Кратко',
  todo: 'Сделать',
  success: 'Готово',
  failure: 'Ошибка',
  bug: 'Ошибка'
};

export function convertObsidian(md: string, images: Record<string, string> = {}): string {
  let s = md.replace(/\r\n/g, '\n');
  // YAML-заголовок (свойства заметки)
  s = s.replace(/^---\n[\s\S]*?\n---\n?/, '');
  // Комментарии %% … %%
  s = s.replace(/%%[\s\S]*?%%/g, '');
  // Встроенные картинки ![[img.png|300]]
  s = s.replace(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, (_m, name: string) => {
    const n = name.trim();
    const base = n.split('/').pop() ?? n;
    if (images[base]) return `![${base}](${images[base]})`;
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(n)) return `*(картинка «${base}» не найдена)*`;
    return `*(см. заметку «${n.replace(/\.md$/i, '')}»)*`;
  });
  // Обычные markdown-картинки с относительным путём
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt: string, src: string) => {
    if (/^(data:|https?:)/.test(src)) return m;
    let dec = src;
    try {
      dec = decodeURIComponent(src);
    } catch {
      /* оставить как есть */
    }
    const base = dec.split('/').pop() ?? dec;
    return images[base] ? `![${alt || base}](${images[base]})` : `*(картинка «${base}» не найдена)*`;
  });
  // Ссылки [[Заметка#Раздел|текст]] → текст
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => (alias ?? target.split('#')[0]).trim());
  // Выноски > [!note] Заголовок
  s = s.replace(/^>\s*\[!(\w+)\][+-]?\s*(.*)$/gm, (_m, type: string, title: string) => {
    const t = title.trim() || CALLOUT_TITLES[type.toLowerCase()] || type;
    return `> **${t}**`;
  });
  // Блочные ссылки ^abc123 в конце строки
  s = s.replace(/\s\^[a-zA-Z0-9-]+$/gm, '');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

export function noteTitle(relPath: string): string {
  return (relPath.split('/').pop() ?? relPath).replace(/\.md$/i, '');
}

export function topFolder(relPath: string): string | null {
  const parts = relPath.split('/');
  return parts.length > 1 ? parts[0] : null;
}
