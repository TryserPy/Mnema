// Текст статьи из HTML и субтитры YouTube (1.32, N2) — для «Карточки из ссылки, видео или книги».
// Без DOM: работает на сервере (Cloudflare Workers), в главном процессе Electron и в окне. Страница чужая и недоверенная:
// скрипты, стили, формы, меню и подвалы выбрасываются, наружу уходит только обычный текст (с «## » у заголовков и «- » у списков).

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', copy: '©', deg: '°', times: '×', minus: '−', shy: '' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : '';
    }
    return ENT[e.toLowerCase()] ?? all;
  });
}

const DROP = ['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'object', 'canvas', 'form', 'button', 'select', 'textarea', 'nav', 'header', 'footer', 'aside', 'figure', 'menu'];

/** Убрать блоки целиком (с содержимым). Без вложенных одноимённых блоков — их у этих тегов почти не бывает. */
function dropBlocks(html, tags) {
  let s = html;
  for (const t of tags) s = s.replace(new RegExp(`<${t}\\b[\\s\\S]*?</${t}\\s*>`, 'gi'), ' ').replace(new RegExp(`<${t}\\b[^>]*/?>`, 'gi'), ' ');
  return s;
}

/** Внутренность первого элемента tag (по балансу открывающих и закрывающих тегов). */
function inner(html, tag) {
  const open = new RegExp(`<${tag}\\b[^>]*>`, 'i').exec(html);
  if (!open) return null;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = open.index + open[0].length;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open.index + open[0].length, m.index);
  }
  return html.slice(open.index + open[0].length);
}

