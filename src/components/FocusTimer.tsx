// Фокус-таймер поверх любого экрана: плашка с минутами, пауза, стоп. Учёба кончилась — перерыв (сообщение и короткий звук),
// перерыв кончился — «Ещё N минут?». Запуск — из поиска («Фокус»), со «Сегодня» и из повторения карточек.
import { useEffect, useState } from 'react';
import { fmtLeft, focusLeft, pauseFocus, resumeFocus, startBreak, startFocus, stopFocus, tickFocus, useFocus } from '../focusTimer';
import { useData } from '../store';
import { toast } from './ui';

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.55);
    o.onended = () => void ctx.close();
  } catch {
    /* без звука */
  }
}

export function FocusTimer() {
  const s = useFocus();
  const settings = useData().settings;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!s?.endsAt) return;
    const t = setInterval(() => {
      const ended = tickFocus(settings.breakMinutes);
      if (ended === 'work') {
        beep();
        toast(`☕ ${settings.focusMinutes} мин позади — перерыв ${settings.breakMinutes} мин. Встань, подвигайся, попей воды.`);
      } else if (ended === 'break') {
        beep();
        toast('⏰ Перерыв окончен — продолжим?');
      }
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, [s?.endsAt, settings.breakMinutes, settings.focusMinutes]);

  if (!s) return null;
  const left = focusLeft(s, now);
  const paused = !s.endsAt && s.phase !== 'done';
  return (
    <div className={'focus-pill ' + s.phase + (paused ? ' paused' : '')} role="timer" aria-live="off" data-part="focus">
      <span className="focus-ico" aria-hidden="true">
        {s.phase === 'work' ? '🍅' : s.phase === 'break' ? '☕' : '⏰'}
      </span>
      {s.phase === 'done' ? (
        <>
          <span className="small">Перерыв окончен</span>
          <button className="btn small primary" onClick={() => startFocus(settings.focusMinutes)}>
            Ещё {settings.focusMinutes} мин
          </button>
        </>
      ) : (
        <>
          <span className="focus-text">
            <span className="small muted">{s.phase === 'work' ? 'Учёба' : 'Перерыв'}</span>
            <strong className="focus-time">{fmtLeft(left)}</strong>
          </span>
          <button className="icon-btn small" aria-label={paused ? 'Продолжить' : 'Пауза'} title={paused ? 'Продолжить' : 'Пауза'} onClick={() => (paused ? resumeFocus() : pauseFocus())}>
            {paused ? '▶' : '❚❚'}
          </button>
          {s.phase === 'work' ? (
            <button className="icon-btn small" aria-label="Сразу перерыв" title="Сразу перерыв" onClick={() => startBreak(settings.breakMinutes)}>
              ☕
            </button>
          ) : (
            <button className="icon-btn small" aria-label="Пропустить перерыв" title="Пропустить перерыв" onClick={() => startFocus(settings.focusMinutes)}>
              ⏭
            </button>
          )}
        </>
      )}
      <button className="icon-btn small" aria-label="Остановить фокус" title="Остановить" onClick={stopFocus}>
        ×
      </button>
    </div>
  );
}
