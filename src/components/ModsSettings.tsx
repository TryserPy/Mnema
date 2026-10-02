// «Стили»: готовые наборы внешнего вида. Включил — сразу видно в предпросмотре; выключил — всё как было.
import { useRef, useState } from 'react';
import { allMods, CATALOG, isMod, MOD_EXT, sanitizeCss } from '../mods';
import { downloadFile } from '../share';
import { getData, updateSettings, useData } from '../store';
import { FONTS } from '../themes';
import type { Mod } from '../types';
import { Collapse, Icon, Switch, toast } from './ui';
import { Group, PaneHead, SRow } from './SettingsKit';

/** Маленький кусочек Мнемы из настоящих элементов — стили меняют его так же, как всё приложение. */
function StylePreview() {
  return (
    <div className="style-preview" aria-hidden="true">
      <div className="hero sp-hero-mini">
        <span className="hero-label">На сегодня</span>
        <span className="row gap8 end-align">
          <span className="hero-num small-num">12</span>
          <span className="hero-sub">карточек · 4 мин</span>
        </span>
        <span className="hero-btn">▶ Начать</span>
      </div>
      <div className="review-card sp-review">
        <div className="question">Что такое фотосинтез?</div>
        <div className="divider" />
        <div className="answer-text">Образование веществ из углекислого газа и воды на свету.</div>
      </div>
      <div className="grades">
        <span className="grade again">Не помню</span>
        <span className="grade hard">Трудно</span>
        <span className="grade good">Помню</span>
        <span className="grade easy">Легко</span>
      </div>
      <div className="note-page sp-note">
        <div className="note-doc">
          <p>
            <strong>Сила тока</strong> прямо пропорциональна напряжению.
          </p>
        </div>
      </div>
      <div className="row gap8 wrap">
        <span className="btn primary small">Кнопка</span>
        <span className="btn small">Ещё кнопка</span>
        <span className="switch on">
          <span />
        </span>
      </div>
    </div>
  );
}

/** Наборы стилей. `embedded` — внутри экрана «Оформление» (свой заголовок вместо шапки раздела). */
export function StylesSettings({ embedded = false }: { embedded?: boolean } = {}) {
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
  const onCount = list.filter((m) => s.modsOn.includes(m.id)).length;
  const offAll =
    onCount > 0 ? (
      <button className="btn small ghost" onClick={() => list.filter((m) => s.modsOn.includes(m.id)).forEach((m) => toggle(m, false))}>
        Выключить все
      </button>
    ) : null;
  return (
    <div className="stack gap16">
      {embedded ? (
        <div className="row between gap8 wrap" data-set="styles">
          <div className="stack gap4 grow">
            <h3 className="sgroup-title">Ещё стили</h3>
            <p className="small muted">Готовые наборы внешнего вида: тетрадь, крупные кнопки, стикеры… Можно включать несколько сразу, а выключишь — всё станет как было.</p>
          </div>
          {offAll}
        </div>
      ) : (
        <PaneHead title="Стили" text="Готовые наборы внешнего вида. Можно включать несколько сразу, а выключишь — всё станет как было.">
          {offAll}
        </PaneHead>
      )}
      <div className="styles-layout">
        <div className="style-list">
          {list.map((m, i) => {
            const on = s.modsOn.includes(m.id);
            const mine = !CATALOG.some((c) => c.id === m.id);
            return (
              <label key={m.id} className={'style-item' + (on ? ' on' : '')} style={{ animationDelay: Math.min(i, 10) * 25 + 'ms' }}>
                <span className="style-emoji" aria-hidden="true">
                  {m.icon ?? '🎨'}
                </span>
                <span className="style-body">
                  <span className="style-name">
                    <strong>{m.name}</strong>
                    {m.where && <span className="tag soft">{m.where}</span>}
                  </span>
                  <span className="small muted" title={m.description}>
                    {m.description}
                  </span>
                  <span className="style-meta">
                    {mine && (
                      <button
                        type="button"
                        className="link-btn small"
                        onClick={(e) => {
                          e.preventDefault();
                          if (on) toggle(m, false);
                          updateSettings({ customMods: s.customMods.filter((x) => x.id !== m.id), modsOn: s.modsOn.filter((x) => x !== m.id) });
                        }}
                      >
                        Удалить
                      </button>
                    )}
                  </span>
                </span>
                <Switch label={m.name} checked={on} onChange={(v) => toggle(m, v)} />
              </label>
            );
          })}
        </div>
        <div className="preview-col">
          <span className="sgroup-title">Предпросмотр</span>
          <StylePreview />
        </div>
      </div>
      <Group title="Свои стили">
        <SRow label="Стиль из файла" hint={`Файл ${MOD_EXT} от друга`}>
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            <Icon name="folder" size={16} /> Выбрать
          </button>
        </SRow>
        <SRow label="Поделиться своим оформлением" hint="Сохранит тему, цвета и свой CSS в файл">
          <button className="btn small" onClick={exportMine}>
            <Icon name="share" size={16} /> Сохранить
          </button>
        </SRow>
        <button className="srow srow-btn" aria-expanded={cssOpen} onClick={() => setCssOpen(!cssOpen)}>
          <span className="srow-text">
            <span className="srow-label">Свой CSS</span>
            <span className="srow-hint">Для тех, кто умеет</span>
          </span>
          <span className={'chev' + (cssOpen ? ' open' : '')}>›</span>
        </button>
        <Collapse open={cssOpen}>
          <div className="srow stack-row">
            <textarea className="input css-area" spellCheck={false} value={css} onChange={(e) => setCss(e.target.value)} placeholder={'.hero { background: linear-gradient(135deg, var(--accent), #C2417A); }'} />
            <div className="row gap8 wrap">
              <button className="btn primary small" onClick={() => updateSettings({ userCss: css })} disabled={css === s.userCss}>
                Применить
              </button>
              <button className="btn small ghost" disabled={!css && !s.userCss} onClick={() => (setCss(''), updateSettings({ userCss: '' }))}>
                Очистить
              </button>
            </div>
            <span className="small muted">Переменные: --accent, --bg, --surface, --ink, --radius, --body. Ссылки на интернет не работают.</span>
          </div>
        </Collapse>
      </Group>
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
