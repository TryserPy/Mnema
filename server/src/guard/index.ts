// Детектор: баллы по субъектам с затуханием, уровни 1–3 и реакции. Все решения — по данным сервера, клиенту не верим.
// Каждая реакция пишется в журнал с причиной и правилами; уровни 2–3 — ещё и тревога владельцу.
import type { GroupId } from '../../../shared/refrain/api.mjs';
import { DEFAULT_GROUPS } from '../../../shared/refrain/policy';
import type { AlertButton, AlertKind, Level, ReactionKind, RuleId, SubjectKind } from '../../../shared/refrain/guard';
import { FOREVER, revokeSessions, unbindDevice } from '../accounts';
import { raiseAlert } from '../alerts';
import { now, type Env } from '../env';
import { maskEmail, type ClientInfo } from '../http';
import { journal } from '../journal';
import { loadSettings, saveSetting, type Settings } from '../settings';
import { CONTRACT_RULES, FORGERY_RULES, TRAVEL_RULES } from './rules';

export interface Subjects {
  account?: { id: string; email: string; group: GroupId };
  device?: { id: string; name: string; platform: string };
  info: ClientInfo;
}

const subjectId = (kind: SubjectKind, s: Subjects): string | null =>
  kind === 'account' ? (s.account?.id ?? null) : kind === 'device' ? (s.device?.id ?? null) : kind === 'ip' ? s.info.ipHash : s.info.asn !== null ? String(s.info.asn) : null;

const factorOf = (s: Settings, g: GroupId | undefined) => (g ? (s.groups.find((x) => x.id === g) ?? DEFAULT_GROUPS.find((x) => x.id === g))?.guardFactor ?? 1 : 1);

/** Прибавить баллы субъекту с затуханием. Возвращает новую сумму. */
async function addScore(env: Env, kind: SubjectKind, subject: string, w: number, halfLifeMin: number): Promise<number> {
  const t = now(env);
  const prev = await env.DB.prepare('SELECT score, updated_at FROM scores WHERE kind = ?1 AND subject = ?2').bind(kind, subject).first<{ score: number; updated_at: number }>();
  const decayed = prev ? prev.score * Math.pow(0.5, Math.max(0, t - prev.updated_at) / (halfLifeMin * 60000)) : 0;
  const score = decayed + w;
  await env.DB.prepare('INSERT INTO scores (kind, subject, score, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(kind, subject) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at').bind(kind, subject, score, t).run();
  return score;
}

export async function scoreOf(env: Env, kind: SubjectKind, subject: string, halfLifeMin: number): Promise<number> {
  const r = await env.DB.prepare('SELECT score, updated_at FROM scores WHERE kind = ?1 AND subject = ?2').bind(kind, subject).first<{ score: number; updated_at: number }>();
  return r ? r.score * Math.pow(0.5, Math.max(0, now(env) - r.updated_at) / (halfLifeMin * 60000)) : 0;
}

export interface GateResult {
  blocked: { until: number | null } | null;
  /** Делитель лимита в минуту (уровень 1); 1 — без замедления. */
  slowdown: number;
}

/** Действующие блоки и замедления для субъектов запроса. Блоки IP/ASN не касаются владельца и тестировщиков. */
export async function gate(env: Env, s: Subjects, cfg: Settings): Promise<GateResult> {
  const t = now(env);
  const trusted = s.account?.group === 'owner' || s.account?.group === 'tester';
  const keys: [SubjectKind, string][] = [];
  for (const k of ['account', 'device', 'ip', 'asn'] as SubjectKind[]) {
    if (trusted && (k === 'ip' || k === 'asn')) continue;
    const id = subjectId(k, s);
    if (id) keys.push([k, id]);
  }
  if (!keys.length) return { blocked: null, slowdown: 1 };
  const where = keys.map((_, i) => `(kind = ?${i * 2 + 2} AND subject = ?${i * 2 + 3})`).join(' OR ');
  const { results } = await env.DB.prepare(`SELECT level, until FROM blocks WHERE lifted_at IS NULL AND pending = 0 AND (until IS NULL OR until > ?1) AND (${where})`)
    .bind(t, ...keys.flat())
    .all<{ level: number; until: number | null }>();
  const blocks = results.filter((r) => r.level === 2);
  const until = blocks.some((b) => b.until === null) ? null : blocks.length ? Math.max(...blocks.map((b) => b.until!)) : 0;
  return { blocked: blocks.length ? { until } : null, slowdown: results.some((r) => r.level === 1) ? cfg.guard.slowdownFactor : 1 };
}

export interface SignalResult {
  level: Level;
  reactions: ReactionKind[];
}

