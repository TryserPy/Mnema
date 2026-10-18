export function decodeEntities(s: string): string;
export function htmlToPlain(html: string): string;
export function articleText(html: string, maxChars?: number): { title: string; text: string; cut: boolean };
export interface CaptionTrack {
  lang: string;
  url: string;
  auto: boolean;
}
export function youtubeTracks(html: string): { title: string; tracks: CaptionTrack[] };
export function pickTrack(tracks: CaptionTrack[], langs?: string[]): CaptionTrack | null;
export function captionsText(body: string): string;
export type YtState = 'ok' | 'consent' | 'bot' | 'age' | 'login' | 'private' | 'unavailable';
export function youtubePage(html: string): { title: string; tracks: CaptionTrack[]; apiKey: string; state: YtState };
export function playerTracks(json: unknown): { title: string; tracks: CaptionTrack[]; state: YtState };
export function rankTracks(tracks: CaptionTrack[], langs?: string[]): CaptionTrack[];
export const YT_ANDROID_UA: string;
export const YT_WHY: Record<'none' | 'empty' | 'age' | 'login' | 'private' | 'unavailable' | 'bot' | 'consent', string>;
export type YtFetch = (url: string, accept: string, headers: Record<string, string>) => Promise<{ text: string }>;
export type YtPost = (url: string, body: string, headers: Record<string, string>) => Promise<{ text: string }>;
export function youtubeCaptions(id: string, get: YtFetch, post: YtPost, langs?: string[]): Promise<{ title: string; text: string; lang: string; auto: boolean }>;
