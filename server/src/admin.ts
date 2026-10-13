// API панели: сайт admin/ и мини-приложение tg/. Вход — initData Telegram или код на почту владельца + PIN. Токен 15 минут.
// Опасные действия — с PIN; 5 неверных PIN — панель закрыта на час и критическая тревога. Всё пишется в журнал.
import { ACCESS_MODES, DEFAULT_BUDGET, INVITE_RE, type AccessMode, type BudgetConfig, type GroupLimits } from '../../shared/refrain/policy';
import { DEFAULT_GUARD, type GuardConfig, type RuleId } from '../../shared/refrain/guard';
import type { AccountRow, BlockRow, BugRow, DayStat, Overview } from '../../shared/refrain/admin';
import { FOREVER, budget, effectiveGroup, normEmail, revokeSessions, type Account } from './accounts';
import { listAlerts, raiseAlert } from './alerts';
import { bump } from './auth';
import { bugToGithub } from './bugs';
import { checkPin, randomDigits, randomToken, safeEqual, tagged } from './crypto';
import { now, type Env } from './env';
import { fail, maskEmail, readJson } from './http';
import { confirmBlock, liftBlock, scoreOf } from './guard';
import { journal, journalList } from './journal';
import { sendMail } from './mail';
import { loadSettings, saveSetting, type Settings } from './settings';
import { verifyInitData } from './telegram';

const SESSION_MS = 15 * 60000;
type Actor = 'owner:tg' | 'owner:web';

async function startSession(env: Env, via: 'tg' | 'web'): Promise<Response> {
  const token = randomToken(32);
  const t = now(env);
  await env.DB.prepare('INSERT INTO admin_sessions (token_hash, expires_at, via) VALUES (?1, ?2, ?3)').bind(await tagged(env.TOKEN_SECRET, 'admin', token), t + SESSION_MS, via).run();
  await journal(env, { actor: via === 'tg' ? 'owner:tg' : 'owner:web', action: 'panel.login' });
  const a = await raiseAlert(env, { level: 'info', kind: 'panel_login', title: '🔐 Вход в панель', text: `${via === 'tg' ? 'Telegram' : 'Сайт'} · ${new Date(t).toISOString().slice(11, 16)} UTC`, groupKey: `panel_login:${t}` });
  await a.deliver;
  return Response.json({ ok: true, token, expiresAt: new Date(t + SESSION_MS).toISOString() });
}

async function lockedUntil(env: Env, cfg: Settings): Promise<number> {
  return cfg.pinLock.until > now(env) ? cfg.pinLock.until : 0;
}

/** Проверка PIN с учётом блокировки панели. */
async function pinOk(env: Env, cfg: Settings, pin: string | null): Promise<boolean> {
  if (await lockedUntil(env, cfg)) fail('blocked', { until: new Date(cfg.pinLock.until).toISOString() });
  if (pin && (await checkPin(env.ADMIN_PIN_HASH, pin))) {
    if (cfg.pinLock.fails) await saveSetting(env, 'pinLock', { fails: 0, until: 0 });
    return true;
  }
  const fails = cfg.pinLock.fails + 1;
  const lock = fails >= 5;
  await saveSetting(env, 'pinLock', { fails: lock ? 0 : fails, until: lock ? now(env) + 3600000 : 0 });
  await journal(env, { actor: 'system', action: lock ? 'panel.locked' : 'panel.pin_wrong', reason: `неверный PIN (${fails})` });
  const a = await raiseAlert(env, lock ? { level: 'critical', kind: 'pin_locked', title: 'Пять неверных PIN', text: 'Панель закрыта на час.', buttons: ['open_panel'] } : { level: 'warn', kind: 'pin_wrong', title: 'Неверный PIN в панели', text: `Попытка ${fails} из 5.` });
  await a.deliver;
  return false;
}

