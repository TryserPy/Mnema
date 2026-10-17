// Типы клиента Refrain ИИ (shared/refrainClient.mjs).
import type { BugReport, DeviceInfo, ErrorCode, ExtractResponse, Me, Platform, Quota, TaskRequest } from './refrain/api.mjs';

export const REFRAIN_API: string;
export const CACHE_TTL_MS: number;
export const CACHE_MAX: number;
export const FALLBACK_CODES: string[];
export function refrainPlatform(p: string): Platform;
export function refrainMessage(code: string, extra?: { retryAfter?: number; until?: string | null; attemptsLeft?: number }): string;

export function sha256(data: string | Uint8Array): Uint8Array;
export function sha256hex(data: string | Uint8Array): string;
export function hex(bytes: Uint8Array): string;
export function b64url(bytes: Uint8Array): string;
export function fromB64(s: string): Uint8Array;
export function derToP1363(der: Uint8Array | ArrayBuffer): Uint8Array | null;
export function solvePow(challenge: string, difficulty: number, o?: { yieldEvery?: number; pause?: () => Promise<void>; limit?: number }): Promise<string>;
export function taskBody(fields: Partial<TaskRequest> | undefined, wishes?: string): TaskRequest | null;
export function cacheKey(body: TaskRequest): string;

/** Код ошибки сервера или свой: network (нет связи), signed_out, no_secure_storage, device_key. */
export type RefrainCode = ErrorCode | 'network' | 'signed_out' | 'no_secure_storage' | 'device_key';
export interface RefrainFail {
  ok: false;
  code: RefrainCode;
  error: string;
  retryAfter?: number;
  until?: string | null;
  attemptsLeft?: number;
  quota?: Quota;
  devices?: DeviceInfo[];
  /** /v1/extract: что не так со ссылкой — и что сделать. */
  detail?: string;
}
export type RefrainResult<T = object> = ({ ok: true } & T) | RefrainFail;

export interface RefrainSession {
  deviceId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  emailMasked?: string;
  quota?: Quota | null;
}

export type RefrainStatus = { signedIn: false; secure: boolean } | { signedIn: true; secure: boolean; emailMasked: string; quota: Quota | null };

export interface RefrainSigner {
  publicKey(): Promise<string>;
  sign(message: string): Promise<string>;
  reset(): Promise<void>;
  secure(): Promise<boolean>;
}

export interface RefrainClient {
  signedIn(): boolean;
  status(): Promise<RefrainStatus>;
  loginStart(email: string): Promise<RefrainResult>;
  loginVerify(p: { email: string; code: string; invite?: string; replaceDevice?: string; deviceName?: string }): Promise<RefrainResult<{ emailMasked: string; quota: Quota }>>;
  task(fields: Omit<TaskRequest, 'wishes'> & { wishes?: string }, wishes?: string): Promise<RefrainResult<{ text: string; format: string; cached?: boolean; charged: number; quota: Quota | null }>>;
  me(): Promise<RefrainResult<Omit<Me, 'ok'>>>;
  invite(code: string): Promise<RefrainResult<{ quota: Quota }>>;
  extract(url: string): Promise<RefrainResult<Omit<ExtractResponse, 'ok'>>>;
  unbind(deviceId: string): Promise<RefrainResult>;
  deleteAccount(): Promise<RefrainResult>;
  logout(): Promise<RefrainResult>;
  bug(report: Omit<BugReport, 'pow'>): Promise<RefrainResult<{ id: number }>>;
}

export function createRefrainClient(opts: {
  http: (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number }) => Promise<{ status: number; text: string; error?: string }>;
  store: { read: () => RefrainSession | null; write: (s: RefrainSession | null) => void; readCache: () => unknown; writeCache: (c: unknown) => void };
  signer: RefrainSigner;
  platform: Platform;
  appVersion: string;
  base?: string;
  now?: () => number;
  random?: (n: number) => Uint8Array;
  pause?: () => Promise<void>;
}): RefrainClient;
