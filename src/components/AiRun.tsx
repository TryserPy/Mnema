// Одинаковое поведение у всех действий с ИИ (1.33): видно, кто отвечает (Refrain ИИ, свой ключ, модель на компьютере),
// пока ждём — можно отменить, при ошибке — «Повторить» и действие по причине («Настройки ИИ», «Войти»), а не тупик.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AiError, aiFailure, type AiFailure } from '../aiFailure';

export { AiError };
import { refrainApi } from '../refrainBridge';
import { categoryFor, openReportProblem, wantSignIn } from '../refrain';
import type { TaskId } from '../../shared/refrain/api.mjs';
import type { AiConfigOrder } from './RefrainSettings';
import { Icon } from './ui';
import '../ai-run.css';

/** Причина ошибки: из AiError, иначе — по тексту (свои проверки до запроса, сбой разбора ответа). */
export function failureOf(e: unknown): AiFailure {
  if (e instanceof AiError) return e.failure;
  return aiFailure({ ok: false, error: e instanceof Error ? e.message : String(e) });
}

/** Открыть настройки ИИ (обрабатывает RefrainHost — у него есть навигация). signIn — сразу к форме входа. */
export function openAiSettings(signIn = false): void {
  if (signIn) wantSignIn();
  window.dispatchEvent(new CustomEvent('refrain:ai-settings'));
}

const PROVIDER_NAME: Record<string, string> = { anthropic: 'Claude', gemini: 'Gemini', local: 'модель на компьютере' };

/** Кто ответит первым: «Refrain ИИ», «Claude (свой ключ)», «модель на компьютере». */
export function providerLabel(cfg: AiConfigOrder | null, refrainOn: boolean): string {
  if (!cfg) return '';
  const order = cfg.order ?? ['refrain', 'key', 'local'];
  const first = order.find((s) => refrainOn || s !== 'refrain') ?? 'key';
  if (first === 'refrain') return 'Refrain ИИ';
  if (first === 'local' || cfg.provider === 'local') return 'модель на компьютере';
  const custom = cfg.provider.startsWith('custom:') ? cfg.custom.find((c) => `custom:${c.id}` === cfg.provider) : undefined;
  return `${custom?.name ?? PROVIDER_NAME[cfg.provider] ?? cfg.provider} (свой ключ)`;
}

let cached: AiConfigOrder | null = null;

/** Подпись текущего ИИ; обновляется, когда настройки ИИ меняются. */
export function useAiProvider(): string {
  const [cfg, setCfg] = useState<AiConfigOrder | null>(cached);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void window.mnemaApi
        ?.aiGetConfig?.()
        .then((c) => {
          cached = c as AiConfigOrder;
          if (alive) setCfg(cached);
        })
        .catch(() => {});
    load();
    window.addEventListener('refrain:ai-config', load);
    return () => {
      alive = false;
      window.removeEventListener('refrain:ai-config', load);
    };
  }, []);
  return providerLabel(cfg, Boolean(refrainApi() && cfg?.refrain));
}

/** «ИИ: Refrain ИИ · сменить» — видно, куда уйдёт запрос, и как это поменять. */
export function AiVia() {
  const label = useAiProvider();
  if (!label) return null;
  return (
    <span className="ai-via small muted" data-part="ai-via">
      Отвечает: <b>{label}</b>
      <button type="button" className="link-btn small" onClick={() => openAiSettings()}>
        сменить
      </button>
    </span>
  );
}

/** Ждём ответ: что происходит, кто отвечает, «Отменить». */
export function AiWorking({ label, onCancel, via = true, children }: { label: string; onCancel?: () => void; via?: boolean; children?: ReactNode }) {
  return (
    <div className="ai-working stack gap8" role="status" aria-live="polite" data-part="ai-working">
      <div className="row gap8 wrap">
        <Icon name="sparkle" size={18} />
        <span className="grow">{label}</span>
        {onCancel && (
          <button type="button" className="btn small ghost" onClick={onCancel}>
            Отменить
          </button>
        )}
      </div>
      {via && <AiVia />}
      {children}
    </div>
  );
}

/** Ошибка ИИ: текст, «Повторить» и действие по причине. Ожидаемое (нет сети, лимит) — предупреждение, сбой — ошибка. */
export function AiProblem({ error, failure, onRetry, extra, task }: { error: string; failure?: AiFailure; onRetry?: () => void; extra?: ReactNode; task?: TaskId }) {
  const f = failure ?? failureOf(new Error(error));
  // Ошибка видна прямо здесь — общая плашка сверху (RefrainHost) не нужна: она бы закрыла этот же текст.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('refrain:ai-inline'));
  }, [error]);
  return (
    <div className={'hint ' + (f.reportable ? 'error' : 'warn') + ' ai-problem stack gap8'} role="alert" data-part="ai-problem" data-kind={f.kind}>
      <span>{error}</span>
      <div className="row gap8 wrap">
        {onRetry && f.kind !== 'limit' && f.kind !== 'setup' && (
          <button type="button" className="btn small primary" onClick={onRetry}>
            <Icon name="repeat" size={14} /> Повторить
          </button>
        )}
        {f.action === 'settings' && (
          <button type="button" className="btn small" onClick={() => openAiSettings()}>
            Настройки ИИ
          </button>
        )}
        {f.action === 'signin' && refrainApi() && (
          <button type="button" className="btn small" onClick={() => openAiSettings(true)}>
            Войти в Refrain ИИ
          </button>
        )}
        {f.kind === 'setup' && (
          <button type="button" className="btn small" onClick={() => openAiSettings()}>
            Настройки ИИ
          </button>
        )}
        {f.reportable && refrainApi() && (
          <button type="button" className="btn small ghost" onClick={() => openReportProblem({ error, task, category: categoryFor(task) })}>
            Сообщить о проблеме
          </button>
        )}
        {extra}
      </div>
    </div>
  );
}

export type AiTaskState<T> = { name: 'idle' } | { name: 'busy' } | { name: 'done'; value: T } | { name: 'error'; error: string; failure: AiFailure };

/**
 * Запрос к ИИ с отменой и повтором. «Отменить» не может остановить уже ушедший запрос (мост этого не умеет),
 * но его ответ больше не применяется, и экран сразу возвращается к прежнему состоянию.
 */
export function useAiTask<T>() {
  const [state, setState] = useState<AiTaskState<T>>({ name: 'idle' });
  const runId = useRef(0);
  const last = useRef<(() => Promise<T>) | null>(null);
  useEffect(
    () => () => {
      runId.current++;
    },
    []
  );
  const run = async (fn: () => Promise<T>): Promise<T | undefined> => {
    last.current = fn;
    const id = ++runId.current;
    setState({ name: 'busy' });
    try {
      const value = await fn();
      if (id === runId.current) setState({ name: 'done', value });
      return id === runId.current ? value : undefined;
    } catch (e) {
      if (id === runId.current) setState({ name: 'error', error: (e as Error).message || 'Не получилось.', failure: failureOf(e) });
      return undefined;
    }
  };
  return {
    state,
    run,
    retry: () => (last.current ? run(last.current) : Promise.resolve(undefined)),
    cancel: () => {
      runId.current++;
      setState({ name: 'idle' });
    },
    reset: () => {
      runId.current++;
      setState({ name: 'idle' });
    }
  };
}
