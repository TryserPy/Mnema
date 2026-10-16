// Контракт детектора подозрительной активности (1.31): сигналы, баллы, уровни реакции, записи журнала и тревоги.
// Решения принимает только сервер по своим данным (server/src/guard/). Пороги и веса — в базе сервера, меняются из панели;
// здесь значения по умолчанию и схема конфига. Обоснование чисел — docs/refrain-1.31/contracts.md, раздел 6.

/** Кого оценивает детектор. Баллы копятся отдельно для каждого субъекта. */
export type SubjectKind = 'account' | 'device' | 'ip' | 'asn';

export type RuleId =
  // 1. Подпись, токен, устройство
  | 'sig_invalid' // подпись не сходится
  | 'token_unknown' // токен не наш, чужой или от другого устройства
  | 'device_unknown' // устройство не найдено или отвязано
  | 'nonce_replay' // nonce уже был
  | 'time_skew' // время вне окна 2 минуты
  | 'refresh_reuse' // повтор старого токена обновления — кража
  // 2. Места
  | 'impossible_travel' // один аккаунт из двух мест, между которыми не доехать за прошедшее время
  | 'account_many_ips' // один аккаунт с многих IP за короткое время
  | 'ip_many_accounts' // один IP с многими аккаунтами или устройствами
  // 3. Не по контракту
  | 'unknown_task'
  | 'extra_fields'
  | 'oversize' // картинка или текст выше рамок
  | 'own_prompt' // попытка передать свой промт: поля system/prompt/messages/model/… или такие же ключи в JSON-тексте
  | 'parallel' // второй запрос, пока идёт первый
  // 4. Скорость и объём
  | 'burn_rate' // расход за час намного выше нормы группы и собственной
  | 'machine_rhythm' // ровные промежутки между запросами
  | 'expensive_only' // почти только самые дорогие задачи
  // 5. Клиент
  | 'ua_missing' // нет или чужой x-refrain-app / User-Agent
  | 'app_version_unknown' // версии приложения не существует
  | 'signup_wave_ip'; // пачка новых аккаунтов с одного IP

export interface RuleConfig {
  /** Баллы за одно срабатывание. */
  weight: number;
  /** Кому начисляются баллы. */
  subjects: SubjectKind[];
  /** Сразу уровень 2, не дожидаясь суммы (для однозначных признаков кражи). */
  instantLevel2?: boolean;
  /** Параметры правила (окна, пороги). */
  params?: Record<string, number>;
  enabled: boolean;
}

export interface GuardConfig {
  rules: Record<RuleId, RuleConfig>;
  /** Баллы затухают вдвое за это время. */
  halfLifeMin: number;
  /** Доля баллов, которая идёт IP за нарушения опознанного аккаунта: один ученик не должен блокировать школьный NAT. */
  ipShareKnown: number;
  /** Пороги суммы баллов субъекта. Для групп умножаются на guardFactor из policy.ts. */
  level1: number;
  level2: number;
  /** Уровень 1: во сколько раз урезать лимит в минуту и на сколько. */
  slowdownFactor: number;
  slowdownMin: number;
  /** Уровень 2: сроки блока. */
  blockAccountMin: number;
  blockIpMin: number;
  blockAsnMin: number;
  /** Уровень 3 (массовая атака): столько разных аккаунтов дошло до уровня 2 за окно. */
  massAccounts: number;
  massWindowMin: number;
  /** Сверка с OpenAI (подозрение на утечку ключа). */
  leak: {
    enabled: boolean;
    everyMin: number;
    /** Окно сверки и задержка: данные Usage API приходят с опозданием, поэтому сверяем окно, закончившееся lagMin минут назад. */
    windowMin: number;
    lagMin: number;
    /** Утечка, если расход OpenAI больше нашего на столько долей И на столько ₽. */
    overShare: number;
    overRub: number;
    /** Расход у OpenAI при нуле запросов у нас за окно — утечка, если он больше этого, ₽. */
    idleRub: number;
  };
}

