// Настройки: слева разделы, справа — один раздел. Ничего не надо листать и искать глазами: есть поиск по настройкам.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, Modal, Switch, touchUI } from '../components/ui';
import { Group, PaneHead, SRow } from '../components/SettingsKit';
import { LookPane, MotionPane, TextPane } from '../components/LookSettings';
import { FeaturesPane } from '../components/FeaturesPane';
import { PluginsSettings } from '../components/PluginsSettings';
import { StylesSettings } from '../components/ModsSettings';
import { AnkiExportDialog, PrintDialog } from '../components/ExportDialogs';
import { AnkiImport } from '../components/AnkiImport';
import { KeySettings } from '../components/KeySettings';
import { SyncDialog } from '../components/SyncDialog';
import { CloudDialog } from '../components/CloudDialog';
import { AiSettings } from '../components/AiSettings';
import { FEATURES } from '../featureList';
import type { Route, SettingsSection } from '../types';
import { addExample } from '../seed';
import { downloadFile, importTopicPackage, isTopicPackage } from '../share';
import { normalizeAnswer } from '../srs';
import { APP_VERSION, checkUpdate, UPDATE_REPO, type UpdateInfo } from '../update';
import { UpdateFlow } from '../components/UpdateFlow';
import { openChanges } from '../components/ChangesDialog';
import { emptyData, exportJson, getData, neutralizeForeign, normalizeData, replaceData, setFeature, updateSettings, useData } from '../store';

export const VERSION = APP_VERSION;

interface SectionInfo {
  id: SettingsSection;
  title: string;
  icon: string;
  hidden?: boolean;
}

interface IndexItem {
  label: string;
  section: SettingsSection;
  anchor?: string;
  words?: string;
}

// Поиск по настройкам: что где лежит.
const INDEX: IndexItem[] = [
  { label: 'Стиль: современный или классический', section: 'look', anchor: 'style', words: 'вид дизайн' },
  { label: 'Светлая или тёмная тема', section: 'look', anchor: 'theme', words: 'ночь темный светлый система' },
  { label: 'Цвета темы', section: 'look', anchor: 'theme', words: 'палитра воздух бумага графит' },
  { label: 'Главный цвет', section: 'look', anchor: 'accent', words: 'акцент кнопки' },
  { label: 'Шрифт', section: 'text', anchor: 'font', words: 'буквы' },
  { label: 'Размер текста', section: 'text', anchor: 'fontsize', words: 'крупнее мельче' },
  { label: 'Углы и плотность', section: 'text', anchor: 'shape', words: 'скругление отступы' },
  { label: 'Фон: точки, клетка, линейка', section: 'text', anchor: 'background', words: 'тетрадь' },
  { label: 'Свои цвета', section: 'text', anchor: 'colors' },
  { label: 'Анимации', section: 'motion', anchor: 'motion', words: 'движение плавно лагает медленно' },
  { label: 'Новых карточек в день', section: 'study', anchor: 'newPerDay', words: 'лимит' },
  { label: 'Простые кнопки «Не помню / Помню»', section: 'study', anchor: 'simple', words: 'оценки две' },
  { label: 'Насколько надёжно запоминать', section: 'study', anchor: 'retention', words: 'fsrs интервалы' },
  { label: 'Новый день начинается в', section: 'study', anchor: 'dayStart', words: 'полночь' },
  { label: 'Напоминания о домашке', section: 'reminders', anchor: 'hw', words: 'уведомления дз' },
  { label: 'Напоминание повторить каждый день', section: 'reminders', anchor: 'daily', words: 'уведомления' },
  { label: 'Вечером — о завтрашних уроках', section: 'reminders', anchor: 'lessons', words: 'расписание урок подготовиться' },
  { label: 'Значок у часов и автозапуск', section: 'reminders', anchor: 'tray', words: 'трей windows' },
  { label: 'ИИ-помощник: ключ и модель', section: 'ai', words: 'claude gemini chatgpt api' },
  { label: 'Горячие клавиши', section: 'keys', words: 'сочетания клавиатура' },
  { label: 'Сохранить копию', section: 'data', anchor: 'backup', words: 'резервная бэкап' },
  { label: 'Синхронизация с телефоном по Wi-Fi', section: 'data', anchor: 'sync', words: 'qr перенос' },
  { label: 'Облако (Яндекс Диск, Nextcloud)', section: 'data', anchor: 'sync', words: 'webdav' },
  { label: 'Файл изменений от нейросети', section: 'data', anchor: 'changes', words: 'нейросеть chatgpt ии gpt json загрузить создать изменить' },
  { label: 'Импорт из Anki', section: 'data', anchor: 'import', words: 'apkg колода' },
  { label: 'Экспорт в Anki и печать карточек', section: 'data', anchor: 'export', words: 'распечатать' },
  { label: 'Удалить всё', section: 'data', anchor: 'danger', words: 'очистить' },
  { label: 'Стили: крупные кнопки, стикеры, тетрадь…', section: 'styles', words: 'css вид моды оформление' },
  { label: 'Моды', section: 'mods', words: 'плагины расширения' },
  { label: 'Обновления', section: 'about', anchor: 'update', words: 'новая версия github обновить' },
  { label: 'Версия и справка', section: 'about', words: 'о программе' }
];

