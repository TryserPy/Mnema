// Вебхук бота: только сообщения владельца (OWNER_TELEGRAM_ID). /status, /pause и /panel; всё остальное — в мини-приложении.
// У каждого ответа две кнопки: мини-приложение и одноразовая ссылка для браузера — на компьютере, где мини-приложение
// не открывается (Telegram Desktop на Linux без WebKitGTK, старые клиенты).
import { budget } from './accounts';
import { readBalance } from './balance';
import { mintPanelLink } from './admin';
import { safeEqual } from './crypto';
import { now, type Env } from './env';
import { journal } from './journal';
import { loadSettings, saveSetting } from './settings';
import { tgSend, type TgButton } from './telegram';

const MODE_RU = { off: 'Выключен', owner: 'Только я', testers: 'Тестировщики', all: 'Все' } as const;

const HELP = [
  'Refrain · панель управления.',
  '',
  '/status — режим, расход и баланс Polza',
  '/pause — пауза: Refrain ИИ работает только у тебя',
  '/panel — открыть панель',
  '',
  'Кнопка «В браузере» — одноразовая ссылка на 5 минут: для компьютера, где панель внутри Telegram не открывается (часто на Linux). Никому её не пересылай.'
].join('\n');

async function panelButtons(env: Env): Promise<TgButton[][]> {
  return [[{ text: '📊 Открыть панель', url: env.TG_APP_URL }, { text: '🌐 В браузере', url: await mintPanelLink(env), kind: 'url' }]];
}

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
    const bal = await readBalance(env, cfg, 60000);
    const balLine = !bal ? '' : bal.rub === null ? '\nБаланс Polza: не удалось узнать' : `\nБаланс Polza: ${bal.rub.toFixed(2)} ₽${bal.daysLeft !== null ? ` (≈ на ${String(bal.daysLeft).replace('.', ',')} дн.)` : ''}${bal.low ? ' ⚠️ пора пополнить' : ''}`;
    await tgSend(env, `Режим: ${MODE_RU[cfg.mode]}\nМесяц: ${(totals.month / 1e6).toFixed(2)} ₽ из ${cfg.budget.monthRub} ₽\nЗа час: ${((hour?.c ?? 0) / 1e6).toFixed(2)} ₽, запросов ${hour?.n ?? 0}, ошибок ${hour?.bad ?? 0}${balLine}`, { silent: true, buttons: await panelButtons(env) });
  } else if (cmd === '/pause') {
    if (cfg.mode !== 'owner' && cfg.mode !== 'off') await saveSetting(env, 'prevMode', cfg.mode);
    await saveSetting(env, 'mode', 'owner');
    await saveSetting(env, 'pause', { reason: 'manual', since: t });
    await journal(env, { actor: 'owner:bot', action: 'access.pause', before: cfg.mode, after: 'owner' });
    await tgSend(env, '⏸ Refrain ИИ на паузе: работает только у тебя. Вернуть режим — в панели.', { silent: true, buttons: await panelButtons(env) });
  } else if (cmd === '/panel') {
    await tgSend(env, 'Панель Refrain ИИ. Если внутри Telegram она не открывается — нажми «В браузере» (ссылка работает 5 минут и один раз).', { silent: true, buttons: await panelButtons(env) });
  } else if (cmd === '/start' || cmd === '/help') {
    await tgSend(env, HELP, { silent: true, buttons: await panelButtons(env) });
  }
  return new Response('ok');
}
