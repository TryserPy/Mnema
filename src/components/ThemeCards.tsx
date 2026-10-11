// Карточки тем и главных цветов: один вид в «Оформлении» и в редакторе стиля.
import { DEFAULT_LOOK, presetFor, type ThemePreset } from '../themes';
import type { Look } from '../types';
import { STYLES } from '../themes';

export const ACCENTS = ['#4C5BD4', '#3F51D8', '#1F7A6B', '#B4452F', '#6B3FC4', '#2A5BB8', '#3A3F4E', '#C2417A', '#2F8F5B', '#A4591A', '#0E8FA3'];

export function ThemeCard({ t, on, onPick }: { t: ThemePreset; on: boolean; onPick: () => void }) {
  const p = t.p;
  return (
    <button type="button" className={'theme-card' + (on ? ' on' : '')} aria-pressed={on} onClick={onPick} title={t.name}>
      <span className="theme-prev" style={{ background: p.bg }}>
        <span className="tp-side" style={{ background: p.side }}>
          <i style={{ background: p.ink }} />
          <i style={{ background: p.muted, width: '70%' }} />
          <i style={{ background: p.muted, width: '80%' }} />
        </span>
        <span className="tp-main">
          <span className="tp-card" style={{ background: p.surface, border: `1px solid ${p.line}` }}>
            <i style={{ background: p.ink, width: '60%' }} />
            <i style={{ background: p.muted, width: '85%' }} />
          </span>
          <span className="tp-btn" style={{ background: t.accent }} />
        </span>
      </span>
      <span className="theme-name">{t.name}</span>
    </button>
  );
}

export function StyleCard({ st, on, onPick, dark }: { st: (typeof STYLES)[number]; on: boolean; onPick: () => void; dark: boolean }) {
  const t = presetFor({ ...DEFAULT_LOOK, ...st.look } as Look, dark);
  const p = t.p;
  return (
    <button type="button" className={'style-card' + (on ? ' on' : '')} aria-pressed={on} onClick={onPick}>
      <span className="style-prev" style={{ background: p.bg, color: p.ink }}>
        <span className="sp-title" style={{ fontFamily: st.id === 'classic' ? "'Literata', Georgia, serif" : 'inherit' }}>
          Сегодня
        </span>
        <span className="sp-hero" style={{ background: st.accent }}>
          <b>12</b>
        </span>
        <span className="sp-card" style={{ background: p.surface, borderColor: st.id === 'classic' ? p.line : 'transparent', boxShadow: st.id === 'modern' ? '0 1px 3px rgba(16,24,40,0.10)' : 'none' }}>
          <i style={{ background: p.ink }} />
          <i style={{ background: p.muted }} />
        </span>
      </span>
      <span className="stack gap2 style-text">
        <strong>{st.name}</strong>
        <span className="small muted">{st.text}</span>
      </span>
    </button>
  );
}

