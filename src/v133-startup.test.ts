// 1.33: запуск с включённым режимом разработчика не падает на замороженном мосте (Electron contextBridge).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const g = globalThis as unknown as { window?: unknown };

afterEach(() => {
  delete g.window;
});

describe('режим разработчика и мост приложения', () => {
  it('включение не трогает замороженный mnemaApi, а запросы всё равно видны в консоли', async () => {
    const calls: string[] = [];
    const api = Object.freeze({
      platform: 'win32',
      http: async (r: { url: string }) => (calls.push(r.url), { status: 200, text: 'ok' })
    });
    g.window = { mnemaApi: api, location: { search: '?debug=1' }, fetch: async () => new Response('') };
    const dev = await import('./devMode');
    expect(() => dev.initDev()).not.toThrow();
    expect(dev.devOn()).toBe(true);
    expect((g.window as { mnemaApi: unknown }).mnemaApi).toBe(api);
    const res = await dev.appHttp()!({ url: 'https://example.com/a?token=секрет' });
    expect(res.status).toBe(200);
    expect(calls).toEqual(['https://example.com/a?token=секрет']);
    const last = dev.netEntries().at(-1)!;
    expect(last.url).toBe('https://example.com/a?token=•••');
    dev.setDev(false);
  });

  it('без моста appHttp — undefined (веб без сети приложения)', async () => {
    g.window = { location: { search: '' } };
    const dev = await import('./devMode');
    expect(dev.appHttp()).toBeUndefined();
  });

  it('в коде приложения нет присваиваний в window.mnemaApi (на Windows и Linux он только для чтения)', () => {
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) {
          const text = readFileSync(p, 'utf8');
          // window.mnemaApi.x = …, mnemaApi!.x = …, а также api.x = … там, где api = window.mnemaApi.
          if (/mnemaApi[!?]?\.\w+\s*=[^=]/.test(text)) bad.push(p);
          if (/const api = window\.mnemaApi;[\s\S]*?\bapi[!?]?\.\w+\s*=[^=>]/.test(text)) bad.push(p);
        }
      }
    };
    walk(join(__dirname));
    expect(bad).toEqual([]);
  });
});
