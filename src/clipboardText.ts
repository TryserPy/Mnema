// Кнопка «Вставить» в полях импорта (1.34): на телефоне долгое нажатие → «Вставить» неудобно — системная плашка
// бывает под клавиатурой или жестовой полосой. Здесь — один тап: текст из буфера обмена через приложение или браузер.

export type ClipResult = { ok: true; text: string } | { ok: false; reason: 'empty' | 'denied' | 'unsupported' };

/** Можно ли прочитать буфер одной кнопкой (иначе кнопку не показываем — остаётся обычная вставка в поле). */
export function canReadClipboard(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.mnemaApi?.readClipboard || navigator.clipboard?.readText);
}

export async function readClipboardText(): Promise<ClipResult> {
  try {
    const native = window.mnemaApi?.readClipboard;
    const text = native ? await native() : navigator.clipboard?.readText ? await navigator.clipboard.readText() : undefined;
    if (text === undefined) return { ok: false, reason: 'unsupported' };
    if (text === null) return { ok: false, reason: 'denied' };
    return text.trim() ? { ok: true, text } : { ok: false, reason: 'empty' };
  } catch {
    return { ok: false, reason: 'denied' };
  }
}

/** Вставить кусок в текст поля: на место выделения, если оно есть, иначе в конец (с новой строки). */
export function insertAt(value: string, piece: string, start?: number | null, end?: number | null): { value: string; caret: number } {
  if (start == null || end == null || start < 0 || end < start || end > value.length) {
    const sep = value && !value.endsWith('\n') ? '\n' : '';
    const out = value + sep + piece;
    return { value: out, caret: out.length };
  }
  return { value: value.slice(0, start) + piece + value.slice(end), caret: start + piece.length };
}

export const CLIP_MESSAGE: Record<Exclude<ClipResult, { ok: true }>['reason'], string> = {
  empty: 'В буфере обмена нет текста — сначала скопируй его',
  denied: 'Нет доступа к буферу обмена: нажми на поле и подержи палец → «Вставить»',
  unsupported: 'Здесь вставка кнопкой не работает: нажми на поле и подержи палец → «Вставить»'
};
