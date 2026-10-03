// Автокопии открываются одним окном из любого места («Профиль», «Настройки → Данные»): выбрал копию → подтвердил → восстановили.
import { useEffect, useState } from 'react';
import { getData, neutralizeForeign, normalizeData, replaceData } from '../store';
import { BackupsDialog } from './Backups';
import { Modal, toast } from './ui';

let opener: (() => void) | null = null;
export const openBackups = () => opener?.();

export function BackupsHost() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ReturnType<typeof normalizeData> | null>(null);
  useEffect(() => {
    opener = () => setOpen(true);
    return () => {
      opener = null;
    };
  }, []);
  return (
    <>
      {open && (
        <BackupsDialog
          onClose={() => setOpen(false)}
          onRestore={(d) => {
            setOpen(false);
            setPending(d);
          }}
        />
      )}
      {pending && (
        <Modal title="Восстановить из копии?" onClose={() => setPending(null)}>
          <div className="stack gap12">
            <p>
              В копии: {pending.subjects.length} предм., {pending.topics.length} тем, {pending.cards.length} карточек. Текущие данные будут заменены.
            </p>
            <div className="row end gap8">
              <button className="btn ghost" onClick={() => setPending(null)}>
                Отмена
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  const before = getData();
                  const { data: safe, notes } = neutralizeForeign(pending, before);
                  replaceData(safe);
                  setPending(null);
                  // Ошибся копией — можно вернуть всё, как было до восстановления.
                  toast('Данные восстановлены' + (notes.length ? '. Не перенесено: ' + notes.join('; ') : ''), { label: 'Вернуть как было', run: () => replaceData(before) });
                }}
              >
                Восстановить
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
