// «Сообщить о проблеме»: на каком экране был ученик — коротко, без названий тем и предметов (их видно только ему).
import type { ReportContext } from './refrain';
import type { Route } from './types';

const SETTINGS: Record<string, string> = { look: 'Оформление', text: 'Оформление', motion: 'Оформление', styles: 'Оформление', features: 'Возможности', study: 'Учёба', reminders: 'Напоминания', ai: 'ИИ-помощник', keys: 'Клавиши', data: 'Данные', mods: 'Моды', about: 'О Refrain' };
const TOPIC_TAB: Record<string, string> = { note: 'Конспект', cards: 'Карточки' };
const SUBJECT_VIEW: Record<string, string> = { topics: 'Темы', rules: 'Правила', terms: 'Термины', timeline: 'Лента времени' };

/** Экран словами: «Тема → Конспект», «Настройки → ИИ-помощник». */
export function whereLabel(r: Route | null | undefined): string {
  if (!r) return '';
  switch (r.name) {
    case 'today':
      return 'Сегодня';
    case 'knowledge':
      return 'Карта знаний';
    case 'profile':
      return 'Профиль';
    case 'subject':
      return `Предмет → ${SUBJECT_VIEW[r.view ?? 'topics'] ?? 'Темы'}`;
    case 'folder':
      return 'Папка';
    case 'homework':
      return 'Домашка';
    case 'plugin':
      return 'Экран мода';
    case 'exam':
      return 'Подготовка к контрольной';
    case 'topic':
      return `Тема → ${r.tab ? (TOPIC_TAB[r.tab] ?? (r.tab.startsWith('list:') ? 'Список' : r.tab.startsWith('poem:') ? 'Стихотворение' : 'Конспект')) : 'Конспект'}`;
    case 'review':
      return r.focus ? 'Повторение (фокус)' : 'Повторение карточек';
    case 'test':
      return 'Тест';
    case 'stats':
      return r.tab === 'map' ? 'Статистика → Карта' : 'Статистика';
    case 'trash':
      return 'Корзина';
    case 'settings':
      return r.section ? `Настройки → ${SETTINGS[r.section] ?? r.section}` : 'Настройки';
    case 'features':
      return 'Возможности';
    case 'help':
      return 'Справка';
  }
}

/** Раздел формы по экрану (если ошибка ИИ не подсказала свой). */
export function categoryOfRoute(r: Route | null | undefined): ReportContext['category'] {
  if (!r) return 'other';
  if (r.name === 'topic') return !r.tab || r.tab === 'note' ? 'note' : 'cards';
  if (r.name === 'review' || r.name === 'test') return 'cards';
  if (r.name === 'settings') return r.section === 'ai' ? 'ai' : r.section && ['look', 'text', 'motion', 'styles'].includes(r.section) ? 'styles' : 'other';
  return 'other';
}
