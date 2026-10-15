// Refrain ИИ в «Настройки → ИИ-помощник»: вход по почте, счётчик страниц, приглашение, устройства, порядок поставщиков,
// выход и удаление аккаунта. Сеть, токены и ключ устройства — в shared/refrainClient.mjs (окно видит только результаты).
import { useEffect, useState } from 'react';
import type { AiConfig } from '../store';
import { refrainApi, type DeviceInfo, type Quota } from '../refrainBridge';
import { quotaLines, refrainMessage } from '../refrain';
import type { RefrainFail, RefrainStatus } from '../../shared/refrainClient.mjs';
import { Modal } from './ui';

export type Step = 'refrain' | 'key' | 'local';
export type AiConfigOrder = AiConfig & { order?: Step[]; refrain?: boolean };

const STEP_NAME: Record<Step, string> = { refrain: 'Refrain ИИ', key: 'Свой ключ', local: 'Без интернета' };
const PLATFORM_NAME: Record<string, string> = { windows: 'Windows', linux: 'Linux', android: 'Android' };

/** Текст ошибки для ученика: известный код — по таблице, иначе то, что пришло. */
export function failText(r: RefrainFail): string {
  return refrainMessage(r.code, r) || r.error || 'Не получилось. Попробуй ещё раз.';
}

export function QuotaMeter({ quota }: { quota: Quota }) {
  const q = quotaLines(quota);
  const bar = (share: number | null) =>
    share === null ? null : (
      <span className="rf-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
    );
  return (
    <div className="stack gap4 rf-quota">
      <span className="small">{q.day}</span>
      {bar(q.dayShare)}
      <span className="small muted">{q.month}</span>
      {bar(q.monthShare)}
    </div>
  );
}

