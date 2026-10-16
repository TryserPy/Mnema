// «Оформление» 1.31: галерея стилей (выбран ровно один) и список дополнений (сколько угодно, по порядку).
// Встроенные стили — «Современный», «Классический», схемы парами и «Стекло»; свои — из редактора, файла или ИИ. Подпись плитки — откуда стиль.
import { useEffect, useRef, useState } from 'react';
import { allMods, CATALOG, originOf } from '../mods';
import { downloadFile } from '../share';
import { useData } from '../store';
import { moveAddon, pickStyle, removeStyle, saveStyle, setAppearanceValue, toggleAddon } from '../styleActions';
import { appearanceOf, classifyRole } from '../styleMigrate';
import type { Mod131 } from '../styleModel';
import { OLD_STYLE_EXT, parseStyleFile, STYLE_EXT, newStyleId, styleToFile } from '../styleSystem';
import { BASE_STYLES, DEFAULT_LOOK, FONTS, PALETTE_VARS, presetFor, type BaseStyle, type Palette } from '../themes';
import type { Look, Mod, SettingsSection } from '../types';
import { Collapse, Icon, Segmented, Switch, toast } from './ui';
import { StyleTile, type TileAction } from './StyleGallery';
import { StyleAiPanel } from './StyleAiPanel';
import { blankStyle, cloneStyle, StyleEditor } from './StyleEditor';
import { StyleSettingsPanel } from './StyleSettingsPanel';
import { AppearanceAiGuide } from './AppearanceAiGuide';

/** Встроенный стиль без CSS как плитка: цвета примера — из его схем, заголовки — из его шрифта. */
export function baseStyleMod(b: BaseStyle): Mod131 {
  const look = { ...DEFAULT_LOOK, ...b.look, custom: {} } as Look;
  const vars = (dark: boolean) => {
    const p = presetFor(look, dark).p;
    return { ...Object.fromEntries((Object.keys(PALETTE_VARS) as (keyof Palette)[]).map((k) => [PALETTE_VARS[k], p[k]])), ...(look.headFont === 'literata' ? { '--display': "'Literata', Georgia, serif" } : {}) };
  };
  return { id: b.id, name: b.name, description: b.text, icon: b.icon, accent: b.accent, look: b.look, vars: { light: vars(false), dark: vars(true) }, role: 'style', origin: 'builtin' };
}

type Filter = 'all' | 'builtin' | 'mine';

/** Импорт файлов стилей и дополнений: каждый проходит ту же проверку, что и стиль от друга. */
function useImport() {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  async function importFiles(files: File[]) {
    setErr('');
    for (const f of files) {
      try {
        const m = parseStyleFile(await f.text(), newStyleId());
        saveStyle(m);
        toast(classifyRole(m) === 'style' ? `Стиль «${m.name}» добавлен — выбери его в галерее` : `Дополнение «${m.name}» добавлено — включи его во вкладке «Дополнения»`);
      } catch (e) {
        setErr(`${f.name}: ${(e as Error).message}`);
      }
    }
  }
  const input = (
    <input
      ref={ref}
      type="file"
      multiple
      accept={`${STYLE_EXT},${OLD_STYLE_EXT},.json`}
      hidden
      onChange={(e) => {
        const fs = [...(e.target.files ?? [])];
        if (fs.length) void importFiles(fs);
        e.target.value = '';
      }}
    />
  );
  return { open: () => ref.current?.click(), err, input };
}

/** Действия над своим стилем или дополнением (и «на основе» — над любым). */
function tileActions(m: Mod131, mine: boolean, edit: (m: Mod, isNew: boolean) => void, ai: (m: Mod) => void): TileAction[] {
  return [
    { icon: 'copy', label: 'Создать на основе', run: () => edit(cloneStyle(m), true) },
    ...(mine ? [{ icon: 'edit', label: 'Изменить', run: () => edit(m, false) }, { icon: 'sparkle', label: 'Изменить с ИИ', run: () => ai(m) }] : []),
    ...(m.id.startsWith('scheme:') || m.id === 'modern' || m.id === 'classic' ? [] : [{ icon: 'share', label: 'Сохранить в файл', run: () => downloadFile(m.name + STYLE_EXT, styleToFile(m)) }]),
    ...(mine ? [{ icon: 'trash', label: 'Удалить', run: () => removeStyle(m.id) }] : [])
  ];
}

