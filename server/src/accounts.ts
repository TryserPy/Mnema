// Аккаунты, устройства, сессии и действующая группа ученика.
import type { DeviceInfo, GroupId, Quota } from '../../shared/refrain/api.mjs';
import { NEWBIE_DAYS, type GroupLimits } from '../../shared/refrain/policy';
import { PAGE_MICRO } from '../../shared/prompts/tasks';
import { nextMidnight, type StudentUsage } from './counters';
import { now, type Env } from './env';
import type { Settings } from './settings';

export interface Account {
  id: string;
  email: string;
  grp: string;
  created_at: number;
  blocked_until: number | null;
  block_reason: string | null;
}

export interface Device {
  id: string;
  account_id: string;
  public_key: string;
  name: string;
  platform: string;
  created_at: number;
  last_seen: number;
  revoked: number;
}

export const FOREVER = 9e15;

/**
 * Каноническая почта — ключ аккаунта и лимитов: без «+метки» и, у Gmail, без точек. Так name+1@… и n.ame@gmail.com — один аккаунт,
 * а не бесконечный запас «Новичков» с одного ящика. Письмо с кодом уходит на адрес, который ввёл ученик.
 */
export function normEmail(e: string): string {
  const [user = '', domain = ''] = e.trim().toLowerCase().split('@');
  const d = domain === 'googlemail.com' ? 'gmail.com' : domain;
  let u = user.split('+')[0];
  if (d === 'gmail.com') u = u.replace(/\./g, '');
  return `${u}@${d}`;
}
export const isOwner = (env: Env, email: string): boolean => Boolean(env.OWNER_EMAIL) && normEmail(email) === normEmail(env.OWNER_EMAIL);

export async function accountById(env: Env, id: string): Promise<Account | null> {
  return env.DB.prepare('SELECT * FROM accounts WHERE id = ?1').bind(id).first<Account>();
}
export async function accountByEmail(env: Env, email: string): Promise<Account | null> {
  return env.DB.prepare('SELECT * FROM accounts WHERE email = ?1').bind(normEmail(email)).first<Account>();
}

/** Группа, по которой считаются лимиты и доступ: владелец — по почте из секретов, тестировщик — по группе или списку почт, новичок — первые 3 дня. */
export async function effectiveGroup(env: Env, a: Account): Promise<GroupId> {
  const t = now(env);
  if (a.blocked_until && a.blocked_until > t) return 'blocked';
  if (isOwner(env, a.email)) return 'owner';
  if (a.grp !== 'student') return a.grp as GroupId;
  if (await env.DB.prepare('SELECT 1 FROM testers WHERE email = ?1').bind(a.email).first()) return 'tester';
  if (t - a.created_at < NEWBIE_DAYS * 86400000) return 'newbie';
  return 'student';
}

export function groupLimits(s: Settings, g: GroupId, t: number): GroupLimits {
  const found = s.groups.find((x) => x.id === g) ?? s.groups.find((x) => x.id === 'student')!;
  if (g === 'newbie' && s.newbieZeroUntil > t) return { ...found, perDay: 0, perMonth: 0, perMinute: 0 };
  return found;
}

export function quotaOf(usage: StudentUsage, lim: GroupLimits, g: GroupId, t: number): Quota {
  const pages = (micro: number) => Math.round((micro / PAGE_MICRO) * 100) / 100;
  return {
    day: { used: pages(usage.day), limit: lim.perDay },
    month: { used: pages(usage.month), limit: lim.perMonth },
    resetsAt: new Date(nextMidnight(t)).toISOString(),
    group: g
  };
}

export async function devicesOf(env: Env, accountId: string, current?: string): Promise<DeviceInfo[]> {
  const { results } = await env.DB.prepare('SELECT * FROM devices WHERE account_id = ?1 AND revoked = 0 ORDER BY last_seen DESC').bind(accountId).all<Device>();
  return results.map((d) => ({ id: d.id, name: d.name, platform: d.platform as DeviceInfo['platform'], lastSeen: new Date(d.last_seen).toISOString(), ...(d.id === current ? { current: true } : {}) }));
}

/** Закрыть сессии устройства (или всех устройств аккаунта) и отвязать его. */
export async function revokeSessions(env: Env, accountId: string, deviceId?: string): Promise<void> {
  if (deviceId) await env.DB.prepare('UPDATE sessions SET revoked = 1 WHERE account_id = ?1 AND device_id = ?2').bind(accountId, deviceId).run();
  else await env.DB.prepare('UPDATE sessions SET revoked = 1 WHERE account_id = ?1').bind(accountId).run();
}
export async function unbindDevice(env: Env, accountId: string, deviceId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('UPDATE devices SET revoked = 1 WHERE id = ?1 AND account_id = ?2').bind(deviceId, accountId),
    env.DB.prepare('UPDATE sessions SET revoked = 1 WHERE device_id = ?1').bind(deviceId)
  ]);
}

export const student = (env: Env, accountId: string) => env.STUDENT.get(env.STUDENT.idFromName(accountId));
export const budget = (env: Env) => env.BUDGET.get(env.BUDGET.idFromName('global'));
