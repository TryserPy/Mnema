// Письма через Brevo (транзакционный API). Ключ — секрет BREVO_API_KEY, отправитель — MAIL_FROM.
import { outbound, type Env } from './env';

export async function sendMail(env: Env, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM) return false;
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
