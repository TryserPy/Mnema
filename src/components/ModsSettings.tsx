// «Стили»: готовые и свои наборы внешнего вида. Включил — сразу видно; несколько стилей сразу, порядок сверху вниз;
// у стиля могут быть свои настройки (цвета, ползунки, переключатели). Свои стили делаются в редакторе — на основе любого или с нуля.
import { useEffect, useRef, useState } from 'react';
import { allMods, CATALOG } from '../mods';
import { downloadFile } from '../share';
import { getData, updateSettings, useData } from '../store';
import { cleanMod, OLD_STYLE_EXT, parseStyleFile, STYLE_EXT, styleToFile } from '../styleSystem';
import { FONTS } from '../themes';
import type { CssSnippet, Mod, StyleValue } from '../types';
import { Collapse, Icon, toast } from './ui';
import { PaneHead } from './SettingsKit';
import { StyleTile, type TileAction } from './StyleGallery';
import { blankStyle, cloneStyle, newStyleId, StyleEditor } from './StyleEditor';
import { StyleSettingsPanel } from './StyleSettingsPanel';

/** Включить или выключить стиль. Включённые стили идут в порядке включения (новый — внизу и перекрывает прежние). */
export function toggleStyle(m: Mod, on: boolean) {
  // Свежие настройки, а не снимок при отрисовке: «Выключить все» вызывает toggle подряд, и каждый вызов должен видеть работу предыдущего.
  const s = getData().settings;
  const modsOn = on ? [...s.modsOn.filter((x) => x !== m.id), m.id] : s.modsOn.filter((x) => x !== m.id);
  if (m.font && on) void FONTS.find((f) => f.id === m.font)?.load?.();
  // Стиль из файла может менять оформление — запоминаем, как было, чтобы вернуть при выключении.
  if (m.look || m.accent) {
    const backup = { ...(s.styleBackup ?? {}) };
    if (on) {
      backup[m.id] = { look: s.look, accent: s.accent };
      return updateSettings({ modsOn, styleBackup: backup, look: { ...s.look, ...m.look }, ...(m.accent ? { accent: m.accent } : {}) });
    }
    const prev = backup[m.id];
    delete backup[m.id];
    return updateSettings({ modsOn, styleBackup: backup, ...(prev ? { look: prev.look, accent: prev.accent } : {}) });
  }
  updateSettings({ modsOn });
}

/** Поменять порядок включённого стиля: -1 — выше (раньше применяется), +1 — ниже (перекрывает). */
export function moveStyle(id: string, delta: -1 | 1) {
  const s = getData().settings;
  const i = s.modsOn.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= s.modsOn.length) return;
  const next = [...s.modsOn];
  [next[i], next[j]] = [next[j], next[i]];
  updateSettings({ modsOn: next });
}

export function setStyleValue(styleId: string, key: string, v: StyleValue | undefined) {
  const s = getData().settings;
  const cur = { ...(s.styleValues[styleId] ?? {}) };
  if (v === undefined) delete cur[key];
  else cur[key] = v;
  const styleValues = { ...s.styleValues };
  if (Object.keys(cur).length) styleValues[styleId] = cur;
  else delete styleValues[styleId];
  updateSettings({ styleValues });
}

