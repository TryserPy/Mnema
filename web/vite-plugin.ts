// Сборка веб-версии (`npm run build:web`): всё, что нужно сайту сверх обычной сборки приложения.
//  • index.html: политика безопасности для браузера, значки и теги установки (PWA);
//  • manifest.webmanifest и значки — чтобы Мнему можно было поставить на компьютер, Android, iPhone и iPad;
//  • sw.js — работа без интернета и обновления;
//  • ocr/ — Tesseract и словари, чтобы фото страниц распознавались без интернета.
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

const root = resolve(import.meta.dirname, '..');

/** Та же политика, что в index.html, но с сетью: в браузере нет окна-посредника, и запросы к ИИ идут прямо со страницы. */
const WEB_CSP = [
  "default-src 'self'",
  'img-src \'self\' data: blob: https://i.ytimg.com',
  "media-src 'self' blob: https:",
  'frame-src https://www.youtube-nocookie.com https://rutube.ru https://vk.com',
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "connect-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "script-src-attr 'none'"
].join('; ');

const THEME = '#4C5BD4';
const BACKGROUND = '#F6F3EC';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

export function mnemaWeb(): Plugin {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string;
  return {
    name: 'mnema-web',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const out = html
          .replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/, `$1${WEB_CSP}$2`)
          .replace('content="width=device-width, initial-scale=1"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"');
        const tags = [
          '<meta name="description" content="Мнема — запоминай учебный материал: конспект, карточки и повторения по расписанию.">',
          `<meta name="theme-color" content="${THEME}">`,
          '<meta name="application-name" content="Мнема">',
          '<meta name="mobile-web-app-capable" content="yes">',
          '<meta name="apple-mobile-web-app-capable" content="yes">',
          '<meta name="apple-mobile-web-app-title" content="Мнема">',
          '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
          '<link rel="manifest" href="manifest.webmanifest">',
          '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
          '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'
        ].join('\n  ');
        return out.replace('</title>', `</title>\n  ${tags}`).replace('<div id="root"></div>', '<div id="root"></div>\n  <noscript>Мнеме нужен JavaScript — включи его в настройках браузера.</noscript>');
      }
    },
    writeBundle(options) {
      const out = resolve(options.dir ?? join(root, 'dist-web'));

      // Значки.
      cpSync(join(root, 'web/icons'), join(out, 'icons'), { recursive: true });

      // Распознавание страниц без интернета (то же, что кладёт в APK android/build.sh).
      const ocr = join(out, 'ocr');
      mkdirSync(ocr, { recursive: true });
      copyFileSync(join(root, 'node_modules/tesseract.js/dist/worker.min.js'), join(ocr, 'worker.min.js'));
      const core = join(root, 'node_modules/tesseract.js-core');
      for (const v of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) copyFileSync(join(core, `tesseract-core-${v}.wasm.js`), join(ocr, `tesseract-core-${v}.wasm.js`));
      for (const f of readdirSync(join(root, 'ocr-data'))) if (f.endsWith('.traineddata.gz')) copyFileSync(join(root, 'ocr-data', f), join(ocr, f));

      writeFileSync(
        join(out, 'manifest.webmanifest'),
        JSON.stringify(
          {
            id: './',
            name: 'Мнема',
            short_name: 'Мнема',
            description: 'Запоминай учебный материал: конспект, карточки и повторения по расписанию.',
            lang: 'ru',
            dir: 'ltr',
            start_url: './',
            scope: './',
            display: 'standalone',
            display_override: ['standalone', 'minimal-ui'],
            background_color: BACKGROUND,
            theme_color: THEME,
            categories: ['education', 'productivity'],
            icons: [
              { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
              { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
            ]
          },
          null,
          2
        )
      );

      // Service worker: в кэш при установке — всё, кроме ocr/ и запасных форматов шрифтов (хватает woff2).
      const all = walk(out)
        .map((f) => relative(out, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.startsWith('ocr/') && !/\.(ttf|woff)$/.test(f))
        .sort();
      const hash = createHash('sha1');
      for (const f of all) hash.update(f).update(readFileSync(join(out, f)));
      const files = all;
      const sw = readFileSync(join(root, 'web/sw.js'), 'utf8').replace('__VERSION__', `${version}-${hash.digest('hex').slice(0, 10)}`).replace('__FILES__', JSON.stringify(files, null, 1));
      writeFileSync(join(out, 'sw.js'), sw);
      const kb = Math.round(all.reduce((n, f) => n + statSync(join(out, f)).size, 0) / 1024);
      console.log(`\n  web: ${all.length} файлов в кэше для работы без интернета (${kb} КБ), версия ${version}`);
    }
  };
}
