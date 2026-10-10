import { useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackupsHost } from './components/BackupsHost';
import { TutorialHost } from './components/Tutorial';
import { ShowMeHost } from './components/ShowMe';
import { GuideHost } from './components/Guide';
import { Knowledge } from './screens/Knowledge';
import { Profile } from './screens/Profile';
import { CreateHost, openCreate } from './components/CreateMenu';
import { Trash } from './screens/Trash';
import { hidesTabBar, TabBar } from './components/TabBar';
import { sessionPrefs } from './session';
import { NewSubjectDialog } from './components/SubjectDialogs';
import { CommandPalette } from './components/CommandPalette';
import { RuleView } from './components/Rules';
import { UpdateDialog } from './components/UpdateFlow';
import { ChangesDialog } from './components/ChangesDialog';
import { parseChangeFile } from './changes';
import type { UpdateInfo } from './update';
import { PluginScreen } from './screens/PluginScreen';
import { MODS_AVAILABLE } from './featureList';
import { emit, registry, setNavigator, syncPlugins } from './plugins/host';
import { applyLook, FONTS, lookKey } from './themes';
import { allMods, modsCss } from './mods';
import { AnkiImport } from './components/AnkiImport';
import { Sidebar, type AddingAt } from './components/Sidebar';
import { acceptIncoming } from './components/SyncDialog';
import { comboFromEvent, keyFor, matches, toAccelerator, typingTarget } from './keys';
import { Icon, keepMenusInView, onToast, usePresence } from './components/ui';
import { Help } from './screens/Help';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import { Stats } from './screens/Stats';
import { SubjectScreen } from './screens/SubjectScreen';
import { FolderScreen } from './screens/FolderScreen';
import { HomeworkScreen } from './components/Homework';
import { widgetState, notificationPlan } from './homework';
import { TestScreen } from './screens/TestScreen';
import { ExamScreen } from './screens/ExamScreen';
import { ExamDialogHost } from './components/ExamDialog';
import { RepeatDialogHost } from './components/RepeatDialog';
import { Today } from './screens/Today';
import { TopicScreen } from './screens/TopicScreen';
import { importTopicPackage, isTopicPackage } from './share';
import { forecast, itemKey, itemOrds, streak, todayCounts, tomorrowSubjects } from './srs';
import { dataReadOnly, getData, updateSettings, updateTopic, useData } from './store';
import type { Route } from './types';

