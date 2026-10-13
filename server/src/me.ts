// Аккаунт ученика: сведения, приглашение, устройства, удаление.
import { INVITE_RE, admits } from '../../shared/refrain/policy';
import type { Me } from '../../shared/refrain/api.mjs';
import { devicesOf, effectiveGroup, groupLimits, quotaOf, revokeSessions, student, unbindDevice, type Account } from './accounts';
import { applyInvite } from './auth';
import { now, type Env } from './env';
import { fail, maskEmail, readJson, type ClientInfo } from './http';
import { journal } from './journal';
import { loadSettings } from './settings';
import { verifySigned } from './sign';

export async function handleMe(req: Request, env: Env, info: ClientInfo): Promise<Response> {
  const s = await verifySigned(req, env, new Uint8Array(), info, 'access');
  const cfg = await loadSettings(env);
  const t = now(env);
  const out: Me = {
    ok: true,
    emailMasked: maskEmail(s.account.email),
    quota: quotaOf(await student(env, s.account.id).usage(t), groupLimits(cfg, s.group, t), s.group, t),
    devices: await devicesOf(env, s.account.id, s.device.id),
    access: admits(cfg.mode, s.group) ? 'open' : 'closed'
  };
  return Response.json(out);
}

export async function handleInvite(req: Request, env: Env, info: ClientInfo): Promise<Response> {
  const { raw, body } = await readJson(req, 1024);
  const s = await verifySigned(req, env, raw, info, 'access');
  const code = String((body as { code?: unknown }).code ?? '').trim().toUpperCase();
  if (!INVITE_RE.test(code)) fail('invite_invalid');
  await applyInvite(env, code, s.account);
  return handleMeAfter(env, s.account.id);
}

async function handleMeAfter(env: Env, accountId: string): Promise<Response> {
  const cfg = await loadSettings(env);
  const t = now(env);
  const a = (await env.DB.prepare('SELECT * FROM accounts WHERE id = ?1').bind(accountId).first<Account>())!;
  const g = await effectiveGroup(env, a);
  return Response.json({ ok: true, quota: quotaOf(await student(env, accountId).usage(t), groupLimits(cfg, g, t), g, t) });
}

export async function handleDeviceDelete(req: Request, env: Env, info: ClientInfo, deviceId: string): Promise<Response> {
  const s = await verifySigned(req, env, new Uint8Array(), info, 'access');
  await unbindDevice(env, s.account.id, deviceId);
  return Response.json({ ok: true });
}

/** «Удалить аккаунт»: почта, счётчики, устройства, сессии. Цифры учёта остаются обезличенными (без связи с почтой). */
export async function handleAccountDelete(req: Request, env: Env, info: ClientInfo): Promise<Response> {
  const s = await verifySigned(req, env, new Uint8Array(), info, 'access');
  const id = s.account.id;
  await revokeSessions(env, id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM devices WHERE account_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM sessions WHERE account_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM refresh_used WHERE account_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM login_codes WHERE email = ?1').bind(s.account.email),
    env.DB.prepare('DELETE FROM testers WHERE email = ?1').bind(s.account.email),
    env.DB.prepare('DELETE FROM invite_uses WHERE account_id = ?1').bind(id),
    env.DB.prepare("UPDATE usage SET account_id = 'deleted' WHERE account_id = ?1").bind(id),
    env.DB.prepare("UPDATE events SET account_id = NULL, device_id = NULL WHERE account_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM scores WHERE kind = 'account' AND subject = ?1").bind(id),
    env.DB.prepare('DELETE FROM accounts WHERE id = ?1').bind(id)
  ]);
  await student(env, id).wipe();
  await journal(env, { actor: 'system', action: 'account.delete', target: { kind: 'account', id } });
  return Response.json({ ok: true });
}
