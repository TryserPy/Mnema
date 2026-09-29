// Экран, который нарисовал мод.
import { useEffect, useRef } from 'react';
import { usePlugins } from '../plugins/host';

export function PluginScreen({ id }: { id: string }) {
  const reg = usePlugins();
  const view = reg.views.find((v) => v.id === id);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !view) return;
    el.innerHTML = '';
    let cleanup: void | (() => void);
    try {
      cleanup = view.render(el);
    } catch (e) {
      el.innerHTML = '';
      const p = document.createElement('div');
      p.className = 'empty';
      p.textContent = 'Мод сломался: ' + (e as Error).message;
      el.append(p);
    }
    return () => {
      try {
        cleanup?.();
      } catch {
        /* мод */
      }
    };
  }, [view]);
  if (!view)
    return (
      <div className="page narrow">
        <div className="empty">
          <strong>Этот экран принадлежал моду</strong>
          <span>Мод выключен или удалён. Включи его в «Настройках → Моды».</span>
        </div>
      </div>
    );
  return <div ref={ref} className="plugin-view" />;
}
