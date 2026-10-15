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
    expect(sent.max_completion_tokens).toBe(1800);
    expect(sent.reasoning_effort).toBe('low');
    expect(sent.store).toBe(false);
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

  it('Polza.ai: адрес из LLM_BASE_URL, списывается цена из ответа (usage.cost_rub), а не по токенам', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const d = await h.login('polza@example.com');
    h.openai = () => openAiOk(undefined, { prompt_tokens: 2000, completion_tokens: 900, prompt_tokens_details: { cached_tokens: 1500 }, cost_rub: 0.02 });
    expect((await d.task()).status).toBe(200);
    const row = await h.env.DB.prepare('SELECT cost_micro, cached_tokens FROM usage').first<Record<string, unknown>>();
    expect(row).toMatchObject({ cost_micro: 20000, cached_tokens: 1500 });
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
    await h.setting('budget', { monthRub: 0.178, dayRub: 0.178, alertAt: [0.5, 0.8, 1], spikeFactor: 3, spikeMinRub: 100, greedyShare: 1, signupWaveHour: 30, signupWavePerIp: 5, upstreamErrorShare: 0.2 });
    const d = await h.login('poor@example.com');
    const owner = await h.login('owner@example.com');
    expect((await d.task()).status).toBe(200); // 38 554 µ₽ из 178 000; резерв конспекта 72 068 µ₽
    h.clock += 61000;
    expect((await d.task()).status).toBe(200);
    h.clock += 61000;
    expect((await d.task()).status).toBe(200); // 115 662 µ₽ — 65 %
    h.clock += 61000;
    expect((await d.task()).status).toBe(503); // 115 662 + 72 068 > 178 000: резерв не влезает
    expect((await owner.task()).status).toBe(200);
    const texts = h.telegram().map((m) => m.text);
    expect(texts.some((t) => t.includes('Бюджет 50 %'))).toBe(true);
    expect(texts.some((t) => t.includes('Бюджет 100 %'))).toBe(true);
    expect(h.telegram().find((m) => m.text.includes('Бюджет 100 %'))!.silent).toBe(false);
  });
});
