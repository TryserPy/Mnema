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
  /** Потолок ответа (max_completion_tokens) — вместе с рассуждением, поэтому с запасом. Задаёт сервер, приложение не меняет. */
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
  'textbook.summary': { id: 'textbook.summary', title: 'Конспект с фото', promptVersion: 's1', promptTokens: 850, maxTokens: 3000, reasoning: 'low', format: 'markdown', image: 'required', textMax: 0, pagesEstimate: 1 },
  'textbook.brief': { id: 'textbook.brief', title: 'Кратко с фото', promptVersion: 'b1', promptTokens: 700, maxTokens: 2000, reasoning: 'low', format: 'markdown', image: 'required', textMax: 0, pagesEstimate: 1 },
  'textbook.verbatim': { id: 'textbook.verbatim', title: 'Дословно', promptVersion: 'v1', promptTokens: 600, maxTokens: 3000, reasoning: 'none', format: 'markdown', image: 'required', textMax: 0, pagesEstimate: 1 },
  'textbook.merge': { id: 'textbook.merge', title: 'Свести параграф', promptVersion: 'm1', promptTokens: 700, maxTokens: 5000, reasoning: 'low', format: 'markdown', image: 'forbidden', textMax: 28000, pagesEstimate: 0.6 },
  'notebook.read': { id: 'notebook.read', title: 'Тетрадь', promptVersion: 'n3', promptTokens: 750, maxTokens: 3500, reasoning: 'low', format: 'markdown', image: 'required', textMax: 0, pagesEstimate: 1.2 },
  cards: { id: 'cards', title: 'Карточки', promptVersion: 'c1', promptTokens: 400, maxTokens: 1200, reasoning: 'none', format: 'json', image: 'forbidden', textMax: 6000, pagesEstimate: 0.3 },
  explain: { id: 'explain', title: 'Объяснить иначе', promptVersion: 'e1', promptTokens: 150, maxTokens: 350, reasoning: 'none', format: 'text', image: 'forbidden', textMax: 2500, pagesEstimate: 0.05 },
  style: { id: 'style', title: 'Стиль с ИИ', promptVersion: 'y2', promptTokens: 2500, maxTokens: 4500, reasoning: 'low', format: 'json', image: 'forbidden', textMax: 12000, pagesEstimate: 1.5 },
  formula: { id: 'formula', title: 'Формула от руки', promptVersion: 'f1', promptTokens: 120, maxTokens: 200, reasoning: 'none', format: 'latex', image: 'required', textMax: 0, pagesEstimate: 0.05 },
  'file.split': { id: 'file.split', title: 'Разбить файл по темам', promptVersion: 'p1', promptTokens: 150, maxTokens: 600, reasoning: 'none', format: 'text', image: 'forbidden', textMax: 12000, pagesEstimate: 0.3 },
  // 1.32, N2: карточки по статье, субтитрам видео или главе книги — текст длиннее конспекта, карточек до 30.
  'cards.source': { id: 'cards.source', title: 'Карточки из ссылки, видео или книги', promptVersion: 'r1', promptTokens: 550, maxTokens: 3500, reasoning: 'low', format: 'json', image: 'forbidden', textMax: 24000, pagesEstimate: 1 },
  // 1.32, N3: пошаговое решение задачи — по фото условия, по тексту или по обоим.
  solve: { id: 'solve', title: 'Решение задачи', promptVersion: 'q1', promptTokens: 650, maxTokens: 5000, reasoning: 'low', format: 'markdown', image: 'optional', textMax: 2000, pagesEstimate: 1.5 }
};

/**
 * Цена одной «страницы»: типичный конспект с фото — 2 000 токенов на вход и 900 на выход по 5,93 ₽ / 29,66 ₽ за миллион
 * (openai/gpt-6-luna через Polza.ai) ≈ 0,0386 ₽. Деньги сервер считает в микрорублях (µ₽), ученику показывает страницы = µ₽ / PAGE_MICRO.
 */
export const PAGE_MICRO = 38554;

/** Цены модели по умолчанию, ₽ за миллион токенов (= µ₽ за токен). Кэш Polza отдельно не тарифицирует — считается как обычный вход. */
export const DEFAULT_PRICES = { model: 'openai/gpt-6-luna', inputPerM: 5.93, cachedInputPerM: 5.93, outputPerM: 29.66 };

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

/** Схема ответа «Карточки из источника»: как «Карточки», но до 30 штук. */
export const CARDS_SOURCE_SCHEMA = {
  ...CARDS_SCHEMA,
  name: 'refrain_cards_source',
  schema: { ...CARDS_SCHEMA.schema, properties: { cards: { ...CARDS_SCHEMA.schema.properties.cards, maxItems: 30 } } }
} as const;

/** Наибольшая возможная стоимость задачи в µ₽ — её сервер резервирует до запроса. */
export function maxCostMicro(spec: TaskSpec, textChars: number, hasImage: boolean, prices = DEFAULT_PRICES): number {
  const input = spec.promptTokens + 700 /* предмет, тема, указания: до 640 знаков */ + (hasImage ? IMAGE_TOKENS_RESERVE : 0) + Math.ceil(textChars / CHARS_PER_TOKEN_RESERVE);
  return Math.ceil(input * prices.inputPerM + spec.maxTokens * prices.outputPerM);
}

/** Стоимость по usage, µ₽, если поставщик не прислал цену сам. Рассуждения входят в output_tokens и оплачиваются как ответ. */
export function costMicro(usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number }, prices = DEFAULT_PRICES): number {
  const fresh = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return Math.ceil(fresh * prices.inputPerM + usage.cachedInputTokens * prices.cachedInputPerM + usage.outputTokens * prices.outputPerM);
}