export function Settings({ go, section: initial }: { go: (r: Route) => void; section?: SettingsSection }) {
  const data = useData();
  const s = data.settings;
  const android = window.mnemaApi?.platform === 'android';
  const desktop = Boolean(window.mnemaApi) && !android;
  const narrow = useNarrow();
  const sections: SectionInfo[] = [
    { id: 'look', title: 'Оформление', icon: 'palette' },
    { id: 'text', title: 'Текст и форма', icon: 'edit' },
    { id: 'motion', title: 'Анимации', icon: 'sparkle' },
    { id: 'styles', title: 'Стили', icon: 'brush' },
    { id: 'features', title: 'Возможности', icon: 'grid' },
    { id: 'study', title: 'Учёба', icon: 'book' },
    { id: 'reminders', title: 'Напоминания', icon: 'bell' },
    { id: 'ai', title: 'ИИ-помощник', icon: 'bot', hidden: !s.features.ai },
    { id: 'keys', title: 'Клавиши', icon: 'keyboard', hidden: touchUI() },
    { id: 'data', title: 'Данные', icon: 'database' },
    { id: 'mods', title: 'Моды', icon: 'puzzle', hidden: !s.features.mods },
    { id: 'about', title: 'О Мнеме', icon: 'info' }
  ];
  const visible = sections.filter((x) => !x.hidden);
  const [section, setSection] = useState<SettingsSection | null>(initial ?? (narrow ? null : 'look'));
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (initial) setSection(initial);
  }, [initial]);
  // Раздел скрыт (например, выключили ИИ) — вернуться к первому.
  const current = section && visible.some((x) => x.id === section) ? section : narrow ? null : 'look';

  const open = (id: string, anchor?: string) => {
    setQuery('');
    setSection(id as SettingsSection);
    setFlash(anchor ?? null);
    (document.querySelector('.main') as HTMLElement | null)?.scrollTo({ top: 0 });
  };
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => {
      const el = paneRef.current?.querySelector<HTMLElement>(`[data-set="${flash}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 1400);
      }
      setFlash(null);
    }, 60);
    return () => clearTimeout(t);
  }, [flash, current]);

  const results = useMemo(() => {
    const q = normalizeAnswer(query.trim());
    if (!q) return null;
    const items: IndexItem[] = [...INDEX, ...FEATURES.map((f) => ({ label: f.title, section: 'features' as const, anchor: 'feature-' + f.id, words: f.short + ' ' + f.text }))];
    return items.filter((it) => visible.some((x) => x.id === it.section) && normalizeAnswer(it.label + ' ' + (it.words ?? '')).includes(q)).slice(0, 12);
  }, [query, visible.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const dark = s.theme === 'dark' || (s.theme === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  const title = visible.find((x) => x.id === current)?.title;

  const nav = (
    <nav className="set-nav" aria-label="Разделы настроек">
      <label className="set-search">
        <Icon name="search" size={16} />
        <input placeholder="Найти настройку" aria-label="Найти настройку" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button className="icon-btn small" aria-label="Очистить" onClick={() => setQuery('')}>
            <Icon name="x" size={14} />
          </button>
        )}
      </label>
      {results ? (
        <div className="set-results">
          {results.length === 0 && <span className="small muted pad-note">Ничего не нашлось</span>}
          {results.map((r, i) => (
            <button key={i} className="set-result" onClick={() => open(r.section, r.anchor)}>
              <span>{r.label}</span>
              <span className="small muted">{visible.find((x) => x.id === r.section)?.title}</span>
            </button>
          ))}
        </div>
      ) : (
        visible.map((x) => (
          <button key={x.id} className={'set-nav-item' + (current === x.id ? ' on' : '')} aria-current={current === x.id ? 'page' : undefined} onClick={() => open(x.id)}>
            <Icon name={x.icon} size={18} />
            <span className="grow">{x.title}</span>
            {narrow && <Icon name="right" size={16} />}
          </button>
        ))
      )}
    </nav>
  );

  let pane: ReactNode = null;
  if (current === 'look') pane = <LookPane dark={dark} />;
  else if (current === 'text') pane = <TextPane dark={dark} />;
  else if (current === 'motion') pane = <MotionPane />;
  else if (current === 'styles') pane = <StylesSettings />;
  else if (current === 'features') pane = <FeaturesPane openSection={open} />;
  else if (current === 'study') pane = <StudyPane />;
  else if (current === 'reminders') pane = <RemindersPane desktop={desktop} android={android} />;
  else if (current === 'ai') pane = (
    <div className="stack gap16">
      <PaneHead title="ИИ-помощник" text="Какой ИИ помогает объяснять, распознавать формулы и страницы учебника." />
      <div className="sgroup-body pad">
        <AiSettings />
      </div>
    </div>
  );
  else if (current === 'keys') pane = (
    <div className="stack gap16">
      <PaneHead title="Горячие клавиши" text="Нажми на сочетание, чтобы поменять его." />
      <div className="sgroup-body pad">
        <KeySettings />
      </div>
    </div>
  );
  else if (current === 'data') pane = <DataPane go={go} />;
  else if (current === 'mods') pane = <PluginsSettings />;
  else if (current === 'about') pane = <AboutPane go={go} />;

  if (narrow) {
    return (
      <div className="page narrow settings-page">
        {current ? (
          <>
            <button className="crumb set-back" onClick={() => setSection(null)}>
              <Icon name="left" size={18} /> Настройки
            </button>
            <div className="set-pane" key={current} ref={paneRef}>
              {pane}
            </div>
          </>
        ) : (
          <>
            <h1 className="display">Настройки</h1>
            {nav}
          </>
        )}
      </div>
    );
  }
  return (
    <div className="page settings-page">
      <div className="settings-layout">
        <aside className="set-side">
          <h1 className="display">Настройки</h1>
          {nav}
        </aside>
        <div className="set-pane" key={current ?? ''} ref={paneRef} aria-label={title}>
          {pane}
        </div>
      </div>
    </div>
  );
}

/** Узко — когда в области справа от левой панели не помещаются две колонки (разделы + раздел). */
function useNarrow() {
  const measure = () => {
    const m = document.querySelector('.main') as HTMLElement | null;
    return (m?.clientWidth ?? window.innerWidth) < 860;
  };
  const [v, setV] = useState(measure);
  useEffect(() => {
    const m = document.querySelector('.main');
    const on = () => setV(measure());
    on();
    const ro = new ResizeObserver(on);
    if (m) ro.observe(m);
    window.addEventListener('resize', on);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', on);
    };
  }, []);
  return v;
}

function retentionWords(r: number) {
  if (r <= 0.84) return 'меньше повторений, но больше забывается';
  if (r <= 0.91) return 'золотая середина';
  return 'надёжнее, но повторений больше';
}

function StudyPane() {
  const data = useData();
  const s = data.settings;
  return (
    <div className="stack gap16">
      <PaneHead title="Учёба" text="Сколько учить каждый день и как отвечать." />
      <Group>
        <SRow label="Новых карточек в день" hint="Сколько новых добавлять к повторению" id="newPerDay">
          <input className="input num" type="number" min={0} max={200} value={s.newPerDay} onChange={(e) => updateSettings({ newPerDay: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })} aria-label="Новых карточек в день" />
        </SRow>
        <SRow label="Простые кнопки" hint="Две оценки вместо четырёх: «Не помню» и «Помню»" id="simple">
          <Switch label="Простые кнопки" checked={s.simpleButtons} onChange={(v) => updateSettings({ simpleButtons: v })} />
        </SRow>
        <SRow label="Показывать на кнопках, когда карточка вернётся" id="intervals">
          <Switch label="Интервалы на кнопках" checked={s.showIntervals} onChange={(v) => updateSettings({ showIntervals: v })} />
        </SRow>
      </Group>
      <Group title="Точная настройка">
        <SRow label="Насколько надёжно запоминать" hint={`${Math.round(s.retention * 100)}% — ${retentionWords(s.retention)}`} id="retention">
          <input type="range" min={0.8} max={0.95} step={0.01} value={s.retention} onChange={(e) => updateSettings({ retention: Number(e.target.value) })} aria-label="Насколько надёжно запоминать" />
        </SRow>
        <SRow label="Максимум повторений в день" id="maxReviews">
          <input className="input num" type="number" min={10} max={2000} value={s.maxReviews} onChange={(e) => updateSettings({ maxReviews: Math.max(10, Math.min(2000, Number(e.target.value) || 10)) })} aria-label="Максимум повторений в день" />
        </SRow>
        <SRow label="Новый день начинается в" hint="Если учишь после полуночи, это ещё «вчера»" id="dayStart">
          <select className="input" value={s.dayStartHour} onChange={(e) => updateSettings({ dayStartHour: Number(e.target.value) })} aria-label="Новый день начинается в">
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </select>
        </SRow>
        <SRow label="Трудная карточка — после скольких ошибок" id="leech">
          <select className="input" value={s.leechThreshold} onChange={(e) => updateSettings({ leechThreshold: Number(e.target.value) })} aria-label="Порог трудной карточки">
            {[3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </SRow>
        <SRow label="Фокус-режим: заниматься" hint={touchUI() ? 'Запуск — в поиске (лупа сверху): «Фокус». Потом перерыв.' : 'Запуск — в поиске (Ctrl+P): «Фокус». Потом перерыв.'}>
          <select className="input" value={s.focusMinutes} onChange={(e) => updateSettings({ focusMinutes: Number(e.target.value) })} aria-label="Сколько минут заниматься в фокус-режиме">
            {[10, 15, 20, 25, 30, 45].map((m) => (
              <option key={m} value={m}>
                {m} мин
              </option>
            ))}
          </select>
        </SRow>
        <SRow label="Фокус-режим: перерыв">
          <select className="input" value={s.breakMinutes} onChange={(e) => updateSettings({ breakMinutes: Number(e.target.value) })} aria-label="Сколько минут длится перерыв">
            {[3, 5, 10, 15].map((m) => (
              <option key={m} value={m}>
                {m} мин
              </option>
            ))}
          </select>
        </SRow>
      </Group>
    </div>
  );
}

function RemindersPane({ desktop, android }: { desktop: boolean; android: boolean }) {
  const data = useData();
  const s = data.settings;
  const r = s.homeworkRemind;
  const hwOn = s.features.homework;
  return (
    <div className="stack gap16">
      <PaneHead title="Напоминания" text={android ? 'Уведомления приходят, даже если Мнема закрыта. Если телефон спросит — разреши.' : 'Уведомления Windows приходят, пока Мнема открыта или работает у часов.'} />
      <Group title="Домашка" id="hw">
        {hwOn ? (
          <>
            <SRow label="Напоминать о заданиях" hint="Для каждого нового задания — можно поменять в самом задании">
              <Switch label="Напоминать о заданиях" checked={r.on} onChange={(on) => updateSettings({ homeworkRemind: { ...r, on } })} />
            </SRow>
            {r.on && (
              <SRow label="Когда">
                <div className="row gap8">
                  <select className="input" value={r.when} onChange={(e) => updateSettings({ homeworkRemind: { ...r, when: e.target.value as 'dayBefore' | 'sameDay' } })} aria-label="Когда напоминать">
                    <option value="dayBefore">накануне</option>
                    <option value="sameDay">в день сдачи</option>
                  </select>
                  <input className="input time" type="time" value={r.time} onChange={(e) => e.target.value && updateSettings({ homeworkRemind: { ...r, time: e.target.value } })} aria-label="Время напоминания о домашке" />
                </div>
              </SRow>
            )}
          </>
        ) : (
          <SRow label="Домашние задания выключены" hint="Включи, чтобы записывать домашку и получать напоминания">
            <button className="btn small" onClick={() => setFeature('homework', true)}>
              Включить
            </button>
          </SRow>
        )}
      </Group>
      <Group title="Перед уроками" id="lessons">
        {s.features.schedule ? (
          <SRow label="Вечером напоминать о завтрашних уроках" hint="«Завтра: физика, история — повтори 10 минут». Нажмёшь — откроются карточки этих предметов">
            <div className="row gap8">
              {s.lessonsRemind.on && <input className="input time" type="time" value={s.lessonsRemind.time} onChange={(e) => e.target.value && updateSettings({ lessonsRemind: { ...s.lessonsRemind, time: e.target.value } })} aria-label="Время напоминания об уроках" />}
              <Switch label="Напоминать о завтрашних уроках" checked={s.lessonsRemind.on} onChange={(on) => updateSettings({ lessonsRemind: { ...s.lessonsRemind, on } })} />
            </div>
          </SRow>
        ) : (
          <SRow label="Нужно расписание уроков" hint="Включи его, и Мнема будет вечером напоминать повторить завтрашние предметы">
            <button className="btn small" onClick={() => setFeature('schedule', true)}>
              Включить
            </button>
          </SRow>
        )}
      </Group>
      <Group title="Повторение" id="daily">
        <SRow label="Напоминать повторить каждый день" hint={desktop && !s.features.tray ? 'На компьютере нужен значок у часов — включи его ниже' : undefined}>
          <div className="row gap8">
            {s.reminder !== null && <input className="input time" type="time" value={s.reminder ?? ''} onChange={(e) => updateSettings({ reminder: e.target.value || null })} aria-label="Время напоминания" />}
            <Switch label="Напоминать каждый день" checked={s.reminder !== null} onChange={(v) => updateSettings({ reminder: v ? '18:00' : null })} />
          </div>
        </SRow>
      </Group>
      {desktop && (
        <Group title="Значок у часов" id="tray">
          <SRow label="Показывать значок у часов" hint="Число карточек на сегодня и напоминания">
            <Switch label="Значок у часов" checked={s.features.tray} onChange={(v) => setFeature('tray', v)} />
          </SRow>
          {s.features.tray && (
            <>
              <SRow label="Быстрое повторение по Ctrl+Alt+M">
                <Switch label="Горячая клавиша" checked={s.trayHotkey} onChange={(v) => updateSettings({ trayHotkey: v })} />
              </SRow>
              <SRow label="При закрытии окна оставаться у часов" hint="Тогда напоминания работают, даже если окно закрыто">
                <Switch label="Оставаться у часов" checked={s.closeToTray} onChange={(v) => updateSettings({ closeToTray: v })} />
              </SRow>
              <SRow label="Запускать вместе с Windows" hint="Тихо, сразу у часов">
                <Switch label="Автозапуск" checked={s.autostart} onChange={(v) => updateSettings({ autostart: v })} />
              </SRow>
            </>
          )}
        </Group>
      )}
    </div>
  );
}

function DataPane({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const s = data.settings;
  const backupRef = useRef<HTMLInputElement>(null);
  const topicRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [anki, setAnki] = useState(false);
  const [sync, setSync] = useState(false);
  const [cloud, setCloud] = useState(false);
  const [exportKind, setExportKind] = useState<'anki' | 'print' | null>(null);
  const [pendingBackup, setPendingBackup] = useState<ReturnType<typeof normalizeData> | null>(null);
  const api = window.mnemaApi;
  async function runObsidianExport() {
    const { buildObsidianExport } = await import('../obsidianExport');
    const r = await api!.obsidianExport!(buildObsidianExport(data));
    if (r.ok && r.zip) setMsg(`Готово: ${r.written} файлов в архиве «${r.folder}». Распакуй его в хранилище Obsidian.`);
    else if (r.ok) setMsg(`Готово: ${r.written} файлов в папке «${r.folder}».`);
  }
  const where = api?.platform === 'android' ? 'телефоне' : api ? 'компьютере' : 'устройстве';
  return (
    <div className="stack gap16">
      <PaneHead title="Данные" text={`Всё хранится только на этом ${where}. Каждый день делается резервная копия (последние 8 дней).`} />
      {msg && <div className="hint">{msg}</div>}
      <Group title="Копия" id="backup">
        <SRow label="Сохранить копию" hint="Один файл со всеми предметами, карточками и прогрессом">
          <button className="btn small" onClick={() => downloadFile(`mnema-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJson())}>
            Сохранить
          </button>
        </SRow>
        <SRow label="Восстановить из копии" hint="Текущие данные заменятся">
          <button className="btn small" onClick={() => backupRef.current?.click()}>
            Выбрать файл
          </button>
        </SRow>
        <SRow label="Корзина" hint={data.trash?.length ? `Недавно удалённого: ${data.trash.length}. Лежит 30 дней` : 'Недавно удалённое можно вернуть (30 дней)'}>
          <button className="btn small" onClick={() => go({ name: 'trash' })}>
            Открыть
          </button>
        </SRow>
        {api?.openDataFolder && (
          <SRow label="Папка с данными">
            <button className="btn small" onClick={() => void api.openDataFolder()}>
              Открыть
            </button>
          </SRow>
        )}
      </Group>
      {(api?.http || api?.secretGet) && (
        <Group title="Между устройствами" id="sync">
          {api?.http && (
            <SRow label="Синхронизация по Wi-Fi" hint="Компьютер и телефон в одной сети, код с экрана">
              <button className="btn small" onClick={() => setSync(true)}>
                <Icon name="sync" size={16} /> Открыть
              </button>
            </SRow>
          )}
          {api?.secretGet && (
            <SRow label="Облако" hint={s.cloud ? 'Подключено' : 'Яндекс Диск, Nextcloud — с шифрованием паролем'}>
              <button className="btn small" onClick={() => setCloud(true)}>
                <Icon name="cloud" size={16} /> {s.cloud ? 'Настроить' : 'Подключить'}
              </button>
            </SRow>
          )}
        </Group>
      )}
      <Group title="Нейросеть и файлы изменений" id="changes">
        <SRow label="Загрузить файл изменений" hint="Создаёт и меняет что угодно: предметы, темы, конспекты, карточки, словари, правила, домашку">
          <button className="btn small primary" onClick={() => openChanges()}>
            <Icon name="upload" size={16} /> Загрузить
          </button>
        </SRow>
        <SRow label="Как попросить нейросеть" hint="Готовая инструкция: вставь её в чат вместе со своей просьбой">
          <button className="btn small" onClick={() => openChanges('#guide')}>
            <Icon name="bot" size={16} /> Инструкция
          </button>
        </SRow>
      </Group>
      <Group title="Импорт" id="import">
        <SRow label="Из Anki" hint=".apkg, .colpkg, текстовый экспорт">
          <button className="btn small" onClick={() => setAnki(true)}>
            Выбрать файл
          </button>
        </SRow>
        <SRow label="Тема из файла" hint="Файл .mnema, которым поделился друг">
          <button className="btn small" onClick={() => topicRef.current?.click()}>
            Выбрать файл
          </button>
        </SRow>
        <SRow label="Пример" hint="Биология, история и физика — чтобы посмотреть, как всё устроено">
          <button className="btn small ghost" onClick={() => (addExample(), setMsg('Пример добавлен.'))}>
            Добавить
          </button>
        </SRow>
      </Group>
      <Group title="Экспорт" id="export">
        <SRow label="В Anki" hint="Файл .apkg">
          <button className="btn small" onClick={() => setExportKind('anki')}>
            Экспорт
          </button>
        </SRow>
        <SRow label="Распечатать карточки" hint="Для вырезания или списком">
          <button className="btn small" onClick={() => setExportKind('print')}>
            Печать
          </button>
        </SRow>
        {api?.obsidianExport && (
          <SRow label="В Obsidian" hint="Конспекты — заметками Markdown">
            <button className="btn small" onClick={() => void runObsidianExport()}>
              Экспорт
            </button>
          </SRow>
        )}
      </Group>
      <Group id="danger">
        <SRow label="Удалить всё" hint="Предметы, темы, карточки и прогресс. Настройки останутся">
          <button className="btn small ghost danger" onClick={() => setConfirmWipe(true)}>
            <Icon name="trash" size={16} /> Удалить
          </button>
        </SRow>
      </Group>
      <input
        ref={backupRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            setPendingBackup(normalizeData(JSON.parse(await f.text())));
          } catch (err) {
            setMsg('Не получилось: ' + (err as Error).message);
          }
        }}
      />
      <input
        ref={topicRef}
        type="file"
        accept=".mnema,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const pkg = JSON.parse(await f.text());
            if (!isTopicPackage(pkg)) throw new Error('это не файл темы Мнемы');
            const r = importTopicPackage(pkg);
            setMsg(`Добавлена тема «${pkg.topic.name}» — ${r.cards} карточек.`);
          } catch (err) {
            setMsg('Не получилось: ' + (err as Error).message);
          }
        }}
      />
      {sync && <SyncDialog onClose={() => setSync(false)} />}
      {cloud && <CloudDialog onClose={() => setCloud(false)} />}
      {exportKind === 'anki' && <AnkiExportDialog onClose={() => setExportKind(null)} />}
      {exportKind === 'print' && <PrintDialog onClose={() => setExportKind(null)} />}
      {anki && <AnkiImport onClose={() => setAnki(false)} onOpenTopic={(id) => go({ name: 'topic', id })} />}
      {confirmWipe && (
        <Modal title="Удалить все данные?" onClose={() => setConfirmWipe(false)}>
          <div className="stack gap12">
            <p>Будут удалены все предметы, темы, карточки и прогресс. Настройки останутся. Перед этим лучше сохранить копию.</p>
            <div className="row end gap8">
              <button className="btn ghost" onClick={() => setConfirmWipe(false)}>
                Отмена
              </button>
              <button
                className="btn danger-solid"
                onClick={() => {
                  replaceData({ ...emptyData(), settings: s });
                  setConfirmWipe(false);
                }}
              >
                Удалить всё
              </button>
            </div>
          </div>
        </Modal>
      )}
      {pendingBackup && (
        <Modal title="Восстановить из копии?" onClose={() => setPendingBackup(null)}>
          <div className="stack gap12">
            <p>
              В копии: {pendingBackup.subjects.length} предм., {pendingBackup.topics.length} тем, {pendingBackup.cards.length} карточек. Текущие данные будут заменены.
            </p>
            <div className="row end gap8">
              <button className="btn ghost" onClick={() => setPendingBackup(null)}>
                Отмена
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  const { data: safe, notes } = neutralizeForeign(pendingBackup, getData());
                  replaceData(safe);
                  setPendingBackup(null);
                  setMsg('Данные восстановлены.' + (notes.length ? ' Не перенесено: ' + notes.join('; ') + '.' : ''));
                }}
              >
                Восстановить
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AboutPane({ go }: { go: (r: Route) => void }) {
  return (
    <div className="stack gap16">
      <div className="about">
        <div className="logo big">М</div>
        <div className="stack gap4">
          <h2>Мнема {VERSION}</h2>
          <span className="muted">Конспекты, карточки и повторение по науке о памяти.</span>
        </div>
      </div>
      <Group>
        <SRow label="Справка" hint={touchUI() ? 'С чего начать' : 'С чего начать, клавиши'}>
          <button className="btn small" onClick={() => go({ name: 'help' })}>
            Открыть
          </button>
        </SRow>
      </Group>
      <UpdatesGroup />
      <Group title="Новое в 1.17.0">
        <ul className="whats-new">
          <li>«Стили» — плитки с живым примером: сразу видно, что меняет стиль. Нажми на плитку — включится</li>
          <li>Пробная контрольная: задания «Соедини пары» и «Расставь по порядку» (даты, шаги из конспекта) — как в школьных тестах</li>
        </ul>
      </Group>
      <Group title="Новое в 1.16.0">
        <ul className="whats-new">
          <li>Меню «⋯» у темы короче: «Проверить себя» и «Поделиться» открываются внутри меню, «важная» — звёздочкой у названия</li>
          <li>«Стили» снова отдельный раздел Настроек</li>
          <li>Поиск в Настройках: длинные названия переносятся, а не налезают на соседнюю колонку</li>
          <li>Справка без вкладки «Моды»; как писать моды — в «Настройках → Моды → Сделать свой»</li>
        </ul>
      </Group>
      <Group title="Новое в 1.15.0">
        <ul className="whats-new">
          <li>История конспекта: Мнема помнит прежние версии текста (до 15 на тему, 60 дней, только на этом устройстве). «⋯» у темы → «История конспекта» — можно вернуть любую</li>
        </ul>
      </Group>
      <Group title="Новое в 1.14.0">
        <ul className="whats-new">
          <li>Корзина: удалённые предметы, темы и карточки 30 дней лежат в «Корзине» — их можно вернуть вместе с конспектом и прогрессом. Корзина только на этом устройстве</li>
        </ul>
      </Group>
      <Group title="Новое в 1.13.0">
        <ul className="whats-new">
          <li>Повторение: если ошибся, отметь почему — «Не помню», «Перепутал» или «Не понял». Это по желанию и в один клик</li>
          <li>В конце занятия — что пошло не так и кнопка «Повторить ошибки»: повтор записывается в расписание, как обычное повторение</li>
        </ul>
      </Group>
      <Group title="Новое в 1.12.0">
        <ul className="whats-new">
          <li>Телефон: внизу панель «Учусь · Знания · Создать · Профиль» — с подписями; кнопка ☰ вверху больше не нужна</li>
          <li>«Создать»: быстрая карточка (вопрос и ответ в любую тему), новая тема, предмет, домашка, контрольная, файл изменений — всё в одном месте. На компьютере — кнопка слева и «Создать…» в поиске</li>
          <li>«Профиль»: мой прогресс, настройки, возможности, справка</li>
        </ul>
      </Group>
      <Group title="Новое в 1.11.0">
        <ul className="whats-new">
          <li>«Сегодня»: одна кнопка «Учиться» вместо шести. Выбери 5, 10 или 20 минут — Мнема соберёт столько карточек, сколько успеешь; остальное останется на потом</li>
          <li>«Что в плане и почему»: из чего состоит занятие и зачем. Любой шаг можно пропустить на сегодня</li>
          <li>Про ближайшую контрольную — одна строка; подготовка к ней — на её экране</li>
        </ul>
      </Group>
      <Group title="Новое в 1.10.0">
        <ul className="whats-new">
          <li>Контрольная из нескольких тем: «Назначить контрольную» в меню темы, «Новая контрольная» в меню предмета и в поиске. Старая дата у темы открывается как контрольная</li>
          <li>Экран подготовки: «помнишь к дате» (прогноз по карточкам, не оценка), охват конспекта, слабые места и план по дням. «Исправить» повторяет самое слабое заранее</li>
          <li>Моды вернулись: раздел «Моды» в настройках, кнопка в левой панели и вкладка в справке</li>
          <li>Защита: чужая копия при «Восстановить» не подключит облако и не запустит моды; рисунок и формула из чужого конспекта не прячут части окна</li>
          <li>Исправлено: заголовок «Настройки» не ломается посреди слова; панель выделения в конспекте не пропадает после «Список» и «Рамка»; окна над длинным конспектом открываются быстрее; приложение не зависает на кривых данных после синхронизации</li>
        </ul>
      </Group>
      <Group title="Новое в 1.9.0">
        <ul className="whats-new">
          <li>Проще: убраны «Сад знаний», «Достижения» и «Совет дня»; на «Сегодня» нет плашки с серией — число «Дней подряд» теперь тихо лежит в «Статистика → Всегда»</li>
          <li>«Возможности»: вместо 21 переключателя — 13. Трудные карточки, пробная контрольная и итоги недели работают всегда</li>
          <li>Стили («Тетрадь», «Крупные кнопки», «Стикеры»…) переехали в «Настройки → Оформление → Ещё стили». Фокус-режим запускается из поиска (Ctrl+P)</li>
          <li>Справка короче: без вкладки «Формулы»</li>
          <li>Исправлено: Enter в поиске открывал ответ сразу; «Выключить все» выключало только один стиль</li>
        </ul>
      </Group>
      <Group title="Новое в 1.8.2">
        <ul className="whats-new">
          <li>Меню темы, предмета и папки в боковой панели снова открывается рядом с тем, на что нажали, а не в левом верхнем углу</li>
        </ul>
      </Group>
      <Group title="Новое в 1.8.1">
        <ul className="whats-new">
          <li>Меню «Ещё», «+» и «Вставить» всегда целиком на экране; на телефоне длинные меню выезжают снизу</li>
          <li>Статистика: «За период» и «Всегда» — отдельно; «Слабые темы» показывают только то, что правда слабое</li>
          <li>Экран предмета и карта знаний не тормозят, даже когда тем сотни</li>
          <li>В тёмных темах текст на кнопках и ссылки читаются лучше; «Углы» и «Плотность» работают везде</li>
          <li>Конспект не пропадает при синхронизации: если текст правили на двух устройствах, второй вариант остаётся копией темы</li>
        </ul>
      </Group>
      <Group title="Новое в 1.8">
        <ul className="whats-new">
          <li>Нейросеть отвечает быстрее и без ошибок: файл изменений теперь — обычный текст. Она красиво оформляет конспект и не отмечает всё важным, а перед применением видно, как всё будет выглядеть</li>
          <li>Перед применением файла видно, как всё будет выглядеть: конспект, карточки, термины — новое и изменённое подсвечено</li>
          <li>Таблицы в конспекте: «Вставить → Таблица», строки и столбцы — кнопками над таблицей</li>
          <li>Темы идут по названию с учётом номеров (§1, §2, §10). В «⋯» предмета можно выбрать свой порядок</li>
          <li className="desk-only">Панель по правой кнопке стала понятнее: оформление с подписями и крупное «В карточку»</li>
          <li>Можно выбрать несколько предметов, тем и папок и удалить разом (и вернуть)</li>
          <li>Свой фон картинкой («Оформление → Текст и форма»), значок на рабочем столе телефона — любой на выбор</li>
          <li>На компьютере переключатели снова в одну строку; на телефоне вкладки темы не налезают на «+» и «Правила»</li>
        </ul>
      </Group>
      <Group title="Новое в 1.7">
        <ul className="whats-new">
          <li>Файл изменений: попроси нейросеть — она пришлёт файл, а Мнема покажет, что поменяется, и применит. Можно создать и поменять что угодно: предметы, темы, конспекты, карточки, словари, правила, домашку («Настройки → Данные»)</li>
          <li>«Выгрузить для нейросети» в меню предмета и темы — нейросеть поправит готовое и вернёт файл</li>
          <li>Обновления сами: на телефоне Мнема скачивает новую версию и ставит её в два нажатия</li>
          <li>Телефон: окошко при выделении больше не мешает — «В карточку», «Маркер», «Правило» прямо в меню выделения Android</li>
          <li>Телефон: «Важное» выезжает снизу, меню не уходят за край, у инструментов конспекта есть подписи, вкладки не налезают друг на друга</li>
          <li>Граф знаний приближается двумя пальцами, растения в саду радуются, когда их гладишь</li>
          <li>Значок на рабочем столе — в цветах темы («Оформление»), три новых виджета: «Повторить», «Домашка», «Уроки»</li>
          <li className="desk-only">Горячие клавиши меняются прямо в «Справке → Клавиши», новые: маркер, ссылка, Домашка, статистика, настройки</li>
        </ul>
      </Group>
      <Group title="Новое в 1.6.4">
        <ul className="whats-new">
          <li>Стихи наизусть: «+» у вкладок темы → «Стихотворение». Учишь по частям с исчезающими подсказками, потом части вместе</li>
          <li>Рассказать вслух: Мнема покажет пропуски, ошибки и запинки и посчитает точность. Без голоса — открыть текст и отметить строки с ошибками</li>
          <li>«С любого места» — продолжить с случайной строки; трудные строки попадаются чаще и подсвечены в тексте</li>
          <li>Выученный стих Мнема напомнит рассказать через 1, 3, 7… дней — на экране «Сегодня»</li>
        </ul>
      </Group>
      <Group title="Новое в 1.6.3">
        <ul className="whats-new">
          <li className="desk-only">Панель «Жирный · Маркер · В карточку · Ссылка · Правило» — по правой кнопке мыши, а не сама при каждом выделении. Правая кнопка по слову без выделения — выделит слово</li>
          <li>Жирный и маркер больше не «прилипают»: поставил курсор после жирного слова — дальше пишется обычный текст</li>
          <li>Термины всего предмета: вкладка «Термины» у предмета — общие термины и термины всех тем, по темам</li>
          <li>Правило из подсказки открывается окошком — с текстом и словами-подсказками, без ухода из конспекта</li>
        </ul>
      </Group>
      <Group title="Новое в 1.6.2">
        <ul className="whats-new">
          <li className="desk-only">Ссылки в конспекте на термины, темы и правила: выдели слово → «Ссылка» (или правая кнопка мыши). Наведи — увидишь, что там; Ctrl+щелчок — перейти</li>
          <li>Словари и списки: ширина столбцов меняется перетаскиванием, можно записать просто термин без определения, длинный текст сразу переносится по словам</li>
          <li>Вкладки темы можно переставлять</li>
        </ul>
      </Group>
      <Group title="Новое в 1.6.1">
        <ul className="whats-new">
          <li>Рисунок: фон «как у конспекта», клетка, линейка, бумага; свои цвета ручки и маркера; холст на весь экран; размер в конспекте и предпросмотр</li>
          <li>Расписание: один предмет можно поставить несколько раз, уроки перетаскиваются, список предметов больше не обрезается</li>
          <li className="desk-only">Фото к домашке можно вставить через Ctrl+V</li>
        </ul>
      </Group>
      <Group title="Новое в 1.6">
        <ul className="whats-new">
          <li>План до контрольной: новые карточки разложены по дням, в последние дни — «освежить заранее»</li>
          <li>Подготовка к завтрашним урокам вечером и разминка утром</li>
          <li>«Почему?» после ответа — объясни себе одной фразой</li>
          <li>Карточки из всего конспекта одной кнопкой</li>
          <li>Фото к домашке</li>
          <li>Виджет на рабочий стол телефона: долго нажми на пустое место экрана → «Виджеты» → «Мнема»</li>
          <li>Обновление прямо из Мнемы</li>
        </ul>
      </Group>
      <Group title="Новое в 1.5">
        <ul className="whats-new">
          <li>Домашние задания с напоминаниями</li>
          <li>Папки предметов, значки и новые цвета</li>
          <li>Видео по ссылке прямо в конспекте</li>
          <li>Правила: выдели слово — и правило всплывёт при наведении</li>
          <li className="desk-only">Быстрый поиск по Ctrl+P</li>
          <li>Уроки на сегодня и завтра, простое расписание недели</li>
          <li>Новый стиль, настройки по разделам, плавная смена темы</li>
        </ul>
      </Group>
    </div>
  );
}

