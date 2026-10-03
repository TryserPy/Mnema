// Открытые сейчас редакторы конспекта: дописать текст «снаружи» (знакомство) через сам редактор,
// чтобы он не затёр новое своим старым текстом, когда закроется.
export interface NoteWriter {
  append(text: string): void;
}
const open = new Map<string, NoteWriter>();

export function registerNote(topicId: string, w: NoteWriter): () => void {
  open.set(topicId, w);
  return () => {
    if (open.get(topicId) === w) open.delete(topicId);
  };
}

export const noteWriter = (topicId: string): NoteWriter | undefined => open.get(topicId);
