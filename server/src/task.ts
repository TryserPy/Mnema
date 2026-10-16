// POST /v1/task — главный путь: подпись → блоки → контракт и детектор → доступ → лимиты → резерв бюджета → OpenAI → списание.
// Промт собирает сервер. Текст запроса и ответ ИИ нигде не сохраняются: в базу идут только цифры.
import { FIELD_LIMITS, type TaskId, type TaskRequest, type TaskResponse } from '../../shared/refrain/api.mjs';
import type { RuleId } from '../../shared/refrain/guard';
import { admits, dayBudgetRub } from '../../shared/refrain/policy';
import { PAGE_MICRO, TASK_SPECS, costMicro, maxCostMicro } from '../../shared/prompts/tasks';
import { lunaSystem, lunaUser } from '../../shared/prompts/luna';
import { budget, groupLimits, quotaOf, student } from './accounts';
import { dayKey, monthKey } from './counters';
import { raiseAlert } from './alerts';
import { fromB64 } from './crypto';
import { now, type Env } from './env';
import { fail, maskEmail, readJson, type ClientInfo } from './http';
import { gate, signal, type Subjects } from './guard';
import { checkTaskBody, imageInfo } from './guard/rules';
import { recordEvent, windowRules } from './guard/windows';
import { bump } from './auth';
import { callOpenAI } from './openai';
import { loadSettings, saveSetting, type Settings } from './settings';
import { verifySigned } from './sign';

