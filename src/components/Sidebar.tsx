// Левая панель: предметы → темы → подтемы. Её можно тянуть по ширине и сворачивать,
// темы — перетаскивать (порядок, в другой предмет, внутрь другой темы), отмечать звёздочкой.
import { useEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from 'react';
import { keyFor, prettyCombo } from '../keys';
import { groupOf } from '../homework';
import { usePlugins } from '../plugins/host';
import { addTopic, childTopics, getData, setSubjectFolder, sortedFolders, subjectRules, moveSubject, moveTopic, sortedSubjects, toggleTreeOpen, updateSettings, updateTopic, useData } from '../store';
import type { AppData, Folder, Route, Subject, Topic } from '../types';
import { DeleteSubject, deleteTopicWithUndo, EditFolder, EditSubject } from './SubjectDialogs';
import { Collapse, Icon, SubjectMark, usePresence } from './ui';

type Drop = { id: string; where: 'before' | 'after' | 'inside' } | null;
type Drag = { kind: 'topic' | 'subject'; id: string } | null;
export type AddingAt = { subjectId: string; parentId?: string } | null;

function activePath(data: AppData, route: Route): Set<string> {
  const out = new Set<string>();
  const addSubject = (id: string) => {
    out.add(id);
    const f = data.subjects.find((x) => x.id === id)?.folderId;
    if (f) out.add(f);
  };
  if (route.name === 'subject') addSubject(route.id);
  if (route.name === 'topic') {
    let t = data.topics.find((x) => x.id === route.id);
    if (t) addSubject(t.subjectId);
    while (t?.parentId) {
      out.add(t.parentId);
      t = data.topics.find((x) => x.id === t!.parentId);
    }
  }
  return out;
}

export function Sidebar({
  route,
  go,
  dueAll,
  adding,
  setAdding,
  onNewSubject,
  onSearch,
  mobile = false
}: {
  route: Route;
  go: (r: Route) => void;
  dueAll: number;
  adding: AddingAt;
  setAdding: (a: AddingAt) => void;
  onNewSubject: (o?: { folderId?: string; as?: 'subject' | 'folder' }) => void;
  onSearch?: () => void;
  mobile?: boolean;
}) {
  const data = useData();
  const s = data.settings;
  const [drag, setDrag] = useState<Drag>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; topic?: Topic; subject?: Subject; folder?: Folder } | null>(null);
  const lastMenu = useRef(menu);
  if (menu) lastMenu.current = menu;
  const menuPres = usePresence(Boolean(menu), 120);
  const shownMenu = menu ?? (menuPres.mounted ? lastMenu.current : null);
  const [editSubj, setEditSubj] = useState<string | null>(null);
  const [editFolder, setEditFolder] = useState<string | null>(null);
  const [delSubj, setDelSubj] = useState<string | null>(null);
  const openMenuAt = (el: HTMLElement, m: { topic?: Topic; subject?: Subject; folder?: Folder }) => {
    const r = el.getBoundingClientRect();
    setMenu({ x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 4, ...m });
  };
  const [resizing, setResizing] = useState(false);
  const autoOpen = activePath(data, route);
  const isOpen = (id: string) => s.treeOpen.includes(id) || autoOpen.has(id);
  const nav = (name: Route['name']) => (route.name === name ? ' on' : '');
  const subjects = sortedSubjects(data);
  const plugins = usePlugins();
  const [modsOpen, setModsOpen] = useState(false);
  const modsPres = usePresence(modsOpen, 140);
  useEffect(() => {
    if (!modsOpen) return;
    const close = () => setModsOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [modsOpen]);
  const hwSoon = data.homework.filter((h) => !h.done && ['overdue', 'today', 'tomorrow'].includes(groupOf(h))).length;

  // Ширина: тянем правый край.
  function startResize(e: RPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = s.sidebarWidth;
    setResizing(true);
    const move = (ev: PointerEvent) => {
      const w = Math.round(Math.min(440, Math.max(190, startW + ev.clientX - startX)));
      document.documentElement.style.setProperty('--side-w', w + 'px');
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setResizing(false);
      const w = Math.round(Math.min(440, Math.max(190, startW + ev.clientX - startX)));
      updateSettings({ sidebarWidth: w });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  useEffect(() => {
    document.documentElement.style.setProperty('--side-w', s.sidebarWidth + 'px');
  }, [s.sidebarWidth]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  // ---------- Перетаскивание ----------
  function zone(e: DragEvent, allowInside: boolean): 'before' | 'after' | 'inside' {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (!allowInside) return y < 0.5 ? 'before' : 'after';
    return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside';
  }
  function overTopic(e: DragEvent, t: Topic) {
    if (!drag) return;
    if (drag.kind === 'topic' && drag.id === t.id) return;
    if (drag.kind === 'subject') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const w = zone(e, true);
    if (drop?.id !== t.id || drop.where !== w) setDrop({ id: t.id, where: w });
  }
  function overSubject(e: DragEvent, sub: Subject) {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const w = drag.kind === 'subject' ? zone(e, false) : 'inside';
    if (drop?.id !== sub.id || drop.where !== w) setDrop({ id: sub.id, where: w });
  }
  function dropOnTopic(e: DragEvent, t: Topic) {
    e.preventDefault();
    if (!drag || drag.kind !== 'topic' || !drop) return finish();
    if (drop.where === 'inside') moveTopic(drag.id, { subjectId: t.subjectId, parentId: t.id });
    else moveTopic(drag.id, { subjectId: t.subjectId, parentId: t.parentId, [drop.where === 'before' ? 'beforeId' : 'afterId']: t.id });
    finish();
  }
  function dropOnSubject(e: DragEvent, sub: Subject) {
    e.preventDefault();
    if (!drag || !drop) return finish();
    if (drag.kind === 'topic') {
      moveTopic(drag.id, { subjectId: sub.id });
      toggleTreeOpen(sub.id, true);
    } else if (drag.id !== sub.id) {
      const dragged = getData().subjects.find((x) => x.id === drag.id);
      if (dragged && dragged.folderId !== sub.folderId) setSubjectFolder(drag.id, sub.folderId);
      const list = sortedSubjects(getData());
      const i = list.findIndex((x) => x.id === sub.id);
      moveSubject(drag.id, drop.where === 'before' ? sub.id : list[i + 1]?.id);
    }
    finish();
  }
  function finish() {
    setDrag(null);
    setDrop(null);
  }
  const dropCls = (id: string) => (drop?.id === id ? ' drop-' + drop.where : '');

  // ---------- Строки ----------
  function renderTopic(t: Topic, depth: number) {
    const kids = childTopics(data, t.subjectId, t.id);
    const open = kids.length > 0 && isOpen(t.id);
    const on = route.name === 'topic' && route.id === t.id;
    return (
      <div key={t.id} className="tree-node">
        <div
          className={'tree-row' + (on ? ' on' : '') + (drag?.id === t.id ? ' dragging' : '') + dropCls(t.id)}
          style={{ paddingLeft: 10 + depth * 16 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', t.name);
            setDrag({ kind: 'topic', id: t.id });
          }}
          onDragEnd={finish}
          onDragOver={(e) => overTopic(e, t)}
          onDrop={(e) => dropOnTopic(e, t)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, topic: t });
          }}
        >
          <button
            className={'twisty' + (open ? ' open' : '') + (kids.length ? '' : ' leaf')}
            aria-label={open ? 'Свернуть' : 'Развернуть'}
            tabIndex={kids.length ? 0 : -1}
            onClick={() => kids.length && toggleTreeOpen(t.id, !open)}
          >
            <Icon name="chevron" size={14} />
          </button>
          <button className="tree-label" onClick={() => go({ name: 'topic', id: t.id })} title={t.name}>
            <span className="grow clamp1">{t.name}</span>
          </button>
          <button
            className={'star-btn' + (t.important ? ' on' : '')}
            aria-label={t.important ? 'Убрать из важных' : 'Отметить важной'}
            title={t.important ? 'Важная тема' : 'Отметить важной'}
            onClick={() => updateTopic(t.id, { important: !t.important })}
          >
            <Icon name={t.important ? 'starFill' : 'star'} size={15} />
          </button>
          <button className="row-add" aria-label="Добавить подтему" title="Добавить подтему" onClick={() => setAdding({ subjectId: t.subjectId, parentId: t.id })}>
            <Icon name="plus" size={15} />
          </button>
          <button className="row-more" aria-label={`Ещё о теме «${t.name}»`} title="Ещё" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => openMenuAt(e.currentTarget, { topic: t })}>
            <Icon name="dots" size={15} />
          </button>
        </div>
        <Collapse open={open || (adding?.parentId === t.id && adding.subjectId === t.subjectId)}>
          <div className="tree-children">
            {kids.map((k) => renderTopic(k, depth + 1))}
            {adding?.parentId === t.id && <AddRow depth={depth + 1} placeholder="Подтема" adding={adding} setAdding={setAdding} go={go} />}
          </div>
        </Collapse>
      </div>
    );
  }

  function renderSubject(sub: Subject, level: number) {
          const roots = childTopics(data, sub.id);
          const open = isOpen(sub.id);
          const on = route.name === 'subject' && route.id === sub.id;
          return (
            <div key={sub.id} className="tree-group">
              <div
                style={level ? { paddingLeft: 10 + level * 16 } : undefined}
                className={'tree-row subject' + (on ? ' on' : '') + (drag?.id === sub.id ? ' dragging' : '') + dropCls(sub.id)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', sub.name);
                  setDrag({ kind: 'subject', id: sub.id });
                }}
                onDragEnd={finish}
                onDragOver={(e) => overSubject(e, sub)}
                onDrop={(e) => dropOnSubject(e, sub)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, subject: sub });
                }}
              >
                <button className={'twisty' + (open ? ' open' : '') + (roots.length ? '' : ' leaf')} aria-label={open ? 'Свернуть' : 'Развернуть'} onClick={() => toggleTreeOpen(sub.id, !open)}>
                  <Icon name="chevron" size={14} />
                </button>
                <button className="tree-label" onClick={() => go({ name: 'subject', id: sub.id })}>
                  <SubjectMark color={sub.color} icon={sub.icon} />
                  <span className="grow clamp1">{sub.name}</span>
                  <span className="muted small count">{roots.length || ''}</span>
                </button>
                <button
                  className="row-add"
                  aria-label="Добавить тему"
                  title="Добавить тему"
                  onClick={() => {
                    toggleTreeOpen(sub.id, true);
                    setAdding({ subjectId: sub.id });
                  }}
                >
                  <Icon name="plus" size={15} />
                </button>
                <button className="row-more" aria-label={`Ещё о предмете «${sub.name}»`} title="Изменить или удалить предмет" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => openMenuAt(e.currentTarget, { subject: sub })}>
                  <Icon name="dots" size={15} />
                </button>
              </div>
              <Collapse open={open || (adding?.subjectId === sub.id && !adding.parentId)}>
                <div className="tree-children">
                  {roots.map((t) => renderTopic(t, 1 + level))}
                  {s.features.rules && subjectRules(data, sub.id).length > 0 && (
                    <div className="tree-node">
                      <div className={'tree-row rules-row' + (route.name === 'subject' && route.id === sub.id && route.view === 'rules' ? ' on' : '')} style={{ paddingLeft: 26 + level * 16 }}>
                        <button className="tree-label" onClick={() => go({ name: 'subject', id: sub.id, view: 'rules' })}>
                          <Icon name="rules" size={15} />
                          <span className="grow clamp1">Правила</span>
                          <span className="muted small count">{subjectRules(data, sub.id).length}</span>
                        </button>
                      </div>
                    </div>
                  )}
                  {adding?.subjectId === sub.id && !adding.parentId && <AddRow depth={1 + level} placeholder="Новая тема, например §12" adding={adding} setAdding={setAdding} go={go} />}
                </div>
              </Collapse>
            </div>
          );
  }

  function renderFolder(f: Folder) {
    const inside = subjects.filter((x) => x.folderId === f.id);
    const open = isOpen(f.id);
    const on = route.name === 'folder' && route.id === f.id;
    return (
      <div key={f.id} className="tree-group folder-group">
        <div
          className={'tree-row folder' + (on ? ' on' : '') + dropCls(f.id)}
          onDragOver={(e) => {
            if (drag?.kind !== 'subject') return;
            e.preventDefault();
            if (drop?.id !== f.id) setDrop({ id: f.id, where: 'inside' });
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag?.kind === 'subject') {
              setSubjectFolder(drag.id, f.id);
              toggleTreeOpen(f.id, true);
            }
            finish();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, folder: f });
          }}
        >
          <button className={'twisty' + (open ? ' open' : '') + (inside.length ? '' : ' leaf')} aria-label={open ? 'Свернуть' : 'Развернуть'} onClick={() => toggleTreeOpen(f.id, !open)}>
            <Icon name="chevron" size={14} />
          </button>
          <button className="tree-label" onClick={() => (toggleTreeOpen(f.id, true), go({ name: 'folder', id: f.id }))}>
            {f.icon ? <SubjectMark color={f.color} icon={f.icon} /> : <Icon name="folder" size={16} />}
            <span className="grow clamp1 folder-name">{f.name}</span>
            <span className="muted small count">{inside.length || ''}</span>
          </button>
          <button className="row-add" aria-label="Новый предмет в папке" title="Новый предмет в папке" onClick={() => onNewSubject({ folderId: f.id })}>
            <Icon name="plus" size={15} />
          </button>
          <button className="row-more" aria-label={`Ещё о папке «${f.name}»`} title="Изменить или удалить папку" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => openMenuAt(e.currentTarget, { folder: f })}>
            <Icon name="dots" size={15} />
          </button>
        </div>
        <Collapse open={open}>
          <div className="tree-children folder-children" style={{ ['--fc' as string]: f.color }}>
            {inside.map((x) => renderSubject(x, 1))}
            {inside.length === 0 && <p className="tree-hint in-folder">Перетащи сюда предмет или нажми «+».</p>}
          </div>
        </Collapse>
      </div>
    );
  }

  // ---------- Свёрнутая панель ----------
  if (s.sidebarCollapsed && !mobile) {
    return (
      <aside className="sidebar rail">
        <button className="logo" title="Показать панель" aria-label="Показать панель" onClick={() => updateSettings({ sidebarCollapsed: false })}>
          М
        </button>
        <button className={'foot-btn' + nav('today')} title="Сегодня" aria-label="Сегодня" onClick={() => go({ name: 'today' })}>
          <Icon name="home" />
          {dueAll > 0 && <span className="rail-badge">{dueAll > 99 ? '99+' : dueAll}</span>}
        </button>
        <div className="rail-subjects">
          {subjects.map((sub) => (
            <button key={sub.id} className={'rail-subj' + (autoOpen.has(sub.id) ? ' on' : '')} title={sub.name} aria-label={sub.name} onClick={() => go({ name: 'subject', id: sub.id })}>
              <span style={{ background: sub.color }}>{sub.name.slice(0, 1).toUpperCase()}</span>
            </button>
          ))}
        </div>
        <div className="rail-foot">
          <FootButtons />
        </div>
      </aside>
    );
  }

  function FootButtons() {
    const modItems = plugins.views.length + plugins.buttons.length;
    return (
      <>
        <button className={'foot-btn' + nav('stats')} title="Статистика" aria-label="Статистика" onClick={() => go({ name: 'stats' })}>
          <Icon name="chart" />
        </button>
        <button className={'foot-btn' + (route.name === 'features' || (route.name === 'settings' && route.section === 'features') ? ' on' : '')} title="Возможности" aria-label="Возможности" onClick={() => go({ name: 'features' })}>
          <Icon name="grid" />
        </button>
        {modItems > 0 && (
          <div className="more foot-more">
            <button className={'foot-btn' + (route.name === 'plugin' || modsOpen ? ' on' : '')} title="Моды" aria-label="Моды" aria-expanded={modsOpen} onClick={() => setModsOpen(!modsOpen)}>
              <Icon name="puzzle" />
            </button>
            {modsPres.mounted && (
              <div className={'menu up' + (modsPres.closing ? ' closing' : '')} role="menu" onMouseDown={(e) => e.stopPropagation()}>
                <span className="menu-title">Моды</span>
                {plugins.views.map((v) => (
                  <button key={v.id} role="menuitem" onClick={() => (setModsOpen(false), go({ name: 'plugin', id: v.id }))}>
                    <span className="menu-ico">{v.icon}</span> <span className="clamp1">{v.title}</span>
                  </button>
                ))}
                {plugins.buttons.map((b) => (
                  <button key={b.id} role="menuitem" onClick={() => (setModsOpen(false), b.onClick())}>
                    <span className="menu-ico">{b.icon}</span> <span className="clamp1">{b.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button className={'foot-btn' + (route.name === 'settings' && route.section !== 'features' ? ' on' : '')} title="Настройки" aria-label="Настройки" onClick={() => go({ name: 'settings' })}>
          <Icon name="sliders" />
        </button>
        <button className={'foot-btn' + nav('help')} title="Справка" aria-label="Справка" onClick={() => go({ name: 'help' })}>
          <Icon name="help" />
        </button>
      </>
    );
  }

  const hideKey = keyFor(s, 'toggleSidebar');

  return (
    <aside className={'sidebar' + (resizing ? ' resizing' : '')}>
      <div className="brand">
        <span className="logo">М</span>
        <span className="grow">Мнема</span>
        {/* На телефоне панель — это шторка, её закрывают касанием мимо; кнопки «Скрыть» там нет. */}
        {!mobile && (
          <button
            className="icon-btn small collapse-btn"
            aria-label="Скрыть панель"
            title={'Скрыть панель' + (hideKey ? ` (${prettyCombo(hideKey).join('+')})` : '')}
            onClick={() => updateSettings({ sidebarCollapsed: true })}
          >
            <Icon name="panel" size={18} />
          </button>
        )}
      </div>
      <nav className="nav">
        <button className={'nav-item' + nav('today')} onClick={() => go({ name: 'today' })}>
          <Icon name="home" /> <span className="grow">Сегодня</span>
          {dueAll > 0 && <span className="badge pop" key={dueAll}>{dueAll}</span>}
        </button>
        {onSearch && (
          <button className="nav-item search-item" onClick={onSearch} title="Поиск по всему и команды">
            <Icon name="search" /> <span className="grow">Поиск</span>
            {!mobile && <kbd className="nav-kbd">{prettyCombo(keyFor(s, 'palette')).join('+')}</kbd>}
          </button>
        )}
        {s.features.homework && (
          <button className={'nav-item' + nav('homework')} onClick={() => go({ name: 'homework' })}>
            <Icon name="homework" /> <span className="grow">Домашка</span>
            {hwSoon > 0 && (
              <span className="badge soft pop" key={'hw' + hwSoon} title="На сегодня, завтра и просроченное">
                {hwSoon}
              </span>
            )}
          </button>
        )}
      </nav>
      <div className="side-head">
        <span>Предметы</span>
        <span className="row gap2">
          <button className="icon-btn small" aria-label="Новая папка" title="Новая папка предметов" onClick={() => onNewSubject({ as: 'folder' })}>
            <Icon name="folderPlus" size={18} />
          </button>
          <button className="icon-btn small" aria-label="Добавить предмет" title="Добавить предмет" onClick={() => onNewSubject()}>
            <Icon name="plus" size={18} />
          </button>
        </span>
      </div>
      <div className="tree" onDragLeave={(e) => e.currentTarget === e.target && setDrop(null)}>
        {sortedFolders(data).map((f) => renderFolder(f))}
        {subjects.filter((x) => !x.folderId || !data.folders.some((f) => f.id === x.folderId)).map((sub) => renderSubject(sub, 0))}
        {data.subjects.length === 0 && (
          <button className="tree-add" onClick={() => onNewSubject()}>
            + Добавить предмет
          </button>
        )}
      </div>
      <div className="side-foot">
        <FootButtons />
      </div>
      {!mobile && <div className="side-resize" role="separator" aria-orientation="vertical" aria-label="Ширина панели" title="Потяни, чтобы изменить ширину. Двойной щелчок — как было." onPointerDown={startResize} onDoubleClick={() => updateSettings({ sidebarWidth: 248 })} />}

      {shownMenu && shownMenu.folder && (
        <div className={'menu ctx' + (menuPres.closing ? ' closing' : '')} role="menu" style={{ left: Math.min(shownMenu.x, window.innerWidth - 260), top: Math.min(shownMenu.y, window.innerHeight - 240) }} onMouseDown={(e) => e.stopPropagation()}>
          <button
            role="menuitem"
            onClick={() => {
              onNewSubject({ folderId: shownMenu.folder!.id });
              setMenu(null);
            }}
          >
            <Icon name="plus" size={18} /> Новый предмет в папке
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setEditFolder(shownMenu.folder!.id);
              setMenu(null);
            }}
          >
            <Icon name="edit" size={18} /> Изменить или удалить папку
          </button>
        </div>
      )}
      {shownMenu && shownMenu.subject && (
        <div className={'menu ctx' + (menuPres.closing ? ' closing' : '')} role="menu" style={{ left: Math.min(shownMenu.x, window.innerWidth - 260), top: Math.min(shownMenu.y, window.innerHeight - 240) }} onMouseDown={(e) => e.stopPropagation()}>
          <button
            role="menuitem"
            onClick={() => {
              toggleTreeOpen(shownMenu.subject!.id, true);
              setAdding({ subjectId: shownMenu.subject!.id });
              setMenu(null);
            }}
          >
            <Icon name="plus" size={18} /> Новая тема
          </button>
          {shownMenu.subject.folderId && (
            <button
              role="menuitem"
              onClick={() => {
                setSubjectFolder(shownMenu.subject!.id, undefined);
                setMenu(null);
              }}
            >
              <Icon name="folder" size={18} /> Вынуть из папки
            </button>
          )}
          {s.features.rules && (
            <button
              role="menuitem"
              onClick={() => {
                go({ name: 'subject', id: shownMenu.subject!.id, view: 'rules' });
                setMenu(null);
              }}
            >
              <Icon name="rules" size={18} /> Правила предмета
            </button>
          )}
          <button
            role="menuitem"
            onClick={() => {
              setEditSubj(shownMenu.subject!.id);
              setMenu(null);
            }}
          >
            <Icon name="edit" size={18} /> Изменить название и цвет
          </button>
          <button
            role="menuitem"
            className="danger"
            onClick={() => {
              setDelSubj(shownMenu.subject!.id);
              setMenu(null);
            }}
          >
            <Icon name="trash" size={18} /> Удалить предмет
          </button>
        </div>
      )}
      {shownMenu && shownMenu.topic && (
        <div className={'menu ctx' + (menuPres.closing ? ' closing' : '')} role="menu" style={{ left: Math.min(shownMenu.x, window.innerWidth - 260), top: Math.min(shownMenu.y, window.innerHeight - 240) }} onMouseDown={(e) => e.stopPropagation()}>
          <button
            role="menuitem"
            onClick={() => {
              go({ name: 'topic', id: shownMenu.topic!.id });
              setMenu(null);
            }}
          >
            <Icon name="edit" size={18} /> Открыть и переименовать
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setAdding({ subjectId: shownMenu.topic!.subjectId, parentId: shownMenu.topic!.id });
              setMenu(null);
            }}
          >
            <Icon name="subtopic" size={18} /> Добавить подтему
          </button>
          <button
            role="menuitem"
            onClick={() => {
              updateTopic(shownMenu.topic!.id, { important: !shownMenu.topic!.important });
              setMenu(null);
            }}
          >
            <Icon name={shownMenu.topic.important ? 'star' : 'starFill'} size={18} /> {shownMenu.topic.important ? 'Убрать из важных' : 'Отметить важной'}
          </button>
          {shownMenu.topic.parentId && (
            <button
              role="menuitem"
              onClick={() => {
                const parent = data.topics.find((x) => x.id === shownMenu.topic!.parentId);
                moveTopic(shownMenu.topic!.id, { subjectId: shownMenu.topic!.subjectId, parentId: parent?.parentId, afterId: parent?.id });
                setMenu(null);
              }}
            >
              <Icon name="left" size={18} /> Сделать отдельной темой
            </button>
          )}
          <DeleteItem topic={shownMenu.topic} onDone={() => setMenu(null)} onDeleted={(t) => route.name === 'topic' && route.id === t.id && go({ name: 'subject', id: t.subjectId })} />
        </div>
      )}
      {editFolder && <EditFolder id={editFolder} onClose={() => setEditFolder(null)} />}
      {editSubj && (
        <EditSubject
          id={editSubj}
          onClose={() => setEditSubj(null)}
          onDelete={() => {
            setDelSubj(editSubj);
            setEditSubj(null);
          }}
        />
      )}
      {delSubj && (
        <DeleteSubject
          id={delSubj}
          onClose={() => setDelSubj(null)}
          onDeleted={() => {
            const gone = delSubj;
            if ((route.name === 'subject' && route.id === gone) || (route.name === 'topic' && !getData().topics.some((t) => t.id === route.id))) go({ name: 'today' });
          }}
        />
      )}
    </aside>
  );
}

function DeleteItem({ topic, onDone, onDeleted }: { topic: Topic; onDone: () => void; onDeleted: (t: Topic) => void }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      role="menuitem"
      className="danger"
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3000);
          return;
        }
        deleteTopicWithUndo(topic.id);
        onDeleted(topic);
        onDone();
      }}
    >
      <Icon name="trash" size={18} /> {armed ? 'Точно удалить? Нажми ещё раз' : 'Удалить тему'}
    </button>
  );
}

function AddRow({ depth, placeholder, adding, setAdding, go }: { depth: number; placeholder: string; adding: AddingAt; setAdding: (a: AddingAt) => void; go: (r: Route) => void }) {
  const [name, setName] = useState('');
  return (
    <form
      className="tree-add-row"
      style={{ paddingLeft: 10 + depth * 16 + 20 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !adding) return setAdding(null);
        const t = addTopic(adding.subjectId, name, adding.parentId);
        setAdding(null);
        go({ name: 'topic', id: t.id });
      }}
    >
      <input
        className="input tiny"
        autoFocus
        placeholder={placeholder}
        aria-label={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setAdding(null)}
        onBlur={() => !name.trim() && setAdding(null)}
      />
    </form>
  );
}
