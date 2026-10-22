// @vitest-environment jsdom
// Компоненты понятности: подсказка экрана, начало конспекта, масштаб в настройках.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTips, SCREEN_TIPS, tipSeen } from '../screenTips';
import { setScreen } from '../testing/dom';
import { NoteStart } from './NoteStart';
import { ScreenTip } from './ScreenTip';
import { onToast } from './ui';
import { ZoomControl } from './ZoomControl';

beforeEach(() => {
  localStorage.clear();
  resetTips();
});
afterEach(() => {
  cleanup();
  delete window.mnemaApi;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

describe('ScreenTip', () => {
  it('показывается один раз, «Понятно» — и больше нет; resetTips возвращает', () => {
    const { unmount } = render(<ScreenTip id="subject" />);
    expect(screen.getByRole('complementary', { name: `Подсказка: ${SCREEN_TIPS.subject.title}` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(tipSeen('subject')).toBe(true);
    unmount();
    render(<ScreenTip id="subject" />);
    expect(screen.queryByRole('complementary')).toBeNull();
    cleanup();
    resetTips();
    render(<ScreenTip id="subject" />);
    expect(screen.getByRole('complementary')).toBeTruthy();
  });
  it('у каждого экрана — короткий текст (одна-две строки)', () => {
    for (const t of Object.values(SCREEN_TIPS)) {
      expect(t.title.length).toBeLessThan(40);
      expect(t.text.length).toBeLessThan(200);
    }
  });
  it('отмеченная подсказка не дублируется в памяти', () => {
    render(<ScreenTip id="today" />);
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    render(<ScreenTip id="knowledge" />);
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(JSON.parse(localStorage.getItem('refrain-ui')!)['tips-seen']).toEqual(['today', 'knowledge']);
  });
});

describe('NoteStart', () => {
  it('шаблон «По теме» — с названием темы', () => {
    const onStart = vi.fn();
    render(<NoteStart topicName="Фотосинтез" onStart={onStart} onTextbook={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Шаблон «По теме»/ }));
    expect(onStart.mock.calls[0][0]).toMatch(/^# Фотосинтез\n/);
    fireEvent.click(screen.getByRole('button', { name: /Шаблон «По главе»/ }));
    expect(onStart.mock.calls[1][0]).toContain('## План');
  });
  it('«Из учебника» открывает фото страниц', () => {
    const onTextbook = vi.fn();
    render(<NoteStart topicName="x" onStart={vi.fn()} onTextbook={onTextbook} />);
    fireEvent.click(screen.getByRole('button', { name: /Из учебника/ }));
    expect(onTextbook).toHaveBeenCalled();
  });
  it('без доступа к буферу — кнопки «Вставить» нет', () => {
    render(<NoteStart topicName="x" onStart={vi.fn()} onTextbook={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Вставить из буфера/ })).toBeNull();
  });
  it('«Вставить из буфера»: текст чистится и уходит в конспект, тост', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => 'Строка  \r\n\r\n\r\nещё' } });
    const onStart = vi.fn();
    const seen: string[] = [];
    const off = onToast((t) => seen.push(t));
    render(<NoteStart topicName="x" onStart={onStart} onTextbook={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Вставить из буфера/ }));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith('Строка\n\nещё'));
    expect(seen[0]).toMatch(/вставлен/);
    off();
  });
  it('пустой буфер — сообщение, конспект не трогается', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => '' } });
    const onStart = vi.fn();
    const seen: string[] = [];
    const off = onToast((t) => seen.push(t));
    render(<NoteStart topicName="x" onStart={onStart} onTextbook={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Вставить из буфера/ }));
    await waitFor(() => expect(seen[0]).toMatch(/нет текста/));
    expect(onStart).not.toHaveBeenCalled();
    off();
  });
});

describe('ZoomControl', () => {
  it('на компьютере в браузере — подсказка про масштаб браузера', () => {
    setScreen({ phone: false, coarse: false });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
    render(<ZoomControl />);
    expect(screen.getByText(/масштаб меняет сам браузер/)).toBeTruthy();
  });
  it('в приложении: − и + по шагам, «Как было», границы', () => {
    const setZoom = vi.fn();
    window.mnemaApi = { setZoom } as unknown as typeof window.mnemaApi;
    setScreen({ phone: false, coarse: false });
    render(<ZoomControl />);
    const out = () => screen.getByRole('group', { name: 'Масштаб интерфейса' }).querySelector('output')!.textContent;
    expect(out()).toBe('100%');
    expect(screen.queryByRole('button', { name: 'Как было' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Крупнее' }));
    expect(out()).toBe('110%');
    expect(setZoom).toHaveBeenLastCalledWith(1.1);
    fireEvent.click(screen.getByRole('button', { name: 'Как было' }));
    expect(out()).toBe('100%');
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole('button', { name: 'Мельче' }));
    expect(out()).toBe('75%');
    expect((screen.getByRole('button', { name: 'Мельче' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Ctrl + / Ctrl −')).toBeTruthy();
  });
  it('масштаб поменяли клавишами — значение в настройках обновилось', () => {
    window.mnemaApi = { setZoom: vi.fn() } as unknown as typeof window.mnemaApi;
    setScreen({ phone: false, coarse: false });
    render(<ZoomControl />);
    act(() => void window.dispatchEvent(new CustomEvent('refrain:zoom', { detail: 1.25 })));
    expect(screen.getByRole('group').querySelector('output')!.textContent).toBe('125%');
  });
});

describe('screenTips', () => {
  it('повторная отметка не меняет память', async () => {
    const { markTipSeen } = await import('../screenTips');
    markTipSeen('topic');
    const once = localStorage.getItem('refrain-ui');
    markTipSeen('topic');
    expect(localStorage.getItem('refrain-ui')).toBe(once);
  });
});
