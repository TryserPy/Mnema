// Подсказка при первом открытии экрана (1.34): одна-две строки «что это и что здесь делать». Показывается один раз
// на этом устройстве; «Помощь → Показать подсказки снова» возвращает все.
import { recall, remember } from './uiMemory';

export type TipId = 'today' | 'knowledge' | 'subject' | 'topic' | 'profile';

export const SCREEN_TIPS: Record<TipId, { title: string; text: string }> = {
  today: { title: '«Учусь» — план на сегодня', text: 'Нажми «Учиться»: Refrain сам выберет карточки, которые ты начинаешь забывать. Хватит 10 минут в день.' },
  knowledge: { title: '«Знания» — все предметы', text: 'Предмет → темы. В каждой теме — конспект и карточки. Открой предмет, чтобы увидеть темы.' },
  subject: { title: 'Это предмет', text: '«3 сегодня» у темы — сколько её карточек повторить сегодня, «выучено 40%» — сколько ты уже помнишь. В «⋮» — учить весь предмет, контрольная и экспорт.' },
  topic: { title: 'Это тема', text: 'Здесь конспект и карточки. Выдели в конспекте важное и нажми «В карточку». «Учить · 3» — сколько карточек темы на сегодня.' },
  profile: { title: 'Профиль', text: 'Статистика, настройки, корзина и «Помощь». В «Помощи» есть поиск и словарь: что такое тема, термин, правило.' }
};

const KEY = 'tips-seen';

export function tipSeen(id: TipId): boolean {
  return recall<string[]>(KEY, []).includes(id);
}

export function markTipSeen(id: TipId): void {
  const seen = recall<string[]>(KEY, []);
  if (!seen.includes(id)) remember(KEY, [...seen, id]);
}

/** «Показать подсказки снова». */
export function resetTips(): void {
  remember(KEY, undefined);
}
