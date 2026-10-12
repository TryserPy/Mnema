// Доступ модов с кодом к ИИ: только с разрешения ученика (отдельно для каждого мода) и не чаще, чем нужно.
// Мод получает только текст ответа — ни ключей, ни настроек ИИ он этим путём не видит.

/** Не больше стольких запросов от одного мода в минуту и в час: цикл в моде не должен сжечь лимит или деньги ученика. */
export const AI_PER_MINUTE = 6;
export const AI_PER_HOUR = 60;
/** Длина текста запроса от мода. */
export const AI_TEXT_MAX = 12_000;

/** Можно ли сейчас сделать запрос. `history` — время прежних запросов (мс); возвращает, разрешён ли запрос, и обновлённую историю. */
export function rateCheck(history: number[], now: number): { ok: boolean; history: number[]; waitSec: number } {
  const hour = history.filter((t) => now - t < 3_600_000);
  const minute = hour.filter((t) => now - t < 60_000);
  if (minute.length >= AI_PER_MINUTE) return { ok: false, history: hour, waitSec: Math.max(1, Math.ceil((60_000 - (now - minute[0])) / 1000)) };
  if (hour.length >= AI_PER_HOUR) return { ok: false, history: hour, waitSec: Math.max(1, Math.ceil((3_600_000 - (now - hour[0])) / 1000)) };
  return { ok: true, history: [...hour, now], waitSec: 0 };
}

/** Текст запроса от мода: только строка, не длиннее AI_TEXT_MAX. */
export function aiText(v: unknown): string {
  if (typeof v !== 'string') throw new Error('app.ai.ask(text): нужен текст запроса.');
  const t = v.trim();
  if (!t) throw new Error('app.ai.ask(text): пустой запрос.');
  return t.slice(0, AI_TEXT_MAX);
}