export function RefrainSettings({ cfg, onConfig }: { cfg: AiConfigOrder; onConfig: (c: AiConfigOrder) => void }) {
  const api = refrainApi();
  const [st, setSt] = useState<RefrainStatus | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [closed, setClosed] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'info'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<'delete' | null>(null);

  const refresh = async () => {
    if (!api) return;
    const s = await api.status();
    setSt(s);
    if (!s.signedIn) return;
    const me = await api.me();
    if (me.ok) {
      setDevices(me.devices);
      setClosed(me.access === 'closed');
      setSt({ ...s, emailMasked: me.emailMasked, quota: me.quota });
    } else if (me.code === 'session_revoked' || me.code === 'device_unknown' || me.code === 'signed_out') {
      setSt({ signedIn: false, secure: s.secure });
      setMsg({ kind: 'warn', text: failText(me) });
    } else setMsg({ kind: 'warn', text: failText(me) });
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!api || !cfg.refrain || !st) return null;
  const order = cfg.order ?? ['refrain', 'key', 'local'];
  const move = async (i: number, d: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    const c = (await window.mnemaApi!.aiSetConfig!({ order: next } as Partial<AiConfig>)) as AiConfigOrder;
    onConfig(c);
  };

  return (
    <div className="stack gap12 rf-settings" data-part="refrain">
      <div className="stack gap4">
        <strong>Refrain ИИ</strong>
        <span className="small muted">Бесплатные страницы в день без ключа. На сервер уходят только фото или текст задачи — без истории и других конспектов.</span>
      </div>
      {msg && <div className={'hint ' + msg.kind} role="status">{msg.text}</div>}
      {!st.signedIn ? (
        st.secure ? (
          <RefrainLogin
            onDone={(text) => {
              setMsg({ kind: 'ok', text });
              void refresh();
            }}
          />
        ) : (
          <div className="hint warn" role="note">
            {refrainMessage('no_secure_storage')}
          </div>
        )
      ) : (
        <div className="stack gap12">
          <div className="row gap8 wrap">
            <span className="grow small">
              Вход: <strong>{st.emailMasked}</strong>
            </span>
            <button className="btn small" onClick={() => void refresh()}>
              Обновить
            </button>
            <button
              className="btn small ghost"
              onClick={() =>
                void api.logout().then(() => {
                  setMsg({ kind: 'info', text: 'Ты вышел из Refrain ИИ на этом устройстве.' });
                  void refresh();
                })
              }
            >
              Выйти
            </button>
          </div>
          {st.quota && <QuotaMeter quota={st.quota} />}
          {closed && <InviteForm onDone={(text) => { setMsg({ kind: 'ok', text }); void refresh(); }} />}
          {devices.length > 0 && (
            <div className="stack gap4">
              <span className="small muted">Устройства</span>
              {devices.map((d) => (
                <div key={d.id} className="row gap8 rf-device">
                  <span className="grow small">
                    {d.name} · {PLATFORM_NAME[d.platform] ?? d.platform}
                    {d.current && ' · это устройство'}
                  </span>
                  {!d.current && (
                    <button
                      className="btn small ghost"
                      onClick={() =>
                        void api.unbind(d.id).then((r) => {
                          setMsg(r.ok ? { kind: 'ok', text: `«${d.name}» отвязано.` } : { kind: 'warn', text: failText(r) });
                          void refresh();
                        })
                      }
                    >
                      Отвязать
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div>
            <button className="btn small ghost danger" onClick={() => setConfirm('delete')}>
              Удалить аккаунт Refrain ИИ
            </button>
          </div>
        </div>
      )}

      <div className="stack gap4">
        <span className="small muted">Кого спрашивать по очереди: если первый недоступен или кончились страницы — следующего</span>
        <ol className="rf-order">
          {order.map((s, i) => (
            <li key={s} className="row gap8">
              <span className="grow small">
                {i + 1}. {STEP_NAME[s]}
              </span>
              <button className="icon-btn small" aria-label={`${STEP_NAME[s]} выше`} disabled={i === 0} onClick={() => void move(i, -1)}>
                ↑
              </button>
              <button className="icon-btn small" aria-label={`${STEP_NAME[s]} ниже`} disabled={i === order.length - 1} onClick={() => void move(i, 1)}>
                ↓
              </button>
            </li>
          ))}
        </ol>
      </div>

      {confirm === 'delete' && (
        <Modal title="Удалить аккаунт Refrain ИИ?" onClose={() => setConfirm(null)}>
          <div className="stack gap12">
            <p className="small">На сервере сотрутся почта, счётчики страниц, устройства и входы. Конспекты на устройстве останутся.</p>
            <div className="row gap8 end">
              <button className="btn" onClick={() => setConfirm(null)}>
                Отмена
              </button>
              <button
                className="btn danger"
                onClick={() =>
                  void api.deleteAccount().then((r) => {
                    setConfirm(null);
                    setMsg(r.ok ? { kind: 'ok', text: 'Аккаунт удалён.' } : { kind: 'warn', text: failText(r) });
                    void refresh();
                  })
                }
              >
                Удалить
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Ввод приглашения (закрытый тест). */
export function InviteForm({ onDone }: { onDone: (text: string) => void }) {
  const api = refrainApi();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  if (!api) return null;
  return (
    <form
      className="stack gap4"
      onSubmit={(e) => {
        e.preventDefault();
        void api.invite(code.trim()).then((r) => (r.ok ? onDone('Приглашение принято.') : setErr(failText(r))));
      }}
    >
      <span className="small muted">Refrain ИИ сейчас в закрытом тесте. Если у тебя есть приглашение — введи его.</span>
      <div className="row gap8">
        <input className="input grow mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код приглашения" aria-label="Код приглашения" />
        <button className="btn" type="submit" disabled={!code.trim()}>
          Ввести
        </button>
      </div>
      {err && <span className="small warn-text" role="alert">{err}</span>}
    </form>
  );
}

/** Вход: почта → код (+ приглашение) → при device_limit выбрать, какое устройство отвязать. */
function RefrainLogin({ onDone }: { onDone: (text: string) => void }) {
  const api = refrainApi()!;
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);

  const start = async () => {
    setBusy(true);
    setErr('');
    const r = await api.loginStart(email.trim());
    setBusy(false);
    if (r.ok) setPhase('code');
    else setErr(failText(r));
  };
  const verify = async (replaceDevice?: string) => {
    setBusy(true);
    setErr('');
    const r = await api.loginVerify({ email: email.trim(), code: code.trim(), ...(invite.trim() ? { invite: invite.trim() } : {}), ...(replaceDevice ? { replaceDevice } : {}) });
    setBusy(false);
    if (r.ok) return onDone(`Готово: вход как ${r.emailMasked}.`);
    if (r.code === 'device_limit' && r.devices) return setDevices(r.devices);
    if (r.code === 'access_closed' || r.code === 'invite_invalid') setShowInvite(true);
    setErr(failText(r));
  };

  if (devices)
    return (
      <div className="stack gap8">
        <span className="small">{refrainMessage('device_limit')}</span>
        {devices.map((d) => (
          <div key={d.id} className="row gap8 rf-device">
            <span className="grow small">
              {d.name} · {PLATFORM_NAME[d.platform] ?? d.platform}
            </span>
            <button className="btn small" disabled={busy} onClick={() => void verify(d.id).then(() => setDevices(null))}>
              Отвязать и войти
            </button>
          </div>
        ))}
        <div>
          <button className="btn small ghost" onClick={() => setDevices(null)}>
            Отмена
          </button>
        </div>
      </div>
    );

  return (
    <form
      className="stack gap8"
      onSubmit={(e) => {
        e.preventDefault();
        void (phase === 'email' ? start() : verify());
      }}
    >
      {phase === 'email' ? (
        <>
          <span className="small muted">Войди по почте — пришлём код. Пароль не нужен.</span>
          <div className="row gap8">
            <input className="input grow" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="почта@example.com" aria-label="Почта" />
            <button className="btn primary" type="submit" disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}>
              {busy ? 'Проверяю…' : 'Прислать код'}
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="small muted">Код отправлен на {email.trim()}. Если письма нет — проверь «Спам».</span>
          <div className="row gap8">
            <input className="input grow mono" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6 цифр" aria-label="Код из письма" />
            <button className="btn primary" type="submit" disabled={busy || code.trim().length !== 6}>
              {busy ? 'Вхожу…' : 'Войти'}
            </button>
          </div>
          {showInvite ? (
            <input className="input mono" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Код приглашения" aria-label="Код приглашения" />
          ) : (
            <button type="button" className="btn small ghost" onClick={() => setShowInvite(true)}>
              Есть приглашение
            </button>
          )}
          <button type="button" className="btn small ghost" onClick={() => { setPhase('email'); setCode(''); setErr(''); }}>
            Другая почта
          </button>
        </>
      )}
      {err && <span className="small warn-text" role="alert">{err}</span>}
    </form>
  );
}
