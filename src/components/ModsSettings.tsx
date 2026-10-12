// Галерея стилей в «Оформлении»: встроенные виды, каталог и свои. Включил — сразу видно; несколько стилей сразу, порядок сверху вниз;
// у стиля могут быть свои настройки (цвета, ползунки, переключатели). Свои стили делаются в редакторе — на основе любого, с нуля или с ИИ.
import { useEffect, useRef, useState } from 'react';
import { currentAsMod } from '../appearance';
import { allMods, CATALOG } from '../mods';
import { downloadFile } from '../share';
import { getData, updateSettings, useData } from '../store';
import { moveStyle, setStyleValue, toggleStyle } from '../styleActions';
import { cleanMod, OLD_STYLE_EXT, parseStyleFile, STYLE_EXT, newStyleId, styleToFile } from '../styleSystem';
import { DEFAULT_LOOK, FONTS, PALETTE_VARS, presetFor, STYLES } from '../themes';
import type { Mod, SettingsSection } from '../types';
import { Collapse, Icon, Segmented, toast } from './ui';
import { StyleTile, type TileAction } from './StyleGallery';
import { StyleAiPanel } from './StyleAiPanel';
import { blankStyle, cloneStyle, StyleEditor } from './StyleEditor';
import { StyleSettingsPanel } from './StyleSettingsPanel';
import type { Palette } from '../themes';

/** Встроенные виды («Современный», «Классический») как плитки галереи: цвета в плитке — из их тем, а выбор ставит основу оформления. */
function baseTile(id: 'modern' | 'classic'): Mod {
  const st = STYLES.find((x) => x.id === id)!;
  const vars = (dark: boolean) => {
    const p = presetFor({ ...DEFAULT_LOOK, ...st.look } as never, dark).p;
    return Object.fromEntries((Object.keys(PALETTE_VARS) as (keyof Palette)[]).map((k) => [PALETTE_VARS[k], p[k]]));
  };
  return {
    id: 'base-' + id,
    name: st.name,
    description: st.text,
    icon: id === 'modern' ? '🪟' : '📜',
    where: 'встроенный вид',
    accent: st.accent,
    vars: { light: { ...vars(false), ...(id === 'classic' ? { '--display': "'Literata', Georgia, serif" } : {}) }, dark: { ...vars(true), ...(id === 'classic' ? { '--display': "'Literata', Georgia, serif" } : {}) } }
  };
}
const BASE_TILES = [baseTile('modern'), baseTile('classic')];

type Filter = 'all' | 'base' | 'catalog' | 'mine';

