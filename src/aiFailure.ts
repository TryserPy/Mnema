// Почему ИИ не ответил — одной причиной: что показать ученику и стоит ли предлагать «Сообщить о проблеме».
// Ожидаемые состояния (нет сети, не запущен LM Studio/Ollama, нет ключа или входа, лимит, перегрузка) — не ошибка Refrain:
// для них своё понятное действие, а жалоба разработчику только мешает. Жалоба — для настоящих сбоев (сервер Refrain, нарушение контракта, непонятный ответ).
import type { AiAnswer } from './store';

export type AiFailureKind =
  /** Ни входа в Refrain ИИ, ни ключа, ИИ не выбран. */
  | 'setup'
  /** Нет интернета / сервер не найден. */
  | 'offline'
  /** Программа на компьютере (LM Studio, Ollama) не запущена. */
  | 'local'
  /** Свой ключ не принят, модель недоступна для ключа. */
  | 'key'
  /** Кончились деньги на счёте сервиса. */
  | 'money'
  /** Лимит Refrain ИИ (день, месяц, закрытый тест) — для него свой экран. */
  | 'limit'
  /** Слишком часто, перегрузка, пауза — подождать. */
  | 'busy'
  /** Не ответил вовремя. */
  | 'timeout'
  /** Вход устарел, часы, устройство — войти заново. */
  | 'session'
  /** Фото или текст слишком большие. */
  | 'size'
  /** Ответ оборвался на середине. */
  | 'cut'
  /** Сбой, которого не должно быть: стоит сообщить разработчику. */
  | 'bug';

export interface AiFailure {
  kind: AiFailureKind;
  /** Можно ли (и стоит ли) предлагать «Сообщить о проблеме». */
  reportable: boolean;
  /** Главное действие для ученика: в настройки ИИ, войти, подождать. null — повторить там же, где ошибка. */
  action: 'settings' | 'signin' | null;
}

const BY_CODE: Record<string, AiFailureKind> = {
  limit_day: 'limit',
  limit_month: 'limit',
  access_closed: 'limit',
  blocked: 'limit',
  paused: 'busy',
  too_fast: 'busy',
  upstream: 'busy',
  network: 'offline',
  payload_too_large: 'size',
  token_expired: 'session',
  device_unknown: 'session',
  session_revoked: 'session',
  clock_skew: 'session',
  device_limit: 'session',
  signed_out: 'session',
  device_key: 'session',
  bad_request: 'bug',
  internal: 'bug'
};

function byText(e: string): AiFailureKind {
  const m = /^(\d{3}):/.exec(e.trim());
  const status = m ? Number(m[1]) : 0;
  if (/Нужен вход|Нет ключа ИИ|Не выбран ИИ|войди в Refrain ИИ/i.test(e)) return 'setup';
  if (/Не удаётся подключиться|ECONNREFUSED|LM Studio|Ollama/i.test(e)) return 'local';
  if (/Нет связи|не найден сервер|ENOTFOUND|EAI_AGAIN|fetch failed|ECONNRESET|network|Проверь интернет/i.test(e)) return 'offline';
  if (/не ответил вовремя|слишком долго не отвечает|timeout/i.test(e)) return 'timeout';
  if (/оборвал|обрезан|finish_reason|max_tokens/i.test(e)) return 'cut';
  if (/слишком больш|too large/i.test(e)) return 'size';
  if (status === 401 || status === 403 || /не принял ключ|invalid api key|API key not valid|incorrect api key/i.test(e)) return 'key';
  if (status === 404) return 'key';
  if (status === 402 || /не хватает денег|insufficient/i.test(e)) return 'money';
  if (status === 429 || /перегруж|rate.?limit|Слишком (много|часто)/i.test(e)) return 'busy';
  if (status >= 500) return 'busy';
  return 'bug';
}

/** Причина неудачного ответа aiAsk. */
export function aiFailure(r: Extract<AiAnswer, { ok: false }>): AiFailure {
  let kind: AiFailureKind = r.code && BY_CODE[r.code] ? BY_CODE[r.code] : r.signIn || r.noKey ? 'setup' : byText(r.error || '');
  // Сервис своего ключа ответил 400 — это его разговор с моделью, а не сбой Refrain: показываем текст, без жалобы.
  if (kind === 'bug' && !r.code && /^400:/.test(r.error.trim())) kind = 'key';
  const action: AiFailure['action'] = kind === 'setup' || kind === 'session' ? 'signin' : kind === 'key' || kind === 'local' || kind === 'money' ? 'settings' : null;
  return { kind, reportable: kind === 'bug', action };
}

/** Короткая подсказка к плашке для причин, которые чинятся в настройках. */
export const FAILURE_HINT: Partial<Record<AiFailureKind, string>> = {
  local: 'Программа ИИ на компьютере не запущена (LM Studio, Ollama). Запусти в ней сервер или выбери другой ИИ.',
  key: 'Сервис ИИ не принял ключ или модель. Проверь ключ и модель в настройках ИИ.',
  money: 'На счёте сервиса ИИ закончились деньги. Пополни счёт или выбери другой ИИ.',
  session: 'Вход в Refrain ИИ устарел. Войди заново — это бесплатно.'
};

export type AiNotice = { kind: 'signin' | 'settings' | 'report'; key: string; hint?: string };

/** Через сколько та же плашка может показаться снова (если её не закрыли крестиком). */
export const NOTICE_REPEAT_MS = 30 * 60 * 1000;

/**
 * Нужна ли плашка под ошибкой ИИ. seen — когда плашка с таким ключом показывалась (закрытая крестиком — Infinity).
 * Ожидаемые состояния без действия (нет сети, перегрузка, лимит со своим экраном) — без плашки: экран сам пишет, что случилось.
 */
export function aiNotice(n: { error?: string; signIn?: boolean; failure?: AiFailure }, seen: ReadonlyMap<string, number>, now: number): AiNotice | null {
  if (!n.error) return null;
  const f = n.failure;
  let out: AiNotice | null = null;
  if (n.signIn || f?.kind === 'setup') out = { kind: 'signin', key: 'signin' };
  else if (f?.action === 'signin') out = { kind: 'signin', key: 'session', hint: FAILURE_HINT.session };
  else if (f?.action === 'settings') out = { kind: 'settings', key: 'settings:' + f.kind, hint: FAILURE_HINT[f.kind] };
  else if (!f || f.reportable) out = { kind: 'report', key: 'bug:' + n.error.slice(0, 200) };
  if (!out) return null;
  const at = seen.get(out.key);
  return at !== undefined && now - at < NOTICE_REPEAT_MS ? null : out;
}

/** Ошибка запроса к ИИ: текст для ученика и причина — по ней экран выбирает действие («Повторить», «Настройки ИИ», «Войти»). */
export class AiError extends Error {
  constructor(
    message: string,
    public failure: AiFailure
  ) {
    super(message);
  }
}
