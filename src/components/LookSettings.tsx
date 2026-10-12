// Настройки → «Оформление»: ОДИН раздел. Стиль — это всё оформление сразу: галерея стилей сверху (встроенные виды, каталог, свои, «Создать с ИИ»),
// ниже «Настроить текущий» (тема, цвета, шрифты, углы, плотность, фон-картинка, анимации, свой CSS). Старые разделы «Текст и форма»,
// «Анимации» и «Стили» переехали сюда же. Все правки сразу видны на настоящем интерфейсе.
import { useState } from 'react';
import { updateSettings, useData } from '../store';
import { BACKGROUNDS, FONTS, HEAD_FONTS, presetFor, THEMES, type ThemePreset } from '../themes';
import type { BgImage, Look, SettingsSection } from '../types';
import { Icon, ColorPicker, Segmented } from './ui';
import { Group, PaneHead, SRow } from './SettingsKit';
import { ACCENTS, ThemeCard } from './ThemeCards';
import { BgImageEditor } from './BgImageEditor';
import { MotionGroups } from './MotionSettings';
import { Snippets } from './Snippets';
import { StylesGallery } from './ModsSettings';
import { StyleEditor } from './StyleEditor';

export function LookPane({ dark, onGo }: { dark: boolean; onGo?: (section: SettingsSection) => void }) {
  const data = useData();
  const s = data.settings;
  const look = s.look;
  const [which, setWhich] = useState<'light' | 'dark'>(dark ? 'dark' : 'light');
  const [editing, setEditing] = useState(false);
  const setLook = (patch: Partial<Look>) => updateSettings({ look: { ...look, ...patch } });
  return (
    <div className="stack gap16">
      <PaneHead title="Оформление" text="Стиль — это всё оформление сразу: цвета, шрифты, углы, фон. Выбери готовый, сделай свой или попроси ИИ. Всё меняется сразу — можно пробовать." />
      <Group title="Светлая или тёмная" id="theme">
        <SRow label="Тема">
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
      </Group>
      <Group title="Стили" id="style" hint="Включённые стили можно сочетать: тот, что ниже в списке, перекрывает верхние. Настройки из «Настроить текущий» перекрывают все стили.">
        <div className="srow stack-row">
          <StylesGallery onGo={onGo} />
        </div>
      </Group>
      <Group title="Настроить текущий" id="current" hint="Это то, что стоит сейчас. В полном редакторе — все цвета (светлые и тёмные), шрифты, размеры, тени, рамки, анимации и свой CSS.">
        <div className="srow stack-row">
          <div className="row gap8 wrap">
            <button type="button" className="btn small primary" onClick={() => setEditing(true)} data-set="edit-current">
              <Icon name="sliders" size={16} /> Открыть полный редактор
            </button>
          </div>
        </div>
        <div className="srow stack-row" data-set="themecolors">
          <div className="row between gap8 wrap">
            <span className="srow-label">Цвета темы</span>
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
            {THEMES.filter((t: ThemePreset) => t.dark === (s.theme === 'system' ? which === 'dark' : dark)).map((t) => {
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
        <div className="srow stack-row" data-set="font">
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
        <SRow label="Углы" id="shape">
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
          <span className="srow-label">Узор на фоне</span>
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
      <Group title="Свой фон" id="bgimage" hint="Картинка встанет под всё окно. Можно выбрать место и размер, сделать бледнее или размытой и решить, видна ли она под боковой панелью.">
        <div className="srow stack-row">
          <BgImageEditor bg={s.bgImage} onChange={(bg) => updateSettings({ bgImage: bg as BgImage | undefined })} />
        </div>
      </Group>
      <div className="stack gap8" data-set="motion">
        <h3 className="sgroup-title">Анимации</h3>
        <p className="sgroup-hint">Плавные движения помогают понять, что изменилось. Если отвлекают или компьютер медленный — выключи.</p>
        <MotionGroups />
      </div>
      <Group id="snippets">
        <div className="srow stack-row" data-set="snippets">
          <Snippets />
        </div>
      </Group>
      {window.mnemaApi?.setAppIcon && <AppIconGroup dark={dark} />}
      {editing && <StyleEditor current onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Значок Refrain на рабочем столе телефона: обычный, под тему или любой на выбор. */
function AppIconGroup({ dark }: { dark: boolean }) {
  const s = useData().settings;
  const mode = s.appIcon ?? 'default';
  const current = presetFor(s.look, dark);
  const tile = (t: ThemePreset | null, value: string, label: string) => (
    <button key={value} type="button" className={'icon-tile' + (mode === value ? ' on' : '')} onClick={() => updateSettings({ appIcon: value })} aria-pressed={mode === value} title={label}>
      {t ? (
        <span className={'app-icon-prev' + (t.dark ? ' dark' : '')} style={{ '--ai-acc': t.accent, '--ai-bg': t.p.bg, '--ai-top': t.p.surface } as React.CSSProperties}>
          М
        </span>
      ) : value === 'theme' ? (
        <span className="app-icon-prev auto">
          <Icon name="palette" size={24} />
        </span>
      ) : (
        <span className="app-icon-prev">R</span>
      )}
      <span className="icon-tile-name">{label}</span>
    </button>
  );
  return (
    <Group title="Значок на рабочем столе" id="appicon">
      <div className="srow stack-row">
        <span className="small muted">Меняется, когда выходишь из Refrain. На некоторых телефонах после смены значок пропадает с рабочего стола — тогда перетащи его заново из списка приложений.</span>
        <div className="icon-grid">
          {tile(null, 'theme', `Как тема (${current.name})`)}
          {tile(null, 'default', 'Обычный')}
          {THEMES.map((t) => tile(t, t.id, t.name))}
        </div>
      </div>
    </Group>
  );
}
