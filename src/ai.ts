// ИИ-помощник: обёртки над запросами к модели (сами запросы и ключи — в главном процессе).
import { aiRequest, type AiTask } from './aiTasks';
import { cardsPrompt, noteForAi, parseAiCards, type AiCardDraft } from './aiCards';
import { noteAnswer, refrainFields, shrinkImage } from './refrain';
import { promptSystem } from './prompts';
import type { AiAnswer, AiRequest } from './store';
import type { AppData } from './types';
import { AiError, aiFailure } from './aiFailure';

export function aiAvailable(data: AppData): boolean {
  return data.settings.features.ai && Boolean(window.mnemaApi?.aiAsk);
}

/**
 * Один запрос к ИИ. `task` — для чего (тогда добавятся свои указания ученика и выбранный для задачи ИИ); без задачи запрос уходит как есть.
 * req.refrain — та же задача для Refrain ИИ (без промта); без него запрос идёт мимо Refrain ИИ.
 */
async function ask(task: AiTask | null, req: AiRequest): Promise<string> {
  const api = window.mnemaApi;
  if (!api?.aiAsk) throw new Error('ИИ-помощник работает в приложении для Windows и Linux.');
  const sent = task ? aiRequest(task, req) : { ...req, refrain: refrainFields(req.refrain) };
  const r = await api.aiAsk(sent);
  noteAnswer(r, sent.refrain?.task);
  if (!r.ok) throw new AiError(aiError(r), aiFailure(r));
  if (!r.text) throw new Error('Модель вернула пустой ответ.');
  return r.text;
}

/** Запрос по готовому AiRequest (тетрадь, файлы): указания ученика, Refrain ИИ и ошибки — как у остальных задач. */
export function askAi(task: AiTask | null, req: AiRequest): Promise<string> {
  return ask(task, req);
}

function resetLocal(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Текст ошибки ответа aiAsk: ошибка Refrain ИИ (или того, кого спрашивали), ошибка запасного ИИ и подсказка войти. */
export function aiError(r: Extract<AiAnswer, { ok: false }>): string {
  return (
    humanError(r.error) +
    (r.backup ? ` Запасной ИИ (свой ключ) тоже не ответил: ${humanError(r.backup)}` : '') +
    (r.signIn && !/^Нужен вход/.test(r.error) ? ' Войди в Refrain ИИ — тогда свой ключ не нужен.' : '')
  );
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
    return 'Бесплатная модель сейчас перегружена у поставщика — дело не в твоём ключе. Refrain уже пробовала взять другую бесплатную модель, но все были заняты. Подожди пару минут или выбери в настройках ИИ модель «openrouter/free» (любая свободная бесплатная) или платную.' + tail;
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
  // Распознавание формул — строгий формат ответа, поэтому свои указания ученика сюда не добавляем.
  const text = await ask(null, {
    system: promptSystem('formula'),
    text: 'Распознай формулу на картинке.',
    image: { mime: 'image/png', data: pngBase64 },
    maxTokens: 300,
    refrain: { task: 'formula', image: await shrinkImage({ mime: 'image/png', data: pngBase64 }).catch(() => ({ mime: 'image/png' as const, data: pngBase64 })) }
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
  return ask('explain', {
    system: promptSystem('explain', { vars: { subject: p.subject, topic: p.topic } }),
    text: context,
    maxTokens: 500,
    refrain: { task: 'explain', text: context.slice(0, 2500) }
  });
}

/** Refrain ИИ отвечает карточками в JSON {cards:[{q,a,why}]}; разбор черновиков ждёт строки «вопрос :: ответ». Не JSON — как есть. */
export function cardsJsonToLines(answer: string): string {
  try {
    const j = JSON.parse(answer.trim()) as { cards?: { q?: unknown; a?: unknown }[] };
    if (!j || !Array.isArray(j.cards)) return answer;
    return j.cards
      .filter((c) => c && typeof c.q === 'string' && typeof c.a === 'string')
      .map((c) => `${String(c.q).replace(/::/g, ':').replace(/\s+/g, ' ')} :: ${String(c.a).replace(/\s+/g, ' ')}`)
      .join('\n');
  } catch {
    return answer;
  }
}

export async function testConnection(): Promise<string> {
  return ask(null, { text: 'Ответь одним словом по-русски: «готово».', maxTokens: 20 });
}

/** Черновики карточек по конспекту. Это только предложения: ответ модели недоверенный, ученик проверяет и правит каждую карточку сам. */
export async function draftCards(p: { subject?: string; topic: string; note: string; have?: string[] }): Promise<AiCardDraft[]> {
  const note = noteForAi(p.note);
  if (!note) throw new Error('В конспекте пока нет текста.');
  const { system, text } = cardsPrompt({ subject: p.subject, topic: p.topic, note, have: p.have });
  const answer = await ask('cards', { system, text, maxTokens: 1500, refrain: { task: 'cards', text: note, subject: p.subject, topic: p.topic } });
  const drafts = parseAiCards(cardsJsonToLines(answer), p.have);
  if (!drafts.length) throw new Error('ИИ ответил не так, как просили, — карточек из ответа не получилось. Попробуй ещё раз.');
  return drafts;
}