export async function handleAdmin(req: Request, env: Env, path: string): Promise<Response> {
  const cfg = await loadSettings(env);
  const t = now(env);
  const method = req.method;

  // ---------- вход ----------
  if (method === 'POST' && path === '/v1/admin/login/telegram') {
    if (await lockedUntil(env, cfg)) fail('blocked', { until: new Date(cfg.pinLock.until).toISOString() });
    const { body } = await readJson(req, 8192);
    if (!(await verifyInitData(env, String((body as { initData?: unknown }).initData ?? ''), t))) fail('device_unknown');
    return startSession(env, 'tg');
  }
  if (method === 'POST' && path === '/v1/admin/login/email/start') {
    if ((await bump(env, 'admin:code', 3600000)) > 5) fail('too_fast', { retryAfter: 3600 });
    const code = randomDigits(6);
    await env.DB.prepare("INSERT INTO login_codes (email, code_hash, expires_at, attempts) VALUES ('__admin__', ?1, ?2, 0) ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, locked_until = NULL")
      .bind(await tagged(env.TOKEN_SECRET, 'admin-code', code), t + 600000)
      .run();
    await sendMail(env, env.OWNER_EMAIL, `Код входа в панель Refrain: ${code}`, `Код для входа в панель Refrain ИИ: ${code}. Действует 10 минут. Если это не ты — открой бота и нажми «Пауза».`);
    return Response.json({ ok: true });
  }
  if (method === 'POST' && path === '/v1/admin/login/email/verify') {
    const { body } = await readJson(req, 1024);
    const b = body as { code?: unknown; pin?: unknown };
    const row = await env.DB.prepare("SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = '__admin__'").first<{ code_hash: string; expires_at: number; attempts: number }>();
    if (!row || row.expires_at < t || row.attempts >= 5) fail('code_invalid', { attemptsLeft: 0 });
    if (typeof b.code !== 'string' || !safeEqual(await tagged(env.TOKEN_SECRET, 'admin-code', b.code), row!.code_hash)) {
      await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = '__admin__'").run();
      fail('code_invalid', { attemptsLeft: Math.max(0, 4 - row!.attempts) });
    }
    if (!(await pinOk(env, cfg, typeof b.pin === 'string' ? b.pin : null))) fail('code_invalid');
    await env.DB.prepare("DELETE FROM login_codes WHERE email = '__admin__'").run();
    return startSession(env, 'web');
  }

  // ---------- дальше — только с токеном ----------
  const auth = req.headers.get('authorization') || '';
  const sess = auth.startsWith('Bearer ') ? await env.DB.prepare('SELECT via, expires_at FROM admin_sessions WHERE token_hash = ?1').bind(await tagged(env.TOKEN_SECRET, 'admin', auth.slice(7))).first<{ via: string; expires_at: number }>() : null;
  if (!sess || sess.expires_at < t) fail('device_unknown');
  if (await lockedUntil(env, cfg)) fail('blocked', { until: new Date(cfg.pinLock.until).toISOString() });
  const actor: Actor = sess!.via === 'tg' ? 'owner:tg' : 'owner:web';
  const needPin = async () => {
    if (!(await pinOk(env, cfg, req.headers.get('x-refrain-pin')))) fail('code_invalid');
  };
  const body = async <T>() => (await readJson(req, 64 * 1024)).body as T;
  const seg = path.split('/').slice(3); // ['mode'] | ['accounts', id, 'block'] …
  const R = (m: string, p: string) => method === m && matches(seg, p.split('/'));

  if (R('GET', 'overview')) return Response.json(await overview(env, cfg));
  if (R('PUT', 'mode')) {
    const { mode } = await body<{ mode: AccessMode }>();
    if (!ACCESS_MODES.includes(mode)) fail('bad_request');
    if (mode === 'all') await needPin();
    await saveSetting(env, 'mode', mode);
    if (mode !== 'owner' && mode !== 'off') await saveSetting(env, 'pause', { reason: null, since: null });
    await journal(env, { actor, action: 'access.set', target: { kind: 'mode', id: mode }, before: cfg.mode, after: mode });
    return Response.json({ ok: true });
  }
  if (R('POST', 'pause')) {
    if (cfg.mode !== 'off' && cfg.mode !== 'owner') await saveSetting(env, 'prevMode', cfg.mode);
    await saveSetting(env, 'mode', 'owner');
    await saveSetting(env, 'pause', { reason: 'manual', since: t });
    await journal(env, { actor, action: 'access.pause', before: cfg.mode, after: 'owner' });
    return Response.json({ ok: true });
  }
  if (R('POST', 'resume')) {
    const to = cfg.prevMode ?? 'testers';
    if (to === 'all') await needPin();
    if (cfg.leakCheck.suspected) fail('bad_request'); // сначала «Ключ заменён»
    await saveSetting(env, 'mode', to);
    await saveSetting(env, 'prevMode', null);
    await saveSetting(env, 'pause', { reason: null, since: null });
    await journal(env, { actor, action: 'access.resume', before: cfg.mode, after: to });
    return Response.json({ ok: true, mode: to });
  }
  if (R('GET', 'budget')) return Response.json({ ok: true, budget: cfg.budget });
  if (R('PUT', 'budget')) {
    const b = cleanBudget(await body<BudgetConfig>());
    if (b.monthUsd > cfg.budget.monthUsd * 2 || (b.dayUsd ?? 0) > (cfg.budget.dayUsd ?? Infinity) * 2) await needPin();
    await saveSetting(env, 'budget', b);
    await journal(env, { actor, action: 'budget.set', target: { kind: 'budget', id: 'month' }, before: cfg.budget, after: b });
    return Response.json({ ok: true });
  }
  if (R('GET', 'groups')) return Response.json({ ok: true, groups: cfg.groups });
  if (R('PUT', 'groups')) {
    const { groups } = await body<{ groups: GroupLimits[] }>();
    const clean = cleanGroups(groups, cfg.groups);
    await saveSetting(env, 'groups', clean);
    await journal(env, { actor, action: 'group.update', target: { kind: 'group', id: 'all' }, before: cfg.groups, after: clean });
    return Response.json({ ok: true });
  }
  if (R('GET', 'accounts')) {
    const q = new URL(req.url).searchParams.get('q')?.trim().toLowerCase().slice(0, 60) ?? '';
    const { results } = await env.DB.prepare('SELECT * FROM accounts WHERE (?1 = \'\' OR email LIKE ?2) ORDER BY created_at DESC LIMIT 100').bind(q, `%${q.replace(/[%_]/g, '')}%`).all<Account>();
    return Response.json({ ok: true, accounts: await Promise.all(results.map((a) => accountRow(env, cfg, a))) });
  }
  if (R('POST', 'accounts/:id/group')) {
    const { group } = await body<{ group: string }>();
    if (!cfg.groups.some((g) => g.id === group) || group === 'owner' || group === 'newbie') fail('bad_request');
    await env.DB.prepare('UPDATE accounts SET grp = ?2 WHERE id = ?1').bind(seg[1], group).run();
    await journal(env, { actor, action: 'account.group', target: { kind: 'account', id: seg[1] }, after: group });
    return Response.json({ ok: true });
  }
  if (R('POST', 'accounts/:id/block')) {
    const { minutes, reason } = await body<{ minutes: number | null; reason?: string }>();
    const until = minutes ? t + Math.min(Math.max(minutes, 1), 525600) * 60000 : FOREVER;
    const a = await env.DB.prepare('SELECT email FROM accounts WHERE id = ?1').bind(seg[1]).first<{ email: string }>();
    if (!a) fail('bad_request');
    await env.DB.prepare("UPDATE accounts SET blocked_until = ?2, block_reason = 'manual' WHERE id = ?1").bind(seg[1], until).run();
    await env.DB.prepare("INSERT INTO blocks (kind, subject, label, account_id, level, reason, rules, since, until) VALUES ('account', ?1, ?2, ?1, 2, ?3, '[]', ?4, ?5)").bind(seg[1], maskEmail(a!.email), String(reason ?? 'вручную').slice(0, 200), t, until === FOREVER ? null : until).run();
    await revokeSessions(env, seg[1]);
    await journal(env, { actor, action: 'account.block', target: { kind: 'account', id: seg[1] }, reason: reason ?? 'вручную', after: { until } });
    return Response.json({ ok: true });
  }
  if (R('POST', 'accounts/:id/unblock')) {
    await env.DB.prepare('UPDATE accounts SET blocked_until = NULL, block_reason = NULL WHERE id = ?1').bind(seg[1]).run();
    await env.DB.prepare("UPDATE blocks SET lifted_at = ?2 WHERE kind = 'account' AND subject = ?1 AND lifted_at IS NULL").bind(seg[1], t).run();
    await env.DB.prepare("DELETE FROM scores WHERE kind = 'account' AND subject = ?1").bind(seg[1]).run();
    await journal(env, { actor, action: 'account.unblock', target: { kind: 'account', id: seg[1] } });
    return Response.json({ ok: true });
  }
  if (R('GET', 'testers')) {
    const { results } = await env.DB.prepare('SELECT email, added_at FROM testers ORDER BY added_at DESC').all<{ email: string; added_at: number }>();
    return Response.json({ ok: true, testers: results.map((r) => ({ email: r.email, emailMasked: maskEmail(r.email), addedAt: new Date(r.added_at).toISOString() })) });
  }
  if (R('POST', 'testers')) {
    const { email } = await body<{ email: string }>();
    const e = normEmail(String(email ?? ''));
    if (!/^[^@\s]{1,64}@[^@\s]{3,190}$/.test(e)) fail('email_rejected');
    await env.DB.prepare('INSERT INTO testers (email, added_at) VALUES (?1, ?2) ON CONFLICT DO NOTHING').bind(e, t).run();
    await journal(env, { actor, action: 'tester.add', target: { kind: 'group', id: maskEmail(e) } });
    return Response.json({ ok: true });
  }
  if (R('DELETE', 'testers/:email')) {
    const e = normEmail(decodeURIComponent(seg[1]));
    await env.DB.prepare('DELETE FROM testers WHERE email = ?1').bind(e).run();
    await journal(env, { actor, action: 'tester.remove', target: { kind: 'group', id: maskEmail(e) } });
    return Response.json({ ok: true });
  }
  if (R('GET', 'invites')) {
    const { results } = await env.DB.prepare('SELECT * FROM invites ORDER BY created_at DESC LIMIT 100').all<{ code: string; seats: number; used: number; expires_at: number; grp: string; revoked: number }>();
    return Response.json({ ok: true, invites: results.map((r) => ({ code: r.code, seats: r.seats, used: r.used, expiresAt: new Date(r.expires_at).toISOString(), group: r.grp, revoked: Boolean(r.revoked) })) });
  }
  if (R('POST', 'invites')) {
    const { seats, days, group } = await body<{ seats: number; days: number; group: string }>();
    if (!Number.isInteger(seats) || seats < 1 || seats > 500 || !Number.isInteger(days) || days < 1 || days > 365 || !cfg.groups.some((g) => g.id === group) || group === 'owner' || group === 'blocked') fail('bad_request');
    const code = inviteCode();
    await env.DB.prepare('INSERT INTO invites (code, seats, expires_at, grp, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(code, seats, t + days * 86400000, group, t).run();
    await journal(env, { actor, action: 'invite.create', target: { kind: 'invite', id: code }, after: { seats, days, group } });
    return Response.json({ ok: true, invite: { code, seats, used: 0, expiresAt: new Date(t + days * 86400000).toISOString(), group, revoked: false } });
  }
  if (R('DELETE', 'invites/:code')) {
    if (!INVITE_RE.test(seg[1])) fail('bad_request');
    await env.DB.prepare('UPDATE invites SET revoked = 1 WHERE code = ?1').bind(seg[1]).run();
    await journal(env, { actor, action: 'invite.revoke', target: { kind: 'invite', id: seg[1] } });
    return Response.json({ ok: true });
  }
  if (R('GET', 'blocks')) {
    const { results } = await env.DB.prepare('SELECT * FROM blocks WHERE lifted_at IS NULL AND (until IS NULL OR until > ?1) ORDER BY id DESC LIMIT 200').bind(t).all<Record<string, unknown>>();
    const rows: BlockRow[] = results.map((r) => ({ id: Number(r.id), kind: r.kind as BlockRow['kind'], label: String(r.label), reason: `${Number(r.level) === 1 ? 'замедление' : 'блок'} · ${r.reason}`, rules: JSON.parse(String(r.rules)), since: new Date(Number(r.since)).toISOString(), until: r.until ? new Date(Number(r.until)).toISOString() : null, pending: Boolean(r.pending) }));
    return Response.json({ ok: true, blocks: rows });
  }
  if (R('POST', 'blocks/lift-all')) {
    await needPin();
    const { results } = await env.DB.prepare('SELECT id FROM blocks WHERE lifted_at IS NULL').all<{ id: number }>();
    for (const r of results) await liftBlock(env, r.id, actor);
    return Response.json({ ok: true, lifted: results.length });
  }
  if (R('POST', 'blocks/:id/lift')) return Response.json({ ok: await liftBlock(env, Number(seg[1]), actor) });
  if (R('POST', 'blocks/:id/confirm')) return Response.json({ ok: await confirmBlock(env, Number(seg[1]), actor) });
  if (R('GET', 'guard')) return Response.json({ ok: true, guard: cfg.guard });
  if (R('PUT', 'guard')) {
    await needPin();
    const g = cleanGuard(await body<GuardConfig>());
    await saveSetting(env, 'guard', g);
    await journal(env, { actor, action: 'guard.config', target: { kind: 'guard', id: 'config' }, before: cfg.guard, after: g });
    return Response.json({ ok: true });
  }
  if (R('GET', 'alerts')) return Response.json({ ok: true, alerts: await listAlerts(env, new URL(req.url).searchParams.get('unread') === '1') });
  if (R('POST', 'alerts/:id/read')) {
    await env.DB.prepare('UPDATE alerts SET read_at = ?2 WHERE id = ?1').bind(Number(seg[1]), t).run();
    return Response.json({ ok: true });
  }
  if (R('GET', 'journal')) {
    const before = Number(new URL(req.url).searchParams.get('before')) || null;
    return Response.json({ ok: true, journal: await journalList(env, before) });
  }
  if (R('GET', 'stats')) {
    const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 30, 1), 90);
    return Response.json({ ok: true, stats: await stats(env, days) });
  }
  if (R('GET', 'bugs')) {
    const { results } = await env.DB.prepare('SELECT * FROM bugs ORDER BY id DESC LIMIT 100').all<Record<string, unknown>>();
    const rows: BugRow[] = results.map((r) => ({ id: Number(r.id), at: new Date(Number(r.at)).toISOString(), category: String(r.category), text: String(r.text), app: JSON.parse(String(r.app)), log: JSON.parse(String(r.log)), status: r.status as BugRow['status'], githubIssue: r.github_issue ? Number(r.github_issue) : undefined }));
    return Response.json({ ok: true, bugs: rows });
  }
  if (R('POST', 'bugs/:id/github')) {
    const n = await bugToGithub(env, Number(seg[1]));
    if (n === null) fail('upstream');
    await env.DB.prepare("UPDATE bugs SET status = 'github', github_issue = ?2 WHERE id = ?1").bind(Number(seg[1]), n).run();
    await journal(env, { actor, action: 'bug.github', target: { kind: 'bug', id: seg[1] }, after: n });
    return Response.json({ ok: true, issue: n });
  }
  if (R('POST', 'bugs/:id/done')) {
    await env.DB.prepare("UPDATE bugs SET status = 'done' WHERE id = ?1").bind(Number(seg[1])).run();
    await journal(env, { actor, action: 'bug.done', target: { kind: 'bug', id: seg[1] } });
    return Response.json({ ok: true });
  }
  if (R('POST', 'bugs/:id/spam')) {
    const b = await env.DB.prepare('SELECT sender FROM bugs WHERE id = ?1').bind(Number(seg[1])).first<{ sender: string }>();
    await env.DB.prepare("UPDATE bugs SET status = 'spam' WHERE id = ?1").bind(Number(seg[1])).run();
    if (b) await env.DB.prepare("INSERT INTO blocks (kind, subject, label, level, reason, rules, since, until) VALUES ('ip', ?1, 'отправитель бага', 2, 'спам в баги', '[]', ?2, ?3)").bind(b.sender, t, t + 7 * 86400000).run();
    await journal(env, { actor, action: 'bug.spam', target: { kind: 'bug', id: seg[1] } });
    return Response.json({ ok: true });
  }
  if (R('POST', 'key-rotated')) {
    await needPin();
    await saveSetting(env, 'leakCheck', { at: t, suspected: false });
    await journal(env, { actor, action: 'key.rotated', target: { kind: 'key', id: 'openai' } });
    return Response.json({ ok: true });
  }
  return fail('bad_request');
}

