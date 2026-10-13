// Раз в 5 минут: повторы тревог, сверка с OpenAI, скачок расхода, чистка старых записей.
import { retryAlerts, raiseAlert } from './alerts';
import { bump } from './auth';
import { now, type Env } from './env';
import { leakCheck } from './guard/leak';
import { journal } from './journal';
import { loadSettings, saveSetting } from './settings';

export async function scheduled(env: Env): Promise<void> {
  await retryAlerts(env);
  const cfg = await loadSettings(env);
  await leakCheck(env, cfg).catch(() => null);
  await spikeCheck(env);
  await cleanup(env);
}

/** Скачок: за час втрое больше среднего часа за неделю → режим «Тестировщики» и тревога. */
export async function spikeCheck(env: Env): Promise<boolean> {
  const cfg = await loadSettings(env);
  const t = now(env);
  const hour = (await env.DB.prepare('SELECT COALESCE(SUM(cost_micro), 0) AS c FROM usage WHERE at > ?1').bind(t - 3600000).first<{ c: number }>())!.c / 1e6;
  const week = (await env.DB.prepare('SELECT COALESCE(SUM(cost_micro), 0) AS c FROM usage WHERE at > ?1 AND at <= ?2').bind(t - 7 * 86400000, t - 3600000).first<{ c: number }>())!.c / 1e6;
  const avg = week / (7 * 24 - 1);
  if (hour < cfg.budget.spikeMinUsd || hour <= avg * cfg.budget.spikeFactor) return false;
  if ((await bump(env, 'spike', 3600000)) !== 1) return false;
  const switched = cfg.mode === 'all';
  if (switched) {
    await saveSetting(env, 'prevMode', 'all');
    await saveSetting(env, 'mode', 'testers');
    await saveSetting(env, 'pause', { reason: 'spike', since: t });
  }
  await journal(env, { actor: 'system', action: 'budget.spike', reason: `за час $${hour.toFixed(2)}, среднее $${avg.toFixed(2)}`, before: cfg.mode, after: switched ? 'testers' : cfg.mode });
  const top = await env.DB.prepare('SELECT a.email AS email, SUM(u.cost_micro) AS c FROM usage u JOIN accounts a ON a.id = u.account_id WHERE u.at > ?1 GROUP BY u.account_id ORDER BY c DESC LIMIT 1').bind(t - 3600000).first<{ email: string; c: number }>();
  const ratio = avg > 0 ? (hour / avg).toFixed(1).replace('.', ',') : '∞';
  const a = await raiseAlert(env, {
    level: 'warn',
    kind: 'spike',
    title: 'Скачок расхода',
    text: `За час $${hour.toFixed(2)} — в ${ratio} раза выше обычного.${top ? ` Больше всех: ${top.email.slice(0, 1)}***@${top.email.split('@')[1]} — ${Math.round(top.c / 650)} стр. за час.` : ''}`,
    done: switched ? ['mode_testers'] : [],
    buttons: ['block', 'restore_mode', 'open_panel']
  });
  await a.deliver;
  return true;
}

async function cleanup(env: Env): Promise<void> {
  const t = now(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM events WHERE at < ?1').bind(t - 48 * 3600000),
    env.DB.prepare('DELETE FROM pow_used WHERE expires_at < ?1').bind(t),
    env.DB.prepare('DELETE FROM counters WHERE reset_at < ?1').bind(t),
    env.DB.prepare('DELETE FROM login_codes WHERE expires_at < ?1 AND (locked_until IS NULL OR locked_until < ?1)').bind(t),
    env.DB.prepare('DELETE FROM refresh_used WHERE used_at < ?1').bind(t - 31 * 86400000),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(t),
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?1').bind(t),
    env.DB.prepare('DELETE FROM bugs WHERE at < ?1').bind(t - 90 * 86400000),
    env.DB.prepare('DELETE FROM scores WHERE updated_at < ?1').bind(t - 2 * 86400000)
  ]);
}