/**
 * Сработали правила для запроса: начислить баллы, при пороге — реакция.
 * Владелец не блокируется никогда (только тревога), тестировщик — с порогом ×2, и блок уровня 2 ждёт подтверждения.
 */
export async function signal(env: Env, rules: RuleId[], s: Subjects, cfgIn?: Settings): Promise<SignalResult> {
  const cfg = cfgIn ?? (await loadSettings(env));
  const g = cfg.guard;
  const active = rules.filter((r) => g.rules[r]?.enabled);
  if (!active.length) return { level: 0, reactions: [] };
  const groupFactor = factorOf(cfg, s.account?.group);
  const instant = active.some((r) => g.rules[r].instantLevel2);
  let level: Level = 0;
  const reactions: ReactionKind[] = [];
  const scores: Partial<Record<SubjectKind, number>> = {};
  for (const kind of ['account', 'device', 'ip', 'asn'] as SubjectKind[]) {
    const id = subjectId(kind, s);
    if (!id) continue;
    const w = active.filter((r) => g.rules[r].subjects.includes(kind)).reduce((a, r) => a + g.rules[r].weight, 0);
    if (!w) continue;
    scores[kind] = await addScore(env, kind, id, w, g.halfLifeMin);
  }
  // Порог для аккаунта и устройства — с множителем группы; IP и ASN общие.
  const lvl = (kind: SubjectKind, score: number): Level => {
    const f = kind === 'account' || kind === 'device' ? groupFactor : 1;
    if (score >= g.level2 * f) return 2;
    if (score >= g.level1 * f) return 1;
    return 0;
  };
  const accScore = scores.account ?? scores.device ?? 0;
  let accLevel: Level = Math.max(lvl('account', scores.account ?? 0), lvl('device', scores.device ?? 0)) as Level;
  if (instant && s.account) accLevel = 2;
  const ipLevel = scores.ip !== undefined ? lvl('ip', scores.ip) : 0;
  const owner = s.account?.group === 'owner';
  const needsConfirm = owner || (cfg.groups.find((x) => x.id === s.account?.group)?.blockNeedsConfirm ?? false);

  if (accLevel >= 1 && s.account && !owner) {
    if (await addBlock(env, s, 'account', 1, active, g.slowdownMin, false)) reactions.push('slowdown');
    level = 1;
  }
  if (accLevel === 2 && s.account) {
    level = 2;
    if (needsConfirm) {
      if (await addBlock(env, s, 'account', 2, active, g.blockAccountMin, true)) reactions.push('pending_block');
    } else {
      const forgery = active.some((r) => FORGERY_RULES.has(r)) && !active.some((r) => TRAVEL_RULES.has(r));
      const repeat = await hadLevel2(env, s.account.id, now(env) - 24 * 3600000);
      if (forgery && !repeat) {
        await revokeSessions(env, s.account.id);
        reactions.push('revoke_tokens');
        if (s.device) {
          await unbindDevice(env, s.account.id, s.device.id);
          reactions.push('unbind_device');
        }
        await markLevel2(env, s, active, 'forgery');
      } else {
        await addBlock(env, s, 'account', 2, active, g.blockAccountMin, false);
        await revokeSessions(env, s.account.id);
        reactions.push('block_account', 'revoke_tokens');
        if (s.device) {
          await unbindDevice(env, s.account.id, s.device.id);
          reactions.push('unbind_device');
        }
      }
    }
  } else if (s.device && !s.account && scores.device !== undefined && lvl('device', scores.device) === 2) {
    // Подпись без опознанного аккаунта (refresh с чужим устройством): отвязать само устройство.
    await env.DB.prepare('UPDATE devices SET revoked = 1 WHERE id = ?1').bind(s.device.id).run();
    await env.DB.prepare('UPDATE sessions SET revoked = 1 WHERE device_id = ?1').bind(s.device.id).run();
    reactions.push('unbind_device');
    level = 2;
  }
  if (ipLevel >= 1 && !owner) level = Math.max(level, ipLevel) as Level;
  if (ipLevel === 2 && !owner) {
    if (await addBlock(env, s, 'ip', 2, active, g.blockIpMin, false)) reactions.push('block_ip');
    if (s.info.asn !== null) {
      const sameAsn = await env.DB.prepare("SELECT COUNT(DISTINCT subject) AS n FROM blocks WHERE kind = 'ip' AND asn = ?1 AND level = 2 AND lifted_at IS NULL AND until > ?2").bind(s.info.asn, now(env)).first<{ n: number }>();
      if ((sameAsn?.n ?? 0) >= 3 && (await addBlock(env, s, 'asn', 2, active, g.blockAsnMin, false))) reactions.push('block_asn');
    }
  } else if (ipLevel === 1 && !owner && !s.account) {
    if (await addBlock(env, s, 'ip', 1, active, g.slowdownMin, false)) reactions.push('slowdown');
  }

  if (level >= 1 && reactions.length) {
    await journal(env, {
      actor: 'system',
      action: `guard.level${level}`,
      target: s.account ? { kind: 'account', id: s.account.id } : { kind: 'ip', id: s.info.ipMask },
      reason: `сработали правила: ${active.join(', ')}`,
      rules: active,
      score: Math.round(Math.max(accScore, scores.ip ?? 0)),
      after: reactions
    });
  }
  if (level === 2 || (owner && accScore >= g.level2)) {
    await raiseAlert(env, {
      level: 'warn',
      kind: owner || reactions.includes('pending_block') ? 'pending_block' : alertKind(active, reactions),
      title: owner ? 'Защита сработала на твоём аккаунте' : reactions.includes('pending_block') ? 'Подозрительно: ждёт твоего решения' : titleFor(active, reactions),
      text: owner ? 'Тебя сервер не блокирует. Если это не ты — смени устройства и проверь почту.' : reactions.includes('pending_block') ? 'Это тестировщик: блок применится только по твоему подтверждению.' : 'Сработала автоматическая защита.',
      rules: active,
      who: who(s),
      done: reactions,
      buttons: buttonsFor(reactions),
      groupKey: `guard:${alertKind(active, reactions)}`,
      target: s.account?.id
    }).then((a) => a.deliver);
    if (!owner) await checkMass(env, cfg);
  }
  return { level, reactions };
}

