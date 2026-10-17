// 1.32, облако: Яндекс Диск через REST API (папка приложения), 402 у WebDAV, повторы с паузой, токен из ссылки Яндекса.
import { describe, expect, it } from 'vitest';
import { CloudError, webdavBackend, withRetry, yandexBackend, yandexPath, type CloudSettings } from './cloud';
import { parseYandexToken, yandexAuthUrl, yandexError } from './yandexDisk';

type Req = { url: string; method?: string; headers?: Record<string, string>; body?: string };
const cfg: CloudSettings = { kind: 'yandex', url: '', user: '', folder: 'Refrain', encrypt: false, auto: true };

/** Диск в памяти: download/upload отдают href, по href читается и пишется файл. */
function fakeDisk(o: { status?: number; busyOnce?: boolean } = {}) {
  const files = new Map<string, string>();
  const calls: Req[] = [];
  let busy = o.busyOnce;
  const http = async (r: Req) => {
    calls.push(r);
    const u = new URL(r.url);
    if (u.host === 'cloud-api.yandex.net') {
      if (r.headers?.authorization !== 'OAuth tok') return { status: 401, text: '{"error":"UnauthorizedError"}' };
      if (o.status) return { status: o.status, text: '{"description":"Ошибка"}' };
      if (busy) {
        busy = false;
        return { status: 429, text: '{}' };
      }
      const path = u.searchParams.get('path')!;
      if (u.pathname.endsWith('/resources/download')) return files.has(path) ? { status: 200, text: JSON.stringify({ href: `https://downloader.disk.yandex.ru/d?p=${encodeURIComponent(path)}` }) } : { status: 404, text: '{}' };
      if (u.pathname.endsWith('/resources/upload')) return { status: 200, text: JSON.stringify({ href: `https://uploader.disk.yandex.net/u?p=${encodeURIComponent(path)}`, method: 'PUT' }) };
      if (u.pathname.endsWith('/resources') && r.method === 'PUT') return { status: files.has('dir:' + path) ? 409 : (files.set('dir:' + path, ''), 201), text: '{}' };
    }
    if (u.host === 'downloader.disk.yandex.ru') return { status: 200, text: files.get(u.searchParams.get('p')!)! };
    if (u.host === 'uploader.disk.yandex.net') {
      files.set(u.searchParams.get('p')!, r.body!);
      return { status: 201, text: '' };
    }
    return { status: 0, text: '' };
  };
  return { http, files, calls };
}

describe('Яндекс Диск через REST API', () => {
  it('путь — только папка приложения', () => {
    expect(yandexPath('Refrain')).toBe('app:/Refrain/mnema-data.json');
    expect(yandexPath('/a:b/')).toBe('app:/ab/mnema-data.json');
    expect(yandexPath('')).toBe('app:/mnema-data.json');
  });

  it('записать → прочитать; токен уходит только на cloud-api, не на адреса загрузки', async () => {
    const d = fakeDisk();
    const b = yandexBackend(d.http as never, cfg, 'tok');
    expect(await b.read()).toBeNull();
    await b.prepare();
    await b.prepare(); // папка уже есть — 409, это не ошибка
    await b.write('{"x":1}');
    expect(await b.read()).toBe('{"x":1}');
    for (const c of d.calls) if (!c.url.startsWith('https://cloud-api.yandex.net/')) expect(c.headers?.authorization).toBeUndefined();
  });

  it('401 — понятный текст «войди через Яндекс ещё раз», без токена в тексте', async () => {
    const b = yandexBackend(fakeDisk().http as never, cfg, 'bad');
    await expect(b.read()).rejects.toThrow(/Войти через Яндекс/);
    expect(yandexError(507, '').message).toMatch(/закончилось место/);
  });

  it('429 — повтор с паузой, потом успех', async () => {
    const d = fakeDisk({ busyOnce: true });
    const waits: number[] = [];
    const r = await withRetry(() => d.http({ url: 'https://cloud-api.yandex.net/v1/disk/resources/download?path=app%3A%2Fx', headers: { authorization: 'OAuth tok' } }) as never, async (ms) => void waits.push(ms));
    expect(r.status).toBe(404);
    expect(waits).toEqual([1000]);
  });

  it('WebDAV Яндекса на бесплатном тарифе (402) — ошибка с кодом для кнопки «Подключить через вход в Яндекс», логина в тексте нет', async () => {
    const http = async () => ({ status: 402, text: 'WebDAV is not available for the free tariff' });
    const b = webdavBackend(http as never, { url: 'https://webdav.yandex.ru', user: 'secret-login', folder: 'Refrain', encrypt: false, auto: true }, 'pass');
    const e = await b.read().catch((x) => x);
    expect(e).toBeInstanceOf(CloudError);
    expect(e.code).toBe('webdav_paid');
    expect(e.message).not.toContain('secret-login');
    expect(e.message).toMatch(/вход в Яндекс/);
  });

  it('токен из ссылки страницы Яндекса и проверка state', () => {
    expect(parseYandexToken('https://oauth.yandex.ru/verification_code#access_token=y0_AgAAAAB&token_type=bearer&state=s1&expires_in=31536000', 's1')).toBe('y0_AgAAAAB');
    expect(parseYandexToken('https://oauth.yandex.ru/verification_code#access_token=y0_X&state=evil', 's1')).toBe('');
    expect(parseYandexToken('  y0_AgAAAAAAAAAAAAAAAAAAAAAAAAAA  ')).toBe('y0_AgAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(parseYandexToken('привет')).toBe('');
    const u = new URL(yandexAuthUrl('0123456789abcdef0123456789abcdef', 'st'));
    expect(u.searchParams.get('response_type')).toBe('token');
    expect(u.searchParams.get('redirect_uri')).toBe('https://oauth.yandex.ru/verification_code');
  });
});