function meta(html, name) {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${name}["'][^>]*>`, 'i');
  const tag = re.exec(html);
  const c = tag && /content\s*=\s*(["'])([\s\S]*?)\1/i.exec(tag[0]);
  return c ? decodeEntities(c[2]).trim() : '';
}

/** HTML → обычный текст с простой разметкой: «## » у заголовков, «- » у пунктов списка, абзацы через пустую строку. */
export function htmlToPlain(html) {
  return decodeEntities(
    String(html)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<h([1-4])\b[^>]*>/gi, '\n\n## ')
      .replace(/<\/h[1-4]\s*>/gi, '\n\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|ul|ol|table|tr|blockquote|pre|dd|dt)\s*>/gi, '\n\n')
      .replace(/<(td|th)\b[^>]*>/gi, ' | ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/^(- |## )\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Читаемый текст статьи: заголовок (og:title или <title>) и основной текст — из <article>, иначе <main>,
 * иначе из <body> без меню, шапки, подвала и боковых колонок. Короткие строки-обрывки меню отбрасываются.
 */
export function articleText(html, maxChars = 60000) {
  const src = String(html).slice(0, 5 * 1024 * 1024);
  const title = meta(src, 'og:title') || decodeEntities((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(src) || [])[1] || '').replace(/\s+/g, ' ').trim();
  const body = inner(src, 'body') ?? src;
  const clean = dropBlocks(body.replace(/<!--[\s\S]*?-->/g, ' '), DROP);
  const candidates = [inner(clean, 'article'), inner(clean, 'main'), clean].filter(Boolean);
  let text = '';
  for (const c of candidates) {
    text = htmlToPlain(c);
    if (text.length > 400) break;
  }
  // Обрывки навигации: короткие строки без точки подряд («Главная», «Войти», «Подписаться»).
  const lines = text.split('\n').filter((l, i, all) => {
    const t = l.trim();
    if (!t || t.startsWith('## ') || t.length > 60 || /[.!?:;…»)]$/.test(t)) return true;
    const near = [all[i - 1], all[i + 1]].filter((x) => x && x.trim() && x.trim().length <= 60 && !/[.!?]$/.test(x.trim())).length;
    return near < 2;
  });
  text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const description = meta(src, 'og:description') || meta(src, 'description');
  if (text.length < 200 && description.length > text.length) text = description;
  const cut = text.length > maxChars;
  return { title: title.slice(0, 300), text: cut ? text.slice(0, maxChars) : text, cut };
}

// ---------- YouTube ----------

/** Дорожки субтитров из страницы видео (ytInitialPlayerResponse): язык, адрес, автоматические или нет; и название видео. */
export function youtubeTracks(html) {
  const s = String(html);
  const at = s.indexOf('"captionTracks":');
  const title = (() => {
    const m = /"videoDetails":\{[^{}]*?"title":"((?:[^"\\]|\\.)*)"/.exec(s);
    if (m) {
      try {
        return JSON.parse(`"${m[1]}"`);
      } catch {
        /* ниже — из <title> */
      }
    }
    return decodeEntities((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(s) || [])[1] || '').replace(/ - YouTube$/, '').trim();
  })();
  if (at < 0) return { title, tracks: [] };
  // Массив JSON — до парной закрывающей скобки.
  const start = s.indexOf('[', at);
  let depth = 0;
  let end = -1;
  let inStr = false;
  for (let i = start; i < s.length && i < start + 200000; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end < 0) return { title, tracks: [] };
  let arr;
  try {
    arr = JSON.parse(s.slice(start, end));
  } catch {
    return { title, tracks: [] };
  }
  const tracks = (Array.isArray(arr) ? arr : [])
    .filter((t) => t && typeof t.baseUrl === 'string' && typeof t.languageCode === 'string')
    .map((t) => ({ lang: t.languageCode, url: t.baseUrl, auto: t.kind === 'asr' }));
  return { title, tracks };
}

/** Какую дорожку брать: русская, потом английская, потом любая; сделанная людьми лучше автоматической. */
export function pickTrack(tracks, langs = ['ru', 'en']) {
  const score = (t) => {
    const li = langs.findIndex((l) => t.lang === l || t.lang.startsWith(l + '-'));
    return (li < 0 ? langs.length : li) * 2 + (t.auto ? 1 : 0);
  };
  return [...tracks].sort((a, b) => score(a) - score(b))[0] ?? null;
}

/** Пометки вместо речи — [Музыка], [Аплодисменты]: в карточки не нужны. */
const noise = (t) => t.replace(/\[(музыка|music|аплодисменты|applause|смех|laughter)\]/gi, '');

/** Субтитры в формате json3 (fmt=json3) или XML timedtext → сплошной текст абзацами (пауза больше 2 с — новый абзац). */
export function captionsText(body) {
  const s = String(body).trim();
  const pieces = [];
  if (s.startsWith('{')) {
    let j;
    try {
      j = JSON.parse(s);
    } catch {
      return '';
    }
    let lastEnd = 0;
    for (const ev of Array.isArray(j.events) ? j.events : []) {
      if (!Array.isArray(ev.segs)) continue;
      const t = noise(ev.segs.map((x) => (x && typeof x.utf8 === 'string' ? x.utf8 : '')).join(''));
      if (!t.trim()) continue;
      const start = Number(ev.tStartMs) || 0;
      pieces.push((pieces.length && start - lastEnd > 2000 ? '\n\n' : ' ') + t.replace(/\s+/g, ' ').trim());
      lastEnd = start + (Number(ev.dDurationMs) || 0);
    }
  } else {
    let lastEnd = 0;
    for (const m of s.matchAll(/<(?:text|p)\b([^>]*)>([\s\S]*?)<\/(?:text|p)>/gi)) {
      const start = Number((/(?:start|t)="([\d.]+)"/.exec(m[1]) || [])[1] || 0) * (/\bstart=/.test(m[1]) ? 1000 : 1);
      const dur = Number((/(?:dur|d)="([\d.]+)"/.exec(m[1]) || [])[1] || 0) * (/\bdur=/.test(m[1]) ? 1000 : 1);
      const t = noise(decodeEntities(decodeEntities(m[2].replace(/<[^>]+>/g, ''))).replace(/\s+/g, ' ').trim());
      if (!t) continue;
      pieces.push((pieces.length && start - lastEnd > 2000 ? '\n\n' : ' ') + t);
      lastEnd = start + dur;
    }
  }
  return pieces.join('').replace(/ {2,}/g, ' ').trim();
}
