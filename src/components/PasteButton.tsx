// «Вставить» одним нажатием над полем импорта (src/clipboardText.ts).
import { useRef, useState } from 'react';
import { canReadClipboard, CLIP_MESSAGE, insertAt, readClipboardText } from '../clipboardText';
import { Icon, toast } from './ui';

export function PasteButton({ value, onChange, target, className = 'btn small' }: { value: string; onChange: (v: string) => void; target?: React.RefObject<HTMLTextAreaElement | null>; className?: string }) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  if (!canReadClipboard()) return null;
  return (
    <button
      type="button"
      className={className + ' paste-btn'}
      disabled={busy}
      onClick={async () => {
        if (running.current) return; // двойной тап не вставляет дважды
        running.current = true;
        setBusy(true);
        const r = await readClipboardText();
        running.current = false;
        setBusy(false);
        if (!r.ok) return toast(CLIP_MESSAGE[r.reason]);
        const ta = target?.current;
        const { value: next, caret } = insertAt(value, r.text, ta ? ta.selectionStart : null, ta ? ta.selectionEnd : null);
        onChange(next);
        requestAnimationFrame(() => {
          if (!ta) return;
          ta.focus({ preventScroll: true });
          ta.setSelectionRange(caret, caret);
        });
      }}
    >
      <Icon name="paste" size={16} /> Вставить
    </button>
  );
}
