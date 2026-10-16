// Окружение Worker: привязки, переменные и секреты (секреты — только через `wrangler secret put`).
import type { StudentCounter } from './counters';
import type { BudgetCounter } from './counters';

export interface Env {
  DB: D1Database;
  STUDENT: DurableObjectNamespace<StudentCounter>;
  BUDGET: DurableObjectNamespace<BudgetCounter>;
  // переменные (wrangler.toml)
  OPENAI_MODEL: string;
  /** Адрес API в формате OpenAI: https://polza.ai/api/v1 (Polza.ai) или https://api.openai.com/v1. */
  LLM_BASE_URL?: string;
  ADMIN_ORIGIN: string;
  ADMIN_URL: string;
  TG_APP_URL: string;
  APP_VERSIONS: string;
  POW_DIFFICULTY: string;
  MAIL_FROM_NAME: string;
  // секреты
  OPENAI_API_KEY: string;
  OPENAI_ADMIN_KEY?: string;
  OPENAI_PROJECT_ID?: string;
  TOKEN_SECRET: string;
  OWNER_EMAIL: string;
  OWNER_TELEGRAM_ID: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ADMIN_PIN_HASH?: string;
  BREVO_API_KEY?: string;
  /** Resend (resend.com) — вместо Brevo, если задан. */
  RESEND_API_KEY?: string;
  /** Пароль приложения почтового ящика MAIL_FROM (SMTP); сервер и порт — SMTP_HOST / SMTP_PORT (по умолчанию smtp.yandex.ru:465). */
  SMTP_PASSWORD?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  MAIL_FROM?: string;
  GITHUB_ISSUE_TOKEN?: string;
  /** Только для тестов: подмена сети наружу и часов. Переменные wrangler — строки, поэтому в выкладке задать их нельзя. */
  TEST_FETCH?: typeof fetch;
  TEST_CONNECT?: () => import('./smtp').SmtpSocket;
  TEST_NOW?: () => number;
}

export const now = (env: Env): number => (typeof env.TEST_NOW === 'function' ? env.TEST_NOW() : Date.now());
export const outbound = (env: Env): typeof fetch => (typeof env.TEST_FETCH === 'function' ? env.TEST_FETCH : fetch);
