// «Инструкция для ИИ»: стиль через любой чат-бот без ключа. Копируешь инструкцию (или .md), дописываешь пожелание,
// вставляешь ответ → проверка (parseAiStyle: только JSON, безопасный CSS, контраст) → «До / После» на настоящем интерфейсе → применить.
import { useEffect, useRef, useState } from 'react';
import { downloadFile } from '../share';
import { getData } from '../store';
import { pickStyle, saveStyle, setBasePreview } from '../styleActions';
import { setStylePreview } from '../styleApply';
import { parseAiStyle, styleForPrompt, styleSystemPrompt, type AiStyleResult } from '../styleAi';
import { appearanceOf, classifyRole } from '../styleMigrate';
import type { Mod131 } from '../styleModel';
import { newStyleId } from '../styleSystem';
import type { Mod } from '../types';
import { Modal, Segmented, toast } from './ui';

function preview(mod: Mod | null) {
  setStylePreview(mod ? { mod } : null);
  setBasePreview(mod && (mod.look || mod.accent || mod.density || mod.fontScale || mod.bg) ? mod : null);
}

/** Текст инструкции: правила и справочник + текущий стиль (если меняем свой) + место для пожелания. */
export function guideText(current?: Mod): string {
  return [
    '# Стиль для Refrain',
    '',
    'Скопируй всё это в чат с ИИ (ChatGPT, Claude, DeepSeek, Gemini…), допиши в самом конце, каким должно быть оформление, и отправь. Ответ ИИ вставь в Refrain: Настройки → Оформление → «Инструкция для ИИ».',
    '',
    styleSystemPrompt(),
    ...(current ? ['', 'ТЕКУЩИЙ СТИЛЬ (измени его по просьбе и верни целиком):', styleForPrompt(current)] : []),
    '',
    'МОЯ ПРОСЬБА: '
  ].join('\n');
}

export function AppearanceAiGuide({ current, onClose }: { current?: Mod; onClose: () => void }) {
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<AiStyleResult | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<'before' | 'after'>('after');
  const id = useRef(current?.id ?? newStyleId());
  const text = guideText(current);

  useEffect(() => {
    preview(result && view === 'after' ? result.mod : null);
  }, [result, view]);
  useEffect(() => () => preview(null), []);

  function check() {
    setErr('');
    try {
      const s = getData().settings;
      setResult(parseAiStyle(answer, { id: id.current, base: { look: s.look, accent: s.accent } }));
      setView('after');
    } catch (e) {
      setResult(null);
      setErr((e as Error).message);
    }
  }

  function apply() {
    if (!result) return;
    preview(null);
    const was = appearanceOf(getData().settings).style;
    const m: Mod131 = { ...result.mod, origin: 'ai', role: (current as Mod131 | undefined)?.role ?? classifyRole(result.mod as Mod131) };
    saveStyle(m, { enable: true });
    onClose();
    toast(`Стиль «${m.name}» применён`, m.role === 'style' ? { label: 'Отменить', run: () => pickStyle(was) } : undefined);
  }

  return (
    <Modal title="Инструкция для ИИ" onClose={onClose} width={620}>
      <div className="stack gap12" data-part="ai-guide">
        <ol className="small stack gap4 guide-steps">
          <li>Скопируй инструкцию или сохрани её файлом .md.</li>
          <li>Вставь в любой чат с ИИ, в конце допиши, каким должно быть оформление.</li>
          <li>Ответ ИИ вставь ниже — Refrain проверит его и покажет до и после.</li>
        </ol>
        <div className="row gap8 wrap">
          <button
            className="btn small primary"
            onClick={() =>
              void navigator.clipboard
                .writeText(text)
                .then(() => toast('Инструкция скопирована'))
                .catch(() => toast('Не получилось скопировать — сохрани файлом'))
            }
          >
            Копировать инструкцию
          </button>
          <button className="btn small" onClick={() => downloadFile('Refrain — инструкция для стиля.md', text, 'text/markdown')}>
            Скачать .md
          </button>
          <span className="small muted">≈ {Math.round(text.length / 1000)} тыс. знаков</span>
        </div>
        <textarea className="input mono" rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Вставь сюда ответ ИИ целиком" aria-label="Ответ ИИ" />
        <div className="row gap8">
          <button className="btn" disabled={!answer.trim()} onClick={check}>
            Проверить
          </button>
        </div>
        {err && (
          <div className="hint warn" role="alert">
            {err}
          </div>
        )}
        {result && (
          <div className="stack gap8">
            <div className="row gap8 wrap">
              <span className="grow">
                {result.mod.icon} <strong>{result.mod.name}</strong>
              </span>
              <Segmented
                ariaLabel="Сравнить"
                value={view}
                onChange={setView}
                options={[
                  { value: 'before', label: 'До' },
                  { value: 'after', label: 'После' }
                ]}
              />
            </div>
            {result.notes.length > 0 ? (
              <div className="stack gap4">
                <span className="small muted">Что выброшено или поправлено:</span>
                <ul className="small muted ai-notes">
                  {result.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <span className="small muted">Ответ чистый — ничего не выброшено.</span>
            )}
            <div className="row gap8 end">
              <button className="btn" onClick={onClose}>
                Отмена
              </button>
              <button className="btn primary" onClick={apply}>
                Применить
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
