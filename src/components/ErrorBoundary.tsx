// Если экран сломался, остальное приложение продолжает работать: показываем понятное сообщение вместо белого окна.
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode; onHome: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('Экран сломался:', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page narrow">
        <div className="empty crash">
          <strong>На этом экране что-то пошло не так</strong>
          <span>Твои данные в порядке. Вернись на «Сегодня» и попробуй ещё раз. Если повторится — напиши, что ты делал перед этим.</span>
          <code className="small muted">{String(this.state.error.message).slice(0, 200)}</code>
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
    );
  }
}
