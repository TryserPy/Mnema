// Кирпичики экрана настроек: группа (карточка со строками) и строка «название — подсказка — переключатель».
import type { ReactNode } from 'react';

export function Group({ title, hint, children, id, className = '' }: { title?: string; hint?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return (
    <section className={'sgroup ' + className} data-set={id}>
      {title && <h3 className="sgroup-title">{title}</h3>}
      <div className="sgroup-body">{children}</div>
      {hint && <p className="sgroup-hint">{hint}</p>}
    </section>
  );
}

export function SRow({ label, hint, children, id, stack = false }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; id?: string; stack?: boolean }) {
  return (
    <div className={'srow' + (stack ? ' stack-row' : '')} data-set={id}>
      <div className="srow-text">
        <span className="srow-label">{label}</span>
        {hint && <span className="srow-hint">{hint}</span>}
      </div>
      {children !== undefined && <div className="srow-ctl">{children}</div>}
    </div>
  );
}

export function PaneHead({ title, text, children }: { title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="pane-head">
      <div className="stack gap4 grow">
        <h2>{title}</h2>
        {text && <p className="pane-text">{text}</p>}
      </div>
      {children}
    </div>
  );
}
