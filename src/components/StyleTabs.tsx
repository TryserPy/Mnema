// Вкладки редактора стиля, где меняется вид: «Цвета», «Текст», «Форма», «Раскладка», «Фон», «Анимации».
// Всё работает над стилем (Mod): в сохранённом стиле — это его переменные и атрибуты, а в «текущем оформлении» (current) то, что
// лежит в настройках (схема цветов, шрифт, плотность, размер текста, фон), попадает прямо туда (см. appearance.ts).
import { useMemo, useState } from 'react';
import { ACCENTS, ThemeCard } from './ThemeCards';
import { BgImageEditor } from './BgImageEditor';
import { MotionGroups } from './MotionSettings';
import { AttrRow, ColorTokenRow, useFilter, VarRow, type EditCtx } from './StyleControls';
import { ColorPicker, Collapse, Segmented } from './ui';
import { API_VARS, type ApiVar } from '../styleApi';
import { getRadius, getShadow, getVar, MONO_CSS, setDensity, getDensity, setFont, setRadius, setShadow, setVar, type Density, type ShadowLevel } from '../styleBuilder';
import { contrastReport, effectiveColors, fixContrast } from '../styleContrast';
import { BACKGROUNDS, FONTS, HEAD_FONTS, THEMES } from '../themes';
import type { Look } from '../types';

const varOf = (name: string): ApiVar => API_VARS.flatMap((g) => g.vars).find((v) => v.name === name) ?? { name, doc: '' };
const labelOf = (name: string) => varOf(name).label ?? name;
const group = (id: string) => API_VARS.find((g) => g.id === id)!;

/** Подпись-заголовок раздела внутри вкладки. */
const H = ({ children }: { children: React.ReactNode }) => <h4 className="se-h">{children}</h4>;

