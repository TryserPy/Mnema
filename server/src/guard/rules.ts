// Правила детектора — чистые функции без базы и сети: у каждого свой тест (test/guard-rules.test.ts).
import { FIELD_LIMITS, TASKS, TASK_FIELDS, parseAppHeader } from '../../../shared/refrain/api.mjs';
import type { RuleId } from '../../../shared/refrain/guard';
import { TASK_SPECS } from '../../../shared/prompts/tasks';

/** Поля, которыми пытаются подсунуть свой промт или поменять модель. */
const PROMPT_KEYS = new Set(['system', 'prompt', 'messages', 'model', 'max_tokens', 'max_completion_tokens', 'temperature', 'reasoning', 'reasoning_effort', 'tools', 'instructions', 'input', 'response_format', 'stop', 'top_p']);
/** «Свои указания» или текст, похожие на подмену роли в чате. */
const ROLE_INJECTION = /"role"\s*:\s*"(system|developer)"|<\|im_start\|>|\[\/?INST\]/i;

export interface ContractCheck {
  rules: RuleId[];
  /** Причина отказа в терминах контракта; null — запрос по контракту. */
  error: 'bad_request' | 'payload_too_large' | null;
}

/** Тело POST /v1/task по контракту? Картинка проверяется отдельно (imageInfo), здесь — поля, типы и длины. */
export function checkTaskBody(body: unknown): ContractCheck {
  const rules = new Set<RuleId>();
  let error: ContractCheck['error'] = null;
  const bad = (r: RuleId, e: 'bad_request' | 'payload_too_large' = 'bad_request') => {
    rules.add(r);
    if (error !== 'bad_request') error = e;
  };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { rules: ['extra_fields'], error: 'bad_request' };
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    if (PROMPT_KEYS.has(k)) bad('own_prompt');
    else if (!TASK_FIELDS.includes(k)) bad('extra_fields');
  }
  if (typeof b.task !== 'string' || !(TASKS as string[]).includes(b.task)) {
    bad('unknown_task');
    return { rules: [...rules], error: 'bad_request' };
  }
  const spec = TASK_SPECS[b.task as keyof typeof TASK_SPECS];
  const str = (k: string, max: number) => {
    if (b[k] === undefined) return;
    if (typeof b[k] !== 'string') bad('extra_fields');
    else if ((b[k] as string).length > max) bad('oversize', 'payload_too_large');
  };
  str('subject', FIELD_LIMITS.subject);
  str('topic', FIELD_LIMITS.topic);
  str('wishes', FIELD_LIMITS.wishes);
  if (b.page !== undefined && !(Number.isInteger(b.page) && (b.page as number) >= 1 && (b.page as number) <= FIELD_LIMITS.page)) bad('extra_fields');
  if (b.text !== undefined) {
    if (spec.textMax === 0 || typeof b.text !== 'string') bad('extra_fields');
    else if (b.text.length > spec.textMax) bad('oversize', 'payload_too_large');
  } else if (spec.textMax > 0 && spec.image !== 'optional') bad('extra_fields');
  if (b.image !== undefined) {
    const im = b.image as Record<string, unknown>;
    if (spec.image === 'forbidden' || !im || typeof im !== 'object' || Object.keys(im).some((k) => k !== 'mime' && k !== 'data') || typeof im.data !== 'string' || !FIELD_LIMITS.imageMimes.includes(String(im.mime))) bad('extra_fields');
    else if ((im.data as string).length > Math.ceil((FIELD_LIMITS.imageBytes * 4) / 3) + 4) bad('oversize', 'payload_too_large');
  } else if (spec.image === 'required') bad('extra_fields');
  for (const k of ['wishes', 'text'] as const) if (typeof b[k] === 'string' && ROLE_INJECTION.test(b[k] as string)) bad('own_prompt');
  return { rules: [...rules], error };
}

/** Размер картинки по заголовку файла (JPEG, PNG, WebP). null — не картинка или повреждена. */
export function imageInfo(bytes: Uint8Array): { width: number; height: number; mime: string } | null {
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const u32 = (i: number) => ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { width: u32(16), height: u32(20), mime: 'image/png' };
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const len = u16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: u16(i + 5), width: u16(i + 7), mime: 'image/jpeg' };
      i += 2 + len;
    }
    return null;
  }
  if (bytes.length > 30 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    if (kind === 'VP8 ') return { width: ((bytes[27] << 8) | bytes[26]) & 0x3fff, height: ((bytes[29] << 8) | bytes[28]) & 0x3fff, mime: 'image/webp' };
    if (kind === 'VP8L') {
      const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)), mime: 'image/webp' };
    }
    if (kind === 'VP8X') return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)), mime: 'image/webp' };
  }
  return null;
}

/** Расстояние между точками, км (гаверсинус). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** «Невозможное перемещение»: далеко и быстрее самолёта. */
export function impossibleTravel(prev: { lat: number; lon: number; at: number }, cur: { lat: number; lon: number; at: number }, p: { maxKmh: number; minKm: number }): boolean {
  const km = distanceKm(prev, cur);
  if (km < p.minKm) return false;
  const hours = Math.max(cur.at - prev.at, 60000) / 3600000;
  return km / hours > p.maxKmh;
}

/** Ровный «машинный» ритм: разброс промежутков между запросами (коэффициент вариации) меньше maxCv. */
export function machineRhythm(times: number[], p: { minRequests: number; maxCv: number }): boolean {
  if (times.length < p.minRequests) return false;
  const t = [...times].sort((a, b) => a - b);
  const gaps = t.slice(1).map((x, i) => x - t[i]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean <= 0) return true;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  return sd / mean < p.maxCv;
}

/** Самые дорогие задачи — те, у которых наибольший потолок стоимости (стиль, свести параграф, дословно). */
export const EXPENSIVE_TASKS = new Set(['style', 'textbook.merge', 'textbook.verbatim']);

export function expensiveOnly(tasks: string[], p: { minRequests: number; share: number }): boolean {
  if (tasks.length < p.minRequests) return false;
  return tasks.filter((t) => EXPENSIVE_TASKS.has(t)).length / tasks.length >= p.share;
}

/** Расход за час сильно выше нормы группы и собственной нормы. Без дневного лимита (владелец) — не считается. */
export function burnRate(hourPages: number, groupPerDay: number | null, selfHourAvg: number, p: { groupFactor: number; selfFactor: number; minPages: number }): boolean {
  if (groupPerDay === null || hourPages < p.minPages) return false;
  return hourPages > (groupPerDay / 24) * p.groupFactor && hourPages > selfHourAvg * p.selfFactor;
}

/** Клиент похож на Refrain: заголовок есть и версия существует. */
export function clientRules(appHeader: string | null, knownVersions: string[]): RuleId[] {
  const app = parseAppHeader(appHeader);
  if (!app) return ['ua_missing'];
  return knownVersions.includes(app.version) ? [] : ['app_version_unknown'];
}

/** Правила, которые говорят о подделке или краже (реакция уровня 2 — сначала отзыв и отвязка, при повторе блок). */
export const FORGERY_RULES = new Set<RuleId>(['sig_invalid', 'token_unknown', 'device_unknown', 'nonce_replay', 'refresh_reuse', 'time_skew']);
export const TRAVEL_RULES = new Set<RuleId>(['impossible_travel', 'account_many_ips']);
export const CONTRACT_RULES = new Set<RuleId>(['unknown_task', 'extra_fields', 'oversize', 'own_prompt', 'parallel']);
