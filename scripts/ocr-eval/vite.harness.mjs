// Dev-сервер для замеров: исходники приложения + файлы Tesseract по адресу /ocr/.
import fs from 'fs';
import path from 'path';
const ROOT = process.env.MNEMA_ROOT || process.cwd();
export default {
  root: ROOT,
  base: '/',
  logLevel: 'warn',
  server: { port: Number(process.env.PORT || 5199), strictPort: true, fs: { strict: false } },
  optimizeDeps: { noDiscovery: true, include: ['tesseract.js'] },
  plugins: [
    {
      name: 'harness',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const u = (req.url || '').split('?')[0];
          if (u === '/harness.html') {
            res.setHeader('content-type', 'text/html');
            res.end('<!doctype html><meta charset=utf-8><body>harness');
            return;
          }
          if (u.startsWith('/ocr/')) {
            const f = u.slice(5);
            const cands = [path.join(ROOT, 'node_modules/tesseract.js/dist', f), path.join(ROOT, 'node_modules/tesseract.js-core', f), path.join(ROOT, 'ocr-data', f)];
            const hit = cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
            if (hit) {
              res.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
              res.end(fs.readFileSync(hit));
              return;
            }
          }
          next();
        });
      }
    }
  ]
};
