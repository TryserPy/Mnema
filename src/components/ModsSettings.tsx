// «Стили»: готовые наборы внешнего вида. Включил — сразу видно в предпросмотре; выключил — всё как было.
import { useEffect, useRef, useState } from 'react';
import { allMods, CATALOG, isMod, MOD_EXT, sanitizeCss } from '../mods';
import { downloadFile } from '../share';
import { getData, updateSettings, useData } from '../store';
import { FONTS } from '../themes';
import type { Mod } from '../types';
import { Collapse, Icon, toast } from './ui';
import { StyleTile } from './StyleGallery';
import { PaneHead } from './SettingsKit';

/** Наборы стилей — свой раздел Настроек. */
export function StylesSettings() {
  const data = useData();
  const s = data.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [cssOpen, setCssOpen] = useState(Boolean(s.userCss));
  const [css, setCss] = useState(s.userCss);
  const [err, setErr] = useState('');

  function toggle(m: Mod, on: boolean) {
    // Свежие настройки, а не снимок при отрисовке: «Выключить все» вызывает toggle подряд, и каждый вызов должен видеть работу предыдущего.
    const s = getData().settings;
    const modsOn = on ? [...s.modsOn, m.id] : s.modsOn.filter((x) => x !== m.id);
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

  async function importFile(f: File) {
    setErr('');
    try {
      const raw = JSON.parse(await f.text());
      if (!isMod(raw)) throw new Error('Это не стиль Мнемы.');
      const m: Mod = {
        id: 'm-' + Math.random().toString(36).slice(2, 9),
        name: String(raw.name).slice(0, 50),
        description: String(raw.description ?? '').slice(0, 200),
        author: raw.author ? String(raw.author).slice(0, 40) : undefined,
        css: raw.css ? sanitizeCss(String(raw.css)) : undefined,
        look: raw.look && typeof raw.look === 'object' ? raw.look : undefined,
        accent: typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : undefined,
        icon: '📄',
        where: 'из файла'
      };
      updateSettings({ customMods: [...s.customMods, m] });
      toast(`Стиль «${m.name}» добавлен — включи его переключателем`);
    } catch (e) {
      setErr((e as Error).message.includes('JSON') ? 'Файл повреждён или это не стиль.' : (e as Error).message);
    }
  }

  function exportMine() {
    const mod = { kind: 'mnema-mod', name: 'Мой стиль', description: 'Оформление из Мнемы', look: s.look, accent: s.accent, css: s.userCss || undefined };
    downloadFile('Мой стиль' + MOD_EXT, JSON.stringify(mod, null, 1));
  }

  const list = allMods(s.customMods);
  // Шрифты стилей нужны примерам в плитках сразу, а не только когда стиль включён.
  useEffect(() => {
    for (const m of list) if (m.font) void FONTS.find((f) => f.id === m.font)?.load?.();
  }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const onCount = list.filter((m) => s.modsOn.includes(m.id)).length;
  const offAll =
    onCount > 0 ? (
      <button className="btn small ghost" onClick={() => list.filter((m) => s.modsOn.includes(m.id)).forEach((m) => toggle(m, false))}>
        Выключить все
      </button>
    ) : null;
  // Тема для примеров: правила стилей «для тёмной темы» должны срабатывать и в плитках.
  const theme = document.documentElement.dataset.theme ?? 'light';
  return (
    <div className="stack gap16">
      <PaneHead title="Стили" text="Нажми на плитку — стиль включится. Можно несколько сразу, а выключишь — всё станет как было.">
        {offAll}
      </PaneHead>
      <div className="st-grid">
        {list.map((m, i) => {
          const on = s.modsOn.includes(m.id);
          const mine = !CATALOG.some((c) => c.id === m.id);
          return (
            <StyleTile
              key={m.id}
              mod={m}
              on={on}
              theme={theme}
              delay={Math.min(i, 10) * 25}
              onToggle={() => toggle(m, !on)}
              onDelete={
                mine
                  ? () => {
                      if (on) toggle(m, false);
                      const now = getData().settings;
                      updateSettings({ customMods: now.customMods.filter((x) => x.id !== m.id), modsOn: now.modsOn.filter((x) => x !== m.id) });
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
      <div className="st-own">
        <span className="sgroup-title">Свои стили</span>
        <div className="row gap8 wrap">
          <button className="btn small" onClick={() => fileRef.current?.click()} title={`Файл ${MOD_EXT} от друга`}>
            <Icon name="folder" size={16} /> Стиль из файла
          </button>
          <button className="btn small" onClick={exportMine} title="Сохранит тему, цвета и свой CSS в файл">
            <Icon name="share" size={16} /> Сохранить мой вид
          </button>
          <button className={'btn small' + (cssOpen ? ' on' : '')} aria-expanded={cssOpen} onClick={() => setCssOpen(!cssOpen)}>
            <Icon name="code" size={16} /> Свой CSS
          </button>
        </div>
        <Collapse open={cssOpen}>
          <div className="stack gap8 st-css">
            <textarea className="input css-area" spellCheck={false} aria-label="Свой CSS" value={css} onChange={(e) => setCss(e.target.value)} placeholder={'.hero { background: linear-gradient(135deg, var(--accent), #C2417A); }'} />
            <div className="row gap8 wrap">
              <button className="btn primary small" onClick={() => updateSettings({ userCss: css })} disabled={css === s.userCss}>
                Применить
              </button>
              <button className="btn small ghost" disabled={!css && !s.userCss} onClick={() => (setCss(''), updateSettings({ userCss: '' }))}>
                Очистить
              </button>
            </div>
            <span className="small muted">Для тех, кто умеет. Переменные: --accent, --bg, --surface, --ink, --radius, --body. Ссылки на интернет не работают.</span>
          </div>
        </Collapse>
      </div>
      {err && <div className="hint warn">{err}</div>}
      <input
        ref={fileRef}
        type="file"
        accept={MOD_EXT + ',.json'}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
