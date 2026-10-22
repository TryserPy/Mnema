// Поиск по справке (1.34): без учёта регистра и «ё», по всем словам запроса.
import { isValidElement, type ReactNode } from 'react';

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/** Текст из ReactNode (строки, числа, вложенные элементы) — чтобы искать и по оформленным ответам. */
export function nodeText(n: ReactNode): string {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join(' ');
  if (isValidElement(n)) return nodeText((n.props as { children?: ReactNode }).children);
  return '';
}

/** Все слова запроса есть в тексте (начало слова или его часть: «контрол» найдёт «контрольная»). */
export function helpMatch(query: string, ...texts: string[]): boolean {
  const q = norm(query);
  if (!q) return true;
  const hay = norm(texts.join(' '));
  return q.split(' ').every((w) => hay.includes(w));
}
