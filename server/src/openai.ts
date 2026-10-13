// Запрос к OpenAI (Chat Completions). Ключ — секрет OPENAI_API_KEY: не попадает ни в журнал, ни в ответы, ни в тексты ошибок.
// Модель одна (OPENAI_MODEL), рассуждение и потолок ответа — из реестра задач; приложение их не задаёт.
import { CARDS_SCHEMA, type TaskSpec } from '../../shared/prompts/tasks';
import { outbound, type Env } from './env';

export interface LlmUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}
export type LlmResult = { ok: true; text: string; usage: LlmUsage; model: string } | { ok: false; status: number; usage: LlmUsage | null };

export async function callOpenAI(env: Env, spec: TaskSpec, system: string, user: string, image?: { mime: string; data: string }): Promise<LlmResult> {
  const content = image ? [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.data}`, detail: 'high' } }] : user;
  const body = {
    model: env.OPENAI_MODEL,
    messages: [
      { role: 'developer', content: system },
      { role: 'user', content }
    ],
    max_completion_tokens: spec.maxTokens,
    reasoning_effort: spec.reasoning,
    store: false,
    ...(spec.id === 'cards' ? { response_format: { type: 'json_schema', json_schema: CARDS_SCHEMA } } : {})
  };
  let res: Response;
  try {
    res = await outbound(env)('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000)
    });
  } catch {
    return { ok: false, status: 0, usage: null };
  }
  let data: { choices?: { message?: { content?: string | null }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }; model?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  const u = data?.usage;
  const usage = u ? { inputTokens: u.prompt_tokens ?? 0, cachedInputTokens: u.prompt_tokens_details?.cached_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 } : null;
  if (!res.ok || !data) return { ok: false, status: res.status, usage };
  const text = String(data.choices?.[0]?.message?.content ?? '').trim();
  if (!text || !usage) return { ok: false, status: 502, usage };
  return { ok: true, text, usage, model: String(data.model ?? env.OPENAI_MODEL) };
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
