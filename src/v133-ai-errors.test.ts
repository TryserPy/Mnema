// 1.33, №3: «Сообщить о проблеме» под ошибкой ИИ — только при настоящем сбое; ожидаемые состояния — своё действие или ничего.
import { describe, expect, it } from 'vitest';
import { aiFailure, aiNotice, NOTICE_REPEAT_MS } from './aiFailure';

const fail = (error: string, extra: Record<string, unknown> = {}) => ({ ok: false as const, error, ...extra });

describe('причина неудачи ИИ', () => {
  it.each([
    ['Не удаётся подключиться. Если это программа на компьютере (LM Studio, Ollama) — запусти в ней сервер.', 'local', false],
    ['Нет связи с сервером (network). Проверь интернет.', 'offline', false],
    ['Не найден сервер по этому адресу. Проверь адрес и интернет.', 'offline', false],
    ['ИИ не ответил вовремя. Попробуй ещё раз.', 'timeout', false],
    ['401: invalid x-api-key', 'key', false],
    ['404: model not found', 'key', false],
    ['400: unsupported parameter', 'key', false],
    ['402: Insufficient credits', 'money', false],
    ['429: rate limited', 'busy', false],
    ['503: overloaded', 'busy', false],
    ['Нет ключа ИИ — добавь его в настройках ИИ-помощника.', 'setup', false],
    ['Сервер ответил не в формате JSON. Проверь адрес API.', 'bug', true],
    ['что-то совсем непонятное', 'bug', true]
  ])('%s → %s', (error, kind, reportable) => {
    const f = aiFailure(fail(error));
    expect(f.kind).toBe(kind);
    expect(f.reportable).toBe(reportable);
  });

  it('коды Refrain ИИ: лимит, пауза и вход — ожидаемые; internal и bad_request — сбой', () => {
    expect(aiFailure(fail('x', { code: 'limit_day' })).kind).toBe('limit');
    expect(aiFailure(fail('x', { code: 'too_fast' })).reportable).toBe(false);
    expect(aiFailure(fail('x', { code: 'session_revoked' })).action).toBe('signin');
    expect(aiFailure(fail('Сбой на сервере', { code: 'internal' })).reportable).toBe(true);
    expect(aiFailure(fail('Сервер не понял запрос', { code: 'bad_request' })).reportable).toBe(true);
    expect(aiFailure(fail('Нужен вход в Refrain ИИ или свой ключ ИИ.', { signIn: true })).kind).toBe('setup');
  });
});

describe('плашка под ошибкой ИИ', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  const notice = (error: string, extra: Record<string, unknown> = {}, seen = new Map<string, number>(), t = now) => {
    const r = fail(error, extra);
    return aiNotice({ error, failure: aiFailure(r), signIn: Boolean(extra.signIn) }, seen, t);
  };

  it('нет сети, перегрузка, тайм-аут, лимит — без плашки', () => {
    expect(notice('Нет связи с сервером (network). Проверь интернет.')).toBeNull();
    expect(notice('429: rate limited')).toBeNull();
    expect(notice('ИИ не ответил вовремя. Попробуй ещё раз.')).toBeNull();
    expect(notice('x', { code: 'limit_day' })).toBeNull();
  });

  it('не запущен LM Studio или ключ не принят — «Настройки ИИ», а не жалоба', () => {
    expect(notice('Не удаётся подключиться. Если это программа на компьютере (LM Studio, Ollama) — запусти в ней сервер.')?.kind).toBe('settings');
    expect(notice('401: invalid x-api-key')?.kind).toBe('settings');
  });

  it('настоящий сбой — «Сообщить о проблеме», но один раз на одну и ту же ошибку', () => {
    const seen = new Map<string, number>();
    const first = notice('Сбой на сервере', { code: 'internal' }, seen);
    expect(first?.kind).toBe('report');
    seen.set(first!.key, now);
    expect(notice('Сбой на сервере', { code: 'internal' }, seen, now + 60000)).toBeNull();
    expect(notice('Сбой на сервере', { code: 'internal' }, seen, now + NOTICE_REPEAT_MS + 1)?.kind).toBe('report');
    // Закрыта крестиком — больше не показывается.
    seen.set(first!.key, Infinity);
    expect(notice('Сбой на сервере', { code: 'internal' }, seen, now + 10 * NOTICE_REPEAT_MS)).toBeNull();
  });
});
