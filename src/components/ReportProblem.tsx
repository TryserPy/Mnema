// «Сообщить о проблеме»: экран, раздел, текст, журнал (последние 50 строк без путей и почт) и снимок — окна или свой,
// с рамками вокруг места, где проблема. Всё видно до отправки.
import { useRef, useState } from 'react';
import { refrainPlatform } from '../../shared/refrainClient.mjs';
import { refrainApi } from '../refrainBridge';
import { journalLines, scrubLine, type ReportContext } from '../refrain';
import { APP_VERSION } from '../update';
import { getData } from '../store';
import { imageFileToShot, SHOT_MAX, ShotMarker } from './ShotMarker';
import { Icon, Modal, Switch } from './ui';

const TEXT_MAX = 2000;

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

export function ReportProblem({ ctx, shot, where = '', onClose }: { ctx: ReportContext; shot: string | null; where?: string; onClose: () => void }) {
  const api = refrainApi();
  const [category, setCategory] = useState<NonNullable<ReportContext['category']>>(ctx.category ?? (ctx.task || ctx.error ? 'ai' : 'other'));
  const [text, setText] = useState('');
  const [withLog, setWithLog] = useState(true);
  const [withShot, setWithShot] = useState(false);
  const [place, setPlace] = useState(where);
  // Своя картинка вместо снимка окна (или когда снимка нет); marked — то, что уйдёт: картинка с рамками.
  const [own, setOwn] = useState<string | null>(null);
  const [marked, setMarked] = useState<string | null>(null);
  const [shotErr, setShotErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  const log = journalLines();
  const base = own ?? (shot && shot.length < SHOT_MAX ? shot : null);
  const shotOk = Boolean(base);
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
    const where = place.trim().replace(/\s+/g, ' ').slice(0, 120);
    const body = (where ? `Экран: ${where}\n` : '') + text.trim();
    const pic = marked ?? base;
    const r = await api.bug({
      category,
      text: body.slice(0, TEXT_MAX),
      app: { version: APP_VERSION, platform: refrainPlatform(platform), os: platform, style: lookName() },
      ...(withLog && log.length ? { log } : {}),
      ...(ctx.task || error ? { context: { ...(ctx.task ? { task: ctx.task } : {}), ...(error ? { error } : {}) } } : {}),
      ...(withShot && pic && pic.length < SHOT_MAX ? { screenshot: pic } : {})
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
          <span className="small muted nowrap rf-lab">Раздел</span>
          <select className="input grow" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="row gap8">
          <span className="small muted nowrap rf-lab">Экран</span>
          <input className="input grow" value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} placeholder="Где это было: например, «Тема → Конспект, таблица»" aria-label="Экран, где проблема" />
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
        <div className="stack gap6">
          <div className="row gap8">
            <span className="grow small">{own ? 'Приложить своё изображение' : shotOk ? 'Приложить снимок окна' : 'Приложить изображение'}</span>
            {shotOk && <Switch label="Приложить изображение" checked={withShot} onChange={setWithShot} />}
          </div>
          {withShot && base && <ShotMarker src={base} onChange={setMarked} />}
          <div className="row gap8 wrap">
            <button type="button" className="btn small ghost" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={14} /> {own ? 'Другое изображение' : 'Своё изображение'}
            </button>
            {own && shot && shot.length < SHOT_MAX && (
              <button type="button" className="btn small ghost" onClick={() => (setOwn(null), setMarked(null))}>
                Вернуть снимок окна
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setShotErr('');
              void imageFileToShot(f)
                .then((b64) => {
                  setOwn(b64);
                  setMarked(null);
                  setWithShot(true);
                })
                .catch((x: Error) => setShotErr(x.message));
            }}
          />
          {shotErr && <span className="small warn-text">{shotErr}</span>}
        </div>
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
