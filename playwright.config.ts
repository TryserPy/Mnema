// Сквозные проверки веб-сборки в Chromium на размерах телефонов (npm run test:e2e).
// Браузер уже стоит в /opt/pw-browsers (или его даёт PLAYWRIGHT_BROWSERS_PATH) — `playwright install` не нужен.
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const PORT = Number(process.env.E2E_PORT ?? 4175);
const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(local) ? { executablePath: local } : {};
const phone = (width: number, height: number) => ({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, launchOptions });

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' } },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  use: { baseURL: `http://localhost:${PORT}`, locale: 'ru-RU', timezoneId: 'Europe/Moscow', trace: 'retain-on-failure' },
  webServer: {
    command: `npx vite preview --mode web --outDir dist-web --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  projects: [
    { name: 'phone-320', use: phone(320, 568) },
    { name: 'phone-360', use: phone(360, 640) },
    { name: 'phone-390', use: phone(390, 844) },
    { name: 'phone-412', use: phone(412, 915) },
    { name: 'phone-430', use: phone(430, 932) },
    { name: 'phone-landscape', use: phone(844, 390) },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions } }
  ]
});
