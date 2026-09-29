// Моды: наборы стилей, которые меняют вид Мнемы. Только оформление (CSS и настройки вида),
// никаких программ — поэтому моды из файлов от друзей безопасны.
import type { Mod } from './types';

export const MOD_EXT = '.mnemamod';

export const CATALOG: Mod[] = [
  {
    id: 'notebook',
    icon: '📓',
    name: 'Тетрадь',
    where: 'везде',
    description: 'Фон в клетку, округлый шрифт и красные поля у конспекта.',
    font: 'comfortaa',
    css: `.main { background-image: linear-gradient(color-mix(in srgb, var(--accent) 11%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--accent) 11%, transparent) 1px, transparent 1px); background-size: 22px 22px; background-attachment: local; } :root { --body: 'Comfortaa', 'Onest', system-ui, sans-serif !important; } .note-page, .style-preview .note-page { box-shadow: inset 4px 0 0 0 color-mix(in srgb, #E0525A 60%, transparent); }`
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
    description: 'Без счётчиков, серий и советов — ничего не торопит.',
    css: `.pill.streak, .tip, .rail-badge, .nav-item .badge, .hero-sub, .hero-time { display: none !important; }`
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
  }
];

export function isMod(x: unknown): x is Mod & { kind: 'mnema-mod' } {
  const m = x as Record<string, unknown>;
  return Boolean(m && m.kind === 'mnema-mod' && typeof m.name === 'string' && (typeof m.css === 'string' || typeof m.look === 'object'));
}

/** Проверка CSS из файла: убираем то, что может загрузить что-то из интернета или сломать окно. */
export function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(?!data:)[^)]*\1\s*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '')
    .replace(/<\/?style[^>]*>/gi, '')
    .slice(0, 40000);
}

export function allMods(custom: Mod[]): Mod[] {
  return [...CATALOG, ...custom];
}

/** Итоговые стили всех включённых модов и своего CSS. */
export function modsCss(on: string[], custom: Mod[], userCss: string): string {
  const parts = allMods(custom)
    .filter((m) => on.includes(m.id) && m.css)
    .map((m) => `/* мод: ${m.name.replace(/\*\//g, '')} */\n${sanitizeCss(m.css!)}`);
  if (userCss.trim()) parts.push('/* свой CSS */\n' + sanitizeCss(userCss));
  return parts.join('\n\n');
}
