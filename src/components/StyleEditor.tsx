// Редактор стилей: справа от настоящего интерфейса, чтобы изменения были видны сразу. Если закрыть без сохранения — всё откатывается.
// Два режима: «стиль» (сохранённый или новый — правки в черновике, потом «Сохранить») и «текущее оформление» (current: правки сразу
// попадают в настройки, а «Отменить» возвращает всё, как было при открытии). Вкладки: Цвета, Текст, Форма, Раскладка, Фон,
// Анимации, CSS, Настройки (что сможет менять человек), Справка. Кнопка «Изменить с ИИ» просит ИИ поправить стиль словами.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { currentAsMod, modToCurrent, resetCurrentPatch } from '../appearance';
import { MAX_BG_SRC_FILE } from '../bgImage';
import { MAX_CSS, sanitizeCss } from '../safeCss';
import { downloadFile } from '../share';
import { getData, updateSettings, useData } from '../store';
import { saveCustomStyle, setBasePreview } from '../styleActions';
import { API_CLASSES, API_PARTS, API_ROOT_ATTRS, API_VARS } from '../styleApi';
import { setStylePreview } from '../styleApply';
import { cleanMod, cleanSetting, MINE_ID, newStyleId, OLD_STYLE_EXT, parseStyleFile, STYLE_ATTRS, STYLE_EXT, styleToFile } from '../styleSystem';
import { FONTS } from '../themes';
import type { Mod, StyleSetting, StyleSettingType, StyleValue } from '../types';
import { BackgroundTab, ColorsTab, LayoutTab, MotionTab, ShapeTab, TextTab } from './StyleTabs';
import type { EditCtx } from './StyleControls';
import { StyleSettingsPanel } from './StyleSettingsPanel';
import { Snippets } from './Snippets';
import { StyleAiPanel } from './StyleAiPanel';
import { ConfirmButton, Icon, toast } from './ui';
import '../styleEditor.css';

type Tab = 'colors' | 'text' | 'shape' | 'layout' | 'bg' | 'motion' | 'code' | 'settings' | 'help';

const TABS: { id: Tab; label: string; styleOnly?: boolean }[] = [
  { id: 'colors', label: 'Цвета' },
  { id: 'text', label: 'Текст' },
  { id: 'shape', label: 'Форма' },
  { id: 'layout', label: 'Раскладка' },
  { id: 'bg', label: 'Фон' },
  { id: 'motion', label: 'Анимации' },
  { id: 'code', label: 'CSS' },
  { id: 'settings', label: 'Настройки', styleOnly: true },
  { id: 'help', label: 'Справка' }
];

export { newStyleId };

/** Пустой стиль для «Создать». */
export const blankStyle = (): Mod => ({ id: newStyleId(), name: 'Мой стиль', description: '', icon: '🎨', where: 'свой', css: '' });

/** «Создать на основе»: копия любого стиля под новым именем. */
export function cloneStyle(m: Mod): Mod {
  return JSON.parse(JSON.stringify({ ...m, id: newStyleId(), name: `${m.name} (мой)`.slice(0, 50), where: 'свой', author: undefined })) as Mod;
}

const ATTR_NAMES = Object.keys(STYLE_ATTRS);

/** Вставка текста в поле на месте курсора. */
function insertAt(el: HTMLTextAreaElement | null, text: string, value: string, set: (v: string) => void) {
  if (!el) return set(value + text);
  const a = el.selectionStart ?? value.length;
  const b = el.selectionEnd ?? a;
  set(value.slice(0, a) + text + value.slice(b));
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = el.selectionEnd = a + text.length;
  });
}

