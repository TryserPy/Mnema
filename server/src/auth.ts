// Вход по почте и коду, устройства, токены. Ответ на /v1/auth/start одинаковый для любой почты.
import { ACCESS_TTL_MS, REFRESH_TTL_MS, powOk } from '../../shared/refrain/api.mjs';
import type { AuthTokens, AuthVerify, PowChallenge } from '../../shared/refrain/api.mjs';
import { INVITE_RE } from '../../shared/refrain/policy';
import { accountByEmail, devicesOf, effectiveGroup, groupLimits, normEmail, quotaOf, revokeSessions, student, unbindDevice, type Account } from './accounts';
import { randomDigits, randomId, randomToken, safeEqual, sha256, tagged, validDeviceKey } from './crypto';
import { now, type Env } from './env';
import { fail, maskEmail, readJson, type ClientInfo } from './http';
import { ipGate, signal } from './guard';
import { recordEvent, signupsFromIp } from './guard/windows';
import { journal } from './journal';
import { sendMail } from './mail';
import { issueAccess, verifySigned } from './sign';
import { loadSettings, saveSetting } from './settings';
import { raiseAlert } from './alerts';

const CODE_TTL = 10 * 60000;
const CODE_ATTEMPTS = 5;
const CODE_LOCK = 15 * 60000;
const POW_TTL = 5 * 60000;

/** Одноразовые почтовые сервисы (основные). */
const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', '10minutemail.net', 'temp-mail.org', 'tempmail.com', 'tempmail.net', 'yopmail.com', 'yopmail.net', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'mohmal.com', 'emailondeck.com', 'minuteinbox.com', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'mailnesia.com', 'tempail.com', 'tempr.email', 'discard.email', 'mailcatch.com', 'spamgourmet.com', 'emailfake.com', 'burnermail.io', 'inboxkitten.com', 'tmpmail.org', 'tmpmail.net', 'dropmail.me', 'temp-mail.io', 'mail.tm', 'mailpoof.com', 'cryptogmail.com', 'moakt.com', 'byom.de', 'trash-mail.com']);
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/;

/** Счётчик в окне: +1 и вернуть, сколько стало. Атомарно (UPSERT … RETURNING). */
export async function bump(env: Env, key: string, windowMs: number): Promise<number> {
  const t = now(env);
  const r = await env.DB.prepare('INSERT INTO counters (key, n, reset_at) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET n = CASE WHEN counters.reset_at < ?3 THEN 1 ELSE counters.n + 1 END, reset_at = CASE WHEN counters.reset_at < ?3 THEN ?2 ELSE counters.reset_at END RETURNING n, reset_at')
    .bind(key, t + windowMs, t)
    .first<{ n: number; reset_at: number }>();
  return r!.n;
}

// ---------- Proof-of-work ----------

export async function powChallenge(env: Env, purpose: 'login' | 'bug'): Promise<PowChallenge> {
  const exp = now(env) + POW_TTL;
  const payload = `${purpose}.${exp}.${randomToken(12)}`;
  return { ok: true, challenge: `${payload}.${await tagged(env.TOKEN_SECRET, 'pow', payload)}`, difficulty: Number(env.POW_DIFFICULTY) || 20, expiresAt: new Date(exp).toISOString() };
}

export async function checkPow(env: Env, pow: unknown, purpose: 'login' | 'bug'): Promise<void> {
  const p = pow as { challenge?: unknown; solution?: unknown } | null;
  if (!p || typeof p.challenge !== 'string' || typeof p.solution !== 'string' || !/^\d{1,20}$/.test(p.solution) || p.challenge.length > 200) fail('pow_invalid');
  const parts = (p!.challenge as string).split('.');
  if (parts.length !== 4) fail('pow_invalid');
  const [pp, exp, rnd, sig] = parts;
  const payload = `${pp}.${exp}.${rnd}`;
  if (pp !== purpose || !safeEqual(await tagged(env.TOKEN_SECRET, 'pow', payload), sig) || Number(exp) < now(env)) fail('pow_invalid');
  if (!powOk(await sha256(`${p!.challenge}:${p!.solution}`), Number(env.POW_DIFFICULTY) || 20)) fail('pow_invalid');
  const used = await env.DB.prepare('INSERT INTO pow_used (id, expires_at) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING RETURNING id').bind(rnd, Number(exp)).first();
  if (!used) fail('pow_invalid');
}

