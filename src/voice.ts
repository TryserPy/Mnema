// Ответ голосом. На Android — встроенное распознавание речи телефона (текст появляется сразу).
// На Windows — запись с микрофона и распознавание через выбранный ИИ (OpenAI-совместимый /audio/transcriptions или Gemini).
import { normalizeAnswer } from './srs';

export interface VoiceSession {
  stop: () => Promise<string>;
  cancel: () => void;
}

declare global {
  interface Window {
    __mnemaSpeech?: (e: { type: 'partial' | 'final' | 'error' | 'end'; text?: string }) => void;
  }
}

export function voiceSupported(): 'native' | 'ai' | null {
  const api = window.mnemaApi;
  if (api?.speechStart) return 'native';
  if (api?.aiTranscribe && typeof MediaRecorder !== 'undefined' && navigator.mediaDevices) return 'ai';
  return null;
}

export async function startVoice(onPartial: (text: string) => void): Promise<VoiceSession> {
  const api = window.mnemaApi!;
  if (api.speechStart) {
    let finalText = '';
    let resolveEnd: (t: string) => void = () => undefined;
    let rejectEnd: (e: Error) => void = () => undefined;
    const ended = new Promise<string>((res, rej) => {
      resolveEnd = res;
      rejectEnd = rej;
    });
    window.__mnemaSpeech = (e) => {
      if (e.type === 'partial' && e.text) onPartial(e.text);
      if (e.type === 'final') {
        finalText = e.text ?? '';
        onPartial(finalText);
        resolveEnd(finalText);
      }
      if (e.type === 'error') rejectEnd(new Error(e.text || 'Не получилось распознать речь'));
      if (e.type === 'end') resolveEnd(finalText);
    };
    const r = api.speechStart('ru-RU');
    if (r && !r.ok) throw new Error(r.error);
    return {
      stop: () => {
        api.speechStop?.();
        return Promise.race([ended, new Promise<string>((res) => setTimeout(() => res(finalText), 4000))]);
      },
      cancel: () => {
        window.__mnemaSpeech = undefined;
        api.speechStop?.();
      }
    };
  }
  // Windows: записываем, потом отправляем ИИ.
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(250);
  onPartial('');
  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: async () => {
      await new Promise<void>((res) => {
        rec.onstop = () => res();
        rec.stop();
      });
      stopTracks();
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      if (blob.size < 2000) throw new Error('Запись слишком короткая — скажи ответ ещё раз.');
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const r = await api.aiTranscribe!({ data: btoa(s), mime: blob.type.split(';')[0], lang: 'ru' });
      if (!r.ok) throw new Error(r.error);
      return r.text;
    },
    cancel: () => {
      try {
        rec.stop();
      } catch {
        /* уже остановлено */
      }
      stopTracks();
    }
  };
}

/** Насколько сказанное похоже на правильный ответ: доля «важных» слов ответа, которые прозвучали. */
export function compareSpoken(spoken: string, answer: string): { hit: number; total: number; missed: string[] } {
  const plain = (s: string) =>
    normalizeAnswer(s.replace(/\$[^$]*\$/g, ' ').replace(/[*_=#>[\]()]/g, ' '))
      .split(/[^a-zа-я0-9]+/i)
      .filter(Boolean);
  const stop = new Set(['и', 'в', 'во', 'на', 'с', 'со', 'к', 'по', 'а', 'но', 'что', 'это', 'как', 'из', 'от', 'до', 'для', 'при', 'за', 'не', 'the', 'a', 'of', 'to']);
  const stem = (w: string) => (w.length > 5 ? w.slice(0, Math.max(4, w.length - 3)) : w);
  const said = new Set(plain(spoken).map(stem));
  const key = [...new Set(plain(answer).filter((w) => !stop.has(w) && (w.length > 2 || /\d/.test(w))))];
  const missed = key.filter((w) => !said.has(stem(w)));
  return { hit: key.length - missed.length, total: key.length, missed };
}

/* ---------- Долгий рассказ (стихи наизусть) ---------- */

export interface RecitalSession {
  stop: () => Promise<{ text: string; times?: number[] }>;
  cancel: () => void;
}

/** Можно ли рассказывать стих вслух: на телефоне — всегда, на компьютере — если включён ИИ-помощник. */
export function recitalVoice(aiOn: boolean): 'native' | 'ai' | null {
  const k = voiceSupported();
  return k === 'native' || (k === 'ai' && aiOn) ? k : null;
}

/**
 * Рассказ целиком. На телефоне распознавание само замолкает после паузы — перезапускаем его, пока не нажали «Готово»,
 * и запоминаем, когда прозвучало каждое слово (чтобы найти запинки). На компьютере — запись и распознавание ИИ.
 */
export async function startRecital(onText: (text: string) => void): Promise<RecitalSession> {
  const api = window.mnemaApi!;
  if (!api.speechStart) {
    const s = await startVoice(onText);
    return { stop: async () => ({ text: await s.stop() }), cancel: s.cancel };
  }
  let done = ''; // текст закончившихся кусков
  let cur = ''; // текущий кусок
  const times: number[] = []; // время каждого слова (по всем кускам)
  let curTimes: number[] = [];
  let active = true;
  let empty = 0;
  let failed: string | null = null;
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((res) => (finish = res));
  const count = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const joined = () => (done + ' ' + cur).trim();
  const onPartial = (t: string) => {
    const n = count(t);
    while (curTimes.length < n) curTimes.push(Date.now());
    curTimes.length = n;
    cur = t;
    onText(joined());
  };
  const endPiece = () => {
    if (cur.trim()) {
      done = joined();
      times.push(...curTimes);
      empty = 0;
    } else empty++;
    cur = '';
    curTimes = [];
  };
  const start = () => {
    const r = api.speechStart!('ru-RU');
    if (r && !r.ok) {
      failed = r.error ?? 'Не получилось включить микрофон';
      active = false;
      finish();
    }
  };
  window.__mnemaSpeech = (e) => {
    if (e.type === 'partial' && e.text) onPartial(e.text);
    else if (e.type === 'final') {
      if (e.text) onPartial(e.text);
      endPiece();
    } else if (e.type === 'error') {
      endPiece();
      const soft = /Не расслышал/.test(e.text ?? '');
      if (!soft) failed = e.text ?? 'Не получилось распознать речь';
      if (!active || !soft || empty >= 3) {
        active = false;
        finish();
      } else setTimeout(() => active && start(), 150);
    } else if (e.type === 'end') {
      if (active) setTimeout(() => active && start(), 150);
      else finish();
    }
  };
  start();
  return {
    stop: async () => {
      active = false;
      api.speechStop?.();
      await Promise.race([finished, new Promise((r) => setTimeout(r, 3000))]);
      if (cur.trim()) endPiece();
      window.__mnemaSpeech = undefined;
      const text = done.trim();
      if (!text && failed) throw new Error(failed);
      return { text, times: times.slice(0, count(text)) };
    },
    cancel: () => {
      active = false;
      window.__mnemaSpeech = undefined;
      api.speechStop?.();
    }
  };
}
