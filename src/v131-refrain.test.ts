// Refrain ИИ 1.31, клиент: вход, подпись как на сервере, обновление токена по одному, порядок поставщиков, кэш, фото, тексты ошибок.
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalString, ERRORS, H, powOk, type Quota } from '../shared/refrain/api.mjs';
import { createAiService } from '../shared/aiCore.mjs';
import { b64url, createRefrainClient, derToP1363, FALLBACK_CODES, fromB64, refrainMessage, sha256, sha256hex, solvePow, type RefrainSession, type RefrainSigner } from '../shared/refrainClient.mjs';
import { fitSide, quotaLines, refrainFields, scrubLine } from './refrain';
import { aiError } from './ai';
import { androidDeviceName } from './refrainBridge';

const quota = (used = 1): Quota => ({ day: { used, limit: 30 }, month: { used, limit: 400 }, resetsAt: '2026-10-16T00:00:00.000Z', group: 'student' });

async function webSigner(): Promise<RefrainSigner & { resets: number }> {
  let pair: CryptoKeyPair | null = null;
  const s = {
    resets: 0,
    secure: async () => true,
    async publicKey() {
      pair ??= (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
      return b64url(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
    },
    async sign(m: string) {
      return b64url(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair!.privateKey, new TextEncoder().encode(m))));
    },
    async reset() {
      pair = null;
      s.resets++;
    }
  };
  return s;
}

/** Заглушка сервера: проверяет PoW, подпись (как server/src/sign.ts), токены и ротацию токена обновления. */
function stubServer(o: { taskError?: string; difficulty?: number } = {}) {
  const devices = new Map<string, string>(); // id → SPKI
  let n = 0;
  let access = '';
  let refresh = '';
  const usedRefresh = new Set<string>();
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const counts = { refresh: 0, task: 0, reuse: 0, badSig: 0 };
  let taskError = o.taskError;
  let expireNext = false;
  const json = (status: number, body: unknown) => ({ status, text: JSON.stringify(body) });
  const err = (status: number, code: string, extra: object = {}) => json(status, { ok: false, error: { code, message: code, ...extra } });
  const tokens = () => {
    n++;
    access = `acc${n}`;
    refresh = `ref${n}`;
    return { accessToken: access, refreshToken: refresh, accessExpiresAt: new Date(Date.now() + 15 * 60000).toISOString() };
  };
  async function checkSig(method: string, url: URL, raw: string, h: Record<string, string>) {
    const spki = devices.get(h[H.device]);
    if (!spki) return false;
    const msg = canonicalString({ method, path: url.pathname + url.search, bodySha256Hex: sha256hex(raw), time: Number(h[H.time]), nonce: h[H.nonce], deviceId: h[H.device] });
    const key = await crypto.subtle.importKey('spki', fromB64(spki) as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64(h[H.signature]) as BufferSource, new TextEncoder().encode(msg));
  }
  const http = async (u: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const url = new URL(u);
    const raw = init.body ?? '';
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const h = init.headers ?? {};
    const path = url.pathname.replace(/^\/v1/, '');
    calls.push({ path, body });
    if (path === '/auth/pow') return json(200, { challenge: `ch${calls.length}`, difficulty: o.difficulty ?? 8, expiresAt: '' });
    if (path === '/auth/start' || path === '/bug') {
      const p = body.pow as { challenge: string; solution: string };
      if (!powOk(sha256(`${p.challenge}:${p.solution}`), o.difficulty ?? 8)) return err(400, 'pow_invalid');
      return json(200, path === '/bug' ? { ok: true, id: 7 } : { ok: true });
    }
    if (path === '/auth/verify') {
      if (body.code !== '123456') return err(400, 'code_invalid', { attemptsLeft: 4 });
      if (devices.size >= 1 && !body.replaceDevice) return err(409, 'device_limit', { devices: [...devices.keys()].map((id) => ({ id, name: 'Старый', platform: 'linux', lastSeen: '' })) });
      if (body.replaceDevice) devices.delete(String(body.replaceDevice));
      const id = `dev_${String(devices.size + n).padStart(16, 'x')}`;
      devices.set(id, (body.device as { publicKey: string }).publicKey);
      return json(200, { ok: true, deviceId: id, emailMasked: 'u***@example.com', quota: quota(0), ...tokens() });
    }
    if (!(await checkSig(init.method ?? 'POST', url, raw, h))) return (counts.badSig++, err(401, 'device_unknown'));
    if (path === '/auth/refresh') {
      counts.refresh++;
      await new Promise((r) => setTimeout(r, 5));
      if (usedRefresh.has(String(body.refreshToken)) || body.refreshToken !== refresh) return (counts.reuse++, err(401, 'session_revoked'));
      usedRefresh.add(refresh);
      return json(200, { ok: true, ...tokens() });
    }
    if (h[H.auth] !== `Bearer ${access}` || expireNext) {
      expireNext = false;
      return err(401, 'token_expired');
    }
    if (path === '/task') {
      counts.task++;
      if (taskError) return err(429, taskError, { quota: quota(30) });
      return json(200, { ok: true, text: `## Ответ ${counts.task}`, format: 'markdown', promptVersion: 1, charged: 1, quota: quota(counts.task) });
    }
    if (path === '/me') return json(200, { ok: true, emailMasked: 'u***@example.com', quota: quota(2), devices: [], access: 'open' });
    return err(400, 'bad_request');
  };
  return { http, calls, counts, devices, setTaskError: (c?: string) => (taskError = c), expire: () => (expireNext = true) };
}

