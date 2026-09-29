// Настройки: «Оформление» (стиль, тема, цвет), «Текст и форма», «Анимации».
import { useState } from 'react';
import { updateSettings, useData } from '../store';
import { BACKGROUNDS, DEFAULT_ACCENT, DEFAULT_LOOK, FONTS, HEAD_FONTS, presetFor, STYLES, THEMES, type Palette, type ThemePreset } from '../themes';
import type { Look, MotionKind, MotionLevel } from '../types';
import { Collapse, ColorPicker, Segmented, Switch } from './ui';
import { Group, PaneHead, SRow } from './SettingsKit';

const ACCENTS = ['#4C5BD4', '#3F51D8', '#1F7A6B', '#B4452F', '#6B3FC4', '#2A5BB8', '#3A3F4E', '#C2417A', '#2F8F5B', '#A4591A', '#0E8FA3'];

function ThemeCard({ t, on, onPick }: { t: ThemePreset; on: boolean; onPick: () => void }) {
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

function StyleCard({ st, on, onPick, dark }: { st: (typeof STYLES)[number]; on: boolean; onPick: () => void; dark: boolean }) {
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

export function LookPane({ dark }: { dark: boolean }) {
  const data = useData();
  const s = data.settings;
  const look = s.look;
  const [which, setWhich] = useState<'light' | 'dark'>(dark ? 'dark' : 'light');
  return (
    <div className="stack gap16">
      <PaneHead title="Оформление" text="Как выглядит Мнема. Всё меняется сразу — можно пробовать." />
      <Group title="Стиль" id="style">
        <div className="style-grid">
          {STYLES.map((st) => (
            <StyleCard key={st.id} st={st} dark={dark} on={(look.style ?? 'modern') === st.id} onPick={() => updateSettings({ look: { ...look, ...st.look }, accent: st.accent })} />
          ))}
        </div>
      </Group>
      <Group title="Тема" id="theme">
        <SRow label="Светлая или тёмная">
          <div className="ctl-seg">
            <Segmented
              ariaLabel="Тема оформления"
              value={s.theme}
              onChange={(v) => {
                updateSettings({ theme: v });
                if (v !== 'system') setWhich(v);
              }}
              options={[
                { value: 'light', label: 'Светлая' },
                { value: 'dark', label: 'Тёмная' },
                { value: 'system', label: 'Как в системе' }
              ]}
            />
          </div>
        </SRow>
        <div className="srow stack-row">
          <div className="row between gap8 wrap">
            <span className="srow-label">Цвета</span>
            {s.theme === 'system' && (
              <div className="ctl-seg small-seg">
                <Segmented
                  ariaLabel="Какие темы показать"
                  value={which}
                  onChange={setWhich}
                  options={[
                    { value: 'light', label: 'Светлые' },
                    { value: 'dark', label: 'Тёмные' }
                  ]}
                />
              </div>
            )}
          </div>
          <div className="theme-grid" key={which}>
            {THEMES.filter((t) => t.dark === (s.theme === 'system' ? which === 'dark' : dark)).map((t) => {
              const isDark = t.dark;
              const on = (isDark ? look.dark : look.light) === t.id;
              return <ThemeCard key={t.id} t={t} on={on} onPick={() => updateSettings({ look: { ...look, [isDark ? 'dark' : 'light']: t.id }, ...(isDark === dark ? { accent: t.accent } : {}) })} />;
            })}
          </div>
        </div>
        <div className="srow stack-row" data-set="accent">
          <span className="srow-label">Главный цвет</span>
          <ColorPicker value={s.accent} onChange={(c) => updateSettings({ accent: c })} colors={ACCENTS} />
        </div>
      </Group>
    </div>
  );
}

const COLOR_LABELS: [keyof Palette, string][] = [
  ['bg', 'Фон'],
  ['side', 'Левая панель'],
  ['surface', 'Карточки и окна'],
  ['ink', 'Текст'],
  ['muted', 'Серый текст'],
  ['line', 'Линии']
];

export function TextPane({ dark }: { dark: boolean }) {
  const data = useData();
  const s = data.settings;
  const look = s.look;
  const [colorsOpen, setColorsOpen] = useState(false);
  const [editDark, setEditDark] = useState(dark);
  const setLook = (patch: Partial<Look>) => updateSettings({ look: { ...look, ...patch } });
  const mode = editDark ? 'dark' : 'light';
  const custom = look.custom[mode] ?? {};
  const base = presetFor(look, editDark);
  return (
    <div className="stack gap16">
      <PaneHead title="Текст и форма" text="Шрифт, размер, углы, фон и свои цвета." />
      <Group title="Текст" id="font">
        <div className="srow stack-row">
          <span className="srow-label">Шрифт</span>
          <div className="look-row">
            {FONTS.map((f) => (
              <button key={f.id} type="button" className={'look-chip' + (look.font === f.id ? ' on' : '')} style={{ fontFamily: f.css }} onClick={() => (f.load?.(), setLook({ font: f.id }))}>
                {f.name}
              </button>
            ))}
          </div>
        </div>
        <SRow label="Заголовки" id="headfont">
          <div className="ctl-seg">
            <Segmented ariaLabel="Шрифт заголовков" value={look.headFont} onChange={(v) => setLook({ headFont: v })} options={HEAD_FONTS.map((f) => ({ value: f.id as Look['headFont'], label: f.id === 'literata' ? 'Книжный' : 'Как текст' }))} />
          </div>
        </SRow>
        <SRow label="Размер текста" hint={`${Math.round(s.fontScale * 100)}%`} id="fontsize">
          <input type="range" min={0.9} max={1.3} step={0.05} value={s.fontScale} onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })} aria-label="Размер текста" />
        </SRow>
      </Group>
      <Group title="Форма" id="shape">
        <SRow label="Углы">
          <div className="ctl-seg">
            <Segmented
              ariaLabel="Углы"
              value={look.radius}
              onChange={(v) => setLook({ radius: v })}
              options={[
                { value: 'sharp', label: 'Острые' },
                { value: 'normal', label: 'Обычные' },
                { value: 'round', label: 'Круглые' }
              ]}
            />
          </div>
        </SRow>
        <SRow label="Плотность" hint="Сколько воздуха между блоками" id="density">
          <div className="ctl-seg">
            <Segmented
              ariaLabel="Плотность"
              value={s.density}
              onChange={(v) => updateSettings({ density: v })}
              options={[
                { value: 'compact', label: 'Плотно' },
                { value: 'normal', label: 'Обычно' },
                { value: 'comfy', label: 'Просторно' }
              ]}
            />
          </div>
        </SRow>
        <div className="srow stack-row" data-set="background">
          <span className="srow-label">Фон</span>
          <div className="look-row">
            {BACKGROUNDS.map((b) => (
              <button key={b.id} type="button" className={'look-chip' + (look.background === b.id ? ' on' : '')} onClick={() => setLook({ background: b.id })}>
                <span className={'bg-sample ' + b.id} />
                {b.name}
              </button>
            ))}
          </div>
        </div>
      </Group>
      <Group id="colors">
        <button className="srow srow-btn" aria-expanded={colorsOpen} onClick={() => setColorsOpen(!colorsOpen)}>
          <span className="srow-text">
            <span className="srow-label">Свои цвета</span>
            <span className="srow-hint">Фон, панель, текст — поверх выбранной темы</span>
          </span>
          <span className={'chev' + (colorsOpen ? ' open' : '')}>›</span>
        </button>
        <Collapse open={colorsOpen}>
          <div className="srow stack-row">
            <div className="ctl-seg small-seg">
              <Segmented
                ariaLabel="Для какой темы"
                value={mode}
                onChange={(v) => setEditDark(v === 'dark')}
                options={[
                  { value: 'light', label: 'Для светлой' },
                  { value: 'dark', label: 'Для тёмной' }
                ]}
              />
            </div>
            <div className="color-inputs">
              {COLOR_LABELS.map(([k, label]) => (
                <label key={k}>
                  <input type="color" value={custom[k] || base.p[k]} onChange={(e) => setLook({ custom: { ...look.custom, [mode]: { ...custom, [k]: e.target.value } } })} aria-label={label} />
                  <span className={custom[k] ? '' : 'muted'}>{label}</span>
                </label>
              ))}
            </div>
            <div className="row gap8 wrap">
              <button className="btn small" disabled={!Object.keys(custom).length} onClick={() => setLook({ custom: { ...look.custom, [mode]: {} } })}>
                Вернуть цвета темы
              </button>
              <button className="btn small ghost" onClick={() => updateSettings({ look: { ...DEFAULT_LOOK, custom: {} }, accent: DEFAULT_ACCENT, density: 'normal', fontScale: 1 })}>
                Сбросить всё оформление
              </button>
            </div>
          </div>
        </Collapse>
      </Group>
    </div>
  );
}

