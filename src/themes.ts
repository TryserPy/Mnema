// Оформление: готовые темы (светлые и тёмные), шрифты, скругления, фон и свои цвета.
import type { Settings } from './types';

export interface Palette {
  bg: string;
  side: string;
  surface: string;
  surface2: string;
  sunken: string;
  ink: string;
  ink2: string;
  muted: string;
  line: string;
  line2: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  dark: boolean;
  accent: string;
  p: Palette;
}

export const THEMES: ThemePreset[] = [
  // светлые
  { id: 'air', name: 'Воздух', dark: false, accent: '#4C5BD4', p: { bg: '#F5F6F8', side: '#EEF0F3', surface: '#FFFFFF', surface2: '#FAFAFB', sunken: '#EBEDF1', ink: '#171A22', ink2: '#373C49', muted: '#626978', line: '#E6E8EC', line2: '#D4D8DF' } },
  { id: 'paper', name: 'Бумага', dark: false, accent: '#3F51D8', p: { bg: '#F6F3EC', side: '#EFEBE2', surface: '#FFFFFF', surface2: '#FBFAF6', sunken: '#EAE5DA', ink: '#1E2230', ink2: '#3A3F4E', muted: '#5B6070', line: '#E6E1D6', line2: '#D8D2C4' } },
  { id: 'snow', name: 'Снег', dark: false, accent: '#2A5BB8', p: { bg: '#F4F6F9', side: '#EBEFF4', surface: '#FFFFFF', surface2: '#F9FAFC', sunken: '#E3E8EF', ink: '#172033', ink2: '#344056', muted: '#5A667C', line: '#E0E5ED', line2: '#CDD5E1' } },
  { id: 'sky', name: 'Небо', dark: false, accent: '#1E6FD9', p: { bg: '#EEF5FD', side: '#E3EEFA', surface: '#FFFFFF', surface2: '#F6FAFE', sunken: '#DCE8F6', ink: '#12243B', ink2: '#2E4460', muted: '#51647D', line: '#D8E5F3', line2: '#C3D5EA' } },
  { id: 'mint', name: 'Мята', dark: false, accent: '#1F7A6B', p: { bg: '#EFF6F2', side: '#E5F0EA', surface: '#FFFFFF', surface2: '#F7FBF8', sunken: '#DCEBE3', ink: '#15271F', ink2: '#2F4639', muted: '#52685C', line: '#D9E8DF', line2: '#C3D9CC' } },
  { id: 'sakura', name: 'Сакура', dark: false, accent: '#C2417A', p: { bg: '#FBF1F4', side: '#F6E6EC', surface: '#FFFFFF', surface2: '#FEF8FA', sunken: '#F1DDE5', ink: '#2B1820', ink2: '#4A2F3B', muted: '#735A65', line: '#F0DEE5', line2: '#E3C9D3' } },
  { id: 'sand', name: 'Песок', dark: false, accent: '#A4591A', p: { bg: '#F5EEDF', side: '#EDE4D0', surface: '#FFFBF2', surface2: '#FAF5EA', sunken: '#E7DCC4', ink: '#2A2114', ink2: '#4A3D29', muted: '#6E6049', line: '#E6DAC2', line2: '#D6C7A9' } },
  { id: 'contrast', name: 'Контраст', dark: false, accent: '#0033CC', p: { bg: '#FFFFFF', side: '#F2F2F2', surface: '#FFFFFF', surface2: '#FFFFFF', sunken: '#E6E6E6', ink: '#000000', ink2: '#111111', muted: '#333333', line: '#9A9A9A', line2: '#666666' } },
  // тёмные
  { id: 'night', name: 'Ночь', dark: true, accent: '#7C87F4', p: { bg: '#101216', side: '#15171C', surface: '#1B1E24', surface2: '#181A20', sunken: '#24272F', ink: '#ECEDF0', ink2: '#C8CBD3', muted: '#969BA7', line: '#262930', line2: '#33363F' } },
  { id: 'graphite', name: 'Графит', dark: true, accent: '#6F80F0', p: { bg: '#15171E', side: '#1B1E27', surface: '#20232D', surface2: '#1D2029', sunken: '#2A2E3A', ink: '#F1EFE9', ink2: '#D4D2CC', muted: '#A7ABB8', line: '#2E3240', line2: '#3A3F4E' } },
  { id: 'midnight', name: 'Полночь', dark: true, accent: '#7C8CFF', p: { bg: '#000000', side: '#0A0A0D', surface: '#111116', surface2: '#0D0D11', sunken: '#1B1B22', ink: '#F2F2F5', ink2: '#D2D2D8', muted: '#9C9CA8', line: '#22222B', line2: '#30303B' } },
  { id: 'ocean', name: 'Океан', dark: true, accent: '#4FA3F7', p: { bg: '#0E1A2B', side: '#122136', surface: '#16273F', surface2: '#132339', sunken: '#1E3350', ink: '#EAF2FC', ink2: '#C9D8EA', muted: '#93A8C2', line: '#223A59', line2: '#2E4A6E' } },
  { id: 'forest', name: 'Лес', dark: true, accent: '#4CC38A', p: { bg: '#0F1A15', side: '#13211A', surface: '#18291F', surface2: '#15241C', sunken: '#20362A', ink: '#E9F4EE', ink2: '#C8DCD0', muted: '#93AD9E', line: '#243B2F', line2: '#30503F' } },
  { id: 'plum', name: 'Слива', dark: true, accent: '#B58CFF', p: { bg: '#18121F', side: '#1E1727', surface: '#251C30', surface2: '#21192B', sunken: '#30253D', ink: '#F3EDF9', ink2: '#D8CDE4', muted: '#A898B9', line: '#342941', line2: '#433553' } },
  { id: 'coffee', name: 'Кофе', dark: true, accent: '#E0A15B', p: { bg: '#1A1511', side: '#211B16', surface: '#29221C', surface2: '#251E18', sunken: '#342B23', ink: '#F5EEE6', ink2: '#DCD0C2', muted: '#AE9F8E', line: '#3A3027', line2: '#4A3E33' } }
];

