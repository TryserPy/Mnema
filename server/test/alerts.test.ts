// Тревоги, утечка ключа, панель, бот и баги.
import { describe, expect, it } from 'vitest';
import { Harness, count, summaryTask } from './helpers';

const usage = (input: number, output: number, model = 'gpt-6-luna-2026-09-22', requests = 1) => () =>
  new Response(JSON.stringify({ data: [{ results: [{ model, input_tokens: input, input_cached_tokens: 0, output_tokens: output, num_model_requests: requests }] }], has_more: false }), { headers: { 'content-type': 'application/json' } });

describe('подозрение на утечку ключа', () => {
  it('расход OpenAI выше нашего учёта: аварийная пауза, критическая тревога с инструкцией, только владелец; снять — после «Ключ заменён»', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const s = await h.login('st@example.com');
    const o = await h.login('owner@example.com');
    expect((await s.task()).status).toBe(200); // наш учёт: 650 µ$
    h.clock += 20 * 60000; // окно сверки закончилось 15 минут назад
    h.usageApi = usage(2_000_000, 2_000_000); // у OpenAI ≈ $1,2
    await h.cron();
    const crit = h.telegram().find((m) => m.text.includes('Подозрение на утечку ключа'))!;
    expect(crit.silent).toBe(false);
    expect(crit.text).toContain('wrangler secret put OPENAI_API_KEY');
    expect(crit.text).not.toContain('sk-');
    expect(await count(h, "SELECT COUNT(*) AS n FROM journal WHERE action IN ('guard.key_leak', 'guard.level3')")).toBe(2);
    await s.renew();
    expect((await s.task()).body.error.code).toBe('paused');
    await o.renew();
    expect((await o.task()).status).toBe(200);
    const admin = await h.admin();
    expect((await admin('POST', 'resume')).status).toBe(400); // пока ключ не заменён
    await admin('POST', 'key-rotated', undefined, '123456');
    expect((await admin('POST', 'resume', undefined, '123456')).body.mode).toBe('all');
    expect((await s.task()).status).toBe(200);
  });

  it('расход при нуле запросов у нас и чужая модель — тоже утечка; без админ-ключа сверка молчит', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    h.usageApi = usage(0, 300_000, 'gpt-6-sol');
    await h.cron();
    expect(h.telegram().some((m) => m.text.includes('Подозрение на утечку ключа') && m.text.includes('gpt-6-sol'))).toBe(true);
    const h2 = new Harness();
    h2.env = { ...h2.env, OPENAI_ADMIN_KEY: undefined };
    await h2.cron();
    expect(h2.telegram()).toHaveLength(0);
  });

  it('совпадающий учёт — не утечка', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const s = await h.login('ok@example.com');
    await s.task();
    h.clock += 20 * 60000;
    h.usageApi = usage(2000, 900);
    await h.cron();
    expect(h.telegram().some((m) => m.text.includes('утечку'))).toBe(false);
  });
});

describe('доставка тревог', () => {
  it('Telegram недоступен: тревога не теряется — повторы, письмо после 3 неудач, в панели непрочитанная', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    h.telegramUp = false;
    const d = await h.login('t1@example.com', { ip: '198.51.100.7', lat: 55.75, lon: 37.62 });
    await d.task();
    h.clock += 60000;
    await d.task(summaryTask(), { where: { ip: '192.0.2.44', lat: 40.71, lon: -74.0 } }); // блок → тревога
    expect(await count(h, "SELECT COUNT(*) AS n FROM alerts WHERE tg_status = 'pending'")).toBe(1);
    for (let i = 0; i < 3; i++) {
      h.clock += 11 * 60000;
      await h.cron();
    }
    const a = await h.env.DB.prepare("SELECT tg_status, email_status, read_at FROM alerts WHERE kind = 'travel'").first<{ tg_status: string; email_status: string; read_at: number | null }>();
    expect(a).toMatchObject({ tg_status: 'failed', email_status: 'sent', read_at: null });
    expect(h.mails().some((m) => m.to === 'owner@example.com' && m.subject.includes('Аккаунт с нескольких мест'))).toBe(true);
    h.telegramUp = true;
    const admin = await h.admin();
    const list = (await admin('GET', 'alerts?unread=1')).body.alerts as { kind: string; delivery: { telegram: string } }[];
    expect(list.some((x) => x.kind === 'travel' && x.delivery.telegram === 'failed')).toBe(true);
  });

  it('одинаковые тревоги склеиваются в одно сообщение со счётчиком, критические — всегда отдельно', async () => {
    const h = new Harness();
    const { raiseAlert } = await import('../src/alerts');
    for (let i = 0; i < 15; i++) await (await raiseAlert(h.env, { level: 'warn', kind: 'contract', title: 'Выход за рамки контракта', text: 'x' })).deliver;
    for (let i = 0; i < 2; i++) await (await raiseAlert(h.env, { level: 'critical', kind: 'key_leak', title: 'Утечка', text: 'x' })).deliver;
    const sent = h.telegram();
    expect(sent.filter((m) => m.text.includes('Выход за рамки'))).toHaveLength(1);
    expect(sent.filter((m) => m.text.includes('Утечка'))).toHaveLength(2);
    const edits = h.calls.filter((c) => c.url.includes('/editMessageText'));
    expect(JSON.parse(edits.at(-1)!.body).text).toContain('Ещё 14 за 10 минут');
    expect(sent.find((m) => m.text.includes('Выход за рамки'))!.silent).toBe(true);
  });
});

