// «Моды»: маленькие программы, которые добавляют Мнеме новые возможности.
// Безопасный режим — ни один мод не работает и ничего нельзя поставить, пока не разрешишь.
import { useEffect, useRef, useState } from 'react';
import { CATALOG_PLUGINS, TEMPLATE } from '../plugins/catalog';
import { parseHeader, reloadPlugin, usePlugins } from '../plugins/host';
import { downloadFile } from '../share';
import { updateSettings, useData } from '../store';
import type { PluginRec, Route } from '../types';
import { Icon, Modal, MoreMenu, Segmented, Switch, toast } from './ui';
import { PaneHead } from './SettingsKit';

function recFromCode(code: string, prev?: PluginRec): PluginRec {
  const h = parseHeader(code);
  const id = (prev?.id ?? h.id ?? 'mod-' + Math.random().toString(36).slice(2, 8)).replace(/[^\w-]/g, '').slice(0, 40) || 'mod';
  return {
    id,
    name: (h.name ?? prev?.name ?? 'Мой мод').slice(0, 60),
    version: (h.version ?? '1.0').slice(0, 20),
    author: h.author?.slice(0, 40),
    description: (h.description ?? prev?.description ?? '').slice(0, 300),
    icon: [...(h.icon ?? prev?.icon ?? '🧩')].slice(0, 2).join(''),
    code: code.slice(0, 300000),
    enabled: prev?.enabled ?? true,
    fromCatalog: prev?.fromCatalog
  };
}

function SettingsMount({ id }: { id: string }) {
  const reg = usePlugins();
  const ref = useRef<HTMLDivElement>(null);
  const render = reg.settingsTabs.get(id);
  useEffect(() => {
    if (!ref.current || !render) return;
    ref.current.innerHTML = '';
    let cleanup: void | (() => void);
    try {
      cleanup = render(ref.current);
    } catch (e) {
      ref.current.textContent = 'Ошибка мода: ' + (e as Error).message;
    }
    return () => {
      try {
        cleanup?.();
      } catch {
        /* мод */
      }
    };
  }, [render]);
  if (!render) return <span className="small muted">У этого мода нет своих настроек.</span>;
  return <div ref={ref} className="plugin-settings" />;
}

export function CodeEditor({ initial, onClose }: { initial?: PluginRec; onClose: () => void }) {
  const data = useData();
  const [code, setCode] = useState(initial?.code ?? TEMPLATE);
  const save = async () => {
    const rec = recFromCode(code, initial);
    if (!initial && data.settings.plugins.some((p) => p.id === rec.id)) rec.id = rec.id + '-' + Math.random().toString(36).slice(2, 5);
    const list = initial ? data.settings.plugins.map((p) => (p.id === initial.id ? rec : p)) : [...data.settings.plugins, rec];
    updateSettings({ plugins: list });
    await reloadPlugin(rec.id);
    toast(`Мод «${rec.name}» сохранён`);
    onClose();
  };
  return (
    <Modal title={initial ? `Код: ${initial.name}` : 'Новый мод'} onClose={onClose} width={860} sticky>
      <div className="stack gap8">
        <p className="small muted">
          Мод — это JavaScript с <code>export default {'{ onload(app) { … } }'}</code>. Имя, значок и описание — в строках <code>// @name</code>, <code>// @icon</code>, <code>// @description</code>. Что умеет <code>app</code> — в «Справке → Моды».
        </p>
        <textarea
          className="input code-area"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const t = e.currentTarget;
              const a = t.selectionStart;
              setCode(code.slice(0, a) + '  ' + code.slice(t.selectionEnd));
              requestAnimationFrame(() => (t.selectionStart = t.selectionEnd = a + 2));
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              void save();
            }
          }}
        />
        <div className="row end gap8">
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={() => void save()}>
            Сохранить и запустить
          </button>
        </div>
      </div>
    </Modal>
  );
}

type Tab = 'installed' | 'catalog' | 'own';

