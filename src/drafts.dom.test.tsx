// @vitest-environment jsdom
// Черновики (сохранение данных): useDraft пишет через паузу, сразу при сворачивании, уходе со страницы и закрытии окна;
// пустое стирает; после «Сохранено»/«Отмена» не пишет, пока не начнут вводить снова; ломаное хранилище не роняет приложение.
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, hasDraft, loadDraft, saveDraft, useDraft, useHasDraft } from './drafts';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type V = { front: string };
const empty = (v: V) => !v.front.trim();

describe('useDraft — автосохранение', () => {
  it('первое значение не пишется; изменение — через паузу', () => {
    const { rerender } = renderHook(({ v }) => useDraft<V>('new:t1', v, empty, 400), { initialProps: { v: { front: '' } } });
    expect(hasDraft('new:t1')).toBe(false);
    rerender({ v: { front: 'Что такое ромб?' } });
    vi.advanceTimersByTime(399);
    expect(hasDraft('new:t1')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(loadDraft<V>('new:t1')!.value.front).toBe('Что такое ромб?');
  });

  it('быстрый набор — одна запись в конце', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const { rerender } = renderHook(({ v }) => useDraft<V>('k', v, empty, 400), { initialProps: { v: { front: '' } } });
    for (const s of ['Р', 'Ро', 'Ром', 'Ромб']) {
      rerender({ v: { front: s } });
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(400);
    expect(set.mock.calls.filter(([k]) => String(k).startsWith('refrain-draft:')).length).toBe(1);
    expect(loadDraft<V>('k')!.value.front).toBe('Ромб');
  });

  it('свернули приложение — пишется сразу', () => {
    const { rerender } = renderHook(({ v }) => useDraft<V>('k', v, empty, 400), { initialProps: { v: { front: '' } } });
    rerender({ v: { front: 'Свернул' } });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(loadDraft<V>('k')!.value.front).toBe('Свернул');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  it('уход со страницы (pagehide) и закрытие окна (размонтирование) — пишется сразу', () => {
    const a = renderHook(({ v }) => useDraft<V>('a', v, empty), { initialProps: { v: { front: '' } } });
    a.rerender({ v: { front: 'Ушёл' } });
    window.dispatchEvent(new Event('pagehide'));
    expect(loadDraft<V>('a')!.value.front).toBe('Ушёл');
    const b = renderHook(({ v }) => useDraft<V>('b', v, empty), { initialProps: { v: { front: '' } } });
    b.rerender({ v: { front: 'Закрыл окно' } });
    b.unmount();
    expect(loadDraft<V>('b')!.value.front).toBe('Закрыл окно');
  });

  it('стёр всё — черновик стирается', () => {
    saveDraft('k', { front: 'было' });
    const { rerender } = renderHook(({ v }) => useDraft<V>('k', v, empty), { initialProps: { v: { front: 'было' } } });
    rerender({ v: { front: '  ' } });
    vi.advanceTimersByTime(500);
    expect(hasDraft('k')).toBe(false);
  });

  it('после discard не пишет, пока не начнут вводить снова', () => {
    const { result, rerender, unmount } = renderHook(({ v }) => useDraft<V>('k', v, empty), { initialProps: { v: { front: '' } } });
    rerender({ v: { front: 'Готово' } });
    act(() => result.current.discard());
    expect(hasDraft('k')).toBe(false);
    rerender({ v: { front: '' } }); // окно очистило поля после «Добавить»
    vi.advanceTimersByTime(500);
    expect(hasDraft('k')).toBe(false);
    rerender({ v: { front: 'Следующая' } });
    vi.advanceTimersByTime(500);
    expect(loadDraft<V>('k')!.value.front).toBe('Следующая');
    unmount();
  });

  it('key = null — ничего не пишется', () => {
    const { rerender, unmount } = renderHook(({ v }) => useDraft<V>(null, v, empty), { initialProps: { v: { front: '' } } });
    rerender({ v: { front: 'x' } });
    vi.advanceTimersByTime(500);
    unmount();
    expect(localStorage.length).toBe(0);
  });
});

describe('useHasDraft — пометка «черновик»', () => {
  it('появляется и пропадает сразу', () => {
    function Probe() {
      return <span data-testid="p">{useHasDraft('card:c1') ? 'да' : 'нет'}</span>;
    }
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('p').textContent).toBe('нет');
    act(() => void saveDraft('card:c1', { front: 'x' }));
    expect(getByTestId('p').textContent).toBe('да');
    act(() => clearDraft('card:c1'));
    expect(getByTestId('p').textContent).toBe('нет');
  });
});

describe('устойчивость хранилища', () => {
  it('битый JSON — нет черновика, без исключения', () => {
    localStorage.setItem('refrain-draft:x', '{не json');
    expect(loadDraft('x')).toBeNull();
  });
  it('запись без даты — забывается', () => {
    localStorage.setItem('refrain-draft:x', JSON.stringify({ v: 1 }));
    expect(loadDraft('x')).toBeNull();
    expect(localStorage.getItem('refrain-draft:x')).toBeNull();
  });
  it('слишком большой черновик (картинка) — не сохраняется', () => {
    expect(saveDraft('big', { img: 'x'.repeat(400_001) })).toBe(false);
    expect(hasDraft('big')).toBe(false);
  });
  it('битые соседние черновики уходят первыми при переполнении', () => {
    localStorage.setItem('refrain-draft:broken', 'oops');
    for (let i = 0; i < 40; i++) saveDraft('d' + i, { i }, Date.now() + i);
    expect(localStorage.getItem('refrain-draft:broken')).toBeNull();
  });
  it('clearDraft без черновика и при сломанном хранилище — без исключения', () => {
    expect(() => clearDraft('нет')).not.toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => clearDraft('x')).not.toThrow();
    expect(loadDraft('x')).toBeNull();
  });
});