function matches(seg: string[], pattern: string[]): boolean {
  return seg.length === pattern.length && pattern.every((p, i) => p.startsWith(':') ? /^[\w@.%+-]{1,200}$/.test(seg[i]) : p === seg[i]);
}

function inviteCode(): string {
  const abc = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const r = crypto.getRandomValues(new Uint8Array(8));
  const s = [...r].map((x) => abc[x % abc.length]).join('');
  return `RFN-${s.slice(0, 4)}-${s.slice(4)}`;
}

const num = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : def);

function cleanBudget(b: BudgetConfig): BudgetConfig {
  const d = DEFAULT_BUDGET;
  return {
    monthUsd: num(b?.monthUsd, 0, 10000, d.monthUsd),
    dayUsd: b?.dayUsd === null ? null : num(b?.dayUsd, 0, 1000, d.monthUsd / 15),
    alertAt: Array.isArray(b?.alertAt) ? b.alertAt.filter((x) => typeof x === 'number' && x > 0 && x <= 1).slice(0, 5) : d.alertAt,
    spikeFactor: num(b?.spikeFactor, 1.5, 100, d.spikeFactor),
    spikeMinUsd: num(b?.spikeMinUsd, 0, 100, d.spikeMinUsd),
    greedyShare: num(b?.greedyShare, 0.001, 1, d.greedyShare),
    signupWaveHour: num(b?.signupWaveHour, 1, 100000, d.signupWaveHour),
    signupWavePerIp: num(b?.signupWavePerIp, 1, 1000, d.signupWavePerIp),
    upstreamErrorShare: num(b?.upstreamErrorShare, 0.01, 1, d.upstreamErrorShare)
  };
}