export const DEFAULT_GUARD: GuardConfig = {
  rules: {
    sig_invalid: { weight: 40, subjects: ['ip'], enabled: true },
    token_unknown: { weight: 15, subjects: ['account', 'ip'], enabled: true },
    device_unknown: { weight: 15, subjects: ['ip'], enabled: true },
    nonce_replay: { weight: 60, subjects: ['account', 'device', 'ip'], enabled: true },
    time_skew: { weight: 5, subjects: ['ip'], enabled: true },
    refresh_reuse: { weight: 100, subjects: ['account', 'ip'], instantLevel2: true, enabled: true },
    impossible_travel: { weight: 100, subjects: ['account'], params: { maxKmh: 900, minKm: 500 }, enabled: true },
    account_many_ips: { weight: 30, subjects: ['account'], params: { ips: 6, windowMin: 30 }, enabled: true },
    ip_many_accounts: { weight: 40, subjects: ['ip'], params: { accounts: 8, windowMin: 60 }, enabled: true },
    unknown_task: { weight: 25, subjects: ['account', 'ip'], enabled: true },
    extra_fields: { weight: 15, subjects: ['account', 'ip'], enabled: true },
    oversize: { weight: 15, subjects: ['account', 'ip'], enabled: true },
    own_prompt: { weight: 45, subjects: ['account', 'ip'], enabled: true },
    parallel: { weight: 8, subjects: ['account'], enabled: true },
    burn_rate: { weight: 35, subjects: ['account'], params: { groupFactor: 4, selfFactor: 5, minPages: 15 }, enabled: true },
    machine_rhythm: { weight: 30, subjects: ['account', 'ip'], params: { minRequests: 12, maxCv: 0.08 }, enabled: true },
    expensive_only: { weight: 15, subjects: ['account'], params: { minRequests: 12, share: 0.9 }, enabled: true },
    ua_missing: { weight: 10, subjects: ['ip'], enabled: true },
    app_version_unknown: { weight: 20, subjects: ['account', 'ip'], enabled: true },
    signup_wave_ip: { weight: 40, subjects: ['ip'], params: { accounts: 5, windowMin: 60 }, enabled: true }
  },
  halfLifeMin: 30,
  ipShareKnown: 0.25,
  level1: 40,
  level2: 100,
  slowdownFactor: 3,
  slowdownMin: 15,
  blockAccountMin: 24 * 60,
  blockIpMin: 60,
  blockAsnMin: 30,
  massAccounts: 10,
  massWindowMin: 15,
  leak: { enabled: true, everyMin: 10, windowMin: 60, lagMin: 15, overShare: 0.25, overRub: 30, idleRub: 6 }
};

export type Level = 0 | 1 | 2 | 3;

/** Что сервер сделал сам. Все реакции обратимы из панели, кроме смены ключа OpenAI (её делает только владелец). */
export type ReactionKind =
  | 'slowdown' // уровень 1
  | 'block_account' // уровень 2
  | 'revoke_tokens'
  | 'unbind_device'
  | 'block_ip'
  | 'block_asn'
  | 'pending_block' // уровень 2 для тестировщика/владельца: ждёт подтверждения
  | 'mode_testers' // скачок расхода
  | 'mode_owner' // уровень 3: аварийная пауза, Refrain ИИ только у владельца
  | 'budget_pause' // бюджет 100 %
  | 'newbie_zero'; // волна регистраций

/** Запись журнала действий (и защиты, и панели). Без текстов запросов, без полных почт и IP. */
export interface JournalEntry {
  id: number;
  at: string;
  /** Кто: сервер сам, владелец из Telegram или с сайта. */
  actor: 'system' | 'owner:tg' | 'owner:web' | 'owner:bot';
  /** Что: «guard.level2», «access.set», «group.update», «block.lift», «alert.sent» и т. п. */
  action: string;
  target?: { kind: SubjectKind | 'mode' | 'budget' | 'group' | 'invite' | 'guard' | 'bug' | 'key'; id: string };
  reason?: string;
  rules?: RuleId[];
  score?: number;
  before?: unknown;
  after?: unknown;
}

export type AlertKind =
  | 'key_leak'
  | 'emergency_pause'
  | 'forgery' // подделка или повтор запроса
  | 'travel' // аккаунт с нескольких мест
  | 'contract' // выход за рамки контракта
  | 'ip_block'
  | 'block' // прочие блоки уровня 2
  | 'pending_block'
  | 'budget'
  | 'spike'
  | 'greedy'
  | 'signup_wave'
  | 'upstream'
  | 'balance_low' // на счёте поставщика ИИ мало денег
  | 'panel_login'
  | 'pin_wrong'
  | 'pin_locked'
  | 'bug';

export type AlertButton = 'block' | 'unblock' | 'pause' | 'restore_mode' | 'open_panel';

/** Тревога владельцу. Хранится в базе, пока не прочитана; уходит в Telegram, после 3 неудач — письмом. */
export interface Alert {
  id: number;
  at: string;
  /** ⚠️ warn — тихо, 🚨 critical — со звуком и всегда отдельным сообщением. */
  level: 'info' | 'warn' | 'critical';
  kind: AlertKind;
  title: string;
  /** Что произошло, по-русски. Без секретов, полных почт и содержимого запросов. */
  text: string;
  rules?: RuleId[];
  /** Кто: почта в маске g***@mail.ru, IP с последним октетом под маской, ASN, устройство (имя и платформа). */
  who?: { email?: string; ip?: string; asn?: number; device?: string };
  /** Что сервер уже сделал сам. */
  done: ReactionKind[];
  buttons: AlertButton[];
  /** Ключ склейки: одинаковые некритичные тревоги за 10 минут — одно сообщение со счётчиком. */
  groupKey: string;
  count: number;
  readAt: string | null;
  delivery: { telegram: 'pending' | 'sent' | 'failed'; attempts: number; email: 'none' | 'sent' | 'failed'; nextTryAt: string | null };
}

/** Тревоги, которые всегда критические. */
export const CRITICAL_ALERTS: AlertKind[] = ['key_leak', 'emergency_pause', 'pin_locked'];

/** Интервалы повторной отправки в Telegram, мс. После последней неудачи — письмо на почту владельца. */
export const ALERT_RETRY_MS = [30_000, 120_000, 600_000];
export const ALERT_MERGE_WINDOW_MS = 10 * 60 * 1000;