const KIND_LABELS: [MotionKind, string, string][] = [
  ['screens', 'Переходы между экранами', 'Экран плавно появляется'],
  ['windows', 'Окна и меню', 'Появляются и исчезают плавно'],
  ['expand', 'Раскрытие блоков', 'Списки и разделы раскрываются плавно'],
  ['text', 'Смена текста и чисел', 'Числа докручиваются'],
  ['review', 'Карточки при повторении', 'Карточка выезжает, ответ открывается'],
  ['hover', 'Мелкие эффекты', 'Кнопки чуть приподнимаются, растения качаются']
];

export function MotionPane() {
  const data = useData();
  const s = data.settings;
  const offNow: MotionKind[] = s.motion === 'off' ? KIND_LABELS.map((k) => k[0]) : s.motion === 'essential' ? ['screens', 'text', 'hover'] : s.motion === 'custom' ? s.motionOff : [];
  const toggle = (k: MotionKind, on: boolean) => {
    const next = on ? offNow.filter((x) => x !== k) : [...offNow, k];
    const level: MotionLevel = next.length === 0 ? 'all' : next.length === KIND_LABELS.length ? 'off' : 'custom';
    updateSettings({ motion: level, motionOff: next });
  };
  return (
    <div className="stack gap16">
      <PaneHead title="Анимации" text="Плавные движения помогают понять, что изменилось. Если отвлекают или компьютер медленный — выключи." />
      <Group>
        <div className="srow stack-row" data-set="motion">
          <div className="ctl-seg full">
            <Segmented
              ariaLabel="Анимации"
              value={s.motion}
              onChange={(v) => updateSettings({ motion: v })}
              options={[
                { value: 'all', label: 'Все' },
                { value: 'essential', label: 'Важные' },
                { value: 'off', label: 'Нет' },
                { value: 'custom', label: 'Свои' }
              ]}
            />
          </div>
        </div>
      </Group>
      <Group title="Какие именно">
        {KIND_LABELS.map(([k, label, hint]) => (
          <SRow key={k} label={label} hint={hint} id={'motion-' + k}>
            <Switch label={label} checked={!offNow.includes(k)} onChange={(v) => toggle(k, v)} />
          </SRow>
        ))}
      </Group>
    </div>
  );
}