/** Галерея стилей: «Создать с ИИ», «Новый стиль», «Инструкция для ИИ», «Открыть файл…», фильтр и плитки. Нажатие на плитку ставит стиль. */
export function StylesGallery({ onGo }: { onGo?: (section: SettingsSection) => void }) {
  const s = useData().settings;
  const a = appearanceOf(s);
  const imp = useImport();
  const [editing, setEditing] = useState<{ mod: Mod; isNew: boolean } | null>(null);
  const [aiFor, setAiFor] = useState<{ mod?: Mod } | null>(null);
  const [guide, setGuide] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const custom = s.customMods as Mod131[];
  const styles: Mod131[] = [...BASE_STYLES.map(baseStyleMod), ...CATALOG.filter((m) => classifyRole(m) === 'style'), ...custom.filter((m) => classifyRole(m) === 'style')];
  useEffect(() => {
    for (const m of styles) if (m.font) void FONTS.find((f) => f.id === m.font)?.load?.();
  }, [styles.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const theme = document.documentElement.dataset.theme ?? 'light';
  const isMine = (m: Mod131) => originOf(m) !== 'builtin';
  const shown = styles.filter((m) => filter === 'all' || (filter === 'mine') === isMine(m));
  const current = styles.find((m) => m.id === a.style);

  return (
    <div className="stack gap12">
      <div className="row gap8 wrap">
        <button className="btn small primary" onClick={() => setAiFor({})} data-set="ai-style">
          <Icon name="sparkle" size={16} /> Создать с ИИ
        </button>
        <button className="btn small" onClick={() => setEditing({ mod: { ...blankStyle(), role: 'style' } as Mod131, isNew: true })}>
          <Icon name="plus" size={16} /> Новый стиль
        </button>
        <button className="btn small" onClick={() => setGuide(true)} data-set="ai-guide" title="Стиль через любой чат-бот: ChatGPT, Claude, DeepSeek… — без ключа">
          <Icon name="copy" size={16} /> Инструкция для ИИ
        </button>
        <button className="btn small ghost" onClick={imp.open} title={`Файл ${STYLE_EXT} (или старый ${OLD_STYLE_EXT}) от друга`}>
          <Icon name="folder" size={16} /> Открыть файл…
        </button>
      </div>
      <div className="ctl-seg small-seg">
        <Segmented<Filter>
          ariaLabel="Какие стили показать"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'builtin', label: 'Встроенные' },
            { value: 'mine', label: 'Мои' }
          ]}
        />
      </div>
      <div className="st-grid" data-set="style-grid">
        {shown.map((m, i) => (
          <StyleTile key={m.id} mod={m} on={a.style === m.id} theme={theme} delay={Math.min(i, 10) * 25} onToggle={() => pickStyle(m.id)} actions={tileActions(m, isMine(m), (mod, isNew) => setEditing({ mod, isNew }), (mod) => setAiFor({ mod }))} />
        ))}
      </div>
      {filter === 'mine' && !shown.length && <span className="small muted">Своих стилей пока нет. Нажми «Создать с ИИ» или «Новый стиль».</span>}
      {current && (current.settings?.length ?? 0) > 0 && (
        <div className="stack gap8" data-set="style-settings">
          <span className="sgroup-title">Настройки стиля «{current.name}»</span>
          <StyleSettingsPanel mod={current} values={a.values[current.id]} onChange={(k, v) => setAppearanceValue(current.id, k, v)} />
        </div>
      )}
      <span className="small muted">Наведи на плитку — появятся «Создать на основе», «Изменить», «Изменить с ИИ», «Сохранить в файл».</span>
      {imp.err && <div className="hint warn">{imp.err}</div>}
      {imp.input}
      {editing && <StyleEditor key={editing.mod.id} initial={editing.mod} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {aiFor && <StyleAiPanel current={aiFor.mod} replaceId={aiFor.mod && isMine(aiFor.mod) ? aiFor.mod.id : undefined} onClose={() => setAiFor(null)} onGo={onGo} />}
      {guide && <AppearanceAiGuide current={current && isMine(current) ? current : undefined} onClose={() => setGuide(false)} />}
    </div>
  );
}

