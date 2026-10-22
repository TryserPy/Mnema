// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setScreen } from './testing/dom';
import { applyZoom, clampZoom, getZoom, setZoom, stepZoom, viewportContent, zoomAfter, zoomKey, zoomLabel, zoomWay, ZOOM_MAX, ZOOM_MIN, ZOOM_STEPS } from './zoom';

const k = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; code: string }> = {}) => ({ key, ctrlKey: true, metaKey: false, altKey: false, ...o });

describe('шаги масштаба', () => {
  it('clampZoom держит 75–150% и не даёт NaN', () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(9)).toBe(ZOOM_MAX);
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(1);
    expect(clampZoom(1.234)).toBe(1.23);
  });
  it('stepZoom по шагам и с промежуточного значения', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(1.05, 1)).toBe(1.1);
    expect(stepZoom(1.05, -1)).toBe(1);
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
    // Все шаги проходятся по очереди.
    let z: number = ZOOM_MIN;
    const seen: number[] = [z];
    while (z < ZOOM_MAX) seen.push((z = stepZoom(z, 1)));
    expect(seen).toEqual([...ZOOM_STEPS]);
  });
  it('zoomAfter и подпись', () => {
    expect(zoomAfter(1.25, 'reset')).toBe(1);
    expect(zoomAfter(1, 'in')).toBe(1.1);
    expect(zoomAfter(1, 'out')).toBe(0.9);
    expect(zoomLabel(1.25)).toBe('125%');
  });
});

describe('zoomKey — Ctrl + / Ctrl − / Ctrl 0', () => {
  it.each([
    [k('='), 'in'],
    [k('+'), 'in'],
    [k('-'), 'out'],
    [k('_'), 'out'],
    [k('0'), 'reset'],
    [k('x', { code: 'NumpadAdd' }), 'in'],
    [k('x', { code: 'NumpadSubtract' }), 'out'],
    [k('x', { code: 'Numpad0' }), 'reset'],
    [k('=', { ctrlKey: false, metaKey: true }), 'in'],
    [k('=', { ctrlKey: false }), null],
    [k('=', { altKey: true }), null],
    [k('a'), null]
  ])('%o → %s', (e, want) => expect(zoomKey(e)).toBe(want));
});

describe('viewportContent', () => {
  it('100% — обычная ширина устройства', () => expect(viewportContent(1, 360)).toBe('width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content'));
  it('125% на 360 px — страница шириной 288 px', () => expect(viewportContent(1.25, 360)).toBe('width=288, initial-scale=1.25, viewport-fit=cover, interactive-widget=resizes-content'));
  it('75% — шире', () => expect(viewportContent(0.75, 360)).toContain('width=480, initial-scale=0.75'));
  it('ширина неизвестна — как при 100%', () => expect(viewportContent(1.25, 0)).toContain('width=device-width'));
  it('в мета нет запрета масштаба двумя пальцами', () => expect(viewportContent(1.1, 400)).not.toMatch(/user-scalable|maximum-scale/));
});

describe('как применяется', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">';
  });
  afterEach(() => {
    delete window.mnemaApi;
  });

  it('Windows/Linux: настоящий масштаб окна', () => {
    const setZ = vi.fn();
    window.mnemaApi = { setZoom: setZ } as unknown as typeof window.mnemaApi;
    expect(zoomWay()).toBe('app');
    applyZoom(1.25);
    expect(setZ).toHaveBeenCalledWith(1.25);
    expect(document.documentElement.dataset.zoom).toBe('125');
  });

  it('телефон: ширина в meta viewport', () => {
    setScreen({ phone: true, coarse: true });
    Object.defineProperty(window.screen, 'width', { configurable: true, value: 360 });
    Object.defineProperty(window.screen, 'height', { configurable: true, value: 800 });
    expect(zoomWay()).toBe('viewport');
    applyZoom(1.25);
    expect(document.querySelector('meta[name=viewport]')!.getAttribute('content')).toContain('width=288, initial-scale=1.25');
    applyZoom(1);
    expect(document.querySelector('meta[name=viewport]')!.getAttribute('content')).toContain('width=device-width');
  });

  it('Android всегда через meta viewport', () => {
    setScreen({ phone: false, coarse: false });
    window.mnemaApi = { platform: 'android' } as unknown as typeof window.mnemaApi;
    expect(zoomWay()).toBe('viewport');
  });

  it('компьютер в браузере — масштаб браузера, страница не трогает', () => {
    setScreen({ phone: false, coarse: false });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
    expect(zoomWay()).toBe('browser');
    applyZoom(1.5);
    expect(document.querySelector('meta[name=viewport]')!.getAttribute('content')).toBe('width=device-width, initial-scale=1');
  });

  it('setZoom помнит на устройстве и сообщает экранам', () => {
    const setZ = vi.fn();
    window.mnemaApi = { setZoom: setZ } as unknown as typeof window.mnemaApi;
    const seen: number[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent<number>).detail);
    window.addEventListener('refrain:zoom', on);
    expect(setZoom(7)).toBe(ZOOM_MAX);
    expect(getZoom()).toBe(ZOOM_MAX);
    setZoom(1);
    expect(getZoom()).toBe(1);
    expect(JSON.parse(localStorage.getItem('refrain-ui') ?? '{}').zoom).toBeUndefined(); // 100% не хранится
    expect(seen).toEqual([ZOOM_MAX, 1]);
    window.removeEventListener('refrain:zoom', on);
  });
});