function alertKind(rules: RuleId[], reactions: ReactionKind[]): AlertKind {
  if (rules.some((r) => FORGERY_RULES.has(r))) return 'forgery';
  if (rules.some((r) => TRAVEL_RULES.has(r))) return 'travel';
  if (rules.some((r) => CONTRACT_RULES.has(r))) return 'contract';
  if (reactions.includes('block_ip') || reactions.includes('block_asn')) return 'ip_block';
  return 'block';
}
function titleFor(rules: RuleId[], reactions: ReactionKind[]): string {
  const k = alertKind(rules, reactions);
  return k === 'forgery' ? 'Подделка или повтор запроса' : k === 'travel' ? 'Аккаунт с нескольких мест' : k === 'contract' ? 'Выход за рамки контракта' : k === 'ip_block' ? 'Блок IP / ASN' : 'Автоматический блок';
}
function buttonsFor(reactions: ReactionKind[]): AlertButton[] {
  if (reactions.includes('pending_block')) return ['block', 'open_panel'];
  if (reactions.some((r) => r === 'block_account' || r === 'block_ip' || r === 'block_asn')) return ['unblock', 'open_panel'];
  return ['block', 'open_panel'];
}
function who(s: Subjects) {
  return { email: s.account ? maskEmail(s.account.email) : undefined, ip: s.info.ipMask, asn: s.info.asn ?? undefined, device: s.device ? `${s.device.name} · ${s.device.platform}` : undefined };
}

/** Записать блок или замедление. false — такой уже действует (не плодим одинаковые). */
async function addBlock(env: Env, s: Subjects, kind: SubjectKind, level: 1 | 2, rules: RuleId[], minutes: number, pending: boolean): Promise<boolean> {
  const id = subjectId(kind, s)!;
  const t = now(env);
  const exists = await env.DB.prepare('SELECT 1 FROM blocks WHERE kind = ?1 AND subject = ?2 AND level = ?3 AND pending = ?4 AND lifted_at IS NULL AND (until IS NULL OR until > ?5)').bind(kind, id, level, pending ? 1 : 0, t).first();
  if (exists) return false;
  const label = kind === 'account' ? maskEmail(s.account!.email) : kind === 'ip' ? s.info.ipMask : kind === 'asn' ? `AS${s.info.asn}` : (s.device?.name ?? id);
  await env.DB.prepare('INSERT INTO blocks (kind, subject, label, asn, account_id, level, reason, rules, since, until, pending) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)')
    .bind(kind, id, label, s.info.asn, s.account?.id ?? null, level, level === 1 ? 'замедление' : 'автоматический блок', JSON.stringify(rules), t, t + minutes * 60000, pending ? 1 : 0)
    .run();
  if (kind === 'account' && level === 2 && !pending) await env.DB.prepare('UPDATE accounts SET blocked_until = ?2, block_reason = ?3 WHERE id = ?1').bind(id, t + minutes * 60000, 'guard').run();
  return true;
}

