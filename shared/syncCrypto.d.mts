export const CODE_ALPHABET: string;
export const CODE_LEN: number;
export function newCode(): string;
export function normCode(s: string): string;
export function formatCode(code: string): string;
export function syncKey(code: string): Promise<CryptoKey>;
export function seal(key: CryptoKey, label: string, obj: unknown): Promise<string>;
export function open<T = any>(key: CryptoKey, label: string, text: string): Promise<T>;
export function nonce(): string;
