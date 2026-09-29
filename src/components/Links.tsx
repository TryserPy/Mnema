// Ссылки в конспекте: окно выбора (тема, правило, термин), подсказка при наведении, меню по правой кнопке.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { linkOptions, resolveLink, routeFor, type LinkOption } from '../links';
import { rulePreview } from '../rules';
import { getData, useData } from '../store';
import type { Route } from '../types';
import { Markdown } from './Markdown';
import { Icon, Modal, usePresence, touchUI } from './ui';

const KIND: Record<LinkOption['kind'], { label: string; icon: string }> = {
  term: { label: 'Термины и словари', icon: 'list' },
  topic: { label: 'Темы', icon: 'book' },
  rule: { label: 'Правила', icon: 'rules' },
  card: { label: 'Карточки', icon: 'cardPlus' }
};
const ORDER: LinkOption['kind'][] = ['term', 'topic', 'rule', 'card'];

/** Окно «Ссылка на…»: ищет по выделенному слову среди тем, правил, терминов и карточек. */
export function LinkPicker({ text, currentTopicId, hasLink, onPick, onClose }: { text: string; currentTopicId?: string; hasLink?: boolean; onPick: (href: string | null) => void; onClose: () => void }) {
  const data = useData();
  const [q, setQ] = useState(text.replace(/\s+/g, ' ').trim().slice(0, 60));
  const [kind, setKind] = useState<LinkOption['kind'] | 'all'>('all');
  const [sel, setSel] = useState(0);
  const all = useMemo(() => linkOptions(data, q, currentTopicId, 60), [data, q, currentTopicId]);
  const shown = (kind === 'all' ? all : all.filter((o) => o.kind === kind)).slice(0, 30);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => setSel(0), [q, kind]);
  useEffect(() => {
    listRef.current?.querySelector('.lp-item.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);
  const counts = ORDER.map((k) => [k, all.filter((o) => o.kind === k).length] as const).filter(([, n]) => n > 0);
  return (
    <Modal title="Ссылка на…" onClose={onClose} width={560}>
      <div className="stack gap12">
        <label className="search-field">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={q}
            placeholder="Термин, тема или правило"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(shown.length - 1, s + 1)));
              else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
              else if (e.key === 'Enter' && shown[sel]) (e.preventDefault(), onPick(shown[sel].href));
            }}
          />
        </label>
        {counts.length > 1 && (
          <div className="hw-filter">
            <button className={'hw-fchip' + (kind === 'all' ? ' on' : '')} onClick={() => setKind('all')}>
              Всё
            </button>
            {counts.map(([k, n]) => (
              <button key={k} className={'hw-fchip' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>
                {KIND[k].label} · {n}
              </button>
            ))}
          </div>
        )}
        <div className="lp-list" ref={listRef}>
          {shown.length === 0 && <div className="empty-soft">Ничего не нашлось. Попробуй начало слова.</div>}
          {shown.map((o, i) => (
            <button key={o.href} className={'lp-item' + (i === sel ? ' on' : '')} onMouseEnter={() => setSel(i)} onClick={() => onPick(o.href)}>
              <span className="lp-ico">
                <Icon name={KIND[o.kind].icon} size={16} />
              </span>
              <span className="grow stack gap2 lp-texts">
                <strong className="clamp1">{o.title}</strong>
                <span className="small muted clamp1">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="row between gap8">
          {hasLink ? (
            <button className="btn ghost small danger-text" onClick={() => onPick(null)}>
              Убрать ссылку
            </button>
          ) : (
            <span className="small muted">{touchUI() ? 'Нажми на ссылку в конспекте — появится кнопка «Открыть»' : 'Ctrl+щелчок по ссылке в конспекте — перейти к ней'}</span>
          )}
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Подсказка при наведении на ссылку: что за тема / термин и кнопка «Открыть». */
function LinkTip({ href, anchor, go, onEnter, onLeave }: { href: string; anchor: DOMRect; go: (r: Route) => void; onEnter: () => void; onLeave: () => void }) {
  const data = useData();
  const t = resolveLink(data, href);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 8 });
  useEffect(() => {
    const h = ref.current?.offsetHeight ?? 160;
    const w = Math.min(360, window.innerWidth - 24);
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - w - 12));
    const up = anchor.bottom + 8 + h > window.innerHeight - 12 && anchor.top - 8 - h > 12;
    setPos({ left, top: up ? anchor.top - 8 - h : anchor.bottom + 8 });
  }, [anchor]);
  let body: ReactNode;
  if (!t) body = <span className="muted small">То, на что вела ссылка, удалено.</span>;
  else if (t.kind === 'topic')
    body = (
      <>
        <div className="rule-tip-head">
          <Icon name={t.topic.kind === 'rule' ? 'rules' : 'book'} size={15} />
          <strong className="grow">{t.topic.name}</strong>
        </div>
        <div className="small muted">{data.subjects.find((s) => s.id === t.topic.subjectId)?.name}{t.topic.kind === 'rule' ? ' · правило' : ''}</div>
        {t.topic.note.trim() && <div className="rule-tip-body small">{rulePreview(t.topic.note, 260)}</div>}
      </>
    );
  else {
    const list = t.card.listId ? t.topic?.lists?.find((l) => l.id === t.card.listId) : undefined;
    body = (
      <>
        <div className="rule-tip-head">
          <Icon name="list" size={15} />
          <strong className="grow">
            <Markdown text={t.card.front} />
          </strong>
        </div>
        {t.card.back.trim() ? <div className="rule-tip-body"><Markdown text={t.card.back} /></div> : <span className="small muted">Без определения</span>}
        {t.card.why && <div className="small muted">{t.card.why}</div>}
        <div className="small muted">{[list?.title, t.topic?.name].filter(Boolean).join(' · ')}</div>
      </>
    );
  }
  return (
    <div ref={ref} className="rule-tip link-tip" style={{ left: pos.left, top: pos.top }} onMouseEnter={onEnter} onMouseLeave={onLeave} role="tooltip">
      {body}
      {t && (
        <button className="link-btn small" onClick={() => go(routeFor(t))}>
          Открыть →
        </button>
      )}
    </div>
  );
}

