// Настройки стиля (как Style Settings в Obsidian): цвет, ползунок, список, переключатель, текст, шрифт — меняются без кода.
import { safeColor } from '../safeCss';
import { settingValue } from '../styleSystem';
import { FONTS } from '../themes';
import type { Mod, StyleSetting, StyleValue } from '../types';
import { Segmented, Switch } from './ui';

/** Готовые шрифты для настройки-«шрифт» (плюс «свой» — текстом). */
const FONT_PRESETS = [...FONTS.map((f) => ({ label: f.name, css: f.css })), { label: 'Моноширинный', css: "ui-monospace, 'Cascadia Mono', Consolas, monospace" }];

/** Цвет из выбора + прозрачность из значения по умолчанию (у «#RRGGBBAA» выбор цвета её не показывает, но она должна остаться). */
function withAlpha(picked: string, def: string): string {
  return /^#[0-9a-f]{8}$/i.test(def) ? picked + def.slice(7) : picked;
}
const six = (c: string) => (/^#[0-9a-f]{8}$/i.test(c) ? c.slice(0, 7) : /^#[0-9a-f]{6}$/i.test(c) ? c : '#888888');

function Control({ s, value, onChange }: { s: StyleSetting; value: StyleValue; onChange: (v: StyleValue) => void }) {
  switch (s.type) {
    case 'color': {
      const c = String(value);
      return (
        <span className="row gap8">
          <input type="color" className="se-color" aria-label={s.label} value={six(safeColor(c) ?? '#888888')} onChange={(e) => onChange(withAlpha(e.target.value, String(s.default)))} />
          <code className="small">{c}</code>
        </span>
      );
    }
    case 'slider': {
      const n = Number(value);
      return (
        <span className="row gap8 se-slider">
          <input type="range" aria-label={s.label} min={s.min} max={s.max} step={s.step} value={n} onChange={(e) => onChange(Number(e.target.value))} />
          <span className="small se-val">
            {n}
            {s.unit ?? ''}
          </span>
        </span>
      );
    }
    case 'select': {
      const opts = s.options ?? [];
      if (opts.length <= 4) return <Segmented ariaLabel={s.label} value={String(value)} options={opts} onChange={(v) => onChange(v)} />;
      return (
        <select className="input" aria-label={s.label} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case 'toggle':
      return <Switch label={s.label} checked={value === true} onChange={onChange} />;
    case 'font': {
      const css = String(value);
      const known = FONT_PRESETS.some((f) => f.css === css);
      return (
        <span className="stack gap4">
          <select className="input" aria-label={s.label} value={known ? css : ''} onChange={(e) => e.target.value && onChange(e.target.value)}>
            {!known && <option value="">Свой: {css}</option>}
            {FONT_PRESETS.map((f) => (
              <option key={f.label} value={f.css}>
                {f.label}
              </option>
            ))}
          </select>
        </span>
      );
    }
    default:
      return <input className="input" aria-label={s.label} value={String(value)} maxLength={140} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Все настройки одного стиля. `values` — что сохранено; `onChange(id, undefined)` — вернуть значение по умолчанию. */
export function StyleSettingsPanel({ mod, values, onChange }: { mod: Mod; values: Record<string, StyleValue> | undefined; onChange: (id: string, v: StyleValue | undefined) => void }) {
  const list = mod.settings ?? [];
  if (!list.length) return <p className="small muted">У этого стиля нет настроек.</p>;
  return (
    <div className="se-settings">
      {list.map((s) => {
        const v = settingValue(s, values?.[s.id]);
        const changed = values?.[s.id] !== undefined && settingValue(s, values[s.id]) !== settingValue(s, undefined);
        return (
          <div key={s.id} className="se-setting">
            <div className="se-setting-text">
              <span className="se-setting-label">{s.label}</span>
              {s.description && <span className="small muted">{s.description}</span>}
            </div>
            <div className="se-setting-ctl">
              <Control s={s} value={v} onChange={(x) => onChange(s.id, x)} />
              {changed && (
                <button type="button" className="link-btn small" onClick={() => onChange(s.id, undefined)} title="Вернуть значение по умолчанию">
                  сбросить
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
