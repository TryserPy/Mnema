import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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

export default defineConfig({
  base: './',
  plugins: [react(), sqlWasm()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  test: { environment: 'node' }
} as any);
