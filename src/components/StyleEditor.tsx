// Редактор стилей: справа от настоящего интерфейса, чтобы изменения были видны сразу. Если закрыть без сохранения — всё откатывается.
// Вкладки: «Конструктор» (без кода), «Код» (CSS и подсказки), «Настройки» (что сможет менять человек), «Справка» (все переменные и классы).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_CSS, sanitizeCss } from '../safeCss';
import { downloadFile } from '../share';
import { getData, updateSettings } from '../store';
import { API_CLASSES, API_PARTS, API_ROOT_ATTRS, API_VARS } from '../styleApi';
import { setStylePreview } from '../styleApply';
import { getDensity, getRadius, getVar, MONO_CSS, setAccent, setAttr, setDensity, setFont, setRadius, setVar, type Density, type Mode } from '../styleBuilder';
import { cleanMod, cleanSetting, STYLE_ATTRS, STYLE_EXT, styleToFile } from '../styleSystem';
import { FONTS } from '../themes';
import type { Mod, StyleSetting, StyleSettingType, StyleValue } from '../types';
import { StyleSettingsPanel } from './StyleSettingsPanel';
import { Icon, Segmented, toast } from './ui';
import '../styleEditor.css';

type Tab = 'build' | 'code' | 'settings' | 'help';

export const newStyleId = () => 'm-' + Math.random().toString(36).slice(2, 9);

/** Пустой стиль для «Создать». */
export const blankStyle = (): Mod => ({ id: newStyleId(), name: 'Мой стиль', description: '', icon: '🎨', where: 'свой', css: '' });

/** «Создать на основе»: копия любого стиля под новым именем. */
export function cloneStyle(m: Mod): Mod {
  return JSON.parse(JSON.stringify({ ...m, id: newStyleId(), name: `${m.name} (мой)`.slice(0, 50), where: 'свой', author: undefined })) as Mod;
}

const ATTR_NAMES = Object.keys(STYLE_ATTRS);

/** Одна строка конструктора: подпись и кнопки-варианты; «как было» убирает атрибут. */
function AttrRow({ name, m, set }: { name: string; m: Mod; set: (m: Mod) => void }) {
  const def = STYLE_ATTRS[name];
  const cur = m.attrs?.[name];
  return (
    <div className="se-row">
      <div className="se-row-text">
        <span className="se-row-label">{def.label}</span>
        <span className="small muted">{def.doc}</span>
      </div>
      <div className="se-chips" role="radiogroup" aria-label={def.label}>
        <button type="button" role="radio" aria-checked={cur === undefined} className={'se-chip' + (cur === undefined ? ' on' : '')} onClick={() => set(setAttr(m, name, undefined))}>
          Не менять
        </button>
        {def.options
          .filter((o) => o.value !== def.default || name === 'anim')
          .map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={cur === o.value} className={'se-chip' + (cur === o.value ? ' on' : '')} onClick={() => set(setAttr(m, name, o.value))}>
              {o.label}
            </button>
          ))}
      </div>
    </div>
  );
}

