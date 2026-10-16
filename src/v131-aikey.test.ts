// Свой ключ ИИ после обновления до 1.31: кто уже пользовался своим ключом, у того он и остаётся основным.
import { describe, expect, it } from 'vitest';
import { createAiService, legacyOrder } from '../shared/aiCore.mjs';

function service(stored: Record<string, unknown>, refrainSignedIn = true) {
  let cfg: unknown = stored;
  const sent: string[] = [];
  const refrain = { signedIn: () => refrainSignedIn, task: async () => ({ ok: true, text: 'refrain' }) };
  const s = createAiService({
    http: async (url) => {
      sent.push(url);
      return { status: 200, text: JSON.stringify({ choices: [{ message: { content: 'свой' } }], content: [{ type: 'text', text: 'свой' }] }) };
    },
    store: { read: () => cfg, write: (c) => (cfg = c), encrypt: (x) => 'e:' + x, decrypt: (x) => (x ? x.slice(2) : ''), newId: () => 'p1' },
    refrain: refrain as never
  });
  return { s, sent };
}

describe('свой ключ ИИ после обновления', () => {
  it('настройки 1.30 со своим ключом — свой ключ первым', () => {
    expect(legacyOrder({ provider: 'anthropic', keys: { anthropic: 'e:sk' } })).toEqual(['key', 'refrain', 'local']);
    expect(legacyOrder({ provider: 'local' })).toEqual(['local', 'key', 'refrain']);
    expect(legacyOrder({})).toBeUndefined();
  });

  it('запрос уходит своему ИИ, а не Refrain ИИ, хотя в Refrain ИИ ученик вошёл', async () => {
    const { s, sent } = service({ provider: 'custom:p1', custom: [{ id: 'p1', name: 'OpenRouter', format: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'x/y', auth: 'bearer' }], keys: { 'c:p1': 'e:sk-or-1' } });
    expect(s.getConfig().order[0]).toBe('key');
    const r = await s.ask({ text: 'привет', refrain: { task: 'explain', text: 'привет' } });
    expect(r).toMatchObject({ ok: true, text: 'свой', via: 'key' });
    expect(sent[0]).toContain('openrouter.ai');
  });

  it('новая установка без ключа — Refrain ИИ первым, как задумано', async () => {
    const { s } = service({});
    expect(s.getConfig().order[0]).toBe('refrain');
    expect((await s.ask({ text: 'x', refrain: { task: 'explain', text: 'x' } })).via).toBe('refrain');
  });

  it('выбранный порядок (уже из 1.31) не меняется', () => {
    const { s } = service({ provider: 'anthropic', keys: { anthropic: 'e:sk' }, order: ['refrain', 'key', 'local'] });
    expect(s.getConfig().order[0]).toBe('refrain');
  });
});
