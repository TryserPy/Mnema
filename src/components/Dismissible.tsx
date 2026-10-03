// Подсказки на экранах можно закрыть крестиком — закрытая больше не появляется (вернуть: «Настройки → О Мнеме → Подсказки»).
import type { ReactNode } from 'react';
import { updateSettings, useData } from '../store';
import { Icon } from './ui';

export const useTipHidden = (id: string) => Boolean(useData().settings.hiddenTips?.includes(id));
export const hideTip = (id: string, hiddenNow: string[] | undefined) => updateSettings({ hiddenTips: [...(hiddenNow ?? []).filter((x) => x !== id), id] });

/** Рамка с крестиком в углу. Содержимое (кнопка-подсказка) остаётся кликабельным само по себе. */
export function Dismissible({ id, className = '', children }: { id: string; className?: string; children: ReactNode }) {
  const data = useData();
  const hidden = data.settings.hiddenTips;
  if (hidden?.includes(id)) return null;
  return (
    <div className={'dismissible ' + className}>
      {children}
      <button type="button" className="icon-btn small dismiss-x" aria-label="Скрыть подсказку" title="Скрыть подсказку" onClick={() => hideTip(id, hidden)}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
