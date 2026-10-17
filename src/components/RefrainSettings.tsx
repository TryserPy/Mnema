// Refrain ИИ в «Настройки → ИИ-помощник»: вход по почте, счётчик страниц, приглашение, устройства, порядок поставщиков,
// выход и удаление аккаунта. Сеть, токены и ключ устройства — в shared/refrainClient.mjs (окно видит только результаты).
import { useEffect, useState } from 'react';
import type { AiConfig } from '../store';
import { refrainApi, type DeviceInfo, type Quota } from '../refrainBridge';
import { quotaLines, refrainMessage, takeSignIn } from '../refrain';
import type { RefrainFail, RefrainStatus } from '../../shared/refrainClient.mjs';
import { Fold } from './Fold';
import { Modal } from './ui';

export type Step = 'refrain' | 'key' | 'local';
export type AiConfigOrder = AiConfig & { order?: Step[]; refrain?: boolean };

const STEP_NAME: Record<Step, string> = { refrain: 'Refrain ИИ', key: 'Свой ключ', local: 'Без интернета' };
const PLATFORM_NAME: Record<string, string> = { windows: 'Windows', linux: 'Linux', android: 'Android' };

/** «сегодня», «вчера», «3 дня назад», «12 сентября» — когда устройство последний раз обращалось к Refrain ИИ. */
export function seenText(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} ${days < 5 ? 'дня' : 'дней'} назад`;
  return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** Строка устройства: «Pixel 7 · Android · был активен вчера». Название — то, что прислало само устройство. */
function DeviceLine({ d }: { d: DeviceInfo }) {
  const name = d.name.replace(/^Android · /, '');
  const seen = seenText(d.lastSeen);
  return (
    <span className="grow stack rf-device-name">
      <span className="small">
        <strong>{name}</strong>
        {d.current && <span className="rf-tag">это устройство</span>}
      </span>
      <span className="small muted">
        {PLATFORM_NAME[d.platform] ?? d.platform}
        {seen && ` · последняя активность: ${seen}`}
      </span>
    </span>
  );
}

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

export function RefrainSettings({ cfg, focusLogin = false }: { cfg: AiConfigOrder; focusLogin?: boolean }) {
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

  return (
    <div className="stack gap12 rf-settings" data-part="refrain">
      <span className="small muted">Каждый день — бесплатные страницы. Ключ не нужен, только почта. Уходит только фото или текст, с которым ты попросил помочь, и название темы.</span>
      {msg && <div className={'hint ' + msg.kind} role="status">{msg.text}</div>}
      {!st.signedIn ? (
        st.secure ? (
          <RefrainLogin
            focus={focusLogin}
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
          <Fold id="refrain-account" title="Аккаунт и устройства" hint={devices.length ? `Устройств: ${devices.length}` : undefined}>
            {devices.map((d) => (
              <div key={d.id} className="row gap8 rf-device">
                <DeviceLine d={d} />
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
            <div>
              <button className="btn small ghost danger" onClick={() => setConfirm('delete')}>
                Удалить аккаунт Refrain ИИ
              </button>
            </div>
          </Fold>
        </div>
      )}

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

/** «Если не получилось — спросить следующего»: порядок Refrain ИИ, своего ключа и модели без интернета. */
export function ProviderOrder({ cfg, onConfig }: { cfg: AiConfigOrder; onConfig: (c: AiConfigOrder) => void }) {
  const order = (cfg.order ?? ['refrain', 'key', 'local']).filter((s) => s !== 'refrain' || cfg.refrain);
  const move = async (i: number, d: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    const full = cfg.refrain ? next : [...next, 'refrain' as Step];
    onConfig((await window.mnemaApi!.aiSetConfig!({ order: full } as Partial<AiConfig>)) as AiConfigOrder);
  };
  return (
    <div className="stack gap4">
      <strong className="small">Если первый не ответил</strong>
      <span className="small muted">Кого спрашивать по очереди: если первый недоступен или кончились страницы — следующего.</span>
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

/**
 * Вход: почта → код (+ приглашение) → при device_limit выбрать, какое устройство отвязать — и вход завершается сам.
 * Если код за это время устарел, выбранное устройство помнится: после нового кода вход повторится с ним же.
 */
function RefrainLogin({ onDone, focus = false }: { onDone: (text: string) => void; focus?: boolean }) {
  const api = refrainApi()!;
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [replace, setReplace] = useState<DeviceInfo | null>(null);
  const [autoFocus] = useState(() => focus || takeSignIn());

  const start = async () => {
    setBusy(true);
    setErr('');
    const r = await api.loginStart(email.trim());
    setBusy(false);
    if (r.ok) setPhase('code');
    else setErr(failText(r));
  };
  const verify = async (replaceDevice = replace?.id, typed = code) => {
    setBusy(true);
    setErr('');
    const r = await api.loginVerify({ email: email.trim(), code: typed.trim(), ...(invite.trim() ? { invite: invite.trim() } : {}), ...(replaceDevice ? { replaceDevice } : {}) });
    setBusy(false);
    if (r.ok) {
      setDevices(null);
      setReplace(null);
      return onDone(replaceDevice ? `Готово: вход как ${r.emailMasked}. Старое устройство отвязано.` : `Готово: вход как ${r.emailMasked}.`);
    }
    if (r.code === 'device_limit' && r.devices) {
      setReplace(null);
      return setDevices(r.devices);
    }
    setDevices(null);
    if (r.code === 'access_closed' || r.code === 'invite_invalid') setShowInvite(true);
    if (r.code === 'code_invalid' || r.code === 'code_locked') setCode('');
    setErr(failText(r) + (replaceDevice && r.code === 'code_invalid' ? ' Нажми «Прислать код ещё раз» — устройство для отвязки запомнено, вход завершится сам.' : ''));
  };
  const resend = async () => {
    setBusy(true);
    setErr('');
    const r = await api.loginStart(email.trim());
    setBusy(false);
    setErr(r.ok ? '' : failText(r));
  };

  if (devices)
    return (
      <div className="stack gap8">
        <span className="small">{refrainMessage('device_limit')}</span>
        {devices.map((d) => (
          <div key={d.id} className="row gap8 rf-device">
            <DeviceLine d={d} />
            <button
              className="btn small"
              disabled={busy}
              onClick={() => {
                setReplace(d);
                void verify(d.id);
              }}
            >
              {busy && replace?.id === d.id ? 'Вхожу…' : 'Отвязать и войти'}
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
            <input className="input grow" type="email" autoComplete="email" autoFocus={autoFocus} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="почта@example.com" aria-label="Почта" />
            <button className="btn primary" type="submit" disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}>
              {busy ? 'Проверяю…' : 'Прислать код'}
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="small muted">Код отправлен на {email.trim()}. Если письма нет — проверь «Спам».</span>
          {replace && <span className="small">После входа отвяжется: {replace.name}.</span>}
          <div className="row gap8">
            <input className="input grow mono" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                // Шесть цифр набраны или вставлены из письма — входим сразу, без лишнего нажатия (как в Telegram).
                if (v.length === 6 && code.length !== 6 && !busy) void verify(replace?.id, v);
              }} placeholder="6 цифр" aria-label="Код из письма" />
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
          <div className="row gap8 wrap">
            <button type="button" className="btn small ghost" disabled={busy} onClick={() => void resend()}>
              Прислать код ещё раз
            </button>
            <button type="button" className="btn small ghost" onClick={() => { setPhase('email'); setCode(''); setErr(''); setReplace(null); }}>
              Другая почта
            </button>
          </div>
        </>
      )}
      {err && <span className="small warn-text" role="alert">{err}</span>}
    </form>
  );
}
