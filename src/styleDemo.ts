// Живой пример стиля в плитке «Настроек → Стили». Пример рисуется в своём Shadow DOM: на него действует только CSS этого стиля,
// а не всё, что включено в приложении. Здесь — чистые функции: какие части показать и как переписать CSS стиля для примера.
import { sanitizeCss } from './mods';

/** Части примера: заголовок, пункт меню со значком, плашка «На сегодня», карточка, оценки, конспект, кнопки и поля. */
export type DemoPart = 'title' | 'nav' | 'hero' | 'card' | 'grades' | 'note' | 'controls';

// Порядок важен: первые две найденные части и попадут в пример.
const DETECT: [DemoPart, RegExp][] = [
  ['grades', /\.grade\b/],
  ['card', /\.(review-card|question|answer-text)\b/],
  ['note', /\.note-(doc|page)\b/],
  ['nav', /\.(nav-item|badge|rail-badge)\b/],
  ['hero', /\.hero(-[a-z]+)?\b/],
  ['controls', /\.(btn|input|switch|icon-btn)\b/],
  ['title', /\.display\b/]
];

/** Какие части примера показать для стиля: те, что он меняет (не больше двух). Только шрифт или ничего знакомого — заголовок и карточка. */
export function demoParts(css: string): DemoPart[] {
  const found = DETECT.filter(([, re]) => re.test(css)).map(([p]) => p);
  const parts = found.slice(0, 2);
  if (parts.length === 0) return ['title', 'card'];
  if (parts.length === 1 && (parts[0] === 'title' || parts[0] === 'nav')) parts.push('card');
  // Заголовок — сверху, остальное в порядке, как на экране.
  const order: DemoPart[] = ['title', 'nav', 'hero', 'card', 'grades', 'note', 'controls'];
  return parts.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** CSS стиля для примера в Shadow DOM: сначала та же проверка, что и для всего приложения, потом `:root`, `html` и `body` → `:host`
 *  (так переменные вроде `--body` и правила для тёмной темы `:root[data-theme='dark']` работают внутри примера). */
export function cssForDemo(css: string): string {
  return sanitizeCss(css)
    .replace(/:root((?:\[[^\]]*\])+)/g, ':host($1)')
    .replace(/:root\b/g, ':host')
    .replace(/(^|[\s,{}>+~])(?:html|body)(?=[\s.{[:#,>+~]|$)/g, '$1:host');
}
