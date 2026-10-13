// Проверка подписанного запроса: токен, устройство, время, nonce, подпись ECDSA. Любое несовпадение — device_unknown без подробностей;
// само несовпадение — сигнал детектору.
import { H, SIGNATURE_WINDOW_MS, canonicalString } from '../../shared/refrain/api.mjs';
import type { RuleId } from '../../shared/refrain/guard';
import { accountById, effectiveGroup, student, type Account, type Device } from './accounts';
import { safeEqual, sha256hex, tagged, verifyDevice } from './crypto';
import { now, type Env } from './env';
import { fail, type ClientInfo } from './http';
import { signal } from './guard';
import { clientRules } from './guard/rules';
import type { GroupId } from '../../shared/refrain/api.mjs';

export interface AccessClaims {
  a: string; // аккаунт
  d: string; // устройство
  s: string; // сессия
  e: number; // истекает
}

export async function issueAccess(env: Env, c: AccessClaims): Promise<string> {
  const payload = btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `v1.${payload}.${await tagged(env.TOKEN_SECRET, 'access', payload)}`;
}

async function readAccess(env: Env, token: string): Promise<AccessClaims | null> {
  const m = /^v1\.([A-Za-z0-9_-]{10,600})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m || !safeEqual(await tagged(env.TOKEN_SECRET, 'access', m[1]), m[2])) return null;
  try {
    const c = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))) as AccessClaims;
    return typeof c.a === 'string' && typeof c.d === 'string' && typeof c.s === 'string' && typeof c.e === 'number' ? c : null;
  } catch {
    return null;
  }
}

export interface Signed {
  account: Account;
  group: GroupId;
  device: Device;
  sessionId: string | null;
  /** Правила клиента (нет заголовка приложения, несуществующая версия) — учитываются вместе с правилами задачи. */
  clientRules: RuleId[];
}

/**
 * Проверить подпись. mode 'access' — обычный запрос с токеном доступа; 'device' — /v1/auth/refresh: только устройство,
 * аккаунт берётся из устройства (токен обновления проверяет вызывающий).
 */
export async function verifySigned(req: Request, env: Env, raw: Uint8Array, info: ClientInfo, mode: 'access' | 'device'): Promise<Signed> {
  const t = now(env);
  const h = (k: string) => req.headers.get(k) || '';
  const deviceId = h(H.device);
  const time = Number(h(H.time));
  const nonce = h(H.nonce);
  const sig = h(H.signature);
  const bad = async (rules: RuleId[], extra?: { account?: Account; group?: GroupId; device?: Device }): Promise<never> => {
    await signal(env, rules, { info, account: extra?.account ? { id: extra.account.id, email: extra.account.email, group: extra.group ?? 'student' } : undefined, device: extra?.device ? { id: extra.device.id, name: extra.device.name, platform: extra.device.platform } : undefined });
    return fail('device_unknown');
  };
  if (!/^dev_[A-Za-z0-9_-]{16}$/.test(deviceId) || !/^[A-Za-z0-9_-]{22}$/.test(nonce) || !/^[A-Za-z0-9_-]{86}$/.test(sig) || !Number.isSafeInteger(time)) return bad(['token_unknown']);
  const device = await env.DB.prepare('SELECT * FROM devices WHERE id = ?1').bind(deviceId).first<Device>();
  if (!device || device.revoked) return bad(['device_unknown']);
  const account = await accountById(env, device.account_id);
  if (!account) return bad(['device_unknown']);
  const group = await effectiveGroup(env, account);
  const ctx = { account, group, device };

  let sessionId: string | null = null;
  if (mode === 'access') {
    const auth = h(H.auth);
    const claims = auth.startsWith('Bearer ') ? await readAccess(env, auth.slice(7)) : null;
    if (!claims || claims.d !== deviceId || claims.a !== account.id) return bad(['token_unknown'], ctx);
    if (claims.e < t) fail('token_expired');
    const sess = await env.DB.prepare('SELECT revoked FROM sessions WHERE id = ?1 AND account_id = ?2 AND device_id = ?3').bind(claims.s, account.id, deviceId).first<{ revoked: number }>();
    if (!sess || sess.revoked) fail('session_revoked');
    sessionId = claims.s;
  }
  if (Math.abs(t - time) > SIGNATURE_WINDOW_MS) return bad(['time_skew'], ctx);
  const url = new URL(req.url);
  const message = canonicalString({ method: req.method, path: url.pathname + url.search, bodySha256Hex: await sha256hex(raw), time, nonce, deviceId });
  if (!(await verifyDevice(device.public_key, sig, message))) return bad(['sig_invalid'], ctx);
  if (!(await student(env, account.id).nonce(deviceId, nonce, t))) return bad(['nonce_replay'], ctx);
  if (t - device.last_seen > 60000) await env.DB.prepare('UPDATE devices SET last_seen = ?2 WHERE id = ?1').bind(deviceId, t).run();
  return { account, group, device, sessionId, clientRules: clientRules(info.app, env.APP_VERSIONS.split(',').map((v) => v.trim())) };
}
