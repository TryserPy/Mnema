// Свои указания для ИИ: общие и для каждой задачи. Чистые функции (без доступа к данным), чтобы их проверяли тесты
// и чтобы store.ts мог чистить настройки, не зависая от остального кода.
import type { AiNoteKey, AiNotes, AiTask } from './types';

/** Для чего у ИИ можно задать указания; 'all' — общие, ко всем задачам. */
export const AI_NOTE_KEYS: AiNoteKey[] = ['all', 'textbook', 'cards', 'explain', 'style'];

/** Длина одного указания: хватает на пару предложений и не раздувает каждый запрос (это платные символы). */
export const AI_NOTE_MAX = 400;

export const AI_NOTE_TITLES: Record<AiNoteKey, { title: string; hint: string }> = {
  all: { title: 'Для всех задач', hint: 'Действует всегда: «пиши проще», «я в 8 классе»' },
  textbook: { title: 'Страницы учебника', hint: 'Как переводить фото страниц в конспект' },
  cards: { title: 'Карточки', hint: 'Какие вопросы и ответы предлагать' },
  explain: { title: 'Объяснения', hint: 'Как объяснять, если карточка не запоминается' },
  style: { title: 'Стили оформления', hint: 'Какие цвета и настроение предлагать' }
};

/** Примеры, которые подставляются по нажатию: ученику проще поправить готовое, чем писать с нуля. */
export const AI_NOTE_EXAMPLES: Record<AiNoteKey, string[]> = {
  all: ['Пиши проще, короткими фразами', 'Я учусь в 8 классе', 'Примеры из футбола', 'Отвечай на английском'],
  textbook: ['Сохраняй сокращения как в учебнике', 'Выделяй определения жирным'],
  cards: ['Вопросы короткие, ответ — одно слово или число', 'Не больше 10 карточек', 'Больше вопросов «почему»'],
  explain: ['Объясняй через пример из жизни', 'Добавляй стишок или ассоциацию для запоминания'],
  style: ['Спокойные цвета, без ярких', 'Тёмная тема с зелёным акцентом']
};

/** Привести указания к безопасному виду: только известные ключи, строки, без управляющих символов и лишней длины. */
export function cleanAiNotes(raw: unknown): AiNotes | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: AiNotes = {};
  for (const k of AI_NOTE_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v !== 'string') continue;
    const t = cleanNote(v);
    if (t) out[k] = t;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Одно указание: без управляющих символов и переводов строк, пробелы схлопнуты, длина ограничена. */
export function cleanNote(v: string): string {
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, AI_NOTE_MAX);
}

/**
 * Добавить к системному тексту задачи указания ученика: общие и для этой задачи.
 * Указания идут ПОСЛЕ правил задачи и говорят, что формат ответа важнее: так «пиши стихами» не сломает разбор ответа.
 */
export function composeSystem(notes: AiNotes | undefined, task: AiNoteKey, system?: string): string | undefined {
  const lines: string[] = [];
  const general = notes?.all ? cleanNote(notes.all) : '';
  const own = task !== 'all' && notes?.[task] ? cleanNote(notes[task]!) : '';
  if (general) lines.push(`— всегда: ${general}`);
  if (own) lines.push(`— для этой задачи: ${own}`);
  if (!lines.length) return system;
  const block = `Пожелания ученика (учти их в стиле и подаче; правила и формат ответа, заданные задачей, важнее; факты из-за пожеланий менять нельзя):\n${lines.join('\n')}`;
  return system ? `${system}\n\n${block}` : block;
}

/** Задачи, для которых можно выбрать свой ИИ. */
export const AI_TASKS: AiTask[] = ['textbook', 'cards', 'explain', 'style'];
const PROVIDER_ID = /^(anthropic|gemini|local|custom:[\w-]{1,40})$/;

/** Выбор ИИ для задач из настроек: только известные задачи и похожие на правду номера ИИ (настоящую проверку делает главный процесс). */
export function cleanTaskProviders(raw: unknown): Partial<Record<AiTask, string>> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Partial<Record<AiTask, string>> = {};
  for (const k of AI_TASKS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'string' && PROVIDER_ID.test(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
