// 1.23.0: озвучку можно остановить — на компьютере (speechSynthesis) и на телефоне (мост speakStop).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeUtterance {
  lang = '';
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

let spoken: FakeUtterance[] = [];
let cancelled = 0;
let live = false;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  spoken = [];
  cancelled = 0;
  live = false;
  const synth = {
    getVoices: () => [],
    cancel: () => {
      cancelled++;
      live = false;
    },
    speak: (u: FakeUtterance) => {
      spoken.push(u);
      live = true;
    },
    get speaking() {
      return live;
    },
    pending: false
  };
  (globalThis as unknown as Record<string, unknown>).window = { speechSynthesis: synth, mnemaApi: undefined };
  (globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as Record<string, unknown>).window;
});

describe('озвучка', () => {
  it('«Остановить» сразу замолкает и сбрасывает признак', async () => {
    const { speak, stopSpeaking, isSpeaking } = await import('./speak');
    speak('Я помню чудное мгновенье', 'ru-RU');
    expect(isSpeaking()).toBe(true);
    stopSpeaking();
    expect(isSpeaking()).toBe(false);
    expect(cancelled).toBeGreaterThanOrEqual(2); // один раз перед началом, один — при остановке
  });
  it('закончил говорить сам — признак гаснет', async () => {
    const { speak, isSpeaking } = await import('./speak');
    speak('Привет', 'ru-RU');
    live = false;
    spoken[0].onend?.();
    vi.advanceTimersByTime(60);
    expect(isSpeaking()).toBe(false);
  });
  it('новая озвучка вместо старой не гасится концом старой', async () => {
    const { speak, isSpeaking } = await import('./speak');
    speak('Первая', 'ru-RU');
    speak('Вторая', 'ru-RU');
    // cancel() у первой вызывает её onend — но говорит уже вторая
    spoken[0].onend?.();
    vi.advanceTimersByTime(60);
    expect(isSpeaking()).toBe(true);
  });
  it('на телефоне: вызывает speakStop моста и не зависает', async () => {
    const calls: string[] = [];
    (globalThis as unknown as { window: Record<string, unknown> }).window.mnemaApi = { speak: (t: string) => calls.push('speak:' + t), speakStop: () => calls.push('stop') };
    const { speak, stopSpeaking, isSpeaking } = await import('./speak');
    speak('Стих', 'ru-RU');
    expect(isSpeaking()).toBe(true);
    stopSpeaking();
    expect(calls).toEqual(['speak:Стих', 'stop']);
    expect(isSpeaking()).toBe(false);
  });
  it('на телефоне: по длине текста признак сам гаснет', async () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window.mnemaApi = { speak: () => undefined, speakStop: () => undefined };
    const { speak, isSpeaking } = await import('./speak');
    speak('коротко', 'ru-RU');
    expect(isSpeaking()).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(isSpeaking()).toBe(false);
  });
});