function cleanGroups(list: GroupLimits[], prev: GroupLimits[]): GroupLimits[] {
  if (!Array.isArray(list)) fail('bad_request');
  const out: GroupLimits[] = [];
  for (const g of list.slice(0, 20)) {
    if (!g || typeof g.id !== 'string' || !/^(owner|tester|newbie|student|blocked|g_[a-z0-9]{1,20})$/.test(g.id)) continue;
    const base = prev.find((x) => x.id === g.id);
    const lim = (v: unknown) => (v === null ? null : num(v, 0, 100000, 0));
    out.push({
      id: g.id,
      title: typeof g.title === 'string' ? g.title.slice(0, 40) : (base?.title ?? g.id),
      perDay: g.id === 'blocked' ? 0 : lim(g.perDay),
      perMonth: g.id === 'blocked' ? 0 : lim(g.perMonth),
      perMinute: g.id === 'blocked' ? 0 : num(g.perMinute, 0, 600, 6),
      devices: num(g.devices, 0, 20, 3),
      // Порог защиты владельца и подтверждение блока тестировщика из панели не меняются.
      guardFactor: g.id === 'owner' ? Infinity : num(g.guardFactor, 1, 20, base?.guardFactor ?? 1),
      blockNeedsConfirm: g.id === 'owner' || g.id === 'tester' ? true : Boolean(g.blockNeedsConfirm)
    });
  }
  for (const p of prev) if (!out.some((x) => x.id === p.id) && !p.id.startsWith('g_')) out.push(p);
  return out;
}

