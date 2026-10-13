// Вебхук бота: только сообщения владельца (OWNER_TELEGRAM_ID). /status и /pause; всё остальное — в мини-приложении.
import { budget } from './accounts';
import { safeEqual } from './crypto';
import { now, type Env } from './env';
import { journal } from './journal';
import { loadSettings, saveSetting } from './settings';
import { tgSend } from './telegram';

const MODE_RU = { off: 'Выключен', owner: 'Только я', testers: 'Тестировщики', all: 'Все' } as const;

export async function handleWebhook(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) return new Response('forbidden', { status: 403 });
  let update: { message?: { from?: { id?: number }; chat?: { id?: number }; text?: string } };
  try {
    update = await req.json();
  } catch {
    return new Response('ok');
  }
  const m = update.message;
  if (!m || String(m.from?.id) !== String(env.OWNER_TELEGRAM_ID) || String(m.chat?.id) !== String(env.OWNER_TELEGRAM_ID)) return new Response('ok');
  const cmd = (m.text || '').trim().split(/[\s@]/)[0];
  const cfg = await loadSettings(env);
  const t = now(env);
  if (cmd === '/status') {
    const totals = await budget(env).read(t);
    const hour = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(ok = 0) AS bad, COALESCE(SUM(cost_micro), 0) AS c FROM usage WHERE at > ?1').bind(t - 3600000).first<{ n: number; bad: number; c: number }>();
    await tgSend(env, `Режим: ${MODE_RU[cfg.mode]}\nМесяц: $${(totals.month / 1e6).toFixed(2)} из $${cfg.budget.monthUsd}\nЗа час: $${((hour?.c ?? 0) / 1e6).toFixed(2)}, запросов ${hour?.n ?? 0}, ошибок ${hour?.bad ?? 0}`, { silent: true, buttons: [[{ text: 'Открыть панель', url: env.TG_APP_URL }]] });
  } else if (cmd === '/pause') {
    if (cfg.mode !== 'owner' && cfg.mode !== 'off') await saveSetting(env, 'prevMode', cfg.mode);
    await saveSetting(env, 'mode', 'owner');
    await saveSetting(env, 'pause', { reason: 'manual', since: t });
    await journal(env, { actor: 'owner:bot', action: 'access.pause', before: cfg.mode, after: 'owner' });
    await tgSend(env, '⏸ Refrain ИИ на паузе: работает только у тебя. Вернуть режим — в панели.', { silent: true, buttons: [[{ text: 'Открыть панель', url: env.TG_APP_URL }]] });
  }
  return new Response('ok');
}
