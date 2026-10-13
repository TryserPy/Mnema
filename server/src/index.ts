// Сервер Refrain ИИ (1.31): Cloudflare Worker. Маршруты — docs/refrain-1.31/contracts.md.
import { handleAdmin } from './admin';
import { authLogout, authRefresh, authStart, authVerify, powChallenge } from './auth';
import { handleBug } from './bugs';
import { handleWebhook } from './bot';
import { scheduled } from './cron';
import type { Env } from './env';
import { ApiFail, clientInfo, corsHeaders, errorResponse, json, readJson } from './http';
import { handleAccountDelete, handleDeviceDelete, handleInvite, handleMe } from './me';
import { handleTask } from './task';

export { BudgetCounter, StudentCounter } from './counters';

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const m = req.method;
  if (p.startsWith('/v1/admin/')) {
    if (m === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    const res = await handleAdmin(req, env, p);
    for (const [k, v] of Object.entries(corsHeaders(env, req))) res.headers.set(k, v);
    return res;
  }
  if (m === 'POST' && p === '/v1/tg/webhook') return handleWebhook(req, env);
  const info = await clientInfo(req, env);
  if (m === 'POST' && p === '/v1/task') return handleTask(req, env, info, ctx);
  if (m === 'POST' && p === '/v1/auth/pow') {
    const { body } = await readJson(req, 256);
    const purpose = (body as { purpose?: unknown }).purpose;
    return json(await powChallenge(env, purpose === 'bug' ? 'bug' : 'login'));
  }
  if (m === 'POST' && p === '/v1/auth/start') return authStart(req, env, info);
  if (m === 'POST' && p === '/v1/auth/verify') return authVerify(req, env, info);
  if (m === 'POST' && p === '/v1/auth/refresh') return authRefresh(req, env, info);
  if (m === 'POST' && p === '/v1/auth/logout') return authLogout(req, env, info);
  if (m === 'GET' && p === '/v1/me') return handleMe(req, env, info);
  if (m === 'POST' && p === '/v1/invite') return handleInvite(req, env, info);
  if (m === 'DELETE' && p === '/v1/account') return handleAccountDelete(req, env, info);
  const dev = /^\/v1\/devices\/(dev_[A-Za-z0-9_-]{16})$/.exec(p);
  if (m === 'DELETE' && dev) return handleDeviceDelete(req, env, info, dev[1]);
  if (m === 'POST' && p === '/v1/bug') return handleBug(req, env, info);
  return json({ ok: false, error: { code: 'bad_request', message: 'Нет такого адреса.' } }, 404);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (e) {
      if (e instanceof ApiFail) {
        const res = errorResponse(e);
        if (new URL(req.url).pathname.startsWith('/v1/admin/')) for (const [k, v] of Object.entries(corsHeaders(env, req))) res.headers.set(k, v);
        return res;
      }
      // В журнал Worker — только имя ошибки, без тел, ключей и текста запросов.
      console.error('internal', e instanceof Error ? e.name : 'unknown');
      return json({ ok: false, error: { code: 'internal', message: 'Сбой на сервере. Попробуй позже.' } }, 500);
    }
  },
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(scheduled(env));
  }
} satisfies ExportedHandler<Env>;
