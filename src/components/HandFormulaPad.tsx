// Формула от руки прямо в конспекте: пишешь на панели внизу, Мнема сама распознаёт
// (после паузы) и вставляет формулу туда, где стоял курсор. Панель остаётся открытой для следующей.
import { useEffect, useRef, useState } from 'react';
import { aiAvailable, recognizeFormula } from '../ai';
import { useData } from '../store';
import { SketchPad, strokesToPng, type Stroke } from './Drawing';
import { renderTex } from './Markdown';
import { Icon, Segmented, Switch } from './ui';

const PAUSE_MS = 1300; // пауза после последнего штриха — и распознаём
const AUTO_INSERT_MS = 1800; // сколько показываем результат перед автовставкой

type Phase = { name: 'idle' } | { name: 'waiting' } | { name: 'reading' } | { name: 'ready'; latex: string; at: number } | { name: 'error'; text: string };

export function HandFormulaPad({ onInsert, onFix, onClose }: { onInsert: (latex: string, display: boolean) => void; onFix: (latex: string) => void; onClose: () => void }) {
  const data = useData();
  const ai = aiAvailable(data);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [display, setDisplay] = useState(true);
  const [auto, setAuto] = useState(true);
  const [inserted, setInserted] = useState(0);
  const req = useRef(0);
  const displayRef = useRef(display);
  displayRef.current = display;
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insertTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(pauseTimer.current);
      clearTimeout(insertTimer.current);
    },
    []
  );

  function changed(next: Stroke[]) {
    setStrokes(next);
    clearTimeout(pauseTimer.current);
    clearTimeout(insertTimer.current);
    req.current++;
    if (!next.length) return setPhase({ name: 'idle' });
    if (!ai) return;
    setPhase({ name: 'waiting' });
    pauseTimer.current = setTimeout(() => void recognize(next), PAUSE_MS);
  }

  async function recognize(list: Stroke[]) {
    const my = ++req.current;
    setPhase({ name: 'reading' });
    try {
      const latex = await recognizeFormula(await strokesToPng(list));
      if (my !== req.current) return; // пока думали, дописали ещё
      setPhase({ name: 'ready', latex, at: Date.now() });
      if (auto) insertTimer.current = setTimeout(() => commit(latex), AUTO_INSERT_MS);
    } catch (e) {
      if (my === req.current) setPhase({ name: 'error', text: (e as Error).message });
    }
  }

  function commit(latex: string) {
    clearTimeout(insertTimer.current);
    req.current++;
    onInsert(latex, displayRef.current);
    setStrokes([]);
    setPhase({ name: 'idle' });
    setInserted((n) => n + 1);
  }

  // Enter — вставить сейчас, Esc — закрыть панель.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-back')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && phase.name === 'ready' && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault();
        commit(phase.latex);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="hand-pad" role="region" aria-label="Формула от руки">
      <div className="hand-pad-head">
        <strong className="row gap8">
          <Icon name="pen" size={18} /> Формула от руки
        </strong>
        <span className="grow" />
        <Segmented
          ariaLabel="Куда вставлять"
          value={display ? 'block' : 'inline'}
          onChange={(v) => setDisplay(v === 'block')}
          options={[
            { value: 'block', label: 'Отдельной строкой' },
            { value: 'inline', label: 'В строку' }
          ]}
        />
        <label className="row gap6 small" title="Вставлять сразу после распознавания">
          <Switch label="Вставлять сама" checked={auto} onChange={setAuto} /> сама
        </label>
        <button className="icon-btn small" aria-label="Закрыть панель" title="Закрыть (Esc)" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <SketchPad strokes={strokes} onChange={changed} height={170} label="Пиши формулу здесь" />
      <div className="hand-pad-status" aria-live="polite">
        {!ai && <span className="warn-text small">Чтобы Мнема понимала почерк, включи «ИИ-помощник» в «Возможностях».</span>}
        {ai && phase.name === 'idle' && <span className="muted small">{inserted ? `Вставлено: ${inserted}. Пиши следующую — курсор остался на месте.` : 'Пиши крупно, как в тетради. Остановишься — Мнема распознает и вставит формулу туда, где стоит курсор.'}</span>}
        {phase.name === 'waiting' && <span className="muted small">Жду, пока допишешь…</span>}
        {phase.name === 'reading' && (
          <span className="row gap8 small">
            <span className="dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Распознаю…
          </span>
        )}
        {phase.name === 'error' && <span className="warn-text small">{phase.text}</span>}
        {phase.name === 'ready' && (
          <div className="hand-result">
            <span className="hand-tex" dangerouslySetInnerHTML={{ __html: renderTex(phase.latex, false) }} />
            <span className="grow" />
            <button
              className="btn small ghost"
              onClick={() => {
                clearTimeout(insertTimer.current);
                req.current++;
                onFix(phase.latex);
                setStrokes([]);
                setPhase({ name: 'idle' });
              }}
            >
              Поправить
            </button>
            <button className="btn small primary hand-insert" onClick={() => commit(phase.latex)}>
              Вставить
              {auto && <span className="hand-countdown" key={phase.at} style={{ animationDuration: AUTO_INSERT_MS + 'ms' }} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
