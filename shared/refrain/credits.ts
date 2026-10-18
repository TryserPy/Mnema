// ИИ-кредиты (1.33): единая единица использования Refrain ИИ вместо «страниц».
// Веса операций — здесь и только здесь: их видит ученик («на что тратится»), по ним списывает сервер.
// Счётчики сервера и лимиты групп хранятся в прежних единицах («страница» = цена одной страницы учебника),
// поэтому перехода данных не нужно: 1 прежняя страница = CREDITS_PER_PAGE кредитов, и старые счётчики и планы
// просто пересчитываются (30 страниц в день → 300 кредитов).
import type { TaskId } from './api.mjs';

export const CREDITS_PER_PAGE = 10;

/** Сколько кредитов стоит одна операция. Скан страницы учебника = 10 (бывшая «страница»). */
export const TASK_CREDITS: Record<TaskId, number> = {
  'textbook.summary': 10,
  'textbook.brief': 10,
  'textbook.verbatim': 10,
  'textbook.merge': 5,
  'notebook.read': 12,
  cards: 3,
  explain: 1,
  style: 15,
  formula: 1,
  'file.split': 3,
  'cards.source': 10,
  solve: 15
};

/** Для «на что потрачено»: виды операций. */
export type CreditKind = 'scan' | 'cards' | 'explain' | 'source' | 'solve' | 'style' | 'other';
export const TASK_KIND: Record<TaskId, CreditKind> = {
  'textbook.summary': 'scan',
  'textbook.brief': 'scan',
  'textbook.verbatim': 'scan',
  'textbook.merge': 'scan',
  'notebook.read': 'scan',
  cards: 'cards',
  explain: 'explain',
  style: 'style',
  formula: 'explain',
  'file.split': 'other',
  'cards.source': 'source',
  solve: 'solve'
};
export const KIND_TITLE: Record<CreditKind, string> = {
  scan: 'Сканирование страниц и тетрадей',
  cards: 'Карточки по конспекту',
  explain: '«Объясни иначе» и формулы от руки',
  source: 'Карточки из ссылки, видео или книги',
  solve: 'Решение задач по шагам',
  style: 'Стили с ИИ',
  other: 'Другое'
};

/** Цена операции в единицах счётчика сервера (µ-единицы, где PAGE_MICRO — одна прежняя страница). */
export function creditsMicro(task: TaskId, pageMicro: number): number {
  return Math.round((TASK_CREDITS[task] * pageMicro) / CREDITS_PER_PAGE);
}

/** Прежние «страницы» → кредиты (для старых ответов сервера и планов). */
export const pagesToCredits = (pages: number): number => Math.round(pages * CREDITS_PER_PAGE * 10) / 10;

/** «1 кредит», «3 кредита», «25 кредитов». */
export function creditsWord(n: number): string {
  const k = Math.abs(Math.floor(n));
  const m10 = k % 10;
  const m100 = k % 100;
  if (!Number.isInteger(n)) return 'кредита';
  if (m10 === 1 && m100 !== 11) return 'кредит';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'кредита';
  return 'кредитов';
}
