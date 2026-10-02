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
  'background-color'
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
  return s
    .replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?/g, (_m, h: string) => {
      const n = parseInt(h, 16);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '�';
    })
    .replace(/\\([^\n])/g, '$1');
}

/** Имя стиля попадает в комментарий в CSS — оставляем только буквы, цифры и простые знаки, чтобы имя не закрыло комментарий. */
export function cleanModName(name: string): string {
  return String(name).replace(/[^\p{L}\p{N} _.,()\-]/gu, '').slice(0, 60);
}
