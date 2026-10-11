// Файл, открытый двойным щелчком: тема, стиль или ошибка — данные при этом не меняются.
import { describe, expect, it } from 'vitest';
import { readOpenedFile } from './openFile';

const topic = { kind: 'mnema-topic', version: 1, subject: { name: 'История', color: '#3A3F4E' }, topic: { name: 'Петр I', note: '' }, cards: [{ type: 'basic', front: 'Когда?', back: '1703' }] };
const style = { kind: 'refrain-style', formatVersion: 1, name: 'Мой вид', css: '.main{color:red}' };

describe('открытие файла Refrain', () => {
  it('тема .mnema', () => {
    const r = readOpenedFile({ name: 'Петр.mnema', text: JSON.stringify(topic) }, 'm-1');
    expect(r.kind).toBe('topic');
    if (r.kind === 'topic') expect(r.pkg.topic.name).toBe('Петр I');
  });
  it('стиль .refrainstyle и старый .mnemamod', () => {
    const a = readOpenedFile({ name: 'вид.refrainstyle', text: JSON.stringify(style) }, 'm-2');
    expect(a.kind).toBe('style');
    if (a.kind === 'style') expect(a.mod).toMatchObject({ id: 'm-2', name: 'Мой вид' });
    const b = readOpenedFile({ name: 'старый.mnemamod', text: JSON.stringify({ kind: 'mnema-mod', name: 'Старый', css: 'a{}' }) }, 'm-3');
    expect(b.kind).toBe('style');
  });
  it('чужое расширение, не JSON и не тот файл — понятная ошибка', () => {
    expect(readOpenedFile({ name: 'картинка.png', text: '{}' }, 'm').kind).toBe('error');
    expect(readOpenedFile({ name: 'сломан.mnema', text: '{не json' }, 'm')).toMatchObject({ kind: 'error' });
    expect(readOpenedFile({ name: 'другое.mnema', text: '{"a":1}' }, 'm')).toMatchObject({ kind: 'error' });
  });
  it('стиль из более новой версии не принимается', () => {
    const r = readOpenedFile({ name: 'x.refrainstyle', text: JSON.stringify({ ...style, formatVersion: 999 }) }, 'm');
    expect(r.kind).toBe('error');
  });
});
