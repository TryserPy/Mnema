import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { configDefaults } from 'vitest/config';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mnemaWeb } from './web/vite-plugin';

const require = createRequire(import.meta.url);

/** WASM для sql.js встраивается строкой base64: приложение открывается из file://, где fetch не работает. */
function sqlWasm(): Plugin {
  const id = 'virtual:sql-wasm';
  return {
    name: 'mnema-sql-wasm',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(s) {
      if (s !== '\0' + id) return null;
      const file = require.resolve('sql.js/dist/sql-wasm-browser.wasm');
      return `export default ${JSON.stringify(readFileSync(file).toString('base64'))};`;
    }
  };
}

// `vite build --mode web` — версия для браузера и PWA (npm run build:web); без mode — для Windows и Android.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), sqlWasm(), ...(mode === 'web' ? [mnemaWeb()] : [])],
  build: { outDir: mode === 'web' ? 'dist-web' : 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  // server/ тестируется отдельно, в среде Workers (cd server && npm test); tests/e2e — Playwright (npm run test:e2e).
  // Компонентные тесты (*.dom.test.tsx) сами выбирают jsdom строкой `@vitest-environment jsdom`.
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'server/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/env.d.ts', 'src/testing/**']
    }
  }
})) as any;
