// Куда поставить всплывающее меню, чтобы оно целиком оказалось на экране.
// Чистая функция: на входе прямоугольники (px), на выходе — что поменять. Браузера не нужно, поэтому её можно проверять тестами.
// Раньше положение меню решали три слоя, которые спорили друг с другом: CSS разной «силы» в двух файлах, JS-сдвиг только по горизонтали
// и условие «верх меню в нижних 120 px» (при низком окне меню не ограничивалось вообще).

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MenuFix {
  /** К какому краю кнопки прижать: 'left' — левый край меню у левого края кнопки, 'right' — правый к правому, 'keep' — как в CSS. */
  side: 'keep' | 'left' | 'right';
  /** Сдвиг по горизонтали, если ни одна привязка к кнопке не помещается (меню шире свободного места). */
  dx: number;
  /** Сдвиг по вертикали — только для меню без кнопки-опоры (например, контекстное меню в точке нажатия). */
  dy: number;
  /** Открыть вверх от кнопки (внизу места не хватает, а сверху хватает или больше). */
  flipUp: boolean;
  /** Ограничить высоту и включить прокрутку, если не помещается ни вниз, ни вверх. */
  maxHeight: number | null;
  /** Ограничить ширину, если меню шире окна. */
  maxWidth: number | null;
}

export interface PlaceInput {
  /** Меню сейчас (без учёта анимации «вырастания»). */
  rect: Box;
  /** Кнопка или обёртка, к которой привязано меню; null — меню стоит в точке (fixed). */
  anchor: Box | null;
  /** Видимая область, в которой меню обязано поместиться. */
  bounds: Box;
  margin?: number;
  gap?: number;
}

const MIN_H = 120;

export function placeMenu({ rect, anchor, bounds, margin = 8, gap = 6 }: PlaceInput): MenuFix {
  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
  const free = bounds.right - bounds.left - margin * 2;
  const out: MenuFix = { side: 'keep', dx: 0, dy: 0, flipUp: false, maxHeight: null, maxWidth: null };

  // ---- по горизонтали ----
  if (w > free) out.maxWidth = free;
  const wEff = Math.min(w, free);
  const fits = (left: number) => left >= bounds.left + margin - 0.5 && left + wEff <= bounds.right - margin + 0.5;
  if (!fits(rect.left)) {
    if (anchor && fits(anchor.left)) out.side = 'left';
    else if (anchor && fits(anchor.right - wEff)) out.side = 'right';
    else {
      // Ни один край кнопки не подходит — прижимаем к границе окна (меню остаётся рядом, просто сдвинуто).
      const left = Math.min(Math.max(rect.left, bounds.left + margin), bounds.right - margin - wEff);
      out.dx = Math.round(left - rect.left);
    }
  }

  // ---- по вертикали ----
  const below = bounds.bottom - margin - rect.top; // сколько места от верха меню до низа области
  if (h > below) {
    if (anchor) {
      const above = anchor.top - gap - (bounds.top + margin);
      if (h <= above) out.flipUp = true;
      else if (above > below) {
        out.flipUp = true;
        out.maxHeight = Math.max(MIN_H, Math.floor(above));
      } else out.maxHeight = Math.max(MIN_H, Math.floor(below));
    } else {
      // Меню в точке: сначала поднимаем, сколько можно, потом ограничиваем высоту.
      const room = bounds.bottom - bounds.top - margin * 2;
      if (h <= room) out.dy = Math.round(bounds.bottom - margin - rect.bottom);
      else {
        out.dy = Math.round(bounds.top + margin - rect.top);
        out.maxHeight = Math.max(MIN_H, Math.floor(room));
      }
    }
  }
  return out;
}
