// Пустой конспект (1.34): с чего начать — шаблон, текст из буфера одним нажатием или фото учебника.
// Голосом можно диктовать прямо в конспект: микрофон есть на клавиатуре телефона.
import { canReadClipboard, CLIP_MESSAGE, readClipboardText } from '../clipboardText';
import { cleanPasted, NOTE_TEMPLATES } from '../noteTemplates';
import { Icon, toast, touchUI } from './ui';

export function NoteStart({ topicName, onStart, onTextbook }: { topicName: string; onStart: (markdown: string) => void; onTextbook: () => void }) {
  const paste = async () => {
    const r = await readClipboardText();
    if (!r.ok) return toast(CLIP_MESSAGE[r.reason]);
    onStart(cleanPasted(r.text));
    toast('Текст из буфера вставлен в конспект');
  };
  return (
    <section className="note-start" aria-label="Начать конспект">
      <strong>Начни конспект</strong>
      <div className="note-start-row">
        {NOTE_TEMPLATES.filter((t) => t.id !== 'empty').map((t) => (
          <button key={t.id} type="button" className="note-start-btn" onClick={() => onStart(t.make(topicName))}>
            <span className="note-start-title">Шаблон «{t.title}»</span>
            <span className="small muted">{t.hint}</span>
          </button>
        ))}
        {canReadClipboard() && (
          <button type="button" className="note-start-btn" onClick={() => void paste()}>
            <span className="note-start-title">
              <Icon name="paste" size={16} /> Вставить из буфера
            </span>
            <span className="small muted">Скопированный текст — сразу в конспект</span>
          </button>
        )}
        <button type="button" className="note-start-btn" onClick={onTextbook}>
          <span className="note-start-title">
            <Icon name="camera" size={16} /> Из учебника
          </span>
          <span className="small muted">Фото страниц → конспект</span>
        </button>
      </div>
      <span className="small muted">{touchUI() ? 'Или просто пиши ниже. Диктовать можно микрофоном на клавиатуре.' : 'Или просто пиши ниже.'}</span>
    </section>
  );
}
