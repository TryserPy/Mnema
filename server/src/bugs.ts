// «Сообщить о проблеме»: без входа, с proof-of-work и лимитами. Текст хранится 90 дней, снимок экрана — только в Telegram.
// В GitHub issue (по кнопке в панели) уходят текст, версия и журнал — без почт, ID и снимка.
import type { BugReport } from '../../shared/refrain/api.mjs';
import { bump, checkPow } from './auth';
import { fromB64 } from './crypto';
import { now, outbound, type Env } from './env';
import { fail, readJson, type ClientInfo } from './http';
import { raiseAlert } from './alerts';

const CATEGORIES = ['note', 'textbook', 'cards', 'styles', 'ai', 'other'];
const CAT_RU: Record<string, string> = { note: 'Конспект', textbook: 'Из учебника', cards: 'Карточки', styles: 'Стили', ai: 'ИИ', other: 'Другое' };

/** Убрать из текста почты, пути и длинные числа (ID, телефоны). */
export function scrub(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[почта]')
    .replace(/(?:[A-Za-z]:\\|\/(?:home|Users|data|storage|root)\/)[^\s"'<>]*/g, '[путь]')
    .replace(/\b\d{7,}\b/g, '[число]')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}

export async function handleBug(req: Request, env: Env, info: ClientInfo): Promise<Response> {
  const { body } = await readJson(req, 2 * 1024 * 1024);
  const b = body as Partial<BugReport>;
  await checkPow(env, b.pow, 'bug');
  if ((await bump(env, `bug:ip:${info.ipHash}`, 3600000)) > 20) fail('too_fast', { retryAfter: 3600 });
  if (typeof b.text !== 'string' || !b.text.trim() || b.text.length > 2000 || !CATEGORIES.includes(String(b.category))) fail('bad_request');
  const app = b.app && typeof b.app === 'object' ? { version: String(b.app.version ?? '').slice(0, 20), platform: String(b.app.platform ?? '').slice(0, 10), os: String(b.app.os ?? '').slice(0, 60), style: b.app.style ? String(b.app.style).slice(0, 40) : undefined } : fail('bad_request');
  // «5 в день с устройства»: вход для багов не нужен, поэтому устройство — это IP + версия и система приложения.
  if ((await bump(env, `bug:dev:${info.ipHash}:${app.version}:${app.os}`, 86400000)) > 5) fail('too_fast', { retryAfter: 86400 });
  const log = Array.isArray(b.log) ? b.log.slice(-50).map((l) => scrub(String(l)).slice(0, 300)) : [];
  const context = b.context && typeof b.context === 'object' ? { task: b.context.task ? String(b.context.task).slice(0, 40) : undefined, error: b.context.error ? scrub(String(b.context.error)).slice(0, 300) : undefined } : null;
  const text = scrub(String(b.text));
  const row = await env.DB.prepare('INSERT INTO bugs (at, category, text, app, log, context, sender) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id')
    .bind(now(env), String(b.category), text, JSON.stringify(app), JSON.stringify(log), context ? JSON.stringify(context) : null, info.ipHash)
    .first<{ id: number }>();
  const id = row!.id;
  const a = await raiseAlert(env, { level: 'info', kind: 'bug', title: `🐞 Баг #${id}`, text: `Refrain ${app.version} · ${app.os} · ${CAT_RU[String(b.category)]}\n«${text.slice(0, 600)}»${log.length ? `\nжурнал (${log.length} строк)` : ''}`, buttons: ['open_panel'], groupKey: `bug:${id}` });
  await a.deliver;
  if (typeof b.screenshot === 'string' && b.screenshot.length < 1.4 * 1024 * 1024) await sendScreenshot(env, id, b.screenshot);
  return Response.json({ ok: true, id });
}

/** Снимок экрана — прямо в Telegram, на сервере не сохраняется. */
async function sendScreenshot(env: Env, id: number, b64: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    const bytes = fromB64(b64);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
    const form = new FormData();
    form.append('chat_id', env.OWNER_TELEGRAM_ID);
    form.append('caption', `Снимок к багу #${id}`);
    form.append('disable_notification', 'true');
    form.append('photo', new Blob([bytes], { type: 'image/jpeg' }), `bug-${id}.jpg`);
    await outbound(env)(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
  } catch {
    /* снимок необязателен */
  }
}

/** Issue в TryserPy/Mnema: текст, версия, журнал. Без почт, ID и снимка (репозиторий открытый). */
export async function bugToGithub(env: Env, id: number): Promise<number | null> {
  if (!env.GITHUB_ISSUE_TOKEN) return null;
  const b = await env.DB.prepare('SELECT * FROM bugs WHERE id = ?1').bind(id).first<{ category: string; text: string; app: string; log: string; context: string | null }>();
  if (!b) return null;
  const app = JSON.parse(b.app) as { version: string; platform: string; os: string; style?: string };
  const log = JSON.parse(b.log) as string[];
  const body = [`**${CAT_RU[b.category] ?? b.category}** · Refrain ${app.version} · ${app.os}${app.style ? ` · стиль «${app.style}»` : ''}`, '', b.text, log.length ? `\n<details><summary>Журнал (${log.length})</summary>\n\n\`\`\`\n${log.join('\n')}\n\`\`\`\n</details>` : '', '', '_Из формы «Сообщить о проблеме»._'].join('\n');
  try {
    const res = await outbound(env)('https://api.github.com/repos/TryserPy/Mnema/issues', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.GITHUB_ISSUE_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'refrain-ai', 'content-type': 'application/json' },
      body: JSON.stringify({ title: `[Баг] ${b.text.replace(/\s+/g, ' ').slice(0, 70)}`, body, labels: ['bug'] })
    });
    if (!res.ok) return null;
    const issue = (await res.json()) as { number?: number };
    return typeof issue.number === 'number' ? issue.number : null;
  } catch {
    return null;
  }
}
