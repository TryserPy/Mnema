// Атомарные счётчики на Durable Objects: свой объект на каждого ученика и один на общий бюджет.
// Объект обрабатывает вызовы по одному, поэтому пачка параллельных запросов не обгонит лимит.
import { DurableObject } from 'cloudflare:workers';
import { NONCE_TTL_MS } from '../../shared/refrain/api.mjs';
import { QUOTA_TZ_OFFSET_MIN } from '../../shared/refrain/policy';

/** Сутки и месяц по Москве. */
export function dayKey(t: number): string {
  return new Date(t + QUOTA_TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}
export function monthKey(t: number): string {
  return dayKey(t).slice(0, 7);
}
/** Следующая полночь по Москве. */
export function nextMidnight(t: number): number {
  const shifted = t + QUOTA_TZ_OFFSET_MIN * 60000;
  return Math.floor(shifted / 86400000 + 1) * 86400000 - QUOTA_TZ_OFFSET_MIN * 60000;
}

/** Запрос «висит» не дольше этого: если Worker упал между begin и settle, замок снимется сам. */
const INFLIGHT_TTL_MS = 3 * 60 * 1000;

export interface BeginInput {
  now: number;
  /** Лимиты в µ₽; null — без лимита. */
  dayLimit: number | null;
  monthLimit: number | null;
  perMinute: number;
  reserve: number;
}
export type BeginResult = { ok: true; ticket: string } | { ok: false; code: 'limit_day' | 'limit_month' | 'too_fast'; retryAfter?: number; parallel?: boolean };

export interface StudentUsage {
  day: number;
  month: number;
}

interface StudentState {
  day: { key: string; used: number };
  month: { key: string; used: number };
  inflight: { ticket: string; until: number; reserve: number } | null;
  minute: number[];
}

export class StudentCounter extends DurableObject {
  private async state(now: number): Promise<StudentState> {
    const s = (await this.ctx.storage.get<StudentState>('s')) ?? { day: { key: '', used: 0 }, month: { key: '', used: 0 }, inflight: null, minute: [] };
    if (s.day.key !== dayKey(now)) s.day = { key: dayKey(now), used: 0 };
    if (s.month.key !== monthKey(now)) s.month = { key: monthKey(now), used: 0 };
    // Задача не закрылась за 3 минуты (Worker упал между begin и settle): списываем резерв целиком, а не забываем.
    if (s.inflight && s.inflight.until < now) {
      s.day.used += s.inflight.reserve;
      s.month.used += s.inflight.reserve;
      s.inflight = null;
    }
    s.minute = s.minute.filter((t) => t > now - 60000);
    return s;
  }

  /** Новый nonce для устройства? Повтор в течение 5 минут — false. */
  async nonce(deviceId: string, nonce: string, now: number): Promise<boolean> {
    const key = `n:${deviceId}:${nonce}`;
    if ((await this.ctx.storage.get<number>(key)) !== undefined) return false;
    await this.ctx.storage.put(key, now + NONCE_TTL_MS);
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(now + NONCE_TTL_MS);
    return true;
  }

  async alarm(): Promise<void> {
    const t = Date.now();
    const all = await this.ctx.storage.list<number>({ prefix: 'n:' });
    const old = [...all].filter(([, until]) => until < t).map(([k]) => k);
    for (let i = 0; i < old.length; i += 128) await this.ctx.storage.delete(old.slice(i, i + 128));
    if (all.size > old.length) await this.ctx.storage.setAlarm(t + NONCE_TTL_MS);
  }

  /**
   * Начать задачу: один запрос одновременно, лимит в минуту, дневной и месячный лимит.
   * Лимит ученика проверяется по уже списанному: если хоть что-то осталось, задача идёт, и перерасход ограничен одной задачей
   * (одновременно идёт только один запрос). Строгое резервирование наибольшей стоимости — на общем бюджете (BudgetCounter).
   */
  async begin(i: BeginInput): Promise<BeginResult> {
    const s = await this.state(i.now);
    if (s.inflight) return { ok: false, code: 'too_fast', retryAfter: 5, parallel: true };
    if (i.perMinute <= 0) return { ok: false, code: 'too_fast', retryAfter: 60 };
    if (s.minute.length >= i.perMinute) return { ok: false, code: 'too_fast', retryAfter: Math.max(1, Math.ceil((s.minute[0] + 60000 - i.now) / 1000)) };
    if (i.dayLimit !== null && s.day.used >= i.dayLimit) return { ok: false, code: 'limit_day' };
    if (i.monthLimit !== null && s.month.used >= i.monthLimit) return { ok: false, code: 'limit_month' };
    const ticket = crypto.randomUUID();
    s.inflight = { ticket, until: i.now + INFLIGHT_TTL_MS, reserve: i.reserve };
    s.minute.push(i.now);
    await this.ctx.storage.put('s', s);
    return { ok: true, ticket };
  }

  /** Закончить задачу: списать настоящий расход (0, если OpenAI не ответил) и снять замок. */
  async settle(ticket: string, costMicro: number, now: number): Promise<StudentUsage> {
    const s = await this.state(now);
    // Замок уже истёк и резерв списан целиком — второй раз не списываем.
    if (s.inflight?.ticket !== ticket) return { day: s.day.used, month: s.month.used };
    s.inflight = null;
    s.day.used += costMicro;
    s.month.used += costMicro;
    await this.ctx.storage.put('s', s);
    return { day: s.day.used, month: s.month.used };
  }

  async usage(now: number): Promise<StudentUsage> {
    const s = await this.state(now);
    return { day: s.day.used, month: s.month.used };
  }

  /** «Удалить аккаунт»: стереть счётчики. */
  async wipe(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

export interface BudgetTotals {
  day: number;
  month: number;
  reserved: number;
}
export type ReserveResult = { ok: true; totals: BudgetTotals } | { ok: false; totals: BudgetTotals };

interface BudgetState {
  day: { key: string; spent: number };
  month: { key: string; spent: number };
  reserved: Record<string, { micro: number; until: number }>;
}

export class BudgetCounter extends DurableObject {
  private async state(now: number): Promise<BudgetState> {
    const s = (await this.ctx.storage.get<BudgetState>('b')) ?? { day: { key: '', spent: 0 }, month: { key: '', spent: 0 }, reserved: {} };
    if (s.day.key !== dayKey(now)) s.day = { key: dayKey(now), spent: 0 };
    if (s.month.key !== monthKey(now)) s.month = { key: monthKey(now), spent: 0 };
    for (const [k, r] of Object.entries(s.reserved))
      if (r.until < now) {
        s.day.spent += r.micro;
        s.month.spent += r.micro;
        delete s.reserved[k];
      }
    return s;
  }
  private totals(s: BudgetState): BudgetTotals {
    return { day: s.day.spent, month: s.month.spent, reserved: Object.values(s.reserved).reduce((a, r) => a + r.micro, 0) };
  }

  /** Зарезервировать наибольшую стоимость. Не влезает в бюджет суток или месяца — отказ (владельцу — нет: bypass). */
  async reserve(ticket: string, micro: number, limits: { day: number; month: number }, now: number, bypass: boolean): Promise<ReserveResult> {
    const s = await this.state(now);
    const t = this.totals(s);
    if (!bypass && (s.day.spent + t.reserved + micro > limits.day || s.month.spent + t.reserved + micro > limits.month)) return { ok: false, totals: t };
    s.reserved[ticket] = { micro, until: now + INFLIGHT_TTL_MS };
    await this.ctx.storage.put('b', s);
    return { ok: true, totals: this.totals(s) };
  }

  async settle(ticket: string, micro: number, now: number): Promise<BudgetTotals> {
    const s = await this.state(now);
    if (!s.reserved[ticket]) return this.totals(s); // резерв уже истёк и списан целиком
    delete s.reserved[ticket];
    s.day.spent += micro;
    s.month.spent += micro;
    await this.ctx.storage.put('b', s);
    return this.totals(s);
  }

  async read(now: number): Promise<BudgetTotals> {
    return this.totals(await this.state(now));
  }
}
