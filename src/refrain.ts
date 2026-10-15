// Refrain ИИ в окне приложения: поля задачи для сервера (без промта), «Свои указания», счётчик страниц, уменьшение фото,
// журнал ошибок для «Сообщить о проблеме» и события для экранов лимита и формы. Сеть, токены и подпись — в shared/refrainClient.mjs.
import { FIELD_LIMITS, pagesLabel, type ErrorCode, type Quota, type TaskId, type TaskRequest } from '../shared/refrain/api.mjs';
import { TASK_SPECS } from '../shared/prompts/tasks';
import { REFRAIN_API, refrainMessage } from '../shared/refrainClient.mjs';
import { cleanNote } from './aiNotes';
import type { AiAnswer } from './store';
import type { AiNoteKey, AiNotes } from './types';

export { REFRAIN_API, refrainMessage };

/** Фото уходит в Refrain ИИ не больше этого по длинной стороне (сервер принимает до 2000 px). */
export const REFRAIN_SIDE = 1600;

export type RefrainFields = Omit<TaskRequest, 'wishes'>;

const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim(); // eslint-disable-line no-control-regex

/**
 * Поля задачи для Refrain ИИ в рамках контракта (TASK_SPECS и FIELD_LIMITS). undefined — задача в рамки не влезает
 * (нет нужного фото, текст длиннее предела): тогда запрос идёт мимо Refrain ИИ, а не нарушает контракт.
 */
export function refrainFields(f: RefrainFields | undefined): RefrainFields | undefined {
  if (!f || typeof f !== 'object') return undefined;
  const spec = TASK_SPECS[f.task as TaskId];
  if (!spec) return undefined;
  const out: RefrainFields = { task: spec.id };
  if (f.image) {
    if (spec.image === 'forbidden' || !FIELD_LIMITS.imageMimes.includes(f.image.mime) || typeof f.image.data !== 'string') return undefined;
    if (Math.floor((f.image.data.length * 3) / 4) > FIELD_LIMITS.imageBytes) return undefined;
    out.image = { mime: f.image.mime, data: f.image.data };
  } else if (spec.image === 'required') return undefined;
  if (typeof f.text === 'string' && f.text.trim()) {
    if (!spec.textMax || f.text.length > spec.textMax) return undefined;
    out.text = f.text;
  } else if (spec.textMax && spec.image === 'forbidden') return undefined;
  if (typeof f.subject === 'string' && oneLine(f.subject)) out.subject = oneLine(f.subject).slice(0, FIELD_LIMITS.subject);
  if (typeof f.topic === 'string' && oneLine(f.topic)) out.topic = oneLine(f.topic).slice(0, FIELD_LIMITS.topic);
  if (Number.isInteger(f.page) && f.page! >= 1 && f.page! <= FIELD_LIMITS.page) out.page = f.page;
  return out;
}

/** «Свои указания» для Refrain ИИ: общие и для задачи одной строкой, до 400 знаков (сервер ставит их после правил задачи). */
export function refrainWishes(notes: AiNotes | undefined, key: AiNoteKey): string {
  const parts = [notes?.all, key !== 'all' ? notes?.[key] : undefined].map((x) => (x ? cleanNote(x) : '')).filter(Boolean);
  return parts.join('; ').slice(0, FIELD_LIMITS.wishes);
}

// ---------- Счётчик страниц ----------

function pagesWord(n: number): string {
  if (!Number.isInteger(n)) return 'страницы';
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'страница';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'страницы';
  return 'страниц';
}

/** «Сегодня 12 из 30 страниц», «В этом месяце 140 из 400»; share — доля для полоски (null — без лимита). */
export function quotaLines(q: Quota): { day: string; month: string; dayShare: number | null; monthShare: number | null } {
  const line = (head: string, u: { used: number; limit: number | null }) =>
    u.limit === null ? `${head} ${pagesLabel(u.used)} ${pagesWord(Math.floor(u.used))} · без лимита` : `${head} ${pagesLabel(u.used)} из ${u.limit} ${pagesWord(u.limit)}`;
  const share = (u: { used: number; limit: number | null }) => (u.limit === null ? null : u.limit <= 0 ? 1 : Math.min(1, u.used / u.limit));
  return { day: line('Сегодня', q.day), month: line('В этом месяце', q.month), dayShare: share(q.day), monthShare: share(q.month) };
}

// ---------- Фото ----------

/** Размер после уменьшения: длинная сторона не больше max, пропорции те же. */
export function fitSide(w: number, h: number, max = REFRAIN_SIDE): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= max) return { w, h };
  const k = max / long;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Фото для Refrain ИИ: если больше 1600 px или не JPEG/PNG/WebP — перерисовать в JPEG нужного размера. */
