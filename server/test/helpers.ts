// Обвязка тестов: заглушки внешних сервисов (OpenAI, Telegram, Brevo, GitHub), часы, вход и подписанные запросы.
// Секреты в тестах ненастоящие (vitest.config.ts).
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/index';
import { canonicalString, powOk } from '../../shared/refrain/api.mjs';
import type { Env } from '../src/env';

const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256hex = async (d: Uint8Array | string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof d === 'string' ? enc.encode(d) : d))].map((x) => x.toString(16).padStart(2, '0')).join('');

export interface Call {
  url: string;
  body: string;
}

export interface Where {
  ip?: string;
  asn?: number;
  lat?: number;
  lon?: number;
  country?: string;
  app?: string | null;
}

/** Ответ OpenAI по умолчанию: короткий конспект и usage как у типичной страницы. */
export function openAiOk(text = '## Тема\n*Суть.*\n- пункт', usage: Record<string, unknown> = { prompt_tokens: 2000, completion_tokens: 900, prompt_tokens_details: { cached_tokens: 0 } }) {
  return new Response(JSON.stringify({ model: 'gpt-6-luna-2026-09-22', choices: [{ message: { content: text }, finish_reason: 'stop' }], usage }), { headers: { 'content-type': 'application/json' } });
}

export class Harness {
  calls: Call[] = [];
  clock = Date.now();
  telegramUp = true;
  openai: (body: Record<string, unknown>) => Response | Promise<Response> = () => openAiOk();
  usageApi: () => Response = () => new Response(JSON.stringify({ data: [], has_more: false }), { headers: { 'content-type': 'application/json' } });
  env: Env;
  private tgId = 1;