function ColorRow({ label, name, m, set, accent = false }: { label: string; name: string; m: Mod; set: (m: Mod) => void; accent?: boolean }) {
  const one = (mode: Mode) => {
    const v = getVar(m, mode, name);
    const apply = (c: string | undefined) => set(accent ? setAccent(m, mode, c) : setVar(m, mode, name, c));
    return (
      <span className="se-color-cell">
        <span className="small muted">{mode === 'light' ? 'Светлая' : 'Тёмная'}</span>
        <input type="color" className="se-color" aria-label={`${label}, ${mode === 'light' ? 'светлая' : 'тёмная'} тема`} value={/^#[0-9a-f]{6}$/i.test(v ?? '') ? v : '#888888'} style={v ? undefined : { opacity: 0.35 }} onChange={(e) => apply(e.target.value)} />
        {v && (
          <button type="button" className="link-btn small" onClick={() => apply(undefined)} title="Не менять">
            ×
          </button>
        )}
      </span>
    );
  };
  return (
    <div className="se-row">
      <div className="se-row-text">
        <span className="se-row-label">{label}</span>
      </div>
      <div className="se-colors">
        {one('light')}
        {one('dark')}
      </div>
    </div>
  );
}

const FONT_CHOICES = [...FONTS.map((f) => ({ id: f.id, label: f.name, css: f.css })), { id: '', label: 'Моноширинный', css: MONO_CSS }];

function FontRow({ label, which, m, set }: { label: string; which: 'body' | 'display'; m: Mod; set: (m: Mod) => void }) {
  const cur = getVar(m, 'light', which === 'body' ? '--body' : '--display');
  return (
    <div className="se-row">
      <div className="se-row-text">
        <span className="se-row-label">{label}</span>
      </div>
      <select
        className="input se-select"
        aria-label={label}
        value={cur ?? ''}
        onChange={(e) => {
          const c = FONT_CHOICES.find((f) => f.css === e.target.value);
          if (c?.id) void FONTS.find((f) => f.id === c.id)?.load?.();
          set(setFont(m, which, c?.css, c?.id || undefined));
        }}
      >
        <option value="">Не менять</option>
        {FONT_CHOICES.map((f) => (
          <option key={f.label} value={f.css}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SizeRow({ label, name, m, set, min, max, step, unit }: { label: string; name: string; m: Mod; set: (m: Mod) => void; min: number; max: number; step: number; unit: string }) {
  const v = getVar(m, 'light', name);
  const n = v ? parseFloat(v) : NaN;
  return (
    <div className="se-row">
      <div className="se-row-text">
        <span className="se-row-label">{label}</span>
      </div>
      <span className="row gap8 se-slider">
        <input type="range" aria-label={label} min={min} max={max} step={step} value={Number.isFinite(n) ? n : min} style={Number.isFinite(n) ? undefined : { opacity: 0.4 }} onChange={(e) => set(setVar(m, 'light', name, e.target.value + unit))} />
        <span className="small se-val">{Number.isFinite(n) ? n + unit : 'как есть'}</span>
        {Number.isFinite(n) && (
          <button type="button" className="link-btn small" onClick={() => set(setVar(m, 'light', name, undefined))}>
            ×
          </button>
        )}
      </span>
    </div>
  );
}

function Builder({ m, set }: { m: Mod; set: (m: Mod) => void }) {
  const radius = getRadius(m);
  return (
    <div className="se-pane">
      <h4 className="se-h">Раскладка</h4>
      {['sidebar', 'content', 'topics', 'tabs'].map((n) => (
        <AttrRow key={n} name={n} m={m} set={set} />
      ))}
      <h4 className="se-h">Карточки и кнопки</h4>
      {['cards', 'grades'].map((n) => (
        <AttrRow key={n} name={n} m={m} set={set} />
      ))}
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Плотность</span>
          <span className="small muted">Размер отступов, кнопок и строк.</span>
        </div>
        <Segmented<Density>
          ariaLabel="Плотность"
          value={getDensity(m)}
          options={[
            { value: 'compact', label: 'Компакт' },
            { value: 'default', label: 'Обычная' },
            { value: 'comfy', label: 'Просторно' }
          ]}
          onChange={(d) => set(setDensity(m, d))}
        />
      </div>
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Скругление углов</span>
          <span className="small muted">От острых до круглых — сразу у всех кнопок, карточек и окон.</span>
        </div>
        <span className="row gap8 se-slider">
          <input type="range" aria-label="Скругление углов" min={0} max={32} step={1} value={radius ?? 16} style={radius === null ? { opacity: 0.4 } : undefined} onChange={(e) => set(setRadius(m, Number(e.target.value)))} />
          <span className="small se-val">{radius === null ? 'как есть' : radius + 'px'}</span>
          {radius !== null && (
            <button type="button" className="link-btn small" onClick={() => set(setRadius(m, null))}>
              ×
            </button>
          )}
        </span>
      </div>
      <h4 className="se-h">Шрифты и текст</h4>
      <FontRow label="Шрифт текста" which="body" m={m} set={set} />
      <FontRow label="Шрифт заголовков" which="display" m={m} set={set} />
      <SizeRow label="Размер текста конспекта" name="--rf-note-size" m={m} set={set} min={0.85} max={1.6} step={0.01} unit="rem" />
      <SizeRow label="Размер вопроса" name="--rf-question-size" m={m} set={set} min={1.1} max={3} step={0.05} unit="rem" />
      <h4 className="se-h">Цвета</h4>
      <ColorRow label="Главный цвет" name="--accent" m={m} set={set} accent />
      <ColorRow label="Фон окна" name="--bg" m={m} set={set} />
      <ColorRow label="Фон карточек" name="--surface" m={m} set={set} />
      <ColorRow label="Фон боковой панели" name="--side" m={m} set={set} />
      <ColorRow label="Цвет текста" name="--ink" m={m} set={set} />
      <h4 className="se-h">Движение</h4>
      <AttrRow name="anim" m={m} set={set} />
      <p className="small muted">Хочется большего? Вкладка «Код» — любой CSS, а «Настройки» — свои ползунки и переключатели для тех, кто будет пользоваться стилем.</p>
    </div>
  );
}

/** Вставка текста в поле на месте курсора. */
function insertAt(el: HTMLTextAreaElement | null, text: string, value: string, set: (v: string) => void) {
  if (!el) return set(value + text);
  const a = el.selectionStart ?? value.length;
  const b = el.selectionEnd ?? a;
  set(value.slice(0, a) + text + value.slice(b));
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = el.selectionEnd = a + text.length;
  });
}

function CodePane({ m, set }: { m: Mod; set: (m: Mod) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [q, setQ] = useState('');
  const css = m.css ?? '';
  const cut = css.trim() && sanitizeCss(css) !== css;
  const ql = q.trim().toLowerCase();
  const vars = API_VARS.flatMap((g) => g.vars).filter((v) => !ql || v.name.includes(ql) || v.doc.toLowerCase().includes(ql));
  const classes = API_CLASSES.filter((c) => !ql || c.name.includes(ql) || c.doc.toLowerCase().includes(ql));
  const put = (t: string) => insertAt(ref.current, t, css, (v) => set({ ...m, css: v }));
  return (
    <div className="se-pane">
      <textarea
        ref={ref}
        className="input css-area se-code"
        spellCheck={false}
        aria-label="CSS стиля"
        value={css}
        onChange={(e) => set({ ...m, css: e.target.value })}
        placeholder={"/* Меняется сразу на настоящем интерфейсе */\n.hero { background: linear-gradient(135deg, var(--accent), #C2417A); }\n:root[data-theme='dark'] .card { border-color: var(--accent); }"}
      />
      <div className="row between small muted">
        <span>
          {css.length.toLocaleString('ru-RU')} из {MAX_CSS.toLocaleString('ru-RU')} знаков
        </span>
        {cut && <span className="se-warn">Часть CSS отброшена: ссылки в интернет, @import и скрипты не работают</span>}
      </div>
      <input className="input" placeholder="Найти переменную или класс…" aria-label="Поиск подсказок" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="se-hints">
        <span className="small muted">Переменные — нажми, чтобы вставить</span>
        <div className="se-chips wrap">
          {vars.slice(0, 40).map((v) => (
            <button key={v.name} type="button" className="se-chip code" title={v.doc + (v.def ? ` (по умолчанию ${v.def})` : '')} onClick={() => put(`var(${v.name})`)}>
              {v.name}
            </button>
          ))}
        </div>
        <span className="small muted">Классы — вставляют готовое правило</span>
        <div className="se-chips wrap">
          {classes.map((c) => (
            <button key={c.name} type="button" className="se-chip code" title={c.doc} onClick={() => put(`\n${c.name} {\n  \n}\n`)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const TEMPLATES: Record<StyleSettingType, () => Partial<StyleSetting>> = {
  color: () => ({ type: 'color', label: 'Цвет', var: '--my-color', default: '#3F51D8' }),
  slider: () => ({ type: 'slider', label: 'Размер', var: '--my-size', min: 0, max: 40, step: 1, unit: 'px', default: 16 }),
  select: () => ({ type: 'select', label: 'Вид', var: '--my-value', default: '8px', options: [{ value: '4px', label: 'Мелко' }, { value: '8px', label: 'Средне' }, { value: '16px', label: 'Крупно' }] }),
  toggle: () => ({ type: 'toggle', label: 'Включить', attr: 'my-option', default: true }),
  text: () => ({ type: 'text', label: 'Значение', var: '--my-text', default: '1px' }),
  font: () => ({ type: 'font', label: 'Шрифт', var: '--my-font', default: "Georgia, serif" })
};
const TYPE_LABEL: Record<StyleSettingType, string> = { color: 'Цвет', slider: 'Ползунок', select: 'Список', toggle: 'Переключатель', text: 'Текст', font: 'Шрифт' };

function SettingEditor({ s, onChange, onDelete }: { s: Partial<StyleSetting>; onChange: (s: Partial<StyleSetting>) => void; onDelete: () => void }) {
  const ok = cleanSetting(s);
  const num = (k: 'min' | 'max' | 'step', label: string) => (
    <label className="se-mini">
      <span>{label}</span>
      <input className="input" type="number" value={s[k] ?? ''} onChange={(e) => onChange({ ...s, [k]: e.target.value === '' ? undefined : Number(e.target.value) })} />
    </label>
  );
  return (
    <div className={'se-setting-ed' + (ok ? '' : ' bad')}>
      <div className="row gap8 wrap">
        <label className="se-mini grow">
          <span>Подпись</span>
          <input className="input" value={s.label ?? ''} maxLength={60} onChange={(e) => onChange({ ...s, label: e.target.value })} />
        </label>
        <label className="se-mini">
          <span>Код (id)</span>
          <input className="input" value={s.id ?? ''} maxLength={31} onChange={(e) => onChange({ ...s, id: e.target.value.toLowerCase() })} />
        </label>
        <button type="button" className="icon-btn small" aria-label="Удалить настройку" onClick={onDelete}>
          <Icon name="trash" size={16} />
        </button>
      </div>
      <div className="row gap8 wrap">
        {(s.type === 'select' || s.type === 'toggle') && (
          <label className="se-mini">
            <span>Атрибут</span>
            <input className="input" list="se-attrs" placeholder="sidebar, my-option…" value={s.attr ?? ''} onChange={(e) => onChange({ ...s, attr: e.target.value || undefined, var: e.target.value ? undefined : s.var })} />
          </label>
        )}
        <label className="se-mini">
          <span>Переменная</span>
          <input className="input" placeholder="--my-var" value={s.var ?? ''} onChange={(e) => onChange({ ...s, var: e.target.value || undefined, attr: e.target.value && (s.type === 'select' || s.type === 'toggle') ? undefined : s.attr })} />
        </label>
        {s.type === 'slider' && (
          <>
            {num('min', 'От')}
            {num('max', 'До')}
            {num('step', 'Шаг')}
            <label className="se-mini">
              <span>Единица</span>
              <select className="input" value={s.unit ?? ''} onChange={(e) => onChange({ ...s, unit: e.target.value })}>
                {['', 'px', 'rem', 'em', '%', 'ms', 's', 'deg', 'vw', 'vh'].map((u) => (
                  <option key={u} value={u}>
                    {u || '—'}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {s.type === 'toggle' && (
          <>
            <label className="se-mini">
              <span>Значение «вкл»</span>
              <input className="input" value={s.on ?? ''} onChange={(e) => onChange({ ...s, on: e.target.value || undefined })} />
            </label>
            <label className="se-mini">
              <span>Значение «выкл»</span>
              <input className="input" value={s.off ?? ''} onChange={(e) => onChange({ ...s, off: e.target.value || undefined })} />
            </label>
          </>
        )}
        {s.type === 'toggle' ? (
          <label className="se-mini row gap8">
            <input type="checkbox" checked={s.default === true} onChange={(e) => onChange({ ...s, default: e.target.checked })} /> <span>Включено по умолчанию</span>
          </label>
        ) : s.type !== 'select' ? (
          <label className="se-mini">
            <span>По умолчанию</span>
            <input className="input" value={String(s.default ?? '')} onChange={(e) => onChange({ ...s, default: s.type === 'slider' ? Number(e.target.value) : e.target.value })} />
          </label>
        ) : null}
        {s.type === 'color' && (
          <label className="se-mini">
            <span>В тёмной теме</span>
            <input className="input" placeholder="#RRGGBB" value={s.defaultDark ?? ''} onChange={(e) => onChange({ ...s, defaultDark: e.target.value || undefined })} />
          </label>
        )}
      </div>
      {s.type === 'select' && (
        <label className="se-mini">
          <span>Варианты — по строке: значение|подпись. Первый — по умолчанию</span>
          <textarea
            className="input se-opts"
            rows={3}
            defaultValue={(s.options ?? []).map((o) => `${o.value}|${o.label}`).join('\n')}
            onChange={(e) => {
              const options = e.target.value
                .split('\n')
                .map((l) => l.split('|'))
                .filter((p) => p[0]?.trim() && p[1]?.trim())
                .map((p) => ({ value: p[0].trim(), label: p[1].trim() }));
              onChange({ ...s, options, default: options.some((o) => o.value === s.default) ? s.default : options[0]?.value });
            }}
          />
        </label>
      )}
      {!ok && <span className="se-warn small">Настройка заполнена неверно — она не сохранится (проверь переменную вида --имя, значения и варианты).</span>}
    </div>
  );
}

function SettingsPane({ m, set, values, setValue }: { m: Mod; set: (m: Mod) => void; values: Record<string, StyleValue>; setValue: (id: string, v: StyleValue | undefined) => void }) {
  const list = (m.settings ?? []) as Partial<StyleSetting>[];
  const upd = (i: number, s: Partial<StyleSetting>) => set({ ...m, settings: list.map((x, k) => (k === i ? s : x)) as StyleSetting[] });
  const used = new Set(list.map((s) => s.id));
  const add = (t: StyleSettingType) => {
    let n = 1;
    while (used.has(t + n)) n++;
    set({ ...m, settings: [...list, { id: t + n, ...TEMPLATES[t]() }] as StyleSetting[] });
  };
  return (
    <div className="se-pane">
      <p className="small muted">Здесь описывается, что сможет менять тот, кто включит стиль: цвета, ползунки, переключатели. Каждая настройка подставляется в CSS-переменную (<code>var(--имя)</code> в твоём CSS) или в атрибут <code>:root[data-st-имя='значение']</code>.</p>
      <datalist id="se-attrs">
        {ATTR_NAMES.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      {list.map((s, i) => (
        <SettingEditor key={i} s={s} onChange={(x) => upd(i, x)} onDelete={() => set({ ...m, settings: list.filter((_, k) => k !== i) as StyleSetting[] })} />
      ))}
      <div className="se-chips wrap">
        {(Object.keys(TEMPLATES) as StyleSettingType[]).map((t) => (
          <button key={t} type="button" className="se-chip" onClick={() => add(t)}>
            + {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {(m.settings?.length ?? 0) > 0 && (
        <>
          <h4 className="se-h">Так это увидит человек</h4>
          <StyleSettingsPanel mod={{ ...m, settings: (m.settings ?? []).map((s) => cleanSetting(s)).filter((s): s is StyleSetting => s !== null) }} values={values} onChange={setValue} />
        </>
      )}
    </div>
  );
}

function HelpPane() {
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const hit = (a: string, b: string) => !ql || a.toLowerCase().includes(ql) || b.toLowerCase().includes(ql);
  return (
    <div className="se-pane se-help">
      <input className="input" placeholder="Найти в справке…" aria-label="Поиск по справке" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="small muted">
        Стиль — это только оформление: CSS и настройки вида, программ в нём нет. Файл — <code>{STYLE_EXT}</code> (обычный JSON). Включить можно несколько стилей: тот, что ниже в списке, перекрывает верхние. Тёмная тема: <code>:root[data-theme='dark'] …</code>. Переменные из конструктора записываются с <code>!important</code>, чтобы перекрыть тему.
      </p>
      <h4 className="se-h">Атрибуты раскладки</h4>
      {Object.entries(STYLE_ATTRS)
        .filter(([k, d]) => hit(k, d.doc))
        .map(([k, d]) => (
          <p key={k} className="se-doc">
            <code>:root[data-ui-{k}='…']</code> — {d.doc} Значения: {d.options.map((o) => o.value).join(', ')} (по умолчанию {d.default}).
          </p>
        ))}
      {API_VARS.map((g) => {
        const vars = g.vars.filter((v) => hit(v.name, v.doc));
        return vars.length ? (
          <div key={g.id}>
            <h4 className="se-h">{g.title}</h4>
            {vars.map((v) => (
              <p key={v.name} className="se-doc">
                <code>{v.name}</code> — {v.doc} {v.def && <span className="muted">По умолчанию: {v.def}</span>}
              </p>
            ))}
          </div>
        ) : null;
      })}
      <h4 className="se-h">Классы</h4>
      {API_CLASSES.filter((c) => hit(c.name, c.doc)).map((c) => (
        <p key={c.name} className="se-doc">
          <code>{c.name}</code> — {c.doc}
        </p>
      ))}
      <h4 className="se-h">Метки частей</h4>
      {API_PARTS.filter((p) => hit(p.name, p.doc)).map((p) => (
        <p key={p.name} className="se-doc">
          <code>[data-part='{p.name}']</code> — {p.doc}
        </p>
      ))}
      <h4 className="se-h">Атрибуты на корне</h4>
      {API_ROOT_ATTRS.filter((p) => hit(p.name, p.doc)).map((p) => (
        <p key={p.name} className="se-doc">
          <code>{p.name}</code> — {p.doc}
        </p>
      ))}
    </div>
  );
}

export function StyleEditor({ initial, isNew, onClose }: { initial: Mod; isNew: boolean; onClose: () => void }) {
  const [m, setM] = useState<Mod>(initial);
  const [values, setValues] = useState<Record<string, StyleValue>>(() => ({ ...(getData().settings.styleValues[initial.id] ?? {}) }));
  const [tab, setTab] = useState<Tab>('build');
  const [asking, setAsking] = useState(false);
  const start = useRef(JSON.stringify([initial, values]));
  const dirty = useMemo(() => JSON.stringify([m, values]) !== start.current, [m, values]);

  // Живой предпросмотр на настоящем интерфейсе; закрыли — откат.
  useEffect(() => {
    const t = setTimeout(() => setStylePreview({ mod: cleanMod(m, m.id) ?? m, values }), 90);
    return () => clearTimeout(t);
  }, [m, values]);
  useEffect(() => () => setStylePreview(null), []);
  useEffect(() => {
    if (m.font) void FONTS.find((f) => f.id === m.font)?.load?.();
  }, [m.font]);

  const close = () => (dirty && !asking ? setAsking(true) : onClose());
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal-back') && close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });

  function save(enable: boolean) {
    const clean = cleanMod(m, m.id, initial.where ?? 'свой');
    if (!clean) return toast('Дай стилю название');
    const s = getData().settings;
    const exists = s.customMods.some((x) => x.id === clean.id);
    const customMods = exists ? s.customMods.map((x) => (x.id === clean.id ? clean : x)) : [...s.customMods, clean];
    const modsOn = enable && !s.modsOn.includes(clean.id) ? [...s.modsOn, clean.id] : s.modsOn;
    updateSettings({ customMods, modsOn, styleValues: { ...s.styleValues, [clean.id]: values } });
    start.current = JSON.stringify([m, values]);
    setStylePreview(null);
    toast(`Стиль «${clean.name}» сохранён`);
    onClose();
  }
  function exportFile() {
    const clean = cleanMod(m, m.id);
    if (!clean) return toast('Дай стилю название');
    downloadFile(clean.name + STYLE_EXT, styleToFile(clean));
  }

  return createPortal(
    <aside className="style-editor" role="dialog" aria-label="Редактор стиля">
      <header className="se-head">
        <span className="se-icon">{m.icon ?? '🎨'}</span>
        <div className="grow stack gap4">
          <input className="se-title" aria-label="Название стиля" value={m.name} maxLength={50} onChange={(e) => setM({ ...m, name: e.target.value })} />
          <input className="se-sub" aria-label="Описание" placeholder="Коротко: что меняет" value={m.description} maxLength={240} onChange={(e) => setM({ ...m, description: e.target.value })} />
        </div>
        <button className="icon-btn" aria-label="Закрыть редактор" onClick={close}>
          <Icon name="x" />
        </button>
      </header>
      <div className="row gap8 se-meta">
        <label className="se-mini">
          <span>Значок</span>
          <input className="input se-ico-in" value={m.icon ?? ''} maxLength={4} onChange={(e) => setM({ ...m, icon: e.target.value })} />
        </label>
        <label className="se-mini grow">
          <span>Автор</span>
          <input className="input" value={m.author ?? ''} maxLength={40} onChange={(e) => setM({ ...m, author: e.target.value || undefined })} />
        </label>
        <label className="se-mini">
          <span>Версия</span>
          <input className="input se-ver" value={m.version ?? ''} maxLength={20} placeholder="1.0" onChange={(e) => setM({ ...m, version: e.target.value || undefined })} />
        </label>
      </div>
      <Segmented<Tab>
        ariaLabel="Раздел редактора"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'build', label: 'Конструктор' },
          { value: 'code', label: 'Код' },
          { value: 'settings', label: 'Настройки' },
          { value: 'help', label: 'Справка' }
        ]}
      />
      <div className="se-body">
        {tab === 'build' && <Builder m={m} set={setM} />}
        {tab === 'code' && <CodePane m={m} set={setM} />}
        {tab === 'settings' && <SettingsPane m={m} set={setM} values={values} setValue={(id, v) => setValues((o) => { const n = { ...o }; if (v === undefined) delete n[id]; else n[id] = v; return n; })} />}
        {tab === 'help' && <HelpPane />}
      </div>
      <footer className="se-foot">
        {asking ? (
          <>
            <span className="small grow">Закрыть без сохранения? Всё вернётся как было.</span>
            <button className="btn small" onClick={() => setAsking(false)}>
              Продолжить
            </button>
            <button className="btn small danger" onClick={onClose}>
              Закрыть
            </button>
          </>
        ) : (
          <>
            <button className="btn small ghost" onClick={() => (setM(initial), setValues({ ...(getData().settings.styleValues[initial.id] ?? {}) }))} disabled={!dirty} title="Вернуть стиль таким, каким он был при открытии">
              Сбросить
            </button>
            <button className="btn small ghost" onClick={exportFile} title={`Сохранить файл ${STYLE_EXT}`}>
              <Icon name="share" size={15} /> Файл
            </button>
            <span className="grow" />
            <button className="btn small" onClick={close}>
              Отмена
            </button>
            <button className="btn small" onClick={() => save(false)} disabled={!m.name.trim()}>
              Сохранить
            </button>
            <button className="btn small primary" onClick={() => save(true)} disabled={!m.name.trim()}>
              {isNew ? 'Создать и включить' : 'Сохранить и включить'}
            </button>
          </>
        )}
      </footer>
    </aside>,
    document.body
  );
}
