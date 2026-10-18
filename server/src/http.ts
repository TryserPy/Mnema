// Ответы, ошибки и сведения о запросе. Тела запросов и ответов в журнал Worker не пишутся.
import { ERRORS } from '../../shared/refrain/api.mjs';
import type { ApiError, ErrorCode } from '../../shared/refrain/api.mjs';
import type { Env } from './env';
import { tagged } from './crypto';

/** Тексты для ученика. Причины срабатывания защиты не раскрываются. */
const MESSAGES: Record<ErrorCode, string> = {
  limit_day: 'На сегодня бесплатные страницы закончились.',
  limit_month: 'Бесплатные страницы на этот месяц закончились.',
  paused: 'Refrain ИИ сейчас на паузе. Попробуй позже или выбери другой ИИ.',
  access_closed: 'Refrain ИИ сейчас в закрытом тесте. Если у тебя есть приглашение, введи его.',
  blocked: 'Доступ к Refrain ИИ для этого аккаунта приостановлен.',
  too_fast: 'Слишком часто. Подожди немного и попробуй снова.',
  bad_request: 'Сервер не понял запрос. Обнови Refrain.',
  payload_too_large: 'Фото или текст слишком большие.',
  upstream: 'ИИ сейчас не ответил. Страницы не списаны, попробуй ещё раз.',
  internal: 'Сбой на сервере. Попробуй позже.',
  token_expired: 'Вход устарел.',
  device_unknown: 'Устройство не опознано. Войди заново.',
  clock_skew: 'Часы на устройстве спешат или отстают. Включи автоматическое время в настройках.',
  session_revoked: 'Вход на этом устройстве закрыт. Войди заново.',
  device_limit: 'Слишком много устройств. Отвяжи одно из них.',
  pow_invalid: 'Проверка не прошла. Попробуй ещё раз.',
  email_rejected: 'Эта почта не подходит. Укажи обычную почту.',
  code_invalid: 'Неверный код.',
  code_locked: 'Слишком много попыток. Подожди и запроси новый код.',
  invite_invalid: 'Приглашение не подходит: неверное, истекло или уже использовано.'
};

export class ApiFail extends Error {
  constructor(
    public code: ErrorCode,
    public extra: Omit<ApiError['error'], 'code' | 'message'> = {}
  ) {
    super(code);
  }
}

export const fail = (code: ErrorCode, extra: Omit<ApiError['error'], 'code' | 'message'> = {}): never => {
  throw new ApiFail(code, extra);
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
}

export function errorResponse(e: ApiFail): Response {
  const body: ApiError = { ok: false, error: { code: e.code, message: MESSAGES[e.code], ...e.extra } };
  const h: Record<string, string> = {};
  if (e.extra.retryAfter) h['retry-after'] = String(Math.ceil(e.extra.retryAfter));
  return json(body, ERRORS[e.code], h);
}

/** Тело целиком, но не больше max байт: без content-length (chunked) читаем по кускам и обрываем на превышении, а не держим в памяти всё. */
async function readCapped(req: Request, max: number): Promise<Uint8Array> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      fail('payload_too_large');
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** Тело JSON не больше max байт. Не JSON или больше — ошибка контракта. */
export async function readJson(req: Request, max: number): Promise<{ raw: Uint8Array; body: unknown }> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > max) fail('payload_too_large');
  const raw = await readCapped(req, max);
  if (!raw.length) return { raw, body: {} };
  try {
    return { raw, body: JSON.parse(new TextDecoder().decode(raw)) };
  } catch {
    return fail('bad_request');
  }
}

export interface ClientInfo {
  ipHash: string;
  /** IPv4 — последний октет скрыт, IPv6 — первые 3 группы. */
  ipMask: string;
  asn: number | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  app: string | null;
  ua: string | null;
}

/** Первые 4 группы IPv6 (сеть /64), с раскрытым «::». */
export function ipv6Prefix64(ip: string): string {
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = ip.includes('::') ? (tail ? tail.split(':') : []) : [];
  const full = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return full.slice(0, 4).map((g) => (parseInt(g || '0', 16) || 0).toString(16)).join(':') + '::/64';
}

export async function clientInfo(req: Request, env: Env): Promise<ClientInfo> {
  const ip = req.headers.get('cf-connecting-ip') || '0.0.0.0';
  const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf;
  const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);
  return {
    // У IPv6 клиенту обычно выдают целую сеть /64: лимиты и блоки по одному адресу обходились бы сменой адреса.
    ipHash: await tagged(env.TOKEN_SECRET, 'ip', ip.includes(':') ? ipv6Prefix64(ip) : ip),
    ipMask: ip.includes(':') ? ip.split(':').slice(0, 3).join(':') + ':…' : ip.replace(/\.\d+$/, '.x'),
    asn: typeof cf?.asn === 'number' ? cf.asn : null,
    country: typeof cf?.country === 'string' ? cf.country : null,
    lat: num(cf?.latitude),
    lon: num(cf?.longitude),
    app: req.headers.get('x-refrain-app'),
    ua: req.headers.get('user-agent')
  };
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${(user || '?').slice(0, 1)}***@${domain || '?'}`;
}

export function corsHeaders(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin || origin !== env.ADMIN_ORIGIN) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, DELETE',
    'access-control-allow-headers': 'authorization, content-type, x-refrain-pin',
    'access-control-max-age': '600',
    vary: 'origin'
  };
}
