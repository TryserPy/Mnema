// Вход: одинаковый ответ, PoW, коды, лимиты, устройства, ротация токенов.
import { describe, expect, it } from 'vitest';
import { Harness, count } from './helpers';

describe('вход по почте', () => {
  it('ответ одинаковый для новой и существующей почты; код хранится только хэшем', async () => {
    const h = new Harness();
    await h.login('anya@example.com');
    const a = await h.json('POST', '/v1/auth/start', { email: 'anya@example.com', pow: await h.solvePow() });
    const b = await h.json('POST', '/v1/auth/start', { email: 'nobody@example.com', pow: await h.solvePow() });
    expect(a.status).toBe(200);
    expect(a.raw).toBe(b.raw);
    const code = /(\d{6})/.exec(h.mails().at(-1)!.subject)![1];
    const row = await h.env.DB.prepare('SELECT code_hash FROM login_codes WHERE email = ?1').bind('nobody@example.com').first<{ code_hash: string }>();
    expect(row!.code_hash).not.toContain(code);
  });

  it('одноразовая почта и неверный PoW отклоняются, решение PoW нельзя использовать дважды', async () => {
    const h = new Harness();
    expect((await h.json('POST', '/v1/auth/start', { email: 'x@mailinator.com', pow: await h.solvePow() })).body.error.code).toBe('email_rejected');
    expect((await h.json('POST', '/v1/auth/start', { email: 'x@example.com', pow: { challenge: 'login.1.a.b', solution: '1' } })).body.error.code).toBe('pow_invalid');
    const pow = await h.solvePow();
    expect((await h.json('POST', '/v1/auth/start', { email: 'x@example.com', pow })).status).toBe(200);
    expect((await h.json('POST', '/v1/auth/start', { email: 'y@example.com', pow })).body.error.code).toBe('pow_invalid');
  });

  it('5 неверных кодов — пауза 15 минут, после неё снова можно', async () => {
    const h = new Harness();
    const code = await h.codeFor('kid@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) expect((await h.json('POST', '/v1/auth/verify', { email: 'kid@example.com', code: wrong })).body.error).toMatchObject({ code: 'code_invalid', attemptsLeft: 4 - i });
    expect((await h.json('POST', '/v1/auth/verify', { email: 'kid@example.com', code: wrong })).body.error.code).toBe('code_locked');
    expect((await h.json('POST', '/v1/auth/verify', { email: 'kid@example.com', code })).body.error.code).toBe('code_locked');
    h.clock += 16 * 60000;
    await h.login('kid@example.com');
  });

  it('не больше 3 кодов в час на почту', async () => {
    const h = new Harness();
    for (let i = 0; i < 3; i++) await h.codeFor('many@example.com');
    expect((await h.json('POST', '/v1/auth/start', { email: 'many@example.com', pow: await h.solvePow() })).body.error.code).toBe('too_fast');
  });

  it('устройств не больше лимита группы; replaceDevice отвязывает выбранное', async () => {
    const h = new Harness();
    h.clock -= 4 * 86400000; // не новичок: у ученика 3 устройства
    const d1 = await h.login('dev@example.com');
    h.clock += 4 * 86400000;
    await h.login('dev@example.com');
    await h.login('dev@example.com');
    const code = await h.codeFor('dev@example.com');
    const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const spki = btoa(String.fromCharCode(...new Uint8Array((await crypto.subtle.exportKey('spki', keys.publicKey)) as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const device = { publicKey: spki, name: 'Четвёртый', platform: 'linux' };
    const r = await h.json('POST', '/v1/auth/verify', { email: 'dev@example.com', code, device });
    expect(r.body.error.code).toBe('device_limit');
    expect(r.body.error.devices).toHaveLength(3);
    const ok = await h.json('POST', '/v1/auth/verify', { email: 'dev@example.com', code, device, replaceDevice: d1.id });
    expect(ok.status).toBe(200);
    expect((await d1.call('GET', '/v1/me')).body.error.code).toBe('device_unknown');
  });
});

describe('токены', () => {
  it('ротация: новый токен работает, старый токен обновления — кража: сессии закрыты, устройство отвязано, тревога', async () => {
    const h = new Harness();
    const d = await h.login('rot@example.com');
    const other = await h.login('rot@example.com');
    const old = d.refresh;
    const r1 = await d.call('POST', '/v1/auth/refresh', { refreshToken: old }, { token: '' });
    expect(r1.status).toBe(200);
    d.access = r1.body.accessToken;
    expect((await d.call('GET', '/v1/me')).status).toBe(200);
    const reuse = await d.call('POST', '/v1/auth/refresh', { refreshToken: old }, { token: '' });
    expect(reuse.body.error.code).toBe('session_revoked');
    // Устройство, с которого пришёл повтор, отвязано; остальные сессии аккаунта закрыты.
    expect((await d.call('GET', '/v1/me')).body.error.code).toBe('device_unknown');
    expect((await other.call('GET', '/v1/me')).body.error.code).toBe('session_revoked');
    expect(await count(h, "SELECT COUNT(*) AS n FROM journal WHERE action = 'guard.level2'")).toBe(1);
    expect(h.telegram().some((m) => m.text.includes('refresh_reuse'))).toBe(true);
  });

  it('истёкший токен доступа — token_expired', async () => {
    const h = new Harness();
    const d = await h.login('exp@example.com');
    h.clock += 16 * 60000;
    expect((await d.call('GET', '/v1/me')).body.error.code).toBe('token_expired');
  });
});
