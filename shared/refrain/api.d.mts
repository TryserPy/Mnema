// Типы контракта «приложение ↔ сервер Refrain ИИ». Значения — в api.mjs, описание — docs/refrain-1.31/contracts.md.

export type TaskId = 'textbook.summary' | 'textbook.brief' | 'textbook.verbatim' | 'textbook.merge' | 'notebook.read' | 'cards' | 'explain' | 'style' | 'formula' | 'file.split';
export type ErrorCode =
  | 'limit_day'
  | 'limit_month'
  | 'paused'
  | 'access_closed'
  | 'blocked'
  | 'too_fast'
  | 'bad_request'
  | 'payload_too_large'
  | 'upstream'
  | 'internal'
  | 'token_expired'
  | 'device_unknown'
  | 'clock_skew'
  | 'session_revoked'
  | 'device_limit'
  | 'pow_invalid'
  | 'email_rejected'
  | 'code_invalid'
  | 'code_locked'
  | 'invite_invalid';
export type Platform = 'windows' | 'linux' | 'android';
export type GroupId = 'owner' | 'tester' | 'newbie' | 'student' | 'blocked' | `g_${string}`;

export const API_VERSION: number;
export const API_PREFIX: string;
export const TASKS: TaskId[];
export const TASK_FIELDS: string[];
export const FIELD_LIMITS: { imageBytes: number; imageSide: number; imageMimes: string[]; subject: number; topic: number; page: number; wishes: number; bodyBytes: number };
export const ERRORS: Record<ErrorCode, number>;
export const H: { auth: string; device: string; time: string; nonce: string; signature: string; app: string };
export const SIGNATURE_WINDOW_MS: number;
export const NONCE_TTL_MS: number;
export const ACCESS_TTL_MS: number;
export const REFRESH_TTL_MS: number;
export const REFRESH_RETRY_MS: number;
export function canonicalString(p: { method: string; path: string; bodySha256Hex: string; time: number; nonce: string; deviceId: string }): string;
export function parseAppHeader(v: string | null | undefined): { version: string; platform: Platform } | null;
export function powOk(hashBytes: Uint8Array, difficulty: number): boolean;
export function pagesLabel(n: number): string;

// ---------- Общее ----------

/** Остаток лимита ученика в страницах. null — без лимита (группа «Ты»). */
export interface Quota {
  day: { used: number; limit: number | null };
  month: { used: number; limit: number | null };
  /** Когда обнулится дневной счётчик: полночь по Москве, ISO-время. */
  resetsAt: string;
  group: GroupId;
}

export interface ApiError {
  ok: false;
  error: {
    code: ErrorCode;
    /** Короткий текст по-русски для ученика. Без причин срабатывания защиты и без чужих данных. */
    message: string;
    retryAfter?: number; // секунды
    until?: string | null; // для blocked
    attemptsLeft?: number; // для code_invalid
    quota?: Quota; // для limit_*
    devices?: DeviceInfo[]; // для device_limit
    serverTime?: number; // для clock_skew: время сервера, мс
  };
}

export interface DeviceInfo {
  id: string;
  name: string;
  platform: Platform;
  lastSeen: string;
  current?: boolean;
}

// ---------- Вход (без подписи; PoW обязателен для start) ----------

/** POST /v1/auth/pow → PowChallenge. purpose — для чего задачка: вход или баг. */
export interface PowRequest {
  purpose: 'login' | 'bug';
}
export interface PowChallenge {
  ok: true;
  /** Подписанная сервером строка, менять нельзя. Действует до expiresAt, решается один раз. */
  challenge: string;
  difficulty: number; // бит
  expiresAt: string;
}
export interface PowSolution {
  challenge: string;
  solution: string;
}

/** POST /v1/auth/start → { ok: true } для любой почты (существует аккаунт или нет). */
export interface AuthStart {
  email: string;
  pow: PowSolution;
}

/** POST /v1/auth/verify → AuthTokens. Публичный ключ устройства — P-256 SPKI, base64url. */
export interface AuthVerify {
  email: string;
  code: string; // 6 цифр
  device: { publicKey: string; name: string; platform: Platform };
  invite?: string; // RFN-XXXX-XXXX
  /** Повтор после device_limit: какое из устройств отвязать (код остаётся действительным, пока не истёк). */
  replaceDevice?: string;
}
export interface AuthTokens {
  ok: true;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  deviceId: string;
  quota: Quota;
  /** Маска почты для экрана настроек: a***@mail.ru. Полная почта у приложения и так есть — её ввёл ученик. */
  emailMasked: string;
}

// ---------- Подписанные запросы (заголовки H.*) ----------

/** POST /v1/auth/refresh — подписан ключом устройства, без Authorization. Старый refreshToken после этого недействителен. */
export interface AuthRefresh {
  refreshToken: string;
}
/** POST /v1/auth/logout → { ok: true }: закрывает сессию этого устройства. */
/** POST /v1/invite { code } → { ok: true, quota }: приглашение привязывается к почте один раз. */
export interface InviteApply {
  code: string;
}
/** GET /v1/me → Me. */
export interface Me {
  ok: true;
  emailMasked: string;
  quota: Quota;
  devices: DeviceInfo[];
  access: 'open' | 'closed'; // закрыт ли Refrain ИИ для этого аккаунта прямо сейчас
}
/** DELETE /v1/devices/:id → { ok: true } — отвязать устройство (своё или другое). */
/** DELETE /v1/account → { ok: true } — стереть почту, счётчики, устройства и сессии. */

/** POST /v1/task. Лишних полей быть не должно. */
export interface TaskRequest {
  task: TaskId;
  image?: { mime: 'image/jpeg' | 'image/png' | 'image/webp'; data: string };
  /** Текст для задач без фото: конспект для карточек, страницы для «Свести параграф», вопрос для «Объяснить иначе», описание стиля. */
  text?: string;
  subject?: string;
  topic?: string;
  page?: number;
  /** «Свои указания» ученика, до 400 знаков. Сервер ставит их отдельным блоком после правил задачи. */
  wishes?: string;
}
export interface TaskResponse {
  ok: true;
  text: string;
  format: 'markdown' | 'json' | 'latex' | 'text';
  /** Версия промта на сервере: входит в ключ кэша ответов на устройстве (хэш фото + задача + promptVersion). */
  promptVersion: string;
  /** Сколько страниц списано за этот ответ (доли страницы). */
  charged: number;
  quota: Quota;
}

// ---------- Баги (без входа, с PoW) ----------

/** POST /v1/bug → { ok: true, id: number }. Снимок экрана уходит в Telegram и на сервере не остаётся. */
export interface BugReport {
  pow: PowSolution;
  category: 'note' | 'textbook' | 'cards' | 'styles' | 'ai' | 'other';
  text: string; // до 2000 знаков
  app: { version: string; platform: Platform; os: string; style?: string };
  /** Последние строки журнала ошибок, без путей и почт (чистит приложение, сервер чистит ещё раз). До 50 строк по 300 знаков. */
  log?: string[];
  /** Заполняется сам, если форма открыта из-под ошибки ИИ. */
  context?: { task?: TaskId; error?: string };
  /** JPEG base64, до 1 МБ. */
  screenshot?: string;
}
