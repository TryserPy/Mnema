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
