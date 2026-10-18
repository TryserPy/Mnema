// Слушает ответы ИИ и просьбы «Сообщить о проблеме»: экран лимита, приглашение, строка под ошибкой ИИ и форма отчёта.
import '../refrain.css';
import { useEffect, useRef, useState } from 'react';
import { categoryFor, onRefrainAnswer, onReportProblem, openReportProblem, wantSignIn, type RefrainNotice, type ReportContext } from '../refrain';
import { aiNotice, type AiNotice } from '../aiFailure';
import { refrainApi } from '../refrainBridge';
import type { Route } from '../types';
import { categoryOfRoute, whereLabel } from '../where';
import { LimitScreen, type LimitCode } from './LimitScreen';
import { ReportProblem } from './ReportProblem';

const LIMIT_CODES: string[] = ['limit_day', 'limit_month', 'access_closed'];

export function RefrainHost({ go, where }: { go: (r: Route) => void; where?: () => Route }) {
  const [limit, setLimit] = useState<RefrainNotice | null>(null);
  const [failed, setFailed] = useState<(RefrainNotice & { notice: AiNotice }) | null>(null);
  // Когда какая плашка показывалась: одна и та же причина не всплывает на каждой странице и после каждого нажатия.
  const seen = useRef(new Map<string, number>());
  const [report, setReport] = useState<{ ctx: ReportContext; shot: string | null; where: string } | null>(null);
  const whereRef = useRef(where);
  whereRef.current = where;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // «Настройки ИИ» / «Войти» из ошибки любого ИИ-действия (AiRun) — работает и в веб-версии.
  useEffect(() => {
    const h = () => {
      setLimit(null);
      setFailed(null);
      go({ name: 'settings', section: 'ai' });
    };
    // Экран сам показал ошибку с действиями (AiRun.AiProblem) — плашку убираем, чтобы не закрывать этот текст.
    const inline = () => setFailed(null);
    window.addEventListener('refrain:ai-settings', h);
    window.addEventListener('refrain:ai-inline', inline);
    return () => {
      window.removeEventListener('refrain:ai-settings', h);
      window.removeEventListener('refrain:ai-inline', inline);
    };
  }, [go]);

  useEffect(() => {
    if (!refrainApi()) return;
    const off1 = onRefrainAnswer((n) => {
      if (n.code && LIMIT_CODES.includes(n.code)) return setLimit(n);
      const notice = aiNotice(n, seen.current, Date.now());
      if (!notice) return;
      seen.current.set(notice.key, Date.now());
      setFailed({ ...n, notice });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setFailed(null), 12000);
    });
    const off2 = onReportProblem((ctx) => {
      setFailed(null);
      const r = whereRef.current?.();
      const full = { ...ctx, category: ctx.category ?? (ctx.task || ctx.error ? undefined : categoryOfRoute(r)) };
      // Снимок — до открытия формы, чтобы на нём было окно, а не сама форма.
      void (refrainApi()?.screenshot() ?? Promise.resolve(null)).catch(() => null).then((shot) => setReport({ ctx: full, shot, where: whereLabel(r) }));
    });
    return () => {
      off1();
      off2();
      clearTimeout(timer.current);
    };
  }, []);

  /** Закрыта крестиком — до перезапуска больше не показываем. */
  const dismiss = () => {
    if (failed) seen.current.set(failed.notice.key, Infinity);
    setFailed(null);
  };

  const toAi = () => {
    setLimit(null);
    setFailed(null);
    go({ name: 'settings', section: 'ai' });
  };

  return (
    <>
      {limit?.code && (
        <LimitScreen
          code={limit.code as LimitCode}
          quota={limit.quota}
          onClose={() => setLimit(null)}
          onOwnKey={toAi}
          onOffline={() => void window.mnemaApi?.aiSetConfig?.({ provider: 'local' }).finally(toAi)}
        />
      )}
      {failed && !report && failed.notice.kind === 'signin' && (
        <div className="rf-failed" role="status" data-part="signin-bar">
          <span className="small grow">{failed.notice.hint ?? 'Чтобы ИИ помог, войди в Refrain ИИ (бесплатно, только почта) или добавь свой ключ.'}</span>
          <button
            className="btn small primary"
            onClick={() => {
              wantSignIn();
              toAi();
            }}
          >
            Войти в Refrain ИИ
          </button>
          {!failed.notice.hint && (
            <button className="btn small" onClick={toAi}>
              Добавить ключ
            </button>
          )}
          <button className="icon-btn small" aria-label="Закрыть" onClick={dismiss}>
            ×
          </button>
        </div>
      )}
      {failed && !report && failed.notice.kind === 'settings' && (
        <div className="rf-failed" role="status" data-part="ai-settings-bar">
          <span className="small grow">{failed.notice.hint}</span>
          <button className="btn small primary" onClick={toAi}>
            Настройки ИИ
          </button>
          <button className="icon-btn small" aria-label="Закрыть" onClick={dismiss}>
            ×
          </button>
        </div>
      )}
      {failed && !report && failed.notice.kind === 'report' && (
        <div className="rf-failed" role="status" data-part="ai-report-bar">
          <span className="small grow">Похоже на сбой Refrain, а не на настройки. Можно отправить разработчику — ошибка подставится сама.</span>
          <button className="btn small" onClick={() => openReportProblem({ task: failed.task, error: failed.error, category: categoryFor(failed.task) })}>
            Сообщить о проблеме
          </button>
          <button className="icon-btn small" aria-label="Закрыть" onClick={dismiss}>
            ×
          </button>
        </div>
      )}
      {report && <ReportProblem ctx={report.ctx} shot={report.shot} where={report.where} onClose={() => setReport(null)} />}
    </>
  );
}
