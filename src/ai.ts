// ИИ-помощник: обёртки над запросами к модели (сами запросы и ключи — в главном процессе).
import type { AppData } from './types';

export function aiAvailable(data: AppData): boolean {
  return data.settings.features.ai && Boolean(window.mnemaApi?.aiAsk);
}

async function ask(req: { system?: string; text: string; image?: { mime: string; data: string }; maxTokens?: number }): Promise<string> {
  const api = window.mnemaApi;
  if (!api?.aiAsk) throw new Error('ИИ-помощник работает в приложении для Windows.');
  const r = await api.aiAsk(req);
  if (!r.ok) throw new Error(humanError(r.error));
  if (!r.text) throw new Error('Модель вернула пустой ответ.');
  return r.text;
}

function resetLocal(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function humanError(e: string): string {
  const m = /^(\d{3}):\s*([\s\S]*)$/.exec(e.trim());
  const code = m ? Number(m[1]) : 0;
  const detail = (m ? m[2] : '').trim().slice(0, 360);
  const tail = detail ? ` Ответ сервиса: «${detail}»` : '';
  if (code === 401 || /API key not valid|invalid api key|incorrect api key/i.test(e))
    return 'Сервис не принял ключ. Проверь, что ключ скопирован целиком и не отключён на сайте сервиса.' + tail;
  if (code === 402) return 'На счёте сервиса не хватает денег или кредитов. Пополни баланс или выбери бесплатную модель.' + tail;
  if (code === 403) return 'Доступ запрещён: модель недоступна для этого ключа или в твоей стране. Попробуй другую модель.' + tail;
  if (code === 404) return 'Сервис не нашёл модель или она не умеет такой запрос. Выбери модель через «Найти модели».' + tail;
  if (code === 429 && /rate-limited upstream|temporarily rate-limited|Provider returned error/i.test(e))
    return 'Бесплатная модель сейчас перегружена у поставщика — дело не в твоём ключе. Мнема уже пробовала взять другую бесплатную модель, но все были заняты. Подожди пару минут или выбери в настройках ИИ модель «openrouter/free» (любая свободная бесплатная) или платную.' + tail;
  if (code === 429 && /free-models-per-day|per.day/i.test(e))
    return 'На сегодня закончились бесплатные запросы OpenRouter (50 в день, если счёт ни разу не пополняли; после пополнения на 10$ — 1000 в день). Лимит обновится в полночь по UTC (у тебя это ' + resetLocal() + ').' + tail;
  if (code === 429) return 'Слишком много запросов или закончился лимит. Подожди минуту и попробуй снова.' + tail;
  if (code >= 500) return 'У сервиса сейчас сбой. Попробуй позже или выбери другую модель.' + tail;
  if (code === 400) return 'Сервис не понял запрос.' + tail;
  if (/fetch failed|ENOTFOUND|ECONNRESET|network/i.test(e)) return 'Нет связи с сервером. Проверь интернет (или VPN).';
  return e;
}

/** Убирает обёртки, которые модели любят добавлять к формуле. */
export function cleanLatex(s: string): string {
  let t = s.trim();
  t = t.replace(/^```(?:latex|tex)?\s*/i, '').replace(/```$/, '').trim();
  t = t.replace(/^\$\$([\s\S]*)\$\$$/, '$1').replace(/^\$([\s\S]*)\$$/, '$1').trim();
  t = t.replace(/^\\\[([\s\S]*)\\\]$/, '$1').replace(/^\\\(([\s\S]*)\\\)$/, '$1').trim();
  return t;
}

export async function recognizeFormula(pngBase64: string): Promise<string> {
  const text = await ask({
    system:
      'Ты распознаёшь рукописные формулы по математике, физике и химии, написанные школьником. Верни ТОЛЬКО код формулы в LaTeX, без знаков $, без ``` и без пояснений. Химические формулы пиши с индексами: H_2O. Если строк несколько — раздели их \\\\. Если формулу разобрать нельзя, верни одно слово: НЕРАЗБОРЧИВО.',
    text: 'Распознай формулу на картинке.',
    image: { mime: 'image/png', data: pngBase64 },
    maxTokens: 300
  });
  const latex = cleanLatex(text);
  if (/НЕРАЗБОРЧИВО/i.test(latex)) throw new Error('Не получилось разобрать. Попробуй написать крупнее и чётче.');
  return latex;
}

export async function explainDifferently(p: { subject?: string; topic?: string; question: string; answer: string; why?: string; note?: string }): Promise<string> {
  const context = [
    p.subject && `Предмет: ${p.subject}`,
    p.topic && `Тема: ${p.topic}`,
    `Вопрос карточки: ${p.question}`,
    `Ответ карточки: ${p.answer}`,
    p.why && `Объяснение в карточке: ${p.why}`,
    p.note && `Отрывок конспекта ученика:\n${p.note.slice(0, 1500)}`
  ]
    .filter(Boolean)
    .join('\n');
  return ask({
    system:
      'Ты — доброжелательный репетитор для школьника. Ученик не может запомнить карточку. Объясни ответ ИНАЧЕ, чем в карточке: простыми словами, через один понятный пример или аналогию из жизни, и в конце дай короткую подсказку, как это запомнить. Не больше 110 слов. Пиши по-русски, на «ты». Формулы оформляй в $...$. Опирайся на школьную программу и материалы ученика; не выдумывай фактов и дат. Без вступлений вроде «Конечно!».',
    text: context,
    maxTokens: 500
  });
}

export async function testConnection(): Promise<string> {
  return ask({ text: 'Ответь одним словом по-русски: «готово».', maxTokens: 20 });
}