export const FONTS: { id: string; name: string; css: string; load?: () => Promise<unknown> }[] = [
  { id: 'onest', name: 'Онест (обычный)', css: "'Onest', 'Segoe UI', system-ui, sans-serif" },
  { id: 'nunito', name: 'Нунито (округлый)', css: "'Nunito', 'Onest', system-ui, sans-serif", load: () => Promise.all([import('@fontsource/nunito/cyrillic-400.css'), import('@fontsource/nunito/cyrillic-600.css'), import('@fontsource/nunito/cyrillic-700.css'), import('@fontsource/nunito/latin-400.css'), import('@fontsource/nunito/latin-600.css'), import('@fontsource/nunito/latin-700.css')]) },
  { id: 'comfortaa', name: 'Комфортаа (мягкий)', css: "'Comfortaa', 'Onest', system-ui, sans-serif", load: () => Promise.all([import('@fontsource/comfortaa/cyrillic-400.css'), import('@fontsource/comfortaa/cyrillic-600.css'), import('@fontsource/comfortaa/cyrillic-700.css'), import('@fontsource/comfortaa/latin-400.css'), import('@fontsource/comfortaa/latin-600.css'), import('@fontsource/comfortaa/latin-700.css')]) },
  { id: 'literata', name: 'Литерата (книжный)', css: "'Literata', Georgia, serif" },
  { id: 'system', name: 'Как в системе', css: "system-ui, 'Segoe UI', Roboto, sans-serif" }
];

export const HEAD_FONTS: { id: string; name: string; css: string }[] = [
  { id: 'literata', name: 'Литерата (с засечками)', css: "'Literata', Georgia, serif" },
  { id: 'same', name: 'Как основной', css: 'var(--body)' }
];