describe('панель', () => {
  it('вход: подделанный, устаревший или чужой initData не пускает', async () => {
    const h = new Harness();
    expect((await h.json('POST', '/v1/admin/login/telegram', { initData: 'auth_date=1&user=%7B%22id%22%3A777%7D&hash=00' })).status).toBe(401);
    const ok = await h.admin();
    expect((await ok('GET', 'overview')).body.mode).toBe('testers');
    h.clock += 16 * 60000;
    expect((await ok('GET', 'overview')).status).toBe(401); // токен панели — 15 минут
    expect((await h.json('GET', '/v1/admin/overview')).status).toBe(401);
  });

  it('5 неверных PIN — панель закрыта на час, критическая тревога; всё в журнале', async () => {
    const h = new Harness();
    const admin = await h.admin();
    for (let i = 0; i < 5; i++) await admin('PUT', 'mode', { mode: 'all' }, '000000');
    expect((await admin('GET', 'overview')).body.error.code).toBe('blocked');
    expect(h.telegram().find((m) => m.text.includes('Пять неверных PIN'))!.silent).toBe(false);
    expect(await count(h, "SELECT COUNT(*) AS n FROM journal WHERE action = 'panel.locked'")).toBe(1);
    h.clock += 61 * 60000;
    const again = await h.admin();
    expect((await again('PUT', 'mode', { mode: 'all' }, '123456')).status).toBe(200);
  });

  it('пороги детектора меняются из панели (с PIN) и действуют', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const admin = await h.admin();
    const g = (await admin('GET', 'guard')).body.guard;
    g.rules.extra_fields.weight = 0;
    g.rules.extra_fields.enabled = false;
    expect((await admin('PUT', 'guard', g)).status).toBe(400);
    expect((await admin('PUT', 'guard', g, '123456')).status).toBe(200);
    const d = await h.login('cfg@example.com');
    for (let i = 0; i < 5; i++) expect((await d.task(summaryTask({ debug: 1 }))).body.error.code).toBe('bad_request');
    expect(await count(h, 'SELECT COUNT(*) AS n FROM blocks')).toBe(0);
    expect(await count(h, "SELECT COUNT(*) AS n FROM journal WHERE action = 'guard.config'")).toBe(1);
  });

  it('скачок расхода: режим «Тестировщики», тревога, «Вернуть режим»', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    for (let i = 0; i < 400; i++) await h.env.DB.prepare("INSERT INTO usage (at, account_id, grp, task, input_tokens, cached_tokens, output_tokens, cost_micro, ok, ms) VALUES (?1, 'acc_x', 'student', 'cards', 1, 0, 1, 60000, 1, 1)").bind(h.clock - 600000).run();
    await h.cron();
    expect(h.telegram().some((m) => m.text.includes('Скачок расхода'))).toBe(true);
    const admin = await h.admin();
    expect((await admin('GET', 'overview')).body).toMatchObject({ mode: 'testers', prevMode: 'all' });
    await admin('POST', 'resume', undefined, '123456');
    expect((await admin('GET', 'overview')).body.mode).toBe('all');
  });
});

describe('бот', () => {
  it('только владелец и только с секретом вебхука; /pause без PIN', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const msg = (from: number, text: string) => ({ message: { from: { id: from }, chat: { id: from }, text } });
    expect((await h.json('POST', '/v1/tg/webhook', msg(777, '/pause'))).status).toBe(403);
    const hdr = { 'x-telegram-bot-api-secret-token': 'test-webhook-secret' };
    await h.json('POST', '/v1/tg/webhook', msg(12345, '/pause'), hdr);
    expect((await (await h.admin())('GET', 'overview')).body.mode).toBe('all');
    await h.json('POST', '/v1/tg/webhook', msg(777, '/pause'), hdr);
    expect((await (await h.admin())('GET', 'overview')).body.mode).toBe('owner');
    expect(await count(h, "SELECT COUNT(*) AS n FROM journal WHERE actor = 'owner:bot'")).toBe(1);
  });
});