/** Дополнения: меняют что-то одно, включаются сколько угодно. Порядок важен: следующее перекрывает предыдущее. */
export function AddonsPane({ onGo }: { onGo?: (section: SettingsSection) => void }) {
  const s = useData().settings;
  const a = appearanceOf(s);
  const imp = useImport();
  const [editing, setEditing] = useState<{ mod: Mod; isNew: boolean } | null>(null);
  const [aiFor, setAiFor] = useState<{ mod?: Mod } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const list = allMods(s.customMods).filter((m) => m.id !== a.style && (classifyRole(m) === 'addon' || a.addons.includes(m.id)));
  const byId = new Map(list.map((m) => [m.id, m]));
  const on = a.addons.map((id) => byId.get(id)).filter((m): m is Mod131 => Boolean(m));
  const off = list.filter((m) => !a.addons.includes(m.id));

  const row = (m: Mod131, i: number, enabled: boolean) => {
    const mine = originOf(m) !== 'builtin';
    const hasSettings = (m.settings?.length ?? 0) > 0;
    return (
      <div key={m.id} className={'st-item addon-row' + (enabled ? ' on' : '')} data-set={'addon-' + m.id}>
        <div className="st-item-head">
          <span className="st-item-ico" aria-hidden="true">
            {m.icon ?? '🧩'}
          </span>
          <button type="button" className="addon-text" tabIndex={-1} onClick={() => toggleAddon(m.id, !enabled)}>
            <span className="st-item-name">{m.name}</span>
            {m.description && (
              <span className="addon-desc small muted" title={m.description}>
                {m.description}
              </span>
            )}
          </button>
          {enabled && hasSettings && (
            <button className={'icon-btn small' + (open === m.id ? ' on' : '')} aria-expanded={open === m.id} aria-label={`Настройки «${m.name}»`} title="Настройки" onClick={() => setOpen(open === m.id ? null : m.id)}>
              <Icon name="sliders" size={16} />
            </button>
          )}
          {enabled && on.length > 1 && (
            <>
              <button className="icon-btn small" aria-label={`Раньше: «${m.name}»`} title="Раньше (его перекроют следующие)" disabled={i === 0} onClick={() => moveAddon(m.id, -1)}>
                <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}>
                  <Icon name="chevron" size={16} />
                </span>
              </button>
              <button className="icon-btn small" aria-label={`Позже: «${m.name}»`} title="Позже (перекрывает предыдущие)" disabled={i === on.length - 1} onClick={() => moveAddon(m.id, 1)}>
                <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>
                  <Icon name="chevron" size={16} />
                </span>
              </button>
            </>
          )}
          {mine && (
            <button className="icon-btn small" aria-label={`Изменить «${m.name}»`} title="Изменить" onClick={() => setEditing({ mod: m, isNew: false })}>
              <Icon name="edit" size={16} />
            </button>
          )}
          <Switch checked={enabled} onChange={(v) => toggleAddon(m.id, v)} label={m.name} />
        </div>
        {enabled && hasSettings && (
          <Collapse open={open === m.id}>
            <div className="st-item-body">
              <StyleSettingsPanel mod={m} values={a.values[m.id]} onChange={(k, v) => setAppearanceValue(m.id, k, v)} />
              <div className="row gap8 wrap">
                <button className="btn small ghost" onClick={() => setEditing({ mod: cloneStyle(m), isNew: true })}>
                  <Icon name="copy" size={15} /> Создать на основе
                </button>
                {mine && (
                  <button className="btn small ghost" onClick={() => setAiFor({ mod: m })}>
                    <Icon name="sparkle" size={15} /> Изменить с ИИ
                  </button>
                )}
                <button className="btn small ghost" onClick={() => downloadFile(m.name + STYLE_EXT, styleToFile(m))}>
                  <Icon name="share" size={15} /> В файл
                </button>
                {mine && (
                  <button className="btn small ghost danger" onClick={() => removeStyle(m.id)}>
                    <Icon name="trash" size={15} /> Удалить
                  </button>
                )}
              </div>
            </div>
          </Collapse>
        )}
      </div>
    );
  };

  return (
    <div className="stack gap12">
      <span className="small muted">Дополнения — маленькие добавки к стилю: клетка в конспекте, крупные кнопки, стикеры. Включай любые — просто нажми на строку.</span>
      <div className="row gap8 wrap">
        <button className="btn small" onClick={() => setEditing({ mod: { ...blankStyle(), name: 'Моё дополнение', role: 'addon' } as Mod131, isNew: true })}>
          <Icon name="plus" size={16} /> Новое дополнение
        </button>
        <button className="btn small ghost" onClick={imp.open}>
          <Icon name="folder" size={16} /> Открыть файл…
        </button>
        {on.length > 0 && (
          <button className="btn small ghost" onClick={() => on.forEach((m) => toggleAddon(m.id, false))}>
            Выключить все
          </button>
        )}
      </div>
      {on.length > 0 && (
        <div className="stack gap8">
          <span className="sgroup-title">Включены — по порядку</span>
          <div className="st-stack">{on.map((m, i) => row(m, i, true))}</div>
        </div>
      )}
      <div className="stack gap8">
        {on.length > 0 && <span className="sgroup-title">Остальные</span>}
        <div className="st-stack">{off.map((m, i) => row(m, i, false))}</div>
      </div>
      {imp.err && <div className="hint warn">{imp.err}</div>}
      {imp.input}
      {editing && <StyleEditor key={editing.mod.id} initial={editing.mod} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {aiFor && <StyleAiPanel current={aiFor.mod} replaceId={aiFor.mod?.id} onClose={() => setAiFor(null)} onGo={onGo} />}
    </div>
  );
}
