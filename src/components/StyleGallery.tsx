// «Настройки → Стили»: плитки с живым примером каждого стиля. Пример — кусочек Refrain в своём Shadow DOM,
// на него действует только CSS этого стиля (включённые стили и остальное приложение его не меняют).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cssForDemo, demoParts, type DemoPart } from '../styleDemo';
import { attrName, compileStyles } from '../styleSystem';
import type { Mod } from '../types';
import { Icon } from './ui';

// Ширина примера «в натуральную величину»; в плитку он вписывается уменьшением (zoom).
const SCENE_W = 320;

const BASE_CSS = `
:host { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; overflow: hidden; }
.main { box-sizing: border-box; width: ${SCENE_W}px; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: transparent; color: var(--ink);
  font-family: var(--body); font-size: 15px; line-height: 1.4; }
.display { font-family: var(--display); font-weight: 600; font-size: 1.9rem; line-height: 1.15; letter-spacing: -0.01em; }
.nav-item { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 0 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); font-weight: 500; }
.nav-item i { width: 16px; height: 16px; border-radius: 5px; border: 2px solid var(--muted); box-sizing: border-box; }
.badge { margin-left: auto; min-width: 24px; height: 24px; padding: 0 7px; box-sizing: border-box; border-radius: 12px; background: var(--accent); color: var(--on-accent);
  font-size: 0.8rem; font-weight: 700; display: grid; place-items: center; }
.hero { background: var(--accent); color: var(--on-accent); border-radius: 20px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.hero-label { font-size: 0.85rem; opacity: 0.9; }
.hero-top { display: flex; align-items: flex-end; gap: 10px; }
.hero-num { font-family: var(--display); font-size: 2.6rem; font-weight: 700; line-height: 0.9; }
.hero-sub { font-size: 0.95rem; opacity: 0.92; }
.hero-btn { height: 46px; border-radius: 12px; background: var(--on-accent); color: var(--accent); font-weight: 700; font-size: 1.05rem;
  display: flex; align-items: center; justify-content: center; gap: 8px; }
.review-card { background: var(--surface); border: 1px solid var(--line); border-radius: 22px; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; box-shadow: var(--shadow); }
.review-card .small { font-size: 0.8rem; color: var(--muted); }
.question { font-family: var(--display); font-size: 1.4rem; line-height: 1.3; font-weight: 500; }
.divider { height: 1px; background: var(--line); }
.answer-text { font-size: 1.05rem; line-height: 1.45; }
.grades { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.grade { min-height: 54px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font-size: 1rem; font-weight: 600; }
.grade small { font-size: 0.72rem; font-weight: 400; opacity: 0.8; }
.grade.again { background: var(--again-bg); color: var(--again-ink); }
.grade.hard { background: var(--hard-bg); color: var(--hard-ink); }
.grade.good { background: var(--good-bg); color: var(--good-ink); }
.grade.easy { background: var(--easy-bg); color: var(--easy-ink); }
.note-page { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 18px; }
.note-doc { font-size: 1rem; line-height: 1.6; }
.note-doc p { margin: 0; }
.note-doc mark { background: var(--mark, color-mix(in srgb, var(--accent) 22%, transparent)); color: inherit; border-radius: 3px; padding: 0 2px; }
.controls { display: flex; flex-direction: column; gap: 10px; }
.input { min-height: 40px; box-sizing: border-box; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); display: flex; align-items: center; padding: 0 12px; }
.row { display: flex; align-items: center; gap: 8px; }
.btn { min-height: 38px; box-sizing: border-box; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink);
  display: inline-flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.95rem; }
.btn.primary { background: var(--accent); color: var(--on-accent); border-color: transparent; }
.switch { width: 50px; height: 30px; box-sizing: border-box; border-radius: 15px; padding: 3px; margin-left: auto; background: var(--line-2); display: flex; justify-content: flex-start; }
.switch.on { background: var(--accent); justify-content: flex-end; }
.switch span { width: 24px; height: 24px; border-radius: 12px; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); }

/* мини-приложение для стилей, которые меняют раскладку (атрибуты data-ui-* приходят на хозяина примера) */
.mini { display: flex; gap: 8px; height: 190px; width: 100%; }
.mini-side { width: 62px; flex: none; background: var(--side); border: 1px solid var(--line); border-radius: calc(var(--rf-radius-nav, 10px) + 2px); padding: 8px; display: flex; flex-direction: column; gap: 6px; box-sizing: border-box; }
.mini-side i { display: block; height: calc(var(--rf-nav-h, 42px) * 0.2); min-height: 6px; border-radius: 4px; background: var(--line-2); }
.mini-side i.on { background: var(--accent); }
.mini-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; background: var(--bg); }
.mini-col { width: 100%; max-width: 230px; display: flex; flex-direction: column; gap: calc(var(--gap, 16px) * 0.4); }
.mini-tabs { display: flex; gap: 10px; border-bottom: 1px solid var(--line); font-size: 0.7rem; color: var(--muted); }
.mini-tabs b { font-weight: 500; padding: 2px 4px; }
.mini-tabs b.on { color: var(--ink); border-bottom: 2px solid var(--accent); }
.mini-topics { display: flex; flex-direction: column; gap: calc(var(--rf-list-gap, 8px) * 0.5); }
.mini-topics .topic-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: calc(var(--rf-btn-h, 42px) * 0.62); padding: 0 9px; font-size: 0.72rem; background: var(--surface); border: var(--rf-border-w, 1px) solid var(--line); border-radius: calc(var(--rf-radius-row, 14px) * 0.6); box-shadow: var(--shadow); box-sizing: border-box; }
.mini-topics .badge { font-size: 0.6rem; min-width: 0; height: 15px; padding: 0 5px; }
.mini .grades { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; }
.mini .grade { min-height: calc(var(--rf-grade-h, 70px) * 0.3); font-size: 0.6rem; border-radius: calc(var(--rf-radius-grade, 16px) * 0.4); }
:host([data-ui-sidebar='right']) .mini { flex-direction: row-reverse; }
:host([data-ui-sidebar='top']) .mini { flex-direction: column; }
:host([data-ui-sidebar='top']) .mini-side { width: auto; flex-direction: row; align-items: center; height: 24px; padding: 0 8px; }
:host([data-ui-sidebar='top']) .mini-side i { width: 30px; height: 7px; }
:host([data-ui-sidebar='rail']) .mini-side { width: 24px; padding: 8px 5px; }
:host([data-ui-content='narrow']) .mini-col { max-width: 140px; }
:host([data-ui-content='wide']) .mini-col, :host([data-ui-content='full']) .mini-col { max-width: none; }
:host([data-ui-topics='tiles']) .mini-topics { display: grid; grid-template-columns: 1fr 1fr; }
:host([data-ui-topics='tiles']) .mini-topics .topic-row { min-height: 44px; flex-direction: column; align-items: flex-start; justify-content: center; }
:host([data-ui-grades='grid']) .mini .grades { grid-template-columns: repeat(2, minmax(0, 1fr)); }
:host([data-ui-grades='tall']) .mini .grade { min-height: 34px; }
:host([data-ui-cards='flat']) .mini-topics .topic-row { border-color: transparent; box-shadow: none; }
:host([data-ui-cards='outline']) .mini-topics .topic-row { border-width: 2px; box-shadow: none; }
:host([data-ui-cards='sharp']) .mini-topics .topic-row { border-radius: 2px; }
:host([data-ui-tabs='pills']) .mini-tabs { border-bottom: 0; }
:host([data-ui-tabs='pills']) .mini-tabs b { border-radius: 999px; padding: 2px 8px; }
:host([data-ui-tabs='pills']) .mini-tabs b.on { border-bottom: 0; background: color-mix(in srgb, var(--accent) 16%, var(--surface)); }
:host([data-ui-tabs='boxed']) .mini-tabs { border: 1px solid var(--line); border-radius: 9px; padding: 2px; background: var(--sunken); align-self: flex-start; gap: 2px; }
:host([data-ui-tabs='boxed']) .mini-tabs b.on { border-bottom: 0; background: var(--surface); border-radius: 7px; }
`;

