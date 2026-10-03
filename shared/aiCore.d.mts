export const BUILTIN: string[];
export const DEFAULTS: Record<string, unknown>;
export function cleanKey(k: string): string;
export function normalizeConfig(c: unknown): Record<string, unknown>;
export function sameServer(a: string, b: string): boolean;
export function createAiService(opts: {
  http: (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; bodyBase64?: boolean; timeout?: number }) => Promise<{ status: number; text: string; error?: string }>;
  store: { read: () => unknown; write: (c: unknown) => void; encrypt: (s: string) => string; decrypt: (s: string) => string; newId: () => string };
}): {
  getConfig: () => any;
  setConfig: (p: any) => any;
  saveCustom: (d: any) => any;
  deleteCustom: (id: string) => any;
  ask: (r: any) => Promise<any>;
  transcribe: (r: any) => Promise<any>;
  probe: (q: any) => Promise<any>;
  localModels: () => Promise<any>;
};
