// Реестр задач ИИ (1.31): рамки и параметры каждой задачи Refrain ИИ. Таблица «Все задачи Luna» и «Лимиты» из проекта 1.31.
// Сервер берёт отсюда потолок ответа, рассуждение и рамки входа; приложение — оценку в страницах для подсказок.
// Тексты промтов — в shared/prompts/tasks/*.ts (поток C); здесь только их номер версии.
import type { TaskId } from '../refrain/api.mjs';

export type Reasoning = 'none' | 'low';
export type AnswerFormat = 'markdown' | 'json' | 'latex' | 'text';

export interface TaskSpec {
  id: TaskId;
  title: string;
  /** Версия промта. Меняется при любой правке промта: попадает в ответ и в ключ кэша ответов на устройстве. */
  promptVersion: string;
  /** Оценка длины промта в токенах (вместе с разметкой), без фото и текста ученика. */
  promptTokens: number;
  /** Потолок ответа (max_completion_tokens). Задаёт сервер, приложение не меняет. */
  maxTokens: number;
  reasoning: Reasoning;
  format: AnswerFormat;
  /** Фото: обязательно, нельзя или можно. */
  image: 'required' | 'forbidden' | 'optional';
  /** Предел поля text в знаках; 0 — поле запрещено. */
  textMax: number;
  /** Сколько примерно страниц стоит задача — для подсказок в приложении. Списывается настоящий расход. */
  pagesEstimate: number;
}

export const TASK_SPECS: Record<TaskId, TaskSpec> = {
  'textbook.summary': { id: 'textbook.summary', title: 'Конспект с фото', promptVersion: 's1', promptTokens: 850, maxTokens: 1800, reasoning: 'low', format: 'markdown', image: 'required', textMax: 0, pagesEstimate: 1 },
  'textbook.brief': { id: 'textbook.brief', title: 'Кратко с фото', promptVersion: 'b1', promptTokens: 700, maxTokens: 900, reasoning: 'low', format: 'markdown', image: 'required', textMax: 0, pagesEstimate: 1 },
  'textbook.verbatim': { id: 'textbook.verbatim', title: 'Дословно', promptVersion: 'v1', promptTokens: 600, maxTokens: 3000, reasoning: 'none', format: 'markdown', image: 'required', textMax: 0, pagesEstimate: 1 },
  'textbook.merge': { id: 'textbook.merge', title: 'Свести параграф', promptVersion: 'm1', promptTokens: 700, maxTokens: 3500, reasoning: 'low', format: 'markdown', image: 'forbidden', textMax: 28000, pagesEstimate: 0.6 },
  'notebook.read': { id: 'notebook.read', title: 'Тетрадь', promptVersion: 'n2', promptTokens: 650, maxTokens: 2000, reasoning: 'low', format: 'markdown', image: 'required', textMax: 0, pagesEstimate: 1.2 },
  cards: { id: 'cards', title: 'Карточки', promptVersion: 'c1', promptTokens: 400, maxTokens: 1200, reasoning: 'none', format: 'json', image: 'forbidden', textMax: 6000, pagesEstimate: 0.3 },
  explain: { id: 'explain', title: 'Объяснить иначе', promptVersion: 'e1', promptTokens: 150, maxTokens: 350, reasoning: 'none', format: 'text', image: 'forbidden', textMax: 2500, pagesEstimate: 0.05 },
  style: { id: 'style', title: 'Стиль с ИИ', promptVersion: 'y1', promptTokens: 2500, maxTokens: 3000, reasoning: 'low', format: 'json', image: 'forbidden', textMax: 12000, pagesEstimate: 1.5 },
  formula: { id: 'formula', title: 'Формула от руки', promptVersion: 'f1', promptTokens: 120, maxTokens: 200, reasoning: 'none', format: 'latex', image: 'required', textMax: 0, pagesEstimate: 0.05 }
};

/**
 * Цена одной «страницы»: типичный конспект с фото — 2 000 токенов на вход и 900 на выход по $0,10 / $0,50 за миллион ≈ $0,00065.
 * Внутри сервер считает деньги в микродолларах (µ$), ученику показывает страницы = µ$ / PAGE_MICROUSD.
 */
export const PAGE_MICROUSD = 650;

/** Цены модели по умолчанию, µ$ за 1 токен × 1e6 (то есть $ за миллион). Настоящие — в конфиге сервера (меняются без выпуска). */
export const DEFAULT_PRICES = { model: 'gpt-6-luna', inputPerM: 0.1, cachedInputPerM: 0.01, outputPerM: 0.5 };

/** Сколько токенов на вход закладывать за фото при резервировании (с запасом: фото до 2000 px). */
export const IMAGE_TOKENS_RESERVE = 1600;

/** Сколько знаков текста считать за один токен при резервировании: 1 — худший случай (редкие символы, эмодзи), резерв не ниже настоящей цены. */
export const CHARS_PER_TOKEN_RESERVE = 1;

/** Схема ответа «Карточки» (structured outputs). */
export const CARDS_SCHEMA = {
  name: 'refrain_cards',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['cards'],
    properties: {
      cards: {
        type: 'array',
        maxItems: 20,
        items: { type: 'object', additionalProperties: false, required: ['q', 'a', 'why'], properties: { q: { type: 'string' }, a: { type: 'string' }, why: { type: 'string' } } }
      }
    }
  }
} as const;

/** Наибольшая возможная стоимость задачи в µ$ — её сервер резервирует до запроса. */
export function maxCostMicro(spec: TaskSpec, textChars: number, hasImage: boolean, prices = DEFAULT_PRICES): number {
  const input = spec.promptTokens + 700 /* предмет, тема, указания: до 640 знаков */ + (hasImage ? IMAGE_TOKENS_RESERVE : 0) + Math.ceil(textChars / CHARS_PER_TOKEN_RESERVE);
  return Math.ceil(input * prices.inputPerM + spec.maxTokens * prices.outputPerM);
}

/** Настоящая стоимость по usage из ответа OpenAI, µ$. Рассуждения входят в output_tokens и оплачиваются как ответ. */
export function costMicro(usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number }, prices = DEFAULT_PRICES): number {
  const fresh = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return Math.ceil(fresh * prices.inputPerM + usage.cachedInputTokens * prices.cachedInputPerM + usage.outputTokens * prices.outputPerM);
}