const PARTS: Record<DemoPart, ReactNode> = {
  layout: (
    <div className="mini">
      <div className="mini-side">
        <i className="on" />
        <i />
        <i />
        <i />
      </div>
      <div className="mini-main">
        <div className="mini-col">
          <div className="mini-tabs">
            <b className="on">Конспект</b>
            <b>Карточки</b>
            <b>Тест</b>
          </div>
          <div className="mini-topics">
            <div className="topic-row">
              <span>§1 Клетка</span>
              <span className="badge">3</span>
            </div>
            <div className="topic-row">
              <span>§2 Ткани</span>
            </div>
            <div className="topic-row">
              <span>§3 Органы</span>
              <span className="badge">1</span>
            </div>
          </div>
          <div className="grades">
            <span className="grade again">Снова</span>
            <span className="grade hard">Трудно</span>
            <span className="grade good">Хорошо</span>
            <span className="grade easy">Легко</span>
          </div>
        </div>
      </div>
    </div>
  ),
  title: <div className="display">Сегодня</div>,
  nav: (
    <div className="nav-item">
      <i /> Учусь <span className="badge">54</span>
    </div>
  ),
  hero: (
    <div className="hero">
      <span className="hero-label">На сегодня</span>
      <span className="hero-top">
        <span className="hero-num">54</span>
        <span className="hero-sub">карточки · 10 мин</span>
      </span>
      <span className="hero-btn">▶ Учиться</span>
    </div>
  ),
  card: (
    <div className="review-card">
      <span className="small">Биология · Клетка</span>
      <div className="question">Где в клетке хранится ДНК?</div>
      <div className="divider" />
      <div className="answer-text">В ядре — в хромосомах.</div>
    </div>
  ),
  grades: (
    <div className="grades">
      <span className="grade again">Снова<small>10 мин</small></span>
      <span className="grade hard">Трудно<small>2 дня</small></span>
      <span className="grade good">Хорошо<small>5 дней</small></span>
      <span className="grade easy">Легко<small>12 дней</small></span>
    </div>
  ),
  note: (
    <div className="note-page">
      <div className="note-doc">
        <p>
          <mark>Фотосинтез</mark> — образование органических веществ из углекислого газа и воды на свету. Идёт в хлоропластах.
        </p>
      </div>
    </div>
  ),
  controls: (
    <div className="controls">
      <div className="input">Твой ответ…</div>
      <div className="row">
        <span className="btn primary">Проверить</span>
        <span className="btn">Позже</span>
        <span className="switch on">
          <span />
        </span>
      </div>
    </div>
  )
};

