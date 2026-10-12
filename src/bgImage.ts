// Свой фон картинкой: проверка данных, перенос из 1.29 ({ src, fade }) и значения для CSS. Чистые функции — их проверяют тесты (v130-styles.test.ts).
//
// Как это нарисовано (design.css → bgimage.css):
//   1. под всем окном лежит сама картинка (body::before: положение, размер, размытие, цвет поверх);
//   2. сверху — цвет темы с прозрачностью (1 − видимость): так «видимость» честно идёт от 0 до 100 %;
//   3. боковая панель и шапка на телефоне — свои плашки с прозрачностью, поэтому картинка видна и под ними.
//
// ПОЧЕМУ раньше картинка «не налезала» на боковую панель: у .sidebar и шапки был непрозрачный фон (var(--side)), а потом — почти непрозрачный
// (цвет темы на 82–100 %). Теперь это настройка: «Под боковой панелью» и «Прозрачность панели».
import type { BgImage } from './types';

/** Картинка только внутри данных — без кавычек и скобок, чтобы не сломать CSS и не грузить ничего из сети. */
export const BG_SRC = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
/** Сколько знаков принимаем для картинки в настройках (≈3 МБ файла). */
export const MAX_BG_SRC = 4_000_000;
/** Картинка внутри файла стиля — меньше: файлом делятся. */
export const MAX_BG_SRC_FILE = 1_500_000;

/** Как в 1.29: цвет темы закрывал картинку не меньше чем на 72 % и не больше чем на 95 %. */
const OLD_MIN_FADE = 0.72;
const OLD_MAX_FADE = 0.95;
const OLD_DEFAULT_FADE = 0.78;

const num = (v: unknown, min: number, max: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
const r2 = (n: number) => Math.round(n * 100) / 100;

export const BG_SIZES: { id: BgImage['size']; name: string; hint: string }[] = [
  { id: 'cover', name: 'Заполнить', hint: 'Картинка закрывает всё окно, лишнее обрезается' },
  { id: 'contain', name: 'Вписать', hint: 'Картинка видна целиком, по краям может остаться цвет темы' },
  { id: 'zoom', name: 'Масштаб', hint: 'Ширина картинки — столько процентов от ширины окна' },
  { id: 'tile', name: 'Плиткой', hint: 'Картинка повторяется, как обои' }
];

/** Расположение «по сторонам»: быстрые кнопки вместо перетаскивания точки. */
export const BG_PLACES: { name: string; x: number; y: number }[] = [
  { name: 'По центру', x: 50, y: 50 },
  { name: 'Сверху', x: 50, y: 0 },
  { name: 'Снизу', x: 50, y: 100 },
  { name: 'Слева', x: 0, y: 50 },
  { name: 'Справа', x: 100, y: 50 }
];

/** Свежие настройки фона вокруг картинки. Для новой картинки панель и шапка уже «под фоном». */
export function newBg(src: string): BgImage {
  return { v: 2, src, fade: 0.55, x: 50, y: 50, size: 'cover', zoom: 100, opacity: 0.45, blur: 6, dim: 0, tint: '#000000', fixed: true, underSide: true, sideAlpha: 0.7, underBar: true, barAlpha: 0.78 };
}

/**
 * Привести что угодно к настройкам фона. null — картинки нет или она ненастоящая.
 * Старый вид { src, fade } (1.29) переносится так, чтобы окно выглядело точно так же:
 *   видимость = 1 − fade (честная шкала вместо прежних 5–28 %), размытие 10 px, по центру, неподвижно,
 *   панель закрывает картинку на fade + 10 % (как было), шапка на телефоне — без просвета.
 */
export function cleanBg(raw: unknown, maxSrc = MAX_BG_SRC): BgImage | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;
  const src = r.src;
  if (typeof src !== 'string' || src.length >= maxSrc || !BG_SRC.test(src)) return null;
  if (r.v !== 2) {
    const fade = num(r.fade, OLD_MIN_FADE, OLD_MAX_FADE, OLD_DEFAULT_FADE);
    return { ...newBg(src), fade, opacity: r2(1 - fade), blur: 10, underBar: false, barAlpha: 1, sideAlpha: r2(Math.min(1, fade + 0.1)) };
  }
  const opacity = r2(num(r.opacity, 0, 1, 0.45));
  const size = (['cover', 'contain', 'zoom', 'tile'] as const).includes(r.size as never) ? (r.size as BgImage['size']) : 'cover';
  const tint = typeof r.tint === 'string' && /^#[0-9a-f]{6}$/i.test(r.tint) ? r.tint : '#000000';
  return {
    v: 2,
    src,
    fade: r2(Math.min(OLD_MAX_FADE, Math.max(0, 1 - opacity))),
    x: Math.round(num(r.x, 0, 100, 50)),
    y: Math.round(num(r.y, 0, 100, 50)),
    size,
    zoom: Math.round(num(r.zoom, 10, 400, 100)),
    opacity,
    blur: Math.round(num(r.blur, 0, 40, 6)),
    dim: r2(num(r.dim, 0, 0.85, 0)),
    tint,
    fixed: r.fixed !== false,
    underSide: r.underSide !== false,
    sideAlpha: r2(num(r.sideAlpha, 0.3, 1, 0.7)),
    underBar: r.underBar !== false,
    barAlpha: r2(num(r.barAlpha, 0.3, 1, 0.78))
  };
}

