// Правила по скользящим окнам: берут историю из events и usage (только цифры и хэши IP).
import type { RuleId } from '../../../shared/refrain/guard';
import { PAGE_MICRO } from '../../../shared/prompts/tasks';
import type { GroupLimits } from '../../../shared/refrain/policy';
import { now, type Env } from '../env';
import type { ClientInfo } from '../http';
import type { Settings } from '../settings';
import { burnRate, expensiveOnly, impossibleTravel, machineRhythm } from './rules';

export async function recordEvent(env: Env, kind: 'task' | 'signup' | 'auth_fail', info: ClientInfo, o: { accountId?: string; deviceId?: string; task?: string } = {}): Promise<void> {
  await env.DB.prepare('INSERT INTO events (at, account_id, device_id, ip_hash, asn, country, lat, lon, task, kind) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)')
    .bind(now(env), o.accountId ?? null, o.deviceId ?? null, info.ipHash, info.asn, info.country, info.lat, info.lon, o.task ?? null, kind)
    .run();
}

/** Правила по истории аккаунта и IP перед задачей. Текущий запрос ещё не записан в events. */
export async function windowRules(env: Env, cfg: Settings, info: ClientInfo, accountId: string, lim: GroupLimits): Promise<RuleId[]> {
  const g = cfg.guard.rules;
  const t = now(env);
  const out: RuleId[] = [];
  const p = <T extends Record<string, number>>(r: RuleId) => (g[r].params ?? {}) as T;

  if (g.impossible_travel.enabled && info.lat !== null && info.lon !== null) {
    const prev = await env.DB.prepare('SELECT at, lat, lon FROM events WHERE account_id = ?1 AND lat IS NOT NULL AND ip_hash != ?2 ORDER BY at DESC LIMIT 1').bind(accountId, info.ipHash).first<{ at: number; lat: number; lon: number }>();
    if (prev && impossibleTravel(prev, { lat: info.lat, lon: info.lon, at: t }, p<{ maxKmh: number; minKm: number }>('impossible_travel'))) out.push('impossible_travel');
  }
  if (g.account_many_ips.enabled) {
    const { ips, windowMin } = p<{ ips: number; windowMin: number }>('account_many_ips');
    const r = await env.DB.prepare('SELECT COUNT(DISTINCT ip_hash) AS n, SUM(ip_hash = ?3) AS same FROM events WHERE account_id = ?1 AND at > ?2').bind(accountId, t - windowMin * 60000, info.ipHash).first<{ n: number; same: number }>();
    if ((r?.n ?? 0) + (r?.same ? 0 : 1) >= ips) out.push('account_many_ips');
  }
  if (g.ip_many_accounts.enabled) {
    const { accounts, windowMin } = p<{ accounts: number; windowMin: number }>('ip_many_accounts');
    const r = await env.DB.prepare('SELECT COUNT(DISTINCT account_id) AS a, COUNT(DISTINCT device_id) AS d, SUM(account_id = ?3) AS same FROM events WHERE ip_hash = ?1 AND at > ?2 AND account_id IS NOT NULL').bind(info.ipHash, t - windowMin * 60000, accountId).first<{ a: number; d: number; same: number }>();
    if (Math.max((r?.a ?? 0) + (r?.same ? 0 : 1), r?.d ?? 0) >= accounts) out.push('ip_many_accounts');
  }
  const { results: recent } = await env.DB.prepare("SELECT at, task FROM events WHERE account_id = ?1 AND kind = 'task' AND at > ?2 ORDER BY at").bind(accountId, t - 3600000).all<{ at: number; task: string }>();
  if (g.machine_rhythm.enabled && machineRhythm([...recent.map((r) => r.at), t], p<{ minRequests: number; maxCv: number }>('machine_rhythm'))) out.push('machine_rhythm');
  if (g.expensive_only.enabled && expensiveOnly(recent.map((r) => r.task), p<{ minRequests: number; share: number }>('expensive_only'))) out.push('expensive_only');
  if (g.burn_rate.enabled && lim.perDay !== null) {
    const hour = await env.DB.prepare('SELECT COALESCE(SUM(cost_micro), 0) AS c FROM usage WHERE account_id = ?1 AND at > ?2').bind(accountId, t - 3600000).first<{ c: number }>();
    const week = await env.DB.prepare('SELECT COALESCE(SUM(cost_micro), 0) AS c FROM usage WHERE account_id = ?1 AND at > ?2').bind(accountId, t - 7 * 86400000).first<{ c: number }>();
    if (burnRate((hour?.c ?? 0) / PAGE_MICRO, lim.perDay, (week?.c ?? 0) / PAGE_MICRO / (7 * 24), p<{ groupFactor: number; selfFactor: number; minPages: number }>('burn_rate'))) out.push('burn_rate');
  }
  return out;
}

/** Новые аккаунты с IP за окно (для signup_wave_ip). */
export async function signupsFromIp(env: Env, ipHash: string, windowMin: number): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'signup' AND ip_hash = ?1 AND at > ?2").bind(ipHash, now(env) - windowMin * 60000).first<{ n: number }>();
  return r?.n ?? 0;
}