function memStore() {
  let sess: RefrainSession | null = null;
  let cache: unknown = {};
  return { read: () => sess, write: (s: RefrainSession | null) => void (sess = s), readCache: () => cache, writeCache: (c: unknown) => void (cache = c), get: () => sess };
}

async function client(o: Parameters<typeof stubServer>[0] = {}) {
  const srv = stubServer(o);
  const store = memStore();
  const signer = await webSigner();
  const c = createRefrainClient({ http: srv.http, store, signer, platform: 'linux', appVersion: '1.31.0', base: 'https://refrain-ai.example.workers.dev', pause: async () => {} });
  return { c, srv, store, signer };
}

async function signedIn(o: Parameters<typeof stubServer>[0] = {}) {
  const t = await client(o);
  expect((await t.c.loginStart('u@example.com')).ok).toBe(true);
  const r = await t.c.loginVerify({ email: 'u@example.com', code: '123456' });
  expect(r.ok).toBe(true);
  return t;
}

describe('вход', () => {
  it('PoW решается и проверяется по правилу сервера', async () => {
    const sol = await solvePow('abc', 10, { pause: async () => {} });
    expect(powOk(sha256(`abc:${sol}`), 10)).toBe(true);
  });

  it('почта → код → токены; неверный код — понятный текст с попытками', async () => {
    const { c, store } = await client();
    expect((await c.loginStart('u@example.com')).ok).toBe(true);
    const bad = await c.loginVerify({ email: 'u@example.com', code: '000000' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('Осталось попыток: 4');
    const ok = await c.loginVerify({ email: 'u@example.com', code: '123456' });
    expect(ok.ok && ok.emailMasked).toBe('u***@example.com');
    expect(store.get()?.refreshToken).toBe('ref1');
    expect(c.signedIn()).toBe(true);
  });

  it('device_limit отдаёт список, повтор с replaceDevice отвязывает выбранное', async () => {
    const { srv } = await signedIn();
    const other = await client();
    const second = createRefrainClient({ http: srv.http, store: other.store, signer: other.signer, platform: 'android', appVersion: '1.31.0', base: 'https://refrain-ai.example.workers.dev', pause: async () => {} });
    const r = await second.loginVerify({ email: 'u@example.com', code: '123456' });
    expect(r.ok).toBe(false);
    if (r.ok || !r.devices) throw new Error('ждали device_limit');
    expect(r.code).toBe('device_limit');
    const again = await second.loginVerify({ email: 'u@example.com', code: '123456', replaceDevice: r.devices[0].id });
    expect(again.ok).toBe(true);
    expect(srv.devices.size).toBe(1);
  });

  it('без защищённого хранилища вход не начинается', async () => {
    const { c, signer, srv } = await client();
    signer.secure = async () => false;
    const r = await c.loginStart('u@example.com');
    expect(!r.ok && r.code).toBe('no_secure_storage');
    expect(srv.calls).toHaveLength(0);
  });
});

describe('подпись и токены', () => {
  it('подписанный запрос сервер принимает (canonicalString, P1363)', async () => {
    const { c, srv } = await signedIn();
    const r = await c.task({ task: 'explain', text: 'Что такое фотосинтез?' });
    expect(r.ok).toBe(true);
    expect(srv.counts.badSig).toBe(0);
  });

  it('token_expired → одно обновление и повтор запроса', async () => {
    const { c, srv } = await signedIn();
    srv.expire();
    const r = await c.me();
    expect(r.ok).toBe(true);
    expect(srv.counts.refresh).toBe(1);
  });

  it('параллельные запросы обновляют токен строго по одному: старый токен обновления не повторяется', async () => {
    const { c, srv } = await signedIn();
    srv.expire();
    const rs = await Promise.all([c.me(), c.me(), c.me()]);
    expect(srv.counts.reuse).toBe(0);
    expect(srv.counts.refresh).toBeLessThanOrEqual(2);
    expect(rs.filter((r) => r.ok).length).toBeGreaterThanOrEqual(2);
  });

  it('session_revoked стирает вход и ключ устройства', async () => {
    const { c, srv, store, signer } = await signedIn();
    srv.devices.clear();
    const r = await c.me();
    expect(!r.ok && r.code).toBe('device_unknown');
    expect(store.get()).toBeNull();
    expect(signer.resets).toBeGreaterThan(0);
  });
});

describe('кэш ответов', () => {
  it('повтор того же текста и задачи — из кэша, бесплатно', async () => {
    const { c, srv } = await signedIn();
    const a = await c.task({ task: 'explain', text: 'Закон Ома' });
    const b = await c.task({ task: 'explain', text: 'Закон Ома' });
    expect(srv.counts.task).toBe(1);
    expect(b.ok && b.cached && b.charged).toBe(0);
    expect(a.ok && b.ok && a.text === b.text).toBe(true);
    const d = await c.task({ task: 'explain', text: 'Закон Ома' }, 'проще');
    expect(d.ok && d.cached).toBeFalsy();
    expect(srv.counts.task).toBe(2);
  });

  it('выход чистит кэш', async () => {
    const { c, srv } = await signedIn();
    await c.task({ task: 'explain', text: 'Закон Ома' });
    await c.logout();
    await c.loginVerify({ email: 'u@example.com', code: '123456', replaceDevice: [...srv.devices.keys()][0] });
    await c.task({ task: 'explain', text: 'Закон Ома' });
    expect(srv.counts.task).toBe(2);
  });
});

describe('порядок поставщиков', () => {
  function service(refrain: { signedIn: () => boolean; task: (f: unknown) => Promise<unknown> } | null, order?: string[]) {
    let cfg: unknown = { provider: 'anthropic', keys: { anthropic: 'e:sk-test' }, order: order ?? ['refrain', 'key', 'local'] }; // порядок 1.31: Refrain ИИ первым (без order — миграция: свой ключ первым)
    const sent: string[] = [];
    const s = createAiService({
      http: async (url) => (sent.push(url), { status: 200, text: JSON.stringify({ content: [{ type: 'text', text: 'ответ ключа' }] }) }),
      store: { read: () => cfg, write: (c) => (cfg = c), encrypt: (x) => 'e:' + x, decrypt: (x) => (x ? x.slice(2) : ''), newId: () => 'p1' },
      refrain: refrain as never
    });
    return { s, sent };
  }
  const req = { text: 'вопрос', refrain: { task: 'explain', text: 'вопрос' } };

  it.each(FALLBACK_CODES)('%s → берётся свой ключ', async (code) => {
    const { s, sent } = service({ signedIn: () => true, task: async () => ({ ok: false, code, error: 'x', quota: quota(30) }) });
    const r = await s.ask(req);
    expect(r).toMatchObject({ ok: true, text: 'ответ ключа', via: 'key' });
    expect(sent).toHaveLength(1);
  });

  it('лимит без своего ключа — ошибка с кодом и остатком (экран лимита)', async () => {
    let cfg: unknown = { provider: 'anthropic' };
    const s = createAiService({
      http: async () => ({ status: 500, text: '' }),
      store: { read: () => cfg, write: (c) => (cfg = c), encrypt: (x) => x, decrypt: (x) => x, newId: () => 'p1' },
      refrain: { signedIn: () => true, task: async () => ({ ok: false, code: 'limit_day', error: 'x', quota: quota(30) }) } as never
    });
    const r = await s.ask(req);
    expect(r).toMatchObject({ ok: false, code: 'limit_day', quota: { day: { used: 30 } } });
  });

  it('Refrain ИИ не ответил, и свой ключ не принят — главная ошибка от Refrain ИИ, ошибка ключа — отдельно', async () => {
    let cfg: unknown = { provider: 'anthropic', keys: { anthropic: 'e:sk-old' }, order: ['refrain', 'key', 'local'] };
    const s = createAiService({
      http: async () => ({ status: 401, text: JSON.stringify({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }) }),
      store: { read: () => cfg, write: (c) => (cfg = c), encrypt: (x) => 'e:' + x, decrypt: (x) => (x ? x.slice(2) : ''), newId: () => 'p1' },
      refrain: { signedIn: () => true, task: async () => ({ ok: false, code: 'upstream', error: 'Сбой ИИ, попробуй ещё раз.' }) } as never
    });
    const r = await s.ask(req);
    expect(r).toMatchObject({ ok: false, error: 'Сбой ИИ, попробуй ещё раз.' });
    expect((r as { backup?: string }).backup).toMatch(/^401/);
    const text = aiError(r as never);
    expect(text.startsWith('Сбой ИИ, попробуй ещё раз.')).toBe(true);
    expect(text).toContain('Запасной ИИ (свой ключ) тоже не ответил: Сервис не принял ключ');
  });

  it('bad_request не уходит дальше: это ошибка приложения', async () => {
    const { s, sent } = service({ signedIn: () => true, task: async () => ({ ok: false, code: 'bad_request', error: 'x' }) });
    const r = await s.ask(req);
    expect(r.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('запрос без refrain (моды, проверки) идёт мимо Refrain ИИ', async () => {
    let asked = 0;
    const { s } = service({ signedIn: () => true, task: async () => (asked++, { ok: true, text: 'refrain' }) });
    const r = await s.ask({ text: 'вопрос мода' });
    expect(r).toMatchObject({ ok: true, via: 'key' });
    expect(asked).toBe(0);
  });

  it('ответ Refrain ИИ помечен via и несёт остаток; порядок настраивается', async () => {
    const ok = service({ signedIn: () => true, task: async () => ({ ok: true, text: 'refrain', quota: quota(3) }) });
    expect(await ok.s.ask(req)).toMatchObject({ ok: true, via: 'refrain', quota: { day: { used: 3 } } });
    const keyFirst = service({ signedIn: () => true, task: async () => ({ ok: true, text: 'refrain' }) }, ['key', 'refrain', 'local']);
    expect(await keyFirst.s.ask(req)).toMatchObject({ via: 'key' });
  });

  it('свой ключ первым не подошёл (401) — спрашивается Refrain ИИ; не вошёл — подсказка войти', async () => {
    let cfg: unknown = { provider: 'anthropic', keys: { anthropic: 'e:sk-bad' }, order: ['key', 'local', 'refrain'], models: { local: 'qwen' } };
    const sent: string[] = [];
    let signed = true;
    let asked = 0;
    const s = createAiService({
      http: async (url) => (sent.push(url), { status: 401, text: JSON.stringify({ error: { message: 'invalid x-api-key' } }) }),
      store: { read: () => cfg, write: (c) => (cfg = c), encrypt: (x) => 'e:' + x, decrypt: (x) => (x ? x.slice(2) : ''), newId: () => 'p1' },
      refrain: { signedIn: () => signed, task: async () => (asked++, { ok: true, text: 'refrain' }) } as never
    });
    expect(await s.ask(req)).toMatchObject({ ok: true, text: 'refrain', via: 'refrain' });
    expect(sent).toHaveLength(1); // модель на компьютере между ними не спрашивается
    signed = false;
    const r = await s.ask(req);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: '401: invalid x-api-key', signIn: true });
    expect(asked).toBe(1);
    // проверка ключа (без refrain) — по-прежнему только ключ
    signed = true;
    expect((await s.ask({ text: 'проверка' })).ok).toBe(false);
    expect(asked).toBe(1);
  });

  it('моды зовут aiAsk без поля refrain', () => {
    const src = readFileSync(join(__dirname, 'plugins', 'host.ts'), 'utf8');
    expect(src).not.toMatch(/refrain/);
  });
});

describe('поля задачи и фото', () => {
  it('фото больше 1600 px уменьшается с теми же пропорциями', () => {
    expect(fitSide(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(fitSide(1200, 3600)).toEqual({ w: 533, h: 1600 });
    expect(fitSide(800, 600)).toEqual({ w: 800, h: 600 });
  });

  it('задача вне рамок контракта идёт мимо Refrain ИИ', () => {
    expect(refrainFields({ task: 'textbook.summary' })).toBeUndefined(); // нужно фото
    expect(refrainFields({ task: 'explain', text: 'x'.repeat(3000) })).toBeUndefined();
    expect(refrainFields({ task: 'nope' as never, text: 'x' })).toBeUndefined();
    expect(refrainFields({ task: 'explain', text: 'Ом', subject: 'Физика\nи', page: 0 })).toEqual({ task: 'explain', text: 'Ом', subject: 'Физика и' });
  });
});

describe('тексты и журнал', () => {
  it('у каждого кода сервера есть понятный текст', () => {
    for (const code of Object.keys(ERRORS)) if (code !== 'internal' && code !== 'token_expired') expect(refrainMessage(code), code).not.toBe('');
    expect(refrainMessage('too_fast', { retryAfter: 30 })).toContain('30');
    expect(refrainMessage('blocked')).not.toMatch(/правил|детект/i);
  });

  it('журнал не уносит почты, пути и токены', () => {
    const s = scrubLine('ошибка у u@example.com в /home/user/x.json и C:\\Users\\a\\b токен ' + 'A'.repeat(40));
    expect(s).not.toContain('example.com');
    expect(s).not.toContain('/home/user');
    expect(s).not.toContain('Users');
    expect(s).not.toContain('A'.repeat(40));
  });

  it('счётчик «12 из 30 страниц»', () => {
    const q = quotaLines({ ...quota(12), month: { used: 140, limit: null } });
    expect(q.day).toBe('Сегодня 12 из 30 страниц');
    expect(q.monthShare).toBeNull();
  });

  it('имя Android-устройства из строки браузера', () => {
    expect(androidDeviceName('Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A) AppleWebKit')).toBe('Android · Pixel 7');
    expect(androidDeviceName('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit')).toBe('Android');
  });

  it('DER-подпись Android переводится в r‖s', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const nodeCrypto = await import('node:crypto');
    const der = nodeCrypto.sign('sha256', Buffer.from('m'), { key: nodeCrypto.KeyObject.from(pair.privateKey), dsaEncoding: 'der' });
    const p1363 = derToP1363(new Uint8Array(der))!;
    expect(p1363).toHaveLength(64);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, p1363 as BufferSource, new TextEncoder().encode('m'))).toBe(true);
  });
});

describe('Electron: секрет только в safeStorage', () => {
  const require = createRequire(import.meta.url);
  const { refrainParts } = require('../electron/ai.cjs') as { refrainParts: (o: object) => { store: ReturnType<typeof memStore>; signer: RefrainSigner } };
  const fakeSafe = (ok: boolean) => ({
    isEncryptionAvailable: () => ok,
    getSelectedStorageBackend: () => (ok ? 'gnome_libsecret' : 'basic_text'),
    encryptString: (s: string) => Buffer.from('ENC' + Buffer.from(s).toString('hex')),
    decryptString: (b: Buffer) => Buffer.from(b.toString().slice(3), 'hex').toString()
  });

  it('ключ и токены на диске только зашифрованными; подпись проверяется', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rf-'));
    const keyFile = join(dir, 'refrain.json');
    const { store, signer } = refrainParts({ safeStorage: fakeSafe(true), keyFile, cacheFile: join(dir, 'c.json'), platform: 'linux' });
    expect(await signer.secure()).toBe(true);
    const pub = await signer.publicKey();
    store.write({ deviceId: 'dev_x', accessToken: 'acc-secret', refreshToken: 'ref-secret', accessExpiresAt: 0 });
    const disk = readFileSync(keyFile, 'utf8');
    expect(disk).not.toContain('PRIVATE KEY');
    expect(disk).not.toContain('ref-secret');
    const sig = await signer.sign('строка');
    const key = await crypto.subtle.importKey('spki', fromB64(pub) as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64(sig) as BufferSource, new TextEncoder().encode('строка'))).toBe(true);
  });

  it('Linux без хранилища паролей: secure() → false, сохранить нельзя', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rf-'));
    const { store, signer } = refrainParts({ safeStorage: fakeSafe(false), keyFile: join(dir, 'k.json'), cacheFile: join(dir, 'c.json'), platform: 'linux' });
    expect(await signer.secure()).toBe(false);
    expect(() => store.write({ deviceId: 'd', accessToken: 'a', refreshToken: 'r', accessExpiresAt: 0 })).toThrow();
  });
});

