// Свёрнутый раздел настроек: заголовок с подсказкой, по нажатию — содержимое. Открыт или закрыт — помнится (uiMemory).
import type { ReactNode } from 'react';
import { useRemembered } from '../uiMemory';
import { Collapse } from './ui';

export function Fold({ id, title, hint, icon, children, defaultOpen = false }: { id: string; title: string; hint?: string; icon?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useRemembered<boolean>('fold:' + id, defaultOpen);
  return (
    <div className={'fold' + (open ? ' open' : '')} data-fold={id}>
      <button type="button" className="fold-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon && (
          <span className="fold-ico" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="grow fold-text">
          <strong>{title}</strong>
          {hint && <span className="small muted">{hint}</span>}
        </span>
        <span className={'chev' + (open ? ' open' : '')} aria-hidden="true">
          ›
        </span>
      </button>
      <Collapse open={open}>
        <div className="fold-body">{children}</div>
      </Collapse>
    </div>
  );
}
