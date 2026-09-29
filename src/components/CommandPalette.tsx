// Быстрый поиск и команды (Ctrl+P): темы, конспекты, карточки, правила, домашка, предметы и команды приложения и модов.
// «>» в начале — только команды.
import { useEffect, useMemo, useRef, useState } from 'react';
import { dueLabel } from '../homework';
import { texPlain } from '../rules';
import { registry, usePlugins } from '../plugins/host';
import { normalizeAnswer } from '../srs';
import { updateSettings, useData } from '../store';
import type { Route } from '../types';
import { Icon, SubjectMark, usePresence } from './ui';

interface Item {
  id: string;
  group: string;
  title: string;
  sub?: string;
  icon: React.ReactNode;
  score: number;
  run: () => void;
}

const plain = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\$\$?([^$]*)\$\$?/g, (_m, f: string) => ' ' + texPlain(f) + ' ')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/==|[*_#>`[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function snippet(text: string, q: string): string {
  const t = plain(text);
  const i = normalizeAnswer(t).indexOf(q);
  if (i < 0) return t.slice(0, 90);
  const from = Math.max(0, i - 35);
  return (from ? '…' : '') + t.slice(from, i + q.length + 55).trim() + '…';
}

export function CommandPalette({ open, onClose, go, onNew }: { open: boolean; onClose: () => void; go: (r: Route) => void; onNew: (o?: { as?: 'folder' }) => void }) {
  const data = useData();
  usePlugins();
  const pres = usePresence(open, 140);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
    }
  }, [open]);

  const items = useMemo(() => {
    if (!open) return [];
    const onlyCmd = q.startsWith('>');
    const nq = normalizeAnswer(q.replace(/^>\s*/, '').trim());
    const out: Item[] = [];
    const f = data.settings.features;
    const done = (fn: () => void) => () => {
      onClose();
      fn();
    };
    const score = (title: string) => {
      if (!nq) return 1;
      const t = normalizeAnswer(title);
      if (t.startsWith(nq)) return 100;
      if (t.includes(nq)) return 60;
      const words = nq.split(' ').filter(Boolean);
      return words.length > 1 && words.every((w) => t.includes(w)) ? 40 : 0;
    };
    // Команды
    const cmds: [string, string, () => void][] = [
      ['Начать повторение на сегодня', 'play', () => go({ name: 'review', run: Date.now() })],
      ['Открыть «Сегодня»', 'home', () => go({ name: 'today' })],
      ...(f.homework ? ([['Записать домашнее задание', 'homework', () => go({ name: 'homework' })], ['Открыть домашку', 'homework', () => go({ name: 'homework' })]] as [string, string, () => void][]) : []),
      ['Новый предмет', 'plus', () => onNew()],
      ['Новая папка предметов', 'folderPlus', () => onNew({ as: 'folder' })],
      ['Статистика', 'chart', () => go({ name: 'stats' })],
      ...(f.awards ? ([['Достижения', 'chart', () => go({ name: 'stats', tab: 'awards' })]] as [string, string, () => void][]) : []),
      ...(f.garden ? ([['Сад знаний', 'chart', () => go({ name: 'stats', tab: 'garden' })]] as [string, string, () => void][]) : []),
      ...(f.map ? ([['Карта знаний', 'map', () => go({ name: 'stats', tab: 'map' })]] as [string, string, () => void][]) : []),
      ['Настройки', 'sliders', () => go({ name: 'settings' })],
      ['Возможности', 'puzzle', () => go({ name: 'features' })],
      ['Справка', 'help', () => go({ name: 'help' })],
      ['Тёмная тема', 'sliders', () => updateSettings({ theme: 'dark' })],
      ['Светлая тема', 'sliders', () => updateSettings({ theme: 'light' })],
      ['Анимации: выключить', 'sliders', () => updateSettings({ motion: 'off' })],
      ['Анимации: включить', 'sliders', () => updateSettings({ motion: 'all' })]
    ];
    for (const [title, icon, run] of cmds) {
      const sc = score(title);
      if (sc) out.push({ id: 'cmd:' + title, group: 'Команды', title, icon: <Icon name={icon} size={16} />, score: sc + (nq ? 5 : 0), run: done(run) });
    }
    for (const c of registry.commands) {
      const sc = score(c.name);
      if (sc) out.push({ id: 'pc:' + c.id, group: 'Команды', title: c.name, sub: 'мод', icon: <span className="pal-emoji">🧩</span>, score: sc + 4, run: done(c.run) });
    }
    for (const v of registry.views) {
      const sc = score(v.title);
      if (sc) out.push({ id: 'pv:' + v.id, group: 'Команды', title: 'Открыть: ' + v.title, sub: 'мод', icon: <span className="pal-emoji">{v.icon}</span>, score: sc + 4, run: done(() => go({ name: 'plugin', id: v.id })) });
    }
    if (onlyCmd) return out.sort((a, b) => b.score - a.score).slice(0, 40);
    if (!nq) return out.slice(0, 12);

    // Папки и предметы
    for (const fo of data.folders) {
      const sc = score(fo.name);
      if (sc) out.push({ id: 'f:' + fo.id, group: 'Предметы', title: fo.name, sub: 'папка', icon: <Icon name="folder" size={16} />, score: sc + 10, run: done(() => go({ name: 'folder', id: fo.id })) });
    }
    for (const s of data.subjects) {
      const sc = score(s.name);
      if (sc) out.push({ id: 's:' + s.id, group: 'Предметы', title: s.name, icon: <SubjectMark color={s.color} icon={s.icon} />, score: sc + 10, run: done(() => go({ name: 'subject', id: s.id })) });
    }
    // Темы и правила (по названию и по тексту конспекта)
    const subj = new Map(data.subjects.map((s) => [s.id, s]));
    for (const t of data.topics) {
      const s = subj.get(t.subjectId);
      const byName = score(t.name);
      const inNote = !byName && nq.length >= 3 && normalizeAnswer(t.note).includes(nq);
      if (!byName && !inNote) continue;
      out.push({
        id: 't:' + t.id,
        group: t.kind === 'rule' ? 'Правила' : t.kind === 'glossary' ? 'Термины' : 'Темы',
        title: t.name,
        sub: inNote ? snippet(t.note, nq) : s?.name,
        icon: s ? <SubjectMark color={s.color} icon={s.icon} /> : <Icon name="book" size={16} />,
        score: byName ? byName + 8 : 20,
        run: done(() => go({ name: 'topic', id: t.id, tab: 'note' }))
      });
    }
    // Карточки
    if (nq.length >= 2) {
      let n = 0;
      for (const c of data.cards) {
        if (n >= 15) break;
        const text = c.front + ' ' + c.back;
        if (!normalizeAnswer(text).includes(nq)) continue;
        n++;
        out.push({ id: 'c:' + c.id, group: 'Карточки', title: plain(c.front).slice(0, 90), sub: plain(c.back).slice(0, 90), icon: <Icon name="cardPlus" size={16} />, score: 15, run: done(() => go({ name: 'topic', id: c.topicId, tab: c.listId ? 'list:' + c.listId : 'cards' })) });
      }
    }
    // Домашка
    for (const h of data.homework) {
      if (h.done || !normalizeAnswer(h.text).includes(nq)) continue;
      out.push({ id: 'h:' + h.id, group: 'Домашка', title: h.text.slice(0, 90), sub: dueLabel(h.due), icon: <Icon name="homework" size={16} />, score: 18, run: done(() => go({ name: 'homework' })) });
    }
    const order = ['Команды', 'Предметы', 'Темы', 'Правила', 'Домашка', 'Карточки'];
    return out.sort((a, b) => b.score - a.score || order.indexOf(a.group) - order.indexOf(b.group)).slice(0, 50);
  }, [open, q, data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listRef.current?.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!pres.mounted) return null;
  return (
    <div className={'pal-back' + (pres.closing ? ' closing' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Поиск и команды">
        <div className="pal-input">
          <Icon name="search" size={18} />
          <input
            autoFocus
            placeholder="Найти тему, карточку, правило, домашку… или «>» для команд"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(items.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                items[sel]?.run();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" ref={listRef}>
          {items.length === 0 && <div className="pal-empty">Ничего не нашлось. Попробуй другое слово.</div>}
          {items.map((it, i) => (
            <div key={it.id}>
              {(i === 0 || items[i - 1].group !== it.group) && <div className="pal-group">{it.group}</div>}
              <button className={'pal-item' + (i === sel ? ' on' : '')} onMouseEnter={() => setSel(i)} onClick={it.run}>
                <span className="pal-ico">{it.icon}</span>
                <span className="grow stack gap2 pal-texts">
                  <span className="clamp1">{it.title}</span>
                  {it.sub && <span className="small muted clamp1">{it.sub}</span>}
                </span>
                {i === sel && <kbd>Enter</kbd>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
