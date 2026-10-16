// Журнал действий: и автоматические реакции защиты, и всё, что владелец делает в панели и боте.
import type { JournalEntry } from '../../shared/refrain/guard';
import { now, type Env } from './env';

export type JournalInput = Omit<JournalEntry, 'id' | 'at'>;

export async function journal(env: Env, e: JournalInput): Promise<void> {
  await env.DB.prepare('INSERT INTO journal (at, actor, action, target_kind, target_id, reason, rules, score, before, after) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)')
    .bind(now(env), e.actor, e.action, e.target?.kind ?? null, e.target?.id ?? null, e.reason ?? null, e.rules ? JSON.stringify(e.rules) : null, e.score ?? null, e.before === undefined ? null : JSON.stringify(e.before), e.after === undefined ? null : JSON.stringify(e.after))
    .run();
}

export async function journalList(env: Env, before: number | null, limit = 100): Promise<JournalEntry[]> {
  const { results } = await env.DB.prepare('SELECT * FROM journal WHERE (?1 IS NULL OR id < ?1) ORDER BY id DESC LIMIT ?2').bind(before, limit).all<Record<string, unknown>>();
  const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : undefined);
  return results.map((r) => ({
    id: Number(r.id),
    at: new Date(Number(r.at)).toISOString(),
    actor: r.actor as JournalEntry['actor'],
    action: String(r.action),
    target: r.target_kind ? { kind: r.target_kind as NonNullable<JournalEntry['target']>['kind'], id: String(r.target_id) } : undefined,
    reason: (r.reason as string) ?? undefined,
    rules: parse(r.rules),
    score: r.score == null ? undefined : Number(r.score),
    before: parse(r.before),
    after: parse(r.after)
  }));
}
