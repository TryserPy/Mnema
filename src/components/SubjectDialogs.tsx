// Окна «Изменить предмет» и «Удалить предмет» — открываются из левой панели и со страницы предмета.
import { useState } from 'react';
import { addFolder, addSubject, deleteFolder, deleteSubject, deleteTopic, getData, restoreRemoved, sortedFolders, updateFolder, updateSubject, useData } from '../store';
import { ColorPicker, IconPicker, Modal, plural, Segmented, SUBJECT_COLORS, toast } from './ui';

function FolderSelect({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const data = useData();
  const folders = sortedFolders(data);
  if (!folders.length) return null;
  return (
    <label className="field">
      <span>Папка</span>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Без папки</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.icon ? f.icon + ' ' : ''}
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Новый предмет или новая папка. */
export function NewSubjectDialog({ onClose, onCreated, folderId: presetFolder, startAs = 'subject' }: { onClose: () => void; onCreated: (id: string, kind: 'subject' | 'folder') => void; folderId?: string; startAs?: 'subject' | 'folder' }) {
  const data = useData();
  const [kind, setKind] = useState<'subject' | 'folder'>(startAs);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SUBJECT_COLORS[(data.subjects.length + data.folders.length) % SUBJECT_COLORS.length]);
  const [icon, setIcon] = useState<string | undefined>();
  const [folderId, setFolderId] = useState<string | undefined>(presetFolder);
  return (
    <Modal title={kind === 'subject' ? 'Новый предмет' : 'Новая папка'} onClose={onClose}>
      <form
        className="stack gap12"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (kind === 'folder') onCreated(addFolder(name, color, icon).id, 'folder');
          else {
            const sub = addSubject(name, color);
            if (icon || folderId) updateSubject(sub.id, { icon, folderId });
            onCreated(sub.id, 'subject');
          }
        }}
      >
        <Segmented
          ariaLabel="Что создать"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'subject', label: 'Предмет' },
            { value: 'folder', label: 'Папка предметов' }
          ]}
        />
        {kind === 'folder' && <p className="small muted">Папка объединяет предметы: например, «Математика» — алгебра, геометрия и вероятность, «Русский язык» — русский и литература.</p>}
        <label className="field">
          <span>Название</span>
          <input className="input" autoFocus placeholder={kind === 'subject' ? 'Например: Биология' : 'Например: Математика'} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Цвет</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="field">
          <span>Значок</span>
          <IconPicker value={icon} onChange={setIcon} color={color} />
        </div>
        {kind === 'subject' && <FolderSelect value={folderId} onChange={setFolderId} />}
        <div className="row end">
          <button className="btn primary" type="submit" disabled={!name.trim()}>
            Создать
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EditSubject({ id, onClose, onDelete }: { id: string; onClose: () => void; onDelete?: () => void }) {
  const data = useData();
  const s = data.subjects.find((x) => x.id === id);
  const [name, setName] = useState(s?.name ?? '');
  const [color, setColor] = useState(s?.color ?? '#3B5BDB');
  const [icon, setIcon] = useState<string | undefined>(s?.icon);
  const [folderId, setFolderId] = useState<string | undefined>(s?.folderId);
  if (!s) return null;
  return (
    <Modal title="Изменить предмет" onClose={onClose}>
      <form
        className="stack gap12"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          updateSubject(id, { name: name.trim(), color, icon, folderId });
          onClose();
        }}
      >
        <label className="field">
          <span>Название</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Цвет</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="field">
          <span>Значок</span>
          <IconPicker value={icon} onChange={setIcon} color={color} />
        </div>
        <FolderSelect value={folderId} onChange={setFolderId} />
        <div className="row between">
          {onDelete ? (
            <button type="button" className="btn ghost danger-text" onClick={onDelete}>
              Удалить предмет
            </button>
          ) : (
            <span />
          )}
          <button className="btn primary" type="submit" disabled={!name.trim()}>
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EditFolder({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useData();
  const f = data.folders.find((x) => x.id === id);
  const [name, setName] = useState(f?.name ?? '');
  const [color, setColor] = useState(f?.color ?? '#3A3F4E');
  const [icon, setIcon] = useState<string | undefined>(f?.icon);
  const [armed, setArmed] = useState(false);
  if (!f) return null;
  const inside = data.subjects.filter((s) => s.folderId === id).length;
  return (
    <Modal title="Изменить папку" onClose={onClose}>
      <form
        className="stack gap12"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          updateFolder(id, { name: name.trim(), color, icon });
          onClose();
        }}
      >
        <label className="field">
          <span>Название</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Цвет</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="field">
          <span>Значок</span>
          <IconPicker value={icon} onChange={setIcon} color={color} />
        </div>
        <div className="row between">
          <button
            type="button"
            className="btn ghost danger-text"
            onClick={() => {
              if (!armed) return setArmed(true);
              deleteFolder(id);
              onClose();
              toast(`Папка «${f.name}» удалена, предметы остались`);
            }}
          >
            {armed ? `Точно? ${inside ? `${inside} ${plural(inside, 'предмет останется', 'предмета останутся', 'предметов останутся')} без папки` : 'Удалить'}` : 'Удалить папку'}
          </button>
          <button className="btn primary" type="submit" disabled={!name.trim()}>
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteSubject({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted?: () => void }) {
  const data = useData();
  const s = data.subjects.find((x) => x.id === id);
  if (!s) return null;
  const topics = data.topics.filter((t) => t.subjectId === id);
  const tIds = new Set(topics.map((t) => t.id));
  const cards = data.cards.filter((c) => tIds.has(c.topicId)).length;
  return (
    <Modal title="Удалить предмет?" onClose={onClose}>
      <div className="stack gap12">
        <p>
          «{s.name}» будет удалён вместе с {topics.length} {plural(topics.length, 'темой', 'темами', 'темами')} и {cards} {plural(cards, 'карточкой', 'карточками', 'карточками')}. Сразу после удаления его можно вернуть кнопкой внизу экрана.
        </p>
        <div className="row end gap8">
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn danger-solid"
            autoFocus
            onClick={() => {
              const removed = deleteSubject(id);
              onClose();
              onDeleted?.();
              toast(`Предмет «${s.name}» удалён`, { label: 'Вернуть', run: () => restoreRemoved(removed) });
            }}
          >
            Удалить
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Удалить тему (с подтемами) с возможностью вернуть. */
export function deleteTopicWithUndo(id: string) {
  const t = getData().topics.find((x) => x.id === id);
  const removed = deleteTopic(id);
  toast(`Тема «${t?.name ?? ''}» удалена`, { label: 'Вернуть', run: () => restoreRemoved(removed) });
}