export const BACKGROUNDS: { id: Settings['look']['background']; name: string }[] = [
  { id: 'plain', name: 'Однотонный' },
  { id: 'dots', name: 'Точки' },
  { id: 'grid', name: 'Клетка' },
  { id: 'lines', name: 'Линейка' }
];

export const DEFAULT_LOOK: Settings['look'] = { style: 'modern', light: 'air', dark: 'night', font: 'onest', headFont: 'same', radius: 'normal', background: 'plain', custom: {} };
export const DEFAULT_ACCENT = '#4C5BD4';

/** Два стиля интерфейса: новый «Современный» и прежний «Классический» (бумага и книжные заголовки). */
export const STYLES: { id: 'modern' | 'classic'; name: string; text: string; look: Partial<Settings['look']>; accent: string }[] = [
  { id: 'modern', name: 'Современный', text: 'Светлый и спокойный, простые заголовки', look: { style: 'modern', light: 'air', dark: 'night', headFont: 'same' }, accent: DEFAULT_ACCENT },
  { id: 'classic', name: 'Классический', text: 'Тёплая бумага и книжные заголовки', look: { style: 'classic', light: 'paper', dark: 'graphite', headFont: 'literata' }, accent: '#3F51D8' }
];

/** Прежнее оформление по умолчанию (до 1.5) переводим на новый стиль; изменённое вручную — оставляем «Классическим». */
export function migrateLook(look: Partial<Settings['look']> | undefined, accent: string | undefined): { look: Settings['look']; accent?: string } {
  if (!look) return { look: { ...DEFAULT_LOOK, custom: {} } };
  if (look.style) return { look: { ...DEFAULT_LOOK, ...look, custom: { ...(look.custom ?? {}) } } };
  const untouched = (look.light ?? 'paper') === 'paper' && (look.dark ?? 'graphite') === 'graphite' && (look.headFont ?? 'literata') === 'literata' && !Object.keys(look.custom?.light ?? {}).length && !Object.keys(look.custom?.dark ?? {}).length;
  if (untouched) return { look: { ...DEFAULT_LOOK, ...look, style: 'modern', light: 'air', dark: 'night', headFont: 'same', custom: {} }, accent: !accent || accent === '#3F51D8' ? DEFAULT_ACCENT : accent };
  return { look: { ...DEFAULT_LOOK, ...look, style: 'classic', custom: { ...(look.custom ?? {}) } } };
}

/** Короткий ключ оформления — чтобы понять, изменилось ли оно. */
export function lookKey(look: Settings['look']): string {
  return [look.style, look.light, look.dark, look.font, look.headFont, look.radius, look.background, JSON.stringify(look.custom)].join('|');
}

export function presetFor(look: Settings['look'], dark: boolean): ThemePreset {
  const id = dark ? look.dark : look.light;
  return THEMES.find((t) => t.id === id && t.dark === dark) ?? THEMES.find((t) => t.dark === dark)!;
}

const VAR: Record<keyof Palette, string> = { bg: '--bg', side: '--side', surface: '--surface', surface2: '--surface-2', sunken: '--sunken', ink: '--ink', ink2: '--ink-2', muted: '--muted', line: '--line', line2: '--line-2' };

/** Применить оформление к окну. */
export function applyLook(root: HTMLElement, s: Settings, dark: boolean) {
  const look = s.look;
  const t = presetFor(look, dark);
  const custom = (dark ? look.custom.dark : look.custom.light) ?? {};
  for (const k of Object.keys(VAR) as (keyof Palette)[]) root.style.setProperty(VAR[k], custom[k] || t.p[k]);
  const font = FONTS.find((f) => f.id === look.font) ?? FONTS[0];
  void font.load?.();
  root.style.setProperty('--body', font.css);
  root.style.setProperty('--display', look.headFont === 'same' ? font.css : HEAD_FONTS[0].css);
  root.dataset.style = look.style ?? 'modern';
  root.dataset.radius = look.radius;
  root.dataset.bg = look.background;
  root.dataset.font = look.font;
}
