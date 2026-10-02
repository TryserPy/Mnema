// «История конспекта»: прежние версии текста темы. Вернуть можно любую — текущий текст при этом сам сохраняется как версия.
import { useState } from 'react';
import { restoreNoteVersion, useData } from '../store';
import { Icon, Modal, toast } from './ui';

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const preview = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

export function NoteHistoryDialog({ topicId, onClose, onRestored }: { topicId: string; onClose: () => void; onRestored: () => void }) {
  const data = useData();
  const topic = data.topics.find((t) => t.id === topicId);
  const list = data.noteHistory?.[topicId] ?? [];
  const [at, setAt] = useState(list[0]?.at ?? '');
  const cur = list.find((v) => v.at === at) ?? list[0];
  if (!topic) return null;
  return (
    <Modal title="История конспекта" onClose={onClose} width={640}>
      <div className="stack gap12">
        {list.length === 0 ? (
          <p className="muted">Пока нет сохранённых версий. Мнема запоминает прежний текст, когда ты правишь конспект (не чаще раза в 10 минут) или когда текст вдруг сильно сокращается.</p>
        ) : (
          <>
            <p className="muted small">
              Выбери версию — внизу будет видно, что в ней. Если вернёшь, нынешний текст не пропадёт: он тоже окажется в списке. Версии лежат 60 дней, только на этом устройстве.
            </p>
            <ul className="hist-list" role="listbox" aria-label="Версии конспекта">
              {list.map((v) => (
                <li key={v.at}>
                  <button type="button" role="option" aria-selected={v.at === cur?.at} className={'hist-item' + (v.at === cur?.at ? ' on' : '')} onClick={() => setAt(v.at)}>
                    <strong>До правки · {when(v.at)}</strong>
                    <span className="small muted">
                      {v.note.length} {v.note.length % 10 === 1 && v.note.length % 100 !== 11 ? 'знак' : 'знаков'} · {preview(v.note, 70)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {cur && (
              <>
                <div className="hist-preview" aria-label="Что в этой версии">
                  {preview(cur.note, 1500)}
                </div>
                <div className="small muted">Сейчас в конспекте: {topic.note.length} знаков.</div>
                <div className="row end gap8">
                  <button className="btn ghost" onClick={onClose}>
                    Закрыть
                  </button>
                  <button
                    className="btn primary"
                    onClick={() => {
                      if (restoreNoteVersion(topicId, cur.at)) {
                        toast('Конспект вернулся к выбранной версии. Прежний текст — тоже в истории.');
                        onRestored();
                      }
                    }}
                  >
                    <Icon name="undo" size={16} /> Вернуть эту версию
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
