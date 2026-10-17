// Вебхук бота: только сообщения владельца (OWNER_TELEGRAM_ID). /status, /check, /pause и /panel; всё остальное — в мини-приложении.
// У каждого ответа две кнопки: мини-приложение и одноразовая ссылка для браузера — на компьютере, где мини-приложение
// не открывается (Telegram Desktop на Linux без WebKitGTK, старые клиенты).
import { budget } from './accounts';
import { fetchBalance, hasBalance, readBalance } from './balance';
import { mintPanelLink } from './admin';
import { safeEqual } from './crypto';
import { now, type Env } from './env';
import { journal } from './journal';
import { callOpenAI } from './openai';
import { TASK_SPECS } from '../../shared/prompts/tasks';
import { loadSettings, saveSetting } from './settings';
import { tgAnswer, tgEdit, tgSend, type TgButton } from './telegram';

const MODE_RU = { off: 'Выключен', owner: 'Только я', testers: 'Тестировщики', all: 'Все' } as const;

const HELP = [
  '👋 Привет! Я бот Refrain ИИ — присматриваю за сервером и сообщаю, если что-то не так.',
  '',
  'Что умею:',
  '/status — режим, расход за месяц и час, баланс Polza',
  '/check — проверить ключ ИИ (один короткий запрос, ≈ копейка)',
  '/pause — пауза: Refrain ИИ работает только у тебя',
  '/panel — открыть панель',
  '/logout — завершить все сеансы панели (на всех устройствах)',
  '',
  'Пишу сам, когда: вход в панель с нового устройства (с кнопками «Это я» / «Это не я»), сработала защита, кончаются деньги или пришёл отчёт об ошибке. Одинаковые сообщения за 10 минут склеиваю в одно.',
  '',
  'Кнопка «В браузере» — одноразовая ссылка на 5 минут для компьютера, где панель внутри Telegram не открывается. Никому её не пересылай.'
].join('\n');

/** Подсказка к коду ошибки поставщика ИИ. */
function errorHint(error: string): string {
  if (/^401|^403|ключ ИИ не задан/.test(error)) return 'Ключ не принят. Заново: в папке server `npx wrangler secret put OPENAI_API_KEY`, вставь ключ Polza целиком (без «Bearer» и кавычек), затем /check.';
  if (/^402/.test(error)) return 'На счёте Polza не хватает денег — пополни баланс.';
  if (/^404/.test(error)) return 'Не найдена модель или адрес: проверь OPENAI_MODEL и LLM_BASE_URL в server/wrangler.toml и выложи сервер.';
  if (/^429/.test(error)) return 'Polza ограничила частоту запросов — подожди минуту.';
  if (/^400|^422/.test(error)) return 'Polza не приняла запрос. Пришли этот текст ошибки разработчику.';
  return '';
}

const fmtTime = (ms: number): string => new Date(ms).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function panelButtons(env: Env): Promise<TgButton[][]> {
  return [[{ text: '📊 Открыть панель', url: env.TG_APP_URL }, { text: '🌐 В браузере', url: await mintPanelLink(env), kind: 'url' }]];
}