/** Только параметры фона (и, если есть и небольшая, картинка) из файла стиля: стиль может настроить фон, не неся с собой картинку. */
export function cleanBgParams(raw: unknown): Partial<BgImage> | undefined {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return undefined;
  const probe = cleanBg({ ...r, v: 2, src: 'data:image/png;base64,AA==' });
  if (!probe) return undefined;
  const out: Partial<BgImage> = {};
  for (const k of ['x', 'y', 'size', 'zoom', 'opacity', 'blur', 'dim', 'tint', 'fixed', 'underSide', 'sideAlpha', 'underBar', 'barAlpha'] as const) {
    if (r[k] !== undefined) (out as Record<string, unknown>)[k] = probe[k];
  }
  if (typeof r.src === 'string' && r.src.length < MAX_BG_SRC_FILE && BG_SRC.test(r.src)) out.src = r.src;
  return Object.keys(out).length ? out : undefined;
}

export interface BgCss {
  vars: Record<string, string>;
  /** Атрибуты на <html>: data-bgimg, data-bgfix, data-bgside, data-bgbar. */
  data: Record<string, string>;
}

/** Всё, что нужно CSS для фона. null — картинки нет (тогда переменные и атрибуты убираются). */
export function bgCss(raw: unknown): BgCss | null {
  const bg = cleanBg(raw);
  if (!bg) return null;
  const pos = `${bg.x}% ${bg.y}%`;
  const size = bg.size === 'cover' ? 'cover' : bg.size === 'contain' ? 'contain' : `${bg.zoom}% auto`;
  const tintMix = bg.dim > 0 ? `color-mix(in srgb, ${bg.tint} ${Math.round(bg.dim * 100)}%, transparent)` : 'transparent';
  return {
    vars: {
      '--bg-img': `url("${bg.src}")`,
      '--bg-pos': pos,
      '--bg-size': size,
      '--bg-repeat': bg.size === 'tile' ? 'repeat' : 'no-repeat',
      '--bg-blur': `${bg.blur}px`,
      // Сколько цвета темы лежит поверх картинки: 1 − видимость.
      '--bg-fade': String(r2(1 - bg.opacity)),
      '--bg-dim': tintMix,
      '--bg-side': String(bg.sideAlpha),
      // Выдвижная панель на телефоне лежит поверх текста: ей нужно больше непрозрачности, иначе текст под ней просвечивает.
      '--bg-side-drawer': String(r2(Math.max(bg.sideAlpha, 0.94))),
      '--bg-bar': String(bg.barAlpha)
    },
    data: {
      bgimg: '1',
      bgfix: bg.fixed ? 'fixed' : 'scroll',
      // Прокручиваемая картинка лежит только в области экрана, под панелью её нет.
      bgside: bg.underSide && bg.fixed ? 'under' : 'solid',
      bgbar: bg.underBar && bg.fixed ? 'under' : 'solid'
    }
  };
}

/** Переменные и атрибуты, которые ставит bgCss: чтобы снять их все разом. */
export const BG_VARS = ['--bg-img', '--bg-pos', '--bg-size', '--bg-repeat', '--bg-blur', '--bg-fade', '--bg-dim', '--bg-side', '--bg-side-drawer', '--bg-bar'];
export const BG_DATA = ['bgimg', 'bgfix', 'bgside', 'bgbar'];
