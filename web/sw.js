// Service worker веб-версии Мнемы: приложение открывается и работает без интернета.
// Файлы приложения кладутся в кэш при установке (список и версию подставляет web/vite-plugin.ts при сборке).
// Новая версия ждёт, пока человек нажмёт «Обновить» (platform/web.ts), чтобы страница не перезагрузилась посреди конспекта.
const VERSION = '__VERSION__';
const FILES = __FILES__;
const APP = 'mnema-app-' + VERSION;
// Распознавание страниц (ocr/) весит около 17 МБ и от версии к версии не меняется — качается при первом использовании и живёт отдельно.
const OCR = 'mnema-ocr';

const scope = self.registration.scope;
const url = (p) => new URL(p, scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(FILES.map(url))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('mnema-app-') && k !== APP) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin || !u.href.startsWith(scope)) return;

  // Открытие страницы — всегда из кэша: приложение одностраничное, адреса внутри него не меняются.
  if (req.mode === 'navigate') {
    e.respondWith(caches.match(url('index.html'), { cacheName: APP }).then((r) => r || fetch(req)));
    return;
  }

  const cacheName = u.href.startsWith(url('ocr/')) ? OCR : APP;
  e.respondWith(
    caches.open(cacheName).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
  );
});
