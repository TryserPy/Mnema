// «Создать с ИИ» и «Изменить с ИИ»: ученик пишет словами, ИИ возвращает стиль, мы его вычищаем и показываем на настоящем интерфейсе.
// Дальше: «Применить» / «Сохранить как мой стиль» / «Доработать» (ещё одна просьба поверх этого стиля). Ответ ИИ — недоверенные данные:
// весь разбор, очистка и проверка читаемости — в styleAi.ts, здесь только кнопки.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getData } from '../store';
import { saveCustomStyle, setBasePreview, toggleStyle } from '../styleActions';
import { setStylePreview } from '../styleApply';
import { aiReady, askStyle, type AiReady, type AiStyleResult } from '../styleAi';
import { newStyleId } from '../styleSystem';
import { API_VARS } from '../styleApi';
import type { Mod, SettingsSection } from '../types';
import { StyleDemo } from './StyleGallery';
import { Icon, toast } from './ui';
import '../styleEditor.css';

const EXAMPLES = ['Тёмный космос с неоновыми акцентами, крупные кнопки, без теней', 'Тёплая бумага и книжный шрифт, спокойные цвета', 'Строгий и компактный, как редактор кода', 'Яркие леденцовые цвета и очень круглые углы', 'Максимальная читаемость: крупный текст и высокий контраст'];

const labelOf = (name: string) => API_VARS.flatMap((g) => g.vars).find((v) => v.name === name)?.label ?? name;

/** Предпросмотр стиля на настоящем интерфейсе (и основы — темы, плотности, фона). */
function preview(mod: Mod | null) {
  setStylePreview(mod ? { mod } : null);
  setBasePreview(mod && (mod.look || mod.accent || mod.density || mod.fontScale || mod.bg) ? mod : null);
}

/**
 * `current` — стиль, который надо изменить (для «Изменить с ИИ»); без него создаётся новый.
 * `onUse` — если задан, результат отдаётся редактору («Взять в редактор»); иначе панель сама сохраняет стиль в «Мои стили».
 * `replaceId` — менять уже сохранённый стиль с этим id (иначе сохраняется новый).
 */
