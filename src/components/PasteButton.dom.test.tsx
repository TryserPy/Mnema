// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasteButton } from './PasteButton';
import { onToast } from './ui';

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

function Host({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <PasteButton value={v} onChange={setV} target={ref} />
      <textarea ref={ref} aria-label="поле" value={v} onChange={(e) => setV(e.target.value)} />
    </>
  );
}

describe('PasteButton', () => {
  it('без доступа к буферу кнопки нет', () => {
    render(<Host />);
    expect(screen.queryByRole('button', { name: /Вставить/ })).toBeNull();
  });

  it('один тап вставляет текст на место курсора', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => 'собака' } });
    render(<Host initial="кот и пёс" />);
    const ta = screen.getByLabelText('поле') as HTMLTextAreaElement;
    ta.setSelectionRange(6, 9);
    fireEvent.click(screen.getByRole('button', { name: /Вставить/ }));
    await waitFor(() => expect(ta.value).toBe('кот и собака'));
  });

  it('пустой буфер — понятное сообщение, текст не меняется', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => '' } });
    const seen: string[] = [];
    const off = onToast((t) => seen.push(t));
    render(<Host initial="a" />);
    fireEvent.click(screen.getByRole('button', { name: /Вставить/ }));
    await waitFor(() => expect(seen[0]).toMatch(/нет текста/));
    expect((screen.getByLabelText('поле') as HTMLTextAreaElement).value).toBe('a');
    off?.();
  });

  it('двойной тап вставляет один раз', async () => {
    const readText = vi.fn(() => new Promise<string>((r) => setTimeout(() => r('x'), 10)));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Host />);
    const b = screen.getByRole('button', { name: /Вставить/ });
    fireEvent.click(b);
    fireEvent.click(b);
    await waitFor(() => expect((screen.getByLabelText('поле') as HTMLTextAreaElement).value).toBe('x'));
    expect(readText).toHaveBeenCalledTimes(1);
  });
});
