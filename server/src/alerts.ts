// Тревоги владельцу: сохраняются в D1 (не теряются), уходят в Telegram; при неудаче — повторы с нарастающей паузой,
// после 3 неудач — письмо на почту владельца. Одинаковые некритичные за 10 минут склеиваются в одно сообщение со счётчиком.
import { ALERT_MERGE_WINDOW_MS, ALERT_RETRY_MS, CRITICAL_ALERTS, type Alert, type AlertButton, type AlertKind, type ReactionKind, type RuleId } from '../../shared/refrain/guard';
import { now, type Env } from './env';
import { journal } from './journal';
import { sendMail } from './mail';
import { tgEdit, tgSend, type TgButton } from './telegram';

export interface AlertInput {
  level: Alert['level'];
  kind: AlertKind;
  title: string;
  text: string;
  rules?: RuleId[];
  who?: Alert['who'];
  done?: ReactionKind[];
  buttons?: AlertButton[];
  /** Ключ склейки; по умолчанию — вид тревоги. */
  groupKey?: string;
  /** id субъекта для кнопок «Заблокировать»/«Разблокировать» в мини-приложении (аккаунт или блок). */
  target?: string;
}

const REACTION_TEXT: Record<ReactionKind, string> = {
  slowdown: 'замедлил запросы',
  block_account: 'заблокировал аккаунт',
  revoke_tokens: 'закрыл сессии',
  unbind_device: 'отвязал устройство',
  block_ip: 'заблокировал IP',
  block_asn: 'заблокировал сеть (ASN)',
  pending_block: 'ждёт подтверждения блока',
  mode_testers: 'переключил режим на «Тестировщики»',
  mode_owner: 'включил аварийную паузу: Refrain ИИ только у тебя',
  budget_pause: 'поставил Refrain ИИ на паузу для всех, кроме тебя',
  newbie_zero: 'временно обнулил лимит «Новичка»'
};

const BUTTON_TEXT: Record<AlertButton, string> = {
  block: 'Заблокировать',
  unblock: 'Разблокировать',
  pause: 'Пауза',
  restore_mode: 'Вернуть режим',
  open_panel: 'Открыть панель',
  trust_device: '✅ Это я',
  kill_device: '⛔ Это не я — завершить сеанс'
};

/** «17.10, 15:32 МСК» — время для сообщений бота. */
export const mskTime = (ms: number): string => new Date(ms).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' МСК';

const ICON = { info: 'ℹ️', warn: '⚠️', critical: '🚨' } as const;

/** Текст сообщения. Только маски и цифры: без секретов, полных почт и содержимого запросов. */
export function alertText(a: { level: Alert['level']; title: string; text: string; rules?: RuleId[]; who?: Alert['who']; done: ReactionKind[]; count: number; at?: number }): string {
  const lines = [`${ICON[a.level]} ${a.title}`, a.text];
  if (a.at) lines.push(`Когда: ${mskTime(a.at)}`);
  if (a.rules?.length) lines.push(`Правила: ${a.rules.join(', ')}`);
  const who = [a.who?.email, a.who?.ip && `IP ${a.who.ip}`, a.who?.asn && `AS${a.who.asn}`, a.who?.device && `устройство «${a.who.device}»`].filter(Boolean);
  if (who.length) lines.push(`Кто: ${who.join(' · ')}`);
  if (a.done.length) lines.push(`Сервер уже: ${a.done.map((d) => REACTION_TEXT[d]).join(', ')}.`);
  if (a.count > 1) lines.push(`Ещё ${a.count - 1} за 10 минут.`);
  return lines.join('\n');
}

function buttonsFor(env: Env, id: number, buttons: AlertButton[], target?: string): TgButton[][] {
  const url = (b: AlertButton) => `${env.TG_APP_URL}#alert=${id}&do=${b}${target ? `&t=${encodeURIComponent(target)}` : ''}`;
  // «Это я» / «Это не я» — ответ прямо в боте, без панели; каждая — своей строкой (длинные подписи).
  const inBot = buttons.filter((b) => (b === 'trust_device' || b === 'kill_device') && target).map((b): TgButton => ({ text: BUTTON_TEXT[b], kind: 'callback', data: `pl:${b === 'trust_device' ? 'ok' : 'kill'}:${target}` }));
  const all = buttons.filter((b) => b !== 'trust_device' && b !== 'kill_device').map((b) => ({ text: BUTTON_TEXT[b], url: b === 'open_panel' ? env.TG_APP_URL : url(b) }));
  return [...inBot.map((b) => [b]), all.slice(0, 2), all.slice(2)].filter((r) => r.length);
}

