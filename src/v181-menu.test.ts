import { describe, expect, it } from 'vitest';
import { placeMenu, type Box } from './menuPlace';

const box = (left: number, top: number, w: number, h: number): Box => ({ left, top, right: left + w, bottom: top + h });
const win = (w: number, h: number): Box => box(0, 0, w, h);

describe('2.0: размещение меню (баг 1 — «Ещё» выходило за экран)', () => {
  it('помещается — ничего не меняем', () => {
    const f = placeMenu({ rect: box(100, 60, 220, 200), anchor: box(100, 30, 120, 28), bounds: win(1280, 800) });
    expect(f).toEqual({ side: 'keep', dx: 0, dy: 0, flipUp: false, maxHeight: null, maxWidth: null });
  });

  it('компьютер: «Ещё» в конце ряда, меню растёт вправо за окно → прижать правым краем к кнопке (а не оторвать сдвигом)', () => {
    // кнопка 1090…1180 при окне 1280, меню шириной 300 слева от кнопки: left 1090 → right 1390
    const f = placeMenu({ rect: box(1090, 60, 300, 240), anchor: box(1090, 30, 90, 28), bounds: win(1280, 800) });
    expect(f.side).toBe('right');
    expect(f.dx).toBe(0);
  });

  it('телефон: меню шире, чем место слева и справа от кнопки → сдвиг в границы окна, но не выходит ни за один край', () => {
    // кнопка 115…220 при окне 390, меню 300 (замерено QA: левый край −79 / правый 415)
    const f = placeMenu({ rect: box(220 - 300, 60, 300, 240), anchor: box(115, 30, 105, 28), bounds: win(390, 844) });
    expect(f.side).toBe('keep');
    expect(f.dx).toBe(88); // левый край −80 → 8
  });

  it('меню шире окна — ограничиваем ширину', () => {
    const f = placeMenu({ rect: box(0, 60, 500, 100), anchor: box(0, 30, 80, 28), bounds: win(360, 640) });
    expect(f.maxWidth).toBe(344);
  });

  it('низкое окно (телефон лёжа 640×360): раньше меню в нижних 120 px не ограничивалось вообще', () => {
    // «+»: меню начинается на y=300 при высоте окна 360 → места внизу 52 px, сверху больше
    const f = placeMenu({ rect: box(20, 300, 240, 380), anchor: box(20, 270, 40, 28), bounds: win(640, 360) });
    expect(f.flipUp).toBe(true);
    expect(f.maxHeight).not.toBeNull();
    expect(f.maxHeight!).toBeLessThanOrEqual(270 - 6 - 8); // не выше свободного места над кнопкой
  });

  it('внизу тесно, а сверху хватает — открываем вверх без ограничения высоты', () => {
    const f = placeMenu({ rect: box(20, 700, 240, 220), anchor: box(20, 670, 40, 28), bounds: win(1280, 800) });
    expect(f.flipUp).toBe(true);
    expect(f.maxHeight).toBeNull();
  });

  it('не помещается ни вниз, ни вверх — берём сторону побольше и включаем прокрутку', () => {
    const down = placeMenu({ rect: box(20, 100, 240, 900), anchor: box(20, 70, 40, 28), bounds: win(1280, 800) });
    expect(down.flipUp).toBe(false); // сверху всего 56 px, снизу больше
    expect(down.maxHeight).toBe(800 - 8 - 100);
    const up = placeMenu({ rect: box(20, 600, 240, 900), anchor: box(20, 570, 40, 28), bounds: win(1280, 800) });
    expect(up.flipUp).toBe(true); // сверху 556 px, снизу 192
    expect(up.maxHeight).toBe(570 - 6 - 8);
  });

  it('меню в точке (контекстное, без кнопки): поднимаем, чтобы вошло', () => {
    const f = placeMenu({ rect: box(500, 700, 240, 200), anchor: null, bounds: win(1280, 800) });
    expect(f.dy).toBe(800 - 8 - 900);
    expect(f.flipUp).toBe(false);
  });

  it('границы со своим левым краем (меню внутри .main справа от боковой панели)', () => {
    // .main начинается на x=262: меню не должно залезть под панель
    const f = placeMenu({ rect: box(250, 60, 200, 100), anchor: box(250, 30, 40, 28), bounds: { left: 262, top: 0, right: 1270, bottom: 800 } });
    // ни левая привязка (250 < 270), ни правая (290−200 = 90 < 270) не подходят → сдвиг до границы с полем 8: 270 − 250
    expect(f.side).toBe('keep');
    expect(f.dx).toBe(20);
  });
});
