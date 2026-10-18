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

/** JSON-значение (массив или объект), начинающееся с позиции start, — до парной закрывающей скобки (строки учитываются). */
function jsonAt(s, start, limit = 3_000_000) {
  const open = s[start];
  if (open !== '[' && open !== '{') return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length && i < start + limit; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '[' || ch === '{') depth++;
    else if ((ch === ']' || ch === '}') && --depth === 0) {
      try {
        return JSON.parse(s.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Дорожки из captionTracks (страница или ответ InnerTube): язык, адрес, автоматические («asr») или нет. */
function tracksOf(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter((t) => t && typeof t.baseUrl === 'string' && typeof t.languageCode === 'string')
    .map((t) => ({ lang: t.languageCode, url: t.baseUrl, auto: t.kind === 'asr' }));
}

/** Почему видео не отдаёт субтитры: по playabilityStatus плеера. */
function playability(p) {
  const st = p && p.playabilityStatus;
  if (!st || !st.status || st.status === 'OK') return 'ok';
  const why = `${st.reason || ''} ${JSON.stringify(st.errorScreen || '')}`;
  if (/not a bot|не робот|не бот/i.test(why)) return 'bot';
  if (st.status === 'LOGIN_REQUIRED') return /age|возраст|inappropriate/i.test(why) ? 'age' : /private|частн|доступ/i.test(why) ? 'private' : 'login';
  if (st.status === 'AGE_CHECK_REQUIRED' || st.status === 'CONTENT_CHECK_REQUIRED') return 'age';
  return 'unavailable';
}

/**
 * Страница видео (ytInitialPlayerResponse): название, дорожки субтитров, ключ InnerTube и состояние
 * (ok / consent — вместо видео страница согласия / bot / age / login / private / unavailable).
 */
export function youtubePage(html) {
  const s = String(html);
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
  const apiKey = (/"INNERTUBE_API_KEY":"([\w-]{20,60})"/.exec(s) || [])[1] || '';
  if (/consent\.youtube\.com|action="https:\/\/consent\.google/i.test(s) && !/captionTracks|playabilityStatus/.test(s)) return { title, tracks: [], apiKey, state: 'consent' };
  // Плеер целиком — если он есть; иначе ищем captionTracks в любом месте страницы.
  const pm = /ytInitialPlayerResponse\s*=\s*\{/.exec(s);
  const player = pm ? jsonAt(s, pm.index + pm[0].length - 1) : null;
  let tracks = player ? tracksOf(player.captions?.playerCaptionsTracklistRenderer?.captionTracks) : [];
  if (!tracks.length) {
    const at = s.indexOf('"captionTracks":');
    if (at >= 0) tracks = tracksOf(jsonAt(s, s.indexOf('[', at)));
  }
  const state = player ? playability(player) : /captionTracks/.test(s) ? 'ok' : /not a bot|не робот/i.test(s) ? 'bot' : 'ok';
  return { title: title || player?.videoDetails?.title || '', tracks, apiKey, state };
}

/** Совместимость: только название и дорожки. */
export function youtubeTracks(html) {
  const p = youtubePage(html);
  return { title: p.title, tracks: p.tracks };
}

/** Ответ InnerTube /youtubei/v1/player: дорожки, название и состояние. */
export function playerTracks(json) {
  let p;
  try {
    p = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return { title: '', tracks: [], state: 'unavailable' };
  }
  return { title: p?.videoDetails?.title || '', tracks: tracksOf(p?.captions?.playerCaptionsTracklistRenderer?.captionTracks), state: playability(p) };
}

/**
 * Порядок дорожек: сделанные людьми на нужном языке → сделанные людьми на любом → автоматические на нужном → автоматические на любом.
 * Внутри — по порядку языков в langs.
 */
export function rankTracks(tracks, langs = ['ru', 'en']) {
  const li = (t) => {
    const i = langs.findIndex((l) => t.lang === l || t.lang.startsWith(l + '-'));
    return i < 0 ? langs.length : i;
  };
  const score = (t) => (t.auto ? 2 : 0) * 100 + (li(t) < langs.length ? 0 : 100) + li(t);
  return [...tracks].sort((a, b) => score(a) - score(b));
}

/** Какую дорожку брать (первая по rankTracks). */
export function pickTrack(tracks, langs = ['ru', 'en']) {
  return rankTracks(tracks, langs)[0] ?? null;
}

/** Ключ InnerTube веб-плеера (публичный, есть в каждой странице YouTube) — если на странице его не нашли. */
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
/** Клиент Android: его ссылки на субтитры работают без PO-токена, который с 2025 года нужен веб-плееру (exp=xpe). */
const ANDROID_CLIENT = { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'ru', gl: 'RU' };
export const YT_ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip';

/** Адрес субтитров только на YouTube (защита от подмены ссылки в ответе). */
function captionUrl(raw, fmt) {
  let u;
  try {
    u = new URL(raw, 'https://www.youtube.com');
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !/^(www\.|m\.)?youtube\.com$/.test(u.hostname) || !u.pathname.startsWith('/api/timedtext')) return null;
  if (fmt) u.searchParams.set('fmt', fmt);
  else u.searchParams.delete('fmt');
  return u.toString();
}

const HOW = 'Открой видео на YouTube → «…» → «Показать расшифровку», скопируй текст и вставь его во вкладку «Текст».';
export const YT_WHY = {
  none: `У этого видео нет субтитров — ни сделанных автором, ни автоматических. ${HOW}`,
  empty: `YouTube показал, что субтитры есть, но не отдал их текст (так бывает у новых видео и при защите от программ). Попробуй позже или: ${HOW}`,
  age: `Видео с ограничением по возрасту: YouTube не отдаёт его субтитры без входа в аккаунт. ${HOW}`,
  login: `YouTube отдаёт это видео только после входа в аккаунт. ${HOW}`,
  private: `Видео закрыто (частное или только по ссылке для участников) — субтитры недоступны. ${HOW}`,
  unavailable: 'Видео недоступно: удалено, заблокировано в регионе или ссылка неверная. Проверь ссылку.',
  bot: `YouTube попросил подтвердить, что запрос не от программы, и не отдал субтитры. Попробуй позже или: ${HOW}`,
  consent: `Вместо видео YouTube показал страницу согласия с cookies. ${HOW}`
};

/**
 * Текст субтитров видео. get(url, accept, headers) и post(url, body, headers) → { text } — сеть вызывающего
 * (сервер или приложение) со своими пределами размера и времени. Порядок: дорожки со страницы, при пустом ответе — те же
 * в XML; если не вышло — дорожки клиента Android (InnerTube). Ошибка — { code: keyof YT_WHY, message }.
 */
export async function youtubeCaptions(id, get, post, langs = ['ru', 'en']) {
  if (!/^[\w-]{11}$/.test(String(id))) throw { code: 'unavailable', message: YT_WHY.unavailable };
  const page = await get(`https://www.youtube.com/watch?v=${id}&hl=ru&has_verified=1&bpctr=9999999999`, 'text/html', { cookie: 'CONSENT=YES+1; SOCS=CAI' });
  const info = youtubePage(page.text);
  let title = info.title;
  let state = info.state;
  let sawTracks = info.tracks.length > 0;
  const tryTracks = async (tracks) => {
    for (const t of rankTracks(tracks, langs).slice(0, 3)) {
      for (const fmt of ['json3', '']) {
        const url = captionUrl(t.url, fmt);
        if (!url) continue;
        let body = '';
        try {
          body = (await get(url, fmt ? 'application/json' : 'text/xml', {})).text;
        } catch {
          continue;
        }
        const text = captionsText(body);
        if (text) return { text, lang: t.lang, auto: t.auto };
      }
    }
    return null;
  };
  const first = info.tracks.length ? await tryTracks(info.tracks) : null;
  if (first) return { title, ...first };
  // Запасной путь: InnerTube, клиент Android.
  try {
    const res = await post(
      `https://www.youtube.com/youtubei/v1/player?key=${info.apiKey || INNERTUBE_KEY}&prettyPrint=false`,
      JSON.stringify({ context: { client: ANDROID_CLIENT }, videoId: id, contentCheckOk: true, racyCheckOk: true }),
      { 'content-type': 'application/json', 'user-agent': YT_ANDROID_UA, 'x-youtube-client-name': '3', 'x-youtube-client-version': ANDROID_CLIENT.clientVersion }
    );
    const p = playerTracks(res.text);
    title = title || p.title;
    if (p.tracks.length) sawTracks = true;
    if (state === 'ok' || state === 'consent') state = p.state;
    const second = p.tracks.length ? await tryTracks(p.tracks) : null;
    if (second) return { title, ...second };
  } catch {
    /* запасной путь не удался — причина ниже */
  }
  const code = state !== 'ok' ? state : sawTracks ? 'empty' : 'none';
  throw { code, message: YT_WHY[code] ?? YT_WHY.none };
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
