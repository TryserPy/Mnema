// Меню «Важное»: всё, что Мнема нашла в конспекте, по группам — со ссылкой на страницу,
// кнопками «В карточку», «Показать», «Скрыть» и созданием карточек из всего сразу.
import { useMemo, useState } from 'react';
import { cardDraft, findImportant, IMPORTANT_TYPES, type ImportantItem } from '../important';
import { addCard, updateSettings, updateTopic, useData } from '../store';
import type { CardType, HighlightSettings, ImportantType } from '../types';
import { CardEditor } from './CardEditor';
import { Icon, Modal, plural, Segmented, Switch, Collapse, toast } from './ui';

const TYPE_NAMES: Record<CardType, string> = { basic: 'Вопрос — ответ', reverse: 'В обе стороны', cloze: 'С пропуском', typing: 'Ввести ответ', problem: 'Задача' };

export function ImportantPanel({ topicId, onShow, onPage, onClose }: { topicId: string; onShow: (text: string) => void; onPage: (n: number) => void; onClose: () => void }) {
  const data = useData();
  const topic = data.topics.find((t) => t.id === topicId)!;
  const hs = data.settings.highlight;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<(ReturnType<typeof cardDraft> & { page?: number }) | null>(null);
  const [bulk, setBulk] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<ImportantType>>(new Set(IMPORTANT_TYPES.map((t) => t.id)));
  const hidden = new Set(topic.hiddenImportant ?? []);
  const all = useMemo(() => findImportant(topic.note, hs), [topic.note, hs]);
  const items = all.filter((i) => !hidden.has(i.id));
  const cards = data.cards.filter((c) => c.topicId === topicId);
  const hasCard = (i: ImportantItem) => cards.some((c) => (c.front + ' ' + c.back).toLowerCase().includes(i.text.toLowerCase()));

  const hide = (id: string) => updateTopic(topicId, { hiddenImportant: [...(topic.hiddenImportant ?? []), id] });

  return (
    <aside className="imp-panel" aria-label="Важное">
      <div className="imp-head">
        <strong className="grow row gap8">
          <Icon name="important" size={18} /> Важное <span className="muted">{items.length}</span>
        </strong>
        <button className={'icon-btn small' + (settingsOpen ? ' on' : '')} aria-label="Настроить автовыделение" title="Настроить автовыделение" onClick={() => setSettingsOpen(!settingsOpen)}>
          <Icon name="sliders" size={18} />
        </button>
        <button className="icon-btn small" aria-label="Закрыть «Важное»" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>

      {settingsOpen ? (
        <HighlightSettingsView hs={hs} hiddenCount={hidden.size} onUnhide={() => updateTopic(topicId, { hiddenImportant: [] })} />
      ) : items.length === 0 ? (
        <div className="imp-empty">
          <p>Пока ничего не найдено.</p>
          <p className="small muted">Мнема отмечает жирное, определения («X — это…»), даты, имена, формулы и рамки «Запомните». Выдели главное в конспекте жирным — оно появится здесь.</p>
        </div>
      ) : (
        <div className="imp-list">
          {IMPORTANT_TYPES.map((t) => {
            const group = items.filter((i) => i.type === t.id);
            if (!group.length) return null;
            const open = openGroups.has(t.id);
            return (
              <div key={t.id} className="imp-group">
                <button
                  className="imp-group-head"
                  aria-expanded={open}
                  onClick={() => {
                    const n = new Set(openGroups);
                    if (open) n.delete(t.id);
                    else n.add(t.id);
                    setOpenGroups(n);
                  }}
                >
                  <span className="imp-dot" style={{ background: t.color }} />
                  <span className="grow">{t.plural}</span>
                  <span className="muted small">{group.length}</span>
                  <span className={'chev' + (open ? ' open' : '')}>›</span>
                </button>
                <Collapse open={open}>
                {group.map((i) => {
                    const done = hasCard(i);
                    return (
                      <div key={i.id} className="imp-item" style={{ ['--c' as string]: t.color }}>
                        <div className="imp-text">
                          <strong>{i.text}</strong>
                          {i.sentence !== i.text && <span className="imp-sent">{i.sentence}</span>}
                        </div>
                        <div className="imp-actions">
                          {i.page && (
                            <button className="page-ref" onClick={() => onPage(i.page!)} title="Открыть фото страницы">
                              стр. {i.page}
                            </button>
                          )}
                          <span className="grow" />
                          <button className="icon-btn tiny" title="Показать в конспекте" aria-label="Показать в конспекте" onClick={() => onShow(i.text)}>
                            <Icon name="search" size={15} />
                          </button>
                          <button className="icon-btn tiny" title="Скрыть" aria-label="Скрыть" onClick={() => hide(i.id)}>
                            <Icon name="x" size={15} />
                          </button>
                          {done ? (
                            <span className="imp-done" title="Карточка уже есть">
                              ✓
                            </span>
                          ) : (
                            <button className="btn tiny" onClick={() => setDraft({ ...cardDraft(i), page: i.page })}>
                              <Icon name="cardPlus" size={14} /> В карточку
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Collapse>
              </div>
            );
          })}
        </div>
      )}
      {!settingsOpen && items.some((i) => !hasCard(i)) && (
        <div className="imp-foot">
          <button className="btn small primary grow" onClick={() => setBulk(true)}>
            Сделать карточки из всего
          </button>
        </div>
      )}

      {draft && (
        <Modal title="Новая карточка" onClose={() => setDraft(null)} width={620}>
          <CardEditor topicId={topicId} initial={draft} onDone={() => setDraft(null)} />
        </Modal>
      )}
      {bulk && <BulkCards topicId={topicId} items={items.filter((i) => !hasCard(i))} onClose={() => setBulk(false)} />}
    </aside>
  );
}

function HighlightSettingsView({ hs, hiddenCount, onUnhide }: { hs: HighlightSettings; hiddenCount: number; onUnhide: () => void }) {
  const [custom, setCustom] = useState(hs.custom.join('\n'));
  const set = (p: Partial<HighlightSettings>) => updateSettings({ highlight: { ...hs, ...p } });
  return (
    <div className="imp-settings">
      <div className="row gap8">
        <span className="grow small">Подсвечивать в тексте</span>
        <Switch label="Подсвечивать в тексте" checked={hs.show} onChange={(v) => set({ show: v })} />
      </div>
      <span className="label">Что искать</span>
      {IMPORTANT_TYPES.map((t) => (
        <div key={t.id} className="row gap8 imp-rule">
          <span className="imp-dot" style={{ background: t.color }} />
          <span className="grow stack">
            <span className="small">{t.plural}</span>
            <span className="tiny-text muted">{t.hint}</span>
          </span>
          <Switch label={t.plural} checked={hs.rules[t.id]} onChange={(v) => set({ rules: { ...hs.rules, [t.id]: v } })} />
        </div>
      ))}
      <span className="label">Строгость</span>
      <Segmented
        ariaLabel="Строгость"
        value={hs.strict}
        onChange={(v) => set({ strict: v })}
        options={[
          { value: 'strict', label: 'Только точно' },
          { value: 'normal', label: 'Обычно' },
          { value: 'all', label: 'Всё похожее' }
        ]}
      />
      <span className="tiny-text muted">«Только точно» — например, годы только с «г.» или «год»; «Всё похожее» — ещё и имена без инициалов.</span>
      <label className="stack gap4">
        <span className="label">Мои слова — по одному в строке</span>
        <textarea
          rows={3}
          value={custom}
          placeholder={'крепостное право\nреформа'}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={() =>
            set({
              custom: custom
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean)
            })
          }
        />
      </label>
      {hiddenCount > 0 && (
        <button className="btn small ghost" onClick={onUnhide}>
          Вернуть скрытые ({hiddenCount})
        </button>
      )}
    </div>
  );
}

/** Черновики карточек из всего найденного: отметь нужные, поправь формулировку — и добавь. */
function BulkCards({ topicId, items, onClose, title = 'Карточки из «Важного»' }: { topicId: string; items: ImportantItem[]; onClose: () => void; title?: string }) {
  const [drafts, setDrafts] = useState(() => {
    const seen = new Set<string>();
    return items
      .filter((i) => i.type !== 'term' || i.sentence.length < 200)
      .map((i) => ({ item: i, on: i.type !== 'formula' && i.type !== 'name', ...cardDraft(i) }))
      .filter((d) => {
        const k = d.front.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  });
  const chosen = drafts.filter((d) => d.on);
  const patch = (i: number, p: Partial<(typeof drafts)[number]>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...p } : d)));
  return (
    <Modal title={title} onClose={onClose} width={860} sticky>
      <div className="stack gap12">
        <div className="row gap8 wrap">
          <button className="btn small ghost" onClick={() => setDrafts(drafts.map((d) => ({ ...d, on: true })))}>
            Выбрать все
          </button>
          <button className="btn small ghost" onClick={() => setDrafts(drafts.map((d) => ({ ...d, on: false })))}>
            Снять все
          </button>
        </div>
        <p className="small muted">Это черновики. Поправь формулировку своими словами — так запоминается лучше. Отметь только то, что действительно нужно знать.</p>
        <div className="bulk-list">
          {drafts.map((d, i) => {
            const t = IMPORTANT_TYPES.find((x) => x.id === d.item.type)!;
            return (
              <div key={d.item.id} className={'bulk-row' + (d.on ? '' : ' off')}>
                <input type="checkbox" checked={d.on} onChange={(e) => patch(i, { on: e.target.checked })} aria-label="Взять карточку" />
                <div className="grow stack gap4">
                  <div className="row gap6 tiny-text">
                    <span className="imp-dot" style={{ background: t.color }} /> {t.label} · {TYPE_NAMES[d.type]}
                    {d.item.page && <span className="muted">· стр. {d.item.page}</span>}
                  </div>
                  <textarea rows={d.type === 'cloze' ? 2 : 1} value={d.front} onChange={(e) => patch(i, { front: e.target.value })} aria-label="Вопрос" disabled={!d.on} />
                  {d.type !== 'cloze' && <textarea rows={1} value={d.back} onChange={(e) => patch(i, { back: e.target.value })} aria-label="Ответ" disabled={!d.on} />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="row end gap8">
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn primary"
            disabled={!chosen.length}
            onClick={() => {
              let n = 0;
              for (const d of chosen)
                if (d.front.trim() && (d.type === 'cloze' ? /\{\{.+?\}\}/.test(d.front) : d.back.trim())) {
                  addCard({ topicId, type: d.type, front: d.front.trim(), back: d.back.trim(), page: d.item.page });
                  n++;
                }
              toast(`Готово: ${n} ${plural(n, 'новая карточка', 'новые карточки', 'новых карточек')}`);
              onClose();
            }}
          >
            Добавить {chosen.length} {plural(chosen.length, 'карточку', 'карточки', 'карточек')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Карточки из всего конспекта: жирное, определения, даты, «Запомни» — одним окном. */
export function NoteToCards({ topicId, onClose }: { topicId: string; onClose: () => void }) {
  const data = useData();
  const topic = data.topics.find((t) => t.id === topicId)!;
  const hs = data.settings.highlight;
  const items = useMemo(() => {
    const hidden = new Set(topic.hiddenImportant ?? []);
    const cards = data.cards.filter((c) => c.topicId === topicId);
    const has = (i: ImportantItem) => cards.some((c) => (c.front + ' ' + c.back).toLowerCase().includes(i.text.toLowerCase()));
    return findImportant(topic.note, hs).filter((i) => !hidden.has(i.id) && !has(i));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items.length)
    return (
      <Modal title="Карточки из конспекта" onClose={onClose}>
        <div className="stack gap12">
          <p>{topic.note.trim() ? 'Всё важное из конспекта уже в карточках — или в нём пока нет выделенного: жирного, определений, дат.' : 'Конспект пока пустой.'}</p>
          <p className="small muted">Выдели главное жирным или напиши определение «X — это …», и Мнема найдёт его.</p>
          <div className="row end">
            <button className="btn primary" onClick={onClose}>
              Понятно
            </button>
          </div>
        </div>
      </Modal>
    );
  return <BulkCards topicId={topicId} items={items} onClose={onClose} title="Карточки из конспекта" />;
}
