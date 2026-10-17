// Запрос к модели (Chat Completions, формат OpenAI) — через Polza.ai или напрямую в OpenAI: адрес LLM_BASE_URL.
// Ключ — секрет OPENAI_API_KEY (ключ Polza или OpenAI): не попадает ни в журнал, ни в ответы, ни в тексты ошибок.
// Модель одна (OPENAI_MODEL), рассуждение и потолок ответа — из реестра задач; приложение их не задаёт.
import { CARDS_SCHEMA, CARDS_SOURCE_SCHEMA, type TaskSpec } from '../../shared/prompts/tasks';
import { outbound, type Env } from './env';

export interface LlmUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** Цена запроса от поставщика, µ₽ (Polza присылает usage.cost_rub). Нет — считаем по токенам. */
  costMicro?: number;
}
/** error — что ответил поставщик (код и его сообщение, без ключа и без текста задачи): для /status и /check в боте. */
export type LlmResult = { ok: true; text: string; usage: LlmUsage; model: string } | { ok: false; status: number; usage: LlmUsage | null; error?: string };

/** Сколько ждать модель: фото страницы с рассуждением у Polza идёт до пары минут. Клиент ждёт 240 с — сервер укладывается раньше. */
const LLM_TIMEOUT = 150000;
const TOTAL_BUDGET = 210000;

export async function callOpenAI(env: Env, spec: TaskSpec, system: string, user: string, image?: { mime: string; data: string }): Promise<LlmResult> {
  const started = Date.now();
  const first = await callOnce(env, spec, system, user, image, spec.reasoning, LLM_TIMEOUT);
  // Рассуждение съело весь потолок ответа и текста нет — ещё раз без рассуждения, если время есть. Расход обеих попыток — в учёт.
  const left = TOTAL_BUDGET - (Date.now() - started);
  if (first.ok || !first.cut || spec.reasoning === 'none' || left < 30000) return first.result;
  const second = await callOnce(env, spec, system, user, image, 'none', left);
  return addUsage(second.result, first.result.usage);
}

function addUsage(r: LlmResult, extra: LlmUsage | null): LlmResult {
  if (!extra) return r;
  const u = r.usage;
  const sum: LlmUsage = u
    ? {
        inputTokens: u.inputTokens + extra.inputTokens,
        cachedInputTokens: u.cachedInputTokens + extra.cachedInputTokens,
        outputTokens: u.outputTokens + extra.outputTokens,
        ...(u.costMicro !== undefined || extra.costMicro !== undefined ? { costMicro: (u.costMicro ?? 0) + (extra.costMicro ?? 0) } : {})
      }
    : extra;
  return { ...r, usage: sum } as LlmResult;
}

/** Напрямую в OpenAI (а не через посредника вроде Polza.ai). */
const directOpenAI = (env: Env): boolean => /^https:\/\/api\.openai\.com(\/|$)/.test(env.LLM_BASE_URL || 'https://api.openai.com/v1');

/** Ключ из `wrangler secret put` бывает вставлен с пробелом, переводом строки или словом «Bearer» — убираем. */
export const llmKey = (env: Env): string => String(env.OPENAI_API_KEY || '').trim().replace(/^Bearer\s+/i, '').trim();

/** Сообщение об ошибке поставщика — коротко и без ключа. */
function upstreamError(env: Env, status: number, data: unknown, raw: string): string {
  const d = data as { error?: { message?: unknown } | string; message?: unknown; detail?: unknown } | null;
  let msg: unknown = (d && typeof d.error === 'object' && d.error?.message) || d?.error || d?.message || d?.detail || raw;
  if (typeof msg !== 'string') msg = JSON.stringify(msg);
  const key = llmKey(env);
  let text = String(msg).replace(/\s+/g, ' ').trim();
  if (key) text = text.split(key).join('***');
  return `${status || 'нет связи'}${text ? ': ' + text.slice(0, 300) : ''}`;
}