export function StyleAiPanel({ current, onClose, onUse, replaceId, onGo }: { current?: Mod; onClose: () => void; onUse?: (mod: Mod) => void; replaceId?: string; onGo?: (section: SettingsSection) => void }) {
  const [wish, setWish] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState<AiReady | null>(null);
  const [peek, setPeek] = useState(false); // на телефоне окно закрывает почти весь экран: «Посмотреть» убирает всё, кроме шапки и кнопок
  const [result, setResult] = useState<AiStyleResult | null>(null);
  const id = useRef(replaceId ?? newStyleId());
  const ticket = useRef(0);

  useEffect(() => {
    let alive = true;
    void aiReady(getData()).then((r) => alive && setReady(r));
    return () => {
      alive = false;
    };
  }, []);
  // Показываем результат на настоящем интерфейсе; закрыли — всё как было.
  useEffect(() => {
    preview(result?.mod ?? null);
  }, [result]);
  useEffect(() => () => preview(null), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal-back') && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });

  async function run(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError('');
    const mine = ++ticket.current;
    try {
      const s = getData().settings;
      // «Доработать» — поверх уже полученного стиля; «Изменить» — поверх переданного.
      const base = result?.mod ?? current;
      const r = await askStyle(t, { id: id.current, base: { look: s.look, accent: s.accent }, current: base });
      if (mine !== ticket.current) return;
      setResult(r);
      setAgain('');
    } catch (e) {
      if (mine === ticket.current) setError((e as Error).message);
    } finally {
      if (mine === ticket.current) setBusy(false);
    }
  }

  function final(): Mod | null {
    if (!result) return null;
    const w = wish.trim();
    return { ...result.mod, id: id.current, name: result.mod.name || w.slice(0, 40) || 'Стиль от ИИ', where: 'ИИ' };
  }
  function commit(enable: boolean) {
    const mod = final();
    if (!mod) return;
    preview(null); // сначала вернуть, как было, — тогда включение запомнит правильную основу
    saveCustomStyle(mod, { enable });
    onClose();
    toast(enable ? `Стиль «${mod.name}» включён` : `Стиль «${mod.name}» сохранён в «Мои стили»`, enable ? { label: 'Отменить', run: () => toggleStyle(mod, false) } : undefined);
  }
  function use() {
    const mod = final();
    if (!mod) return;
    preview(null);
    onUse?.(mod);
  }

  const stop = ready && !ready.ok ? ready : null;
  const theme = document.documentElement.dataset.theme ?? 'light';
  return createPortal(
    <aside className={'style-editor ai-panel' + (peek ? ' peek' : '')} role="dialog" aria-label={current ? 'Изменить стиль с помощью ИИ' : 'Создать стиль с помощью ИИ'}>
      <header className="se-head">
        <span className="se-icon">✨</span>
        <div className="grow stack gap4">
          <span className="se-title static">{current ? `Изменить с ИИ` : 'Создать с ИИ'}</span>
          <span className="small muted">{current ? `«${current.name}»: скажи, что поправить.` : 'Опиши словами, как должно выглядеть Refrain, — ИИ соберёт стиль.'}</span>
        </div>
        {result && (
          <button className="btn small se-peek" aria-pressed={peek} onClick={() => setPeek(!peek)}>
            {peek ? 'Вернуться' : 'Посмотреть'}
          </button>
        )}
        <button className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>
      <div className="se-body">
        <div className="se-pane">
          {stop && (
            <div className="hint warn stack gap8" role="alert">
              <span>{stop.hint}</span>
              {stop.go && onGo && (
                <div>
                  <button
                    className="btn small"
                    onClick={() => {
                      onClose();
                      onGo(stop.go!);
                    }}
                  >
                    {stop.go === 'ai' ? 'Открыть «ИИ-помощник»' : 'Открыть «Возможности»'}
                  </button>
                </div>
              )}
            </div>
          )}
          {!result && (
            <>
              <label className="se-mini">
                <span>{current ? 'Что изменить' : 'Какой стиль нужен'}</span>
                <textarea
                  className="input se-wish"
                  rows={4}
                  maxLength={800}
                  autoFocus
                  placeholder={current ? 'Сделай темнее, акцент зелёный, углы круглее' : 'Тёмный космос с неоновыми акцентами, крупные кнопки, без теней'}
                  value={wish}
                  onChange={(e) => setWish(e.target.value)}
                  onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && void run(wish)}
                />
              </label>
              {!current && (
                <div className="se-chips wrap" aria-label="Примеры">
                  {EXAMPLES.map((x) => (
                    <button key={x} type="button" className="se-chip" onClick={() => setWish(x)}>
                      {x}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <button className="btn primary" disabled={busy || !wish.trim() || Boolean(stop)} onClick={() => void run(wish)}>
                  {busy ? 'ИИ думает…' : current ? 'Изменить' : 'Придумать стиль'}
                </button>
              </div>
            </>
          )}
          {error && (
            <div className="hint warn" role="alert">
              {error}
            </div>
          )}
          {result && (
            <>
              <div className="ai-result">
                <div className="st-frame ai-demo" aria-hidden="true">
                  <StyleDemo mod={result.mod} theme={theme} />
                </div>
                <div className="stack gap4">
                  <strong>
                    {result.mod.icon} {result.mod.name}
                  </strong>
                  {result.mod.description && <span className="small muted">{result.mod.description}</span>}
                  <span className="small muted">Стиль уже показан на всём приложении (на телефоне — кнопка «Посмотреть»). Не нравится — «Доработать» или закрой окно, всё вернётся.</span>
                </div>
              </div>
              {result.fixes.length > 0 && (
                <div className="se-row">
                  <span className="se-row-label">Подправлена читаемость</span>
                  {result.fixes.slice(0, 5).map((f, i) => (
                    <span key={i} className="small">
                      {f.mode === 'light' ? 'Светлая' : 'Тёмная'} тема: «{labelOf(f.name)}» {f.from} → {f.to} (контраст {f.ratio} : 1)
                    </span>
                  ))}
                  {result.fixes.length > 5 && <span className="small muted">…и ещё {result.fixes.length - 5}</span>}
                </div>
              )}
              {result.notes.length > 0 && (
                <ul className="small muted ai-notes">
                  {result.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              <label className="se-mini">
                <span>Доработать</span>
                <div className="row gap8">
                  <input className="input grow" maxLength={400} placeholder="Сделай темнее, акцент зелёный…" value={again} onChange={(e) => setAgain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run(again)} />
                  <button className="btn" disabled={busy || !again.trim() || Boolean(stop)} onClick={() => void run(again)}>
                    {busy ? 'Думаю…' : 'Доработать'}
                  </button>
                </div>
              </label>
              <div>
                <button
                  className="link-btn small"
                  onClick={() => {
                    setResult(null);
                    setError('');
                  }}
                >
                  Начать сначала
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <footer className="se-foot">
        <button className="btn small" onClick={onClose}>
          Отмена
        </button>
        <span className="grow" />
        {onUse ? (
          <button className="btn small primary" disabled={!result} onClick={use}>
            Взять в редактор
          </button>
        ) : (
          <>
            <button className="btn small" disabled={!result} onClick={() => commit(false)}>
              Сохранить как мой стиль
            </button>
            <button className="btn small primary" disabled={!result} onClick={() => commit(true)}>
              Применить
            </button>
          </>
        )}
      </footer>
    </aside>,
    document.body
  );
}