export async function handleTask(req: Request, env: Env, info: ClientInfo, ctx: ExecutionContext): Promise<Response> {
  const { raw, body } = await readJson(req, FIELD_LIMITS.bodyBytes);
  const s = await verifySigned(req, env, raw, info, 'access');
  const cfg = await loadSettings(env);
  const t = now(env);
  const subjects: Subjects = { info, account: { id: s.account.id, email: s.account.email, group: s.group }, device: { id: s.device.id, name: s.device.name, platform: s.device.platform } };

  const g = await gate(env, subjects, cfg);
  if (g.blocked || s.group === 'blocked') fail('blocked', { until: g.blocked?.until ? new Date(g.blocked.until).toISOString() : s.account.blocked_until && s.account.blocked_until < 9e15 ? new Date(s.account.blocked_until).toISOString() : null });

  // Контракт и детектор.
  const check = checkTaskBody(body);
  const b = body as TaskRequest;
  let image: { mime: string; data: string } | undefined;
  if (!check.error && b.image) {
    let bytes: Uint8Array | null = null;
    try {
      bytes = fromB64(b.image.data);
    } catch {
      bytes = null;
    }
    const im = bytes && imageInfo(bytes);
    if (!bytes || !im || im.mime !== b.image.mime) {
      check.rules.push('extra_fields');
      check.error = 'bad_request';
    } else if (bytes.length > FIELD_LIMITS.imageBytes || Math.max(im.width, im.height) > FIELD_LIMITS.imageSide) {
      check.rules.push('oversize');
      check.error = 'payload_too_large';
    } else image = b.image;
  }
  const lim = groupLimits(cfg, s.group, t);
  const rules: RuleId[] = [...check.rules, ...s.clientRules, ...(await windowRules(env, cfg, info, s.account.id, lim))];
  if (rules.length) {
    const r = await signal(env, rules, subjects, cfg);
    if (r.reactions.includes('block_account')) fail('blocked', { until: null });
    if (r.reactions.includes('revoke_tokens')) fail('session_revoked');
  }
  if (check.error) fail(check.error);

  // Доступ: режим и закрытый тест.
  if (!admits(cfg.mode, s.group)) fail(cfg.mode === 'off' || cfg.mode === 'owner' ? 'paused' : 'access_closed');

  const spec = TASK_SPECS[b.task as TaskId];
  const reserve = maxCostMicro(spec, b.text?.length ?? 0, Boolean(image));
  const perMinute = Math.floor(lim.perMinute / g.slowdown);
  const begin = await student(env, s.account.id).begin({
    now: t,
    dayLimit: lim.perDay === null ? null : lim.perDay * PAGE_MICRO,
    monthLimit: lim.perMonth === null ? null : lim.perMonth * PAGE_MICRO,
    perMinute,
    reserve
  });
  if (!begin.ok) {
    if (begin.parallel) ctx.waitUntil(signal(env, ['parallel'], subjects, cfg).then(() => undefined));
    if (begin.code === 'too_fast') fail('too_fast', { retryAfter: begin.retryAfter ?? 60 });
    fail(begin.code, { quota: quotaOf(await student(env, s.account.id).usage(t), lim, s.group, t) });
  }
  const ticket = (begin as { ticket: string }).ticket;
  const days = new Date(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 0).getDate();
  const limits = { day: Math.round(dayBudgetRub(cfg.budget, days) * 1e6), month: Math.round(cfg.budget.monthRub * 1e6) };
  const res = await budget(env).reserve(ticket, reserve, limits, t, s.group === 'owner');
  if (!res.ok) {
    await student(env, s.account.id).settle(ticket, 0, t);
    ctx.waitUntil(budgetAlerts(env, cfg, res.totals.month, limits.month, true));
    fail('paused');
  }

  await recordEvent(env, 'task', info, { accountId: s.account.id, deviceId: s.device.id, task: spec.id });
  // Строка учёта пишется до вызова — с резервом (ok = -1): если Worker не доживёт до списания, сверка с OpenAI всё равно увидит расход.
  const row = await env.DB.prepare('INSERT INTO usage (at, account_id, grp, task, input_tokens, cached_tokens, output_tokens, cost_micro, ok, ms) VALUES (?1, ?2, ?3, ?4, 0, 0, 0, ?5, -1, 0) RETURNING id')
    .bind(t, s.account.id, s.group, spec.id, reserve)
    .first<{ id: number }>();
  // Вызов и списание — в waitUntil: разрыв соединения клиентом не отменяет списание (иначе брошенная задача была бы бесплатной).
  const work = (async () => {
    const started = Date.now();
    let llm: Awaited<ReturnType<typeof callOpenAI>>;
    try {
      llm = await callOpenAI(env, spec, lunaSystem(spec.id), lunaUser(spec.id, { subject: b.subject, topic: b.topic, page: b.page, text: b.text, wishes: b.wishes }), image);
    } catch {
      llm = { ok: false, status: 0, usage: null };
    }
    // Ученику — страницы по прайсу модели (предсказуемо: «2 000 на вход и 900 на выход» — одна страница);
    // бюджету и учёту — настоящая цена поставщика (у Polza с наценкой и округлением), если он её прислал.
    const cost = llm.usage ? costMicro(llm.usage) : 0;
    const spent = llm.usage ? (llm.usage.costMicro ?? cost) : 0;
    const usage = await student(env, s.account.id).settle(ticket, cost, now(env));
    const totals = await budget(env).settle(ticket, spent, now(env));
    await env.DB.prepare('UPDATE usage SET input_tokens = ?2, cached_tokens = ?3, output_tokens = ?4, cost_micro = ?5, ok = ?6, ms = ?7 WHERE id = ?1')
      .bind(row!.id, llm.usage?.inputTokens ?? 0, llm.usage?.cachedInputTokens ?? 0, llm.usage?.outputTokens ?? 0, spent, llm.ok ? 1 : 0, Date.now() - started)
      .run();
    if (!llm.ok) ctx.waitUntil(saveSetting(env, 'llmError', { at: now(env), task: spec.id, error: llm.error || String(llm.status) }));
    ctx.waitUntil(afterTask(env, cfg, totals.month, limits, s.account.id, s.account.email, usage.day, !llm.ok));
    return { llm, cost, usage };
  })();
  ctx.waitUntil(work);
  const { llm, cost, usage } = await work;
  if (!llm.ok) fail('upstream');

  const text = cleanAnswer((llm as { text: string }).text, spec.format);
  if (text === null) fail('upstream');
  const out: TaskResponse = { ok: true, text: text!, format: spec.format, promptVersion: spec.promptVersion, charged: Math.round((cost / PAGE_MICRO) * 100) / 100, quota: quotaOf(usage, lim, s.group, t) };
  return Response.json(out);
}

