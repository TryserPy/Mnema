// «Повторить ещё раз»: одно окно для темы (вместе с подтемами), предмета, папки и «Сегодня». Выбираешь, что повторять и сколько,
// а при желании — из каких именно тем (можно из разных предметов и папок), — и Мнема запускает повторение, которое не трогает
// расписание. Окно живёт один раз, в App; открыть его можно из любого места.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { defaultRepeatKind, REPEAT_KINDS, REPEAT_TEXT, repeatCounts, repeatTopicTree, type RepeatScope, type RepeatSubject } from '../repeat';
import { topicWithDescendants, useData } from '../store';
import type { AppData, RepeatKind, Route } from '../types';
import { Icon, Modal, plural, Segmented } from './ui';
import '../session.css';

/** Откуда запущено «Повторить ещё раз». Пусто — по всем предметам. */
export interface RepeatAt {
  topicId?: string;
  subjectId?: string;
  folderId?: string;
}

type ReviewRoute = Extract<Route, { name: 'review' }>;

/** Область карточек, куда вернуться потом, как назвать это в окне и какие темы выбраны сначала. */
export function resolveRepeat(data: AppData, at: RepeatAt): { scope: RepeatScope; route: Partial<ReviewRoute>; title: string; sub: string; topicIds: string[] } {
  const topic = at.topicId ? data.topics.find((t) => t.id === at.topicId) : undefined;
  if (topic) {
    const ids = topicWithDescendants(data, topic.id);
    const subs = ids.size - 1;
    return { scope: { topicId: topic.id }, route: { topicId: topic.id }, title: `Тема «${topic.name}»`, sub: subs ? `вместе с ${subs} ${plural(subs, 'подтемой', 'подтемами', 'подтемами')}` : '', topicIds: [...ids] };
  }
  const subject = at.subjectId ? data.subjects.find((s) => s.id === at.subjectId) : undefined;
  if (subject)
    return { scope: { subjectId: subject.id }, route: { subjectId: subject.id }, title: `Предмет «${subject.name}»`, sub: 'все его темы и подтемы', topicIds: data.topics.filter((t) => t.subjectId === subject.id).map((t) => t.id) };
  const folder = at.folderId ? data.folders.find((f) => f.id === at.folderId) : undefined;
  if (folder) {
    const ids = data.subjects.filter((s) => s.folderId === folder.id).map((s) => s.id);
    const inFolder = new Set(ids);
    return {
      scope: { subjectIds: ids },
      route: { subjectIds: ids, folderId: folder.id },
      title: `Папка «${folder.name}»`,
      sub: `${ids.length} ${plural(ids.length, 'предмет', 'предмета', 'предметов')}`,
      topicIds: data.topics.filter((t) => inFolder.has(t.subjectId)).map((t) => t.id)
    };
  }
  return { scope: {}, route: {}, title: 'Все предметы', sub: '', topicIds: data.topics.map((t) => t.id) };
}

const SIZES = [10, 20, 50];

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** Галочка «все / часть / ничего»: у предмета и папки показывает, что выбрана только часть тем. */
function Check({ state, label, onChange }: { state: 0 | 1 | 2; label: string; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 1;
  }, [state]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={state === 2} onChange={(e) => onChange(e.target.checked)} />;
}

