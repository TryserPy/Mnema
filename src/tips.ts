// Советы по учёбе, которые показываются в нужный момент. Каждый опирается на исследования.
import { dayStart, DAY, todayCounts, topicMastery } from './srs';
import type { AppData } from './types';

export interface Tip {
  id: string;
  text: string;
  why: string;
}

const GENERAL: Tip[] = [
  {
    id: 'g-retrieval',
    text: 'Лучший способ запомнить — вспоминать без подсказки. Сначала ответь в уме, потом открывай ответ.',
    why: 'Самопроверка получила высшую оценку полезности в обзоре 10 приёмов учёбы (Dunlosky и др., 2013): она помогает ученикам любого возраста и на разных видах проверок.'
  },
  {
    id: 'g-spacing',
    text: 'Два коротких подхода в разные дни дают больше, чем один длинный. Поэтому Мнема разносит повторения по дням.',
    why: 'Распределённое повторение — второй приём с высшей оценкой в обзоре Dunlosky и др. (2013). Лучший перерыв зависит от того, когда проверка: для проверки через несколько недель — около 20% этого срока (Cepeda и др., 2008).'
  },
  {
    id: 'g-own-words',
    text: 'Формулируй карточки своими словами, а не копией из учебника — так лучше понимаешь и запоминаешь.',
    why: 'Эффект порождения: информацию, которую человек сформулировал сам, он помнит лучше, чем прочитанную готовой.'
  },
  {
    id: 'g-why',
    text: 'Добавляй к трудным карточкам поле «Почему это так?» — объяснение связывает факт с тем, что ты уже знаешь.',
    why: 'Вопрос «почему?» (elaborative interrogation) получил среднюю оценку полезности в обзоре Dunlosky и др. (2013).'
  },
  {
    id: 'g-mix',
    text: 'Мнема перемешивает карточки разных тем. Так сложнее, но это учит различать похожие понятия.',
    why: 'Перемешивание (interleaving) получило среднюю оценку полезности в обзоре Dunlosky и др. (2013).'
  }
];

export function pickTip(data: AppData, now: Date): Tip | null {
  if (!data.settings.features.tips) return null;
  const hidden = new Set(data.settings.dismissedTips);
  const candidates: Tip[] = [];

  const noteOnly = data.topics.find((t) => t.note.trim().length > 40 && !data.cards.some((c) => c.topicId === t.id));
  if (noteOnly) {
    candidates.push({
      id: `reread-${noteOnly.id}`,
      text: `В теме «${noteOnly.name}» есть конспект, но нет карточек. Перечитывание почти не помогает — сделай из конспекта 3–5 вопросов.`,
      why: 'Перечитывание и выделение маркером получили низкую оценку полезности в обзоре Dunlosky и др. (2013), а самопроверка — высокую.'
    });
  }

  const today = dayStart(now, data.settings.dayStartHour).getTime();
  for (const t of data.topics) {
    if (!t.examDate) continue;
    const days = Math.round((new Date(t.examDate + 'T12:00:00').getTime() - today) / DAY);
    const m = topicMastery(data, t.id);
    if (days >= 0 && days <= 2 && m.total > 0 && m.learned / m.total < 0.5) {
      candidates.push({
        id: `exam-${t.id}-${t.examDate}`,
        text: `До контрольной по «${t.name}» ${days === 0 ? 'сегодня' : days === 1 ? '1 день' : '2 дня'}. Пройди тему сейчас и ещё раз завтра утром — два коротких подхода лучше одного длинного.`,
        why: 'Распределённое повторение даже с короткими перерывами лучше зубрёжки за один вечер (Dunlosky и др., 2013). Режим «Перед контрольной» прогоняет всю тему, не ломая долгое расписание.'
      });
      if (now.getHours() >= 23 || now.getHours() < 4) {
        candidates.push({
          id: `sleep-${t.id}-${t.examDate}`,
          text: 'Уже поздно. Сон помогает закрепить выученное — лучше закончить и выспаться, чем учить до ночи.',
          why: 'Во сне память закрепляется; недосып перед проверкой ухудшает и запоминание, и внимание.'
        });
      }
    }
  }

  const counts = todayCounts(data, now);
  if (counts.review > 150) {
    candidates.push({
      id: `backlog-${Math.floor(now.getTime() / (7 * DAY))}`,
      text: `Накопилось ${counts.review} повторений. Уменьши число новых карточек в день, пока не разберёшь долг: пропускать повторения хуже, чем брать меньше нового.`,
      why: 'Просроченные карточки забываются, и потом на них уходит больше времени. Лимит новых карточек — в настройках.'
    });
  }

  const monthAgo = now.getTime() - 30 * DAY;
  const overconf = data.logs.filter((l) => l.confidence === 2 && l.rating === 1 && new Date(l.at).getTime() > monthAgo).length;
  if (overconf >= 5) {
    candidates.push({
      id: `overconf-${Math.floor(now.getTime() / (7 * DAY))}`,
      text: `${overconf} раз ты был уверен в ответе, но ошибся. Разбери эти карточки — такие ошибки исправляются особенно хорошо.`,
      why: 'Ошибки, сделанные с высокой уверенностью, при исправлении запоминаются лучше, чем ошибки наугад (hypercorrection effect).'
    });
  }

  const fresh = candidates.find((c) => !hidden.has(c.id));
  if (fresh) return fresh;
  const general = GENERAL.filter((g) => !hidden.has(g.id));
  if (general.length === 0) return null;
  const dayIndex = Math.floor(now.getTime() / DAY);
  return general[dayIndex % general.length];
}

export const EDITOR_TIPS = {
  longAnswer: 'Ответ длинный. Разбей его на несколько карточек: одна карточка — один факт. Длинные карточки хуже запоминаются.',
  noQuestion: 'Сформулируй вопрос так, чтобы на него был один понятный ответ.'
};

export function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