export function useMobile() {
  const q = '(max-width: 720px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

export function App() {
  const data = useData();
  const [route, setRoute] = useState<Route>({ name: 'today' });
  const [palette, setPalette] = useState(false);
  const [addingSubject, setAddingSubject] = useState<false | { folderId?: string; as?: 'subject' | 'folder' }>(false);
  const [toast, setToast] = useState('');
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);
  const lastToast = useRef('');
  if (toast) lastToast.current = toast;
  const toastPres = usePresence(Boolean(toast), 200);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => onToast((text, action) => showToast(text, action)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [dragging, setDragging] = useState(false);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Файл увели за окно, отпустили в другом месте или передумали (Esc) — подсказка «Отпусти файл» не должна зависнуть.
  useEffect(() => {
    const hide = () => {
      clearTimeout(dragTimer.current);
      setDragging(false);
    };
    const leave = (e: DragEvent) => (!e.relatedTarget || e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) && hide();
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragend', hide);
    window.addEventListener('drop', hide);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragend', hide);
      window.removeEventListener('drop', hide);
      window.removeEventListener('blur', hide);
      clearTimeout(dragTimer.current);
    };
  }, []);
  const [ankiFile, setAnkiFile] = useState<File | null>(null);
  const [adding, setAdding] = useState<AddingAt>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [changes, setChanges] = useState<string | null>(null); // окно «Файл изменений» (текст файла или '')
  const systemDark = useSystemDark();
  const s = data.settings;
  const dark = s.theme === 'dark' || (s.theme === 'system' && systemDark);

  const firstTheme = useRef(true);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.dataset.theme = dark ? 'dark' : 'light';
      root.dataset.density = s.density;
      // Анимации: какие выключены
      const off: string[] = s.motion === 'essential' ? ['screens', 'text', 'hover', 'lists', 'press', 'guide'] : s.motion === 'custom' ? s.motionOff : [];
      root.dataset.motion = s.motion === 'off' ? 'off' : 'on';
      for (const k of ['screens', 'windows', 'expand', 'text', 'review', 'hover', 'lists', 'press', 'guide']) {
        const attr = 'no' + k[0].toUpperCase() + k.slice(1);
        if (off.includes(k)) root.dataset[attr] = '';
        else delete root.dataset[attr];
      }
      root.style.setProperty('--accent', s.accent);
      root.style.fontSize = `${16 * s.fontScale}px`;
      applyLook(root, s, dark);
    };
    // Смена темы — одним плавным переходом «снимок → новый вид» на видеокарте.
    // Раньше переливались цвета каждого элемента по отдельности, и на слабых компьютерах это шло рывками.
    const changed = root.dataset.theme !== (dark ? 'dark' : 'light') || root.style.getPropertyValue('--accent') !== s.accent || root.dataset.look !== lookKey(s.look);
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (!firstTheme.current && changed && vt && s.motion !== 'off' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) vt.call(document, apply);
    else apply();
    root.dataset.look = lookKey(s.look);
    firstTheme.current = false;
  }, [dark, s.accent, s.density, s.fontScale, s.motion, s.motionOff.join(), JSON.stringify(s.look), s.bgImage?.src, s.bgImage?.fade]); // eslint-disable-line react-hooks/exhaustive-deps

  // Моды: стили включённых модов и свой CSS.
  const modsStyle = modsCss(s.modsOn, s.customMods, s.userCss);
  useEffect(() => {
    // шрифты, которые нужны включённым стилям (например, «Тетрадь»)
    for (const m of allMods(s.customMods)) if (m.font && s.modsOn.includes(m.id)) void FONTS.find((f) => f.id === m.font)?.load?.();
  }, [s.modsOn.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let el = document.getElementById('mnema-mods') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'mnema-mods';
      document.head.appendChild(el);
    }
    el.textContent = modsStyle;
  }, [modsStyle]);

  // Напоминания о домашке (и на телефоне — ежедневное «пора повторить»): отдаём список системе.
  const plan = JSON.stringify(notificationPlan(data, new Date(), window.mnemaApi?.platform === 'android'));
  useEffect(() => {
    const t = setTimeout(() => window.mnemaApi?.scheduleNotifications?.(JSON.parse(plan)), 500);
    return () => clearTimeout(t);
  }, [plan]);
  // Ссылки Мнемы (из конспекта, ответа карточки, правила): перейти к теме или термину.
  useEffect(() => {
    const h = async (e: Event) => {
      const { linkRoute } = await import('./components/Links');
      const r = linkRoute((e as CustomEvent<string>).detail);
      if (r) go(r);
      else showToast('То, на что вела ссылка, удалено');
    };
    window.addEventListener('mnema:open-link', h);
    return () => window.removeEventListener('mnema:open-link', h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Значок на рабочем столе телефона — под тему (если так выбрано в «Оформлении»).
  const iconTheme = dark ? s.look.dark : s.look.light;
  useEffect(() => {
    // 'theme' — под текущую тему, 'default' — обычный, иначе выбранный значок (id темы).
    window.mnemaApi?.setAppIcon?.(s.appIcon === 'theme' ? iconTheme : s.appIcon || 'default');
  }, [s.appIcon, iconTheme]);

  // «Файл изменений» можно открыть откуда угодно: настройки, поиск, меню предмета.
  useEffect(() => {
    const h = (e: Event) => setChanges((e as CustomEvent<string>).detail ?? '');
    window.addEventListener('mnema:changes', h);
    return () => window.removeEventListener('mnema:changes', h);
  }, []);

  // Файл данных есть, но не прочитался — честно сказать, что сейчас ничего не сохранится.
  useEffect(() => {
    if (dataReadOnly()) showToast('Не получилось открыть твои данные — сейчас ничего не сохранится. Закрой и открой Мнему снова; если не поможет — восстанови автокопию в «Настройки → Данные».');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Любое меню, которое открылось у края окна (особенно на телефоне), сдвигаем внутрь.
  useEffect(() => keepMenusInView(), []);

  // Раз в день — есть ли новая версия.
  useEffect(() => {
    const t = setTimeout(async () => {
      const { dueForAutoCheck, checkUpdate } = await import('./update');
      if (!dueForAutoCheck()) return;
      const r = await checkUpdate();
      if (r.ok && r.available) showToast(`Вышла Мнема ${r.latest}`, { label: 'Обновить', run: () => setUpdateInfo(r) });
    }, 6000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Виджет на телефоне: считаем на неделю вперёд, чтобы он был верен и без запуска Мнемы.
  useEffect(() => {
    if (!window.mnemaApi?.setWidget) return;
    const t = setTimeout(() => {
      const d = getData();
      const now = new Date();
      const c = todayCounts(d, now);
      const fresh = d.cards.reduce((n, card) => n + itemOrds(card).filter((o) => !d.states[itemKey(card.id, o)]).length, 0);
      // Сколько карточек на сегодня по каждому предмету из расписания — для виджета «Уроки».
      const bySubject: Record<string, number> = {};
      for (const id of new Set(Object.values(d.settings.schedule).flat())) {
        const k = todayCounts(d, now, { subjectId: id });
        bySubject[id] = k.learning + k.review + k.newCount;
      }
      window.mnemaApi?.setWidget?.(JSON.stringify(widgetState(d, now, c.learning + c.review + c.newCount, forecast(d, now, 8), fresh, streak(d, now), bySubject)));
    }, 1500);
    return () => clearTimeout(t);
  }, [data]);
  useEffect(() => {
    const open = (what: string) => {
      if (what === 'lessons') {
        const ids = tomorrowSubjects(getData(), new Date());
        return go(ids.length ? { name: 'review', subjectIds: ids, run: Date.now() } : { name: 'today' });
      }
      if (what === 'mini') return go({ name: 'review', limit: 5, run: Date.now() });
      go(what === 'homework' ? { name: 'homework' } : { name: 'today' });
    };
    (window as unknown as { __mnemaOpen?: (w: string) => void }).__mnemaOpen = open;
    return window.mnemaApi?.onNotifyOpen?.(open);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Значок у часов: число карточек и настройки напоминаний.
  const dueForTray = (() => {
    const c = todayCounts(data, new Date());
    return c.learning + c.review + c.newCount;
  })();
  useEffect(() => {
    window.mnemaApi?.trayState?.({
      enabled: s.features.tray,
      due: dueForTray,
      reminder: s.reminder,
      hotkey: s.trayHotkey && Boolean(keyFor(s, 'miniReview')),
      accelerator: toAccelerator(keyFor(s, 'miniReview') || 'Ctrl+Alt+M'),
      closeToTray: s.closeToTray,
      autostart: s.autostart
    });
  }, [s.features.tray, dueForTray, s.reminder, s.trayHotkey, s.closeToTray, s.autostart, s.keys]); // eslint-disable-line react-hooks/exhaustive-deps

  // Моды с кодом: запустить включённые, остановить выключенные.
  const pluginKey = MODS_AVAILABLE && s.features.mods && !s.pluginsSafe ? s.plugins.map((p) => p.id + (p.enabled ? '+' : '-') + p.code.length).join('|') : 'off';
  useEffect(() => {
    setNavigator(go);
    void syncPlugins();
  }, [pluginKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => emit('route', route), [route]);

  // Синхронизация: другое устройство прислало данные — слить.
  useEffect(() => window.mnemaApi?.onSyncIncoming?.(acceptIncoming), []);

  // Облако: синхронизация при запуске и каждые 30 минут.
  const cloudOn = Boolean(s.cloud?.auto);
  useEffect(() => {
    if (!cloudOn || !window.mnemaApi?.secretGet) return;
    let failed = false;
    const tick = async () => {
      const c = getData().settings.cloud;
      if (!c?.auto) return;
      try {
        const [pass, encPass] = await Promise.all([window.mnemaApi!.secretGet!('cloud-pass'), window.mnemaApi!.secretGet!('cloud-enc')]);
        if (!pass) return;
        const { cloudSync } = await import('./cloud');
        await cloudSync(c, pass, c.encrypt ? encPass : '');
        failed = false;
      } catch (e) {
        if (!failed) showToast('Облако: ' + (e as Error).message);
        failed = true;
      }
    };
    const first = setTimeout(() => void tick(), 8000);
    const every = setInterval(() => void tick(), 30 * 60 * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [cloudOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Быстрое повторение из трея (Ctrl+Alt+M): окно становится маленьким, 5 карточек.
  useEffect(() => window.mnemaApi?.onMiniStart?.(() => setRoute({ name: 'review', limit: 5, mini: true, run: Date.now() })), []);

  const mobile = useMobile();
  const [drawer, setDrawer] = useState(false);
  const [ruleOpen, setRuleOpen] = useState<string | null>(null);
  const go = (r: Route) => {
    if (r.name === 'topic' && !r.page) {
      const tid = r.id;
      const t = getData().topics.find((x) => x.id === tid);
      // Правило открывается окошком поверх того, где ты сейчас, — не надо уходить из конспекта.
      if (t?.kind === 'rule') {
        setRuleOpen(t.id);
        return;
      }
      if (t?.kind === 'glossary') r = { name: 'subject', id: t.subjectId, view: 'terms', filter: 'general' };
    }
    setRuleOpen(null);
    setRoute(r);
    setDrawer(false);
    document.querySelector('.main')?.scrollTo(0, 0);
  };

  // Горячие клавиши, которые работают везде (кроме повторения — там свои).
  const routeRef = useRef(route);
  routeRef.current = route;

  // Кнопка «Назад» на Android: закрыть окно, меню, выйти из повторения, вернуться на «Сегодня».
  const drawerRef = useRef(false);
  drawerRef.current = drawer;
  useEffect(() => {
    window.__mnemaBack = () => {
      const close = document.querySelector<HTMLButtonElement>('.modal-back .modal-head .icon-btn');
      if (close) {
        close.click();
        return true;
      }
      if (drawerRef.current) {
        setDrawer(false);
        return true;
      }
      const r = routeRef.current;
      if (r.name === 'review') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return true;
      }
      if (r.name === 'test') {
        go({ name: 'topic', id: r.topicId });
        return true;
      }
      if (r.name !== 'today') {
        go({ name: 'today' });
        return true;
      }
      return false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const r = routeRef.current;
      if (r.name === 'review' || r.name === 'test') return;
      const st = getData().settings;
      if (matches(e, st, 'palette')) {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (document.querySelector('.modal-back, .pal-back')) return;
      const combo = comboFromEvent(e);
      const pc = combo ? registry.commands.find((c) => c.hotkey && c.hotkey.replace(/\s+/g, '') === combo) : undefined;
      if (pc) {
        e.preventDefault();
        pc.run();
        return;
      }
      const typing = typingTarget(e);
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      if (typing && plain) return;
      if (matches(e, st, 'toggleSidebar')) {
        e.preventDefault();
        updateSettings({ sidebarCollapsed: !st.sidebarCollapsed });
      } else if (matches(e, st, 'goToday')) {
        e.preventDefault();
        go({ name: 'today' });
      } else if (matches(e, st, 'goHomework') && st.features.homework) {
        e.preventDefault();
        go({ name: 'homework' });
      } else if (matches(e, st, 'goStats')) {
        e.preventDefault();
        go({ name: 'stats' });
      } else if (matches(e, st, 'goSettings')) {
        e.preventDefault();
        go({ name: 'settings' });
      } else if (matches(e, st, 'learnToday')) {
        e.preventDefault();
        go({ name: 'review', run: Date.now() });
      } else if (matches(e, st, 'newTopic')) {
        const d = getData();
        const subjectId = r.name === 'subject' ? r.id : r.name === 'topic' ? d.topics.find((t) => t.id === r.id)?.subjectId : undefined;
        if (!subjectId) return;
        e.preventDefault();
        if (st.sidebarCollapsed) updateSettings({ sidebarCollapsed: false });
        setAdding({ subjectId });
      } else if (matches(e, st, 'toggleImportant') && r.name === 'topic') {
        e.preventDefault();
        const tid = r.id;
      const t = getData().topics.find((x) => x.id === tid);
        if (t) updateTopic(t.id, { important: !t.important });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(t: string, action?: { label: string; run: () => void }) {
    setToast(t);
    setToastAction(action ?? null);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), action ? 8000 : 3500);
  }

  // Перетащить файл темы (.mnema) в окно — тема добавится.
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (/^image\//.test(f.type)) {
      showToast('Фото страниц перетащи в открытую тему — Мнема сделает из них конспект');
      return;
    }
    // Ответ нейросети, сохранённый как .txt или .md, — это файл изменений, а не колода Anki.
    if (/\.(txt|md)$/i.test(f.name) && parseChangeFile(await f.text()).ok) {
      setChanges(await f.text());
      return;
    }
    if (/\.(apkg|colpkg|anki2|anki21|txt|tsv|csv)$/i.test(f.name)) {
      setAnkiFile(f);
      return;
    }
    const text = await f.text();
    let pkg: unknown = null;
    try {
      pkg = JSON.parse(text);
    } catch {
      /* может быть ответ нейросети с текстом вокруг JSON */
    }
    if (isTopicPackage(pkg)) {
      const r = importTopicPackage(pkg);
      showToast(`Добавлена тема «${pkg.topic.name}»`);
      if (r.firstTopicId) go({ name: 'topic', id: r.firstTopicId });
      return;
    }
    // Файл изменений (например, от нейросети) — показать, что поменяется.
    if (parseChangeFile(text).ok) {
      setChanges(text);
      return;
    }
    showToast('Сюда можно перетащить ответ нейросети (файл изменений), тему Мнемы (.mnema) или колоду Anki (.apkg)');
  }

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        setDragging(true);
        // Пока файл над окном, dragover приходит снова и снова. Перестал приходить — файл унесли, подсказку убираем.
        clearTimeout(dragTimer.current);
        dragTimer.current = setTimeout(() => setDragging(false), 1200);
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget === e.target || !e.relatedTarget) setDragging(false);
    },
    onDrop,
    onDropCapture: () => setDragging(false)
  };

  if (route.name === 'review' || route.name === 'test') {
    return (
      <div className={'app review-mode' + (route.name === 'review' && route.mini ? ' mini' : '')}>
        <ErrorBoundary onHome={() => go({ name: 'today' })}>
          {route.name === 'review' ? <Review key={JSON.stringify(route)} route={route} go={go} /> : <TestScreen key={route.topicId + (route.examId ?? '')} topicId={route.topicId} pretest={route.pretest} examId={route.examId} go={go} />}
        </ErrorBoundary>
        <RepeatDialogHost go={go} />
        <TutorialHost route={route} go={go} />
      </div>
    );
  }

  const now = new Date();
  const total = todayCounts(data, now);
  const dueAll = total.learning + total.review + total.newCount;

  return (
    <div className={'app' + (mobile ? ' mobile' : '') + (drawer ? ' drawer-open' : '') + (mobile && !hidesTabBar(route) ? ' has-tabbar' : '')} {...dropProps}>
      {mobile && (
        <header className="mobile-bar">
          <button className="mobile-brand" onClick={() => go({ name: 'today' })}>
            <span className="logo small-logo">М</span> Мнема
          </button>
          <span className="grow" />
          <button className="icon-btn mobile-create" aria-label="Создать" title="Создать: карточку, тему, предмет…" onClick={openCreate}>
            <Icon name="plus" size={22} />
          </button>
          <button className="icon-btn" aria-label="Поиск" onClick={() => setPalette(true)}>
            <Icon name="search" size={22} />
          </button>
          {dueAll > 0 && route.name !== 'today' && (
            <button className="btn small primary" onClick={() => go({ name: 'review', session: sessionPrefs(data, new Date()), run: Date.now() })}>
              <Icon name="play" size={14} /> {dueAll}
            </button>
          )}
        </header>
      )}
      {mobile && drawer && <div className="drawer-back" onClick={() => setDrawer(false)} />}
      <Sidebar route={route} go={go} dueAll={dueAll} adding={adding} setAdding={setAdding} onNewSubject={(o) => { setDrawer(false); setAddingSubject(o ?? {}); }} onSearch={() => { setDrawer(false); setPalette(true); }} mobile={mobile} />

      <main className="main">
        <div className="page-anim" key={route.name + ('id' in route ? route.id : '')}>
        <ErrorBoundary onHome={() => go({ name: 'today' })}>
        {route.name === 'knowledge' && <Knowledge go={go} onTree={mobile ? () => setDrawer(true) : undefined} />}
        {route.name === 'profile' && <Profile go={go} />}
        {route.name === 'today' && <Today go={go} onNewSubject={() => setAddingSubject({})} />}
        {route.name === 'homework' && <HomeworkScreen go={go} />}
        {route.name === 'plugin' && <PluginScreen key={route.id} id={route.id} />}
        {route.name === 'folder' && <FolderScreen id={route.id} go={go} onNewSubject={(o) => setAddingSubject(o)} />}
        {route.name === 'subject' && <SubjectScreen key={route.id} id={route.id} view={route.view} filter={route.filter} go={go} />}
        {route.name === 'topic' && <TopicScreen key={route.id} id={route.id} tab={route.tab} go={go} />}
        {route.name === 'stats' && <Stats go={go} tab={route.tab} />}
        {route.name === 'trash' && <Trash go={go} />}
        {route.name === 'exam' && <ExamScreen key={route.id} id={route.id} go={go} />}
        {(route.name === 'settings' || route.name === 'features') && <Settings go={go} section={route.name === 'features' ? 'features' : route.section} />}
        {route.name === 'help' && <Help section={route.section} go={go} />}
        </ErrorBoundary>
        </div>
      </main>

      {mobile && <TabBar route={route} go={go} dueAll={dueAll} />}

      {dragging && <div className="drop-hint"><span>Отпусти файл: тема Мнемы (.mnema), колода Anki (.apkg, .txt) или фото страниц учебника (в открытой теме)</span></div>}
      {toastPres.mounted && (
        <div className={'toast' + (toastPres.closing ? ' closing' : '')} role="status">
          <span>{toast || lastToast.current}</span>
          {toastAction && (
            <button
              className="toast-btn"
              onClick={() => {
                toastAction.run();
                setToast('');
              }}
            >
              {toastAction.label}
            </button>
          )}
        </div>
      )}
      {ankiFile && (
        <AnkiImport
          key={ankiFile.name + ankiFile.lastModified}
          file={ankiFile}
          onClose={() => setAnkiFile(null)}
          onOpenTopic={(id) => {
            setAnkiFile(null);
            go({ name: 'topic', id });
          }}
        />
      )}

      {changes !== null && <ChangesDialog key={changes.length} initial={changes} onClose={() => setChanges(null)} />}
      {updateInfo && <UpdateDialog info={updateInfo} onClose={() => setUpdateInfo(null)} />}
      {ruleOpen && data.topics.some((t) => t.id === ruleOpen) && <RuleView rule={data.topics.find((t) => t.id === ruleOpen)!} onClose={() => setRuleOpen(null)} go={go} />}
      <ExamDialogHost go={go} />
      <RepeatDialogHost go={go} />
      <BackupsHost />
      <TutorialHost route={route} go={go} />
      <ShowMeHost go={go} />
      <GuideHost />
      <CreateHost route={route} go={go} onNewSubject={(o) => setAddingSubject(o ?? {})} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} go={go} onNew={(o) => setAddingSubject(o ?? {})} />
      {addingSubject && (
        <NewSubjectDialog
          folderId={addingSubject.folderId}
          startAs={addingSubject.as}
          onClose={() => setAddingSubject(false)}
          onCreated={(id, kind) => {
            setAddingSubject(false);
            go(kind === 'folder' ? { name: 'folder', id } : { name: 'subject', id });
          }}
        />
      )}
    </div>
  );
}
