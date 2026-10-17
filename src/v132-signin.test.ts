// 1.32, вход в Refrain ИИ и запасной ключ: часы устройства, потерянный ответ на обновление, ключ «Claude», которого нет.
import { describe, expect, it } from 'vitest';
import { createAiService } from '../shared/aiCore.mjs';
import { b64url, createRefrainClient, FALLBACK_CODES, refrainMessage, type RefrainSession } from '../shared/refrainClient.mjs';
import { aiError } from './ai';
import { seenText } from './components/RefrainSettings';

function service(stored: Record<string, unknown>, refrainSignedIn = false, task?: () => Promise<unknown>) {
  let cfg: unknown = stored;
  const sent: string[] = [];
  const refrain = { signedIn: () => refrainSignedIn, task: task ?? (async () => ({ ok: true, text: 'refrain' })) };
  const s = createAiService({
    http: async (url) => {
      sent.push(url);
      return { status: 200, text: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gemini' }] } }], choices: [{ message: { content: 'свой' } }] }) };
    },
    store: { read: () => cfg, write: (c) => (cfg = c), encrypt: (x) => 'e:' + x, decrypt: (x) => (x ? x.slice(2) : ''), newId: () => 'p1' },
    refrain: refrain as never
  });
  return { s, sent };
}

describe('запасной ключ', () => {
  it('основной — Claude без ключа, а ключ Gemini сохранён: отвечает Gemini, а не «Не указан ключ для Claude»', async () => {
    const { s, sent } = service({ provider: 'anthropic', keys: { gemini: 'e:AIza' }, order: ['refrain', 'key', 'local'] });
    const r = await s.ask({ text: 'x', image: { mime: 'image/png', data: 'AA' }, refrain: { task: 'textbook.verbatim', image: { mime: 'image/png', data: 'AA' } } });
    expect(r).toMatchObject({ ok: true, text: 'gemini' });
    expect(sent[0]).toContain('generativelanguage');
  });

  it('ни входа, ни ключа: одна понятная ошибка и флаг «войти» — без инструкций «Настройки → …»', async () => {
    const { s } = service({ provider: 'anthropic', order: ['refrain', 'key', 'local'] });
    const r = await s.ask({ text: 'x', refrain: { task: 'explain', text: 'x' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r).toMatchObject({ signIn: true, noKey: true });
    expect(r.error).not.toMatch(/Claude|Настройки →/);
    expect(aiError(r as never)).toBe('Нужен вход в Refrain ИИ или свой ключ ИИ.');
  });

  it('вход в Refrain ИИ закончился — запрос уходит своему ключу', async () => {
    expect(FALLBACK_CODES).toContain('session_revoked');
    const { s } = service({ provider: 'gemini', keys: { gemini: 'e:AIza' }, order: ['refrain', 'key', 'local'] }, true, async () => ({ ok: false, code: 'session_revoked', error: 'вход закончился' }));
    expect(await s.ask({ text: 'x', refrain: { task: 'explain', text: 'x' } })).toMatchObject({ ok: true, text: 'gemini' });
  });

  it('тексты входа не отправляют в настройки, а говорят, что делать', () => {
    for (const c of ['device_unknown', 'session_revoked', 'signed_out', 'access_closed', 'clock_skew']) expect(refrainMessage(c)).not.toMatch(/Настройки →/);
    expect(refrainMessage('clock_skew')).toMatch(/автоматическое время/);
  });

  it('«последняя активность» по-человечески', () => {
    const now = Date.parse('2026-10-17T12:00:00');
    expect(seenText('2026-10-17T08:00:00', now)).toBe('сегодня');
    expect(seenText('2026-10-16T23:00:00', now)).toBe('вчера');
    expect(seenText('2026-10-14T10:00:00', now)).toBe('3 дня назад');
    expect(seenText('2026-10-11T10:00:00', now)).toBe('6 дней назад');
  });
});

/** Сервер-заглушка: часы сервера впереди на 10 минут; первый ответ на обновление «теряется». */
function skewedServer() {
  const SERVER_AHEAD = 10 * 60000;
  const st = { refreshCalls: 0, lostOnce: true, times: [] as number[], refreshTokens: [] as string[] };
  const json = (status: number, body: unknown) => ({ status, text: JSON.stringify(body) });
  const http = async (u: string, init: { headers?: Record<string, string>; body?: string }) => {
    const path = new URL(u).pathname.replace(/^\/v1/, '');
    const h = init.headers ?? {};
    const serverTime = Date.now() + SERVER_AHEAD;
    const t = Number(h['x-refrain-time']);
    st.times.push(t);
    if (Math.abs(serverTime - t) > 120000) return json(401, { ok: false, error: { code: 'clock_skew', message: 'x', serverTime } });
    if (path === '/auth/refresh') {
      st.refreshCalls++;
      st.refreshTokens.push(JSON.parse(init.body!).refreshToken);
      if (st.lostOnce) {
        st.lostOnce = false;
        return { status: 0, text: '', error: 'timeout' };
      }
      return json(200, { ok: true, accessToken: 'a2', refreshToken: 'r2', accessExpiresAt: new Date(serverTime + 15 * 60000).toISOString() });
    }
    return json(200, { ok: true, emailMasked: 'u***@example.com', quota: null, devices: [], access: 'open' });
  };
  return { http, st, SERVER_AHEAD };
}

describe('сессия Refrain ИИ не теряется', () => {
  it('часы неточные: приложение берёт время сервера и повторяет; ответ на обновление потерялся — повтор тем же токеном', async () => {
    const srv = skewedServer();
    let sess = { deviceId: 'dev_xxxxxxxxxxxxxxxx', accessToken: 'a1', refreshToken: 'r1', accessExpiresAt: 0, emailMasked: "u***", quota: null } as RefrainSession | null;
    const store = { read: () => sess, write: (s: RefrainSession | null) => void (sess = s), readCache: () => ({}), writeCache: () => {} };
    let resets = 0;
    const signer = { secure: async () => true, publicKey: async () => 'pk', sign: async () => b64url(new Uint8Array(64)), reset: async () => void resets++ };
    const c = createRefrainClient({ http: srv.http, store, signer, platform: 'android', appVersion: '1.32.0', base: 'https://x.example' });
    const r = await c.me();
    expect(r.ok).toBe(true);
    expect(resets).toBe(0);
    expect(sess).not.toBeNull();
    expect((sess as RefrainSession | null)?.refreshToken).toBe('r2');
    expect(srv.st.refreshTokens).toEqual(['r1', 'r1']); // повтор тем же токеном — сервер примет его в окне REFRESH_RETRY_MS
    expect(Math.abs(srv.st.times.at(-1)! - (Date.now() + srv.SERVER_AHEAD))).toBeLessThan(5000);
  });
});
