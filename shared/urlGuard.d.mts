export function parseIPv4(host: string): number[] | null;
export function privateIPv4(ip: number[]): boolean;
export function privateIPv6(host: string): boolean;
export function checkUrl(raw: unknown, maxChars?: number): { ok: true; url: string } | { ok: false; why: string };
export function youtubeId(raw: string): string | null;
