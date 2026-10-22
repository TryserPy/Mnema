// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initViewport, isTypingField, keyboardInset, KB_MIN, resizedByKeyboard, revealDelta, revealFocused } from './viewport';

describe('keyboardInset — сколько снизу закрыто клавиатурой', () => {
  it('нет visualViewport — 0', () => expect(keyboardInset(800, null)).toBe(0));
  it('клавиатура 300 px', () => expect(keyboardInset(800, { height: 500, offsetTop: 0 })).toBe(300));
  it('страница прокручена внутри видимой части', () => expect(keyboardInset(800, { height: 500, offsetTop: 100 })).toBe(200));
  it('не бывает меньше нуля', () => expect(keyboardInset(800, { height: 900, offsetTop: 0 })).toBe(0));
});

describe('resizedByKeyboard — окно уменьшилось под клавиатуру (adjustResize)', () => {
  it('поле в фокусе и окно ниже обычного на KB_MIN и больше — клавиатура', () => {
    expect(resizedByKeyboard(800 - KB_MIN, 800, true)).toBe(true);
    expect(resizedByKeyboard(400, 800, true)).toBe(true);
  });
  it('без поля в фокусе — нет (например, окно на компьютере сделали ниже)', () => expect(resizedByKeyboard(400, 800, false)).toBe(false));
  it('мелкое уменьшение (адресная строка) — нет', () => expect(resizedByKeyboard(760, 800, true)).toBe(false));
});

describe('revealDelta — насколько прокрутить к полю', () => {
  const view = { top: 0, bottom: 400 };
  it('поле видно — не крутим', () => expect(revealDelta({ top: 100, bottom: 150 }, view)).toBe(0));
  it('поле под клавиатурой — вниз, с запасом', () => expect(revealDelta({ top: 500, bottom: 548 }, view)).toBe(160));
  it('поле над видимой частью — вверх', () => expect(revealDelta({ top: -60, bottom: -12 }, view)).toBe(-72));
  it('высокое поле: верх виден — не крутим', () => expect(revealDelta({ top: 50, bottom: 1200 }, view)).toBe(0));
  it('высокое поле: верх ниже видимого — к верху поля', () => expect(revealDelta({ top: 600, bottom: 2000 }, view)).toBe(588));
  it('высокое поле: верх выше видимого — к верху поля', () => expect(revealDelta({ top: -300, bottom: 900 }, view)).toBe(-312));
  it('свой запас', () => expect(revealDelta({ top: 390, bottom: 410 }, view, 0)).toBe(10));
});

describe('isTypingField', () => {
  it('поля ввода и textarea — да, флажки и кнопки — нет', () => {
    const make = (html: string) => {
      document.body.innerHTML = html;
      return document.body.firstElementChild;
    };
    expect(isTypingField(make('<input type="text">'))).toBe(true);
    expect(isTypingField(make('<input>'))).toBe(true);
    expect(isTypingField(make('<input type="number">'))).toBe(true);
    expect(isTypingField(make('<textarea></textarea>'))).toBe(true);
    expect(isTypingField(make('<input type="checkbox">'))).toBe(false);
    expect(isTypingField(make('<input type="range">'))).toBe(false);
    expect(isTypingField(make('<button>a</button>'))).toBe(false);
    expect(isTypingField(null)).toBe(false);
    const ce = make('<div contenteditable="true">x</div>') as HTMLElement;
    Object.defineProperty(ce, 'isContentEditable', { value: true });
    expect(isTypingField(ce)).toBe(true);
  });
});

describe('initViewport — CSS-переменные и html[data-kb]', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-kb');
  });

  function fakeVV(height: number) {
    const vv = Object.assign(new EventTarget(), { height, offsetTop: 0, width: 360 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    return vv;
  }

  it('без клавиатуры: --kb 0, data-kb нет; с клавиатурой: --kb и data-kb', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0; // синхронно: apply() уже сбросил raf
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const vv = fakeVV(800);
    const stop = initViewport();
    const st = document.documentElement.style;
    expect(st.getPropertyValue('--vvh')).toBe('800px');
    expect(st.getPropertyValue('--kb')).toBe('0px');
    expect(document.documentElement.hasAttribute('data-kb')).toBe(false);
    vv.height = 800 - (KB_MIN + 200);
    vv.dispatchEvent(new Event('resize'));
    expect(st.getPropertyValue('--kb')).toBe(`${KB_MIN + 200}px`);
    expect(document.documentElement.hasAttribute('data-kb')).toBe(true);
    // Адресная строка браузера (меньше KB_MIN) — не клавиатура.
    vv.height = 800 - 60;
    vv.dispatchEvent(new Event('resize'));
    expect(st.getPropertyValue('--kb')).toBe('0px');
    expect(document.documentElement.hasAttribute('data-kb')).toBe(false);
    stop();
  });

  it('клавиатура открылась — поле в фокусе прокручивается на виду', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0; // синхронно: apply() уже сбросил raf
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const vv = fakeVV(800);
    document.body.innerHTML = '<div id="box" style="overflow-y:auto"><input id="f"></div>';
    const box = document.getElementById('box')!;
    Object.defineProperty(box, 'scrollHeight', { value: 2000 });
    Object.defineProperty(box, 'clientHeight', { value: 800 });
    const scrollBy = vi.fn();
    box.scrollBy = scrollBy as unknown as typeof box.scrollBy;
    const f = document.getElementById('f') as HTMLInputElement;
    f.getBoundingClientRect = () => ({ top: 700, bottom: 740, left: 0, right: 100, width: 100, height: 40, x: 0, y: 700, toJSON: () => ({}) });
    f.focus();
    const stop = initViewport();
    vv.height = 450;
    vv.dispatchEvent(new Event('resize'));
    expect(scrollBy).toHaveBeenCalledWith({ top: 740 - (450 - 12) });
    stop();
  });

  it('окно само уменьшилось (Android adjustResize), поле в фокусе — data-kb; ушли из поля — нет', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const vv = fakeVV(800);
    document.body.innerHTML = '<input id="f"><button id="b">x</button>';
    const stop = initViewport();
    (document.getElementById('f') as HTMLInputElement).focus();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 460 });
    vv.height = 460;
    window.dispatchEvent(new Event('resize'));
    expect(document.documentElement.hasAttribute('data-kb')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--kb')).toBe('0px'); // окно уже над клавиатурой
    (document.getElementById('b') as HTMLButtonElement).focus();
    document.dispatchEvent(new FocusEvent('focusout'));
    expect(document.documentElement.hasAttribute('data-kb')).toBe(false);
    // Поворот экрана: новая ширина — новая «обычная» высота, без ложной клавиатуры.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 360 });
    window.dispatchEvent(new Event('resize'));
    expect(document.documentElement.hasAttribute('data-kb')).toBe(false);
    stop();
  });

  it('revealFocused ничего не делает без поля в фокусе', () => {
    document.body.innerHTML = '<button id="b">x</button>';
    (document.getElementById('b') as HTMLButtonElement).focus();
    const spy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    revealFocused({ height: 300, offsetTop: 0 });
    expect(spy).not.toHaveBeenCalled();
  });
});