/** Поднять тревогу. Возвращает id записи. Отправка — сразу, но не ломает ответ ученику (ctx.waitUntil у вызывающего). */
export async function raiseAlert(env: Env, input: AlertInput): Promise<{ id: number; deliver: Promise<void> }> {
  const t = now(env);
  const critical = input.level === 'critical' || CRITICAL_ALERTS.includes(input.kind);
  const level = critical ? 'critical' : input.level;
  const groupKey = input.groupKey ?? input.kind;
  if (!critical) {
    const prev = await env.DB.prepare('SELECT id, count, tg_status, tg_message_id FROM alerts WHERE group_key = ?1 AND at > ?2 AND level != ?3 ORDER BY id DESC LIMIT 1')
      .bind(groupKey, t - ALERT_MERGE_WINDOW_MS, 'critical')
      .first<{ id: number; count: number; tg_status: string; tg_message_id: number | null }>();
    if (prev) {
      await env.DB.prepare('UPDATE alerts SET count = count + 1, read_at = NULL WHERE id = ?1').bind(prev.id).run();
      const merged = { ...input, level, done: input.done ?? [], count: prev.count + 1, at: t };
      const deliver = prev.tg_status === 'sent' && prev.tg_message_id ? tgEdit(env, prev.tg_message_id, alertText(merged)) : Promise.resolve();
      return { id: prev.id, deliver };
    }
  }
  const row = await env.DB.prepare(
    'INSERT INTO alerts (at, level, kind, title, text, rules, who, done, buttons, group_key, next_try_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?1) RETURNING id'
  )
    .bind(t, level, input.kind, input.title, input.text, JSON.stringify(input.rules ?? []), JSON.stringify(input.who ?? {}), JSON.stringify(input.done ?? []), JSON.stringify(input.buttons ?? ['open_panel']), groupKey + (critical ? `#${t}` : ''))
    .first<{ id: number }>();
  const id = row!.id;
  await journal(env, { actor: 'system', action: 'alert.raised', target: { kind: 'guard', id: String(id) }, reason: input.title, rules: input.rules });
  return { id, deliver: deliverAlert(env, id, input.target) };
}

interface AlertRow {
  id: number;
  at: number;
  group_key: string;
  level: Alert['level'];
  kind: AlertKind;
  title: string;
  text: string;
  rules: string;
  who: string;
  done: string;
  buttons: string;
  count: number;
  tg_status: string;
  tg_attempts: number;
  email_status: string;
}

/** Одна попытка доставки. Неудача — следующая попытка по ALERT_RETRY_MS; после последней — письмо. */
export async function deliverAlert(env: Env, id: number, target?: string): Promise<void> {
  const a = await env.DB.prepare('SELECT * FROM alerts WHERE id = ?1').bind(id).first<AlertRow>();
  if (!a || a.tg_status !== 'pending') return;
  const text = alertText({ level: a.level, title: a.title, text: a.text, rules: JSON.parse(a.rules), who: JSON.parse(a.who), done: JSON.parse(a.done), count: a.count, at: a.at });
  // Цель кнопок в боте при повторной отправке (cron) — из ключа склейки «panel_login:<устройство>».
  const tgt = target ?? (a.group_key.startsWith('panel_login:') ? a.group_key.slice(12) : undefined);
  const msgId = await tgSend(env, text, { silent: a.level !== 'critical', buttons: buttonsFor(env, a.id, JSON.parse(a.buttons), tgt) });
  const t = now(env);
  if (msgId !== null) {
    await env.DB.prepare("UPDATE alerts SET tg_status = 'sent', tg_attempts = tg_attempts + 1, tg_message_id = ?2, next_try_at = NULL WHERE id = ?1").bind(id, msgId).run();
    await journal(env, { actor: 'system', action: 'alert.sent', target: { kind: 'guard', id: String(id) } });
    return;
  }
  const attempts = a.tg_attempts + 1;
  if (attempts < ALERT_RETRY_MS.length) {
    await env.DB.prepare('UPDATE alerts SET tg_attempts = ?2, next_try_at = ?3 WHERE id = ?1').bind(id, attempts, t + ALERT_RETRY_MS[attempts - 1]).run();
    return;
  }
  const mailed = await sendMail(env, env.OWNER_EMAIL, `[Refrain] ${a.title}`, `${text}\n\nTelegram недоступен: тревога не доставлена после ${attempts} попыток. Открой панель: ${env.ADMIN_URL}`);
  await env.DB.prepare("UPDATE alerts SET tg_status = 'failed', tg_attempts = ?2, next_try_at = NULL, email_status = ?3 WHERE id = ?1").bind(id, attempts, mailed ? 'sent' : 'failed').run();
  await journal(env, { actor: 'system', action: mailed ? 'alert.emailed' : 'alert.undelivered', target: { kind: 'guard', id: String(id) } });
}

/** Повторы по расписанию (cron). */
export async function retryAlerts(env: Env): Promise<void> {
  const { results } = await env.DB.prepare("SELECT id FROM alerts WHERE tg_status = 'pending' AND next_try_at <= ?1 ORDER BY id LIMIT 20").bind(now(env)).all<{ id: number }>();
  for (const r of results) await deliverAlert(env, r.id);
}

export async function listAlerts(env: Env, unreadOnly: boolean): Promise<Alert[]> {
  const { results } = await env.DB.prepare(`SELECT * FROM alerts ${unreadOnly ? 'WHERE read_at IS NULL' : ''} ORDER BY id DESC LIMIT 200`).all<AlertRow & { at: number; group_key: string; read_at: number | null; email_status: string; next_try_at: number | null }>();
  return results.map((r) => ({
    id: r.id,
    at: new Date(r.at).toISOString(),
    level: r.level,
    kind: r.kind,
    title: r.title,
    text: r.text,
    rules: JSON.parse(r.rules),
    who: JSON.parse(r.who),
    done: JSON.parse(r.done),
    buttons: JSON.parse(r.buttons),
    groupKey: r.group_key,
    count: r.count,
    readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
    delivery: { telegram: r.tg_status as Alert['delivery']['telegram'], attempts: r.tg_attempts, email: r.email_status as Alert['delivery']['email'], nextTryAt: r.next_try_at ? new Date(r.next_try_at).toISOString() : null }
  }));
}
