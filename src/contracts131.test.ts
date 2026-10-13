// Контракты 1.31 (docs/refrain-1.31/contracts.md): проверки, что общие таблицы согласованы между собой.
import { describe, expect, it } from 'vitest';
import { ERRORS, FIELD_LIMITS, TASKS, TASK_FIELDS, canonicalString, pagesLabel, parseAppHeader, powOk } from '../shared/refrain/api.mjs';
import { CALLOUTS, CALLOUT_HEAD, MARKS } from '../shared/prompts/markup';
import { PAGE_MICROUSD, TASK_SPECS, costMicro, maxCostMicro } from '../shared/prompts/tasks';
import { DEFAULT_GROUPS, INVITE_RE, admits } from '../shared/refrain/policy';
import { DEFAULT_GUARD } from '../shared/refrain/guard';
import { AI_NOTE_MAX } from './aiNotes';

describe('контракты 1.31', () => {
  it('у каждой задачи есть строка в реестре, и наоборот', () => {
    expect(Object.keys(TASK_SPECS).sort()).toEqual([...TASKS].sort());
    for (const t of TASKS) expect(TASK_SPECS[t as keyof typeof TASK_SPECS].id).toBe(t);
  });
  it('страница — $0,00065: 2000 токенов на вход и 900 на выход', () => {
    expect(costMicro({ inputTokens: 2000, cachedInputTokens: 0, outputTokens: 900 })).toBe(PAGE_MICROUSD);
  });
  it('резерв не меньше любого возможного расхода в рамках задачи', () => {
    for (const s of Object.values(TASK_SPECS)) {
      const reserve = maxCostMicro(s, s.textMax, s.image !== 'forbidden');
      expect(reserve).toBeGreaterThanOrEqual(costMicro({ inputTokens: s.promptTokens, cachedInputTokens: 0, outputTokens: s.maxTokens }));
    }
  });
  it('«Свои указания» — тот же предел, что в приложении', () => {
    expect(FIELD_LIMITS.wishes).toBe(AI_NOTE_MAX);
    expect(TASK_FIELDS).toContain('wishes');
  });
  it('коды ошибок — правильные HTTP-статусы', () => {
    for (const s of Object.values(ERRORS)) expect([400, 401, 403, 409, 413, 429, 500, 502, 503]).toContain(s);
  });
  it('строка подписи и заголовок приложения', () => {
    expect(canonicalString({ method: 'post', path: '/v1/task', bodySha256Hex: 'ab', time: 1, nonce: 'n', deviceId: 'd' })).toBe('REFRAIN-SIG-1\nPOST\n/v1/task\nab\n1\nn\nd');
    expect(parseAppHeader('refrain/1.31.0 (android)')).toEqual({ version: '1.31.0', platform: 'android' });
    expect(parseAppHeader('curl/8.0')).toBeNull();
  });
  it('proof-of-work считает биты', () => {
    expect(powOk(new Uint8Array([0, 0x0f, 0xff]), 12)).toBe(true);
    expect(powOk(new Uint8Array([0, 0x1f, 0xff]), 12)).toBe(false);
  });
  it('страницы ученику — с точностью до десятой', () => {
    expect(pagesLabel(12.46)).toBe('12,4');
    expect(pagesLabel(3)).toBe('3');
  });
  it('выноски и метки', () => {
    expect(CALLOUTS.map((c) => c.type)).toEqual(['def', 'rule', 'tip', 'ex', 'warn']);
    expect(CALLOUT_HEAD.exec('> [!def] Фотосинтез')?.slice(1)).toEqual(['def', '', 'Фотосинтез']);
    expect(MARKS.figure.test('[[РИСУНОК 10 20 500 600 | Рис. 8]]')).toBe(true);
    expect(MARKS.empty.test('[[ПУСТО]]')).toBe(true);
  });
  it('группы и режимы доступа', () => {
    expect(DEFAULT_GROUPS.map((g) => g.id)).toEqual(['owner', 'tester', 'newbie', 'student', 'blocked']);
    expect(admits('off', 'owner')).toBe(false);
    expect(admits('owner', 'owner')).toBe(true);
    expect(admits('owner', 'tester')).toBe(false);
    expect(admits('testers', 'tester')).toBe(true);
    expect(admits('testers', 'student')).toBe(false);
    expect(admits('all', 'blocked')).toBe(false);
    expect(INVITE_RE.test('RFN-7K2Q-XM4D')).toBe(true);
    expect(INVITE_RE.test('RFN-7K2Q-XM40')).toBe(false);
  });
  it('уровни детектора: 2 > 1, у кражи токена мгновенный уровень 2', () => {
    expect(DEFAULT_GUARD.level2).toBeGreaterThan(DEFAULT_GUARD.level1);
    expect(DEFAULT_GUARD.rules.refresh_reuse.instantLevel2).toBe(true);
    for (const r of Object.values(DEFAULT_GUARD.rules)) expect(r.weight).toBeLessThanOrEqual(DEFAULT_GUARD.level2);
  });
});
