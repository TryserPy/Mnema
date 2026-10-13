// Контракт «приложение ↔ сервер Refrain ИИ» (1.31). Один источник для сервера (server/), Electron (главный процесс),
// Android (окно приложения) и src/. Здесь только константы и чистые функции, без сети и хранилищ.
// Подробно, с примерами — docs/refrain-1.31/contracts.md, раздел 1. Менять только вместе с сервером и версией API.

export const API_VERSION = 1;
export const API_PREFIX = '/v1';

/** Задачи, которые приложение может попросить. Промты к ним собирает сервер (shared/prompts/tasks.ts). */
export const TASKS = ['textbook.summary', 'textbook.brief', 'textbook.verbatim', 'textbook.merge', 'notebook.read', 'cards', 'explain', 'style', 'formula'];

/** Поля тела POST /v1/task. Всё прочее — нарушение контракта (сервер отвечает bad_request и записывает сигнал «лишние поля»). */
export const TASK_FIELDS = ['task', 'image', 'text', 'subject', 'topic', 'page', 'wishes'];

/** Рамки полей запроса, общие для всех задач. Рамки отдельной задачи (длина text, есть ли картинка) — в shared/prompts/tasks.ts. */
export const FIELD_LIMITS = {
  imageBytes: 2 * 1024 * 1024, // после base64-декодирования
  imageSide: 2000, // px по длинной стороне; приложение само уменьшает до 1600
  imageMimes: ['image/jpeg', 'image/png', 'image/webp'],
  subject: 80,
  topic: 160,
  page: 9999, // номер страницы — целое 1…page
  wishes: 400, // «Свои указания», как AI_NOTE_MAX в src/aiNotes.ts
  bodyBytes: 3 * 1024 * 1024 // весь JSON вместе с base64
};

/** Коды ошибок. HTTP-статус фиксирован; приложение показывает текст по коду, а не по статусу. */
export const ERRORS = {
  // задача
  limit_day: 429, // дневной лимит страниц кончился; quota.resetsAt — когда обновится
  limit_month: 429, // месячный лимит
  paused: 503, // Refrain ИИ на паузе (бюджет, аварийная пауза, режим «Выключен»)
  access_closed: 403, // режим доступа не пускает этот аккаунт (закрытый тест); можно ввести приглашение
  blocked: 403, // аккаунт заблокирован; until — до какого времени (null — пока не снимут)
  too_fast: 429, // слишком часто: лимит в минуту, второй запрос одновременно, замедление защитой; retryAfter в секундах
  bad_request: 400, // нарушение контракта: неизвестная задача, лишние поля, неверные типы
  payload_too_large: 413, // картинка или текст больше рамок
  upstream: 502, // OpenAI не ответил или ответил ошибкой; страницы не списаны
  internal: 500,
  // устройство и вход
  token_expired: 401, // токен доступа истёк — обнови через /v1/auth/refresh
  device_unknown: 401, // устройство не опознано: неверная подпись, чужой токен, устаревшее время, повтор nonce — войди заново
  session_revoked: 401, // сессии закрыты (повтор старого токена обновления, отвязка, выход) — войди заново
  device_limit: 409, // устройств больше, чем разрешено группе; devices — список для отвязки
  pow_invalid: 400, // решение задачки неверное или устарело
  email_rejected: 400, // почта не подходит (формат, одноразовый сервис)
  code_invalid: 400, // неверный код; attemptsLeft
  code_locked: 429, // попытки кончились; retryAfter
  invite_invalid: 400 // приглашение не найдено, истекло, кончились места или уже привязано к другой почте
};

/** Заголовки подписанного запроса. */
export const H = {
  auth: 'authorization', // Bearer <accessToken>
  device: 'x-refrain-device', // id устройства, выданный сервером при входе
  time: 'x-refrain-time', // время клиента, мс с 1970 (целое)
  nonce: 'x-refrain-nonce', // 16 случайных байт, base64url
  signature: 'x-refrain-signature', // ECDSA P-256 / SHA-256, подпись в виде r‖s (64 байта, IEEE P1363), base64url
  app: 'x-refrain-app' // refrain/<версия> (<windows|linux|android>)
};

/** Окно времени: запрос старше или «из будущего» больше чем на 2 минуты отклоняется. Nonce помнится на устройстве 5 минут. */
export const SIGNATURE_WINDOW_MS = 2 * 60 * 1000;
export const NONCE_TTL_MS = 5 * 60 * 1000;
export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Строка, которую подписывает устройство. Тело — ровно те байты, что уходят в сеть; для GET и DELETE тело пустое. */
export function canonicalString({ method, path, bodySha256Hex, time, nonce, deviceId }) {
  return ['REFRAIN-SIG-1', String(method).toUpperCase(), path, bodySha256Hex, String(time), nonce, deviceId].join('\n');
}

/** Заголовок x-refrain-app: «refrain/1.31.0 (windows)». null — не похоже на Refrain. */
export function parseAppHeader(v) {
  const m = /^refrain\/(\d{1,3}\.\d{1,3}\.\d{1,3})(?:-[\w.]{1,20})? \((windows|linux|android)\)$/.exec(String(v || ''));
  return m ? { version: m[1], platform: m[2] } : null;
}

/** Proof-of-work: найти solution (строка из цифр), чтобы у SHA-256(challenge + ':' + solution) первые `difficulty` бит были нулями. */
export function powOk(hashBytes, difficulty) {
  let bits = difficulty;
  for (let i = 0; bits > 0; i++, bits -= 8) {
    const mask = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if ((hashBytes[i] & mask) !== 0) return false;
  }
  return true;
}

/** Страницы показываются ученику с точностью до десятой: 12,4 → «12». Внутри сервер считает в микродолларах. */
export function pagesLabel(n) {
  const v = Math.floor(Number(n) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}