describe('баг-репорт', () => {
  it('уходит без входа, с задачкой; ответ — номер', async () => {
    const { c, srv } = await client();
    const r = await c.bug({ category: 'ai', text: 'не работает', app: { version: '1.31.0', platform: 'linux', os: 'linux' } });
    expect(r).toMatchObject({ ok: true, id: 7 });
    expect(srv.calls.map((x) => x.path)).toEqual(['/auth/pow', '/bug']);
  });
});

describe('задача file.split («Из тетради → Файл → Разбить по темам с ИИ»)', () => {
  it('идёт в Refrain ИИ только с текстом, промт — начала абзацев без фото', async () => {
    const { lunaSystem, lunaUser } = await import('../shared/prompts/luna');
    expect(refrainFields({ task: 'file.split', text: '0: § 12. Фотосинтез\n1: Растения…' })).toEqual({ task: 'file.split', text: '0: § 12. Фотосинтез\n1: Растения…' });
    expect(refrainFields({ task: 'file.split' })).toBeUndefined();
    expect(refrainFields({ task: 'file.split', text: 'x'.repeat(12001) })).toBeUndefined();
    expect(lunaSystem('file.split')).toMatch(/N \| Название темы/);
    const u = lunaUser('file.split', { text: '0: абзац' });
    expect(u).toContain('Начала абзацев');
    expect(u).not.toContain('Фото');
  });
});
