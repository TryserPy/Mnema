import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Тесты идут внутри среды Workers (Miniflare): настоящие D1 и Durable Objects, сеть наружу — только через заглушки (test/helpers.ts).
// Секреты здесь ненастоящие.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations('./migrations'),
          OPENAI_API_KEY: 'sk-test-fake',
          OPENAI_ADMIN_KEY: 'sk-admin-test-fake',
          OPENAI_PROJECT_ID: 'proj_test',
          TOKEN_SECRET: 'test-token-secret-0123456789abcdef0123456789',
          OWNER_EMAIL: 'owner@example.com',
          OWNER_TELEGRAM_ID: '777',
          TELEGRAM_BOT_TOKEN: '123456:TEST-bot-token',
          TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
          // PIN 123456 (scripts/pin-hash.mjs, 1000 итераций — только для тестов)
          ADMIN_PIN_HASH: 'pbkdf2$1000$dGVzdC1zYWx0LTEyMzQ1Ng$YhW8Uv5Ioo8NLzSa7JGDax1cP2C_79ZEHbOZqQ9vlEU',
          BREVO_API_KEY: 'xkeysib-test',
          MAIL_FROM: 'noreply@example.com',
          GITHUB_ISSUE_TOKEN: 'ghp_test_fake',
          POW_DIFFICULTY: '8'
        }
      }
    }))
  ],
  test: { setupFiles: ['./test/setup.ts'] }
});
