// Подсказка экрана при первом открытии (src/screenTips.ts): карточка вверху экрана, «Понятно» — и больше не показывается.
import { useState } from 'react';
import { markTipSeen, SCREEN_TIPS, tipSeen, type TipId } from '../screenTips';
import { Icon } from './ui';

export function ScreenTip({ id }: { id: TipId }) {
  const [shown, setShown] = useState(() => !tipSeen(id));
  if (!shown) return null;
  const tip = SCREEN_TIPS[id];
  return (
    <aside className="screen-tip" aria-label={`Подсказка: ${tip.title}`}>
      <Icon name="info" size={20} />
      <span className="grow stack gap2">
        <strong>{tip.title}</strong>
        <span className="small">{tip.text}</span>
      </span>
      <button
        type="button"
        className="btn small"
        onClick={() => {
          markTipSeen(id);
          setShown(false);
        }}
      >
        Понятно
      </button>
    </aside>
  );
}