export function useLinkTips(go: (r: Route) => void): { onLinkHover: (href: string | null, el: HTMLElement | null) => void; tip: ReactNode } {
  const [tip, setTip] = useState<{ href: string; rect: DOMRect } | null>(null);
  const showT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pres = usePresence(Boolean(tip), 140);
  const last = useRef<{ href: string; rect: DOMRect } | null>(null);
  if (tip) last.current = tip;
  const onLinkHover = useCallback((href: string | null, el: HTMLElement | null) => {
    clearTimeout(showT.current);
    clearTimeout(hideT.current);
    if (href && el) showT.current = setTimeout(() => setTip({ href, rect: el.getBoundingClientRect() }), 250);
    else hideT.current = setTimeout(() => setTip(null), 260);
  }, []);
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [tip]);
  const cur = tip ?? last.current;
  return {
    onLinkHover,
    tip:
      pres.mounted && cur ? (
        <div className={'rule-tip-wrap' + (pres.closing ? ' closing' : '')}>
          <LinkTip
            key={cur.href + cur.rect.top}
            href={cur.href}
            anchor={cur.rect}
            go={(r) => {
              setTip(null);
              go(r);
            }}
            onEnter={() => clearTimeout(hideT.current)}
            onLeave={() => onLinkHover(null, null)}
          />
        </div>
      ) : null
  };
}

/** Перейти по ссылке Мнемы откуда угодно (конспект, ответ карточки, правило). */
export function openMnemaLink(href: string) {
  window.dispatchEvent(new CustomEvent('mnema:open-link', { detail: href }));
}

export function linkRoute(href: string): Route | null {
  const t = resolveLink(getData(), href);
  return t ? routeFor(t) : null;
}

/** Меню по правой кнопке на выделенном тексте. */
export function SelectionMenu({ x, y, items, onClose }: { x: number; y: number; items: { label: string; icon: string; run: () => void; hidden?: boolean }[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    const el = ref.current;
    if (el) setPos({ left: Math.min(x, window.innerWidth - el.offsetWidth - 8), top: Math.min(y, window.innerHeight - el.offsetHeight - 8) });
    const close = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('keydown', esc);
    };
  }, [x, y, onClose]);
  return createPortal(
    <div ref={ref} className="menu sel-menu" role="menu" style={{ left: pos.left, top: pos.top }}>
      {items
        .filter((i) => !i.hidden)
        .map((i) => (
          <button
            key={i.label}
            role="menuitem"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClose();
              i.run();
            }}
          >
            <Icon name={i.icon} size={16} /> {i.label}
          </button>
        ))}
    </div>,
    document.body
  );
}
