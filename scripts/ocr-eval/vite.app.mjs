// Dev-сервер всего приложения (веб-режим) + файлы Tesseract по адресу /ocr/: для e2e/v130-textbook-ui.mjs.
//   npx vite --config scripts/ocr-eval/vite.app.mjs --mode web --port 5321
import path from 'path';
import { loadConfigFromFile, mergeConfig } from 'vite';
import harness from './vite.harness.mjs';
const ROOT = process.env.MNEMA_ROOT || process.cwd();
const loaded = await loadConfigFromFile({ command: 'serve', mode: 'web' }, path.join(ROOT, 'vite.config.ts'), ROOT);
export default mergeConfig(loaded.config, { server: { fs: { strict: false } }, plugins: [harness.plugins[0]] });
