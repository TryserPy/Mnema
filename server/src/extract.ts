// POST /v1/extract (1.32, N2): текст статьи или субтитры YouTube по ссылке — для «Карточки из ссылки, видео или книги».
// ИИ здесь не вызывается и страницы не списываются; сам текст нигде не сохраняется. Защита от SSRF — shared/urlGuard.mjs:
// только http(s) на стандартных портах, без внутренних адресов, каждый переход (redirect) проверяется заново, размер и время
// ограничены. Fetch из Workers и так не видит внутренних сетей Cloudflare, но проверка не полагается на это.
import { EXTRACT_LIMITS, type ExtractResponse } from '../../shared/refrain/api.mjs';
import { articleText, captionsText, pickTrack, youtubeTracks } from '../../shared/readable.mjs';
import { checkUrl, youtubeId } from '../../shared/urlGuard.mjs';
import { bump } from './auth';
import { outbound, type Env } from './env';
import { fail, readJson, type ClientInfo } from './http';
import { verifySigned } from './sign';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 RefrainBot/1.32';

/** Ошибка со ссылкой: ученику — что случилось и что сделать. */
const bad = (detail: string): never => fail('bad_request', { detail });
const down = (detail: string): never => fail('upstream', { detail });

/** Скачать с проверкой каждого перехода и пределом размера. Возвращает текст и адрес после переходов. */
export async function safeFetch(env: Env, start: string, accept: string, extra: Record<string, string> = {}): Promise<{ text: string; url: string; type: string }> {
  let url = start;
  for (let hop = 0; hop <= EXTRACT_LIMITS.redirects; hop++) {
    const c = checkUrl(url, EXTRACT_LIMITS.urlChars);
    if (!c.ok) bad(c.why);
    url = (c as { url: string }).url;
    let res: Response;
    try {
      res = await outbound(env)(url, { redirect: 'manual', headers: { 'user-agent': UA, accept, 'accept-language': 'ru,en;q=0.8', ...extra }, signal: AbortSignal.timeout(EXTRACT_LIMITS.timeoutMs) });
    } catch (e) {
      down(e instanceof Error && e.name === 'TimeoutError' ? 'Сайт долго не отвечает. Попробуй позже или вставь текст статьи сам.' : 'Не получилось открыть сайт. Проверь ссылку или вставь текст статьи сам.');
    }
    const r = res!;
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (!loc) down('Сайт перенаправляет непонятно куда. Вставь текст статьи сам.');
      url = new URL(loc!, url).toString();
      continue;
    }
    if (r.status === 401 || r.status === 403 || r.status === 451) down('Сайт не пускает чужие программы (нужен вход или подписка). Открой статью сам, скопируй текст и вставь его.');
    if (r.status === 404 || r.status === 410) bad('Страница не найдена. Проверь ссылку.');
    if (!r.ok) down(`Сайт ответил ошибкой ${r.status}. Попробуй позже или вставь текст сам.`);
    const type = (r.headers.get('content-type') || '').toLowerCase();
    if (type && !/text\/|html|xml|json/.test(type)) bad('По ссылке не страница с текстом (картинка, видео или файл). Для книги выбери файл EPUB.');
    const declared = Number(r.headers.get('content-length') || 0);
    if (declared > EXTRACT_LIMITS.fetchBytes * 4) bad('Страница слишком большая.');
    return { text: await readCapped(r, EXTRACT_LIMITS.fetchBytes), url, type };
  }
  return down('Слишком много перенаправлений. Открой статью сам и вставь её текст.');
}

/** Прочитать тело не больше max байт: дальше обрываем (длинную страницу не тащим целиком). */
async function readCapped(r: Response, max: number): Promise<string> {
  if (!r.body) return '';
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total >= max) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const all = new Uint8Array(Math.min(total, max));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.min(c.length, all.length - at));
    all.set(part, at);
    at += part.length;
    if (at >= all.length) break;
  }
  return new TextDecoder().decode(all);
}

/** Субтитры видео YouTube: русские, иначе английские, иначе любые; сделанные людьми лучше автоматических. */
export async function youtubeText(env: Env, id: string): Promise<Omit<ExtractResponse, 'ok'>> {
  // CONSENT — чтобы из Европы не открывалась страница согласия вместо видео.
  const page = await safeFetch(env, `https://www.youtube.com/watch?v=${id}&hl=ru`, 'text/html', { cookie: 'CONSENT=YES+1' });
  const { title, tracks } = youtubeTracks(page.text);
  const track = pickTrack(tracks);
  if (!track) bad('У этого видео нет субтитров. Открой видео на YouTube → «…» → «Показать расшифровку», скопируй текст и вставь его.');
  const u = new URL(track!.url, 'https://www.youtube.com');
  if (!/(^|\.)youtube\.com$/.test(u.hostname)) down('YouTube вернул странную ссылку на субтитры. Вставь расшифровку сам.');
  u.searchParams.set('fmt', 'json3');
  const cap = await safeFetch(env, u.toString(), 'application/json');
  const text = captionsText(cap.text);
  if (!text) down('YouTube не отдал субтитры. Открой видео → «…» → «Показать расшифровку», скопируй текст и вставь его.');
  const cut = text.length > EXTRACT_LIMITS.textChars;
  return { kind: 'youtube', title: title || 'Видео YouTube', text: cut ? text.slice(0, EXTRACT_LIMITS.textChars) : text, url: `https://www.youtube.com/watch?v=${id}`, cut };
}

export async function handleExtract(req: Request, env: Env, info: ClientInfo): Promise<Response> {
  const { raw, body } = await readJson(req, 4096);
  const s = await verifySigned(req, env, raw, info, 'access');
  if (s.group === 'blocked' || (s.account.blocked_until ?? 0) > Date.now()) fail('blocked', { until: null });
  const b = body as { url?: unknown };
  if (!b || typeof b !== 'object' || Object.keys(b).some((k) => k !== 'url') || typeof b.url !== 'string') fail('bad_request');
  const c = checkUrl(b.url, EXTRACT_LIMITS.urlChars);
  if (!c.ok) bad(c.why);
  // Пределы на аккаунт: это не ИИ, но скачивание чужих страниц тоже работа сервера.
  const minute = Math.floor(Date.now() / 60000);
  if ((await bump(env, `extract:m:${s.account.id}:${minute}`, 60000)) > EXTRACT_LIMITS.perMinute) fail('too_fast', { retryAfter: 60 });
  if ((await bump(env, `extract:d:${s.account.id}:${Math.floor(minute / 1440)}`, 86400000)) > EXTRACT_LIMITS.perDay) fail('too_fast', { retryAfter: 3600, detail: 'На сегодня ссылок слишком много. Завтра можно снова — или вставь текст сам.' });
  const url = (c as { url: string }).url;
  const yt = youtubeId(url);
  if (yt) return Response.json({ ok: true, ...(await youtubeText(env, yt)) } satisfies ExtractResponse);
  const page = await safeFetch(env, url, 'text/html,application/xhtml+xml,text/plain;q=0.8');
  const plain = page.type.includes('text/plain');
  const a = plain ? { title: '', text: page.text.slice(0, EXTRACT_LIMITS.textChars), cut: page.text.length > EXTRACT_LIMITS.textChars } : articleText(page.text, EXTRACT_LIMITS.textChars);
  if (a.text.length < 200) bad('На странице почти нет текста (возможно, он появляется только в браузере). Открой статью, скопируй текст и вставь его.');
  const out: ExtractResponse = { ok: true, kind: 'article', title: a.title || new URL(page.url).hostname, text: a.text, url: page.url, cut: a.cut };
  return Response.json(out);
}
