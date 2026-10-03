// Синхронизация по Wi-Fi зашифрована: код в сеть не уходит, подмену и чужой код сервер не принимает.
import Module, { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatCode, newCode, nonce, normCode, open, seal, syncKey } from '../shared/syncCrypto.mjs';
import { decodeTarget, encodeTarget, OLD_VERSION, syncWith } from './components/SyncDialog';
import { emptyData, getData } from './store';

describe('код синхронизации', () => {
  it('12 знаков из алфавита без похожих букв', () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(new Set(Array.from({ length: 50 }, newCode)).size).toBe(50);
  });
  it('ввод прощает дефисы, строчные, O вместо 0 и русскую раскладку', () => {
    expect(normCode('k7qm-2xpa-9rtd')).toBe('K7QM2XPA9RTD');
    expect(normCode('K7QM 2XPA 9RTO')).toBe('K7QM2XPA9RT0');
    expect(normCode('АВЕК-МНРС-ТХ12')).toBe('ABEKMHPCTX12');
    expect(normCode('12345678')).toBe('');
    expect(normCode('K7QM2XPA9RTU')).toBe(''); // U нет в алфавите
    expect(formatCode('K7QM2XPA9RTD')).toBe('K7QM-2XPA-9RTD');
  });
  it('QR: новый разбирается, старый (8 цифр) узнаётся', () => {
    const t = { hosts: ['192.168.1.5', '10.0.0.3'], port: 47123, code: 'K7QM2XPA9RTD' };
    expect(decodeTarget(encodeTarget(t))).toEqual(t);
    expect(decodeTarget('mnema-sync:192.168.1.5:47123:12345678')).toBe('old');
    expect(decodeTarget('mnema-sync2:192.168.1.5:47123:123')).toBeNull();
    expect(decodeTarget('https://example.com')).toBeNull();
  });
});

describe('шифрование сообщений', () => {
  it('туда и обратно; чужой код, чужая метка и подмена не проходят', async () => {
    const code = newCode();
    const key = await syncKey(code);
    const msg = await seal(key, 'sync-req', { n: 1, data: { note: 'секретный конспект' } });
    expect(msg).not.toContain('секретный');
    expect(msg).not.toContain(code);
    expect(await open(key, 'sync-req', msg)).toEqual({ n: 1, data: { note: 'секретный конспект' } });
    await expect(open(await syncKey(newCode()), 'sync-req', msg)).rejects.toThrow();
    await expect(open(key, 'sync-res', msg)).rejects.toThrow();
    const o = JSON.parse(msg);
    const bytes = Buffer.from(o.data, 'base64');
    bytes[3] ^= 1;
    await expect(open(key, 'sync-req', JSON.stringify({ ...o, data: bytes.toString('base64') }))).rejects.toThrow();
    await expect(open(key, 'sync-req', '{"device":"телефон","data":{}}')).rejects.toThrow();
  });
});