/** Галерея стилей, список включённых, «Создать»/«Из файла»/«Создать с ИИ». */
export function StylesGallery({ onGo }: { onGo?: (section: SettingsSection) => void }) {
  const data = useData();
  const s = data.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<{ mod: Mod; isNew: boolean } | null>(null);
  const [aiFor, setAiFor] = useState<{ mod?: Mod } | null>(null);
  const [openSettings, setOpenSettings] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  async function importFiles(files: File[]) {
    setErr('');
    for (const f of files) {
      try {
        const m = parseStyleFile(await f.text(), newStyleId());
        updateSettings({ customMods: [...getData().settings.customMods, m] });
        toast(`Стиль «${m.name}» добавлен — включи его, нажав на плитку`);
      } catch (e) {
        setErr(`${f.name}: ${(e as Error).message}`);
      }
    }
  }

  /** Всё оформление, как оно стоит сейчас (тема, цвета, шрифты, фон, «Мой вид», включённые сниппеты), — в файл стиля. */
  function exportMine() {
    const cur = currentAsMod(s);
    const css = [cur.css ?? '', ...s.cssSnippets.filter((x) => x.on).map((x) => x.css)].filter((x) => x.trim()).join('\n\n');
    const mod = cleanMod({ ...cur, name: 'Мой вид', description: 'Оформление из Refrain', css }, 'mine');
    if (mod) downloadFile('Мой вид' + STYLE_EXT, styleToFile(mod));
  }

  function remove(m: Mod) {
    toggleStyle(m, false);
    const now = getData().settings;
    const styleValues = { ...now.styleValues };
    delete styleValues[m.id];
    updateSettings({ customMods: now.customMods.filter((x) => x.id !== m.id), modsOn: now.modsOn.filter((x) => x !== m.id), styleValues });
  }

  const list = allMods(s.customMods);
  // Шрифты стилей нужны примерам в плитках сразу, а не только когда стиль включён.
  useEffect(() => {
    for (const m of list) if (m.font) void FONTS.find((f) => f.id === m.font)?.load?.();
  }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(list.map((m) => [m.id, m]));
  const active = s.modsOn.map((id) => byId.get(id)).filter((m): m is Mod => Boolean(m));
  // Тема для примеров: правила стилей «для тёмной темы» должны срабатывать и в плитках.
  const theme = document.documentElement.dataset.theme ?? 'light';
  const isMine = (m: Mod) => !CATALOG.some((c) => c.id === m.id);

  const tiles: { mod: Mod; kind: Filter }[] = [...BASE_TILES.map((mod) => ({ mod, kind: 'base' as const })), ...list.map((mod) => ({ mod, kind: isMine(mod) ? ('mine' as const) : ('catalog' as const) }))];
  const shown = tiles.filter((t) => filter === 'all' || t.kind === filter);

  return (
    <div className="stack gap12">
      <div className="row gap8 wrap">
        <button className="btn small primary" onClick={() => setAiFor({})} data-set="ai-style">
          <Icon name="sparkle" size={16} /> Создать с ИИ
        </button>
        <button className="btn small" onClick={() => setEditing({ mod: blankStyle(), isNew: true })}>
          <Icon name="plus" size={16} /> Создать стиль
        </button>
        <button className="btn small" onClick={() => fileRef.current?.click()} title={`Файл ${STYLE_EXT} (или старый ${OLD_STYLE_EXT}) от друга`}>
          <Icon name="folder" size={16} /> Стиль из файла
        </button>
        <button className="btn small" onClick={exportMine} title="Сохранит всё, что сейчас стоит (тема, цвета, шрифт, фон, правки и включённые сниппеты), в файл">
          <Icon name="share" size={16} /> Сохранить мой вид
        </button>
        {active.length > 0 && (
          <button className="btn small ghost" onClick={() => active.forEach((m) => toggleStyle(m, false))}>
            Выключить все стили
          </button>
        )}
      </div>

      {active.length > 0 && (
        <div className="stack gap8">
          <span className="sgroup-title">Включены — сверху вниз</span>
          <div className="st-stack">
            {active.map((m, i) => (
              <div key={m.id} className="st-item">
                <div className="st-item-head">
                  <span className="st-item-ico" aria-hidden="true">
                    {m.icon ?? '🎨'}
                  </span>
                  <span className="st-item-name">{m.name}</span>
                  {(m.settings?.length ?? 0) > 0 && (
                    <button className={'btn small' + (openSettings === m.id ? ' on' : '')} aria-expanded={openSettings === m.id} onClick={() => setOpenSettings(openSettings === m.id ? null : m.id)}>
                      <Icon name="sliders" size={15} /> Настройки
                    </button>
                  )}
                  <button className="icon-btn small" aria-label={`Выше: «${m.name}»`} title="Выше (применяется раньше)" disabled={i === 0} onClick={() => moveStyle(m.id, -1)}>
                    <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}>
                      <Icon name="chevron" size={16} />
                    </span>
                  </button>
                  <button className="icon-btn small" aria-label={`Ниже: «${m.name}»`} title="Ниже (перекрывает верхние)" disabled={i === active.length - 1} onClick={() => moveStyle(m.id, 1)}>
                    <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>
                      <Icon name="chevron" size={16} />
                    </span>
                  </button>
                  <button className="icon-btn small" aria-label={`Выключить «${m.name}»`} title="Выключить" onClick={() => toggleStyle(m, false)}>
                    <Icon name="x" size={16} />
                  </button>
                </div>
                {(m.settings?.length ?? 0) > 0 && (
                  <Collapse open={openSettings === m.id}>
                    <div className="st-item-body">
                      <StyleSettingsPanel mod={m} values={s.styleValues[m.id]} onChange={(k, v) => setStyleValue(m.id, k, v)} />
                    </div>
                  </Collapse>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ctl-seg small-seg">
        <Segmented<Filter>
          ariaLabel="Какие стили показать"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'base', label: 'Виды' },
            { value: 'catalog', label: 'Каталог' },
            { value: 'mine', label: 'Мои' }
          ]}
        />
      </div>
      <div className="st-grid">
        {shown.map(({ mod: m, kind }, i) => {
          if (kind === 'base') {
            const st = STYLES.find((x) => 'base-' + x.id === m.id)!;
            const on = (s.look.style ?? 'modern') === st.id;
            return <StyleTile key={m.id} mod={m} on={on} theme={theme} delay={Math.min(i, 10) * 25} onToggle={() => updateSettings({ look: { ...s.look, ...st.look }, accent: st.accent })} />;
          }
          const on = s.modsOn.includes(m.id);
          const actions: TileAction[] = [
            { icon: 'copy', label: 'Создать на основе', run: () => setEditing({ mod: cloneStyle(m), isNew: true }) },
            ...(kind === 'mine' ? [{ icon: 'edit', label: 'Изменить', run: () => setEditing({ mod: m, isNew: false }) }, { icon: 'sparkle', label: 'Изменить с ИИ', run: () => setAiFor({ mod: m }) }] : []),
            { icon: 'share', label: 'Сохранить в файл', run: () => downloadFile(m.name + STYLE_EXT, styleToFile(m)) },
            ...(kind === 'mine' ? [{ icon: 'trash', label: 'Удалить', run: () => remove(m) }] : [])
          ];
          return <StyleTile key={m.id} mod={m} on={on} theme={theme} delay={Math.min(i, 10) * 25} onToggle={() => toggleStyle(m, !on)} actions={actions} />;
        })}
      </div>
      {filter === 'mine' && !shown.length && <span className="small muted">Своих стилей пока нет. Нажми «Создать с ИИ» или «Создать стиль».</span>}
      <span className="small muted">Наведи на плитку — появятся «Создать на основе», «Изменить», «Изменить с ИИ», «Сохранить в файл».</span>

      {err && <div className="hint warn">{err}</div>}
      <input
        ref={fileRef}
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
      {editing && <StyleEditor key={editing.mod.id} initial={editing.mod} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {aiFor && <StyleAiPanel current={aiFor.mod} replaceId={aiFor.mod?.id} onClose={() => setAiFor(null)} onGo={onGo} />}
    </div>
  );
}
