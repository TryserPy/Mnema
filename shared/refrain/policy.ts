// Группы, лимиты, режимы доступа и бюджет Refrain ИИ (1.31) — значения по умолчанию.
// Настоящие значения живут в базе сервера и меняются в панели; эти — для первой выкладки и тестов.
import type { GroupId } from './api.mjs';

export interface GroupLimits {
  id: GroupId;
  title: string;
  /** Страниц в день; null — без лимита (группа «Ты», считается в общем бюджете). */
  perDay: number | null;
  /** Страниц в месяц; null — без месячного лимита. */
  perMonth: number | null;
  /** Запросов в минуту. 0 — нельзя. */
  perMinute: number;
  /** Устройств на аккаунт. */
  devices: number;
  /** Во сколько раз выше порог детектора для этой группы (см. guard.ts). */
  guardFactor: number;
  /** Блок уровня 2 применяется только после подтверждения в панели или боте. */
  blockNeedsConfirm: boolean;
}

/** Таблица «Группа / В день / В месяц / В минуту / Устройств» из раздела 5. */
export const DEFAULT_GROUPS: GroupLimits[] = [
  { id: 'owner', title: 'Ты', perDay: null, perMonth: null, perMinute: 20, devices: 5, guardFactor: Infinity, blockNeedsConfirm: true },
  { id: 'tester', title: 'Тестировщик', perDay: 100, perMonth: 1500, perMinute: 10, devices: 3, guardFactor: 2, blockNeedsConfirm: true },
  { id: 'newbie', title: 'Новичок', perDay: 10, perMonth: null, perMinute: 4, devices: 2, guardFactor: 1, blockNeedsConfirm: false },
  { id: 'student', title: 'Ученик', perDay: 30, perMonth: 400, perMinute: 6, devices: 3, guardFactor: 1, blockNeedsConfirm: false },
  { id: 'blocked', title: 'Заблокирован', perDay: 0, perMonth: 0, perMinute: 0, devices: 0, guardFactor: 1, blockNeedsConfirm: false }
];

/** Сколько дней новый аккаунт в группе «Новичок», потом — «Ученик». */
export const NEWBIE_DAYS = 3;

/**
 * Режим доступа к Refrain ИИ (только к нему; остальное приложение работает у всех).
 *  off — выключен для всех, включая владельца (аварийная кнопка);
 *  owner — только владелец (сюда же переключает аварийная пауза защиты, уровень 3);
 *  testers — владелец и группа «Тестировщик»;
 *  all — все. Переход на «all» требует PIN.
 */
export type AccessMode = 'off' | 'owner' | 'testers' | 'all';
export const ACCESS_MODES: AccessMode[] = ['off', 'owner', 'testers', 'all'];
export const DEFAULT_ACCESS: AccessMode = 'testers';

export function admits(mode: AccessMode, group: GroupId): boolean {
  if (group === 'blocked') return false;
  if (mode === 'off') return false;
  if (group === 'owner') return true;
  if (mode === 'owner') return false;
  if (mode === 'testers') return group === 'tester';
  return true;
}

export interface BudgetConfig {
  /** Бюджет на месяц, ₽ (по умолчанию ≈ $20 по ценам Polza). */
  monthRub: number;
  /** Бюджет на сутки, ₽; null — двойная средняя доля месяца (monthRub / дней в месяце × 2). */
  dayRub: number | null;
  /** Пороги тревог, доли месячного бюджета. На 1 — пауза для всех, кроме владельца. */
  alertAt: number[];
  /** Скачок: расход за час больше среднего часового за 7 дней во столько раз → режим «Тестировщики» и тревога. */
  spikeFactor: number;
  /** Скачок не считается, пока за час потрачено меньше этого, ₽ (чтобы ночью два запроса не давали «втрое»). */
  spikeMinRub: number;
  /** «Жадный ученик»: один аккаунт за сутки потратил больше этой доли дневного бюджета → тревога с кнопкой «Заблокировать». */
  greedyShare: number;
  /** «Волна регистраций»: новых аккаунтов за час больше этого — лимит «Новичка» временно 0. */
  signupWaveHour: number;
  signupWavePerIp: number;
  /** «Сбои OpenAI»: доля ошибок за 10 минут. */
  upstreamErrorShare: number;
  /** Остаток на счёте поставщика ИИ (Polza.ai): тревога, когда денег меньше этого, ₽… */
  balanceAlertRub: number;
  /** …или когда при нынешнем расходе их хватит меньше чем на столько дней. */
  balanceAlertDays: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  monthRub: 1200,
  dayRub: null,
  alertAt: [0.5, 0.8, 1],
  spikeFactor: 3,
  spikeMinRub: 12,
  greedyShare: 0.05,
  signupWaveHour: 30,
  signupWavePerIp: 5,
  upstreamErrorShare: 0.2,
  balanceAlertRub: 150,
  balanceAlertDays: 3
};

export function dayBudgetRub(b: BudgetConfig, daysInMonth: number): number {
  return b.dayRub ?? (b.monthRub / daysInMonth) * 2;
}

/** Приглашение: RFN-XXXX-XXXX, алфавит без похожих знаков (нет 0/O, 1/I/L). */
export const INVITE_RE = /^RFN-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

export interface Invite {
  code: string;
  seats: number;
  used: number;
  expiresAt: string;
  group: GroupId;
  revoked: boolean;
}

/** Дневной счётчик обнуляется в полночь по Москве (UTC+3, без перехода на летнее время). */
export const QUOTA_TZ_OFFSET_MIN = 180;
