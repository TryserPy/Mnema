// Задачи ИИ: к каждому запросу добавляем «свои указания» ученика (Настройки → ИИ → Свои указания) и, если он так выбрал, берём для задачи отдельный ИИ.
// Общий вход для всех, кто спрашивает ИИ: свой системный текст оборачивают в aiSystem(задача, текст). Пока указаний нет — текст возвращается как есть.
// Если запрос собирается целиком — aiRequest(задача, запрос): он ещё и укажет ИИ, выбранный для этой задачи.
import { composeSystem } from './aiNotes';
import { refrainFields, refrainWishes } from './refrain';
import { getData, type AiRequest } from './store';
import type { AiNoteKey } from './types';

export { AI_NOTE_EXAMPLES, AI_NOTE_KEYS, AI_NOTE_MAX, AI_NOTE_TITLES, AI_TASKS, cleanAiNotes, cleanNote, cleanTaskProviders, composeSystem } from './aiNotes';

/** Для чего спрашиваем ИИ. Новая задача — новое значение в AiNoteKey (types.ts) и строка в настройках ИИ. 'other' — без своей строки: действуют только общие указания. */
export type AiTask = AiNoteKey | 'other';

/** Системный текст задачи + общие указания ученика + указания для этой задачи. Без указаний — текст как был. */
export function aiSystem(task: AiTask, system: string): string {
  return composeSystem(getData().settings.aiNotes, task === 'other' ? 'all' : task, system) ?? system;
}

/** Какой ИИ выбрал ученик для задачи (номер из настроек ИИ); нет — основной. Если выбранного ИИ нет или у него нет ключа, главный процесс сам возьмёт основной. */
export function aiProviderFor(task: AiTask): string | undefined {
  return task === 'all' || task === 'other' ? undefined : getData().settings.aiTaskProvider?.[task];
}

/**
 * Готовый запрос: указания ученика дописаны к системному тексту, выбранный для задачи ИИ указан.
 * Для Refrain ИИ (поле refrain) те же указания идут полем wishes; задача вне рамок контракта убирается — запрос пойдёт мимо Refrain ИИ.
 */
export function aiRequest(task: AiTask, req: AiRequest): AiRequest {
  const notes = getData().settings.aiNotes;
  const key = task === 'other' ? 'all' : task;
  const system = composeSystem(notes, key, req.system);
  const provider = aiProviderFor(task);
  const { refrain: raw, ...rest } = req;
  const fields = refrainFields(raw);
  const wishes = fields ? refrainWishes(notes, key) : '';
  // wishes нет в типе AiRequest.refrain намеренно: его дописывает только эта функция (contracts.md, «Порядок поставщиков»).
  const refrain = fields ? ({ ...fields, ...(wishes ? { wishes } : {}) } as AiRequest['refrain']) : undefined;
  return { ...rest, ...(system !== undefined ? { system } : {}), ...(provider ? { provider } : {}), ...(refrain ? { refrain } : {}) };
}