  constructor() {
    this.env = {
      ...(env as unknown as Env),
      TEST_NOW: () => this.clock,
      TEST_FETCH: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const body = typeof init?.body === 'string' ? init.body : init?.body instanceof FormData ? '[form]' : '';
        this.calls.push({ url, body });
        if (url.startsWith('https://api.telegram.org/')) {
          if (!this.telegramUp) return new Response('bad gateway', { status: 502 });
          return Response.json({ ok: true, result: { message_id: this.tgId++ } });
        }
        if (url.startsWith('https://api.brevo.com/')) return Response.json({ messageId: 'x' }, { status: 201 });
        if (url.startsWith('https://api.resend.com/')) return Response.json({ id: 'x' });
        if (url.startsWith('https://polza.ai/api/v1/chat/completions')) return this.openai(JSON.parse(body));
        if (url.startsWith('https://api.openai.com/v1/organization/usage/')) return this.usageApi();
        if (url.startsWith('https://api.github.com/')) return Response.json({ number: 42 }, { status: 201 });
        return new Response('no route in test', { status: 599 });
      }) as typeof fetch
    };
  }

  /** Все сообщения в Telegram (текст и признак «тихо»). */
  telegram(): { text: string; silent: boolean }[] {
    return this.calls.filter((c) => c.url.includes('/sendMessage')).map((c) => JSON.parse(c.body)).map((b) => ({ text: b.text, silent: b.disable_notification }));
  }
  mails(): { to: string; subject: string; text: string }[] {
    return this.calls
      .filter((c) => c.url.startsWith('https://api.brevo.com/') || c.url.startsWith('https://api.resend.com/'))
      .map((c) => JSON.parse(c.body))
      .map((b) => (b.sender ? { to: b.to[0].email, subject: b.subject, text: b.textContent } : { to: b.to[0], subject: b.subject, text: b.text }));
  }

  async fetch(req: Request): Promise<Response> {
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, this.env, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }

  async cron(): Promise<void> {
    const ctx = createExecutionContext();
    await worker.scheduled({} as ScheduledController, this.env, ctx);
    await waitOnExecutionContext(ctx);
  }

  request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, where: Where = {}): Request {
    const h: Record<string, string> = { 'content-type': 'application/json', 'cf-connecting-ip': where.ip ?? '203.0.113.10', ...headers };
    if (where.app !== null) h['x-refrain-app'] = where.app ?? 'refrain/1.31.0 (windows)';
    return new Request(`https://refrain-ai.test${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      cf: { asn: where.asn ?? 64500, country: where.country ?? 'RU', latitude: String(where.lat ?? 55.75), longitude: String(where.lon ?? 37.62) }
    } as RequestInit);
  }

  async json(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, where: Where = {}): Promise<{ status: number; body: any; raw: string }> {
    const res = await this.fetch(this.request(method, path, body, headers, where));
    const raw = await res.text();
    let parsed: any = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed, raw };
  }

  async solvePow(purpose: 'login' | 'bug' = 'login', where: Where = {}): Promise<{ challenge: string; solution: string }> {
    const c = (await this.json('POST', '/v1/auth/pow', { purpose }, {}, where)).body;
    for (let i = 0; ; i++) {
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`${c.challenge}:${i}`)));
      if (powOk(h, c.difficulty)) return { challenge: c.challenge, solution: String(i) };
    }
  }

  async codeFor(email: string, where: Where = {}): Promise<string> {
    const r = await this.json('POST', '/v1/auth/start', { email, pow: await this.solvePow('login', where) }, {}, where);
    if (r.status !== 200) throw new Error('start failed: ' + r.raw);
    const m = [...this.mails()].reverse().find((x) => x.to === email);
    return /(\d{6})/.exec(m!.subject)![1];
  }

  async login(email: string, where: Where = {}, extra: Record<string, unknown> = {}): Promise<Device> {
    const code = await this.codeFor(email, where);
    const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const spki = b64url((await crypto.subtle.exportKey('spki', keys.publicKey)) as ArrayBuffer);
    const r = await this.json('POST', '/v1/auth/verify', { email, code, device: { publicKey: spki, name: 'Тестовый ПК', platform: 'windows' }, ...extra }, {}, where);
    if (r.status !== 200) throw new Error('verify failed: ' + r.raw);
    return new Device(this, r.body.deviceId, keys.privateKey, r.body.accessToken, r.body.refreshToken, where);
  }

  /** Вход в панель из мини-приложения: initData, подписанный токеном бота (как это делает Telegram). */
  async admin(): Promise<(method: string, path: string, body?: unknown, pin?: string) => Promise<{ status: number; body: any; raw: string }>> {
    const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
    const key = (k: string | ArrayBuffer) => crypto.subtle.importKey('raw', typeof k === 'string' ? enc.encode(k) : k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const params = new URLSearchParams({ auth_date: String(Math.floor(this.clock / 1000)), query_id: 'AAH' + Math.random().toString(36).slice(2), user: JSON.stringify({ id: 777, first_name: 'Owner' }) });
    const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = await crypto.subtle.sign('HMAC', await key('WebAppData'), enc.encode(this.env.TELEGRAM_BOT_TOKEN!));
    params.set('hash', hex(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(check))));
    const r = await this.json('POST', '/v1/admin/login/telegram', { initData: params.toString() });
    if (r.status !== 200) throw new Error('admin login failed: ' + r.raw);
    const token = r.body.token as string;
    return (method, path, body, pin) => this.json(method, `/v1/admin/${path}`, body, { authorization: `Bearer ${token}`, ...(pin ? { 'x-refrain-pin': pin } : {}) });
  }

  /** Режим, группы и т. п. прямо в настройки (как из панели). */
  async setting(k: string, v: unknown): Promise<void> {
    await this.env.DB.prepare('INSERT INTO settings (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, JSON.stringify(v)).run();
  }
}

export class Device {
  constructor(
    public h: Harness,
    public id: string,
    public key: CryptoKey,
    public access: string,
    public refresh: string,
    public where: Where
  ) {}

  async signedRequest(method: string, path: string, body?: unknown, o: { time?: number; nonce?: string; token?: string; deviceId?: string; key?: CryptoKey; where?: Where } = {}): Promise<Request> {
    const raw = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    const time = o.time ?? this.h.clock;
    const nonce = o.nonce ?? b64url(crypto.getRandomValues(new Uint8Array(16)));
    const deviceId = o.deviceId ?? this.id;
    const msg = canonicalString({ method, path, bodySha256Hex: await sha256hex(raw), time, nonce, deviceId });
    const sig = b64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, o.key ?? this.key, enc.encode(msg)));
    const headers: Record<string, string> = { 'x-refrain-device': deviceId, 'x-refrain-time': String(time), 'x-refrain-nonce': nonce, 'x-refrain-signature': sig };
    if (o.token !== '') headers.authorization = `Bearer ${o.token ?? this.access}`;
    return this.h.request(method, path, body === undefined ? undefined : raw, headers, o.where ?? this.where);
  }

  async call(method: string, path: string, body?: unknown, o: Parameters<Device['signedRequest']>[3] = {}): Promise<{ status: number; body: any; raw: string }> {
    const res = await this.h.fetch(await this.signedRequest(method, path, body, o));
    const raw = await res.text();
    return { status: res.status, body: raw ? JSON.parse(raw) : null, raw };
  }

  /** Обновить токены (как приложение, когда токен доступа истёк). */
  async renew(): Promise<void> {
    const r = await this.call('POST', '/v1/auth/refresh', { refreshToken: this.refresh }, { token: '' });
    if (r.status !== 200) throw new Error('refresh failed: ' + r.raw);
    this.access = r.body.accessToken;
    this.refresh = r.body.refreshToken;
  }

  task(body: Record<string, unknown> = summaryTask(), o: Parameters<Device['signedRequest']>[3] = {}) {
    return this.call('POST', '/v1/task', body, o);
  }
}

/** Заголовок PNG нужного размера (сервер читает размер из заголовка; OpenAI в тестах — заглушка). */
export function fakePng(w = 1200, h = 1600, extra = 64): string {
  const b = new Uint8Array(33 + extra);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export function summaryTask(extra: Record<string, unknown> = {}) {
  return { task: 'textbook.summary', image: { mime: 'image/png', data: fakePng() }, subject: 'Биология', topic: 'Животные', page: 2, ...extra };
}

export async function count(h: Harness, sql: string, ...args: unknown[]): Promise<number> {
  const r = await h.env.DB.prepare(sql).bind(...args).first<{ n: number }>();
  return Number(r?.n ?? 0);
}