/** Сниппеты «мой CSS»: короткие кусочки своего CSS, каждый включается отдельно (как в Obsidian). Изменения видны сразу. */
function Snippets() {
  const data = useData();
  const list = data.settings.cssSnippets;
  const [open, setOpen] = useState<string | null>(null);
  const upd = (id: string, patch: Partial<CssSnippet>) => updateSettings({ cssSnippets: getData().settings.cssSnippets.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  return (
    <div className="stack gap8">
      <span className="sgroup-title">Мой CSS — сниппеты</span>
      <span className="small muted">Кусочки своего CSS. Каждый включается отдельно и применяется после стилей. Переменные и классы — в справке редактора стилей. Ссылки на интернет не работают.</span>
      {list.length > 0 && (
        <div className="st-snips">
          {list.map((sn) => (
            <div key={sn.id} className="st-snip">
              <div className="row gap8">
                <button type="button" role="switch" aria-checked={sn.on} aria-label={`Сниппет «${sn.name}»`} className={'switch' + (sn.on ? ' on' : '')} onClick={() => upd(sn.id, { on: !sn.on })}>
                  <span />
                </button>
                <input className="input grow" aria-label="Название сниппета" value={sn.name} maxLength={40} onChange={(e) => upd(sn.id, { name: e.target.value })} />
                <button className={'btn small' + (open === sn.id ? ' on' : '')} aria-expanded={open === sn.id} onClick={() => setOpen(open === sn.id ? null : sn.id)}>
                  <Icon name="code" size={15} /> CSS
                </button>
                <button className="icon-btn small" aria-label={`Удалить сниппет «${sn.name}»`} onClick={() => updateSettings({ cssSnippets: getData().settings.cssSnippets.filter((x) => x.id !== sn.id) })}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <Collapse open={open === sn.id}>
                <textarea className="input css-area" spellCheck={false} aria-label={`CSS сниппета «${sn.name}»`} value={sn.css} onChange={(e) => upd(sn.id, { css: e.target.value })} placeholder={'.hero { background: linear-gradient(135deg, var(--accent), #C2417A); }'} />
              </Collapse>
            </div>
          ))}
        </div>
      )}
      <div>
        <button
          className="btn small"
          onClick={() => {
            const id = newStyleId();
            updateSettings({ cssSnippets: [...getData().settings.cssSnippets, { id, name: 'Сниппет ' + (list.length + 1), css: '', on: true }] });
            setOpen(id);
          }}
        >
          <Icon name="plus" size={16} /> Добавить сниппет
        </button>
      </div>
    </div>
  );
}

/** Наборы стилей — свой раздел Настроек. */
export function StylesSettings() {
  const data = useData();
  const s = data.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<{ mod: Mod; isNew: boolean } | null>(null);
  const [openSettings, setOpenSettings] = useState<string | null>(null);

  async function importFiles(files: File[]) {
    setErr('');
    for (const f of files) {
      try {
        const m = parseStyleFile(await f.text(), 'm-' + Math.random().toString(36).slice(2, 9));
        updateSettings({ customMods: [...getData().settings.customMods, m] });
        toast(`Стиль «${m.name}» добавлен — включи его переключателем`);
      } catch (e) {
        setErr(`${f.name}: ${(e as Error).message}`);
      }
    }
  }

  function exportMine() {
    const look = s.look;
    const css = s.cssSnippets.filter((x) => x.on).map((x) => x.css).join('\n\n');
    const mod = cleanMod({ name: 'Мой вид', description: 'Оформление из Refrain', look: { style: look.style, light: look.light, dark: look.dark, font: look.font, headFont: look.headFont, radius: look.radius, background: look.background }, accent: s.accent, css: css || undefined }, 'mine');
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
  const offAll =
    active.length > 0 ? (
      <button className="btn small ghost" onClick={() => active.forEach((m) => toggleStyle(m, false))}>
        Выключить все
      </button>
    ) : null;
  // Тема для примеров: правила стилей «для тёмной темы» должны срабатывать и в плитках.
  const theme = document.documentElement.dataset.theme ?? 'light';
  const isMine = (m: Mod) => !CATALOG.some((c) => c.id === m.id);

  return (
    <div className="stack gap16">
      <PaneHead title="Стили" text="Стиль меняет сам вид и раскладку Refrain: панель, плотность, карточки, шрифты, цвета. Нажми на плитку — стиль включится. Можно несколько сразу: нижний в списке перекрывает верхние.">
        {offAll}
      </PaneHead>

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

      <div className="st-grid">
        {list.map((m, i) => {
          const on = s.modsOn.includes(m.id);
          const actions: TileAction[] = [
            { icon: 'copy', label: 'Создать на основе', run: () => setEditing({ mod: cloneStyle(m), isNew: true }) },
            ...(isMine(m) ? [{ icon: 'edit', label: 'Изменить', run: () => setEditing({ mod: m, isNew: false }) }] : []),
            { icon: 'share', label: 'Сохранить в файл', run: () => downloadFile(m.name + STYLE_EXT, styleToFile(m)) },
            ...(isMine(m) ? [{ icon: 'trash', label: 'Удалить', run: () => remove(m) }] : [])
          ];
          return <StyleTile key={m.id} mod={m} on={on} theme={theme} delay={Math.min(i, 10) * 25} onToggle={() => toggleStyle(m, !on)} actions={actions} />;
        })}
      </div>

      <div className="st-own">
        <span className="sgroup-title">Свои стили</span>
        <div className="row gap8 wrap">
          <button className="btn small primary" onClick={() => setEditing({ mod: blankStyle(), isNew: true })}>
            <Icon name="plus" size={16} /> Создать стиль
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()} title={`Файл ${STYLE_EXT} (или старый ${OLD_STYLE_EXT}) от друга`}>
            <Icon name="folder" size={16} /> Стиль из файла
          </button>
          <button className="btn small" onClick={exportMine} title="Сохранит тему, цвета и включённые сниппеты в файл">
            <Icon name="share" size={16} /> Сохранить мой вид
          </button>
        </div>
        <span className="small muted">В плитках наведи на стиль — появятся «Создать на основе», «Изменить», «Сохранить в файл».</span>
      </div>

      <Snippets />

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
    </div>
  );
}
