// «Сообщить о проблеме»: текст, раздел, журнал (последние 50 строк без путей и почт) и снимок окна — всё видно до отправки.
import { useState } from 'react';
import { refrainPlatform } from '../../shared/refrainClient.mjs';
import { refrainApi } from '../refrainBridge';
import { journalLines, scrubLine, type ReportContext } from '../refrain';
import { APP_VERSION } from '../update';
import { getData } from '../store';
import { Modal, Switch } from './ui';

const TEXT_MAX = 2000;
/** Сервер принимает снимок до 1 МБ (≈1,4 млн знаков base64). */
const SHOT_MAX = 1.4 * 1024 * 1024;

const CATEGORIES: { id: NonNullable<ReportContext['category']>; name: string }[] = [
  { id: 'note', name: 'Конспект' },
  { id: 'textbook', name: 'Учебник' },
  { id: 'cards', name: 'Карточки' },
  { id: 'styles', name: 'Оформление' },
  { id: 'ai', name: 'ИИ-помощник' },
  { id: 'other', name: 'Другое' }
];

/** Стиль для отчёта: вид интерфейса и светлая/тёмная тема (без своих правок — они могут быть личными). */
function lookName(): string {
  const l = getData().settings.look;
  return `${l?.style ?? 'modern'} · ${l?.light ?? ''}/${l?.dark ?? ''}`.slice(0, 40);
}

/** Можно ли отправить форму на этой платформе (в веб-версии Refrain ИИ нет — нет и отправки). */
export function canReport(): boolean {
  return Boolean(refrainApi());
}

export function ReportProblem({ ctx, shot, onClose }: { ctx: ReportContext; shot: string | null; onClose: () => void }) {
  const api = refrainApi();
  const [category, setCategory] = useState<NonNullable<ReportContext['category']>>(ctx.category ?? (ctx.task || ctx.error ? 'ai' : 'other'));
  const [text, setText] = useState('');
  const [withLog, setWithLog] = useState(true);
  const [withShot, setWithShot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  const log = journalLines();
  const shotOk = Boolean(shot && shot.length < SHOT_MAX);
  const error = ctx.error ? scrubLine(ctx.error) : '';

  if (!api) return null;
  if (sent !== null)
    return (
      <Modal title="Сообщить о проблеме" onClose={onClose}>
        <div className="stack gap12">
          <p>Отправлено, номер #{sent}. Спасибо!</p>
          <div className="row end">
            <button className="btn primary" onClick={onClose}>
              Готово
            </button>
          </div>
        </div>
      </Modal>
    );

  const send = async () => {
    setBusy(true);
    setErr('');
    const platform = window.mnemaApi?.platform ?? '';
    const r = await api.bug({
      category,
      text: text.trim().slice(0, TEXT_MAX),
      app: { version: APP_VERSION, platform: refrainPlatform(platform), os: platform, style: lookName() },
      ...(withLog && log.length ? { log } : {}),
      ...(ctx.task || error ? { context: { ...(ctx.task ? { task: ctx.task } : {}), ...(error ? { error } : {}) } } : {}),
      ...(withShot && shotOk ? { screenshot: shot! } : {})
    });
    setBusy(false);
    if (r.ok) setSent(r.id);
    else setErr(r.error);
  };

  return (
    <Modal title="Сообщить о проблеме" onClose={onClose}>
      <form
        className="stack gap12"
        data-part="report"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="row gap8">
          <span className="small muted nowrap">Где</span>
          <select className="input grow" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {error && <div className="hint info small">Ошибка: {error}</div>}
        <textarea className="input" rows={5} maxLength={TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Что случилось и что ты делал перед этим" aria-label="Что случилось" />
        <span className="small muted">Не пиши почту, телефон и другие личные данные: отчёт читают разработчики.</span>
        {log.length > 0 && (
          <div className="stack gap4">
            <div className="row gap8">
              <span className="grow small">Приложить журнал ошибок ({log.length} строк)</span>
              <Switch label="Приложить журнал ошибок" checked={withLog} onChange={setWithLog} />
            </div>
            {withLog && (
              <details>
                <summary className="small muted">Что уйдёт</summary>
                <pre className="small rf-log">{log.join('\n')}</pre>
              </details>
            )}
          </div>
        )}
        {shotOk && (
          <div className="stack gap4">
            <div className="row gap8">
              <span className="grow small">Приложить снимок окна</span>
              <Switch label="Приложить снимок окна" checked={withShot} onChange={setWithShot} />
            </div>
            {withShot && <img className="rf-shot" src={`data:image/jpeg;base64,${shot}`} alt="Снимок окна, который уйдёт с отчётом" />}
          </div>
        )}
        {err && <span className="small warn-text" role="alert">{err}</span>}
        <div className="row gap8 end">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn primary" disabled={busy || !text.trim()}>
            {busy ? 'Отправляю…' : 'Отправить'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
