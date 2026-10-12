// Моды: наборы стилей, которые меняют вид Refrain. Только оформление (CSS и настройки вида),
// никаких программ — поэтому моды из файлов от друзей безопасны.
import { cleanModName, sanitizeCss } from './safeCss';
import type { Mod } from './types';

/** Прежнее расширение файлов стилей (читается по-прежнему); новые стили сохраняются как .refrainstyle (см. styleSystem.ts). */
export const MOD_EXT = '.mnemamod';

export const CATALOG: Mod[] = [
  {
    id: 'notebook',
    icon: '📓',
    name: 'Тетрадь',
    where: 'везде',
    description: 'Фон в клетку, округлый шрифт и красные поля у конспекта. Размер клетки и цвета меняются в настройках стиля.',
    font: 'comfortaa',
    settings: [
      { id: 'cell', type: 'slider', label: 'Размер клетки', var: '--nb-cell', min: 14, max: 44, step: 2, unit: 'px', default: 22 },
      { id: 'grid', type: 'color', label: 'Цвет клетки', var: '--nb-grid', default: '#3F51D81C', defaultDark: '#8E9BFF22' },
      { id: 'margin', type: 'color', label: 'Цвет полей', var: '--nb-margin', default: '#E0525A99' }
    ],
    css: `.main { background-image: linear-gradient(var(--nb-grid, color-mix(in srgb, var(--accent) 11%, transparent)) 1px, transparent 1px), linear-gradient(90deg, var(--nb-grid, color-mix(in srgb, var(--accent) 11%, transparent)) 1px, transparent 1px); background-size: var(--nb-cell, 22px) var(--nb-cell, 22px); background-attachment: local; } :root { --body: 'Comfortaa', 'Onest', system-ui, sans-serif !important; } .note-page, .style-preview .note-page { box-shadow: inset 4px 0 0 0 var(--nb-margin, color-mix(in srgb, #E0525A 60%, transparent)); }`
  },
  {
    id: 'big-buttons',
    icon: '👆',
    name: 'Крупные кнопки',
    where: 'везде',
    description: 'Кнопки и поля побольше — удобно на планшете и сенсорном экране.',
    css: `.btn { min-height: 48px; font-size: 1.04rem; padding: 0 18px; } .btn.small { min-height: 40px; } .icon-btn { width: 44px; height: 44px; } .input { min-height: 48px; } .grade { min-height: 76px; }`
  },
  {
    id: 'big-cards',
    icon: '🔍',
    name: 'Большие карточки',
    where: 'при повторении',
    description: 'Вопрос и ответ крупнее — легче читать с расстояния.',
    css: `.review-card .question { font-size: 2.15rem; line-height: 1.25; } .review-card .answer-text { font-size: 1.4rem; }`
  },
  {
    id: 'sticky-notes',
    icon: '🟨',
    name: 'Стикеры',
    where: 'при повторении',
    description: 'Карточки похожи на жёлтые стикеры, чуть повёрнутые.',
    css: `.review-card { background: #FFF4A8 !important; color: #2B2610 !important; border-color: #EBD970 !important; transform: rotate(-0.6deg); box-shadow: 0 14px 30px rgba(80, 60, 0, 0.18) !important; } .review-card .muted, .review-card .small { color: #6B5E22 !important; } .review-card .divider { background: #E1CD5E; }`
  },
  {
    id: 'pastel-grades',
    icon: '🎨',
    name: 'Пастельные оценки',
    where: 'при повторении',
    description: 'Кнопки оценок нежных цветов и круглее.',
    css: `.grade { border-radius: 22px !important; font-size: 1.05rem; } .grade.again { background: #FFD9D6; color: #8A2A24; } .grade.hard { background: #FFE9C2; color: #7A4F0E; } .grade.good { background: #CFF1DC; color: #1F6B43; } .grade.easy { background: #D6E4FF; color: #2A5BB8; } :root[data-theme='dark'] .grade { filter: saturate(0.85) brightness(0.85); }`
  },
  {
    id: 'glow',
    icon: '✨',
    name: 'Свечение',
    where: 'везде',
    description: 'Главный цвет мягко светится: кнопки, переключатели, заголовки.',
    css: `.btn.primary, .hero-btn, .switch.on { box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 55%, transparent); } .hero { box-shadow: 0 10px 40px color-mix(in srgb, var(--accent) 38%, transparent); } :root[data-theme='dark'] .display { text-shadow: 0 0 18px color-mix(in srgb, var(--accent) 45%, transparent); }`
  },
  {
    id: 'calm',
    icon: '🍃',
    name: 'Спокойный',
    where: 'на «Сегодня»',
    description: 'Без счётчиков и значков с числами — ничего не торопит.',
    css: `.rail-badge, .nav-item .badge, .tab-badge, .hero-sub, .hero-time { display: none !important; }`
  },
  {
    id: 'wide-note',
    icon: '📖',
    name: 'Широкий конспект',
    where: 'в конспекте',
    description: 'Конспект шире, текст крупнее и просторнее.',
    css: `.page.wide { max-width: 1400px; } .note-doc { font-size: 1.14rem !important; line-height: 1.75 !important; }`
  },
  {
    id: 'mono',
    icon: '⌨️',
    name: 'Печатная машинка',
    where: 'везде',
    description: 'Моноширинный шрифт для всего — как в старом компьютере.',
    css: `:root { --body: ui-monospace, 'Cascadia Mono', 'Consolas', monospace !important; --display: ui-monospace, 'Cascadia Mono', 'Consolas', monospace !important; } .display { letter-spacing: -0.02em; }`
  },
  {
    id: 'compact',
    icon: '📏',
    name: 'Компакт',
    where: 'раскладка',
    description: 'Плотный интерфейс: меньше отступов, ниже кнопки и строки — больше помещается на экране.',
    vars: { light: { '--pad': '12px', '--gap': '10px', '--rf-btn-h': '34px', '--rf-btn-h-small': '28px', '--rf-input-h': '34px', '--rf-nav-h': '34px', '--rf-tab-h': '36px', '--rf-grade-h': '54px', '--rf-row-pad': '10px 14px', '--rf-list-gap': '4px', '--rf-page-pad': '22px 28px 40px', '--rf-review-pad': '22px 26px', '--rf-question-size': '1.5rem', '--rf-note-size': '1rem', '--rf-note-lh': '1.55', '--rf-note-pad': '24px 32px 40px', '--rf-hero-pad': '18px 22px' } },
    settings: [{ id: 'wide', type: 'toggle', label: 'Широкая колонка', description: 'Содержимое занимает больше места по ширине.', attr: 'content', on: 'wide', off: 'normal', default: true }]
  },
  {
    id: 'focus',
    icon: '🎯',
    name: 'Фокус',
    where: 'раскладка',
    description: 'Ничего лишнего: узкая колонка по центру, панель — только значки, плоские карточки, без счётчиков.',
    attrs: { sidebar: 'rail', content: 'narrow', cards: 'flat' },
    settings: [
      { id: 'width', type: 'select', label: 'Ширина колонки', attr: 'content', default: 'narrow', options: [{ value: 'narrow', label: 'Узкая' }, { value: 'normal', label: 'Обычная' }, { value: 'wide', label: 'Широкая' }] },
      { id: 'rail', type: 'toggle', label: 'Узкая панель со значками', attr: 'sidebar', on: 'rail', off: 'left', default: true }
    ],
    css: `.hero-sub2, .hero-time, .plan-why, .badge.soft, .rail-badge, .tab-badge { display: none !important; } .note-doc { font-size: 1.12rem; line-height: 1.8; } .display { letter-spacing: -0.02em; }`
  },
  {
    id: 'tiles',
    icon: '🧱',
    name: 'Плитки',
    where: 'раскладка',
    description: 'Темы предмета — плитками в сетке, кнопки оценки — «2 на 2», карточки с рамкой.',
    attrs: { topics: 'tiles', grades: 'grid', cards: 'outline' },
    settings: [{ id: 'tile', type: 'slider', label: 'Ширина плитки', var: '--rf-tile-w', min: 160, max: 380, step: 10, unit: 'px', default: 230 }]
  },
  {
    id: 'top-bar',
    icon: '⬆️',
    name: 'Панель сверху',
    where: 'раскладка',
    description: 'Меню — полосой сверху, а не слева. Предметы — на экране «Знания». Экран шире.',
    attrs: { sidebar: 'top', content: 'wide' },
    desktopOnly: true // на телефоне нет боковой панели (там нижние вкладки и шторка), переносить нечего
  },
  {
    id: 'right-panel',
    icon: '➡️',
    name: 'Панель справа',
    where: 'раскладка',
    description: 'Боковая панель переезжает на правую сторону.',
    attrs: { sidebar: 'right' },
    desktopOnly: true // на телефоне нет боковой панели, переносить нечего
  },
  {
    id: 'tablet',
    icon: '👆',
    name: 'Крупно для планшета',
    where: 'раскладка',
    description: 'Всё крупнее: кнопки, поля, вкладки, оценки и текст — удобно пальцем. Размер текста — в настройках стиля.',
    attrs: { grades: 'tall' },
    vars: { light: { '--rf-btn-h': '52px', '--rf-btn-h-small': '44px', '--rf-input-h': '52px', '--rf-nav-h': '52px', '--rf-tab-h': '54px', '--rf-row-pad': '20px 22px', '--rf-question-size': '2.3rem', '--rf-note-size': '1.2rem', '--rf-list-gap': '12px' } },
    settings: [{ id: 'scale', type: 'slider', label: 'Размер текста', description: 'Во сколько раз крупнее обычного.', var: '--rf-ui-scale', min: 0.9, max: 1.5, step: 0.05, unit: '', default: 1.12 }],
    css: `:root { font-size: calc(16px * var(--rf-ui-scale, 1.12)) !important; } .icon-btn { width: 46px; height: 46px; }`
  },
  {
    id: 'glass',
    icon: '🪟',
    name: 'Стекло',
    where: 'везде',
    description: 'Полупрозрачные панели, карточки и окна с размытием поверх мягкого цветного фона.',
    settings: [
      { id: 'blur', type: 'slider', label: 'Размытие', var: '--glass-blur', min: 0, max: 40, step: 2, unit: 'px', default: 14 },
      { id: 'alpha', type: 'slider', label: 'Плотность стекла', var: '--glass-alpha', min: 30, max: 95, step: 5, unit: '%', default: 62 },
      { id: 'glow', type: 'color', label: 'Цвет подсветки фона', var: '--glass-glow', default: '#6F80F055', defaultDark: '#6F80F044' }
    ],
    css: `.main { background-image: radial-gradient(60% 50% at 15% 10%, var(--glass-glow, color-mix(in srgb, var(--accent) 30%, transparent)), transparent 70%), radial-gradient(50% 45% at 90% 85%, var(--glass-glow, color-mix(in srgb, var(--accent) 22%, transparent)), transparent 70%); background-attachment: fixed; } .sidebar, .card, .review-card, .note-page, .topic-row, .card-row, .menu, .modal, .imp-panel { background: color-mix(in srgb, var(--surface) var(--glass-alpha, 62%), transparent) !important; -webkit-backdrop-filter: blur(var(--glass-blur, 14px)) saturate(1.35); backdrop-filter: blur(var(--glass-blur, 14px)) saturate(1.35); } .sidebar { background: color-mix(in srgb, var(--side) var(--glass-alpha, 62%), transparent) !important; }`
  }
];

for (const m of CATALOG) {
  m.author ??= 'Refrain';
  m.version ??= '1.0';
}

export function isMod(x: unknown): x is Mod & { kind: 'mnema-mod' } {
  const m = x as Record<string, unknown>;
  return Boolean(m && m.kind === 'mnema-mod' && typeof m.name === 'string' && (typeof m.css === 'string' || typeof m.look === 'object'));
}

export { sanitizeCss };

export function allMods(custom: Mod[]): Mod[] {
  return [...CATALOG, ...custom];
}

/** Итоговые стили всех включённых модов и своего CSS. */
export function modsCss(on: string[], custom: Mod[], userCss: string): string {
  const parts = allMods(custom)
    .filter((m) => on.includes(m.id) && m.css)
    .map((m) => `/* мод: ${cleanModName(m.name)} */\n${sanitizeCss(m.css!)}`);
  if (userCss.trim()) parts.push('/* свой CSS */\n' + sanitizeCss(userCss));
  return parts.join('\n\n');
}
