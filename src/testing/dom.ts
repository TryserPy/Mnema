// Общее для компонентных тестов (jsdom): matchMedia, которого в jsdom нет, и «ширина экрана».
import { vi } from 'vitest';

/** Подменить matchMedia: phone — узкий экран (меню становится шторкой), coarse — палец. */
export function setScreen({ phone = false, coarse = false }: { phone?: boolean; coarse?: boolean } = {}) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: (phone && /max-width:\s*(720|719)px/.test(q)) || (coarse && /pointer:\s*coarse/.test(q) && !/max-height/.test(q)),
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof window.matchMedia;
}
