import { describe, expect, it } from 'vitest';
import { cleanPasted, NOTE_TEMPLATES, templateById } from './noteTemplates';

describe('шаблоны конспекта', () => {
  it('три шаблона: пустой, по теме, по главе', () => {
    expect(NOTE_TEMPLATES.map((t) => t.id)).toEqual(['empty', 'topic', 'chapter']);
    for (const t of NOTE_TEMPLATES) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.hint.length).toBeGreaterThan(0);
    }
  });
  it('пустой — пустая строка', () => expect(templateById('empty')!.make('§1')).toBe(''));
  it('по теме: заголовок из названия и разделы', () => {
    const md = templateById('topic')!.make('  Фотосинтез  ');
    expect(md.startsWith('# Фотосинтез\n')).toBe(true);
    for (const h of ['## Главное', '## Определения', '## Примеры', '## Проверь себя']) expect(md).toContain(h);
    expect(md).not.toMatch(/^- *$/m);
  });
  it('по главе: план с нумерацией', () => {
    const md = templateById('chapter')!.make('§12. Реформы');
    expect(md).toContain('# §12. Реформы');
    expect(md).toContain('## План\n\n1. Первый пункт');
    // Ни одного пустого пункта: в редакторе такой выглядел бы как «-».
    expect(md).not.toMatch(/^(- |\d+\. )$/m);
    expect(md).toContain('## Выводы');
  });
  it('без названия — без пустого заголовка', () => {
    expect(templateById('topic')!.make('   ').startsWith('## Главное')).toBe(true);
  });
  it('неизвестный шаблон', () => expect(templateById('nope')).toBeUndefined());
});

describe('cleanPasted', () => {
  it('переводы строк, лишние пустые строки и пробелы в конце', () => {
    expect(cleanPasted('a  \r\nb\r\n\r\n\r\n\r\nc\t\n')).toBe('a\nb\n\nc');
  });
  it('пустой текст', () => expect(cleanPasted('  \n ')).toBe(''));
  it('эмодзи и спецсимволы не трогает', () => expect(cleanPasted('Клетка 🧬 <b>&amp;</b>')).toBe('Клетка 🧬 <b>&amp;</b>'));
});
