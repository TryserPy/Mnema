// 1.33, №6: маркер ==текст== с пробелами, знаками, кириллицей, формулами, вложенностью и несколькими выделениями в строке.
import { describe, expect, it, vi } from 'vitest';

vi.mock('dompurify', () => ({ default: { isSupported: false, sanitize: (h: string) => h, addHook() {} } }));

import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import { renderMarkdown } from './components/Markdown';
import { HIGHLIGHT_AT, matchHighlight, MnemaHighlight } from './highlightMark';

const md = new MarkdownManager({ extensions: [StarterKit, MnemaHighlight, InlineMath, BlockMath] });

/** Тексты с маркером в редакторе после разбора Markdown. */
function marked(src: string): string[] {
  const out: string[] = [];
  const walk = (n: { text?: string; marks?: { type: string }[]; content?: unknown[]; type: string; attrs?: { latex?: string } }) => {
    if (n.marks?.some((m) => m.type === 'highlight')) out.push(n.text ?? `$${n.attrs?.latex}$`);
    (n.content ?? []).forEach((c) => walk(c as never));
  };
  walk(md.parse(src) as never);
  return out;
}

const CASES: [string, string[]][] = [
  ['==текст, с запятой==', ['текст, с запятой']],
  ['==a: b — «c» (d).==', ['a: b — «c» (d).']],
  ['==«в кавычках»== и ==(в скобках)==', ['«в кавычках»', '(в скобках)']],
  ['один ==раз== и ==два== тут', ['раз', 'два']],
  ['==x = 5==', ['x = 5']],
  ['==Параллелограмм — это четырёхугольник, у которого стороны попарно параллельны.==', ['Параллелограмм — это четырёхугольник, у которого стороны попарно параллельны.']]
];

describe('маркер в просмотре', () => {
  it.each(CASES)('%s', (src, parts) => {
    const html = renderMarkdown(src);
    expect(html).not.toContain('==');
    expect([...html.matchAll(/<mark>(.*?)<\/mark>/g)].map((m) => m[1])).toEqual(parts);
  });

  it('вложенность с жирным и курсивом, формула с «=» внутри', () => {
    expect(renderMarkdown('==**жирный** и *курсив*==')).toContain('<mark><strong>жирный</strong> и <em>курсив</em></mark>');
    const f = renderMarkdown('==формула $a=b$ тут==');
    expect(f).toMatch(/^<p><mark>формула .*katex.* тут<\/mark><\/p>/s);
  });

  it('незакрытое «==» — обычный текст; не протекает через строку', () => {
    expect(renderMarkdown('незакрытое ==слово')).toBe('<p>незакрытое ==слово</p>\n');
    expect(renderMarkdown('==строка\nдругая==')).not.toContain('<mark>');
    expect(renderMarkdown('== ==')).not.toContain('<mark>');
  });
});

describe('маркер в редакторе (разбор Markdown)', () => {
  it.each(CASES)('%s', (src, parts) => {
    expect(marked(src)).toEqual(parts);
    expect(md.serialize(md.parse(src))).toBe(src);
  });
  it('формула внутри маркера: текст вокруг подсвечен, формула цела, повторное сохранение не меняет текст', () => {
    expect(marked('==формула $a=b$ тут==')).toEqual(['формула ', ' тут']);
    const once = md.serialize(md.parse('==формула $a=b$ тут=='));
    expect(once).toContain('$a=b$');
    expect(md.serialize(md.parse(once))).toBe(once);
  });
  it('перевод строки маркер не захватывает', () => {
    expect(marked('==строка\nдругая==')).toEqual([]);
  });
});

describe('разбор', () => {
  it('крайние пробелы снимаются, пустое — не маркер', () => {
    expect(matchHighlight('==  слово  ==')?.inner).toBe('слово');
    expect(matchHighlight('==   ==')).toBeNull();
    expect(HIGHLIGHT_AT.test('==a==b==')).toBe(true);
  });
});