export async function handleWebhook(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) return new Response('forbidden', { status: 403 });
  let update: { message?: { from?: { id?: number }; chat?: { id?: number }; text?: string }; callback_query?: { id: string; from?: { id?: number }; data?: string; message?: { message_id?: number; text?: string } } };
  try {
    update = await req.json();
  } catch {
    return new Response('ok');
  }
  if (update.callback_query) return handleCallback(update.callback_query, env);
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
    const errLine = cfg.llmError ? `\nПоследняя ошибка ИИ (${fmtTime(cfg.llmError.at)} МСК, ${cfg.llmError.task}): ${cfg.llmError.error}` : '';
    await tgSend(env, `Режим: ${MODE_RU[cfg.mode]}\nМесяц: ${(totals.month / 1e6).toFixed(2)} ₽ из ${cfg.budget.monthRub} ₽\nЗа час: ${((hour?.c ?? 0) / 1e6).toFixed(2)} ₽, запросов ${hour?.n ?? 0}, ошибок ${hour?.bad ?? 0}${balLine}${errLine}`, { silent: true, buttons: await panelButtons(env) });
  } else if (cmd === '/check') {
    // Короткий запрос тем же путём, что задачи учеников (адрес, ключ, модель, параметры). В учёт не идёт: доли копейки.
    const spec = { ...TASK_SPECS['textbook.merge'], maxTokens: 300, reasoning: 'low' as const };
    const r = await callOpenAI(env, spec, 'Отвечай одним словом.', 'Скажи: готово');
    const where = `${env.LLM_BASE_URL || 'https://api.openai.com/v1'}, модель ${env.OPENAI_MODEL}`;
    let text: string;
    if (r.ok) text = `✅ ИИ отвечает (${where}): «${r.text.slice(0, 60)}»${r.usage.costMicro !== undefined ? `, цена ${(r.usage.costMicro / 1e6).toFixed(4)} ₽` : ''}.`;
    else {
      const err = r.error || String(r.status);
      if (cfg.llmError?.error !== err) await saveSetting(env, 'llmError', { at: t, task: 'check', error: err });
      const hint = errorHint(err);
      text = `❌ ИИ не ответил (${where}).\nОшибка: ${err}${hint ? `\n${hint}` : ''}`;
    }
    if (hasBalance(env)) {
      const rub = await fetchBalance(env);
      text += rub === null ? '\nБаланс Polza: не отдаёт (ключ или адрес).' : `\nБаланс Polza: ${rub.toFixed(2)} ₽.`;
    }
    await tgSend(env, text, { silent: true, buttons: await panelButtons(env) });
  } else if (cmd === '/pause') {
    if (cfg.mode !== 'owner' && cfg.mode !== 'off') await saveSetting(env, 'prevMode', cfg.mode);
    await saveSetting(env, 'mode', 'owner');
    await saveSetting(env, 'pause', { reason: 'manual', since: t });
    await journal(env, { actor: 'owner:bot', action: 'access.pause', before: cfg.mode, after: 'owner' });
    await tgSend(env, '⏸ Refrain ИИ на паузе: работает только у тебя. Вернуть режим — в панели.', { silent: true, buttons: await panelButtons(env) });
  } else if (cmd === '/panel') {
    await tgSend(env, 'Панель Refrain ИИ. Если внутри Telegram она не открывается — нажми «В браузере» (ссылка работает 5 минут и один раз).', { silent: true, buttons: await panelButtons(env) });
  } else if (cmd === '/logout') {
    const r = await env.DB.prepare('DELETE FROM admin_sessions RETURNING via').all();
    await env.DB.prepare('UPDATE panel_devices SET trusted = 0').run();
    await journal(env, { actor: 'owner:bot', action: 'panel.logout_all', reason: `сеансов: ${r.results.length}` });
    await tgSend(env, `🚪 Все сеансы панели завершены (${r.results.length}). Устройства снова считаются новыми: при входе придёт сообщение с кнопкой «Это я».`, { silent: true, buttons: await panelButtons(env) });
  } else if (cmd === '/start' || cmd === '/help') {
    await tgSend(env, HELP, { silent: true, buttons: await panelButtons(env) });
  }
  return new Response('ok');
}

/** Кнопки в сообщении «Вход в панель с нового устройства»: «Это я» — запомнить устройство; «Это не я» — закрыть его сеансы. */
async function handleCallback(q: { id: string; from?: { id?: number }; data?: string; message?: { message_id?: number; text?: string } }, env: Env): Promise<Response> {
  if (String(q.from?.id) !== String(env.OWNER_TELEGRAM_ID)) return new Response('ok');
  const m = /^pl:(ok|kill):([A-Za-z0-9_-]{16})$/.exec(q.data ?? '');
  if (!m) {
    await tgAnswer(env, q.id, 'Кнопка устарела.');
    return new Response('ok');
  }
  const [, act, h] = m;
  const base = (q.message?.text ?? '').split('\nЕсли это ты')[0];
  if (act === 'ok') {
    await env.DB.prepare('UPDATE panel_devices SET trusted = 1 WHERE substr(hash, 1, 16) = ?1').bind(h).run();
    await journal(env, { actor: 'owner:bot', action: 'panel.device_trusted', target: { kind: 'guard', id: h } });
    await tgAnswer(env, q.id, 'Запомнил: это твоё устройство.');
    if (q.message?.message_id) await tgEdit(env, q.message.message_id, `${base}\n\n✅ Это ты — устройство запомнено, тревог с него больше не будет.`, []);
  } else {
    const r = await env.DB.prepare('DELETE FROM admin_sessions WHERE substr(device_hash, 1, 16) = ?1 RETURNING via').bind(h).all();
    await env.DB.prepare('UPDATE panel_devices SET trusted = 0 WHERE substr(hash, 1, 16) = ?1').bind(h).run();
    await journal(env, { actor: 'owner:bot', action: 'panel.device_killed', target: { kind: 'guard', id: h }, reason: `сеансов: ${r.results.length}` });
    await tgAnswer(env, q.id, 'Сеанс завершён.');
    if (q.message?.message_id)
      await tgEdit(env, q.message.message_id, `${base}\n\n⛔ Сеанс с этого устройства завершён (${r.results.length}). Если вход был не твой — смени PIN панели (npx wrangler secret put ADMIN_PIN_HASH) и проверь почту владельца.`, []);
  }
  return new Response('ok');
}
