// Если экран сломался, остальное приложение продолжает работать: показываем понятное сообщение вместо белого окна.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logLine, openReportProblem } from '../refrain';
import { canReport } from './ReportProblem';

/** Первая строка стека из кода приложения и ближайший компонент: « (в Today, App-abc.js:12:3)». */
function where(error: Error, info?: ErrorInfo): string {
  const frame = String(error.stack ?? '')
    .split('\n')
    .slice(1)
    .map((l) => l.trim().replace(/^at\s+/, '').replace(/\(?(?:https?|file|app):\/\/[^)\s]*\/([^/)\s]+)\)?/, '$1'))
    .find(Boolean);
  const comp = /^\s*at (\w+)/m.exec(info?.componentStack ?? '')?.[1];
  const parts = [comp && `в ${comp}`, frame].filter(Boolean);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/** Текст для жалобы: сообщение и несколько строк стека (без адресов файлов на диске). */
function describe(e: Error | null): string {
  if (!e) return '';
  const stack = String(e.stack ?? '')
    .split('\n')
    .slice(1, 4)
    .map((l) => l.trim().replace(/(?:https?|file|app):\/\/[^\s)]*\/([^/\s)]+)/g, '$1'))
    .join('\n');
  return `${e.message}${stack ? '\n' + stack : ''}`.slice(0, 300);
}

export class ErrorBoundary extends Component<{ children: ReactNode; onHome: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Экран сломался:', error, info.componentStack);
    // В журнал — не только текст, но и где упало: иначе одинаковые «Cannot assign…» из разных мест не различить.
    logLine(`экран сломался: ${error.message}${where(error, info)}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page narrow">
        <div className="empty crash">
          <strong>На этом экране что-то пошло не так</strong>
          <span>Твои данные в порядке. Вернись на «Сегодня» и попробуй ещё раз. Если повторится — напиши, что ты делал перед этим.</span>
          <code className="small muted">{String(this.state.error.message).slice(0, 200)}</code>
          <div className="row gap8 wrap">
          {canReport() && (
            <button className="btn" onClick={() => openReportProblem({ error: describe(this.state.error), category: 'other' })}>
              Сообщить о проблеме
            </button>
          )}
          <button
            className="btn primary"
            onClick={() => {
              this.setState({ error: null });
              this.props.onHome();
            }}
          >
            На «Сегодня»
          </button>
          </div>
        </div>
      </div>
    );
  }
}