export async function shrinkImage(img: { mime: string; data: string }, max = REFRAIN_SIDE): Promise<{ mime: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }> {
  const bytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([bytes], { type: img.mime }));
  const size = fitSide(bmp.width, bmp.height, max);
  if (size.w === bmp.width && size.h === bmp.height && FIELD_LIMITS.imageMimes.includes(img.mime) && bytes.length <= FIELD_LIMITS.imageBytes) {
    bmp.close?.();
    return { mime: img.mime as 'image/jpeg', data: img.data };
  }
  const c = document.createElement('canvas');
  c.width = size.w;
  c.height = size.h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; // прозрачный PNG в JPEG — на белом, а не на чёрном
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.drawImage(bmp, 0, 0, size.w, size.h);
  bmp.close?.();
  return { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] };
}

// ---------- Журнал для «Сообщить о проблеме» ----------

const LOG_MAX = 50;
const LINE_MAX = 300;
const log: string[] = [];

/** Строка журнала без почт, путей, длинных чисел и длинных токенов: в баг-репорт уходит только это. */
export function scrubLine(s: string): string {
  return String(s)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[почта]')
    .replace(/(?:[A-Za-z]:\\|file:\/\/\/?|\/(?:home|Users|data|storage|root|mnt|media|var|tmp|opt)\/)[^\s"'<>)]*/g, '[путь]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[…]')
    .replace(/\b\d{7,}\b/g, '[число]')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '') // eslint-disable-line no-control-regex
    .slice(0, LINE_MAX);
}

/** Записать ошибку в журнал (в памяти, последние 50 строк; на диск и в localStorage не пишется). */
export function logLine(s: string): void {
  const t = new Date().toTimeString().slice(0, 8);
  log.push(scrubLine(`${t} ${s}`));
  if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
}

export function journalLines(): string[] {
  return log.slice(-LOG_MAX);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('error', (e) => logLine(`ошибка: ${e.message || 'без текста'}`));
  window.addEventListener('unhandledrejection', (e) => logLine(`ошибка: ${(e.reason && (e.reason as Error).message) || String(e.reason)}`));
}

// ---------- События: экран лимита и «Сообщить о проблеме» ----------

export interface RefrainNotice {
  code?: ErrorCode;
  quota?: Quota;
  task?: TaskId;
  /** Текст ошибки — под ней кнопка «Сообщить о проблеме» с автозаполнением. */
  error?: string;
}

/** Ответ ИИ пришёл: обновить счётчик, при лимите или закрытом тесте показать экран (RefrainHost). */
export function noteAnswer(r: AiAnswer, task?: TaskId): void {
  if (!r.ok) logLine(`ИИ${task ? ` (${task})` : ''}: ${r.code ?? ''} ${r.error}`);
  const n: RefrainNotice = { ...(r.quota ? { quota: r.quota } : {}), ...(!r.ok && r.code ? { code: r.code } : {}), ...(!r.ok ? { error: r.error } : {}), ...(task ? { task } : {}) };
  if (n.quota || n.code || n.error) window.dispatchEvent(new CustomEvent<RefrainNotice>('refrain:answer', { detail: n }));
}

export function onRefrainAnswer(cb: (n: RefrainNotice) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<RefrainNotice>).detail);
  window.addEventListener('refrain:answer', h);
  return () => window.removeEventListener('refrain:answer', h);
}

export interface ReportContext {
  task?: TaskId;
  error?: string;
  category?: 'note' | 'textbook' | 'cards' | 'styles' | 'ai' | 'other';
}

/** Открыть «Сообщить о проблеме» (из настроек, под ошибкой ИИ, с экрана сбоя). Под ошибкой ИИ поля заполнятся сами. */
export function openReportProblem(ctx: ReportContext = {}): void {
  window.dispatchEvent(new CustomEvent<ReportContext>('refrain:report', { detail: ctx }));
}

export function onReportProblem(cb: (ctx: ReportContext) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<ReportContext>).detail ?? {});
  window.addEventListener('refrain:report', h);
  return () => window.removeEventListener('refrain:report', h);
}

/** Задача → раздел формы. */
export function categoryFor(task?: TaskId): ReportContext['category'] {
  if (!task) return 'ai';
  if (task.startsWith('textbook.')) return 'textbook';
  if (task === 'cards' || task === 'explain') return 'cards';
  if (task === 'style') return 'styles';
  if (task === 'notebook.read') return 'note';
  return 'ai';
}
