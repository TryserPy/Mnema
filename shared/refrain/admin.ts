// Контракт API панели (1.31): сайт admin/, мини-приложение tg/ и бот работают через одни и те же маршруты сервера.
// Сайт статический (без сборки), поэтому этот файл для него — справочник; сервер проверяет запросы по нему.
import type { AccessMode, BudgetConfig, GroupLimits, Invite } from './policy';
import type { Alert, GuardConfig, JournalEntry, SubjectKind } from './guard';
import type { GroupId } from './api.mjs';

/**
 * Вход в панель:
 *  POST /v1/admin/login/telegram { initData } — только из мини-приложения бота: подпись initData (HMAC от токена бота),
 *       свежесть auth_date ≤ 5 минут, user.id совпадает с OWNER_TELEGRAM_ID из секретов;
 *  POST /v1/admin/login/email/start {} — код уходит только на OWNER_EMAIL из секретов (адрес в запросе не принимается);
 *  POST /v1/admin/login/email/verify { code, pin }.
 * Ответ: { ok, token, expiresAt } — токен на 15 минут, живёт только в памяти страницы. Каждый вход — сообщение в чат.
 * Запросы панели: Authorization: Bearer <token>. Опасные действия — ещё и заголовок x-refrain-pin (6 цифр).
 * 5 неверных PIN подряд — панель закрыта на час, критическая тревога.
 */
export interface AdminLoginOk {
  ok: true;
  token: string;
  expiresAt: string;
}

export interface Overview {
  ok: true;
  mode: AccessMode;
  /** Режим до аварийной паузы или скачка: его возвращает кнопка «Вернуть режим». */
  prevMode: AccessMode | null;
  paused: { reason: 'budget' | 'guard' | 'spike' | 'manual' | null; since: string | null };
  month: { spentUsd: number; budgetUsd: number; pages: number };
  today: { spentUsd: number; budgetUsd: number; students: number; requests: number; errors: number };
  lastHourUsd: number;
  unreadAlerts: number;
  newBugs: number;
  activeBlocks: number;
}

export interface AccountRow {
  id: string;
  emailMasked: string;
  group: GroupId;
  createdAt: string;
  todayPages: number;
  monthPages: number;
  devices: number;
  blockedUntil: string | null;
  score: number;
}

export interface BlockRow {
  id: number;
  kind: SubjectKind;
  /** Для IP — маска, для ASN — номер, для аккаунта — почта в маске. */
  label: string;
  reason: string;
  rules: string[];
  since: string;
  until: string | null;
  /** Уровень 2 у тестировщика или владельца: ждёт подтверждения. */
  pending: boolean;
}

export interface BugRow {
  id: number;
  at: string;
  category: string;
  text: string;
  app: { version: string; platform: string; os: string; style?: string };
  log: string[];
  status: 'new' | 'done' | 'spam' | 'github';
  githubIssue?: number;
}

export interface DayStat {
  day: string;
  usd: number;
  pages: number;
  requests: number;
  byTask: Record<string, { usd: number; requests: number }>;
}

/** Маршруты. pin — нужен заголовок x-refrain-pin. */
export const ADMIN_ROUTES = [
  { method: 'GET', path: '/v1/admin/overview', pin: false },
  { method: 'PUT', path: '/v1/admin/mode', pin: 'all' /* PIN только для перехода на «all» */ },
  { method: 'POST', path: '/v1/admin/pause', pin: false },
  { method: 'POST', path: '/v1/admin/resume', pin: false /* «Вернуть режим»: prevMode; если это «all» — PIN */ },
  { method: 'GET', path: '/v1/admin/budget', pin: false },
  { method: 'PUT', path: '/v1/admin/budget', pin: 'double' /* PIN, если бюджет больше чем вдвое */ },
  { method: 'GET', path: '/v1/admin/groups', pin: false },
  { method: 'PUT', path: '/v1/admin/groups', pin: false },
  { method: 'GET', path: '/v1/admin/accounts', pin: false /* ?q=часть почты */ },
  { method: 'POST', path: '/v1/admin/accounts/:id/group', pin: false },
  { method: 'POST', path: '/v1/admin/accounts/:id/block', pin: false },
  { method: 'POST', path: '/v1/admin/accounts/:id/unblock', pin: false },
  { method: 'GET', path: '/v1/admin/testers', pin: false },
  { method: 'POST', path: '/v1/admin/testers', pin: false /* { email } — группа «Тестировщик» по почте */ },
  { method: 'DELETE', path: '/v1/admin/testers/:email', pin: false },
  { method: 'GET', path: '/v1/admin/invites', pin: false },
  { method: 'POST', path: '/v1/admin/invites', pin: false /* { seats, days, group } → Invite */ },
  { method: 'DELETE', path: '/v1/admin/invites/:code', pin: false },
  { method: 'GET', path: '/v1/admin/blocks', pin: false },
  { method: 'POST', path: '/v1/admin/blocks/:id/lift', pin: false },
  { method: 'POST', path: '/v1/admin/blocks/:id/confirm', pin: false },
  { method: 'POST', path: '/v1/admin/blocks/lift-all', pin: true },
  { method: 'GET', path: '/v1/admin/guard', pin: false },
  { method: 'PUT', path: '/v1/admin/guard', pin: true },
  { method: 'GET', path: '/v1/admin/alerts', pin: false },
  { method: 'POST', path: '/v1/admin/alerts/:id/read', pin: false },
  { method: 'GET', path: '/v1/admin/journal', pin: false /* ?before=id */ },
  { method: 'GET', path: '/v1/admin/stats', pin: false /* ?days=30 → DayStat[] */ },
  { method: 'GET', path: '/v1/admin/bugs', pin: false },
  { method: 'POST', path: '/v1/admin/bugs/:id/github', pin: false },
  { method: 'POST', path: '/v1/admin/bugs/:id/done', pin: false },
  { method: 'POST', path: '/v1/admin/bugs/:id/spam', pin: false /* + блок устройства/IP отправителя */ },
  { method: 'POST', path: '/v1/admin/key-rotated', pin: true /* владелец заменил ключ OpenAI: снять подозрение на утечку */ }
] as const;

export type AdminPayloads = {
  mode: { mode: AccessMode };
  budget: BudgetConfig;
  groups: { groups: GroupLimits[] };
  invites: { seats: number; days: number; group: GroupId };
  guard: GuardConfig;
  block: { minutes: number | null; reason?: string };
  group: { group: GroupId };
};

export type AdminLists = {
  invites: Invite[];
  alerts: Alert[];
  journal: JournalEntry[];
  blocks: BlockRow[];
  accounts: AccountRow[];
  bugs: BugRow[];
  stats: DayStat[];
};

/**
 * Бот: POST /v1/tg/webhook, заголовок X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET.
 * Принимаются сообщения и нажатия только от OWNER_TELEGRAM_ID. Команды: /status, /pause (без PIN — пауза безопасна).
 * Кнопки тревог открывают мини-приложение (web_app) с экраном тревоги; опасные действия там подтверждаются PIN.
 */
export const BOT_COMMANDS = ['/status', '/pause'] as const;
