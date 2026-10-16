// Настройки → «Оформление» (1.31): сверху — светлая/тёмная и карточка текущего оформления («Кофе · 3 правки поверх»,
// «Настроить» раскрывает быстрые настройки, свой фон и значок), ниже — вкладки «Стиль · Дополнения · Анимации · Свой код».
// Вкладка запоминается (appearance.tab). Быстрые настройки идут через setCurrent: разница со стилем — это и есть «мои правки».
import { useEffect, useState } from 'react';
import { updateSettings, useData } from '../store';
import { resetEdits, saveEditsAsStyle, setAppearanceTab, setCurrent } from '../styleActions';
import { appearanceOf, countEdits, styleName } from '../styleMigrate';
import type { Appearance } from '../styleModel';
import { BACKGROUNDS, FONTS, HEAD_FONTS, presetFor, THEMES, type ThemePreset } from '../themes';
import type { BgImage, Look, SettingsSection } from '../types';
import { Icon, ColorPicker, Collapse, Segmented } from './ui';
import { Group, PaneHead, SRow } from './SettingsKit';
import { ACCENTS, ThemeCard } from './ThemeCards';
import { BgImageEditor } from './BgImageEditor';
import { MotionGroups } from './MotionSettings';
import { Snippets } from './Snippets';
import { AddonsPane, StylesGallery } from './ModsSettings';
import { StyleEditor } from './StyleEditor';

type Tab = NonNullable<Appearance['tab']>;

/** Куда ведёт якорь поиска по настройкам: вкладка и нужно ли раскрыть «Настроить». */
const QUICK = ['themecolors', 'accent', 'font', 'headfont', 'fontsize', 'shape', 'density', 'background', 'current', 'bgimage', 'appicon', 'edit-current'];
export function lookTabFor(anchor?: string): Tab | null {
  if (!anchor) return null;
  if (anchor === 'motion') return 'motion';
  if (anchor === 'snippets') return 'code';
  if (anchor === 'addons') return 'addons';
  if (anchor === 'style' || anchor === 'ai-style' || anchor === 'ai-guide' || anchor === 'style-grid') return 'style';
  return null;
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

export function LookPane({ dark, onGo, focus }: { dark: boolean; onGo?: (section: SettingsSection) => void; focus?: string | null }) {
  const data = useData();
  const s = data.settings;
  const look = s.look;
  const a = appearanceOf(s);
  const tab: Tab = a.tab ?? 'style';
  const edits = countEdits(a.edits);
  const [which, setWhich] = useState<'light' | 'dark'>(dark ? 'dark' : 'light');
  const [editing, setEditing] = useState(false);
  const [tune, setTune] = useState(false);
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const setLook = (patch: Partial<Look>) => setCurrent({ look: { ...look, ...patch } });
  useEffect(() => {
    if (focus && QUICK.includes(focus)) setTune(true);
  }, [focus]);
  return (
    <div className="stack gap16">
      <PaneHead title="Оформление" text="Стиль — это всё оформление сразу. Дополнения меняют что-то одно поверх стиля. Твои правки лежат поверх всего — их можно сбросить или сохранить как свой стиль." />
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

      <section className="card look-summary" data-set="look-summary">
        <div className="row gap12 wrap">
          <span className="look-summary-ico" aria-hidden="true">
            <Icon name="palette" size={22} />
          </span>
          <span className="grow stack gap4 look-summary-text">
            <strong>
              {styleName(a.style, s.customMods)}
              {edits > 0 && ` · ${edits} ${plural(edits, 'правка', 'правки', 'правок')} поверх`}
            </strong>
            <span className="small muted">
              {a.addons.length ? `Дополнений: ${a.addons.length}` : 'Без дополнений'}
            </span>
          </span>
          <button className={'btn small' + (tune ? ' on' : '')} aria-expanded={tune} onClick={() => setTune(!tune)} data-set="tune">
            <Icon name="sliders" size={16} /> Настроить
          </button>
        </div>
        {edits > 0 && (
          <div className="row gap8 wrap look-summary-actions">
            <button className="btn small ghost" onClick={resetEdits}>
              Сбросить правки
            </button>
            {saveAs === null ? (
              <button className="btn small ghost" onClick={() => setSaveAs('')}>
                Сохранить как стиль
              </button>
            ) : (
              <form
                className="row gap8 grow"
                onSubmit={(e) => {
                  e.preventDefault();
                  const m = saveEditsAsStyle(saveAs || 'Мой стиль');
                  setSaveAs(null);
                  void m;
                }}
              >
                <input className="input grow" autoFocus value={saveAs} onChange={(e) => setSaveAs(e.target.value)} placeholder="Название стиля" aria-label="Название стиля" />
                <button className="btn small primary" type="submit">
                  Сохранить
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      <Collapse open={tune}>
        <div className="stack gap16 look-tune">
          <Group title="Настроить текущий" id="current" hint="Правки ложатся поверх стиля. В полном редакторе — все цвета (светлые и тёмные), шрифты, размеры, тени, рамки и части экрана.">
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
                  return <ThemeCard key={t.id} t={t} on={on} onPick={() => setCurrent({ look: { ...look, [isDark ? 'dark' : 'light']: t.id }, ...(isDark === dark ? { accent: t.accent } : {}) })} />;
                })}
              </div>
            </div>
            <div className="srow stack-row" data-set="accent">
              <span className="srow-label">Главный цвет</span>
              <ColorPicker value={s.accent} onChange={(c) => setCurrent({ accent: c })} colors={ACCENTS} />
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
              <input type="range" min={0.9} max={1.3} step={0.05} value={s.fontScale} onChange={(e) => setCurrent({ fontScale: Number(e.target.value) })} aria-label="Размер текста" />
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
                  onChange={(v) => setCurrent({ density: v })}
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
              <BgImageEditor bg={s.bgImage} onChange={(bg) => setCurrent({ bgImage: bg as BgImage | undefined })} />
            </div>
          </Group>
          {window.mnemaApi?.setAppIcon && <AppIconGroup dark={dark} />}
        </div>
      </Collapse>

      <div className="ctl-seg look-tabs" data-set="look-tabs">
        <Segmented<Tab>
          ariaLabel="Раздел оформления"
          value={tab}
          onChange={setAppearanceTab}
          options={[
            { value: 'style', label: 'Стиль' },
            { value: 'addons', label: 'Дополнения' },
            { value: 'motion', label: 'Анимации' },
            { value: 'code', label: 'Свой код' }
          ]}
        />
      </div>
      {tab === 'style' && (
        <div className="stack gap8" data-set="style">
          <StylesGallery onGo={onGo} />
        </div>
      )}
      {tab === 'addons' && (
        <div className="stack gap8" data-set="addons">
          <AddonsPane onGo={onGo} />
        </div>
      )}
      {tab === 'motion' && (
        <div className="stack gap8" data-set="motion">
          <p className="sgroup-hint">Плавные движения помогают понять, что изменилось. Если отвлекают или компьютер медленный — выключи.</p>
          <MotionGroups />
        </div>
      )}
      {tab === 'code' && (
        <Group id="snippets">
          <div className="srow stack-row" data-set="snippets">
            <Snippets />
          </div>
        </Group>
      )}
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
