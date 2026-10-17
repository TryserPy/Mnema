// Telegram: отправка владельцу и проверка initData мини-приложения. Токен бота стоит в адресе запроса, поэтому адрес нигде не пишется в журнал.
import { hex, hmac, safeEqual } from './crypto';
import { outbound, type Env } from './env';

export interface TgButton {
  text: string;
  url?: string;
  /** 'app' (по умолчанию) — мини-приложение внутри Telegram; 'url' — обычная ссылка; 'callback' — ответ прямо в боте (data). */
  kind?: 'app' | 'url' | 'callback';
  data?: string;
}

const keyboard = (rows: TgButton[][]) => ({ inline_keyboard: rows.map((row) => row.map((b) => (b.kind === 'callback' ? { text: b.text, callback_data: b.data } : b.kind === 'url' ? { text: b.text, url: b.url } : { text: b.text, web_app: { url: b.url } }))) });

/** Сообщение владельцу. Возвращает id сообщения или null, если Telegram не ответил. */
export async function tgSend(env: Env, text: string, o: { silent: boolean; buttons?: TgButton[][] }): Promise<number | null> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.OWNER_TELEGRAM_ID) return null;
  try {
    const res = await outbound(env)(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.OWNER_TELEGRAM_ID,
        text,
        disable_notification: o.silent,
        link_preview_options: { is_disabled: true },
        ...(o.buttons?.length ? { reply_markup: keyboard(o.buttons) } : {})
      })
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; result?: { message_id?: number } };
    return body.ok && typeof body.result?.message_id === 'number' ? body.result.message_id : null;
  } catch {
    return null;
  }
}

/** Поправить сообщение. buttons — новые кнопки (пустой список — убрать кнопки); не задано — как было. */
export async function tgEdit(env: Env, messageId: number, text: string, buttons?: TgButton[][]): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    await outbound(env)(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: env.OWNER_TELEGRAM_ID, message_id: messageId, text, ...(buttons ? { reply_markup: keyboard(buttons) } : {}) })
    });
  } catch {
    /* счётчик в сообщении не обновился — не страшно, в панели он верный */
  }
}

/** Ответ на нажатие кнопки в сообщении (короткая всплывашка в Telegram). */
export async function tgAnswer(env: Env, callbackId: string, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    await outbound(env)(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ callback_query_id: callbackId, text: text.slice(0, 190) }) });
  } catch {
    /* всплывашка необязательна */
  }
}

/**
 * Проверка initData мини-приложения: secret = HMAC_SHA256(ключ "WebAppData", токен бота),
 * hash = hex(HMAC_SHA256(secret, строки «ключ=значение» по алфавиту через \n, без hash)). Плюс свежесть и ID владельца.
 */
export async function verifyInitData(env: Env, initData: string, nowMs: number, maxAgeSec = 300): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || typeof initData !== 'string' || initData.length > 4096) return false;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await hmac('WebAppData', env.TELEGRAM_BOT_TOKEN);
  if (!safeEqual(hex(await hmac(secret, check)), hash)) return false;
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowMs / 1000 - authDate > maxAgeSec || authDate - nowMs / 1000 > 60) return false;
  try {
    const user = JSON.parse(params.get('user') || '{}') as { id?: number };
    return String(user.id) === String(env.OWNER_TELEGRAM_ID);
  } catch {
    return false;
  }
}
