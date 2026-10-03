// Сохранённый ключ «своего ИИ» уходит только на тот сервер, для которого его ввели.
import { describe, expect, it } from 'vitest';
import { createAiService, sameServer } from '../shared/aiCore.mjs';

function service() {
  let cfg: unknown = {};
  const sent: { url: string; headers: Record<string, string> }[] = [];
  const s = createAiService({
    http: async (url, init) => {
      sent.push({ url, headers: init.headers ?? {} });
      return { status: 200, text: JSON.stringify({ data: [], choices: [{ message: { content: 'готово' } }] }) };
    },
    store: { read: () => cfg, write: (c) => (cfg = c), encrypt: (x) => 'e:' + x, decrypt: (x) => (x ? x.slice(2) : ''), newId: () => 'p1' }
  });
  return { s, sent };
}

describe('ключ своего ИИ привязан к адресу', () => {
  it('sameServer сравнивает схему, хост и порт', () => {
    expect(sameServer('https://api.groq.com/openai/v1', 'https://api.groq.com/other/')).toBe(true);
    expect(sameServer('https://api.groq.com/v1', 'https://evil.example/v1')).toBe(false);
    expect(sameServer('https://api.groq.com/v1', 'http://api.groq.com/v1')).toBe(false);
    expect(sameServer('не адрес', 'не адрес')).toBe(false);
  });

  it('проверка с чужим адресом не отправляет сохранённый ключ', async () => {
    const { s, sent } = service();
    expect(s.saveCustom({ name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'm', key: 'sk-secret' }).ok).toBe(true);
    await s.probe({ draft: { id: 'p1', name: 'Groq', baseUrl: 'https://evil.example/v1', model: 'm' }, kind: 'models' });
    expect(sent.at(-1)!.url).toContain('evil.example');
    expect(JSON.stringify(sent.at(-1)!.headers)).not.toContain('sk-secret');
    // Тот же сервер — ключ подставляется, как раньше.
    await s.probe({ draft: { id: 'p1', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'm' }, kind: 'models' });
    expect(sent.at(-1)!.headers.authorization).toBe('Bearer sk-secret');
  });

  it('смена адреса без нового ключа забывает старый ключ', async () => {
    const { s, sent } = service();
    s.saveCustom({ name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'm', key: 'sk-secret', select: true });
    const r = s.saveCustom({ id: 'p1', name: 'Groq', baseUrl: 'https://evil.example/v1', model: 'm' });
    expect(r.config.custom[0].hasKey).toBe(false);
    await s.ask({ text: 'привет' });
    expect(JSON.stringify(sent)).not.toContain('sk-secret');
  });

  it('правка имени или модели ключ сохраняет', () => {
    const { s } = service();
    s.saveCustom({ name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'm', key: 'sk-secret' });
    const r = s.saveCustom({ id: 'p1', name: 'Мой Groq', baseUrl: 'https://api.groq.com/openai/v1/', model: 'm2' });
    expect(r.config.custom[0].hasKey).toBe(true);
  });
});
