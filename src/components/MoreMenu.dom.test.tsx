// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setScreen } from '../testing/dom';
import { closeTopLayer, menuLayout, MoreMenu, type MenuItem } from './ui';

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const items = (spy = vi.fn()): MenuItem[] => [
  { section: 'Учить', label: 'Учить весь предмет', hint: '5 карточек на сегодня', onClick: spy },
  { section: 'Учить', label: 'Повторить ещё раз', hint: 'Без изменения расписания', onClick: spy },
  { section: 'Учить', label: 'Скрытый', onClick: spy, hidden: true },
  { section: 'Экспорт', label: 'Экспорт в Anki', onClick: spy },
  { section: 'Экспорт', label: 'Группа', items: [{ label: 'Первый', onClick: spy }, { label: 'Второй', onClick: spy }] },
  { label: 'Удалить предмет', danger: true, onClick: spy }
];

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Действия' }));

describe('menuLayout', () => {
  it('заголовок — при смене раздела, черта — перед опасным', () => {
    const out = menuLayout([
      { label: 'а', section: 'Учить' },
      { label: 'б', section: 'Учить' },
      { label: 'в', section: 'Экспорт' },
      { label: 'г' },
      { label: 'Удалить', danger: true }
    ]);
    expect(out.map((o) => o.head ?? '')).toEqual(['Учить', '', 'Экспорт', '', '']);
    expect(out.map((o) => o.sep)).toEqual([false, false, false, false, true]);
  });
  it('опасный пункт первым или после опасного — без черты', () => {
    expect(menuLayout([{ label: 'x', danger: true }])[0].sep).toBe(false);
    expect(menuLayout([{ label: 'x', danger: true }, { label: 'y', danger: true }])[1].sep).toBe(false);
  });
});

describe('MoreMenu на компьютере', () => {
  beforeEach(() => setScreen({ phone: false }));

  it('открывается у кнопки, с разделами и подсказками; скрытые пункты не видны', () => {
    render(<MoreMenu label="Действия" items={items()} />);
    expect(screen.queryByRole('menu')).toBeNull();
    open();
    const menu = screen.getByRole('menu', { name: 'Действия' });
    expect(menu.classList.contains('sheet')).toBe(false);
    expect(menu.closest('.more')).toBeTruthy(); // не в портале
    expect(within(menu).getAllByText(/Учить|Экспорт/, { selector: '.menu-section' }).map((e) => e.textContent)).toEqual(['Учить', 'Экспорт']);
    expect(within(menu).queryByText('Скрытый')).toBeNull();
    expect(within(menu).getByText('5 карточек на сегодня')).toBeTruthy();
    expect(menu.querySelector('.menu-sep')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Действия' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('нажатие на пункт — действие и закрытие', () => {
    const spy = vi.fn();
    render(<MoreMenu label="Действия" items={items(spy)} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Экспорт в Anki/ }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Действия' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('группа открывается внутри, «Назад» возвращает', () => {
    render(<MoreMenu label="Действия" items={items()} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Группа/ }));
    expect(screen.getByRole('menuitem', { name: 'Первый' })).toBeTruthy();
    expect(document.activeElement?.textContent).toContain('Группа'); // фокус на «Назад»
    fireEvent.click(screen.getByRole('menuitem', { name: /Группа/ }));
    expect(screen.getByRole('menuitem', { name: /Экспорт в Anki/ })).toBeTruthy();
  });

  it('Esc закрывает и не пускает Esc дальше (окно под меню остаётся)', () => {
    render(<MoreMenu label="Действия" items={items()} />);
    open();
    const ev = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: 'Действия' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('щелчок мимо закрывает, внутри — нет', () => {
    render(
      <div>
        <MoreMenu label="Действия" items={items()} />
        <p>мимо</p>
      </div>
    );
    open();
    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(screen.getByRole('button', { name: 'Действия' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.mouseDown(screen.getByText('мимо'));
    expect(screen.getByRole('button', { name: 'Действия' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('стрелки двигают фокус по пунктам', () => {
    render(<MoreMenu label="Действия" items={items()} />);
    open();
    const menu = screen.getByRole('menu');
    const list = within(menu).getAllByRole('menuitem');
    list[0].focus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(list[1]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(list[list.length - 1]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(list[0]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(list[list.length - 1]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(list[0]);
  });
});

describe('MoreMenu на телефоне — шторка', () => {
  beforeEach(() => setScreen({ phone: true, coarse: true }));

  it('в <body> поверх всего, с затемнением, ручкой и заголовком', () => {
    render(<MoreMenu label="Действия" items={items()} />);
    open();
    const menu = screen.getByRole('menu', { name: 'Действия' });
    expect(menu.classList.contains('sheet')).toBe(true);
    expect(menu.parentElement).toBe(document.body);
    expect(document.querySelector('.sheet-back')).toBeTruthy();
    expect(menu.querySelector('.sheet-grip')).toBeTruthy();
    expect(within(menu).getByText('Действия', { selector: '.sheet-title' })).toBeTruthy();
  });

  it('тап по затемнению закрывает, тап по шторке — нет', () => {
    render(<MoreMenu label="Действия" items={items()} />);
    open();
    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(screen.getByRole('button', { name: 'Действия' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(document.querySelector('.sheet-back')!);
    expect(screen.getByRole('button', { name: 'Действия' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('«Назад» закрывает шторку; когда закрывать нечего — false', () => {
    render(<MoreMenu label="Действия" items={items()} />);
    expect(closeTopLayer()).toBe(false);
    open();
    let handled = false;
    act(() => {
      handled = closeTopLayer();
    });
    expect(handled).toBe(true);
    expect(screen.getByRole('button', { name: 'Действия' }).getAttribute('aria-expanded')).toBe('false');
    expect(closeTopLayer()).toBe(false);
  });

  it('свайп вниз за ручку закрывает, короткий — нет', () => {
    render(<MoreMenu label="Действия" items={items()} />);
    open();
    const head = document.querySelector('.sheet-head')!;
    fireEvent.pointerDown(head, { pointerType: 'touch', clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(head, { pointerType: 'touch', clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(head, { pointerType: 'touch', clientY: 110, pointerId: 1 });
    expect(screen.getByRole('button', { name: 'Действия' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.pointerDown(head, { pointerType: 'touch', clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(head, { pointerType: 'touch', clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(head, { pointerType: 'touch', clientY: 300, pointerId: 1 });
    expect(screen.getByRole('button', { name: 'Действия' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('мышью не тянется', () => {
    render(<MoreMenu label="Действия" items={items()} />);
    open();
    const head = document.querySelector('.sheet-head')!;
    fireEvent.pointerDown(head, { pointerType: 'mouse', clientY: 100 });
    fireEvent.pointerMove(head, { pointerType: 'mouse', clientY: 400 });
    fireEvent.pointerUp(head, { pointerType: 'mouse', clientY: 400 });
    expect(screen.getByRole('button', { name: 'Действия' }).getAttribute('aria-expanded')).toBe('true');
  });
});
