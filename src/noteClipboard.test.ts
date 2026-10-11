import { describe, expect, it } from 'vitest';
import { cleanForClipboard } from './noteClipboard';

describe('копирование из конспекта', () => {
  it('Markdown для других программ: без data-картинок, внутренних ссылок и служебных значков', () => {
    const md = 'Ток $I=U/R$ ==важно== ![схема](data:image/png;base64,AAAA) ![Рисунок](data:image/svg+xml;base64,BBBB) ![video](https://youtu.be/x1234567) см. [тему](mnema://topic/abc) \\[стр. 3\\] ++под++';
    const out = cleanForClipboard(md);
    expect(out).toBe('Ток $I=U/R$ ==важно== *(картинка: схема)* *(рисунок)* https://youtu.be/x1234567 см. тему (стр. 3) <u>под</u>');
    expect(out).not.toMatch(/data:|mnema:/);
  });
});
