// Шаблоны нового конспекта (1.34): пустой конспект на телефоне — это белый лист и вопрос «с чего начать».
// Шаблон даёт заголовки, под которые удобно писать; всё обычный Markdown, лишнее ученик просто стирает.

export interface NoteTemplate {
  id: 'empty' | 'topic' | 'chapter';
  title: string;
  hint: string;
  /** Текст конспекта по названию темы. */
  make: (topicName: string) => string;
}

const heading = (name: string) => {
  const n = name.trim().replace(/\s+/g, ' ');
  return n ? `# ${n}\n\n` : '';
};

export const NOTE_TEMPLATES: NoteTemplate[] = [
  { id: 'empty', title: 'Пустой', hint: 'Просто писать', make: () => '' },
  {
    id: 'topic',
    title: 'По теме',
    hint: 'Главное, определения, примеры, вопросы',
    make: (name) => `${heading(name)}## Главное\n\n- Главная мысль своими словами\n\n## Определения\n\n- **Термин** — что это значит\n\n## Примеры\n\n- Пример из учебника или из жизни\n\n## Проверь себя\n\n- Вопрос, на который нужно ответить?\n`
  },
  {
    id: 'chapter',
    title: 'По главе',
    hint: 'План параграфа, понятия, даты, выводы',
    make: (name) => `${heading(name)}## План\n\n1. Первый пункт параграфа\n2. Второй пункт\n3. Третий пункт\n\n## Ключевые понятия\n\n- **Понятие** — определение\n\n## Даты и числа\n\n- Год или число — что оно значит\n\n## Выводы\n\n- Что из этого следует\n`
  }
];

export const templateById = (id: string) => NOTE_TEMPLATES.find((t) => t.id === id);

/** Текст из буфера → конспект: убрать лишние пустые строки и пробелы в конце строк, \r\n → \n. */
export function cleanPasted(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