/** Был ли уровень 2 у аккаунта с момента since (для «при повторе — блок»). */
async function hadLevel2(env: Env, accountId: string, since: number): Promise<boolean> {
  const r = await env.DB.prepare("SELECT 1 FROM journal WHERE target_kind = 'account' AND target_id = ?1 AND action = 'guard.level2' AND at > ?2 LIMIT 1").bind(accountId, since).first();
  return Boolean(r);
}
async function markLevel2(env: Env, s: Subjects, rules: RuleId[], reason: string): Promise<void> {
  // Отзыв без блока тоже считается уровнем 2: запись в журнале нужна, чтобы повтор дал блок (hadLevel2) и чтобы её учёл checkMass.
  await env.DB.prepare('INSERT INTO blocks (kind, subject, label, account_id, level, reason, rules, since, until, pending, lifted_at) VALUES (?1, ?2, ?3, ?2, 2, ?4, ?5, ?6, ?6, 0, ?6)')
    .bind('account', s.account!.id, maskEmail(s.account!.email), reason, JSON.stringify(rules), now(env))
    .run();
}

/** Уровень 3: массовая атака — уровень 2 у многих аккаунтов за окно. */
async function checkMass(env: Env, cfg: Settings): Promise<void> {
  const g = cfg.guard;
  const r = await env.DB.prepare("SELECT COUNT(DISTINCT subject) AS n FROM blocks WHERE kind = 'account' AND level = 2 AND since > ?1").bind(now(env) - g.massWindowMin * 60000).first<{ n: number }>();
  if ((r?.n ?? 0) >= g.massAccounts) await emergencyPause(env, cfg, 'guard', `Уровень 2 у ${r!.n} аккаунтов за ${g.massWindowMin} минут.`);
}

/** Аварийная пауза: Refrain ИИ только у владельца. Прежний режим запоминается для «Вернуть режим». */
export async function emergencyPause(env: Env, cfgIn: Settings | null, reason: 'guard' | 'leak', text: string, extra?: { title?: string; kind?: AlertKind }): Promise<boolean> {
  const cfg = cfgIn ?? (await loadSettings(env));
  if (cfg.mode === 'owner' || cfg.mode === 'off') return false;
  await saveSetting(env, 'prevMode', cfg.mode);
  await saveSetting(env, 'mode', 'owner');
  await saveSetting(env, 'pause', { reason, since: now(env) });
  await journal(env, { actor: 'system', action: 'guard.level3', target: { kind: 'mode', id: 'owner' }, reason: text, before: cfg.mode, after: 'owner' });
  const a = await raiseAlert(env, { level: 'critical', kind: extra?.kind ?? 'emergency_pause', title: extra?.title ?? 'Аварийная пауза Refrain ИИ', text, done: ['mode_owner'], buttons: ['restore_mode', 'open_panel'] });
  await a.deliver;
  return true;
}

/** Снять блок из панели или бота. */
export async function liftBlock(env: Env, id: number, actor: 'owner:tg' | 'owner:web' | 'owner:bot'): Promise<boolean> {
  const b = await env.DB.prepare('SELECT * FROM blocks WHERE id = ?1').bind(id).first<{ kind: string; subject: string; level: number; pending: number; lifted_at: number | null }>();
  if (!b || b.lifted_at) return false;
  await env.DB.prepare('UPDATE blocks SET lifted_at = ?2 WHERE id = ?1').bind(id, now(env)).run();
  if (b.kind === 'account') {
    await env.DB.prepare("UPDATE accounts SET blocked_until = NULL, block_reason = NULL WHERE id = ?1 AND (block_reason = 'guard' OR block_reason IS NULL)").bind(b.subject).run();
    await env.DB.prepare("DELETE FROM scores WHERE kind = 'account' AND subject = ?1").bind(b.subject).run();
  } else await env.DB.prepare('DELETE FROM scores WHERE kind = ?1 AND subject = ?2').bind(b.kind, b.subject).run();
  await journal(env, { actor, action: 'block.lift', target: { kind: b.kind as SubjectKind, id: b.subject }, before: { level: b.level, pending: b.pending } });
  return true;
}

/** Подтвердить ожидающий блок (тестировщик): блок применяется. */
export async function confirmBlock(env: Env, id: number, actor: 'owner:tg' | 'owner:web' | 'owner:bot'): Promise<boolean> {
  const b = await env.DB.prepare('SELECT * FROM blocks WHERE id = ?1 AND pending = 1 AND lifted_at IS NULL').bind(id).first<{ kind: string; subject: string; until: number | null }>();
  if (!b) return false;
  await env.DB.prepare('UPDATE blocks SET pending = 0 WHERE id = ?1').bind(id).run();
  if (b.kind === 'account') {
    await env.DB.prepare("UPDATE accounts SET blocked_until = ?2, block_reason = 'guard' WHERE id = ?1").bind(b.subject, b.until ?? FOREVER).run();
    await revokeSessions(env, b.subject);
  }
  await journal(env, { actor, action: 'block.confirm', target: { kind: b.kind as SubjectKind, id: b.subject } });
  return true;
}