function cleanGuard(g: GuardConfig): GuardConfig {
  const d = DEFAULT_GUARD;
  const rules = { ...d.rules };
  for (const id of Object.keys(d.rules) as RuleId[]) {
    const r = g?.rules?.[id];
    if (!r) continue;
    const params: Record<string, number> = { ...(d.rules[id].params ?? {}) };
    for (const k of Object.keys(params)) params[k] = num(r.params?.[k], 0, 1e6, params[k]);
    rules[id] = { ...d.rules[id], weight: num(r.weight, 0, 1000, d.rules[id].weight), enabled: r.enabled !== false, ...(d.rules[id].params ? { params } : {}) };
  }
  return {
    rules,
    halfLifeMin: num(g?.halfLifeMin, 1, 1440, d.halfLifeMin),
    level1: num(g?.level1, 1, 10000, d.level1),
    level2: Math.max(num(g?.level2, 1, 10000, d.level2), num(g?.level1, 1, 10000, d.level1) + 1),
    slowdownFactor: num(g?.slowdownFactor, 1, 100, d.slowdownFactor),
    slowdownMin: num(g?.slowdownMin, 1, 1440, d.slowdownMin),
    blockAccountMin: num(g?.blockAccountMin, 1, 525600, d.blockAccountMin),
    blockIpMin: num(g?.blockIpMin, 1, 43200, d.blockIpMin),
    blockAsnMin: num(g?.blockAsnMin, 1, 43200, d.blockAsnMin),
    massAccounts: num(g?.massAccounts, 2, 100000, d.massAccounts),
    massWindowMin: num(g?.massWindowMin, 1, 1440, d.massWindowMin),
    leak: {
      enabled: g?.leak?.enabled !== false,
      everyMin: num(g?.leak?.everyMin, 5, 60, d.leak.everyMin),
      windowMin: num(g?.leak?.windowMin, 10, 1440, d.leak.windowMin),
      lagMin: num(g?.leak?.lagMin, 0, 120, d.leak.lagMin),
      overShare: num(g?.leak?.overShare, 0.01, 10, d.leak.overShare),
      overUsd: num(g?.leak?.overUsd, 0, 1000, d.leak.overUsd),
      idleUsd: num(g?.leak?.idleUsd, 0, 1000, d.leak.idleUsd)
    }
  };
}