describe('сервер синхронизации на компьютере (electron/sync.cjs)', () => {
  const handlers: Record<string, (...a: unknown[]) => unknown> = {};
  const received: unknown[] = [];
  const done: unknown[] = [];
  let reply: unknown = { merged: true };
  let session: { ok: boolean; token: string; port: number };
  const origLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;

  beforeAll(async () => {
    const fakeElectron = {
      ipcMain: {
        handle: (n: string, fn: (...a: unknown[]) => unknown) => (handlers[n] = fn),
        on: (n: string, fn: (...a: unknown[]) => unknown) => (handlers[n] = fn)
      }
    };
    (Module as unknown as { _load: unknown })._load = function (this: unknown, req: string, ...rest: unknown[]) {
      return req === 'electron' ? fakeElectron : origLoad.call(this, req, ...rest);
    };
    const sync = createRequire(import.meta.url)('../electron/sync.cjs');
    // Окно Мнемы: «слило» данные и отвечает.
    const win = {
      webContents: {
        send: (ch: string, msg: { id: string; data: unknown }) => {
          if (ch === 'sync:incoming') {
            received.push(msg.data);
            setTimeout(() => handlers['sync:reply']({}, { id: msg.id, data: reply, report: { added: 1 } }), 5);
          } else if (ch === 'sync:done') done.push(msg);
        }
      }
    };
    sync.register(() => win);
    session = (await handlers['sync:start']()) as typeof session;
  });
  afterAll(() => {
    handlers['sync:stop']?.();
    (Module as unknown as { _load: unknown })._load = origLoad;
  });

  const post = (path: string, body: string, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${session.port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });

  it('показывает 12-значный код', () => {
    expect(session.ok).toBe(true);
    expect(normCode(session.token)).toBe(session.token);
  });

  it('полный обмен зашифрован и проходит', async () => {
    const key = await syncKey(session.token);
    const n1 = nonce();
    const hello = await post('/mnema/hello', await seal(key, 'hello-req', { n: n1 }));
    expect(hello.status).toBe(200);
    const hi = await open<{ n: string; app: string }>(key, 'hello-res', await hello.text());
    expect(hi).toMatchObject({ n: n1, app: 'Mnema' });
    const n2 = nonce();
    const res = await post('/mnema/sync', await seal(key, 'sync-req', { n: n2, device: 'телефон', data: { subjects: ['конспект'] } }));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain('merged');
    expect(await open(key, 'sync-res', text)).toMatchObject({ n: n2, data: { merged: true }, report: { added: 1 } });
    expect(received).toEqual([{ subjects: ['конспект'] }]);
    expect(done).toEqual([{ device: 'телефон', report: { added: 1 } }]);
  });

  it('чужой код, открытый текст и подменённый ответ на месте запроса — отказ', async () => {
    const wrong = await syncKey(newCode());
    expect((await post('/mnema/hello', await seal(wrong, 'hello-req', { n: 'x' }))).status).toBe(403);
    expect((await post('/mnema/sync', JSON.stringify({ device: 'x', data: {} }))).status).toBe(403);
    const key = await syncKey(session.token);
    expect((await post('/mnema/sync', await seal(key, 'sync-res', { n: 'x', data: {} }))).status).toBe(403);
    expect(received).toHaveLength(1); // ничего из этого до окна не дошло
  });

  it('клиент (syncWith) проходит весь обмен и сливает ответ компьютера', async () => {
    const remote = emptyData();
    remote.subjects = [{ id: 's-pc', name: 'С компьютера', color: '#336699', createdAt: new Date().toISOString() }];
    reply = remote;
    const sent: string[] = [];
    (globalThis as unknown as { window: unknown }).window = {
      mnemaApi: {
        platform: 'android',
        http: async (r: { url: string; method?: string; headers?: Record<string, string>; body?: string }) => {
          sent.push(r.body ?? '');
          const res = await fetch(r.url, { method: r.method, headers: r.headers, body: r.body });
          return { status: res.status, text: await res.text() };
        }
      }
    };
    try {
      const rep = await syncWith({ hosts: ['127.0.0.1'], port: session.port, code: session.token });
      expect(rep.added.subjects).toBe(1);
      expect(getData().subjects.map((x) => x.name)).toContain('С компьютера');
      expect(sent.join('')).not.toContain(session.token);
      expect(sent.join('')).not.toContain('settings');
      await expect(syncWith({ hosts: ['127.0.0.1'], port: session.port, code: newCode() })).rejects.toThrow('Код не подходит');
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
      reply = { merged: true };
    }
  });

  it('старая Мнема (код в заголовке) получает «обнови»', async () => {
    expect(OLD_VERSION).toContain('Обнови');
    const r = await fetch(`http://127.0.0.1:${session.port}/mnema/hello`, { headers: { 'x-mnema-token': '12345678' } });
    expect(r.status).toBe(426);
  });
});
