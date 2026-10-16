// Письма: Resend (RESEND_API_KEY), ящик Яндекса или Mail.ru по SMTP (SMTP_PASSWORD) или Brevo (BREVO_API_KEY) — что задано, в этом порядке.
// Отправитель — MAIL_FROM (для SMTP — сам ящик).
import { outbound, type Env } from './env';
import { sendSmtp } from './smtp';

export async function sendMail(env: Env, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.MAIL_FROM) return false;
  if (env.RESEND_API_KEY) {
    try {
      const res = await outbound(env)('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: `${env.MAIL_FROM_NAME || 'Refrain'} <${env.MAIL_FROM}>`, to: [to], subject, text })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  if (env.SMTP_PASSWORD) return sendSmtp(env, to, subject, text);
  if (!env.BREVO_API_KEY) return false;
  try {
    const res = await outbound(env)('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'api-key': env.BREVO_API_KEY },
      body: JSON.stringify({ sender: { name: env.MAIL_FROM_NAME || 'Refrain', email: env.MAIL_FROM }, to: [{ email: to }], subject, textContent: text })
    });
    return res.ok;
  } catch {
    return false;
  }
}
