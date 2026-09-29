// Визуальный редактор формул (MathLive): не нужно знать LaTeX, есть кнопки и экранная клавиатура.
import 'mathlive/fonts.css';
import { MathfieldElement } from 'mathlive';
import { createElement, useEffect, useRef, useState } from 'react';
import { aiAvailable, recognizeFormula } from '../ai';
import { useData } from '../store';
import { SketchPad, strokesToPng, type Stroke } from './Drawing';
import { renderTex } from './Markdown';
import { Modal, Segmented } from './ui';

MathfieldElement.fontsDirectory = null; // шрифты уже подключены через CSS
MathfieldElement.soundsDirectory = null;

const QUICK: { label: string; insert: string; title: string }[] = [
  { label: 'a/b', insert: '\\frac{#@}{#?}', title: 'Дробь' },
  { label: 'x²', insert: '#@^{#?}', title: 'Степень' },
  { label: 'xₙ', insert: '#@_{#?}', title: 'Нижний индекс' },
  { label: '√', insert: '\\sqrt{#0}', title: 'Корень' },
  { label: 'ⁿ√', insert: '\\sqrt[#?]{#0}', title: 'Корень n-й степени' },
  { label: '·', insert: '\\cdot', title: 'Умножить' },
  { label: '±', insert: '\\pm', title: 'Плюс-минус' },
  { label: '≠', insert: '\\ne', title: 'Не равно' },
  { label: '≤', insert: '\\le', title: 'Меньше или равно' },
  { label: '≥', insert: '\\ge', title: 'Больше или равно' },
  { label: 'π', insert: '\\pi', title: 'Пи' },
  { label: 'α', insert: '\\alpha', title: 'Альфа' },
  { label: 'Δ', insert: '\\Delta', title: 'Дельта' },
  { label: '°', insert: '^{\\circ}', title: 'Градус' },
  { label: '→', insert: '\\rightarrow', title: 'Стрелка (реакция)' },
  { label: 'x⃗', insert: '\\vec{#0}', title: 'Вектор' },
  { label: '{ }', insert: '\\begin{cases}#0\\\\#?\\end{cases}', title: 'Система уравнений' }
];

export function FormulaEditor({ initial = '', allowDisplay = true, onInsert, onClose }: { initial?: string; allowDisplay?: boolean; onInsert: (latex: string, display: boolean) => void; onClose: () => void }) {
  const ref = useRef<MathfieldElement | null>(null);
  const [latex, setLatex] = useState(initial);
  const [showCode, setShowCode] = useState(false);
  const data = useData();
  const canHand = aiAvailable(data);
  const [hand, setHand] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function recognize() {
    setBusy(true);
    setError('');
    try {
      const tex = await recognizeFormula(await strokesToPng(strokes));
      ref.current?.setValue(tex, { silenceNotifications: true });
      setLatex(tex);
      setHand(false);
      setStrokes([]);
      setTimeout(() => ref.current?.focus(), 30);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const mf = ref.current;
    if (!mf) return;
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.smartMode = false;
    mf.setValue(initial, { silenceNotifications: true });
    const onInput = () => setLatex(mf.getValue('latex'));
    mf.addEventListener('input', onInput);
    mf.focus();
    const raf = requestAnimationFrame(() => mf.focus());
    return () => {
      cancelAnimationFrame(raf);
      mf.removeEventListener('input', onInput);
      window.mathVirtualKeyboard?.hide();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function quick(s: string) {
    const mf = ref.current;
    if (!mf) return;
    mf.executeCommand(['insert', s, { selectionMode: 'placeholder' }]);
    mf.focus();
  }

  function codeChanged(v: string) {
    setLatex(v);
    ref.current?.setValue(v, { silenceNotifications: true });
  }

  const empty = !latex.trim();

  return (
    <Modal title="Формула" onClose={onClose} width={720}>
      <div className="stack gap12">
        {canHand && (
          <div className="tabs-narrow">
            <Segmented
              ariaLabel="Способ ввода"
              value={hand ? 'hand' : 'keys'}
              onChange={(v) => setHand(v === 'hand')}
              options={[
                { value: 'keys', label: 'Кнопками' },
                { value: 'hand', label: 'Нарисовать' }
              ]}
            />
          </div>
        )}
        {hand && (
          <div className="stack gap8">
            <SketchPad strokes={strokes} onChange={setStrokes} height={230} label="Напиши формулу" />
            <p className="small muted">Напиши формулу крупно, как в тетради. ИИ превратит её в текст — потом можно поправить.</p>
            {error && <div className="hint warn">{error}</div>}
            <div className="row end">
              <button type="button" className="btn primary" disabled={!strokes.length || busy} onClick={recognize}>
                {busy ? 'Распознаю…' : 'Распознать'}
              </button>
            </div>
          </div>
        )}
        <div className="quick-keys" role="toolbar" aria-label="Быстрые кнопки" hidden={hand}>
          {QUICK.map((q) => (
            <button key={q.title} type="button" className="qk" title={q.title} aria-label={q.title} onMouseDown={(e) => e.preventDefault()} onClick={() => quick(q.insert)}>
              {q.label}
            </button>
          ))}
        </div>
        <div hidden={hand}>{createElement('math-field', { ref, class: 'math-input', 'aria-label': 'Поле формулы' })}</div>
        <p className="small muted" hidden={hand}>Печатай как обычно: 2/3 станет дробью, x^2 — степенью, sqrt — корнем. Стрелки двигают курсор между частями формулы.</p>
        {showCode ? (
          <label className="field">
            <span>Текст формулы (LaTeX)</span>
            <textarea className="mono" rows={2} value={latex} onChange={(e) => codeChanged(e.target.value)} />
          </label>
        ) : (
          <button type="button" className="link-btn" onClick={() => setShowCode(true)}>
            Показать текст формулы (LaTeX)
          </button>
        )}
        {!empty && showCode && <div className="formula-preview" dangerouslySetInnerHTML={{ __html: renderTex(latex, true) }} />}
        <div className="row end gap8">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          {allowDisplay && (
            <button type="button" className="btn" disabled={empty} onClick={() => onInsert(latex, true)}>
              Отдельной строкой
            </button>
          )}
          <button type="button" className="btn primary" disabled={empty} onClick={() => onInsert(latex, false)}>
            {initial ? 'Сохранить' : 'Вставить'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