/** Обновления: проверить, скачать и поставить. Берутся из выпусков Мнемы на GitHub. */
function UpdatesGroup() {
  const data = useData();
  const u = data.settings.update;
  const [state, setState] = useState<{ phase: 'idle' | 'checking' | 'result'; info?: UpdateInfo }>({ phase: 'idle' });
  const check = async () => {
    setState({ phase: 'checking' });
    setState({ phase: 'result', info: await checkUpdate() });
  };
  const info = state.info;
  return (
    <Group title="Обновления" id="update">
      <SRow label="Проверять раз в день" hint="При запуске; если вышла новая версия — Мнема скажет">
        <Switch label="Проверять обновления" checked={u.auto} onChange={(auto) => updateSettings({ update: { ...u, auto } })} />
      </SRow>
      <div className="srow stack-row">
        <div className="row gap12 wrap">
          <button className="btn" disabled={state.phase === 'checking'} onClick={() => void check()}>
            <Icon name="sync" size={16} /> {state.phase === 'checking' ? 'Проверяю…' : 'Проверить обновления'}
          </button>
          <span className="small muted">Сейчас: {APP_VERSION}</span>
        </div>
        {state.phase === 'result' && info && (info.ok && info.available ? (
          <UpdateFlow info={info} />
        ) : (
          <div className="update-box">
            <span className="small">{info.ok ? `У тебя последняя версия${info.latest ? ` (${info.latest})` : ''} ✓` : info.error}</span>
          </div>
        ))}
        <span className="small muted">
          Новые версии выходят на GitHub:{' '}
          <a href={`https://github.com/${UPDATE_REPO.owner}/${UPDATE_REPO.repo}/releases`} target="_blank" rel="noreferrer">
            {UPDATE_REPO.owner}/{UPDATE_REPO.repo}
          </a>
        </span>
      </div>
    </Group>
  );
}
