// Задача: промт собирает сервер, списывается настоящий расход, в базе только цифры, ключ не утекает.
import { describe, expect, it } from 'vitest';
import { Harness, openAiOk, summaryTask } from './helpers';

describe('POST /v1/task', () => {
  it('конспект: промт сервера, рамки задачи, списание по usage, остаток в страницах', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const d = await h.login('anya@example.com');
    let sent: Record<string, any> = {};
    h.openai = (b) => {
      sent = b;
      return openAiOk();
    };
    const r = await d.task(summaryTask({ wishes: 'Я в 8 классе' }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, format: 'markdown', promptVersion: 's1', charged: 1 });
    expect(r.body.quota).toMatchObject({ day: { used: 1, limit: 10 }, group: 'newbie' });
    expect(sent.model).toBe('openai/gpt-6-luna');
    expect(sent.max_completion_tokens).toBe(3000);
    expect(sent.reasoning_effort).toBe('low');
    // через Polza: роль system (developer понимает только OpenAI напрямую), без store
    expect(sent.messages[0].role).toBe('system');
    expect('store' in sent).toBe(false);
    expect(sent.messages[0].content).toContain('РАЗМЕТКА REFRAIN');
    const user = sent.messages[1].content[0].text as string;
    expect(user).toContain('Предмет: Биология.');
    expect(user.indexOf('Пожелания ученика')).toBeGreaterThan(user.indexOf('Страница 2.'));
    // в базе — только цифры
    const row = await h.env.DB.prepare('SELECT * FROM usage').first<Record<string, unknown>>();
    expect(row).toMatchObject({ task: 'textbook.summary', input_tokens: 2000, output_tokens: 900, cost_micro: 38554, ok: 1 });
    const dump = JSON.stringify(await h.env.DB.prepare('SELECT * FROM usage, events').all());
    expect(dump).not.toContain('8 классе');
    expect(dump).not.toContain('## Тема');
  });

  it('рассуждение съело потолок и текста нет — повтор без рассуждения, в учёт идут обе попытки', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const d = await h.login('think@example.com');
    const efforts: unknown[] = [];
    h.openai = (b) => {
      efforts.push(b.reasoning_effort);
      if (efforts.length === 1) return new Response(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: { prompt_tokens: 2000, completion_tokens: 3000 } }), { headers: { 'content-type': 'application/json' } });
      return openAiOk();
    };
    const r = await d.task();
    expect(r.status).toBe(200);
    expect(efforts).toEqual(['low', 'none']);
    const row = await h.env.DB.prepare('SELECT * FROM usage').first<Record<string, unknown>>();
    expect(row).toMatchObject({ input_tokens: 4000, output_tokens: 3900, ok: 1 });
  });

  it('Polza.ai: адрес из LLM_BASE_URL; бюджету — цена из ответа (usage.cost_rub), ученику — страницы по прайсу', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const d = await h.login('polza@example.com');
    h.openai = () => openAiOk(undefined, { prompt_tokens: 2000, completion_tokens: 900, prompt_tokens_details: { cached_tokens: 1500 }, cost_rub: 0.02 });
    const r = await d.task();
    expect(r.status).toBe(200);
    expect(r.body.charged).toBe(1); // 2 000 на вход и 900 на выход — одна страница, как ни округлила бы Polza
    const row = await h.env.DB.prepare('SELECT cost_micro, cached_tokens FROM usage').first<Record<string, unknown>>();
    expect(row).toMatchObject({ cost_micro: 20000, cached_tokens: 1500 });
  });

  it('напрямую в OpenAI: роль developer и store: false', async () => {
    const h = new Harness();
    h.env.LLM_BASE_URL = 'https://api.openai.com/v1';
    await h.setting('mode', 'all');
    const d = await h.login('direct@example.com');
    let sent: Record<string, any> = {};
    h.openai = (b) => {
      sent = b;
      return openAiOk();
    };
    expect((await d.task()).status).toBe(200);
    expect(sent.messages[0].role).toBe('developer');
    expect(sent.store).toBe(false);
  });

  it('ключ с пробелами, переводом строки или «Bearer» из wrangler secret put — уходит чистым', async () => {
    const h = new Harness();
    h.env.OPENAI_API_KEY = '  Bearer sk-test-fake\r\n';
    await h.setting('mode', 'all');
    const d = await h.login('trim@example.com');
    expect((await d.task()).status).toBe(200);
    const auth = h.calls.filter((c) => c.url.includes('/chat/completions')).map((c) => c.auth);
    expect(auth).toEqual(['Bearer sk-test-fake']);
  });

  it('ошибка Polza запоминается (код и сообщение, без ключа и задачи) и видна в /status', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const d = await h.login('err@example.com');
    h.openai = () => Response.json({ error: { message: 'Invalid API key sk-test-fake', code: 'UNAUTHORIZED' } }, { status: 401 });
    expect((await d.task(summaryTask({ wishes: 'секретное пожелание' }))).body.error.code).toBe('upstream');
    await h.json('POST', '/v1/tg/webhook', { message: { from: { id: 777 }, chat: { id: 777 }, text: '/status' } }, { 'x-telegram-bot-api-secret-token': 'test-webhook-secret' });
    const text = h.telegram().at(-1)!.text;
    expect(text).toContain('Последняя ошибка ИИ');
    expect(text).toContain('textbook.summary): 401: Invalid API key ***');
    expect(text).not.toContain('sk-test-fake');
    expect(text).not.toContain('секретное');
  });

  it('/check в боте: ответ модели и баланс; при ошибке — код, сообщение Polza и что делать', async () => {
    const h = new Harness();
    const hdr = { 'x-telegram-bot-api-secret-token': 'test-webhook-secret' };
    const check = { message: { from: { id: 777 }, chat: { id: 777 }, text: '/check' } };
    h.openai = () => openAiOk('готово', { prompt_tokens: 20, completion_tokens: 5, cost_rub: 0.0012 });
    await h.json('POST', '/v1/tg/webhook', check, hdr);
    expect(h.telegram().at(-1)!.text).toMatch(/✅ ИИ отвечает \(https:\/\/polza\.ai\/api\/v1, модель openai\/gpt-6-luna\): «готово», цена 0,?\.?0012 ₽\.\nБаланс Polza: 1000\.00 ₽\./);
    expect(await h.env.DB.prepare('SELECT COUNT(*) AS n FROM usage').first<{ n: number }>()).toMatchObject({ n: 0 });

    h.openai = () => Response.json({ error: { message: 'Unsupported value: messages[0].role' } }, { status: 400 });
    await h.json('POST', '/v1/tg/webhook', check, hdr);
    expect(h.telegram().at(-1)!.text).toContain('❌ ИИ не ответил');
    expect(h.telegram().at(-1)!.text).toContain('Ошибка: 400: Unsupported value: messages[0].role');

    h.openai = () => Response.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    h.polzaBalance = null;
    await h.json('POST', '/v1/tg/webhook', check, hdr);
    const last = h.telegram().at(-1)!.text;
    expect(last).toContain('wrangler secret put OPENAI_API_KEY');
    expect(last).toContain('Баланс Polza: не отдаёт');
  });

  it('ключ OpenAI не попадает в ответы, даже при ошибке OpenAI; страницы при ошибке не списаны', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const d = await h.login('b@example.com');
    h.openai = () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided: sk-test-fake' } }), { status: 401 });
    const r = await d.task();
    expect(r.body.error.code).toBe('upstream');
    expect(r.raw).not.toContain('sk-test-fake');
    expect((await d.call('GET', '/v1/me')).body.quota.day.used).toBe(0);
  });

  it('карточки — JSON по схеме; неразборчивый ответ не отдаётся', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const d = await h.login('c@example.com');
    let sent: Record<string, any> = {};
    h.openai = (b) => {
      sent = b;
      return openAiOk('{"cards":[{"q":"Что такое ткань?","a":"Группа сходных клеток","why":""}]}', { prompt_tokens: 600, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 500 } });
    };
    const r = await d.task({ task: 'cards', text: '## Ткани\n- **Ткань** — группа сходных клеток' });
    expect(r.body.format).toBe('json');
    expect(JSON.parse(r.body.text).cards[0].q).toBe('Что такое ткань?');
    expect(sent.response_format.type).toBe('json_schema');
    expect(sent.reasoning_effort).toBe('none');
    h.openai = () => openAiOk('не JSON');
    expect((await d.task({ task: 'cards', text: 'x' })).body.error.code).toBe('upstream');
  });

  it('дневной лимит: после исчерпания — limit_day с остатком', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const d = await h.login('lim@example.com');
    h.openai = () => openAiOk('## Т', { prompt_tokens: 10000, completion_tokens: 12000, prompt_tokens_details: { cached_tokens: 0 } }); // ≈ 10,8 страницы
    expect((await d.task()).status).toBe(200);
    h.clock += 61000;
    const r = await d.task();
    expect(r.body.error.code).toBe('limit_day');
    expect(r.body.error.quota.day.limit).toBe(10);
    h.clock += 24 * 3600000;
    await d.renew();
    expect((await d.task()).status).toBe(200);
  });

  it('лимит в минуту у новичка — 4', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    h.openai = () => openAiOk('## Т', { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 0 } });
    const d = await h.login('fast@example.com');
    for (let i = 0; i < 4; i++) expect((await d.task({ task: 'explain', text: 'q' })).status).toBe(200);
    const r = await d.task({ task: 'explain', text: 'q' });
    expect(r.body.error.code).toBe('too_fast');
    expect(r.body.error.retryAfter).toBeGreaterThan(0);
  });

  it('бюджет: резерв не влезает — пауза для всех, кроме владельца; тревоги 50/80/100 %', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    await h.setting('budget', { monthRub: 0.2, dayRub: 0.2, alertAt: [0.5, 0.8, 1], spikeFactor: 3, spikeMinRub: 100, greedyShare: 1, signupWaveHour: 30, signupWavePerIp: 5, upstreamErrorShare: 0.2 });
    const d = await h.login('poor@example.com');
    const owner = await h.login('owner@example.com');
    expect((await d.task()).status).toBe(200); // 38 554 µ₽ из 200 000; резерв конспекта 107 660 µ₽
    h.clock += 61000;
    expect((await d.task()).status).toBe(200);
    h.clock += 61000;
    expect((await d.task()).status).toBe(200); // 115 662 µ₽ — 58 %
    h.clock += 61000;
    expect((await d.task()).status).toBe(503); // 115 662 + 107 660 > 200 000: резерв не влезает
    expect((await owner.task()).status).toBe(200);
    const texts = h.telegram().map((m) => m.text);
    expect(texts.some((t) => t.includes('Бюджет 50 %'))).toBe(true);
    expect(texts.some((t) => t.includes('Бюджет 100 %'))).toBe(true);
    expect(h.telegram().find((m) => m.text.includes('Бюджет 100 %'))!.silent).toBe(false);
  });
});
