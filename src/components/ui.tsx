import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { placeMenu } from '../menuPlace';

const paths: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" />
      <path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V11" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M21 20H3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10" />
      <path d="M18 6h2" />
      <circle cx="16" cy="6" r="2" />
      <path d="M4 12h4" />
      <path d="M12 12h8" />
      <circle cx="10" cy="12" r="2" />
      <path d="M4 18h12" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  flame: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.5 1 2.5 2 2.5 0-3-1-5 1-8z" />,
  bulb: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </>
  ),
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  left: <path d="M15 5l-7 7 7 7" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  sync: (
    <>
      <path d="M20 8a8 8 0 0 0-14.5-2.5L4 7" />
      <path d="M4 3v4h4" />
      <path d="M4 16a8 8 0 0 0 14.5 2.5L20 17" />
      <path d="M20 21v-4h-4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  cloud: <path d="M7 18h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 18z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 6h14a2 2 0 0 1 2 2v14" />
    </>
  ),
  important: (
    <>
      <path d="M5 4h14v17l-7-4-7 4z" />
    </>
  ),
  timeline: (
    <>
      <path d="M12 3v18" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="12" cy="17" r="2" />
      <path d="M14 7h6M4 17h6" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  starFill: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" />,
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </>
  ),
  subtopic: (
    <>
      <path d="M5 4v10a3 3 0 0 0 3 3h11" />
      <path d="M15 13l4 4-4 4" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z" />
      <path d="M14 7l3 3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.4 3" />
      <path d="M6.3 7.8C4.2 9.3 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 4-1" />
    </>
  ),
  cardPlus: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M12 9v6M9 12h6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </>
  ),
  folder: <path d="M3 6h6l2 2h10v11H3z" />,
  map: (
    <>
      <circle cx="6" cy="7" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="12" cy="17" r="2.6" />
      <path d="M7.9 8.3l3 6.6M16.8 7.9l-3.6 7M8.2 6.8l7.6-.6" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  sort: (
    <>
      <path d="M7 5v14M4 16l3 3 3-3" />
      <path d="M13 7h7M13 12h5M13 17h3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4" />
      <path d="M7.5 8.5L12 4l4.5 4.5" />
      <path d="M5 15v4.5h14V15" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  magic: (
    <>
      <path d="M5 19L15.5 8.5" />
      <path d="M14 5.5l1.5-1.5M18.5 10l1.5-1.5M16.5 3.5V5.5M20.5 7.5H18.5" />
      <path d="M13.5 7l3.5 3.5" />
    </>
  ),
  right: <path d="M9 6l6 6-6 6" />,
  homework: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 3.5v3h6v-3M8.5 11l1.8 1.8 3.4-3.6M8.5 16h7" />
    </>
  ),
  folderPlus: (
    <>
      <path d="M3 6h6l2 2h10v11H3z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1.2" fill="currentColor" />
    </>
  ),
  rules: (
    <>
      <path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v11.5H8.5A3.5 3.5 0 0 1 5 16z" />
      <path d="M9 9h6M9 12.5h6M9 16h3" />
    </>
  ),
  tools: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
      <path d="M16.75 13.5v6.5M13.5 16.75H20" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14" />
      <path d="M12 17.5v.01" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
      <circle cx="7.5" cy="11" r="1.2" />
      <circle cx="10.5" cy="7" r="1.2" />
      <circle cx="15" cy="7.5" r="1.2" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11 3.5 12.8 9.2 18.5 11 12.8 12.8 11 18.5 9.2 12.8 3.5 11 9.2 9.2z" />
      <path d="M18.5 3.5v3M17 5h3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 4v4" />
      <circle cx="12" cy="3.5" r="1" />
      <path d="M9 13h.01M15 13h.01" />
      <path d="M9.5 16h5" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </>
  ),
  brush: (
    <>
      <path d="M14 4 20 10l-8 8-3-3z" />
      <path d="M9 15c-2 0-4 1.5-4 4 0 .6-.4 1-1 1 1 1 2.5 1 3.5 1 2.5 0 4-2 4-4" />
    </>
  ),
  code: (
    <>
      <path d="m8 7-5 5 5 5" />
      <path d="m16 7 5 5-5 5" />
      <path d="m14 4-4 16" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" />
      <path d="M5 19 13 11" />
    </>
  ),
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  puzzle: <path d="M9 4h4v3a1.5 1.5 0 0 0 3 0V4h4v6h-3a1.5 1.5 0 0 0 0 3h3v7h-6v-3a1.5 1.5 0 0 0-3 0v3H4v-7h3a1.5 1.5 0 0 0 0-3H4V4z" />,
  print: (
    <>
      <path d="M7 9V4h10v5" />
      <rect x="4" y="9" width="16" height="8" rx="2" />
      <path d="M7 14h10v6H7z" />
    </>
  ),
  share: (
    <>
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 13v7h14v-7" />
    </>
  ),
  test: (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 11a8 8 0 0 1 14-5.3L20 8" />
      <path d="M20 3v5h-5" />
      <path d="M20 13a8 8 0 0 1-14 5.3L4 16" />
      <path d="M4 21v-5h5" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2" />
      <path d="M10 2h4" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </>
  )
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Modal({ title, onClose, children, width = 520, sticky = false }: { title: string; onClose: () => void; children: ReactNode; width?: number; sticky?: boolean }) {
  // Закрытие с анимацией: окно сначала плавно уходит, потом исчезает.
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const close = () => {
    if (closing) return;
    if (!motionOn('windows')) return closeRef.current();
    setClosing(true);
    closeTimer.current = setTimeout(() => closeRef.current(), 150);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sticky) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // Окно всегда в <body>: иначе карточка с анимацией (transform) обрезает его и перекрывает соседями.
  return createPortal(
    <div className={'modal-back' + (closing ? ' closing' : '')} onMouseDown={(e) => !sticky && e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={close} aria-label="Закрыть">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** Кнопка удаления с подтверждением вторым нажатием. */
export function ConfirmButton({ onConfirm, children, className = 'btn ghost danger', label = 'Точно удалить?' }: { onConfirm: () => void; children: ReactNode; className?: string; label?: string }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={className + (armed ? ' armed' : '')}
      onClick={() => {
        if (armed) {
          clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3000);
        }
      }}
    >
      {armed ? label : children}
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ariaLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number; y: number; h: number } | null>(null);
  // Сколько кнопок в ряду: все в одном, а если подписи не влезают (узкий экран) — в два ряда и т. д.
  const [cols, setCols] = useState(options.length);
  const idx = options.findIndex((o) => o.value === value);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      const btns = Array.from(box.querySelectorAll<HTMLButtonElement>(':scope > button'));
      // На компьютере — всегда один ряд, как раньше. Только на узком экране телефона, если 4+ подписи
      // не помещаются, — два ряда (2 + 2). Три и меньше — один ряд, подпись переносится внутри кнопки.
      let c = options.length;
      if (window.innerWidth <= 720 && options.length >= 4) {
        // Настоящие отступы кнопки (у разных переключателей они разные) + запас на жирную подпись выбранной.
        const cs = btns[0] ? getComputedStyle(btns[0]) : null;
        const pad = cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2 : 20;
        const widest = Math.max(0, ...btns.map((b) => (b.firstElementChild as HTMLElement | null)?.getBoundingClientRect().width ?? 0)) * 1.08 + pad;
        // Ширину берём у места, где стоит переключатель, а не у него самого: его ширина зависит от числа колонок.
        const avail = Math.min(box.parentElement?.clientWidth ?? window.innerWidth, window.innerWidth - 24) - 8;
        if (widest * options.length + (options.length - 1) * 4 > avail) c = Math.ceil(options.length / 2);
      }
      setCols(c);
      const b = btns[idx];
      if (b) {
        const next = { x: b.offsetLeft, w: b.offsetWidth, y: b.offsetTop, h: b.offsetHeight };
        setPill((p) => (p && p.x === next.x && p.w === next.w && p.y === next.y && p.h === next.h ? p : next));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [idx, options.map((o) => o.label).join('|'), cols]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className={'seg' + (cols < options.length ? ' seg-rows' : '')} role="radiogroup" aria-label={ariaLabel} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {pill && <span className="seg-pill" aria-hidden style={{ transform: `translate(${pill.x}px, ${pill.y}px)`, width: pill.w, height: pill.h }} />}
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          <AnimText value={o.label} />
        </button>
      ))}
    </div>
  );
}