/** Поле выбора из нескольких значений Look (углы, фон…): в сохранённом стиле есть «Не менять», в текущем оформлении — нет. */
function LookChoice<K extends keyof Look>({ ctx, k, label, hint, options }: { ctx: EditCtx; k: K; label: string; hint?: string; options: { value: Look[K]; label: string }[] }) {
  const cur = ctx.m.look?.[k];
  const set = (v: Look[K] | undefined) => {
    const look = { ...(ctx.m.look ?? {}) } as Partial<Look>;
    if (v === undefined) delete look[k];
    else look[k] = v;
    const { look: _l, ...rest } = ctx.m;
    ctx.set(Object.keys(look).length ? { ...rest, look } : rest);
  };
  return (
    <div className="se-row">
      <div className="se-row-text">
        <span className="se-row-label">{label}</span>
        {hint && <span className="small muted">{hint}</span>}
      </div>
      <div className="se-chips" role="radiogroup" aria-label={label}>
        {!ctx.current && (
          <button type="button" role="radio" aria-checked={cur === undefined} className={'se-chip' + (cur === undefined ? ' on' : '')} onClick={() => set(undefined)}>
            Не менять
          </button>
        )}
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={cur === o.value} className={'se-chip' + (cur === o.value ? ' on' : '')} onClick={() => set(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Цвета ----------

function Scheme({ ctx, dark }: { ctx: EditCtx; dark: boolean }) {
  const key = dark ? 'dark' : 'light';
  const cur = ctx.m.look?.[key];
  const pick = (id: string, accent: string) => {
    if (!ctx.current && cur === id) {
      const look = { ...(ctx.m.look ?? {}) };
      delete look[key];
      const { look: _l, ...rest } = ctx.m;
      return ctx.set(Object.keys(look).length ? { ...rest, look } : rest);
    }
    // В текущем оформлении выбор схемы той темы, которая сейчас на экране, меняет и главный цвет — как всегда в «Оформлении».
    const onScreen = (document.documentElement.dataset.theme === 'dark') === dark;
    ctx.set({ ...ctx.m, look: { ...(ctx.m.look ?? {}), [key]: id }, ...(ctx.current && onScreen ? { accent } : {}) });
  };
  return (
    <div className="stack gap8">
      <span className="small muted">{dark ? 'Для тёмной темы' : 'Для светлой темы'}</span>
      <div className="theme-grid">
        {THEMES.filter((t) => t.dark === dark).map((t) => (
          <ThemeCard key={t.id} t={t} on={cur === t.id} onPick={() => pick(t.id, t.accent)} />
        ))}
      </div>
    </div>
  );
}

export function ColorsTab({ ctx }: { ctx: EditCtx }) {
  const [q, setQ] = useState('');
  const match = useFilter(q);
  const { m, baseApp } = ctx;
  const eff = useMemo(() => ({ light: effectiveColors(m, 'light', baseApp), dark: effectiveColors(m, 'dark', baseApp) }), [m, baseApp]);
  const report = useMemo(() => contrastReport(m, baseApp), [m, baseApp]);
  const bad = report.filter((r) => !r.ok);
  const groups = API_VARS.filter((g) => g.kind === 'color');
  const any = groups.some((g) => g.vars.some((v) => match(v.name, v.label, v.doc, g.title)));
  return (
    <div className="se-pane">
      <H>Цветовая схема</H>
      <Scheme ctx={ctx} dark={false} />
      <Scheme ctx={ctx} dark />
      <H>Главный цвет</H>
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Для обеих тем</span>
          <span className="small muted">Кнопки, ссылки, выбранное. Для светлой и тёмной темы по отдельности — в списке цветов ниже.</span>
        </div>
        <ColorPicker value={m.accent ?? baseApp.accent} onChange={(c) => ctx.set({ ...m, accent: c })} colors={ACCENTS} />
        {!ctx.current && m.accent && (
          <button type="button" className="link-btn small" onClick={() => ctx.set({ ...m, accent: undefined })}>
            Не менять
          </button>
        )}
      </div>
      <H>Читаемость</H>
      {bad.length === 0 ? (
        <p className="small se-ok">Весь текст читается: контраст не ниже 4,5 : 1 в светлой и тёмной теме.</p>
      ) : (
        <div className="se-row bad">
          <span className="se-row-label">Слабый контраст — текст плохо читается</span>
          {bad.slice(0, 6).map((r, i) => (
            <span key={i} className="small">
              {r.mode === 'light' ? 'Светлая' : 'Тёмная'} тема: «{labelOf(r.text)}» на «{labelOf(r.bg)}» — {r.ratio} : 1 (нужно {r.min})
            </span>
          ))}
          {bad.length > 6 && <span className="small muted">…и ещё {bad.length - 6}</span>}
          <div>
            <button type="button" className="btn small" onClick={() => ctx.set(fixContrast(m, baseApp).mod)}>
              Исправить цвет текста
            </button>
          </div>
        </div>
      )}
      <H>Все цвета</H>
      <input className="input" placeholder="Найти цвет: «текст», «кнопка», --bg…" aria-label="Поиск цвета" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.map((g) => {
        const vars = g.vars.filter((v) => match(v.name, v.label, v.doc, g.title));
        return vars.length ? (
          <div key={g.id} className="stack gap8">
            <span className="small muted se-sub-h">{g.title}</span>
            {vars.map((v) => (
              <ColorTokenRow key={v.name} v={v} ctx={ctx} eff={eff} />
            ))}
          </div>
        ) : null;
      })}
      {!any && <p className="small muted">Такого цвета нет.</p>}
    </div>
  );
}

// ---------- Текст ----------

const MONO_CHOICES = [
  { label: 'Cascadia / Consolas', css: MONO_CSS },
  { label: 'Courier', css: "'Courier New', Courier, monospace" },
  { label: 'Системный', css: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
];

export function TextTab({ ctx }: { ctx: EditCtx }) {
  const { m } = ctx;
  const look = m.look ?? {};
  const bodyVar = getVar(m, 'light', '--body');
  const dispVar = getVar(m, 'light', '--display');
  const monoVar = getVar(m, 'light', '--mono');
  const setLook = (patch: Partial<Look>) => ctx.set({ ...m, look: { ...(m.look ?? {}), ...patch } });
  const fontVal = ctx.current ? look.font : (FONTS.find((f) => f.css === bodyVar)?.id ?? (bodyVar ? '?' : ''));
  const headVal = ctx.current ? look.headFont : dispVar === HEAD_FONTS[0].css ? 'literata' : (FONTS.find((f) => f.css === dispVar)?.id ?? (dispVar ? '?' : ''));
  const fs = m.fontScale;
  return (
    <div className="se-pane">
      <H>Шрифты</H>
      <p className="small muted">Только шрифты, которые уже есть в Refrain: из интернета ничего не скачивается.</p>
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Шрифт текста</span>
          <span className="small muted">Основной шрифт всего приложения.</span>
        </div>
        <div className="se-chips" role="radiogroup" aria-label="Шрифт текста">
          {!ctx.current && (
            <button type="button" role="radio" aria-checked={!bodyVar} className={'se-chip' + (!bodyVar ? ' on' : '')} onClick={() => ctx.set(setFont(m, 'body', undefined))}>
              Не менять
            </button>
          )}
          {FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={fontVal === f.id}
              className={'se-chip' + (fontVal === f.id ? ' on' : '')}
              style={{ fontFamily: f.css }}
              onClick={() => (void f.load?.(), ctx.current ? setLook({ font: f.id }) : ctx.set(setFont(m, 'body', f.css, f.id)))}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Шрифт заголовков</span>
        </div>
        <div className="se-chips" role="radiogroup" aria-label="Шрифт заголовков">
          {!ctx.current && (
            <button type="button" role="radio" aria-checked={!dispVar} className={'se-chip' + (!dispVar ? ' on' : '')} onClick={() => ctx.set(setFont(m, 'display', undefined))}>
              Не менять
            </button>
          )}
          {ctx.current ? (
            <>
              <button type="button" role="radio" aria-checked={headVal === 'same'} className={'se-chip' + (headVal === 'same' ? ' on' : '')} onClick={() => setLook({ headFont: 'same' })}>
                Как текст
              </button>
              <button type="button" role="radio" aria-checked={headVal === 'literata'} className={'se-chip' + (headVal === 'literata' ? ' on' : '')} style={{ fontFamily: HEAD_FONTS[0].css }} onClick={() => setLook({ headFont: 'literata' })}>
                Книжный (Литерата)
              </button>
            </>
          ) : (
            <>
              {FONTS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={headVal === f.id} className={'se-chip' + (headVal === f.id ? ' on' : '')} style={{ fontFamily: f.css }} onClick={() => (void f.load?.(), ctx.set(setFont(m, 'display', f.css)))}>
                  {f.name}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Моноширинный шрифт</span>
          <span className="small muted">Для кода и путей к файлам.</span>
        </div>
        <div className="se-chips" role="radiogroup" aria-label="Моноширинный шрифт">
          <button type="button" role="radio" aria-checked={!monoVar} className={'se-chip' + (!monoVar ? ' on' : '')} onClick={() => ctx.set(setVar(m, 'light', '--mono', undefined))}>
            Не менять
          </button>
          {MONO_CHOICES.map((f) => (
            <button key={f.label} type="button" role="radio" aria-checked={monoVar === f.css} className={'se-chip code' + (monoVar === f.css ? ' on' : '')} style={{ fontFamily: f.css }} onClick={() => ctx.set(setVar(m, 'light', '--mono', f.css))}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <H>Размер и интервал</H>
      <div className="se-row" data-set="fontsize">
        <div className="se-row-text">
          <span className="se-row-label">Размер текста</span>
          <span className="small muted">Всё приложение крупнее или мельче.</span>
        </div>
        <span className="row gap8 se-slider">
          <input type="range" aria-label="Размер текста" min={0.85} max={1.5} step={0.05} value={fs ?? 1} style={fs === undefined ? { opacity: 0.45 } : undefined} onChange={(e) => ctx.set({ ...m, fontScale: Number(e.target.value) })} />
          <span className="small se-val">{fs === undefined ? 'как есть' : Math.round(fs * 100) + '%'}</span>
          {fs !== undefined && (
            <button type="button" className="link-btn small" title="Не менять" onClick={() => ctx.set(ctx.current ? { ...m, fontScale: 1 } : (({ fontScale: _f, ...rest }) => rest)(m))}>
              ×
            </button>
          )}
        </span>
      </div>
      {['--rf-body-lh', '--rf-note-size', '--rf-note-lh', '--rf-question-size'].map((n) => (
        <VarRow key={n} v={varOf(n)} ctx={ctx} label={{ '--rf-body-lh': 'Межстрочный интервал текста', '--rf-note-size': 'Размер текста конспекта', '--rf-note-lh': 'Межстрочный интервал конспекта', '--rf-question-size': 'Размер вопроса при повторении' }[n]} />
      ))}
    </div>
  );
}

// ---------- Форма ----------

const RADIUS_NAMES = ['--rf-radius-btn', '--rf-radius-btn-big', '--rf-radius-input', '--rf-radius-grade', '--rf-radius-review', '--rf-radius-note', '--rf-radius-hero', '--rf-radius-row', '--rf-radius-modal', '--rf-radius-menu', '--rf-radius-nav'];
const SIZE_GROUPS = ['sizes', 'layout'];
const NOT_HERE = new Set(['--side-w', '--rf-content-w', '--rf-content-w-wide', '--rf-content-w-narrow', '--rf-review-w', '--rf-tile-w']);

export function ShapeTab({ ctx }: { ctx: EditCtx }) {
  const { m } = ctx;
  const [more, setMore] = useState(false);
  const [sizes, setSizes] = useState(false);
  const radius = getRadius(m);
  const dens: Density = m.density ?? getDensity(m);
  return (
    <div className="se-pane">
      <H>Углы</H>
      <LookChoice
        ctx={ctx}
        k="radius"
        label="Скругление"
        options={[
          { value: 'sharp', label: 'Острые' },
          { value: 'normal', label: 'Обычные' },
          { value: 'round', label: 'Круглые' }
        ]}
      />
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Скругление, px</span>
          <span className="small muted">Одно число — сразу у всех кнопок, карточек и окон.</span>
        </div>
        <span className="row gap8 se-slider">
          <input type="range" aria-label="Скругление углов" min={0} max={40} step={1} value={radius ?? 16} style={radius === null ? { opacity: 0.45 } : undefined} onChange={(e) => ctx.set(setRadius(m, Number(e.target.value)))} />
          <span className="small se-val">{radius === null ? 'как есть' : radius + 'px'}</span>
          {radius !== null && (
            <button type="button" className="link-btn small" onClick={() => ctx.set(setRadius(m, null))}>
              ×
            </button>
          )}
        </span>
      </div>
      <button type="button" className="btn small ghost" aria-expanded={more} onClick={() => setMore(!more)}>
        {more ? 'Скрыть углы по видам' : 'Углы по видам элементов'}
      </button>
      <Collapse open={more}>
        <div className="stack gap8">
          {RADIUS_NAMES.map((n) => (
            <VarRow key={n} v={varOf(n)} ctx={ctx} />
          ))}
        </div>
      </Collapse>
      <H>Рамки и тени</H>
      <VarRow v={varOf('--rf-border-w')} ctx={ctx} />
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Тени</span>
          <span className="small muted">У карточек, окон и меню — в светлой и тёмной теме сразу.</span>
        </div>
        <Segmented<ShadowLevel>
          ariaLabel="Тени"
          value={getShadow(m)}
          options={[
            { value: 'none', label: 'Нет' },
            { value: 'soft', label: 'Мягкие' },
            { value: 'default', label: 'Обычные' },
            { value: 'strong', label: 'Сильные' }
          ]}
          onChange={(l) => ctx.set(setShadow(m, l))}
        />
      </div>
      <H>Плотность</H>
      <div className="se-row" data-set="density">
        <div className="se-row-text">
          <span className="se-row-label">Сколько воздуха</span>
          <span className="small muted">Отступы, высота кнопок и строк.</span>
        </div>
        <Segmented<Density>
          ariaLabel="Плотность"
          value={dens === 'default' ? 'normal' : dens}
          options={[
            { value: 'compact', label: 'Плотно' },
            { value: 'normal', label: 'Обычно' },
            { value: 'comfy', label: 'Просторно' }
          ]}
          onChange={(d) => ctx.set({ ...setDensity(m, 'default'), density: d })}
        />
        {!ctx.current && m.density && (
          <button type="button" className="link-btn small" onClick={() => ctx.set((({ density: _d, ...rest }) => rest)(m))}>
            Не менять
          </button>
        )}
      </div>
      <button type="button" className="btn small ghost" aria-expanded={sizes} onClick={() => setSizes(!sizes)}>
        {sizes ? 'Скрыть точную настройку размеров' : 'Точные размеры: отступы, высота кнопок и полей'}
      </button>
      <Collapse open={sizes}>
        <div className="stack gap8">
          {SIZE_GROUPS.flatMap((id) => group(id).vars)
            .filter((v) => !NOT_HERE.has(v.name))
            .map((v) => (
              <VarRow key={v.name} v={v} ctx={ctx} />
            ))}
        </div>
      </Collapse>
    </div>
  );
}

// ---------- Раскладка ----------

export function LayoutTab({ ctx }: { ctx: EditCtx }) {
  return (
    <div className="se-pane">
      <p className="small muted">На телефоне раскладка остаётся прежней — меняется только на компьютере и планшете.</p>
      <H>Расположение</H>
      {['sidebar', 'content', 'topics', 'tabs'].map((n) => (
        <AttrRow key={n} name={n} ctx={ctx} />
      ))}
      <H>Карточки и кнопки</H>
      {['cards', 'grades'].map((n) => (
        <AttrRow key={n} name={n} ctx={ctx} />
      ))}
      <H>Ширина</H>
      {['--side-w', '--rf-content-w', '--rf-content-w-wide', '--rf-content-w-narrow', '--rf-review-w', '--rf-tile-w'].map((n) => (
        <VarRow key={n} v={varOf(n)} ctx={ctx} />
      ))}
    </div>
  );
}

// ---------- Фон ----------

export function BackgroundTab({ ctx }: { ctx: EditCtx }) {
  const { m } = ctx;
  return (
    <div className="se-pane">
      <H>Узор</H>
      <LookChoice ctx={ctx} k="background" label="Узор на фоне экрана" options={BACKGROUNDS.map((b) => ({ value: b.id, label: b.name }))} />
      <H>Своя картинка</H>
      <BgImageEditor bg={m.bg} inStyle={!ctx.current} onChange={(bg) => ctx.set(bg ? { ...m, bg } : (({ bg: _b, ...rest }) => rest)(m))} />
    </div>
  );
}

// ---------- Анимации ----------

export function MotionTab({ ctx }: { ctx: EditCtx }) {
  return (
    <div className="se-pane">
      <AttrRow name="anim" ctx={ctx} />
      {ctx.current && (
        <>
          <H>Подробнее</H>
          <div className="stack gap8">
            <MotionGroups />
          </div>
        </>
      )}
      {!ctx.current && <p className="small muted">Подробный выбор («Переходы», «Окна», «Нажатия»…) есть в «Оформление → Настроить текущий → Анимации»: это личный выбор, в стиль он не входит.</p>}
    </div>
  );
}