/** Живой пример одного стиля. Вписывается в плитку целиком: уменьшение считаем по ширине и высоте. */
export function StyleDemo({ mod, theme }: { mod: Mod; theme: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useLayoutEffect(() => {
    const h = host.current;
    if (h) setRoot(h.shadowRoot ?? h.attachShadow({ mode: 'open' }));
  }, []);
  // Пример собирается тем же кодом, что и настоящий интерфейс: переменные, настройки (по умолчанию) и CSS стиля.
  const compiled = useMemo(() => compileStyles([{ mod }]), [mod]);
  const css = compiled.css;
  useEffect(() => {
    const h = host.current;
    if (!h || !root) return;
    const fit = () => {
      const s = scene.current;
      if (!s || !h.clientWidth) return;
      s.style.zoom = '1';
      const z = Math.min(h.clientWidth / SCENE_W, h.clientHeight / Math.max(1, s.offsetHeight), 1);
      s.style.zoom = String(Math.round(z * 1000) / 1000);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(h);
    // Шрифт стиля («Тетрадь» — Comfortaa) может догрузиться позже: пример станет выше — пересчитать.
    const fonts = document.fonts;
    fonts?.addEventListener?.('loadingdone', fit);
    void fonts?.ready.then(fit);
    return () => {
      ro.disconnect();
      fonts?.removeEventListener?.('loadingdone', fit);
    };
  }, [root, css]);
  const parts = demoParts(mod.css ?? '', compiled.attrs);
  const hostAttrs = Object.fromEntries(Object.entries(compiled.attrs).map(([k, v]) => [attrName(k), v]));
  return (
    <span ref={host} className="st-demo" data-theme={theme} {...hostAttrs} style={mod.accent ? ({ '--accent': mod.accent } as CSSProperties) : undefined} aria-hidden="true">
      {root &&
        createPortal(
          <>
            <style>{BASE_CSS + '\n' + cssForDemo(css)}</style>
            <div ref={scene} className="main">
              {parts.map((p) => (
                <div key={p}>{PARTS[p]}</div>
              ))}
            </div>
          </>,
          root
        )}
    </span>
  );
}

export interface TileAction {
  icon: string;
  label: string;
  run: () => void;
}

/** Плитка стиля: пример сверху, название и пояснение снизу. Нажатие включает и выключает стиль; в углу — «на основе», правка, файл, удаление. */
export function StyleTile({ mod, on, theme, onToggle, actions = [], delay }: { mod: Mod; on: boolean; theme: string; onToggle: () => void; actions?: TileAction[]; delay: number }) {
  return (
    <div className={'st-cell' + (on ? ' on' : '')} style={{ animationDelay: delay + 'ms' }}>
      <button type="button" className="st-tile" aria-pressed={on} onClick={onToggle}>
        <span className="st-frame">
          <StyleDemo mod={mod} theme={theme} />
          <span className="st-check" aria-hidden="true">
            <Icon name="check" size={16} />
          </span>
        </span>
        <span className="st-info">
          {mod.where && <span className="st-where">{mod.where}</span>}
          <span className="st-name">
            {mod.icon && <span aria-hidden="true">{mod.icon} </span>}
            {mod.name}
          </span>
          {mod.description && <span className="st-desc">{mod.description}</span>}
          {mod.desktopOnly && (
            <span className="st-pc" title="На телефоне этот стиль почти ничего не меняет">
              только для компьютера
            </span>
          )}
        </span>
      </button>
      {actions.length > 0 && (
        <span className="st-actions">
          {actions.map((a) => (
            <button key={a.label} type="button" className="st-act" aria-label={`${a.label}: «${mod.name}»`} title={a.label} onClick={a.run}>
              <Icon name={a.icon} size={15} />
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
