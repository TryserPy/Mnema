// Шаблоны карточек: готовые заготовки и свои. «___» — место, которое нужно заполнить.
import type { CardTemplate } from './types';

export const BUILTIN_TEMPLATES: CardTemplate[] = [
  { id: 'b-what', name: 'Что такое…?', type: 'basic', front: 'Что такое ___?', back: '___' },
  { id: 'b-why', name: 'Почему…?', type: 'basic', front: 'Почему ___?', back: 'Потому что ___', why: '' },
  { id: 'b-diff', name: 'Чем отличается', type: 'basic', front: 'Чем ___ отличается от ___?', back: '___' },
  { id: 'b-date', name: 'Дата ↔ событие', type: 'reverse', front: '___ год', back: '___' },
  { id: 'b-formula', name: 'Формула', type: 'basic', front: 'Формула ___?', back: '$___$' },
  { id: 'b-word', name: 'Слово ↔ перевод', type: 'reverse', front: '___', back: '___' },
  { id: 'b-who', name: 'Кто это?', type: 'basic', front: 'Кто такой ___?', back: '___' },
  { id: 'b-rule', name: 'Правило с пропуском', type: 'cloze', front: '___ {{___}} ___' },
  { id: 'b-exact', name: 'Точный ответ', type: 'typing', front: '___?', back: '___' }
];

/** Позиция первого «___» — туда ставим курсор после выбора шаблона. */
export function firstBlank(s: string): [number, number] | null {
  const i = s.indexOf('___');
  return i < 0 ? null : [i, i + 3];
}
