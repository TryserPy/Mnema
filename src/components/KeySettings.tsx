import { useEffect, useState } from 'react';
import { comboFromEvent, conflicts, KEY_DEFS, keyFor, prettyCombo, type KeyAction } from '../keys';
import { updateSettings, useData } from '../store';

/** Настройка горячих клавиш: нажми на клавишу действия и затем новое сочетание. */
export function KeySettings() {
  const data = useData();
  const s = data.settings;
  const [listening, setListening] = useState<KeyAction | null>(null);
  const clash = conflicts(s);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && listening !== 'exitReview') {
        setListening(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // ждём основную клавишу
      if (listening === 'miniReview' && !/(Ctrl|Alt)\+/.test(combo)) return; // из любой программы — только с Ctrl или Alt
      set(listening, combo);
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(id: KeyAction, combo: string | undefined) {
    const keys = { ...s.keys };
    const def = KEY_DEFS.find((d) => d.id === id)!.def;
    if (combo === undefined || combo === def) delete keys[id];
    else keys[id] = combo;
    updateSettings({ keys });
  }

  const groups = [...new Set(KEY_DEFS.map((d) => d.group))];
  const changed = Object.keys(s.keys).length > 0;

  return (
    <div className="stack gap16">
      {groups.map((g) => (
        <div key={g} className="stack gap4">
          <span className="label">{g}</span>
          {KEY_DEFS.filter((d) => d.group === g).map((d) => {
            const k = keyFor(s, d.id);
            const off = d.needs && !s.features[d.needs];
            const custom = s.keys[d.id] !== undefined;
            const other = clash.get(d.id);
            return (
              <div key={d.id} className={'key-row' + (off ? ' off' : '')}>
                <span className="grow">
                  {d.label}
                  {off && <span className="small muted"> — включи в «Возможностях»</span>}
                  {other && <span className="small warn-text"> — совпадает с «{KEY_DEFS.find((x) => x.id === other)!.label}»</span>}
                </span>
                <button className={'key-capture' + (listening === d.id ? ' listening' : '') + (other ? ' clash' : '')} onClick={() => setListening(listening === d.id ? null : d.id)} aria-label={`Клавиша: ${d.label}`}>
                  {listening === d.id ? (
                    'Нажми сочетание…'
                  ) : k ? (
                    prettyCombo(k).map((p, i) => (
                      <span key={i} className="kbd">
                        {p}
                      </span>
                    ))
                  ) : (
                    <span className="muted">нет</span>
                  )}
                </button>
                <button className="icon-btn small" title="Убрать клавишу" aria-label="Убрать клавишу" disabled={!k} onClick={() => set(d.id, '')}>
                  ×
                </button>
                <button className="icon-btn small" title="Как было" aria-label="Вернуть как было" disabled={!custom} onClick={() => set(d.id, undefined)}>
                  ↺
                </button>
              </div>
            );
          })}
        </div>
      ))}
      <p className="small muted">
        Нажми на клавишу справа, потом новое сочетание. Буквы работают в любой раскладке. Enter при повторении всегда показывает ответ и ставит «Хорошо». Для «Из любой программы» нужно сочетание с Ctrl или Alt.
      </p>
      {changed && (
        <div className="row end">
          <button className="btn small ghost" onClick={() => updateSettings({ keys: {} })}>
            Вернуть все клавиши как было
          </button>
        </div>
      )}
    </div>
  );
}