describe('ссылка входа из бота (браузер, когда мини-приложение не открывается)', () => {
  const hdr = { 'x-telegram-bot-api-secret-token': 'test-webhook-secret' };
  const msg = (text: string) => ({ message: { from: { id: 777 }, chat: { id: 777 }, text } });
  /** Последняя ссылка «В браузере» из ответа бота. */
  const lastLink = (h: Harness): string => {
    const sent = h.calls.filter((c) => c.url.includes('/sendMessage')).map((c) => JSON.parse(c.body));
    const btn = sent.at(-1).reply_markup.inline_keyboard[0].find((b: { url?: string }) => b.url);
    expect(btn.url).toMatch(/\/admin\/#link=l1\./);
    return decodeURIComponent(btn.url.split('#link=')[1]);
  };

  it('/panel: кнопка мини-приложения и одноразовая ссылка на 5 минут', async () => {
    const h = new Harness();
    await h.json('POST', '/v1/tg/webhook', msg('/panel'), hdr);
    const sent = JSON.parse(h.calls.filter((c) => c.url.includes('/sendMessage')).at(-1)!.body);
    expect(sent.reply_markup.inline_keyboard[0][0].web_app.url).toContain('/tg/');
    const link = lastLink(h);
    const r = await h.json('POST', '/v1/admin/login/link', { link });
    expect(r.status).toBe(200);
    expect(typeof r.body.token).toBe('string');
    expect((await h.json('GET', '/v1/admin/overview', undefined, { authorization: `Bearer ${r.body.token}` })).status).toBe(200);
    // второй раз та же ссылка не пускает
    expect((await h.json('POST', '/v1/admin/login/link', { link })).status).toBe(401);
    expect(h.telegram().some((x) => x.text.includes('Ссылка из бота'))).toBe(true);
  });

  it('просроченная, подделанная или чужая ссылка не пускает', async () => {
    const h = new Harness();
    await h.json('POST', '/v1/tg/webhook', msg('/status'), hdr);
    const link = lastLink(h);
    const [, exp, nonce, sig] = link.split('.');
    expect((await h.json('POST', '/v1/admin/login/link', { link: `l1.${Number(exp) + 3600000}.${nonce}.${sig}` })).status).toBe(401);
    expect((await h.json('POST', '/v1/admin/login/link', { link: `l1.${exp}.${'A'.repeat(22)}.${sig}` })).status).toBe(401);
    expect((await h.json('POST', '/v1/admin/login/link', { link: 'мусор' })).status).toBe(401);
    h.clock += 6 * 60000;
    expect((await h.json('POST', '/v1/admin/login/link', { link })).status).toBe(401);
    // чужие сообщения боту ссылку не выдают
    const before = h.calls.length;
    await h.json('POST', '/v1/tg/webhook', { message: { from: { id: 12345 }, chat: { id: 12345 }, text: '/panel' } }, hdr);
    expect(h.calls.length).toBe(before);
  });
});

describe('баги', () => {
  it('без входа, с PoW; почты и пути вычищены; в issue нет почты и снимка; 90 дней', async () => {
    const h = new Harness();
    const bug = { category: 'note', text: 'Таблица съехала, пишите на kid@example.com', app: { version: '1.31.0', platform: 'windows', os: 'Windows 11' }, log: ['Error at C:\\Users\\Anya\\app.js:1', 'id 123456789'], screenshot: btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0)) };
    expect((await h.json('POST', '/v1/bug', bug)).body.error.code).toBe('pow_invalid');
    const r = await h.json('POST', '/v1/bug', { ...bug, pow: await h.solvePow('bug') });
    expect(r.body).toMatchObject({ ok: true, id: 1 });
    const row = (await h.env.DB.prepare('SELECT * FROM bugs').first<Record<string, string>>())!;
    expect(row.text).not.toContain('kid@example.com');
    expect(row.log).not.toContain('Anya');
    expect(row.log).not.toContain('123456789');
    expect(JSON.stringify(row)).not.toContain('/9j/'); // снимок не хранится
    expect(h.calls.some((c) => c.url.includes('/sendPhoto'))).toBe(true);
    const admin = await h.admin();
    expect((await admin('POST', 'bugs/1/github')).body.issue).toBe(42);
    const issue = h.calls.find((c) => c.url.startsWith('https://api.github.com/'))!;
    expect(issue.body).not.toMatch(/@mail\.ru|owner@|777|Anya/);
    h.clock += 91 * 86400000;
    await h.cron();
    expect(await count(h, 'SELECT COUNT(*) AS n FROM bugs')).toBe(0);
  });
});

describe('удаление аккаунта', () => {
  it('стирает почту, устройства, сессии и счётчики', async () => {
    const h = new Harness();
    await h.setting('mode', 'all');
    const d = await h.login('gone@example.com');
    await d.task();
    expect((await d.call('DELETE', '/v1/account')).status).toBe(200);
    expect(await count(h, "SELECT COUNT(*) AS n FROM accounts WHERE email = 'gone@example.com'")).toBe(0);
    expect(await count(h, 'SELECT COUNT(*) AS n FROM devices')).toBe(0);
    expect(await count(h, "SELECT COUNT(*) AS n FROM usage WHERE account_id != 'deleted'")).toBe(0);
    const again = await h.login('gone@example.com');
    expect((await again.call('GET', '/v1/me')).body.quota.day.used).toBe(0);
  });
});