function CodePane({ m, set }: { m: Mod; set: (m: Mod) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [q, setQ] = useState('');
  const css = m.css ?? '';
  const cut = css.trim() && sanitizeCss(css) !== css;
  const ql = q.trim().toLowerCase();
  const vars = API_VARS.flatMap((g) => g.vars).filter((v) => !ql || v.name.includes(ql) || v.doc.toLowerCase().includes(ql));
  const classes = API_CLASSES.filter((c) => !ql || c.name.includes(ql) || c.doc.toLowerCase().includes(ql));
  const put = (t: string) => insertAt(ref.current, t, css, (v) => set({ ...m, css: v }));
  return (
    <div className="se-pane">
      <textarea
        ref={ref}
        className="input css-area se-code"
        spellCheck={false}
        aria-label="CSS стиля"
        value={css}
        onChange={(e) => set({ ...m, css: e.target.value })}
        placeholder={"/* Меняется сразу на настоящем интерфейсе */\n.hero { background: linear-gradient(135deg, var(--accent), #C2417A); }\n:root[data-theme='dark'] .card { border-color: var(--accent); }"}
      />
      <div className="row between small muted">
        <span>
          {css.length.toLocaleString('ru-RU')} из {MAX_CSS.toLocaleString('ru-RU')} знаков
        </span>
        {cut && <span className="se-warn">Часть CSS отброшена: ссылки в интернет, @import и скрипты не работают</span>}
      </div>
      <input className="input" placeholder="Найти переменную или класс…" aria-label="Поиск подсказок" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="se-hints">
        <span className="small muted">Переменные — нажми, чтобы вставить</span>
        <div className="se-chips wrap">
          {vars.slice(0, 40).map((v) => (
            <button key={v.name} type="button" className="se-chip code" title={v.doc + (v.def ? ` (по умолчанию ${v.def})` : '')} onClick={() => put(`var(${v.name})`)}>
              {v.name}
            </button>
          ))}
        </div>
        <span className="small muted">Классы — вставляют готовое правило</span>
        <div className="se-chips wrap">
          {classes.map((c) => (
            <button key={c.name} type="button" className="se-chip code" title={c.doc} onClick={() => put(`\n${c.name} {\n  \n}\n`)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const TEMPLATES: Record<StyleSettingType, () => Partial<StyleSetting>> = {
  color: () => ({ type: 'color', label: 'Цвет', var: '--my-color', default: '#3F51D8' }),
  slider: () => ({ type: 'slider', label: 'Размер', var: '--my-size', min: 0, max: 40, step: 1, unit: 'px', default: 16 }),
  select: () => ({ type: 'select', label: 'Вид', var: '--my-value', default: '8px', options: [{ value: '4px', label: 'Мелко' }, { value: '8px', label: 'Средне' }, { value: '16px', label: 'Крупно' }] }),
  toggle: () => ({ type: 'toggle', label: 'Включить', attr: 'my-option', default: true }),
  text: () => ({ type: 'text', label: 'Значение', var: '--my-text', default: '1px' }),
  font: () => ({ type: 'font', label: 'Шрифт', var: '--my-font', default: "Georgia, serif" })
};
const TYPE_LABEL: Record<StyleSettingType, string> = { color: 'Цвет', slider: 'Ползунок', select: 'Список', toggle: 'Переключатель', text: 'Текст', font: 'Шрифт' };

function SettingEditor({ s, onChange, onDelete }: { s: Partial<StyleSetting>; onChange: (s: Partial<StyleSetting>) => void; onDelete: () => void }) {
  const ok = cleanSetting(s);
  const num = (k: 'min' | 'max' | 'step', label: string) => (
    <label className="se-mini">
      <span>{label}</span>
      <input className="input" type="number" value={s[k] ?? ''} onChange={(e) => onChange({ ...s, [k]: e.target.value === '' ? undefined : Number(e.target.value) })} />
    </label>
  );
  return (
    <div className={'se-setting-ed' + (ok ? '' : ' bad')}>
      <div className="row gap8 wrap">
        <label className="se-mini grow">
          <span>Подпись</span>
          <input className="input" value={s.label ?? ''} maxLength={60} onChange={(e) => onChange({ ...s, label: e.target.value })} />
        </label>
        <label className="se-mini">
          <span>Код (id)</span>
          <input className="input" value={s.id ?? ''} maxLength={31} onChange={(e) => onChange({ ...s, id: e.target.value.toLowerCase() })} />
        </label>
        <button type="button" className="icon-btn small" aria-label="Удалить настройку" onClick={onDelete}>
          <Icon name="trash" size={16} />
        </button>
      </div>
      <div className="row gap8 wrap">
        {(s.type === 'select' || s.type === 'toggle') && (
          <label className="se-mini">
            <span>Атрибут</span>
            <input className="input" list="se-attrs" placeholder="sidebar, my-option…" value={s.attr ?? ''} onChange={(e) => onChange({ ...s, attr: e.target.value || undefined, var: e.target.value ? undefined : s.var })} />
          </label>
        )}
        <label className="se-mini">
          <span>Переменная</span>
          <input className="input" placeholder="--my-var" value={s.var ?? ''} onChange={(e) => onChange({ ...s, var: e.target.value || undefined, attr: e.target.value && (s.type === 'select' || s.type === 'toggle') ? undefined : s.attr })} />
        </label>
        {s.type === 'slider' && (
          <>
            {num('min', 'От')}
            {num('max', 'До')}
            {num('step', 'Шаг')}
            <label className="se-mini">
              <span>Единица</span>
              <select className="input" value={s.unit ?? ''} onChange={(e) => onChange({ ...s, unit: e.target.value })}>
                {['', 'px', 'rem', 'em', '%', 'ms', 's', 'deg', 'vw', 'vh'].map((u) => (
                  <option key={u} value={u}>
                    {u || '—'}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {s.type === 'toggle' && (
          <>
            <label className="se-mini">
              <span>Значение «вкл»</span>
              <input className="input" value={s.on ?? ''} onChange={(e) => onChange({ ...s, on: e.target.value || undefined })} />
            </label>
            <label className="se-mini">
              <span>Значение «выкл»</span>
              <input className="input" value={s.off ?? ''} onChange={(e) => onChange({ ...s, off: e.target.value || undefined })} />
            </label>
          </>
        )}
        {s.type === 'toggle' ? (
          <label className="se-mini row gap8">
            <input type="checkbox" checked={s.default === true} onChange={(e) => onChange({ ...s, default: e.target.checked })} /> <span>Включено по умолчанию</span>
          </label>
        ) : s.type !== 'select' ? (
          <label className="se-mini">
            <span>По умолчанию</span>
            <input className="input" value={String(s.default ?? '')} onChange={(e) => onChange({ ...s, default: s.type === 'slider' ? Number(e.target.value) : e.target.value })} />
          </label>
        ) : null}
        {s.type === 'color' && (
          <label className="se-mini">
            <span>В тёмной теме</span>
            <input className="input" placeholder="#RRGGBB" value={s.defaultDark ?? ''} onChange={(e) => onChange({ ...s, defaultDark: e.target.value || undefined })} />
          </label>
        )}
      </div>
      {s.type === 'select' && (
        <label className="se-mini">
          <span>Варианты — по строке: значение|подпись. Первый — по умолчанию</span>
          <textarea
            className="input se-opts"
            rows={3}
            defaultValue={(s.options ?? []).map((o) => `${o.value}|${o.label}`).join('\n')}
            onChange={(e) => {
              const options = e.target.value
                .split('\n')
                .map((l) => l.split('|'))
                .filter((p) => p[0]?.trim() && p[1]?.trim())
                .map((p) => ({ value: p[0].trim(), label: p[1].trim() }));
              onChange({ ...s, options, default: options.some((o) => o.value === s.default) ? s.default : options[0]?.value });
            }}
          />
        </label>
      )}
      {!ok && <span className="se-warn small">Настройка заполнена неверно — она не сохранится (проверь переменную вида --имя, значения и варианты).</span>}
    </div>
  );
}

function SettingsPane({ m, set, values, setValue }: { m: Mod; set: (m: Mod) => void; values: Record<string, StyleValue>; setValue: (id: string, v: StyleValue | undefined) => void }) {
  const list = (m.settings ?? []) as Partial<StyleSetting>[];
  const upd = (i: number, s: Partial<StyleSetting>) => set({ ...m, settings: list.map((x, k) => (k === i ? s : x)) as StyleSetting[] });
  const used = new Set(list.map((s) => s.id));
  const add = (t: StyleSettingType) => {
    let n = 1;
    while (used.has(t + n)) n++;
    set({ ...m, settings: [...list, { id: t + n, ...TEMPLATES[t]() }] as StyleSetting[] });
  };
  return (
    <div className="se-pane">
      <p className="small muted">Здесь описывается, что сможет менять тот, кто включит стиль: цвета, ползунки, переключатели. Каждая настройка подставляется в CSS-переменную (<code>var(--имя)</code> в твоём CSS) или в атрибут <code>:root[data-st-имя='значение']</code>.</p>
      <datalist id="se-attrs">
        {ATTR_NAMES.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      {list.map((s, i) => (
        <SettingEditor key={i} s={s} onChange={(x) => upd(i, x)} onDelete={() => set({ ...m, settings: list.filter((_, k) => k !== i) as StyleSetting[] })} />
      ))}
      <div className="se-chips wrap">
        {(Object.keys(TEMPLATES) as StyleSettingType[]).map((t) => (
          <button key={t} type="button" className="se-chip" onClick={() => add(t)}>
            + {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {(m.settings?.length ?? 0) > 0 && (
        <>
          <h4 className="se-h">Так это увидит человек</h4>
          <StyleSettingsPanel mod={{ ...m, settings: (m.settings ?? []).map((s) => cleanSetting(s)).filter((s): s is StyleSetting => s !== null) }} values={values} onChange={setValue} />
        </>
      )}
    </div>
  );
}

function HelpPane() {
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const hit = (a: string, b: string) => !ql || a.toLowerCase().includes(ql) || b.toLowerCase().includes(ql);
  return (
    <div className="se-pane se-help">
      <input className="input" placeholder="Найти в справке…" aria-label="Поиск по справке" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="small muted">
        Стиль — это только оформление: CSS и настройки вида, программ в нём нет. Файл — <code>{STYLE_EXT}</code> (обычный JSON). Включить можно несколько стилей: тот, что ниже в списке, перекрывает верхние. Тёмная тема: <code>:root[data-theme='dark'] …</code>. Переменные из конструктора записываются с <code>!important</code>, чтобы перекрыть тему.
      </p>
      <h4 className="se-h">Атрибуты раскладки</h4>
      {Object.entries(STYLE_ATTRS)
        .filter(([k, d]) => hit(k, d.doc))
        .map(([k, d]) => (
          <p key={k} className="se-doc">
            <code>:root[data-ui-{k}='…']</code> — {d.doc} Значения: {d.options.map((o) => o.value).join(', ')} (по умолчанию {d.default}).
          </p>
        ))}
      {API_VARS.map((g) => {
        const vars = g.vars.filter((v) => hit(v.name, v.doc));
        return vars.length ? (
          <div key={g.id}>
            <h4 className="se-h">{g.title}</h4>
            {vars.map((v) => (
              <p key={v.name} className="se-doc">
                <code>{v.name}</code> — {v.doc} {v.def && <span className="muted">По умолчанию: {v.def}</span>}
              </p>
            ))}
          </div>
        ) : null;
      })}
      <h4 className="se-h">Классы</h4>
      {API_CLASSES.filter((c) => hit(c.name, c.doc)).map((c) => (
        <p key={c.name} className="se-doc">
          <code>{c.name}</code> — {c.doc}
        </p>
      ))}
      <h4 className="se-h">Метки частей</h4>
      {API_PARTS.filter((p) => hit(p.name, p.doc)).map((p) => (
        <p key={p.name} className="se-doc">
          <code>[data-part='{p.name}']</code> — {p.doc}
        </p>
      ))}
      <h4 className="se-h">Атрибуты на корне</h4>
      {API_ROOT_ATTRS.filter((p) => hit(p.name, p.doc)).map((p) => (
        <p key={p.name} className="se-doc">
          <code>{p.name}</code> — {p.doc}
        </p>
      ))}
    </div>
  );
}

type Snap = Pick<ReturnType<typeof modToCurrent>, 'look' | 'accent' | 'density' | 'fontScale' | 'bgImage' | 'myStyle'>;
const pickSnap = (s: ReturnType<typeof getData>['settings']): Snap => ({ look: s.look, accent: s.accent, density: s.density, fontScale: s.fontScale, bgImage: s.bgImage, myStyle: s.myStyle });

/** `current` — правим то, что стоит сейчас (тогда `initial` не нужен). Иначе `initial` — сохранённый или новый стиль. */
export function StyleEditor({ initial, isNew = false, onClose, current = false }: { initial?: Mod; isNew?: boolean; onClose: () => void; current?: boolean }) {
  const data = useData();
  const settings = data.settings;
  const [local, setLocal] = useState<Mod>(() => initial ?? currentAsMod(settings));
  const [values, setValues] = useState<Record<string, StyleValue>>(() => ({ ...(initial ? (getData().settings.styleValues[initial.id] ?? {}) : {}) }));
  const [tab, setTab] = useState<Tab>('colors');
  const [asking, setAsking] = useState(false);
  const [ai, setAi] = useState(false);
  const [pk, setPk] = useState(0); // «обновить предпросмотр»: окно ИИ тоже показывает свой стиль и, закрываясь, стирает наш
  const [withImage, setWithImage] = useState(false);
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const snap = useRef<Snap>(pickSnap(settings)); // что было при открытии (для «Отменить» в режиме текущего оформления)
  const start = useRef(JSON.stringify([local, values]));
  const hist = useRef<{ stack: Mod[]; t: number }>({ stack: [], t: 0 });

  // В режиме текущего оформления стиль — это настройки, как они есть сейчас.
  const live = useMemo(() => (current ? currentAsMod(settings) : null), [current, settings.look, settings.accent, settings.density, settings.fontScale, settings.bgImage, settings.myStyle]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = live ?? local;
  const baseApp = useMemo(() => ({ look: settings.look, accent: settings.accent }), [settings.look, settings.accent]);
  const dirty = useMemo(() => (current ? JSON.stringify(pickSnap(settings)) !== JSON.stringify(snap.current) : JSON.stringify([local, values]) !== start.current), [current, settings, local, values]);

  function apply(next: Mod) {
    if (current) updateSettings(modToCurrent(next, getData().settings));
    else setLocal(next);
  }
  // Шаги «Назад»: быстрые подряд правки (ползунок) считаются одним шагом.
  function set(next: Mod) {
    const h = hist.current;
    const now = Date.now();
    if (now - h.t > 700) h.stack = [...h.stack.slice(-39), m];
    h.t = now;
    apply(next);
  }
  function undo() {
    const prev = hist.current.stack.pop();
    hist.current.t = 0;
    if (prev) apply(prev);
  }
  const ctx: EditCtx = { m, set, current, baseApp };

  // Живой предпросмотр на настоящем интерфейсе; закрыли — откат. (В текущем оформлении всё и так в настройках.)
  useEffect(() => {
    if (current) return;
    const t = setTimeout(() => {
      const clean = cleanMod(local, local.id) ?? local;
      setStylePreview({ mod: clean, values });
      setBasePreview(clean.look || clean.accent || clean.density || clean.fontScale || clean.bg ? clean : null);
    }, 90);
    return () => clearTimeout(t);
  }, [local, values, current, pk]);
  useEffect(
    () => () => {
      setStylePreview(null);
      setBasePreview(null);
    },
    []
  );
  useEffect(() => {
    if (m.font) void FONTS.find((f) => f.id === m.font)?.load?.();
  }, [m.font]);

  const close = () => (dirty && !asking && !current ? setAsking(true) : onClose());
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal-back') && close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });

  function save(enable: boolean) {
    if (current) return;
    const clean = cleanMod(local, local.id, initial?.where ?? 'свой');
    if (!clean) return toast('Дай стилю название');
    setStylePreview(null);
    saveCustomStyle(clean, { enable });
    const s = getData().settings;
    updateSettings({ styleValues: { ...s.styleValues, [clean.id]: values } });
    start.current = JSON.stringify([local, values]);
    toast(`Стиль «${clean.name}» сохранён`);
    onClose();
  }
  /** Текущее оформление → «Мои стили» (копия всего, что сейчас стоит). */
  function saveCurrentAsStyle(name: string) {
    const clean = cleanMod({ ...m, name: name.trim() || 'Мой вид', description: 'Оформление из Refrain', icon: '🎨' }, newStyleId(), 'свой');
    if (!clean) return;
    // Основа (тема, плотность, фон…) уже стоит в настройках: сохраняем стиль, но не включаем — иначе он «запомнит» это как прежнее.
    saveCustomStyle(clean);
    setSaveAs(null);
    toast(`Стиль «${clean.name}» сохранён в «Мои стили»`);
  }
  function exportFile() {
    const clean = cleanMod(m, m.id);
    if (!clean) return toast('Дай стилю название');
    downloadFile((current ? 'Мой вид' : clean.name) + STYLE_EXT, styleToFile(clean, { image: withImage }));
  }
  async function importFile(f?: File) {
    if (!f) return;
    try {
      const got = parseStyleFile(await f.text(), m.id);
      set(current ? { ...got, id: MINE_ID, name: 'Мой вид', where: 'мой вид' } : { ...got, id: m.id, where: m.where });
      toast(`Из файла «${f.name}» взято оформление`);
    } catch (e) {
      toast((e as Error).message);
    }
  }
  function revert() {
    if (current) updateSettings({ ...snap.current });
    else {
      setLocal(initial ?? local);
      setValues({ ...(initial ? (getData().settings.styleValues[initial.id] ?? {}) : {}) });
    }
    hist.current.stack = [];
  }
  const tabs = TABS.filter((t) => !(current && t.styleOnly));
  const canUndo = hist.current.stack.length > 0;
  const hasImage = Boolean(m.bg?.src && m.bg.src.length < MAX_BG_SRC_FILE);
  const exportRow = (
    <>
      <button className="btn small ghost" onClick={exportFile} title={`Сохранить файл ${STYLE_EXT}`}>
        <Icon name="share" size={15} /> Файл
      </button>
      {hasImage && (
        <label className="small row gap4">
          <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} /> с картинкой фона
        </label>
      )}
    </>
  );

  return createPortal(
    <aside className="style-editor" role="dialog" aria-label={current ? 'Настроить текущее оформление' : 'Редактор стиля'}>
      <header className="se-head">
        <span className="se-icon">{m.icon ?? '🎨'}</span>
        {current ? (
          <div className="grow stack gap4">
            <span className="se-title static">Настроить текущий</span>
            <span className="small muted">Всё, что сейчас стоит: тема, цвета, шрифты, углы, фон. Меняется сразу.</span>
          </div>
        ) : (
          <div className="grow stack gap4">
            <input className="se-title" aria-label="Название стиля" value={m.name} maxLength={50} onChange={(e) => set({ ...m, name: e.target.value })} />
            <input className="se-sub" aria-label="Описание" placeholder="Коротко: что меняет" value={m.description} maxLength={240} onChange={(e) => set({ ...m, description: e.target.value })} />
          </div>
        )}
        <button className="icon-btn" aria-label="Закрыть редактор" onClick={close}>
          <Icon name="x" />
        </button>
      </header>
      <div className="row gap8 wrap se-tools">
        <button className="btn small" onClick={() => setAi(true)} title="Скажи словами, что поправить, — ИИ изменит стиль">
          <Icon name="sparkle" size={15} /> Изменить с ИИ
        </button>
        <button className="btn small ghost" onClick={undo} disabled={!canUndo} title="Отменить последнюю правку">
          ↶ Назад
        </button>
        <button className="btn small ghost" onClick={() => fileRef.current?.click()} title={`Взять оформление из файла ${STYLE_EXT}`}>
          <Icon name="folder" size={15} /> Из файла
        </button>
        <input ref={fileRef} type="file" accept={`${STYLE_EXT},${OLD_STYLE_EXT},.json`} hidden onChange={(e) => (void importFile(e.target.files?.[0]), (e.target.value = ''))} />
      </div>
      {!current && (
        <div className="row gap8 se-meta">
          <label className="se-mini">
            <span>Значок</span>
            <input className="input se-ico-in" value={m.icon ?? ''} maxLength={4} onChange={(e) => set({ ...m, icon: e.target.value })} />
          </label>
          <label className="se-mini grow">
            <span>Автор</span>
            <input className="input" value={m.author ?? ''} maxLength={40} onChange={(e) => set({ ...m, author: e.target.value || undefined })} />
          </label>
          <label className="se-mini">
            <span>Версия</span>
            <input className="input se-ver" value={m.version ?? ''} maxLength={20} placeholder="1.0" onChange={(e) => set({ ...m, version: e.target.value || undefined })} />
          </label>
        </div>
      )}
      <div className="se-tabs" role="tablist" aria-label="Раздел редактора">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={'se-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="se-body">
        {tab === 'colors' && <ColorsTab ctx={ctx} />}
        {tab === 'text' && <TextTab ctx={ctx} />}
        {tab === 'shape' && <ShapeTab ctx={ctx} />}
        {tab === 'layout' && <LayoutTab ctx={ctx} />}
        {tab === 'bg' && <BackgroundTab ctx={ctx} />}
        {tab === 'motion' && <MotionTab ctx={ctx} />}
        {tab === 'code' && (
          <>
            <CodePane m={m} set={set} />
            {current && (
              <div className="se-pane">
                <Snippets />
              </div>
            )}
          </>
        )}
        {tab === 'settings' && (
          <SettingsPane
            m={m}
            set={set}
            values={values}
            setValue={(id, v) =>
              setValues((o) => {
                const n = { ...o };
                if (v === undefined) delete n[id];
                else n[id] = v;
                return n;
              })
            }
          />
        )}
        {tab === 'help' && <HelpPane />}
      </div>
      {saveAs !== null && (
        <div className="row gap8 se-saveas">
          <input className="input grow" autoFocus aria-label="Название нового стиля" placeholder="Название стиля" value={saveAs} maxLength={50} onChange={(e) => setSaveAs(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsStyle(saveAs)} />
          <button className="btn small primary" onClick={() => saveCurrentAsStyle(saveAs)}>
            Сохранить
          </button>
          <button className="btn small" onClick={() => setSaveAs(null)}>
            Не надо
          </button>
        </div>
      )}
      <footer className="se-foot">
        {asking ? (
          <>
            <span className="small grow">Закрыть без сохранения? Всё вернётся как было.</span>
            <button className="btn small" onClick={() => setAsking(false)}>
              Продолжить
            </button>
            <button className="btn small danger" onClick={onClose}>
              Закрыть
            </button>
          </>
        ) : current ? (
          <>
            <button className="btn small ghost" onClick={revert} disabled={!dirty} title="Вернуть всё, как было, когда ты открыл редактор">
              Отменить правки
            </button>
            <ConfirmButton className="btn small ghost danger" label="Точно сбросить?" onConfirm={() => (updateSettings(resetCurrentPatch()), (hist.current.stack = []))}>
              Сбросить всё
            </ConfirmButton>
            {exportRow}
            <span className="grow" />
            <button className="btn small" onClick={() => setSaveAs('Мой вид')}>
              Сохранить как стиль
            </button>
            <button className="btn small primary" onClick={onClose}>
              Готово
            </button>
          </>
        ) : (
          <>
            <button className="btn small ghost" onClick={revert} disabled={!dirty} title="Вернуть стиль таким, каким он был при открытии">
              Сбросить
            </button>
            {exportRow}
            <span className="grow" />
            <button className="btn small" onClick={close}>
              Отмена
            </button>
            <button className="btn small" onClick={() => save(false)} disabled={!m.name.trim()}>
              Сохранить
            </button>
            <button className="btn small primary" onClick={() => save(true)} disabled={!m.name.trim()}>
              {isNew ? 'Создать и включить' : 'Сохранить и включить'}
            </button>
          </>
        )}
      </footer>
      {ai && (
        <StyleAiPanel
          current={m}
          replaceId={m.id}
          onClose={() => (setAi(false), setPk((k) => k + 1))}
          onUse={(mod) => {
            set(current ? { ...mod, id: MINE_ID, name: 'Мой вид', where: 'мой вид' } : { ...mod, id: m.id, where: m.where, name: mod.name || m.name });
            setAi(false);
            setPk((k) => k + 1);
          }}
        />
      )}
    </aside>,
    document.body
  );
}
