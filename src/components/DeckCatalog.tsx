// «Готовые колоды» (1.32, N1): каталог проверенных наборов по школьной программе. Колода добавляется как обычная тема —
// её можно поправить и поделиться файлом .mnema (тот же формат). Ниже — где взять готовые базы Anki и Quizlet.
import { useMemo, useState } from 'react';
import { deckCardCount, OUTSIDE_DECKS, READY_DECKS, type ReadyDeck } from '../decks';
import { buildPack, importPack, shareOrSave } from '../mnemaPack';
import { getData, useData } from '../store';
import { Markdown } from './Markdown';
import { Icon, Modal, plural, toast } from './ui';

export function DeckCatalog({ onClose, onOpenTopic, onImport }: { onClose: () => void; onOpenTopic: (id: string) => void; onImport: () => void }) {
  const data = useData();
  const [open, setOpen] = useState<string | null>(null);
  const counts = useMemo(() => Object.fromEntries(READY_DECKS.map((d) => [d.id, deckCardCount(d)])), []);
  // Уже добавленные колоды узнаём по названию темы в предмете с тем же именем.
  const have = (d: ReadyDeck) => {
    const it = d.items()[0];
    const s = data.subjects.find((x) => x.name.toLowerCase() === it.subject.name.toLowerCase());
    return Boolean(s && data.topics.some((t) => t.subjectId === s.id && t.name === it.topic.name));
  };

  function add(d: ReadyDeck) {
    const r = importPack(d.items());
    toast(`«${d.title}»: ${r.cards} ${plural(r.cards, 'карточка', 'карточки', 'карточек')} — можно учить`);
    if (r.firstTopicId) onOpenTopic(r.firstTopicId);
    onClose();
  }

  async function share(d: ReadyDeck) {
    // Файл .mnema собирается так же, как из своей темы: для этого колоду надо сначала добавить.
    const it = d.items()[0];
    const t = getData().topics.find((x) => x.name === it.topic.name);
    if (!t) return toast('Сначала добавь колоду — потом ею можно поделиться файлом.');
    const pack = await buildPack(getData(), { kind: 'topic', id: t.id });
    await shareOrSave(pack.name, pack.text);
  }

  return (
    <Modal title="Готовые колоды" onClose={onClose} width={680}>
      <div className="stack gap12">
        <p className="small muted">Небольшие проверенные наборы по школьной программе. Колода станет темой — её можно поправить под свой учебник и отправить другу файлом.</p>
        <div className="deck-list">
          {READY_DECKS.map((d) => {
            const added = have(d);
            const isOpen = open === d.id;
            return (
              <div key={d.id} className={'deck-item' + (isOpen ? ' open' : '')}>
                <button type="button" className="deck-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : d.id)}>
                  <span className="deck-icon" style={{ background: d.color }} aria-hidden>
                    {d.icon}
                  </span>
                  <span className="grow stack">
                    <strong>{d.title}</strong>
                    <span className="small muted">
                      {d.subject} · {d.grade} · {counts[d.id]} {plural(counts[d.id], 'карточка', 'карточки', 'карточек')}
                    </span>
                  </span>
                  {added && <span className="chip neutral">добавлена</span>}
                </button>
                {isOpen && (
                  <div className="deck-body stack gap8">
                    <p className="small">{d.about}</p>
                    <div className="imp-sample">
                      {d
                        .items()[0]
                        .cards.slice(0, 3)
                        .map((c, i) => (
                          <div key={i} className="imp-card">
                            <Markdown text={c.front} />
                            <span className="imp-arrow" aria-hidden>
                              {c.type === 'reverse' ? '⇄' : '→'}
                            </span>
                            <Markdown text={c.back} />
                          </div>
                        ))}
                    </div>
                    <div className="row end gap8 wrap">
                      {added && (
                        <button className="btn small" onClick={() => void share(d)}>
                          <Icon name="share" size={16} /> Поделиться
                        </button>
                      )}
                      <button className="btn small primary" onClick={() => add(d)}>
                        <Icon name="plus" size={16} /> {added ? 'Добавить ещё раз' : 'Добавить'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <strong className="small">Колоды других приложений</strong>
        {OUTSIDE_DECKS.map((o) => (
          <div key={o.url} className="deck-outside small">
            <a href={o.url} target="_blank" rel="noopener noreferrer">
              {o.title} ↗
            </a>
            <span className="muted"> — {o.how}</span>
          </div>
        ))}
        <div className="row end gap8 wrap">
          <button className="btn" onClick={onImport}>
            <Icon name="upload" size={16} /> Импорт карточек
          </button>
          <button className="btn ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </Modal>
  );
}
