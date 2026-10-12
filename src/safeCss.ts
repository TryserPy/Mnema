// Проверки «чужого» оформления: цвета из файлов стилей, style="…" внутри формул, CSS из файлов. Чистые функции — их можно проверять тестами.
// Зачем: файл от одноклассника не должен прятать части окна, рисовать поддельные кнопки поверх окна или грузить что-то из сети.

/** Цвет, который можно подставить в CSS-переменную: #rgb/#rrggbb/#rrggbbaa или rgb()/rgba()/hsl()/hsla() из цифр. Иначе null. */
export function safeColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s;
  if (/^(?:rgb|hsl)a?\(\s*[\d.]+%?\s*[, ]\s*[\d.]+%?\s*[, ]\s*[\d.]+%?(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i.test(s)) return s;
  return null;
}

/** Цвет по умолчанию у предмета и папки, если цвет из файла не годится. */
export const FALLBACK_COLOR = '#3A3F4E';

/** У предметов и папок (и в корзине) оставить только безопасный цвет — иначе он попадает в style/CSS-переменную как есть. Если менять нечего, возвращает тот же массив. */
export function cleanColors<T extends { color?: unknown }>(items: T[]): T[] {
  let changed = false;
  const out = items.map((it) => {
    if (!it || typeof it !== 'object') return it;
    const c = safeColor(it.color);
    if (c !== null && c === it.color) return it;
    changed = true;
    return { ...it, color: c ?? FALLBACK_COLOR };
  });
  return changed ? out : items;
}

// Что KaTeX кладёт в style="…" у частей формулы (размеры, сдвиги, цвет). position/z-index/inset/url(…) среди них нет — их и не пропускаем.
const KATEX_PROPS = new Set([
  'height',
  'width',
  'min-width',
  'top',
  'bottom',
  'left',
  'right',
  'margin-left',
  'margin-right',
  'padding-left',
  'vertical-align',
  'border-top-width',
  'border-bottom-width',
  'border-right-width',
  'border-left-width',
  'color',
  'background-color',
  'border-color' // фон и рамка \fcolorbox
]);
const SAFE_VALUE = /^(?:[-+]?[\d.]+(?:px|em|rem|ex|%)?|#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z-]+)$/i;

/** Оставить в style="…" только безопасное для формул. Остальное выбрасывается. */
export function safeStyleAttr(style: string): string {
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim().replace(/\s*!important\s*$/i, '');
    if (KATEX_PROPS.has(prop) && SAFE_VALUE.test(val) && !/^(?:fixed|absolute|sticky)$/i.test(val)) out.push(`${prop}:${val}`);
  }
  return out.join(';');
}

/** Раскрыть CSS-экранирование (\75rl → url): иначе проверки ниже обходятся. */
export function decodeCssEscapes(s: string): string {
  const once = (t: string) =>
    t
      .replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?/g, (_m, h: string) => {
        const n = parseInt(h, 16);
        return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '�';
      })
      .replace(/\\([^\n])/g, '$1');
  // Одного прохода мало: «\\5c \\5c 75rl(» после него снова превращается в «\\75rl(», то есть в url(. Повторяем до устойчивого вида,
  // а то, что всё ещё похоже на экранирование, выбрасываем — в стилях из файла оно не нужно.
  let cur = s;
  for (let i = 0; i < 6; i++) {
    const next = once(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur.replace(/\\/g, '');
}

/** Имя стиля попадает в комментарий в CSS — оставляем только буквы, цифры и простые знаки, чтобы имя не закрыло комментарий. */
export function cleanModName(name: string): string {
  return String(name).replace(/[^\p{L}\p{N} _.,()\-]/gu, '').slice(0, 60);
}

// ---------- CSS стиля из файла ----------

/** Сколько знаков CSS принимаем от одного стиля или сниппета (с запасом на небольшую картинку-текстуру внутри файла). */
export const MAX_CSS = 150000;

// Растровая картинка прямо внутри файла: png, jpeg, webp, gif. SVG и всё остальное через url() не пускаем.
const DATA_IMG = /^url\(\s*(["']?)\s*data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]{1,120000}\s*\1\s*\)$/i;

/**
 * Проверка CSS из файла: убираем всё, что может загрузить что-то из интернета, подставить чужую картинку, выполнить код или сломать окно.
 * Сначала раскрываем экранирование (\75rl( → url(), иначе проверки обходятся; проверяем уже раскрытый текст и его же отдаём.
 * Разрешено: обычные правила, переменные, анимации, градиенты и картинка-текстура внутри самого файла (data:image png/jpeg/webp/gif).
 */
export function sanitizeCss(css: string): string {
  let s = decodeCssEscapes(String(css ?? '').slice(0, MAX_CSS));
  // Управляющие знаки, нулевой байт и «<» (</style>, <!-- …) в CSS не нужны.
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<]/g, '');
  // Комментарии (ими разрывают слова: u/**/rl), потом ещё раз — после удаления из «u/**/r/**/l» выходит цельное слово.
  for (let i = 0; i < 3; i++) s = s.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '');
  const once = (t: string) =>
    t
      .replace(/@\s*(?:-[a-z]+-)?(?:import|namespace|charset|document)\b[^;{]*(?:;|(?=\{)|$)/gi, '')
      .replace(/url\s*\(\s*[^)]*\)/gi, (m) => (DATA_IMG.test(m.replace(/^url\s*\(/i, 'url(')) ? m : 'none'))
      // Незакрытый url( (после него до конца листа нет «)»): браузер дочитает адрес до конца листа и загрузит его — вырезаем до конца объявления.
      .replace(/url\s*\((?![^)]*\))[^;}]*/gi, 'none')
      .replace(/(?<![\w-])(?:-[a-z]+-)?(?:image-set|cross-fade|element|image|src|paint)\s*\(/gi, 'blocked-fn(') // функции, которые тоже умеют грузить картинки
      .replace(/expression\s*\(|(?:java|vb|live)script\s*:|-moz-binding|(?:-ms-)?behavior\s*:|binding\s*:/gi, '');
  // Вырезание может склеить новое запретное слово (expreexpression(ssion() — повторяем до устойчивого вида.
  for (let i = 0; i < 6; i++) {
    const next = once(s);
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * Значение, которое можно подставить в CSS-переменную из настроек стиля: числа, слова, цвета, calc()/var()/color-mix(), списки шрифтов.
 * Без ссылок, кавычек-ловушек, комментариев, «;», фигурных скобок и «!important» — значение не должно закончить объявление.
 */
export function safeCssValue(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  if (!s || s.length > 140) return null;
  if (!/^[\p{L}\p{N} .,%#()'"\-_+*/:]+$/u.test(s)) return null;
  if (/\/\*|\*\/|\/\/|url\s*\(|expression|script\s*:|binding|behavior|image|src\s*\(|element\s*\(|\\/i.test(s)) return null;
  // скобки и кавычки должны быть парными
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return null;
  }
  if (depth !== 0) return null;
  if ((s.match(/"/g) ?? []).length % 2 || (s.match(/'/g) ?? []).length % 2) return null;
  return s;
}

/** Список шрифтов для font-family: названия, запятые, кавычки. */
export function safeFontFamily(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 120 || !/^[\p{L}\p{N} ,'"\-_]+$/u.test(s)) return null;
  if ((s.match(/"/g) ?? []).length % 2 || (s.match(/'/g) ?? []).length % 2) return null;
  return s;
}

/** Имя CSS-переменной стиля: --латиница-цифры-дефис. */
export function safeVarName(v: unknown): string | null {
  return typeof v === 'string' && /^--[a-z][a-z0-9-]{0,40}$/.test(v) ? v : null;
}
