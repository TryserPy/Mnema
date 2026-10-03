// «Настройки → Данные → Автокопии»: копии, которые Мнема делает сама раз в день. Видно, что в каждой, и можно вернуть любую.
import { useEffect, useState } from 'react';
import { backupDay, dayLabel, sizeLabel } from '../backups';
import { normalizeData } from '../store';
import { Modal, plural } from './ui';

type Parsed = ReturnType<typeof normalizeData>;

export function BackupsDialog({ onClose, onRestore }: { onClose: () => void; onRestore: (data: Parsed) => void }) {
  const api = window.mnemaApi;
  const [list, setList] = useState<{ name: string; size: number }[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [info, setInfo] = useState<Record<string, Parsed | 'bad' | 'loading'>>({});
  useEffect(() => {
    void api?.backupList?.().then((l) => setList(l.filter((x) => backupDay(x.name))), () => setList([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (name: string) => {
    setOpen(open === name ? null : name);
    if (info[name]) return;
    setInfo((x) => ({ ...x, [name]: 'loading' }));
    try {
      // Разбираем здесь, внутри try: повреждённая копия — сообщение в списке, а не упавший экран.
      const text = await api?.backupRead?.(name);
      const parsed: Parsed | 'bad' = text ? normalizeData(JSON.parse(text)) : 'bad';
      setInfo((x) => ({ ...x, [name]: parsed }));
    } catch {
      setInfo((x) => ({ ...x, [name]: 'bad' }));
    }
  };

  return (
    <Modal title="Автокопии" onClose={onClose} width={560}>
      <div className="stack gap12">
        <p className="small muted">Каждый день Мнема сама сохраняет копию — какими данные были в начале дня, до первых изменений. Хранятся 8 последних дней, только на этом устройстве.</p>
        {list === null ? (
          <span className="small muted">Загружаю…</span>
        ) : list.length === 0 ? (
          <p>Копий пока нет — первая появится, когда ты завтра откроешь Мнему.</p>
        ) : (
          <div className="bk-list">
            {list.map((b) => {
              const day = backupDay(b.name)!;
              const d = info[b.name];
              const isOpen = open === b.name;
              return (
                <div key={b.name} className={'bk-item' + (isOpen ? ' open' : '')}>
                  <button type="button" className="bk-row" aria-expanded={isOpen} onClick={() => void pick(b.name)}>
                    <strong>{dayLabel(day)}</strong>
                    <span className="small muted">{sizeLabel(b.size)}</span>
                  </button>
                  {isOpen && (
                    <div className="bk-body">
                      {d === 'loading' || !d ? (
                        <span className="small muted">Открываю…</span>
                      ) : d === 'bad' ? (
                        <span className="small bk-bad">Эта копия повреждена — её не открыть.</span>
                      ) : (
                        <>
                          <span className="small">
                            {d.subjects.length} {plural(d.subjects.length, 'предмет', 'предмета', 'предметов')} · {d.topics.length} {plural(d.topics.length, 'тема', 'темы', 'тем')} · {d.cards.length}{' '}
                            {plural(d.cards.length, 'карточка', 'карточки', 'карточек')}
                          </span>
                          <button type="button" className="btn small primary" onClick={() => onRestore(d)}>
                            Вернуть эту копию
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