async function callOnce(env: Env, spec: TaskSpec, system: string, user: string, image: { mime: string; data: string } | undefined, reasoning: TaskSpec['reasoning'], timeout: number): Promise<{ ok: boolean; cut: boolean; result: LlmResult }> {
  const content = image ? [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.data}`, detail: 'high' } }] : user;
  const body = {
    model: env.OPENAI_MODEL,
    messages: [
      // Роль developer понимает только OpenAI напрямую; посредники (Polza.ai) и их поставщики — system (OpenAI считает её тем же).
      { role: directOpenAI(env) ? 'developer' : 'system', content: system },
      { role: 'user', content }
    ],
    max_completion_tokens: spec.maxTokens,
    reasoning_effort: reasoning,
    ...(directOpenAI(env) ? { store: false } : {}),
    ...(spec.id === 'cards' ? { response_format: { type: 'json_schema', json_schema: CARDS_SCHEMA } } : spec.id === 'cards.source' ? { response_format: { type: 'json_schema', json_schema: CARDS_SOURCE_SCHEMA } } : {})
  };
  if (!llmKey(env)) return { ok: false, cut: false, result: { ok: false, status: 0, usage: null, error: 'ключ ИИ не задан (секрет OPENAI_API_KEY)' } };
  let res: Response;
  try {
    res = await outbound(env)(`${(env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${llmKey(env)}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });
  } catch (e) {
    const why = e instanceof Error && e.name === 'TimeoutError' ? 'ИИ не ответил вовремя' : 'нет связи с поставщиком ИИ';
    return { ok: false, cut: false, result: { ok: false, status: 0, usage: null, error: why } };
  }
  let raw = '';
  let data: { choices?: { message?: { content?: string | null }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; cost_rub?: number; cost?: number }; model?: string } | null = null;
  try {
    raw = await res.text();
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  const u = data?.usage;
  // Цена от Polza — в рублях: cost_rub, у части моделей просто cost. Отрицательное и нечисловое не принимаем.
  const rub = typeof u?.cost_rub === 'number' ? u.cost_rub : env.LLM_BASE_URL?.includes('polza.ai') && typeof u?.cost === 'number' ? u.cost : undefined;
  const usage = u
    ? { inputTokens: u.prompt_tokens ?? 0, cachedInputTokens: u.prompt_tokens_details?.cached_tokens ?? 0, outputTokens: u.completion_tokens ?? 0, ...(rub !== undefined && Number.isFinite(rub) && rub >= 0 ? { costMicro: Math.ceil(rub * 1e6) } : {}) }
    : null;
  if (!res.ok || !data) return { ok: false, cut: false, result: { ok: false, status: res.status, usage, error: upstreamError(env, res.status, data, raw.slice(0, 300)) } };
  const text = String(data.choices?.[0]?.message?.content ?? '').trim();
  const finish = data.choices?.[0]?.finish_reason;
  if (!text || !usage) return { ok: false, cut: !text && finish === 'length', result: { ok: false, status: 502, usage, error: !text ? `пустой ответ модели${finish ? ` (finish_reason: ${finish})` : ''}` : 'в ответе нет usage' } };
  return { ok: true, cut: false, result: { ok: true, text, usage, model: String(data.model ?? env.OPENAI_MODEL) } };
}

/** Для сверки: сколько токенов проекта насчитал OpenAI за окно (Usage API, админ-ключ). null — данные недоступны. */
export async function openAiUsage(env: Env, startMs: number, endMs: number): Promise<{ byModel: Record<string, LlmUsage & { requests: number }> } | null> {
  if (!env.OPENAI_ADMIN_KEY || !env.OPENAI_PROJECT_ID) return null;
  const q = new URLSearchParams({ start_time: String(Math.floor(startMs / 1000)), end_time: String(Math.floor(endMs / 1000)), bucket_width: '1m', limit: '1440' });
  q.append('project_ids', env.OPENAI_PROJECT_ID);
  q.append('group_by', 'model');
  const byModel: Record<string, LlmUsage & { requests: number }> = {};
  let page: string | null = null;
  for (let i = 0; i < 10; i++) {
    if (page) q.set('page', page);
    let res: Response;
    try {
      res = await outbound(env)(`https://api.openai.com/v1/organization/usage/completions?${q}`, { headers: { authorization: `Bearer ${env.OPENAI_ADMIN_KEY}` }, signal: AbortSignal.timeout(20000) });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { results?: { model?: string | null; input_tokens?: number; input_cached_tokens?: number; output_tokens?: number; num_model_requests?: number }[] }[]; has_more?: boolean; next_page?: string | null };
    for (const b of data.data ?? [])
      for (const r of b.results ?? []) {
        const m = r.model ?? 'unknown';
        const acc = (byModel[m] ??= { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, requests: 0 });
        acc.inputTokens += r.input_tokens ?? 0;
        acc.cachedInputTokens += r.input_cached_tokens ?? 0;
        acc.outputTokens += r.output_tokens ?? 0;
        acc.requests += r.num_model_requests ?? 0;
      }
    if (!data.has_more || !data.next_page) break;
    page = data.next_page;
  }
  return { byModel };
}
