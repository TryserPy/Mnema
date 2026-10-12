// Кирпичики редактора стиля: строка цвета (светлая и тёмная тема), ползунок переменной, выбор раскладки, шрифт.
// Все они работают над стилем (Mod) и возвращают новый стиль; что с ним делать дальше — решает редактор (StyleEditor.tsx).
import { useMemo, useState } from 'react';
import { accentText, onAccent, parseColor, toHex } from '../color';
import { safeColor, safeCssValue } from '../safeCss';
import type { ApiVar } from '../styleApi';
import { getVar, setAccent, setAttr, setVar, type Mode } from '../styleBuilder';
import { effectiveColors, type BaseAppearance } from '../styleContrast';
import { STYLE_ATTRS } from '../styleSystem';
import type { Mod } from '../types';

/** Что нужно любому полю редактора: сам стиль, как его менять, и «основа» (то, что стоит в настройках, — для расчёта контраста и подсказок). */
export interface EditCtx {
  m: Mod;
  set: (m: Mod) => void;
  /** Правим текущее оформление (а не сохранённый стиль): тема, шрифты, плотность и фон лежат в настройках. */
  current: boolean;
  baseApp: BaseAppearance;
}

const hex = (c: [number, number, number] | undefined) => (c ? toHex(c) : '#888888');

/** Цвет, который сейчас виден в теме `mode` для переменной `name` (даже если стиль её не менял). */
export function shownColor(ctx: EditCtx, mode: Mode, name: string, eff?: ReturnType<typeof effectiveColors>): string {
  const own = getVar(ctx.m, mode, name);
  if (own) return own;
  const c = eff ?? effectiveColors(ctx.m, mode, ctx.baseApp);
  if (c[name]) return hex(c[name]);
  const acc = c['--accent'];
  if (name === '--on-accent' && acc) return onAccent(toHex(acc));
  if (name === '--accent-text' && acc) return accentText(toHex(acc), hex(c['--surface']));
  return '#888888';
}

