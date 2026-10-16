// Письмо через SMTP почтового ящика (Яндекс, Mail.ru) — без своего домена. TLS сразу (порт 465), вход AUTH LOGIN паролем приложения.
// Workers закрывает только порт 25; 465 открыт. Пароль — секрет SMTP_PASSWORD, логин — адрес MAIL_FROM. Пароль не пишется ни в журнал, ни в ошибки.
import { connect } from 'cloudflare:sockets';
import type { Env } from './env';

export interface SmtpSocket {
  readable: ReadableStream;
  writable: WritableStream;
  close(): Promise<void>;
}

const enc = new TextEncoder();
const b64 = (s: string) => {
  let bin = '';
  for (const b of enc.encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
};
/** Заголовок с кириллицей: =?UTF-8?B?…?= (RFC 2047). */
const word = (s: string) => `=?UTF-8?B?${b64(s)}?=`;
/** Перевод строки в заголовке — подмена письма; убираем. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/** Текст письма: заголовки и тело в base64 по 76 знаков. */
export function smtpMessage(o: { fromName: string; from: string; to: string; subject: string; text: string; date: Date; id: string }): string {
  const body = b64(o.text.replace(/\r?\n/g, '\r\n')).replace(/.{1,76}/g, '$&\r\n');
  return [
    `From: ${word(oneLine(o.fromName))} <${oneLine(o.from)}>`,
    `To: <${oneLine(o.to)}>`,
    `Subject: ${word(oneLine(o.subject))}`,
    `Date: ${o.date.toUTCString()}`,
    `Message-ID: <${o.id}@${oneLine(o.from).split('@')[1] ?? 'refrain'}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body
  ].join('\r\n');
}

/** Отправить письмо. false — не получилось (сервер не ответил, неверный пароль, отказ). */
export async function sendSmtp(env: Env, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.SMTP_PASSWORD || !env.MAIL_FROM) return false;
  const host = env.SMTP_HOST || 'smtp.yandex.ru';
  const port = Number(env.SMTP_PORT || 465);
  let sock: SmtpSocket | null = null;
  const work = (async () => {
    sock = env.TEST_CONNECT ? env.TEST_CONNECT() : connect({ hostname: host, port }, { secureTransport: 'on', allowHalfOpen: false });
    const reader = sock.readable.getReader();
    const writer = sock.writable.getWriter();
    const dec = new TextDecoder();
    let buf = '';
    /** Ответ сервера: строки до той, где после кода пробел («250 OK»), а не дефис («250-…»). */
    const reply = async (): Promise<number> => {
      for (;;) {
        const lines = buf.split('\r\n');
        for (let i = 0; i < lines.length - 1; i++) {
          if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
            buf = lines.slice(i + 1).join('\r\n');
            return Number(lines[i].slice(0, 3));
          }
        }
        const { value, done } = await reader.read();
        if (done) return 0;
        buf += dec.decode(value, { stream: true });
      }
    };
    const send = (line: string) => writer.write(enc.encode(line + '\r\n'));
    const step = async (line: string, ok: number[]) => {
      await send(line);
      return ok.includes(await reply());
    };
    if ((await reply()) !== 220) return false;
    if (!(await step('EHLO refrain', [250]))) return false;
    if (!(await step('AUTH LOGIN', [334]))) return false;
    if (!(await step(b64(env.MAIL_FROM!), [334]))) return false;
    if (!(await step(b64(env.SMTP_PASSWORD!), [235]))) return false;
    if (!(await step(`MAIL FROM:<${oneLine(env.MAIL_FROM!)}>`, [250]))) return false;
    if (!(await step(`RCPT TO:<${oneLine(to)}>`, [250, 251]))) return false;
    if (!(await step('DATA', [354]))) return false;
    const msg = smtpMessage({ fromName: env.MAIL_FROM_NAME || 'Refrain', from: env.MAIL_FROM!, to, subject, text, date: new Date(), id: crypto.randomUUID() });
    // Точка в начале строки — конец письма; удваиваем (в base64 её нет, но заголовки — на всякий случай).
    const ok = await step(msg.replace(/^\./gm, '..') + '\r\n.', [250]);
    await send('QUIT').catch(() => {});
    return ok;
  })();
  const timeout = new Promise<boolean>((res) => setTimeout(() => res(false), 20000));
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return false;
  } finally {
    await (sock as SmtpSocket | null)?.close().catch(() => {});
  }
}
