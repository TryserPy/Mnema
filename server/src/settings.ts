// Настройки, которые меняются из панели: режим доступа, пауза, бюджет, группы, конфиг защиты. Хранятся в D1 (JSON).
import { DEFAULT_ACCESS, DEFAULT_BUDGET, DEFAULT_GROUPS, type AccessMode, type BudgetConfig, type GroupLimits } from '../../shared/refrain/policy';
import { DEFAULT_GUARD, type GuardConfig } from '../../shared/refrain/guard';
import type { Env } from './env';

export interface PauseState {
  reason: 'budget' | 'guard' | 'spike' | 'manual' | 'leak' | null;
  since: number | null;
}

export interface Settings {
  mode: AccessMode;
  prevMode: AccessMode | null;
  pause: PauseState;
  budget: BudgetConfig;
  groups: GroupLimits[];
  guard: GuardConfig;
  /** До какого времени лимит «Новичка» = 0 (волна регистраций). */
  newbieZeroUntil: number;
  /** Панель закрыта после 5 неверных PIN. */
  pinLock: { fails: number; until: number };
  /** Бюджет в месяц, подтверждённый PIN (или по умолчанию): поднять больше чем вдвое от него — только с PIN, шагами не обойти. */
  budgetBase: number;
  /** Последняя сверка с OpenAI. */
  leakCheck: { at: number; suspected: boolean };
  /** Последний известный баланс у поставщика ИИ (src/balance.ts). */
  balance: { rub: number | null; at: number };
}

const DEFAULTS: Settings = {
  mode: DEFAULT_ACCESS,
  prevMode: null,
  pause: { reason: null, since: null },
  budget: DEFAULT_BUDGET,
  groups: DEFAULT_GROUPS,
  guard: DEFAULT_GUARD,
  newbieZeroUntil: 0,
  pinLock: { fails: 0, until: 0 },
  budgetBase: DEFAULT_BUDGET.monthRub,
  leakCheck: { at: 0, suspected: false },
  balance: { rub: null, at: 0 }
};

/** Infinity в JSON не живёт: guardFactor владельца хранится как null. */
const revive = (_k: string, v: unknown) => (v === null && _k === 'guardFactor' ? Infinity : v);
const replace = (_k: string, v: unknown) => (v === Infinity ? null : v);

export async function loadSettings(env: Env): Promise<Settings> {
  const { results } = await env.DB.prepare('SELECT k, v FROM settings').all<{ k: string; v: string }>();
  const out: Settings = structuredClone({ ...DEFAULTS, groups: DEFAULTS.groups.map((g) => ({ ...g })) });
  for (const r of results) {
    if (r.k in out) {
      try {
        (out as unknown as Record<string, unknown>)[r.k] = JSON.parse(r.v, revive);
      } catch {
        /* испорченная запись — значение по умолчанию */
      }
    }
  }
  // Новые правила из обновлённого кода — со значениями по умолчанию.
  out.guard = { ...DEFAULT_GUARD, ...out.guard, rules: { ...DEFAULT_GUARD.rules, ...out.guard.rules }, leak: { ...DEFAULT_GUARD.leak, ...out.guard.leak } };
  out.budget = { ...DEFAULT_BUDGET, ...out.budget };
  for (const g of DEFAULT_GROUPS) if (!out.groups.some((x) => x.id === g.id)) out.groups.push({ ...g });
  return out;
}

export async function saveSetting<K extends keyof Settings>(env: Env, k: K, v: Settings[K]): Promise<void> {
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, JSON.stringify(v, replace)).run();
}