/** Одна ячейка цвета: окошко выбора + запись кодом (для цветов с прозрачностью) + «не менять». */
function ColorCell({ label, mode, value, shown, onChange }: { label: string; mode: Mode; value: string | undefined; shown: string; onChange: (c: string | undefined) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const rgb = parseColor(value ?? shown);
  const picker = rgb ? toHex(rgb) : '#888888';
  const text = draft ?? value ?? '';
  return (
    <span className="se-color-cell">
      <span className="small muted se-mode">{mode === 'light' ? 'Светлая' : 'Тёмная'}</span>
      <input type="color" className="se-color" aria-label={`${label}, ${mode === 'light' ? 'светлая' : 'тёмная'} тема`} value={picker} style={value ? undefined : { opacity: 0.4 }} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <input
        className={'input se-hex' + (draft !== null && !safeColor(draft) ? ' bad' : '')}
        aria-label={`${label}, ${mode === 'light' ? 'светлая' : 'тёмная'} тема, код цвета`}
        placeholder={shown}
        spellCheck={false}
        value={text}
        maxLength={40}
        onChange={(e) => {
          const t = e.target.value;
          setDraft(t);
          if (t.trim() === '') onChange(undefined);
          else if (safeColor(t)) onChange(t.trim());
        }}
        onBlur={() => setDraft(null)}
      />
      {value && (
        <button type="button" className="link-btn small" onClick={() => (setDraft(null), onChange(undefined))} title="Не менять: вернуть цвет темы">
          ×
        </button>
      )}
    </span>
  );
}

/** Строка цвета: название, светлая и тёмная версия. Для главного цвета заодно считаются цвет текста на нём и сам он как текст. */
export function ColorTokenRow({ v, ctx, eff }: { v: ApiVar; ctx: EditCtx; eff: Record<Mode, ReturnType<typeof effectiveColors>> }) {
  const isAccent = v.name === '--accent';
  const label = v.label ?? v.name;
  return (
    <div className="se-row" data-token={v.name}>
      <div className="se-row-text">
        <span className="se-row-label">{label}</span>
        <span className="small muted">
          <code>{v.name}</code> — {v.doc}
        </span>
      </div>
      <div className="se-colors">
        {(['light', 'dark'] as const).map((mode) => (
          <ColorCell
            key={mode}
            label={label}
            mode={mode}
            value={getVar(ctx.m, mode, v.name)}
            shown={shownColor(ctx, mode, v.name, eff[mode])}
            onChange={(c) => ctx.set(isAccent ? setAccent(ctx.m, mode, c, shownColor(ctx, mode, '--surface', eff[mode])) : setVar(ctx.m, mode, v.name, c))}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Ползунки переменных ----------

interface Range {
  min: number;
  max: number;
  step: number;
  unit: string;
}

// Пределы там, где «в 2–3 раза от обычного» не подходит.
const RANGES: Record<string, Range> = {
  '--radius': { min: 0, max: 48, step: 1, unit: 'px' },
  '--rf-border-w': { min: 0, max: 6, step: 0.5, unit: 'px' },
  '--rf-body-lh': { min: 1, max: 2.4, step: 0.05, unit: '' },
  '--rf-note-lh': { min: 1, max: 2.6, step: 0.05, unit: '' },
  '--rf-note-size': { min: 0.8, max: 2, step: 0.02, unit: 'rem' },
  '--rf-question-size': { min: 1, max: 4, step: 0.05, unit: 'rem' },
  '--side-w': { min: 160, max: 460, step: 2, unit: 'px' },
  '--rf-content-w': { min: 480, max: 1800, step: 10, unit: 'px' },
  '--rf-content-w-wide': { min: 480, max: 1900, step: 10, unit: 'px' },
  '--rf-content-w-narrow': { min: 480, max: 1400, step: 10, unit: 'px' },
  '--rf-review-w': { min: 480, max: 1400, step: 10, unit: 'px' },
  '--rf-tile-w': { min: 140, max: 520, step: 5, unit: 'px' }
};

/** Пределы ползунка по значению по умолчанию («248px» → 0…600 px); null — значение составное («16px 18px»), его правят текстом. */
export function rangeFor(name: string, def: string | undefined): Range | null {
  if (RANGES[name]) return RANGES[name];
  const m = /^(-?[\d.]+)(px|rem|em|%)?$/.exec((def ?? '').trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2] ?? '';
  if (unit === 'px') return { min: 0, max: Math.max(24, Math.ceil((n * 2.5) / 4) * 4), step: 1, unit };
  if (unit === 'rem' || unit === 'em') return { min: 0.5, max: Math.max(3, Math.ceil(n * 2.5)), step: 0.05, unit };
  return { min: 0, max: Math.max(2, n * 2.5), step: 0.05, unit };
}

/** Строка-ползунок для переменной. Без значения в стиле ползунок бледный, а справа написано «как есть». */
export function VarRow({ v, ctx, mode = 'light', label }: { v: ApiVar; ctx: EditCtx; mode?: Mode; label?: string }) {
  const range = rangeFor(v.name, v.def);
  const cur = getVar(ctx.m, mode, v.name);
  const title = label ?? v.label ?? v.doc.replace(/\.$/, '');
  if (!range) return <TextVarRow v={v} ctx={ctx} title={title} mode={mode} />;
  const n = cur ? parseFloat(cur) : NaN;
  const defN = parseFloat(v.def ?? '');
  const shown = Number.isFinite(n) ? n : Number.isFinite(defN) ? defN : range.min;
  return (
    <div className="se-row" data-token={v.name}>
      <div className="se-row-text">
        <span className="se-row-label">{title}</span>
        <span className="small muted">
          <code>{v.name}</code>
          {v.def ? ` · обычно ${v.def}` : ''}
        </span>
      </div>
      <span className="row gap8 se-slider">
        <input
          type="range"
          aria-label={title}
          min={range.min}
          max={Math.max(range.max, shown)}
          step={range.step}
          value={shown}
          style={Number.isFinite(n) ? undefined : { opacity: 0.45 }}
          onChange={(e) => ctx.set(setVar(ctx.m, mode, v.name, Number(e.target.value) + range.unit))}
        />
        <span className="small se-val">{Number.isFinite(n) ? n + range.unit : 'как есть'}</span>
        {cur !== undefined && (
          <button type="button" className="link-btn small" title="Не менять" onClick={() => ctx.set(setVar(ctx.m, mode, v.name, undefined))}>
            ×
          </button>
        )}
      </span>
    </div>
  );
}

/** Составные значения («16px 18px», «0 4px 12px rgba(…)») — текстом, с проверкой. */
export function TextVarRow({ v, ctx, title, mode = 'light' }: { v: ApiVar; ctx: EditCtx; title: string; mode?: Mode }) {
  const cur = getVar(ctx.m, mode, v.name);
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? cur ?? '';
  const bad = draft !== null && draft.trim() !== '' && safeCssValue(draft) === null;
  return (
    <div className="se-row" data-token={v.name}>
      <div className="se-row-text">
        <span className="se-row-label">{title}</span>
        <span className="small muted">
          <code>{v.name}</code>
          {v.def ? ` · обычно ${v.def}` : ''}
        </span>
      </div>
      <span className="row gap8">
        <input
          className={'input grow' + (bad ? ' bad' : '')}
          aria-label={title}
          placeholder={v.def ?? 'как есть'}
          spellCheck={false}
          value={text}
          maxLength={140}
          onChange={(e) => {
            setDraft(e.target.value);
            const t = e.target.value.trim();
            if (!t) ctx.set(setVar(ctx.m, mode, v.name, undefined));
            else if (safeCssValue(t) !== null) ctx.set(setVar(ctx.m, mode, v.name, t));
          }}
          onBlur={() => setDraft(null)}
        />
        {cur !== undefined && (
          <button type="button" className="link-btn small" title="Не менять" onClick={() => (setDraft(null), ctx.set(setVar(ctx.m, mode, v.name, undefined)))}>
            ×
          </button>
        )}
      </span>
      {bad && <span className="se-warn small">Нельзя: только числа, цвета, слова, скобки; без «;», «{'{'}», ссылок и комментариев.</span>}
    </div>
  );
}

// ---------- Раскладка ----------

/** Одна строка раскладки: подпись и кнопки-варианты; «как было» убирает атрибут. */
export function AttrRow({ name, ctx }: { name: string; ctx: EditCtx }) {
  const def = STYLE_ATTRS[name];
  const cur = ctx.m.attrs?.[name];
  const set = (v: string | undefined) => ctx.set(setAttr(ctx.m, name, v));
  return (
    <div className="se-row" data-attr={name}>
      <div className="se-row-text">
        <span className="se-row-label">{def.label}</span>
        <span className="small muted">{def.doc}</span>
      </div>
      <div className="se-chips" role="radiogroup" aria-label={def.label}>
        <button type="button" role="radio" aria-checked={cur === undefined} className={'se-chip' + (cur === undefined ? ' on' : '')} onClick={() => set(undefined)}>
          Не менять
        </button>
        {def.options
          .filter((o) => o.value !== def.default || name === 'anim')
          .map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={cur === o.value} className={'se-chip' + (cur === o.value ? ' on' : '')} onClick={() => set(o.value)}>
              {o.label}
            </button>
          ))}
      </div>
    </div>
  );
}

/** Поиск по подписи, имени и пояснению. */
export function useFilter(q: string) {
  const ql = q.trim().toLowerCase();
  return useMemo(() => (...texts: (string | undefined)[]) => !ql || texts.some((t) => t?.toLowerCase().includes(ql)), [ql]);
}
