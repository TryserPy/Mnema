// Озвучка слова (для словарей): голоса системы. На Android — через телефон (TextToSpeech).
export const SPEAK_LANGS: { value: string; label: string }[] = [
  { value: '', label: 'Без озвучки' },
  { value: 'en-US', label: 'Английский' },
  { value: 'de-DE', label: 'Немецкий' },
  { value: 'fr-FR', label: 'Французский' },
  { value: 'es-ES', label: 'Испанский' },
  { value: 'it-IT', label: 'Итальянский' },
  { value: 'zh-CN', label: 'Китайский' },
  { value: 'ja-JP', label: 'Японский' },
  { value: 'ru-RU', label: 'Русский' }
];

export function canSpeak(): boolean {
  return Boolean(window.mnemaApi?.speak) || (typeof window !== 'undefined' && 'speechSynthesis' in window);
}

/** Убирает разметку, чтобы не читать вслух звёздочки и доллары. */
function plain(text: string): string {
  return text
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/[*_=#>`[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text: string, lang: string) {
  const t = plain(text);
  if (!t || !lang) return;
  if (window.mnemaApi?.speak) {
    window.mnemaApi.speak(t, lang);
    return;
  }
  if (!('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = lang;
  const voice = synth.getVoices().find((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase()) ?? synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  if (voice) u.voice = voice;
  u.rate = 0.92;
  synth.speak(u);
}