/** Вкладки, которые не прокручиваются вбок: что не влезло — уходит в «Ещё». */
export function OverflowTabs<T extends string>({ items, value, onChange, ariaLabel, onReorder }: { items: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; ariaLabel?: string; onReorder?: (from: T, to: T) => void }) {
  const [dragV, setDragV] = useState<T | null>(null);
  const [overV, setOverV] = useState<T | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(items.length);
  const [moreOpen, setMoreOpen] = useState(false);
  const pres = usePresence(moreOpen, 140);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  const key = items.map((i) => i.value + ':' + i.label + ':' + (i.count ?? '')).join('|');
  useLayoutEffect(() => {
    const el = box.current;
    const m = measure.current;
    if (!el || !m) return;
    const calc = () => {
      const widths = [...m.children].map((c) => (c as HTMLElement).offsetWidth + 4);
      const moreW = 112; // «Ещё» с числом
      const avail = el.clientWidth;
      let used = 0;
      let n = 0;
      for (let i = 0; i < widths.length; i++) {
        const rest = i < widths.length - 1 ? moreW : 0;
        if (used + widths[i] + rest > avail) break;
        used += widths[i];
        n++;
      }
      setFit(Math.max(1, n));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);
  // выбранная вкладка всегда на виду: если она «в Ещё», встаёт на место последней видимой
  let shown = items.slice(0, fit);
  let hidden = items.slice(fit);
  const selHidden = hidden.findIndex((i) => i.value === value);
  if (selHidden >= 0 && shown.length) {
    const sel = hidden[selHidden];
    const last = shown[shown.length - 1];
    shown = [...shown.slice(0, -1), sel];
    hidden = [last, ...hidden.filter((_, k) => k !== selHidden)];
  }
  useLayoutEffect(() => {
    const on = box.current?.querySelector<HTMLElement>('.otab.on');
    setBar(on ? { x: on.offsetLeft, w: on.offsetWidth } : null);
  }, [value, fit, key]);
  useEffect(() => {
    if (!moreOpen) return;
    const close = () => setMoreOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [moreOpen]);
  const label = (i: { label: string; count?: number }) => (
    <>
      <span className="otab-label">{i.label}</span>
      {i.count !== undefined && <span className="otab-count">{i.count}</span>}
    </>
  );
  return (
    <div className="otabs" ref={box} role="tablist" aria-label={ariaLabel}>
      <div className="otabs-measure" ref={measure} aria-hidden="true">
        {items.map((i) => (
          <span key={i.value} className="otab">
            {label(i)}
          </span>
        ))}
      </div>
      {shown.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={i.value === value}
          className={'otab' + (i.value === value ? ' on' : '') + (dragV === i.value ? ' dragging' : '') + (overV === i.value && dragV && dragV !== i.value ? ' drop-here' : '')}
          onClick={() => onChange(i.value)}
          draggable={Boolean(onReorder)}
          title={onReorder ? 'Перетащи, чтобы поменять порядок' : undefined}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            setDragV(i.value);
          }}
          onDragOver={(e) => {
            if (!dragV) return;
            e.preventDefault();
            if (overV !== i.value) setOverV(i.value);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragV && dragV !== i.value) onReorder?.(dragV, i.value);
            setDragV(null);
            setOverV(null);
          }}
          onDragEnd={() => {
            setDragV(null);
            setOverV(null);
          }}
        >
          {label(i)}
        </button>
      ))}
      {hidden.length > 0 && (
        <div className="more otab-more" onMouseDown={(e) => e.stopPropagation()}>
          <button className={'otab' + (moreOpen ? ' open' : '')} aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
            <span className="otab-label">Ещё</span>
            <span className="otab-count">{hidden.length}</span>
            <Icon name="chevron" size={14} />
          </button>
          {pres.mounted && (
            <div className={'menu' + (pres.closing ? ' closing' : '')} role="menu">
              {hidden.map((i) => (
                <button
                  key={i.value}
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    onChange(i.value);
                  }}
                >
                  <span className="grow clamp1">{i.label}</span>
                  {i.count !== undefined && <span className="muted small">{i.count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {bar && <span className="otab-bar" style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} />}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={'switch' + (checked ? ' on' : '')} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export const SUBJECT_COLORS = [
  '#2F8F5B', '#B4452F', '#2A5BB8', '#6B3FC4', '#B7791F', '#1F7A6B', '#C2417A', '#3A3F4E',
  '#E0572E', '#D69A00', '#7AA521', '#0E8FA3', '#1E6FD9', '#4B4FD6', '#8E44AD', '#D0457F',
  '#A0522D', '#5D7A3A', '#2C8C7A', '#6C7A89', '#E36B6B', '#F28C38', '#3FA7D6', '#9B6BD6'
];

/** Выбор цвета: 12 основных, остальные — по кнопке «ещё», плюс свой любой. */
export function ColorPicker({ value, onChange, colors = SUBJECT_COLORS, custom = true }: { value: string; onChange: (c: string) => void; colors?: string[]; custom?: boolean }) {
  const isCustom = !colors.some((c) => c.toLowerCase() === value.toLowerCase());
  const base = colors.length > 14 ? colors.slice(0, 10) : colors;
  const rest = colors.slice(base.length);
  const [more, setMore] = useState(() => rest.some((c) => c.toLowerCase() === value.toLowerCase()));
  const sw = (c: string) => <button key={c} type="button" aria-label={`Цвет ${c}`} className={'swatch' + (c.toLowerCase() === value.toLowerCase() ? ' on' : '')} style={{ background: c, ['--sw' as string]: c }} onClick={() => onChange(c)} />;
  return (
    <div className="swatches">
      {base.map(sw)}
      {more && rest.map(sw)}
      {rest.length > 0 && (
        <button type="button" className="swatch more-sw" aria-expanded={more} title={more ? 'Меньше цветов' : 'Ещё цвета'} aria-label={more ? 'Меньше цветов' : 'Ещё цвета'} onClick={() => setMore(!more)}>
          {more ? '−' : '···'}
        </button>
      )}
      {custom && (
        <label className={'swatch custom-sw' + (isCustom ? ' on' : '')} title="Свой цвет" style={isCustom ? { background: value, ['--sw' as string]: value } : undefined}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Свой цвет" />
          {!isCustom && <span aria-hidden>+</span>}
        </label>
      )}
    </div>
  );
}

export const SUBJECT_ICONS = [
  '➗', '📐', '📏', '🧮', '📊', '🎲', '🔢', '∑',
  '🧪', '⚗️', '🧬', '🌿', '🦠', '🔬', '⚡', '🧲', '🔭', '🪐',
  '🌍', '🗺️', '🏛️', '📜', '⚖️', '👥', '💰',
  '📖', '✍️', '📝', '🗣️', '🇬🇧', '🇩🇪', '🇫🇷', '🇪🇸', '🇨🇳',
  '💻', '🤖', '🎨', '🎵', '⚽', '🏃', '🧠', '🍳', '🛠️', '⭐'
];

/** Значок: одна кнопка, по нажатию — сетка значков. */
export function IconPicker({ value, onChange, color }: { value?: string; onChange: (v?: string) => void; color?: string }) {
  const [open, setOpen] = useState(false);
  const pres = usePresence(open, 140);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="icon-pick" ref={ref}>
      <button type="button" className={'icon-pick-btn' + (open ? ' open' : '')} aria-expanded={open} onClick={() => setOpen(!open)}>
        {value ? <SubjectMark color={color ?? 'var(--accent)'} icon={value} /> : <span className="icon-pick-none" />}
        <span>{value ? 'Сменить значок' : 'Выбрать значок'}</span>
        <Icon name="chevron" size={12} />
      </button>
      {value && (
        <button type="button" className="link-btn small" onClick={() => onChange(undefined)}>
          убрать
        </button>
      )}
      {pres.mounted && (
        <div className={'icon-pop' + (pres.closing ? ' closing' : '')} role="listbox" aria-label="Значки">
          {SUBJECT_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={value === i}
              className={'ico-opt' + (value === i ? ' on' : '')}
              onClick={() => {
                onChange(i);
                setOpen(false);
              }}
              aria-label={`Значок ${i}`}
            >
              {i}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Значок предмета: эмодзи на цветной подложке или просто цветная точка. */
export function SubjectMark({ color, icon, size = 'small' }: { color: string; icon?: string; size?: 'small' | 'big' }) {
  if (!icon) return <span className={size === 'big' ? 'subject-badge' : 'dot'} style={{ background: color }} />;
  return (
    <span className={'subj-ico ' + size} style={{ background: `color-mix(in srgb, ${color} 22%, transparent)`, borderColor: color }}>
      {icon}
    </span>
  );
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export interface MenuItem {
  label: string;
  icon?: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Кнопка «⋯» с выпадающим меню редких действий. */
export function MoreMenu({ items, label = 'Ещё', icon = 'dots', title, align = 'right' }: { items: MenuItem[]; label?: string; icon?: string; title?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const visible = items.filter((i) => !i.hidden);
  const pres = usePresence(open, 130);
  return (
    <div className="more" ref={ref}>
      <button type="button" className={'icon-btn bordered' + (icon !== 'dots' ? ' add-btn' : '')} aria-label={label} title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={icon} />
      </button>
      {pres.mounted && (
        <div className={'menu' + (align === 'right' ? ' right' : '') + (pres.closing ? ' closing' : '')} role="menu">
          {visible.map((i) => (
            <button
              key={i.label}
              role="menuitem"
              className={i.danger ? 'danger' : ''}
              onClick={() => {
                setOpen(false);
                i.onClick();
              }}
            >
              {i.icon && <Icon name={i.icon} size={18} />}{' '}
              {i.hint ? (
                <span className="menu-2l">
                  <span>{i.label}</span>
                  <small>{i.hint}</small>
                </span>
              ) : (
                i.label
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Телефон или компьютер ----------

/** Сенсорный экран (телефон, планшет): нет мыши и клавиатуры — не показываем подсказки про них. */
export function touchUI(): boolean {
  if (typeof window === 'undefined') return false;
  return window.mnemaApi?.platform === 'android' || Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}

/** Как вызвать действие над выделенным текстом — по-разному для мыши и для пальца. */
export function selHow(action: string): string {
  return touchUI() ? `выдели и выбери «${action}» в меню над текстом` : `выдели, нажми правую кнопку мыши → «${action}»`;
}

// ---------- Меню всегда целиком на экране ----------

// Меню, которые на телефоне становятся шторкой снизу (положение задаёт CSS, подгонять нечего).
const SHEET_MENUS = '.topic-tabs .more .menu, .otab-more .menu, .note-insert .menu, .note-float-panel .menu';
const isPhoneSheet = (el: HTMLElement) => el.matches(SHEET_MENUS) && window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;

/** Видимая область, в которой меню обязано поместиться: окно (с учётом экранной клавиатуры) и, если меню живёт в прокручиваемой
 *  области, её видимая ширина без полосы прокрутки. */
function viewBounds(el: HTMLElement) {
  const vv = window.visualViewport;
  const b = { left: vv?.offsetLeft ?? 0, top: vv?.offsetTop ?? 0, right: (vv?.offsetLeft ?? 0) + (vv?.width ?? window.innerWidth), bottom: (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight) };
  // Полноэкранный конспект лежит поверх всего окна, остальное режется границей .main.
  const sc = el.closest('.note-layout.full') ? null : el.closest<HTMLElement>('.main');
  if (sc) {
    const r = sc.getBoundingClientRect();
    b.left = Math.max(b.left, r.left);
    b.right = Math.min(b.right, r.left + sc.clientLeft + sc.clientWidth);
  }
  return b;
}

/** Поставить открытое меню так, чтобы оно целиком было на экране: прижать к нужному краю кнопки, открыть вверх, если внизу тесно,
 *  а если нигде не помещается — ограничить высоту и включить прокрутку (с заметной тенью, чтобы было видно, что есть ещё). */
export function fitInView(el: HTMLElement, margin = 8) {
  const st = el.style;
  st.translate = '';
  st.maxHeight = '';
  st.maxWidth = '';
  st.overflowY = '';
  // left/right/top/bottom сбрасываем, только если их поставили мы. У меню в точке нажатия (.menu.ctx, .sel-menu — position: fixed)
  // эти значения задаёт сам экран; если их стереть, меню уедет в левый верхний угол (так было в 1.8.1).
  if (el.dataset.fitPos) {
    st.left = '';
    st.right = '';
    st.top = '';
    st.bottom = '';
    st.transformOrigin = '';
    delete el.dataset.fitPos;
  }
  el.classList.remove('scroll', 'flip-up');
  if (isPhoneSheet(el)) {
    // Шторка снизу: положение задаёт CSS, но если пунктов больше, чем влезает, показываем тени-подсказки «есть ещё».
    el.classList.toggle('scroll', el.scrollHeight > el.clientHeight + 1);
    return;
  }
  // Меню ещё «вырастает» (анимация scale): считаем его настоящий размер и положение без масштаба.
  const vis = el.getBoundingClientRect();
  const w0 = el.offsetWidth || vis.width;
  const k = w0 ? vis.width / w0 : 1;
  const [ox, oy] = getComputedStyle(el).transformOrigin.split(' ').map((v) => parseFloat(v) || 0);
  const left = vis.left - ox * (1 - k);
  const top = vis.top - oy * (1 - k);
  const rect = { left, top, right: left + w0, bottom: top + (el.offsetHeight || vis.height) };
  const parent = getComputedStyle(el).position === 'absolute' ? el.offsetParent : null;
  const pr = parent ? parent.getBoundingClientRect() : null;
  const anchor = pr ? { left: pr.left, top: pr.top, right: pr.right, bottom: pr.bottom } : null;
  const fix = placeMenu({ rect, anchor, bounds: viewBounds(el), margin });
  if (fix.maxWidth != null) st.maxWidth = fix.maxWidth + 'px';
  if (fix.side === 'left') {
    st.left = '0';
    st.right = 'auto';
    el.dataset.fitPos = '1';
  } else if (fix.side === 'right') {
    st.right = '0';
    st.left = 'auto';
    el.dataset.fitPos = '1';
  }
  if (fix.flipUp) {
    el.dataset.fitPos = '1';
    st.top = 'auto';
    st.bottom = 'calc(100% + 6px)';
    st.transformOrigin = fix.side === 'left' ? 'bottom left' : 'bottom right';
    el.classList.add('flip-up');
  }
  if (fix.dx || fix.dy) st.translate = `${fix.dx}px ${fix.dy}px`;
  if (fix.maxHeight != null) {
    st.maxHeight = fix.maxHeight + 'px';
    st.overflowY = 'auto';
    el.classList.add('scroll');
  }
}

/** Следить за всеми меню (.menu), которые появляются на странице, и поставить их внутрь окна; пересчитывать при повороте экрана,
 *  изменении размера окна и появлении экранной клавиатуры. */
export function keepMenusInView(): () => void {
  const fit = (n: Node) => {
    if (!(n instanceof HTMLElement)) return;
    const menus = n.matches('.menu') ? [n] : Array.from(n.querySelectorAll<HTMLElement>('.menu'));
    // Второй раз — когда закончится анимация появления (она немного уменьшает меню).
    for (const m of menus) {
      requestAnimationFrame(() => m.isConnected && fitInView(m));
      setTimeout(() => m.isConnected && fitInView(m), 200);
    }
  };
  const obs = new MutationObserver((list) => {
    for (const rec of list) rec.addedNodes.forEach(fit);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  let raf = 0;
  const refit = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      document.querySelectorAll<HTMLElement>('.menu:not(.closing)').forEach((m) => fitInView(m));
    });
  };
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);
  window.visualViewport?.addEventListener('resize', refit);
  return () => {
    obs.disconnect();
    window.removeEventListener('resize', refit);
    window.removeEventListener('orientationchange', refit);
    window.visualViewport?.removeEventListener('resize', refit);
    if (raf) cancelAnimationFrame(raf);
  };
}

// ---------- Всплывающее сообщение внизу (с кнопкой, например «Вернуть») ----------
type ToastFn = (text: string, action?: { label: string; run: () => void }) => void;
let toastListener: ToastFn | null = null;
export function onToast(fn: ToastFn) {
  toastListener = fn;
  return () => {
    if (toastListener === fn) toastListener = null;
  };
}
export function toast(text: string, action?: { label: string; run: () => void }) {
  toastListener?.(text, action);
}

// ---------- Анимации ----------

export type MotionKind = 'screens' | 'windows' | 'expand' | 'text' | 'review' | 'hover';

/** Включена ли анимация этого вида (настройки «Анимации»). */
export function motionOn(kind?: MotionKind): boolean {
  if (typeof document === 'undefined') return false;
  const d = document.documentElement.dataset;
  if (d.motion === 'off') return false;
  if (kind && d['no' + kind[0].toUpperCase() + kind.slice(1)] !== undefined) return false;
  return true;
}

/** Держит элемент на экране, пока играет анимация исчезновения. */
export function usePresence(open: boolean, ms = 160, kind: MotionKind = 'windows'): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    if (!motionOn(kind)) {
      setMounted(false);
      return;
    }
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, ms);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return { mounted, closing };
}

/** Плавное раскрытие и сворачивание блока по высоте. */
export function Collapse({ open, children, className = '' }: { open: boolean; children: ReactNode; className?: string }) {
  const { mounted } = usePresence(open, 280, 'expand');
  const [settled, setSettled] = useState(open);
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) {
      // сначала вставить свёрнутым, на следующем кадре — раскрыть (тогда высота анимируется)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      const t = setTimeout(() => setSettled(true), motionOn('expand') ? 300 : 0);
      return () => {
        cancelAnimationFrame(r);
        clearTimeout(t);
      };
    }
    setShown(false);
    setSettled(false);
  }, [open]);
  if (!mounted) return null;
  return (
    <div className={'collapse' + (shown ? ' open' : '') + (settled && open ? ' settled' : '') + (className ? ' ' + className : '')} aria-hidden={!open}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
}

/** Текст, который плавно сменяется, когда меняется значение. */
export function AnimText({ value, className = '' }: { value: ReactNode; className?: string }) {
  const key = typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
  return (
    <span key={key} className={'txt-anim' + (className ? ' ' + className : '')}>
      {value}
    </span>
  );
}

/** Число, которое «докручивается» до нового значения. */
export function AnimatedNumber({ value, duration = 600 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (!motionOn('text') || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);
  return <>{shown}</>;
}
