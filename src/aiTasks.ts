// Задачи ИИ: к каждому запросу добавляем «свои указания» ученика и, если он так выбрал, берём для задачи отдельный ИИ.
// Все запросы к ИИ собирают тело через aiRequest(задача, запрос) — тогда указания и выбор ИИ работают везде одинаково.
import { composeSystem } from './aiNotes';
import { getData, type AiRequest } from './store';
import type { AiNoteKey } from './types';

export { AI_NOTE_EXAMPLES, AI_NOTE_KEYS, AI_NOTE_MAX, AI_NOTE_TITLES, AI_TASKS, cleanAiNotes, cleanNote, cleanTaskProviders, composeSystem } from './aiNotes';

/** Системный текст задачи + общие указания ученика + указания для этой задачи. Без указаний — текст как был. */
export function aiSystem(task: AiNoteKey, system: string): string {
  return composeSystem(getData().settings.aiNotes, task, system) ?? system;
}

/** Какой ИИ выбрал ученик для задачи (номер из настроек ИИ); нет — основной. Если выбранного ИИ нет или у него нет ключа, главный процесс сам возьмёт основной. */
export function aiProviderFor(task: AiNoteKey): string | undefined {
  return task === 'all' ? undefined : getData().settings.aiTaskProvider?.[task];
}

/** Готовый запрос: указания ученика дописаны к системному тексту, выбранный для задачи ИИ указан. */
export function aiRequest(task: AiNoteKey, req: AiRequest): AiRequest {
  const system = composeSystem(getData().settings.aiNotes, task, req.system);
  const provider = aiProviderFor(task);
  return { ...req, ...(system !== undefined ? { system } : {}), ...(provider ? { provider } : {}) };
}