/** Ответ ИИ — недоверенный: убираем обёртку ```, JSON проверяем на разбор. null — ответ негодный. */
function cleanAnswer(text: string, format: TaskResponse['format']): string | null {
  let t = text.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
  if (format === 'json') {
    try {
      JSON.parse(t);
    } catch {
      const m = /\{[\s\S]*\}/.exec(t);
      if (!m) return null;
      try {
        JSON.parse(m[0]);
        t = m[0];
      } catch {
        return null;
      }
    }
  }
  return t;
}

/** После задачи: пороги бюджета, жадный ученик, сбои OpenAI. Ошибки здесь не ломают ответ ученику. */
async function afterTask(env: Env, cfg: Settings, monthSpent: number, limits: { day: number; month: number }, accountId: string, email: string, accountDay: number, failed: boolean): Promise<void> {
  try {
    await budgetAlerts(env, cfg, monthSpent, limits.month, false);
    if (accountDay > limits.day * cfg.budget.greedyShare && (await bump(env, `greedy:${accountId}:${dayKey(now(env))}`, 86400000)) === 1) {
      const a = await raiseAlert(env, { level: 'warn', kind: 'greedy', title: 'Жадный ученик', text: `Один аккаунт потратил за сутки ${(accountDay / 1e6).toFixed(2)} ₽ — больше ${Math.round(cfg.budget.greedyShare * 100)} % дневного бюджета.`, who: { email: maskEmail(email) }, buttons: ['block', 'open_panel'], target: accountId, groupKey: `greedy:${accountId}` });
      await a.deliver;
    }
    if (failed) {
      const r = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(ok = 0) AS bad FROM usage WHERE at > ?1').bind(now(env) - 600000).first<{ n: number; bad: number }>();
      if (r && r.n >= 5 && r.bad / r.n > cfg.budget.upstreamErrorShare) {
        const a = await raiseAlert(env, { level: 'warn', kind: 'upstream', title: 'Сбои OpenAI', text: `За 10 минут ошибок: ${r.bad} из ${r.n}.`, buttons: ['pause', 'open_panel'] });
        await a.deliver;
      }
    }
  } catch {
    /* тревоги не важнее ответа ученику; недоставленные повторит cron */
  }
}

/** Тревоги бюджета 50 / 80 / 100 %: каждая один раз за месяц. На 100 % резерв сам не пускает никого, кроме владельца. */
export async function budgetAlerts(env: Env, cfg: Settings, spent: number, monthLimit: number, refused: boolean): Promise<void> {
  const share = refused ? 1 : spent / monthLimit;
  const month = monthKey(now(env));
  for (const p of cfg.budget.alertAt) {
    if (share < p) continue;
    if ((await bump(env, `budget:${month}:${p}`, 40 * 86400000)) !== 1) continue;
    const full = p >= 1;
    const a = await raiseAlert(env, {
      level: full ? 'critical' : 'warn',
      kind: 'budget',
      title: `Бюджет ${Math.round(p * 100)} %`,
      text: `Потрачено ${(spent / 1e6).toFixed(2)} ₽ из ${cfg.budget.monthRub} ₽ за месяц.${full ? ' Refrain ИИ на паузе для всех, кроме тебя.' : ''}`,
      done: full ? ['budget_pause'] : [],
      buttons: ['open_panel'],
      groupKey: `budget:${p}`
    });
    await a.deliver;
  }
}
