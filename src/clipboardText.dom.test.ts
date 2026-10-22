// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canReadClipboard, CLIP_MESSAGE, insertAt, readClipboardText } from './clipboardText';

const setClipboard = (v: unknown) => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: v });

afterEach(() => {
  delete window.mnemaApi;
  setClipboard(undefined);
});

describe('canReadClipboard', () => {
  it('нет ни моста, ни navigator.clipboard — кнопки нет', () => expect(canReadClipboard()).toBe(false));
  it('браузер с clipboard.readText', () => {
    setClipboard({ readText: async () => 'x' });
    expect(canReadClipboard()).toBe(true);
  });
  it('Android: мост', () => {
    window.mnemaApi = { readClipboard: async () => 'x' } as unknown as typeof window.mnemaApi;
    expect(canReadClipboard()).toBe(true);
  });
});

describe('readClipboardText', () => {
  it('текст из браузера', async () => {
    setClipboard({ readText: async () => 'dog\tсобака' });
    expect(await readClipboardText()).toEqual({ ok: true, text: 'dog\tсобака' });
  });
  it('мост Android важнее браузера', async () => {
    setClipboard({ readText: async () => 'браузер' });
    window.mnemaApi = { readClipboard: async () => 'приложение' } as unknown as typeof window.mnemaApi;
    expect(await readClipboardText()).toEqual({ ok: true, text: 'приложение' });
  });
  it('пустой буфер', async () => {
    setClipboard({ readText: async () => '   ' });
    expect(await readClipboardText()).toEqual({ ok: false, reason: 'empty' });
  });
  it('браузер запретил доступ', async () => {
    setClipboard({ readText: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) });
    expect(await readClipboardText()).toEqual({ ok: false, reason: 'denied' });
  });
  it('мост вернул null — нет доступа', async () => {
    window.mnemaApi = { readClipboard: async () => null } as unknown as typeof window.mnemaApi;
    expect(await readClipboardText()).toEqual({ ok: false, reason: 'denied' });
  });
  it('нечем читать', async () => {
    expect(await readClipboardText()).toEqual({ ok: false, reason: 'unsupported' });
  });
  it('у каждой причины — понятное сообщение', () => {
    for (const m of Object.values(CLIP_MESSAGE)) expect(m.length).toBeGreaterThan(20);
  });
});

describe('insertAt', () => {
  it('без выделения — в конец с новой строки', () => {
    expect(insertAt('a', 'b')).toEqual({ value: 'a\nb', caret: 3 });
    expect(insertAt('a\n', 'b')).toEqual({ value: 'a\nb', caret: 3 });
    expect(insertAt('', 'b')).toEqual({ value: 'b', caret: 1 });
  });
  it('на место выделения', () => {
    expect(insertAt('кот и пёс', 'собака', 6, 9)).toEqual({ value: 'кот и собака', caret: 12 });
    expect(insertAt('ab', 'X', 1, 1)).toEqual({ value: 'aXb', caret: 2 });
  });
  it('неверное выделение — в конец', () => {
    expect(insertAt('ab', 'X', 5, 6).value).toBe('ab\nX');
    expect(insertAt('ab', 'X', 2, 1).value).toBe('ab\nX');
    expect(insertAt('ab', 'X', -1, 1).value).toBe('ab\nX');
  });
});
