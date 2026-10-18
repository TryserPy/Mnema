// 1.33, №5: сообщения «Добавить из учебника» — главное с действием, одинаковое — одной строкой, без противоречий.
import { describe, expect, it } from 'vitest';
import { SCREEN_TEXT, textbookMessages } from './textbookMessages';
import { isScreenshot } from './textbook';
import { ADVICE_TEXT } from './textbookPhoto';

const LM = 'Не удаётся подключиться. Если это программа на компьютере (LM Studio, Ollama) — запусти в ней сервер.';

describe('сообщения окна «Из учебника»', () => {
  it('случай со скриншота: «темно» + «не удаётся подключиться… прочитана без интернета» → одна главная причина и совет про скриншот', () => {
    const list = textbookMessages({
      errors: [],
      results: [{ n: 1, aiFallback: LM, advice: [{ code: 'dark', text: ADVICE_TEXT.dark }], screen: true }]
    });
    expect(list[0].text).toMatch(/LM Studio или Ollama/);
    expect(list[0].action).toBe('settings');
    expect(list.map((m) => m.text).join(' ')).not.toMatch(/без интернета/);
    // Скриншот — не «включи свет», а честно: это не фото страницы.
    expect(list.some((m) => m.text === SCREEN_TEXT)).toBe(true);
    expect(list.some((m) => m.text === ADVICE_TEXT.dark)).toBe(false);
  });

  it('одинаковая причина на нескольких страницах — одной строкой; ошибка выше предупреждения и сведений', () => {
    const list = textbookMessages({
      errors: ['Стр. 3: не получилось открыть это фото. Сохрани его как JPEG или PNG и добавь снова.'],
      results: [
        { n: 1, aiFallback: LM },
        { n: 2, aiFallback: LM },
        { n: 4, note: 'На снимке разворот — прочитал две страницы по очереди.' }
      ]
    });
    expect(list.map((m) => m.level)).toEqual(['error', 'warn', 'info']);
    expect(list[0].pages).toEqual([3]);
    expect(list[0].action).toBe('reshoot');
    expect(list[1].pages).toEqual([1, 2]);
  });

  it('ИИ некому спросить (aiDown) без страниц — одно сообщение со входом', () => {
    const list = textbookMessages({ errors: ['Стр. 1: На фото не нашлось текста.'], aiDown: 'Нужен вход в Refrain ИИ или свой ключ ИИ.', results: [] });
    expect(list.find((m) => m.level === 'warn')?.action).toBe('signin');
    expect(list).toHaveLength(2);
  });

  it('нет сети — «Прочитать ещё раз»; неуверенное чтение — сведения', () => {
    const list = textbookMessages({
      errors: [],
      results: [
        { n: 1, aiFallback: 'Нет связи с Refrain ИИ.' },
        { n: 2, quality: { words: 40, unsure: 20, conf: 50 } }
      ],
      weak: (r) => Boolean(r.quality && r.quality.conf < 72)
    });
    expect(list[0].action).toBe('retry');
    expect(list[1].level).toBe('info');
  });

  it('скриншот или фото с камеры', () => {
    expect(isScreenshot({ name: 'Screenshot_20261018-211700.png', type: 'image/png' })).toBe(true);
    expect(isScreenshot({ name: 'Снимок экрана 2026-10-18.png', type: 'image/png' })).toBe(true);
    expect(isScreenshot({ name: 'IMG_1234.jpg', type: 'image/jpeg' })).toBe(false);
    expect(isScreenshot({ name: 'IMG_1234.png', type: 'image/png' })).toBe(false);
    expect(isScreenshot({ name: 'page.png', type: 'image/png' })).toBe(true);
  });
});
