// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pager } from './Pager';

afterEach(cleanup);

function Host({ total = 12, numbers, start = 0, onIndex }: { total?: number; numbers?: number[]; start?: number; onIndex?: (i: number) => void }) {
  const [i, setI] = useState(start);
  return (
    <>
      <Pager
        index={i}
        total={total}
        numbers={numbers}
        onIndex={(n) => {
          onIndex?.(n);
          setI(n);
        }}
      />
      <button onClick={() => setI(0)}>сброс</button>
      <output data-testid="at">{i}</output>
    </>
  );
}

const field = () => screen.getByRole('textbox') as HTMLInputElement;
const at = () => Number(screen.getByTestId('at').textContent);

describe('Pager', () => {
  it('цифровая клавиатура, «Перейти», подпись для чтения с экрана', () => {
    render(<Host />);
    const f = field();
    expect(f.value).toBe('1');
    expect(f.getAttribute('inputmode')).toBe('numeric');
    expect(f.getAttribute('enterkeyhint')).toBe('go');
    expect(f.getAttribute('aria-label')).toBe('Номер страницы, всего 12');
    expect(screen.getByText('из 12')).toBeTruthy();
  });

  it('Enter переходит, Esc отменяет, blur применяет', () => {
    const onIndex = vi.fn();
    render(<Host onIndex={onIndex} />);
    const f = field();
    fireEvent.focus(f);
    fireEvent.change(f, { target: { value: '7' } });
    fireEvent.keyDown(f, { key: 'Enter' });
    expect(at()).toBe(6);
    fireEvent.change(f, { target: { value: '3' } });
    fireEvent.keyDown(f, { key: 'Escape' });
    expect(f.value).toBe('7');
    expect(at()).toBe(6);
    fireEvent.change(f, { target: { value: '2' } });
    fireEvent.blur(f);
    expect(at()).toBe(1);
    expect(onIndex).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['99', 11],
    ['0', 0],
    ['-2', 0],
    ['2.5', 4],
    ['', 4],
    ['xyz', 4]
  ])('ввод «%s» → индекс %i (было 4)', (raw, want) => {
    render(<Host start={4} />);
    const f = field();
    fireEvent.focus(f);
    fireEvent.change(f, { target: { value: raw } });
    fireEvent.keyDown(f, { key: 'Enter' });
    expect(at()).toBe(want);
    expect(f.value).toBe(String(want + 1));
  });

  it('тот же номер — onIndex не вызывается', () => {
    const onIndex = vi.fn();
    render(<Host onIndex={onIndex} start={2} />);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onIndex).not.toHaveBeenCalled();
  });

  it('кнопки: границы и синхронизация поля', () => {
    render(<Host total={3} />);
    const prev = screen.getByRole('button', { name: 'Предыдущая страница' }) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: 'Следующая страница' }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(field().value).toBe('3');
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByText('сброс'));
    expect(field().value).toBe('1');
  });

  it('пока ученик набирает номер, смена страницы снаружи не стирает набранное', () => {
    render(<Host start={4} />);
    const f = field();
    fireEvent.focus(f);
    fireEvent.change(f, { target: { value: '9' } });
    fireEvent.click(screen.getByText('сброс'));
    expect(f.value).toBe('9');
  });

  it('настоящие номера страниц учебника', () => {
    render(<Host total={4} numbers={[45, 46, 48, 52]} />);
    const f = field();
    expect(f.value).toBe('45');
    expect(f.getAttribute('aria-label')).toBe('Номер страницы, от 45 до 52');
    expect(screen.getByText('· 1 из 4')).toBeTruthy();
    fireEvent.change(f, { target: { value: '50' } });
    fireEvent.keyDown(f, { key: 'Enter' });
    expect(at()).toBe(2);
    expect(f.value).toBe('48');
  });
});