// ---------- Код на почту ----------

const codeHash = (env: Env, email: string, code: string) => tagged(env.TOKEN_SECRET, 'code', `${email}:${code}`);

function cleanEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? normEmail(raw) : '';
  if (email.length > 254 || !EMAIL_RE.test(email)) fail('email_rejected');
  if (DISPOSABLE.has(email.split('@')[1])) fail('email_rejected');
  return email;
}

export async function authStart(req: Request, env: Env, info: ClientInfo): Promise<Response> {
  const { body } = await readJson(req, 4096);
  const b = body as { email?: unknown; pow?: unknown };
  const email = cleanEmail(b.email);
  await ipGate(env, info, await loadSettings(env));
  await checkPow(env, b.pow, 'login');
  // Лимиты: 3 кода в час на почту, 10 на IP. Отказ одинаковый для существующих и новых почт.
  if ((await bump(env, `code:mail:${email}`, 3600000)) > 3 || (await bump(env, `code:ip:${info.ipHash}`, 3600000)) > 10) fail('too_fast', { retryAfter: 3600 });
  const t = now(env);
  const prev = await env.DB.prepare('SELECT locked_until FROM login_codes WHERE email = ?1').bind(email).first<{ locked_until: number | null }>();
  if (prev?.locked_until && prev.locked_until > t) fail('code_locked', { retryAfter: Math.ceil((prev.locked_until - t) / 1000) });
  const code = randomDigits(6);
  await env.DB.prepare('INSERT INTO login_codes (email, code_hash, expires_at, attempts, locked_until) VALUES (?1, ?2, ?3, 0, NULL) ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, locked_until = NULL')
    .bind(email, await codeHash(env, email, code), t + CODE_TTL)
    .run();
  const sent = await sendMail(env, email, `Код для входа в Refrain: ${code}`, `Твой код для входа в Refrain ИИ: ${code}\n\nОн действует 10 минут. Если ты не просил код, просто удали это письмо.`);
  if (!sent) fail('internal');
  return Response.json({ ok: true });
}

export async function authVerify(req: Request, env: Env, info: ClientInfo): Promise<Response> {
  const { body } = await readJson(req, 4096);
  const b = body as Partial<AuthVerify>;
  const email = cleanEmail(b.email);
  await ipGate(env, info, await loadSettings(env));
  const t = now(env);
  const row = await env.DB.prepare('SELECT * FROM login_codes WHERE email = ?1').bind(email).first<{ code_hash: string; expires_at: number; attempts: number; locked_until: number | null }>();
  if (row?.locked_until && row.locked_until > t) fail('code_locked', { retryAfter: Math.ceil((row.locked_until - t) / 1000) });
  if (!row || row.expires_at < t) fail('code_invalid', { attemptsLeft: 0 });
  if (typeof b.code !== 'string' || !/^\d{6}$/.test(b.code) || !safeEqual(await codeHash(env, email, b.code), row!.code_hash)) {
    const attempts = row!.attempts + 1;
    if (attempts >= CODE_ATTEMPTS) {
      await env.DB.prepare('UPDATE login_codes SET attempts = ?2, locked_until = ?3 WHERE email = ?1').bind(email, attempts, t + CODE_LOCK).run();
      await recordEvent(env, 'auth_fail', info);
      fail('code_locked', { retryAfter: CODE_LOCK / 1000 });
    }
    await env.DB.prepare('UPDATE login_codes SET attempts = ?2 WHERE email = ?1').bind(email, attempts).run();
    fail('code_invalid', { attemptsLeft: CODE_ATTEMPTS - attempts });
  }
  const dev = b.device;
  if (!dev || typeof dev !== 'object' || !(await validDeviceKey(dev.publicKey)) || !['windows', 'linux', 'android'].includes(dev.platform) || typeof dev.name !== 'string') fail('bad_request');
  const invite = b.invite === undefined ? null : typeof b.invite === 'string' && INVITE_RE.test(b.invite.trim().toUpperCase()) ? b.invite.trim().toUpperCase() : fail('invite_invalid');

  const cfg = await loadSettings(env);
  let account = await accountByEmail(env, email);
  const isNew = !account;
  if (!account) {
    account = { id: randomId('acc'), email, grp: 'student', created_at: t, blocked_until: null, block_reason: null };
    if (invite) await checkInvite(env, invite, account.id);
  } else if (invite) await checkInvite(env, invite, account.id);

  // Лимит устройств: код не тратится, приложение повторит с replaceDevice.
  if (!isNew) {
    const group = await effectiveGroup(env, account);
    const lim = groupLimits(cfg, group, t);
    const devices = await devicesOf(env, account.id);
    if (typeof b.replaceDevice === 'string' && devices.some((d) => d.id === b.replaceDevice)) {
      await unbindDevice(env, account.id, b.replaceDevice);
      await journal(env, { actor: 'system', action: 'device.replace', target: { kind: 'account', id: account.id } });
    } else if (devices.length >= Math.max(1, lim.devices)) fail('device_limit', { devices });
  }

  await env.DB.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email).run();
  if (isNew) {
    await env.DB.prepare('INSERT INTO accounts (id, email, grp, created_at) VALUES (?1, ?2, ?3, ?4)').bind(account.id, email, account.grp, t).run();
    await recordEvent(env, 'signup', info, { accountId: account.id });
    await signupWave(env, cfg, info);
  }
  if (invite) await applyInvite(env, invite, account);
  account = (await accountByEmail(env, email))!;

  const deviceId = `dev_${randomToken(12)}`;
  await env.DB.prepare('INSERT INTO devices (id, account_id, public_key, name, platform, created_at, last_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)')
    .bind(deviceId, account.id, dev!.publicKey, dev!.name.replace(/[\u0000-\u001f<>]/g, '').slice(0, 60) || 'Устройство', dev!.platform, t)
    .run();
  return Response.json(await newSession(env, account, deviceId));
}

