import { normalizeAnswer } from './srs';
import type { CardType } from './types';

export function suggestFromSelection(sel: string): { type: CardType; front: string; back: string } {
  const clean = sel.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.{2,80}?)\s+[—–-]\s+(?:это\s+)?([\s\S]+)$/);
  if (m) {
    const term = m[1].trim();
    return { type: 'basic', front: `Что такое ${term.charAt(0).toLowerCase() + term.slice(1)}?`, back: m[2].trim().replace(/\.$/, '') + '.' };
  }
  if (clean.split(/\s+/).length <= 4) return { type: 'reverse', front: clean, back: '' };
  return { type: 'cloze', front: clean, back: '' };
}

export function boldTerms(note: string): string[] {
  const out = new Set<string>();
  for (const m of note.matchAll(/\*\*(.+?)\*\*/g)) {
    const t = m[1].trim();
    if (t.length > 1 && !/^итог/i.test(t)) out.add(t.replace(/:$/, ''));
  }
  return [...out];
}

/** Слово считается названным, если в пересказе есть слово с тем же началом (грубо учитывает окончания). */
export function mentioned(term: string, recall: string): boolean {
  const words = normalizeAnswer(recall).split(/[^a-zа-я0-9]+/i).filter(Boolean);
  const parts = normalizeAnswer(term).split(/[^a-zа-я0-9]+/i).filter((w) => w.length > 2);
  if (parts.length === 0) return normalizeAnswer(recall).includes(normalizeAnswer(term));
  return parts.every((p) => {
    const stem = p.length > 5 ? p.slice(0, Math.max(4, p.length - 3)) : p;
    return words.some((w) => w.startsWith(stem));
  });
}

