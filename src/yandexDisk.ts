// Яндекс Диск через REST API и вход в Яндекс (OAuth 2.0, неявный поток): пароль приложения и WebDAV не нужны,
// а WebDAV на бесплатном тарифе Яндекс больше не даёт (ответ 402). Доступ токена — только к папке приложения
// (scope cloud_api:disk.app_folder): Refrain видит на Диске лишь «Приложения/Refrain», а не все файлы.
//
// Нужен ClientID приложения с oauth.yandex.ru (VITE_YANDEX_CLIENT_ID при сборке). Секрет приложения не нужен и в приложение не кладётся.
export const YANDEX_API = 'https://cloud-api.yandex.net/v1/disk';
export const YANDEX_AUTHORIZE = 'https://oauth.yandex.ru/authorize';
/** Страница Яндекса, которая показывает токен (её Redirect URI указывается в настройках приложения на oauth.yandex.ru). */
export const YANDEX_VERIFY_PAGE = 'https://oauth.yandex.ru/verification_code';

export function yandexClientId(): string {
  const id = (import.meta.env?.VITE_YANDEX_CLIENT_ID as string | undefined) ?? '';
  return /^[0-9a-f]{32}$/i.test(id.trim()) ? id.trim() : '';
}

/** Адрес входа: ученик видит страницу Яндекса, разрешает доступ к папке приложения — и Яндекс показывает токен. */
export function yandexAuthUrl(clientId: string, state: string): string {
  const q = new URLSearchParams({ response_type: 'token', client_id: clientId, redirect_uri: YANDEX_VERIFY_PAGE, force_confirm: 'yes', state });
  return `${YANDEX_AUTHORIZE}?${q}`;
}

/**
 * Токен из того, что вставил ученик: сам токен (y0_…) или вся ссылка со страницы Яндекса (…#access_token=…).
 * Пустая строка — не похоже на токен. state, если он есть в ссылке, обязан совпасть (защита от подсунутой ссылки).
 */
export function parseYandexToken(input: string, state?: string): string {
  const s = input.trim();
  const frag = /[#?&]access_token=([^&\s]+)/.exec(s);
  if (frag) {
    const st = /[#?&]state=([^&\s]+)/.exec(s);
    if (state && st && decodeURIComponent(st[1]) !== state) return '';
    return decodeURIComponent(frag[1]);
  }
  return /^[A-Za-z0-9_.-]{20,400}$/.test(s) ? s : '';
}

/** Ответ REST API → понятная ошибка. Текст Яндекса берётся из description, токен в него не попадает. */
export function yandexError(status: number, text: string): Error & { code?: string } {
  let detail = '';
  try {
    const j = JSON.parse(text) as { description?: unknown; error?: unknown };
    detail = typeof j.description === 'string' ? j.description : typeof j.error === 'string' ? j.error : '';
  } catch {
    /* не JSON */
  }
  const e = (m: string, code = 'other') => Object.assign(new Error(m), { code });
  if (status === 401) return e('Вход в Яндекс устарел или отозван. Нажми «Войти через Яндекс» ещё раз.', 'auth');
  if (status === 403) return e('Яндекс не дал доступа к папке приложения. Войди через Яндекс ещё раз и разреши доступ.', 'auth');
  if (status === 507) return e('На Яндекс Диске закончилось место. Освободи место и попробуй снова.');
  if (status === 429) return e('Яндекс Диск просит подождать: слишком много запросов. Попробуй через минуту.');
  if (status === 423) return e('Файл на Диске сейчас занят. Попробуй через минуту.');
  if (status === 413) return e('Копия слишком большая для Яндекс Диска.');
  if (status === 0) return e('Нет связи с Яндекс Диском. Проверь интернет.');
  return e(`Яндекс Диск ответил ошибкой ${status}.${detail ? ' ' + detail.slice(0, 120) : ''}`);
}

/** Случайная метка state для входа: сверяется с той, что вернётся в ссылке. */
export function newState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
}