export function RepeatDialog({ at, go, onClose }: { at: RepeatAt; go: (r: Route) => void; onClose: () => void }) {
  const data = useData();
  const info = useMemo(() => resolveRepeat(data, at), [data, at]);
  const tree = useMemo(() => repeatTopicTree(data), [data.cards, data.topics, data.subjects, data.folders]); // eslint-disable-line react-hooks/exhaustive-deps
  // Темы, которые вообще можно выбрать (где есть карточки): из них и состоит выбор.
  const shown = useMemo(() => new Set(tree.flatMap((g) => g.subjects.flatMap((s) => s.rows.map((r) => r.t.id)))), [tree]);
  const own = useMemo(() => new Map(tree.flatMap((g) => g.subjects.flatMap((s) => s.rows.map((r) => [r.t.id, r.own] as const)))), [tree]);
  const origin = useMemo(() => new Set(info.topicIds.filter((id) => shown.has(id))), [info, shown]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(origin));
  const [listOpen, setListOpen] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(() => new Set()); // свёрнутые предметы в списке
  const custom = !sameSet(picked, origin);
  const counts = useMemo(() => repeatCounts(data, new Date(), custom ? { topicIds: [...picked] } : info.scope), [data, picked, custom, info]);
  const [kind, setKind] = useState<RepeatKind>(() => defaultRepeatKind(counts));
  const [size, setSize] = useState(0); // 0 — все
  // Если неначатых карточек нет, «Все карточки» — то же самое, что «Все начатые»: второй строки не нужно.
  const kinds = REPEAT_KINDS.filter((k) => !(k === 'all' && counts.all === counts.started));
  const count = counts[kind];
  const sizes = SIZES.filter((n) => n < count);
  const take = sizes.includes(size) ? size : count;
  const withCards = [...picked].filter((id) => (own.get(id) ?? 0) > 0).length;

  // Выбранный набор опустел после смены тем (например, сегодня в них ничего не повторяли) — берём первый, где что-то есть.
  useEffect(() => {
    if (counts[kind] === 0 && counts.all > 0) setKind(defaultRepeatKind(counts));
  }, [counts, kind]);

  const toggle = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  const stateOf = (ids: string[]): 0 | 1 | 2 => {
    const k = ids.filter((id) => picked.has(id)).length;
    return k === 0 ? 0 : k === ids.length ? 2 : 1;
  };
  // Тема тянет за собой подтемы: отметил параграф — отметились и его подтемы; потом любую можно снять.
  const withKids = (id: string) => [...topicWithDescendants(data, id)].filter((x) => shown.has(x));
  const idsOf = (s: RepeatSubject) => s.rows.map((r) => r.t.id);

  function start() {
    if (!count) return;
    onClose();
    go({ name: 'review', ...info.route, ...(custom ? { topicIds: [...picked] } : {}), cram: true, only: kind, limit: take < count ? take : undefined, run: Date.now() });
  }

  const title = custom ? 'Выбранные темы' : info.title;
  const sub = custom ? `${withCards} ${plural(withCards, 'тема', 'темы', 'тем')}` : info.sub;
  const nothing = counts.all === 0;
  const noPick = picked.size === 0 && shown.size > 0;

  return (
    <Modal title="Повторить ещё раз" onClose={onClose} width={520}>
      <div className="stack gap12">
        <div className="row between gap8">
          <div className="stack gap2 grow rp-where">
            <strong>{title}</strong>
            {sub && <span className="small muted">{sub}</span>}
          </div>
          {tree.length > 0 && (
            <button type="button" className="btn small" aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)} title="Выбрать темы, из которых повторять, — можно из разных предметов">
              <Icon name="list" size={16} /> {listOpen ? 'Свернуть' : 'Выбрать темы'}
            </button>
          )}
        </div>

        {listOpen && (
          <div className="stack gap6">
            <div className="row gap6 wrap">
              <button type="button" className="btn small ghost" onClick={() => setPicked(new Set(shown))}>
                Все темы
              </button>
              <button type="button" className="btn small ghost" onClick={() => setPicked(new Set())}>
                Снять все
              </button>
              {custom && (
                <button type="button" className="btn small ghost" onClick={() => setPicked(new Set(origin))}>
                  Как было
                </button>
              )}
            </div>
            <div className="rp-tree" role="group" aria-label="Темы">
              {tree.map((g, gi) => (
                <div key={g.folder?.id ?? 'loose' + gi} className="rp-group">
                  {g.folder && (
                    <label className="rp-pick rp-folder">
                      <Check state={stateOf(g.subjects.flatMap(idsOf))} label={`Папка «${g.folder.name}»`} onChange={(on) => toggle(g.subjects.flatMap(idsOf), on)} />
                      <Icon name="folder" size={16} />
                      <strong className="clamp1">{g.folder.name}</strong>
                    </label>
                  )}
                  {g.subjects.map((s) => {
                    const ids = idsOf(s);
                    const open = !closed.has(s.subject.id);
                    return (
                      <div key={s.subject.id} className="rp-subject" style={{ paddingLeft: g.folder ? 14 : 0 }}>
                        <div className="rp-pick rp-subj">
                          <button
                            type="button"
                            className={'twisty' + (open ? ' open' : '')}
                            aria-label={open ? `Свернуть «${s.subject.name}»` : `Развернуть «${s.subject.name}»`}
                            aria-expanded={open}
                            onClick={() =>
                              setClosed((c) => {
                                const n = new Set(c);
                                if (open) n.add(s.subject.id);
                                else n.delete(s.subject.id);
                                return n;
                              })
                            }
                          >
                            <Icon name="chevron" size={14} />
                          </button>
                          <label className="rp-label">
                            <Check state={stateOf(ids)} label={`Предмет «${s.subject.name}»`} onChange={(on) => toggle(ids, on)} />
                            <span className="dot" style={{ background: s.subject.color }} />
                            <strong className="clamp1">{s.subject.name}</strong>
                          </label>
                        </div>
                        {open &&
                          s.rows.map((r) => (
                            <label key={r.t.id} className="rp-pick rp-topic" style={{ paddingLeft: 28 + r.depth * 18 }}>
                              <input type="checkbox" aria-label={r.t.name} checked={picked.has(r.t.id)} onChange={(e) => toggle(withKids(r.t.id), e.target.checked)} />
                              <span className="clamp1 grow">
                                {r.depth > 0 && <span className="sub-mark">↳ </span>}
                                {r.t.name}
                                {r.tag && <span className="muted small"> · {r.tag}</span>}
                              </span>
                              <span className="small muted">{r.own}</span>
                            </label>
                          ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <span className="small muted">Отметил тему — отметятся и её подтемы; любую можно снять.</span>
          </div>
        )}

        {nothing ? (
          <div className="empty">
            <strong>{noPick ? 'Темы не выбраны' : 'Здесь пока нет карточек'}</strong>
            <span>{noPick ? 'Нажми «Выбрать темы» и отметь, из каких повторять.' : 'Добавь карточки — и их можно будет повторять когда угодно.'}</span>
          </div>
        ) : (
          <>
            <div className="rp-opts" role="radiogroup" aria-label="Что повторять">
              {kinds.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={counts[k] === 0} className="rp-opt" onClick={() => setKind(k)}>
                  <span className="rp-dot" aria-hidden />
                  <span className="rp-text">
                    <strong>{REPEAT_TEXT[k].title}</strong>
                    <span className="small muted">{counts[k] === 0 ? EMPTY_HINT[k] : REPEAT_TEXT[k].hint}</span>
                  </span>
                  <span className="rp-n">{counts[k]}</span>
                </button>
              ))}
            </div>

            {sizes.length > 0 && (
              <div className="stack gap6">
                <span className="small muted">Сколько</span>
                <Segmented<number>
                  ariaLabel="Сколько карточек"
                  value={sizes.includes(size) ? size : 0}
                  onChange={setSize}
                  options={[...sizes.map((n) => ({ value: n, label: String(n) })), { value: 0, label: `Все · ${count}` }]}
                />
                {kind !== 'weak' && take < count && <span className="small muted">Карточки возьмутся вперемешку, из разных тем.</span>}
                {kind === 'weak' && take < count && <span className="small muted">Сначала самые слабые.</span>}
              </div>
            )}

            <p className="small muted rp-note">
              <Icon name="repeat" size={14} /> Это тренировка: ответы не меняют расписание повторений.
            </p>
          </>
        )}

        <div className="row end gap8">
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" autoFocus disabled={!count} onClick={start}>
            <Icon name="play" size={16} /> Начать{count ? ` · ${take}` : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Почему набор пуст — вместо обещания, которого нечем выполнить. */
const EMPTY_HINT: Record<RepeatKind, string> = {
  today: 'Сегодня ты здесь ещё ничего не повторял',
  started: 'Ты здесь ещё ни на что не отвечал',
  weak: 'Слабых мест нет — всё держится крепко',
  all: 'Карточек нет'
};

// Открыть окно из любого места (кнопки тем, предметов, папок, «Сегодня», поиск, конец повторения).
let opener: ((at: RepeatAt) => void) | null = null;
export const openRepeatDialog = (at: RepeatAt = {}) => opener?.(at);

/** Откуда запущено повторение — чтобы предложить «ещё раз» по тому же месту. */
export const repeatAtOf = (r: ReviewRoute): RepeatAt => (r.topicId ? { topicId: r.topicId } : r.folderId ? { folderId: r.folderId } : r.subjectId ? { subjectId: r.subjectId } : {});

export function RepeatDialogHost({ go }: { go: (r: Route) => void }) {
  const [at, setAt] = useState<RepeatAt | null>(null);
  useEffect(() => {
    opener = setAt;
    return () => {
      opener = null;
    };
  }, []);
  if (!at) return null;
  return <RepeatDialog at={at} go={go} onClose={() => setAt(null)} />;
}
