// Слушает ответы ИИ и просьбы «Сообщить о проблеме»: экран лимита, приглашение, строка под ошибкой ИИ и форма отчёта.
import '../refrain.css';
import { useEffect, useRef, useState } from 'react';
import { categoryFor, onRefrainAnswer, onReportProblem, openReportProblem, type RefrainNotice, type ReportContext } from '../refrain';
import { refrainApi } from '../refrainBridge';
import type { Route } from '../types';
import { LimitScreen, type LimitCode } from './LimitScreen';
import { ReportProblem } from './ReportProblem';

const LIMIT_CODES: string[] = ['limit_day', 'limit_month', 'access_closed'];

export function RefrainHost({ go }: { go: (r: Route) => void }) {
  const [limit, setLimit] = useState<RefrainNotice | null>(null);
  const [failed, setFailed] = useState<RefrainNotice | null>(null);
  const [report, setReport] = useState<{ ctx: ReportContext; shot: string | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!refrainApi()) return;
    const off1 = onRefrainAnswer((n) => {
      if (n.code && LIMIT_CODES.includes(n.code)) return setLimit(n);
      if (!n.error) return;
      setFailed(n);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setFailed(null), 12000);
    });
    const off2 = onReportProblem((ctx) => {
      setFailed(null);
      // Снимок — до открытия формы, чтобы на нём было окно, а не сама форма.
      void (refrainApi()?.screenshot() ?? Promise.resolve(null)).catch(() => null).then((shot) => setReport({ ctx, shot }));
    });
    return () => {
      off1();
      off2();
      clearTimeout(timer.current);
    };
  }, []);

  const toAi = () => {
    setLimit(null);
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
      {failed && !report && (
        <div className="rf-failed" role="status">
          <span className="small grow">Не получилось у ИИ?</span>
          <button className="btn small" onClick={() => openReportProblem({ task: failed.task, error: failed.error, category: categoryFor(failed.task) })}>
            Сообщить о проблеме
          </button>
          <button className="icon-btn small" aria-label="Закрыть" onClick={() => setFailed(null)}>
            ×
          </button>
        </div>
      )}
      {report && <ReportProblem ctx={report.ctx} shot={report.shot} onClose={() => setReport(null)} />}
    </>
  );
}