async function newSession(env: Env, account: Account, deviceId: string, sessionId?: string): Promise<AuthTokens> {
  const t = now(env);
  const refresh = randomToken(32);
  const hash = await tagged(env.TOKEN_SECRET, 'refresh', refresh);
  const sid = sessionId ?? randomId('ses');
  if (sessionId) await env.DB.prepare('UPDATE sessions SET refresh_hash = ?2, expires_at = ?3 WHERE id = ?1').bind(sid, hash, t + REFRESH_TTL_MS).run();
  else await env.DB.prepare('INSERT INTO sessions (id, account_id, device_id, refresh_hash, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(sid, account.id, deviceId, hash, t + REFRESH_TTL_MS).run();
  const group = await effectiveGroup(env, account);
  const cfg = await loadSettings(env);
  const usage = await student(env, account.id).usage(t);
  return {
    ok: true,
    accessToken: await issueAccess(env, { a: account.id, d: deviceId, s: sid, e: t + ACCESS_TTL_MS }),
    refreshToken: refresh,
    accessExpiresAt: new Date(t + ACCESS_TTL_MS).toISOString(),
    refreshExpiresAt: new Date(t + REFRESH_TTL_MS).toISOString(),
    deviceId,
    quota: quotaOf(usage, groupLimits(cfg, group, t), group, t),
    emailMasked: maskEmail(account.email)
  };
}

/** Обновление токенов. Старый токен после этого недействителен; его повтор — кража: закрываются все сессии аккаунта. */
export async function authRefresh(req: Request, env: Env, info: ClientInfo): Promise<Response> {
  const { raw, body } = await readJson(req, 4096);
  const s = await verifySigned(req, env, raw, info, 'device');
  const token = (body as { refreshToken?: unknown }).refreshToken;
  if (typeof token !== 'string' || token.length > 100) fail('bad_request');
  const hash = await tagged(env.TOKEN_SECRET, 'refresh', token as string);
  const t = now(env);
  const sess = await env.DB.prepare('SELECT * FROM sessions WHERE refresh_hash = ?1').bind(hash).first<{ id: string; account_id: string; device_id: string; expires_at: number; revoked: number }>();
  if (!sess) {
    const used = await env.DB.prepare('SELECT account_id FROM refresh_used WHERE hash = ?1').bind(hash).first<{ account_id: string }>();
    if (used) {
      await revokeSessions(env, used.account_id);
      await signal(env, ['refresh_reuse'], { info, account: { id: s.account.id, email: s.account.email, group: s.group }, device: { id: s.device.id, name: s.device.name, platform: s.device.platform } });
      fail('session_revoked');
    }
    fail('session_revoked');
  }
  if (sess!.revoked || sess!.expires_at < t) fail('session_revoked');
  if (sess!.device_id !== s.device.id || sess!.account_id !== s.account.id) {
    await signal(env, ['token_unknown'], { info, account: { id: s.account.id, email: s.account.email, group: s.group }, device: { id: s.device.id, name: s.device.name, platform: s.device.platform } });
    fail('device_unknown');
  }
  await env.DB.prepare('INSERT INTO refresh_used (hash, account_id, used_at) VALUES (?1, ?2, ?3) ON CONFLICT(hash) DO NOTHING').bind(hash, s.account.id, t).run();
  return Response.json(await newSession(env, s.account, s.device.id, sess!.id));
}

export async function authLogout(req: Request, env: Env, info: ClientInfo): Promise<Response> {
  const { raw } = await readJson(req, 1024);
  const s = await verifySigned(req, env, raw, info, 'access');
  await env.DB.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?1').bind(s.sessionId).run();
  return Response.json({ ok: true });
}

// ---------- Приглашения ----------

async function checkInvite(env: Env, code: string, accountId: string): Promise<void> {
  const inv = await env.DB.prepare('SELECT * FROM invites WHERE code = ?1').bind(code).first<{ seats: number; used: number; expires_at: number; revoked: number }>();
  if (!inv || inv.revoked || inv.expires_at < now(env)) fail('invite_invalid');
  const mine = await env.DB.prepare('SELECT 1 FROM invite_uses WHERE code = ?1 AND account_id = ?2').bind(code, accountId).first();
  if (!mine && inv!.used >= inv!.seats) fail('invite_invalid');
}

/** Приглашение одноразово привязывается к почте: повторно этим же аккаунтом можно, другим — только пока есть места. */
export async function applyInvite(env: Env, code: string, account: Account): Promise<void> {
  await checkInvite(env, code, account.id);
  const inv = (await env.DB.prepare('SELECT grp FROM invites WHERE code = ?1').bind(code).first<{ grp: string }>())!;
  const ins = await env.DB.prepare('INSERT INTO invite_uses (code, account_id, at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING RETURNING code').bind(code, account.id, now(env)).first();
  if (ins) {
    const upd = await env.DB.prepare('UPDATE invites SET used = used + 1 WHERE code = ?1 AND used < seats RETURNING used').bind(code).first();
    if (!upd) {
      await env.DB.prepare('DELETE FROM invite_uses WHERE code = ?1 AND account_id = ?2').bind(code, account.id).run();
      fail('invite_invalid');
    }
  }
  if (account.grp === 'student' || account.grp === 'newbie') await env.DB.prepare('UPDATE accounts SET grp = ?2 WHERE id = ?1').bind(account.id, inv.grp).run();
  await journal(env, { actor: 'system', action: 'invite.use', target: { kind: 'invite', id: code }, after: { account: account.id, group: inv.grp } });
}

/** Волна регистраций: с IP — сигнал детектору; всего за час больше порога — лимит «Новичка» временно 0 и тревога. */
async function signupWave(env: Env, cfg: Awaited<ReturnType<typeof loadSettings>>, info: ClientInfo): Promise<void> {
  const wave = cfg.guard.rules.signup_wave_ip.params as { accounts: number; windowMin: number };
  if ((await signupsFromIp(env, info.ipHash, wave.windowMin)) >= wave.accounts) await signal(env, ['signup_wave_ip'], { info }, cfg);
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'signup' AND at > ?1").bind(now(env) - 3600000).first<{ n: number }>();
  const perIp = await signupsFromIp(env, info.ipHash, 60);
  if (((r?.n ?? 0) > cfg.budget.signupWaveHour || perIp > cfg.budget.signupWavePerIp) && cfg.newbieZeroUntil < now(env)) {
    await saveSetting(env, 'newbieZeroUntil', now(env) + 3600000);
    await journal(env, { actor: 'system', action: 'newbie.zero', reason: `новых за час: ${r?.n ?? 0}, с одного IP: ${perIp}` });
    const a = await raiseAlert(env, { level: 'warn', kind: 'signup_wave', title: 'Волна регистраций', text: `За час новых аккаунтов: ${r?.n ?? 0}, с одного IP: ${perIp}.`, who: { ip: info.ipMask, asn: info.asn ?? undefined }, done: ['newbie_zero'], buttons: ['pause', 'open_panel'] });
    await a.deliver;
  }
}