async function overview(env: Env, cfg: Settings): Promise<Overview> {
  const t = now(env);
  const totals = await budget(env).read(t);
  const days = new Date(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 0).getDate();
  const dayStart = t - ((t + 3 * 3600000) % 86400000);
  const today = await env.DB.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT account_id) AS a, SUM(ok = 0) AS bad FROM usage WHERE at >= ?1').bind(dayStart).first<{ n: number; a: number; bad: number }>();
  const hour = await env.DB.prepare('SELECT COALESCE(SUM(cost_micro), 0) AS c FROM usage WHERE at > ?1').bind(t - 3600000).first<{ c: number }>();
  const counts = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM alerts WHERE read_at IS NULL) AS al, (SELECT COUNT(*) FROM bugs WHERE status = 'new') AS bg, (SELECT COUNT(*) FROM blocks WHERE lifted_at IS NULL AND (until IS NULL OR until > ?1)) AS bl").bind(t).first<{ al: number; bg: number; bl: number }>();
  return {
    ok: true,
    mode: cfg.mode,
    prevMode: cfg.prevMode,
    paused: { reason: cfg.pause.reason === 'leak' ? 'guard' : cfg.pause.reason, since: cfg.pause.since ? new Date(cfg.pause.since).toISOString() : null },
    month: { spentUsd: totals.month / 1e6, budgetUsd: cfg.budget.monthUsd, pages: Math.round(totals.month / 650) },
    today: { spentUsd: totals.day / 1e6, budgetUsd: cfg.budget.dayUsd ?? (cfg.budget.monthUsd / days) * 2, students: today?.a ?? 0, requests: today?.n ?? 0, errors: today?.bad ?? 0 },
    lastHourUsd: (hour?.c ?? 0) / 1e6,
    unreadAlerts: counts?.al ?? 0,
    newBugs: counts?.bg ?? 0,
    activeBlocks: counts?.bl ?? 0
  };
}

