// Слабые места: что из выученного подведёт и на что потратить время. Чистые функции по полям FSRS и журналу ответов — без интерфейса.
//
// ВАЖНО: веса ниже — ДОГАДКА, а не результат исследования (поэтому экраны пишут «прогноз по карточкам, не оценка»).
// Тип ошибки автоматически не определить: пометки «не помню / перепутал / не понял» (`ReviewLogEntry.err`) ставит человек, по желанию.
import { allItems, DAY, recallAfter } from './srs';
import type { AppData } from './types';

export type WeakReason = 'forget' | 'lapses' | 'young' | 'hard' | 'miss' | 'tag';

export interface WeakItem {
  key: string;
  cardId: string;
  topicId: string;
  /** 0 — надёжно, 1 — вот-вот подведёт. */
  score: number;
  /** Прогноз вспоминания на выбранный день (0…1). */
  recall: number;
  reasons: WeakReason[];
}

export interface WeakOptions {
  cardIds?: string[];
  topicIds?: string[];
  /** На какой день оценивать (дата контрольной). По умолчанию — сейчас. */
  at?: Date;
}

/** Ниже этой оценки элемент не считается слабым: 30% риска забыть к этому дню — уже слабое место. Догадка. */
export const WEAK_FROM = 0.3;

// Основа — риск забыть к выбранному дню (1 − прогноз вспоминания); остальное добавляет к нему. Веса — догадка.
const W = { forget: 1, lapses: 0.25, young: 0.15, hard: 0.15, miss: 0.25, tag: 0.1 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Что было с каждым элементом недавно: последний ответ и пометки ошибок. */
function recentLogs(data: AppData, now: Date): Map<string, { rating: number; at: number; tagged: boolean }> {
  const out = new Map<string, { rating: number; at: number; tagged: boolean }>();
  const cutoff = now.getTime() - 30 * DAY;
  for (let i = data.logs.length - 1; i >= 0; i--) {
    const l = data.logs[i];
    const at = Date.parse(l.at);
    if (at < cutoff) {
      if (i < data.logs.length - 60) break; // журнал по времени; запас назад — на случай беспорядка
      continue;
    }
    const cur = out.get(l.key);
    if (!cur) out.set(l.key, { rating: l.rating, at, tagged: Boolean(l.err) });
    else if (l.err) cur.tagged = true;
  }
  return out;
}

/** Оценка каждого начатого элемента повторения, самые слабые — первыми. */
export function weakItems(data: AppData, now: Date, opts: WeakOptions = {}): WeakItem[] {
  const at = (opts.at ?? now).getTime();
  const seen = new Set<string>();
  const items = opts.cardIds
    ? allItems(data, { cardIds: opts.cardIds })
    : opts.topicIds
      ? opts.topicIds.flatMap((id) => allItems(data, { topicId: id }))
      : allItems(data, {});
  const recent = recentLogs(data, now);
  const out: WeakItem[] = [];
  for (const it of items) {
    if (seen.has(it.key)) continue;
    seen.add(it.key);
    const s = data.states[it.key];
    if (!s || s.reps === 0 || s.state === 0) continue; // ещё не начато — это «не выучено», а не «слабое»
    const last = Date.parse(s.last_review ?? s.due);
    const recall = recallAfter(Math.max(0, (at - last) / DAY), s.stability);
    const lapses = clamp01(Math.min(s.lapses, 4) / 4);
    const young = clamp01((3 - s.stability) / 3);
    const hard = clamp01((s.difficulty - 6) / 4);
    const log = recent.get(it.key);
    const miss = log && log.rating === 1 ? clamp01(1 - (now.getTime() - log.at) / (7 * DAY)) : 0;
    const tag = log?.tagged ? 1 : 0;
    const forget = clamp01(1 - recall);
    const score = clamp01(W.forget * forget + W.lapses * lapses + W.young * young + W.hard * hard + W.miss * miss + W.tag * tag);
    const reasons: WeakReason[] = [];
    if (forget >= 0.3) reasons.push('forget');
    if (lapses >= 0.5) reasons.push('lapses');
    if (young >= 0.5) reasons.push('young');
    if (hard >= 0.5) reasons.push('hard');
    if (miss >= 0.5) reasons.push('miss');
    if (tag) reasons.push('tag');
    out.push({ key: it.key, cardId: it.cardId, topicId: it.topicId, score, recall, reasons });
  }
  return out.sort((a, b) => b.score - a.score);
}

export interface WeakCard {
  cardId: string;
  topicId: string;
  score: number;
  recall: number;
  reasons: WeakReason[];
}

/** То же по карточкам: у карточки с несколькими сторонами/пропусками берётся самый слабый элемент. Только то, что слабее порога. */
export function weakCards(data: AppData, now: Date, opts: WeakOptions & { limit?: number; from?: number } = {}): WeakCard[] {
  const from = opts.from ?? WEAK_FROM;
  const best = new Map<string, WeakCard>();
  for (const w of weakItems(data, now, opts)) {
    if (w.score < from) continue;
    const cur = best.get(w.cardId);
    if (!cur || w.score > cur.score) best.set(w.cardId, { cardId: w.cardId, topicId: w.topicId, score: w.score, recall: w.recall, reasons: w.reasons });
  }
  const list = [...best.values()].sort((a, b) => b.score - a.score);
  return opts.limit ? list.slice(0, opts.limit) : list;
}

export const REASON_TEXT: Record<WeakReason, string> = {
  forget: 'к этому дню начнёшь забывать',
  lapses: 'забывал не раз',
  young: 'выучено недавно, ещё не закрепилось',
  hard: 'трудная',
  miss: 'ошибся недавно',
  tag: 'сам отметил ошибку'
};
