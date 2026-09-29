// Правила предмета: общие правила (грамматика, орфография, законы), к которым возвращаешься из любой темы.
// Правило можно сделать из выделения в конспекте, а его слова-подсказки подчёркиваются во всех конспектах
// предмета: навёл — и правило перед глазами.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { rulePreview, ruleWordsOf } from '../rules';
import { normalizeAnswer, todayCounts } from '../srs';
import { addTopic, getData, subjectRules, updateTopic, useData } from '../store';
import type { Route, Topic } from '../types';
import { Markdown } from './Markdown';
import { deleteTopicWithUndo } from './SubjectDialogs';
import { ConfirmButton, Icon, Modal, plural, toast, usePresence } from './ui';

/* ---------- Слова-подсказки ---------- */

export function RuleWordsEditor({ words, onChange, placeholder = 'Добавить слово' }: { words: string[]; onChange: (w: string[]) => void; placeholder?: string }) {
  const [v, setV] = useState('');
  const add = () => {
    const w = v.trim().replace(/[,;]+$/, '');
    if (w && !words.some((x) => x.toLowerCase() === w.toLowerCase())) onChange([...words, w.slice(0, 40)]);
    setV('');
  };
  return (
    <div className="rw-box">
      {words.map((w) => (
        <span key={w} className="rw-chip">
          {w}
          <button type="button" aria-label={`Убрать «${w}»`} onClick={() => onChange(words.filter((x) => x !== w))}>
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      <input
        className="rw-input"
        value={v}
        placeholder={words.length ? '+ ещё' : placeholder}
        aria-label="Слово-подсказка"
        onChange={(e) => (e.target.value.endsWith(',') ? (setV(e.target.value.slice(0, -1)), setTimeout(add)) : setV(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !v && words.length) onChange(words.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

/* ---------- Создать или изменить правило ---------- */

export function RuleDialog({ subjectId, rule, initial, onClose, onSaved }: { subjectId: string; rule?: Topic; initial?: { name?: string; text?: string; words?: string[] }; onClose: () => void; onSaved?: (t: Topic) => void }) {
  const data = useData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  const [name, setName] = useState(rule?.name ?? initial?.name ?? '');
  const [text, setText] = useState(rule?.note ?? initial?.text ?? '');
  const [words, setWords] = useState<string[]>(rule ? ruleWordsOf(rule) : (initial?.words ?? []));
  const rich = Boolean(rule && /!\[|\$\$|<svg/.test(rule.note));
  return (
    <Modal title={rule ? 'Правило' : 'Новое правило'} onClose={onClose} width={560}>
      <form
        className="stack gap16"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          let t = rule;
          if (!t) t = addTopic(subjectId, name.trim(), undefined, 'rule');
          updateTopic(t.id, { name: name.trim(), ruleWords: words, ...(rich ? {} : { note: text }) });
          const fresh = getData().topics.find((x) => x.id === t!.id)!;
          if (!rule) toast(`Правило «${fresh.name}» добавлено`);
          onSaved?.(fresh);
          onClose();
        }}
      >
        <label className="field">
          <span>Название</span>
          <input className="input" autoFocus={!name} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Н и НН в причастиях" />
        </label>
        {rich ? (
          <div className="field">
            <span>Текст</span>
            <div className="rule-rich-note small muted">В правиле есть формулы или рисунки — текст меняется кнопкой «Формулы и рисунки».</div>
          </div>
        ) : (
          <label className="field">
            <span>Суть правила</span>
            <textarea className="input rule-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Коротко, своими словами. Например:\nНН — если есть приставка, зависимое слово или суффикс -ова-/-ева-.'} />
          </label>
        )}
        <div className="field">
          <span>Слова-подсказки</span>
          <RuleWordsEditor words={words} onChange={setWords} placeholder="причастие, суффикс…" />
          <span className="small muted">Где в конспектах {subject ? `по предмету «${subject.name}»` : 'предмета'} встретятся эти слова (в любой форме), они будут подчёркнуты, и при наведении появится правило.</span>
        </div>
        <div className="row end gap8">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" type="submit" disabled={!name.trim()}>
            {rule ? 'Сохранить' : 'Создать правило'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Из выделения в конспекте: новое правило или слово к существующему. */
export function AddToRule({ subjectId, text, onClose }: { subjectId: string; text: string; onClose: () => void }) {
  const data = useData();
  const rules = subjectRules(data, subjectId);
  const clean = text.replace(/\s+/g, ' ').trim();
  const short = clean.length <= 40 && clean.split(' ').length <= 4;
  const [creating, setCreating] = useState(rules.length === 0 || !short);
  if (creating)
    return <RuleDialog subjectId={subjectId} initial={short ? { name: clean[0].toUpperCase() + clean.slice(1), words: [clean.toLowerCase()] } : { text: clean }} onClose={onClose} />;
  return (
    <Modal title="В правило" onClose={onClose} width={480}>
      <div className="stack gap12">
        <button className="rule-pick new" onClick={() => setCreating(true)}>
          <span className="rule-pick-ico">
            <Icon name="plus" size={18} />
          </span>
          <span className="grow stack gap2">
            <strong>Новое правило «{clean}»</strong>
            <span className="small muted">Слово станет подсказкой в конспектах</span>
          </span>
        </button>
        <span className="sgroup-title">или привязать слово к правилу</span>
        <div className="rule-pick-list">
          {rules.map((r) => {
            const has = ruleWordsOf(r).some((w) => w.toLowerCase() === clean.toLowerCase());
            return (
              <button
                key={r.id}
                className="rule-pick"
                disabled={has}
                onClick={() => {
                  updateTopic(r.id, { ruleWords: [...ruleWordsOf(r), clean.toLowerCase()] });
                  toast(`«${clean}» теперь подсказывает правило «${r.name}»`);
                  onClose();
                }}
              >
                <span className="rule-pick-ico">
                  <Icon name="rules" size={17} />
                </span>
                <span className="grow stack gap2">
                  <strong className="clamp1">{r.name}</strong>
                  <span className="small muted clamp1">{has ? 'Это слово уже здесь' : ruleWordsOf(r).join(', ') || 'Пока без слов-подсказок'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Просмотр правила ---------- */

export function RuleView({ rule, onClose, go }: { rule: Topic; onClose: () => void; go: (r: Route) => void }) {
  const data = useData();
  const r = data.topics.find((t) => t.id === rule.id) ?? rule;
  const [edit, setEdit] = useState(false);
  const cards = data.cards.filter((c) => c.topicId === r.id).length;
  const c = todayCounts(data, new Date(), { topicId: r.id });
  const due = c.review + c.learning;
  const rich = /!\[|\$\$|<svg/.test(r.note);
  if (edit) return <RuleDialog subjectId={r.subjectId} rule={r} onClose={() => setEdit(false)} />;
  return (
    <Modal title={r.name} onClose={onClose} width={620}>
      <div className="stack gap16">
        <div className="rule-view-body">{r.note.trim() ? <Markdown text={r.note} /> : <p className="muted">Правило пока пустое.</p>}</div>
        <div className="field">
          <span>Слова-подсказки</span>
          <RuleWordsEditor words={ruleWordsOf(r)} onChange={(w) => updateTopic(r.id, { ruleWords: w })} />
        </div>
        <div className="row gap8 wrap">
          <button className="btn" onClick={() => setEdit(true)}>
            <Icon name="edit" size={16} /> Изменить
          </button>
          {rich && (
            <button
              className="btn"
              onClick={() => {
                onClose();
                go({ name: 'topic', id: r.id, tab: 'note', page: true });
              }}
              title="В правиле есть формулы или рисунки — их можно поменять на странице правила"
            >
              <Icon name="book" size={16} /> Формулы и рисунки
            </button>
          )}
          {cards > 0 && (
            <button
              className="btn"
              onClick={() => {
                onClose();
                go({ name: 'review', topicId: r.id, cram: due === 0 });
              }}
            >
              <Icon name="play" size={16} /> Учить · {cards}
            </button>
          )}
          <span className="grow" />
          <ConfirmButton
            onConfirm={() => {
              onClose();
              deleteTopicWithUndo(r.id);
            }}
          >
            <Icon name="trash" size={16} /> Удалить
          </ConfirmButton>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Вкладка «Правила» предмета ---------- */

function RuleCard({ r, onOpen, i }: { r: Topic; onOpen: () => void; i: number }) {
  const data = useData();
  const words = ruleWordsOf(r);
  const cards = data.cards.filter((c) => c.topicId === r.id).length;
  const prev = rulePreview(r.note, 150);
  return (
    <button className="rule-card" onClick={onOpen} style={{ animationDelay: Math.min(i, 12) * 25 + 'ms' }}>
      <strong className="rule-card-title">{r.name}</strong>
      <span className={'rule-card-text' + (prev ? '' : ' muted')}>{prev || 'Пусто — нажми, чтобы дописать'}</span>
      {(words.length > 0 || cards > 0) && (
        <span className="rule-card-foot">
          {words.slice(0, 3).map((w) => (
            <span key={w} className="rw-chip small">
              {w}
            </span>
          ))}
          {words.length > 3 && <span className="small muted">+{words.length - 3}</span>}
          <span className="grow" />
          {cards > 0 && (
            <span className="small muted">
              {cards} {plural(cards, 'карточка', 'карточки', 'карточек')}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

export function RulesList({ subjectId, go }: { subjectId: string; go: (r: Route) => void }) {
  const data = useData();
  const rules = subjectRules(data, subjectId);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Topic | null>(null);
  const [query, setQuery] = useState('');
  const q = normalizeAnswer(query);
  const shown = q ? rules.filter((r) => normalizeAnswer(r.name + ' ' + r.note + ' ' + ruleWordsOf(r).join(' ')).includes(q)) : rules;
  return (
    <div className="stack gap12 tab-pane">
      {rules.length === 0 ? (
        <div className="empty">
          <strong>Правил пока нет</strong>
          <span>Сюда — правила, к которым возвращаешься: грамматика, законы, алгоритмы решения. Выдели слово в конспекте, нажми правую кнопку мыши → «Правило» — при наведении на это слово правило будет всплывать само.</span>
          <button className="btn primary" onClick={() => setAdding(true)}>
            Добавить первое правило
          </button>
        </div>
      ) : (
        <>
          <div className="row gap8">
            {rules.length > 5 && (
              <label className="search-field grow">
                <Icon name="search" size={16} />
                <input placeholder="Найти правило" aria-label="Найти правило" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            )}
          </div>
          <div className="rule-grid">
            <button className="rule-card add" onClick={() => setAdding(true)}>
              <Icon name="plus" size={20} />
              <strong>Новое правило</strong>
            </button>
            {shown.map((r, i) => (
              <RuleCard key={r.id} r={r} i={i} onOpen={() => setOpen(r)} />
            ))}
          </div>
          {q && shown.length === 0 && <div className="empty-soft">Ничего не нашлось</div>}
        </>
      )}
      {adding && <RuleDialog subjectId={subjectId} onClose={() => setAdding(false)} />}
      {open && <RuleView rule={open} onClose={() => setOpen(null)} go={go} />}
    </div>
  );
}

/* ---------- Панель правил рядом с конспектом ---------- */

export function RulesDrawer({ subjectId, go, onClose }: { subjectId: string; go: (r: Route) => void; onClose: () => void }) {
  const data = useData();
  const rules = subjectRules(data, subjectId);
  const [open, setOpen] = useState<string | null>(rules.length === 1 ? rules[0].id : null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !adding && close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });
  const q = normalizeAnswer(query);
  const shown = q ? rules.filter((r) => normalizeAnswer(r.name + ' ' + r.note + ' ' + ruleWordsOf(r).join(' ')).includes(q)) : rules;
  const subject = data.subjects.find((s) => s.id === subjectId);
  return (
    <div className={'rules-drawer-back' + (closing ? ' closing' : '')} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <aside className="rules-drawer" role="dialog" aria-label="Правила предмета">
        <div className="row between gap8">
          <div className="stack gap2">
            <h2>Правила</h2>
            <span className="small muted">{subject?.name}</span>
          </div>
          <button className="icon-btn" aria-label="Закрыть" onClick={close}>
            <Icon name="x" />
          </button>
        </div>
        {rules.length > 4 && (
          <label className="search-field">
            <Icon name="search" size={16} />
            <input placeholder="Найти правило" aria-label="Найти правило" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </label>
        )}
        <div className="drawer-rules">
          {shown.map((r) => {
            const isOpen = open === r.id || Boolean(q);
            return (
              <div key={r.id} className={'drawer-rule' + (isOpen ? ' open' : '')}>
                <button className="drawer-rule-head" aria-expanded={isOpen} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <strong className="grow">{r.name}</strong>
                  <Icon name="chevron" size={14} />
                </button>
                {isOpen && (
                  <div className="drawer-rule-body">
                    {r.note.trim() ? <Markdown text={r.note} /> : <p className="muted small">Пусто.</p>}
                    <button className="link-btn small" onClick={() => go({ name: 'topic', id: r.id, tab: 'note' })}>
                      Изменить правило →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="row gap8 wrap">
          <button className="btn small" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> Правило
          </button>
          <button className="btn ghost small" onClick={() => go({ name: 'subject', id: subjectId, view: 'rules' })}>
            Все правила
          </button>
        </div>
      </aside>
      {adding && <RuleDialog subjectId={subjectId} onClose={() => setAdding(false)} />}
    </div>
  );
}

/* ---------- Подсказка при наведении на слово в конспекте ---------- */

function RuleTip({ id, anchor, go, onEnter, onLeave }: { id: string; anchor: DOMRect; go: (r: Route) => void; onEnter: () => void; onLeave: () => void }) {
  const data = useData();
  const r = data.topics.find((t) => t.id === id);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean }>({ left: anchor.left, top: anchor.bottom + 8, up: false });
  useEffect(() => {
    const h = ref.current?.offsetHeight ?? 200;
    const w = Math.min(360, window.innerWidth - 24);
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - w - 12));
    const up = anchor.bottom + 8 + h > window.innerHeight - 12 && anchor.top - 8 - h > 12;
    setPos({ left, top: up ? anchor.top - 8 - h : anchor.bottom + 8, up });
  }, [anchor]);
  if (!r) return null;
  return (
    <div ref={ref} className={'rule-tip' + (pos.up ? ' up' : '')} style={{ left: pos.left, top: pos.top }} onMouseEnter={onEnter} onMouseLeave={onLeave} role="tooltip">
      <div className="rule-tip-head">
        <Icon name="rules" size={15} />
        <strong className="grow">{r.name}</strong>
      </div>
      <div className="rule-tip-body">{r.note.trim() ? <Markdown text={r.note} /> : <span className="muted small">Правило пока пустое.</span>}</div>
      <button className="link-btn small" onClick={() => go({ name: 'topic', id: r.id, tab: 'note' })}>
        Изменить правило →
      </button>
    </div>
  );
}

/** Подсказки правил в конспекте: наведение (или нажатие на телефоне) на подчёркнутое слово. */
export function useRuleTips(go: (r: Route) => void): { onRuleHover: (id: string | null, el: HTMLElement | null) => void; tip: ReactNode } {
  const [tip, setTip] = useState<{ id: string; rect: DOMRect } | null>(null);
  const showT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pres = usePresence(Boolean(tip), 140);
  const last = useRef<{ id: string; rect: DOMRect } | null>(null);
  if (tip) last.current = tip;
  const onRuleHover = useCallback((id: string | null, el: HTMLElement | null) => {
    clearTimeout(showT.current);
    clearTimeout(hideT.current);
    if (id && el) showT.current = setTimeout(() => setTip({ id, rect: el.getBoundingClientRect() }), 220);
    else hideT.current = setTimeout(() => setTip(null), 260);
  }, []);
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', esc);
    };
  }, [tip]);
  useEffect(() => () => (clearTimeout(showT.current), clearTimeout(hideT.current)), []);
  const cur = tip ?? last.current;
  return {
    onRuleHover,
    tip:
      pres.mounted && cur ? (
        <div className={'rule-tip-wrap' + (pres.closing ? ' closing' : '')}>
          <RuleTip
            key={cur.id + cur.rect.top}
            id={cur.id}
            anchor={cur.rect}
            go={(r) => {
              setTip(null);
              go(r);
            }}
            onEnter={() => clearTimeout(hideT.current)}
            onLeave={() => onRuleHover(null, null)}
          />
        </div>
      ) : null
  };
}
