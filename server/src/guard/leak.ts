// Подозрение на утечку ключа OpenAI. Запросы напрямую в OpenAI сервер не видит, поэтому сверяет свой учёт с Usage API
// (отдельный админ-ключ OPENAI_ADMIN_KEY) за окно, закончившееся lagMin минут назад: данные OpenAI приходят с опозданием.
import { costMicro } from '../../../shared/prompts/tasks';
import { raiseAlert } from '../alerts';
import { now, type Env } from '../env';
import { journal } from '../journal';
import { openAiUsage } from '../openai';
import { saveSetting, type Settings } from '../settings';
import { emergencyPause } from './index';

export const KEY_ROTATION_STEPS = [
  '1. В кабинете OpenAI, в проекте Refrain, создай новый ключ (только модель gpt-6-luna).',
  '2. В папке server выполни: wrangler secret put OPENAI_API_KEY — и вставь новый ключ.',
  '3. В кабинете OpenAI отзови старый ключ.',
  '4. В панели нажми «Ключ заменён», затем «Вернуть режим».'
].join('\n');

export interface LeakVerdict {
  suspected: boolean;
  why: string;
  oursUsd: number;
  openAiUsd: number;
}

export function judgeLeak(ours: { cost: number; requests: number }, theirs: { cost: number; foreignModels: string[] }, p: Settings['guard']['leak']): LeakVerdict {
  const oursUsd = ours.cost / 1e6;
  const openAiUsd = theirs.cost / 1e6;
  if (theirs.foreignModels.length) return { suspected: true, why: `в расходе проекта есть модели, которые сервер не вызывает: ${theirs.foreignModels.join(', ')}`, oursUsd, openAiUsd };
  if (ours.requests === 0 && openAiUsd > p.idleRub) return { suspected: true, why: `у нас 0 запросов, а OpenAI насчитал ${openAiUsd.toFixed(2)} ₽`, oursUsd, openAiUsd };
  if (openAiUsd > oursUsd * (1 + p.overShare) && openAiUsd - oursUsd > p.overRub) return { suspected: true, why: `OpenAI насчитал ${openAiUsd.toFixed(2)} ₽, наш учёт — ${oursUsd.toFixed(2)} ₽`, oursUsd, openAiUsd };
  return { suspected: false, why: '', oursUsd, openAiUsd };
}

export async function leakCheck(env: Env, cfg: Settings, force = false): Promise<LeakVerdict | null> {
  const p = cfg.guard.leak;
  const t = now(env);
  if (!p.enabled || (!force && t - cfg.leakCheck.at < p.everyMin * 60000)) return null;
  const end = t - p.lagMin * 60000;
  const start = end - p.windowMin * 60000;
  const oa = await openAiUsage(env, start, end);
  if (!oa) {
    await saveSetting(env, 'leakCheck', { ...cfg.leakCheck, at: t });
    return null;
  }
  const ours = (await env.DB.prepare('SELECT COALESCE(SUM(cost_micro), 0) AS c, COUNT(*) AS n FROM usage WHERE at >= ?1 AND at < ?2').bind(start, end).first<{ c: number; n: number }>())!;
  let theirs = 0;
  const foreign: string[] = [];
  for (const [model, u] of Object.entries(oa.byModel)) {
    theirs += costMicro(u);
    // OpenAI пишет модель без приставки поставщика («gpt-6-luna-…»), Polza — с ней («openai/gpt-6-luna»).
    const own = env.OPENAI_MODEL.replace(/^[a-z-]+\//, '');
    if (u.requests > 0 && model !== own && !model.startsWith(own + '-')) foreign.push(model);
  }
  const v = judgeLeak({ cost: ours.c, requests: ours.n }, { cost: theirs, foreignModels: foreign }, p);
  await saveSetting(env, 'leakCheck', { at: t, suspected: v.suspected || cfg.leakCheck.suspected });
  if (v.suspected && !cfg.leakCheck.suspected) {
    const text = `Похоже, ключ OpenAI используют в обход сервера: ${v.why} (окно ${p.windowMin} мин).\nСервер не может отозвать ключ сам. Замени ключ:\n${KEY_ROTATION_STEPS}`;
    await journal(env, { actor: 'system', action: 'guard.key_leak', target: { kind: 'key', id: 'openai' }, reason: v.why });
    const paused = await emergencyPause(env, cfg, 'leak', text, { title: 'Подозрение на утечку ключа', kind: 'key_leak' });
    if (!paused) await (await raiseAlert(env, { level: 'critical', kind: 'key_leak', title: 'Подозрение на утечку ключа', text, done: [], buttons: ['open_panel'] })).deliver;
  }
  return v;
}
