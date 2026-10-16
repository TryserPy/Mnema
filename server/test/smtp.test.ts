// Письма через SMTP ящика (Яндекс): диалог с сервером, заголовки в UTF-8, отказ сервера — false, пароль не попадает в письмо.
import { describe, expect, it } from 'vitest';
import type { SmtpSocket } from '../src/smtp';
import { smtpMessage } from '../src/smtp';
import { Harness } from './helpers';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Поддельный SMTP-сервер: отвечает как smtp.yandex.ru; authOk = false — неверный пароль. */
function fakeSmtp(log: string[], authOk = true): SmtpSocket {
  let push!: (s: string) => void;
  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      push = (s) => c.enqueue(enc.encode(s));
      push('220 smtp.example.com ESMTP ready\r\n');
    }
  });
  let buf = '';
  let data = false;
  let auth = 0;
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      buf += dec.decode(chunk);
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        log.push(line);
        if (data) {
          if (line === '.') (data = false), push('250 2.0.0 Ok: queued\r\n');
          continue;
        }
        if (auth === 1) (auth = 2), push('334 UGFzc3dvcmQ6\r\n');
        else if (auth === 2) (auth = 0), push(authOk ? '235 2.7.0 Authentication successful\r\n' : '535 5.7.8 Error: authentication failed\r\n');
        else if (line.startsWith('EHLO')) push('250-smtp.example.com\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME\r\n');
        else if (line === 'AUTH LOGIN') (auth = 1), push('334 VXNlcm5hbWU6\r\n');
        else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) push('250 2.1.0 Ok\r\n');
        else if (line === 'DATA') (data = true), push('354 End data with <CR><LF>.<CR><LF>\r\n');
        else if (line === 'QUIT') push('221 Bye\r\n');
      }
    }
  });
  return { readable, writable, close: async () => {} };
}

describe('письма через SMTP ящика', () => {
  it('код входа уходит через Яндекс: вход паролем приложения, адреса, тема в UTF-8', async () => {
    const h = new Harness();
    const log: string[] = [];
    h.env.BREVO_API_KEY = undefined;
    h.env.MAIL_FROM = 'refrain.kod@example.com';
    h.env.SMTP_PASSWORD = 'app-password-fake';
    h.env.TEST_CONNECT = () => fakeSmtp(log);
    const r = await h.json('POST', '/v1/auth/start', { email: 'kid@example.com', pow: await h.solvePow() });
    expect(r.status).toBe(200);
    expect(log).toContain('AUTH LOGIN');
    expect(log).toContain(btoa('refrain.kod@example.com'));
    expect(log).toContain('MAIL FROM:<refrain.kod@example.com>');
    expect(log).toContain('RCPT TO:<kid@example.com>');
    const subject = log.find((l) => l.startsWith('Subject: '))!;
    const b = /=\?UTF-8\?B\?(.+)\?=/.exec(subject)![1];
    expect(new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)))).toMatch(/^Код для входа в Refrain: \d{6}$/);
    // пароль — только в шаге AUTH, в письме его нет
    const body = log.slice(log.indexOf('DATA') + 1).join('\n');
    expect(body).not.toContain('app-password-fake');
    expect(body).not.toContain(btoa('app-password-fake'));
    expect(h.calls.some((c) => c.url.startsWith('https://api.brevo.com/'))).toBe(false);
  });

  it('неверный пароль приложения — письмо не ушло, вход отвечает internal (а не «код отправлен»)', async () => {
    const h = new Harness();
    const log: string[] = [];
    h.env.MAIL_FROM = 'refrain.kod@example.com';
    h.env.SMTP_PASSWORD = 'wrong';
    h.env.TEST_CONNECT = () => fakeSmtp(log, false);
    const r = await h.json('POST', '/v1/auth/start', { email: 'kid2@example.com', pow: await h.solvePow() });
    expect(r.body.error.code).toBe('internal');
    expect(log).not.toContain('DATA');
  });

  it('перевод строки в адресе или теме не добавляет заголовков', () => {
    const m = smtpMessage({ fromName: 'Refrain', from: 'a@example.com', to: 'b@example.com\r\nBcc: c@example.com', subject: 'Тема\r\nBcc: d@example.com', text: 'текст', date: new Date(0), id: 'x' });
    expect(m.split('\r\n').filter((l) => l.startsWith('Bcc:'))).toHaveLength(0);
  });
});