async function accountRow(env: Env, cfg: Settings, a: Account): Promise<AccountRow> {
  const t = now(env);
  const dayStart = t - ((t + 3 * 3600000) % 86400000);
  const u = await env.DB.prepare('SELECT COALESCE(SUM(CASE WHEN at >= ?2 THEN cost_micro END), 0) AS d, COALESCE(SUM(cost_micro), 0) AS m FROM usage WHERE account_id = ?1 AND at >= ?3').bind(a.id, dayStart, t - 31 * 86400000).first<{ d: number; m: number }>();
  const dev = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices WHERE account_id = ?1 AND revoked = 0').bind(a.id).first<{ n: number }>();
  return {
    id: a.id,
    emailMasked: maskEmail(a.email),
    group: await effectiveGroup(env, a),
    createdAt: new Date(a.created_at).toISOString(),
    todayPages: Math.round(((u?.d ?? 0) / 650) * 10) / 10,
    monthPages: Math.round(((u?.m ?? 0) / 650) * 10) / 10,
    devices: dev?.n ?? 0,
    blockedUntil: a.blocked_until && a.blocked_until > t ? new Date(Math.min(a.blocked_until, 8.64e15)).toISOString() : null,
    score: Math.round(await scoreOf(env, 'account', a.id, cfg.guard.halfLifeMin))
  };
}

async function stats(env: Env, days: number): Promise<DayStat[]> {
  const t = now(env);
  const { results } = await env.DB.prepare("SELECT date((at + 10800000) / 1000, 'unixepoch') AS day, task, SUM(cost_micro) AS c, COUNT(*) AS n FROM usage WHERE at > ?1 GROUP BY day, task ORDER BY day").bind(t - days * 86400000).all<{ day: string; task: string; c: number; n: number }>();
  const map = new Map<string, DayStat>();
  for (const r of results) {
    const d = map.get(r.day) ?? { day: r.day, usd: 0, pages: 0, requests: 0, byTask: {} };
    d.usd += r.c / 1e6;
    d.pages += r.c / 650;
    d.requests += r.n;
    d.byTask[r.task] = { usd: r.c / 1e6, requests: r.n };
    map.set(r.day, d);
  }
  return [...map.values()];
}
