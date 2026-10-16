// Остаток на счёте поставщика ИИ (Polza.ai: GET /api/v1/balance → { amount: "123.45" } в рублях).
// Ключ тот же, что для запросов (OPENAI_API_KEY); в журнал и ответы не попадает. Напрямую OpenAI баланс не отдаёт — тогда null.
// Значение кэшируется в настройках: панель спрашивает не чаще раза в 2 минуты, проверка по расписанию — раз в 15 минут.
import type { Overview } from '../../shared/refrain/admin';
import { raiseAlert } from './alerts';
import { bump } from './auth';
import { now, outbound, type Env } from './env';
import { loadSettings, saveSetting, type Settings } from './settings';

export const TOP_UP_URL = 'https://polza.ai/dashboard';

/** Поставщик умеет сообщать баланс (сейчас — только Polza.ai). */
export const hasBalance = (env: Env): boolean => /(^|\.)polza\.ai(\/|$)/.test((env.LLM_BASE_URL || '').replace(/^https?:\/\//, ''));

/** Спросить баланс у поставщика. null — не вышло (сеть, ключ, неожиданный ответ). */
export async function fetchBalance(env: Env): Promise<number | null> {
  if (!hasBalance(env) || !env.OPENAI_API_KEY) return null;
  try {
    const res = await outbound(env)(`${(env.LLM_BASE_URL || '').replace(/\/+$/, '')}/balance`, { headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { amount?: unknown };
    const rub = typeof body.amount === 'string' || typeof body.amount === 'number' ? Number(body.amount) : NaN;
    return Number.isFinite(rub) ? rub : null;
  } catch {
    return null;
  }
}

/** Средний расход в сутки за 7 дней, ₽ (по нашему учёту). */
async function dailySpend(env: Env, t: number): Promise<number> {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(cost_micro), 0) AS c FROM usage WHERE at > ?1').bind(t - 7 * 86400000).first<{ c: number }>();
  return (r?.c ?? 0) / 1e6 / 7;
}

/** Баланс для панели и бота: из кэша, если он моложе maxAgeMs, иначе — свежий у поставщика. */
export async function readBalance(env: Env, cfg: Settings, maxAgeMs: number): Promise<Overview['balance']> {
  if (!hasBalance(env)) return null;
  const t = now(env);
  let { rub, at } = cfg.balance;
  if (t - at > maxAgeMs) {
    const fresh = await fetchBalance(env);
    if (fresh !== null) {
      rub = fresh;
      at = t;
      await saveSetting(env, 'balance', { rub, at });
    }
  }
  const perDay = await dailySpend(env, t);
  const daysLeft = rub !== null && perDay > 0 ? Math.max(0, Math.round((rub / perDay) * 10) / 10) : null;
  const low = rub !== null && (rub < cfg.budget.balanceAlertRub || (daysLeft !== null && daysLeft < cfg.budget.balanceAlertDays));
  return { rub, at: at ? new Date(at).toISOString() : null, daysLeft, low, topUpUrl: TOP_UP_URL };
}

/** По расписанию: мало денег — тревога (не чаще раза в 6 часов; совсем кончились — сразу, но тоже не чаще). */
export async function balanceCheck(env: Env): Promise<void> {
  const cfg = await loadSettings(env);
  const b = await readBalance(env, cfg, 15 * 60000);
  if (!b || b.rub === null || !b.low) return;
  const empty = b.rub <= 1;
  if ((await bump(env, empty ? 'balance:empty' : 'balance:low', 6 * 3600000)) !== 1) return;
  const days = b.daysLeft !== null ? ` При нынешнем расходе хватит примерно на ${b.daysLeft.toString().replace('.', ',')} дн.` : '';
  const a = await raiseAlert(env, {
    level: empty ? 'critical' : 'warn',
    kind: 'balance_low',
    title: empty ? 'Деньги на Polza кончились' : 'Мало денег на Polza',
    text: `На счёте Polza.ai ${b.rub.toFixed(2)} ₽.${days} Пополнить: ${TOP_UP_URL}`,
    buttons: ['open_panel']
  });
  await a.deliver;
}