export function PluginsSettings({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const s = data.settings;
  const reg = usePlugins();
  const [ask, setAsk] = useState(false);
  const [editing, setEditing] = useState<PluginRec | 'new' | null>(null);
  const [settingsOf, setSettingsOf] = useState<PluginRec | null>(null);
  const [tab, setTab] = useState<Tab>(s.plugins.length ? 'installed' : 'catalog');
  const fileRef = useRef<HTMLInputElement>(null);
  const installed = new Set(s.plugins.map((p) => p.id));
  const setPlugins = (plugins: PluginRec[]) => updateSettings({ plugins });
  const toggle = (p: PluginRec, on: boolean) => setPlugins(s.plugins.map((x) => (x.id === p.id ? { ...x, enabled: on } : x)));

  const allowModal = ask && (
    <Modal title="Разрешить моды?" onClose={() => setAsk(false)}>
      <div className="stack gap12">
        <p>Мод — это программа. Он может читать и менять твои конспекты и карточки, а если включён ИИ или облако — отправлять данные в интернет.</p>
        <p>Готовые моды из каталога проверены. Моды из файлов ставь только от тех, кому доверяешь.</p>
        <div className="row end gap8">
          <button className="btn ghost" onClick={() => setAsk(false)}>
            Не надо
          </button>
          <button
            className="btn primary"
            onClick={() => {
              updateSettings({ pluginsSafe: false });
              setAsk(false);
            }}
          >
            Разрешить
          </button>
        </div>
      </div>
    </Modal>
  );

  if (s.pluginsSafe) {
    return (
      <div className="stack gap16">
        <PaneHead title="Моды" text="Моды добавляют Мнеме новые возможности: свои экраны, команды и кнопки." />
        <div className="safe-card">
          <span className="safe-ico">
            <Icon name="shield" size={30} />
          </span>
          <strong>Моды выключены</strong>
          <p className="muted">Сейчас ни один мод не работает, и новые поставить нельзя. Так безопаснее: мод — это программа, и она видит твои данные.</p>
          {s.plugins.length > 0 && <span className="small muted">Установлено: {s.plugins.length} — ждут, пока разрешишь</span>}
          <button className="btn primary" onClick={() => setAsk(true)}>
            Разрешить моды
          </button>
        </div>
        {allowModal}
      </div>
    );
  }

  return (
    <div className="stack gap16">
      <PaneHead title="Моды" text="Моды добавляют Мнеме новые возможности: свои экраны, команды и кнопки.">
        <button className="btn small ghost" onClick={() => updateSettings({ pluginsSafe: true })} title="Все моды перестанут работать">
          <Icon name="shield" size={16} /> Выключить моды
        </button>
      </PaneHead>
      <div className="ctl-seg tabs-seg">
        <Segmented
          ariaLabel="Моды"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'installed', label: `Мои · ${s.plugins.length}` },
            { value: 'catalog', label: 'Каталог' },
            { value: 'own', label: 'Сделать свой' }
          ]}
        />
      </div>

      {tab === 'installed' && (
        <div className="plug-list tab-pane" key="installed">
          {s.plugins.length === 0 && (
            <div className="empty-soft">
              Модов пока нет.{' '}
              <button className="link-btn" onClick={() => setTab('catalog')}>
                Открыть каталог
              </button>
            </div>
          )}
          {s.plugins.map((p) => {
            const err = reg.errors.get(p.id);
            const running = reg.loaded.has(p.id);
            return (
              <div key={p.id} className={'plug-row' + (p.enabled ? ' on' : '')}>
                <span className="plug-ico">{p.icon ?? parseHeader(p.code).icon ?? '🧩'}</span>
                <div className="plug-text">
                  <strong>{p.name}</strong>
                  <span className="small muted clamp">{p.description}</span>
                  {err ? <span className="small err-text">Ошибка: {err}</span> : p.enabled && !running ? <span className="small muted">Запускается…</span> : null}
                </div>
                <MoreMenu
                  label={`Действия с модом ${p.name}`}
                  items={[
                    { label: 'Настройки мода', icon: 'sliders', onClick: () => setSettingsOf(p), hidden: !reg.settingsTabs.has(p.id) },
                    { label: 'Открыть код', icon: 'code', onClick: () => setEditing(p) },
                    { label: 'Сохранить файлом', icon: 'share', onClick: () => downloadFile(p.id + '.js', p.code, 'text/javascript') },
                    {
                      label: 'Удалить',
                      icon: 'trash',
                      danger: true,
                      onClick: () => {
                        setPlugins(s.plugins.filter((x) => x.id !== p.id));
                        toast(`Мод «${p.name}» удалён`);
                      }
                    }
                  ]}
                />
                <Switch label={p.name} checked={p.enabled} onChange={(v) => toggle(p, v)} />
              </div>
            );
          })}
        </div>
      )}

      {tab === 'catalog' && (
        <div className="plug-grid tab-pane" key="catalog">
          {CATALOG_PLUGINS.map((c) => {
            const has = installed.has(c.id);
            return (
              <div key={c.id} className="plug-card">
                <div className="row gap12">
                  <span className="plug-ico">{parseHeader(c.code).icon ?? '🧩'}</span>
                  <strong className="grow">{c.name}</strong>
                </div>
                <span className="small muted grow">{c.description}</span>
                <div className="row end">
                  {has ? (
                    <span className="small muted row gap4">
                      <Icon name="check" size={16} /> Установлен
                    </span>
                  ) : (
                    <button
                      className="btn small"
                      onClick={() => {
                        setPlugins([...s.plugins, { ...recFromCode(c.code), fromCatalog: true }]);
                        toast(`Мод «${c.name}» установлен и работает`);
                      }}
                    >
                      Установить
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'own' && (
        <div className="own-grid tab-pane" key="own">
          <button className="own-tile" onClick={() => setEditing('new')}>
            <Icon name="code" size={24} />
            <strong>Написать мод</strong>
            <span className="small muted">Откроется редактор с готовым примером</span>
          </button>
          <button className="own-tile" onClick={() => fileRef.current?.click()}>
            <Icon name="folder" size={24} />
            <strong>Загрузить файл .js</strong>
            <span className="small muted">Мод от друга — добавится выключенным</span>
          </button>
          <button className="own-tile" onClick={() => go({ name: 'help', section: 'mods' })}>
            <Icon name="help" size={24} />
            <strong>Как писать моды</strong>
            <span className="small muted">Пример и всё, что умеет мод</span>
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".js,.mjs,text/javascript"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const code = await f.text();
          if (!/onload/.test(code)) return toast('Это не похоже на мод: нет onload(app)');
          const rec = recFromCode(code);
          if (s.plugins.some((p) => p.id === rec.id)) rec.id += '-' + Math.random().toString(36).slice(2, 5);
          setPlugins([...s.plugins, { ...rec, enabled: false }]);
          setTab('installed');
          toast(`Мод «${rec.name}» добавлен выключенным — посмотри код и включи, если доверяешь`);
        }}
      />
      {settingsOf && (
        <Modal title={`Настройки: ${settingsOf.name}`} onClose={() => setSettingsOf(null)}>
          <SettingsMount id={settingsOf.id} />
        </Modal>
      )}
      {editing && <CodeEditor initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
