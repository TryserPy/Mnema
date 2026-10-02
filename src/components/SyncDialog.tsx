// Синхронизация по Wi-Fi. На компьютере — QR-код и код из 8 цифр; на телефоне — сканер или ручной ввод.
import { useEffect, useRef, useState } from 'react';
import { forSync, getData, normalizeData, replaceData } from '../store';
import { mergeData, reportText, type MergeReport } from '../sync';
import { Icon, Modal, Segmented } from './ui';

interface Target {
  hosts: string[];
  port: number;
  token: string;
}

/** Содержимое QR-кода: «mnema-sync:192.168.1.5,10.0.0.3:47123:12345678». */
export function encodeTarget(t: Target): string {
  return `mnema-sync:${t.hosts.join(',')}:${t.port}:${t.token}`;
}
export function decodeTarget(s: string): Target | null {
  const m = /^mnema-sync:([\d.,]+):(\d{2,5}):(\d{8})$/.exec(s.trim());
  if (!m) return null;
  return { hosts: m[1].split(',').filter(Boolean), port: Number(m[2]), token: m[3] };
}

/** Отправить свои данные на другое устройство и получить слитые. */
export async function syncWith(t: Target, onStep?: (s: string) => void): Promise<MergeReport> {
  const http = window.mnemaApi?.http;
  if (!http) throw new Error('Синхронизация работает в приложении Мнема (Windows или Android).');
  let base = '';
  for (const h of t.hosts) {
    onStep?.(`Ищу компьютер ${h}…`);
    const r = await http({ url: `http://${h}:${t.port}/mnema/hello`, headers: { 'x-mnema-token': t.token }, timeout: 4000 });
    if (r.status === 200) {
      base = `http://${h}:${t.port}`;
      break;
    }
    if (r.status === 403) throw new Error('Код не подходит. Открой синхронизацию на компьютере заново.');
  }
  if (!base) throw new Error('Компьютер не найден. Проверь, что телефон и компьютер в одной сети Wi-Fi и окно синхронизации на компьютере открыто. Если Windows спросила про брандмауэр — разреши доступ.');
  onStep?.('Отправляю и объединяю данные…');
  const local = forSync(getData());
  const res = await http({
    url: `${base}/mnema/sync`,
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mnema-token': t.token },
    body: JSON.stringify({ device: window.mnemaApi?.platform === 'android' ? 'телефон' : 'компьютер', data: local }),
    timeout: 180000
  });
  if (res.status !== 200) {
    let msg = res.text;
    try {
      msg = JSON.parse(res.text).error ?? msg;
    } catch {
      /* текст как есть */
    }
    throw new Error(msg || 'Не получилось');
  }
  const body = JSON.parse(res.text) as { data: unknown; report: MergeReport };
  const merged = mergeData(getData(), normalizeData(body.data));
  replaceData(merged.data);
  return merged.report;
}

/** Обработчик на компьютере: пришли данные — слить и вернуть результат. */
export function acceptIncoming(remote: unknown) {
  const merged = mergeData(getData(), normalizeData(remote));
  replaceData(merged.data);
  return Promise.resolve({ data: forSync(merged.data), report: merged.report }); // корзина остаётся на этом устройстве
}

export function SyncDialog({ onClose }: { onClose: () => void }) {
  const api = window.mnemaApi;
  const canServe = Boolean(api?.syncStart);
  const isPhone = api?.platform === 'android';
  const [mode, setMode] = useState<'show' | 'scan'>(canServe && !isPhone ? 'show' : 'scan');
  return (
    <Modal title="Синхронизация по Wi-Fi" onClose={onClose} width={560}>
      <div className="stack gap12">
        {canServe && (
          <Segmented
            ariaLabel="Роль"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'show', label: 'Показать код' },
              { value: 'scan', label: 'Ввести код другого' }
            ]}
          />
        )}
        {mode === 'show' ? <ServePanel /> : <ClientPanel isPhone={isPhone} onDone={onClose} />}
      </div>
    </Modal>
  );
}

function ServePanel() {
  const api = window.mnemaApi!;
  const [s, setS] = useState<Target | null>(null);
  const [qr, setQr] = useState('');
  const [err, setErr] = useState('');
  const [last, setLast] = useState('');
  useEffect(() => {
    let alive = true;
    void api.syncStart!().then(async (r) => {
      if (!alive) return;
      if (!r.ok) return setErr(r.error);
      const t = { hosts: r.hosts, port: r.port, token: r.token };
      setS(t);
      const QR = await import('qrcode');
      setQr(await QR.toDataURL(encodeTarget(t), { margin: 1, width: 280, color: { dark: '#1E2230', light: '#FFFFFF' } }));
    });
    const off = api.onSyncDone?.((m) => setLast(`Синхронизировано с устройством «${m.device}». ${reportText(m.report)}`));
    return () => {
      alive = false;
      off?.();
      void api.syncStop?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="hint warn">Не получилось включить синхронизацию: {err}</div>;
  if (!s) return <div className="spinner" />;
  if (!s.hosts.length) return <div className="hint warn">Компьютер не подключён к сети. Подключи Wi-Fi или кабель и открой окно снова.</div>;
  return (
    <div className="stack gap12 center">
      <p className="muted">На телефоне открой Мнему → «Настройки» → «Синхронизация» и наведи камеру на код.</p>
      {qr ? <img className="sync-qr" src={qr} alt="QR-код для синхронизации" /> : <div className="spinner" />}
      <div className="sync-code">
        <span className="small muted">или введи вручную</span>
        <span className="mono big-code">{s.hosts[0]}:{s.port}</span>
        <span className="mono big-code">код {s.token.slice(0, 4)} {s.token.slice(4)}</span>
      </div>
      {last ? <div className="hint ok">{last}</div> : <p className="small muted">Окно можно не закрывать — синхронизироваться можно несколько раз. Через 15 минут доступ закроется сам.</p>}
    </div>
  );
}

function ClientPanel({ isPhone, onDone }: { isPhone: boolean; onDone: () => void }) {
  const [scan, setScan] = useState(isPhone);
  const [addr, setAddr] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = Boolean(step) && !result;

  async function run(t: Target) {
    setScan(false);
    setResult(null);
    setStep('Подключаюсь…');
    try {
      const rep = await syncWith(t, setStep);
      setResult({ ok: true, text: 'Готово! ' + reportText(rep) });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setStep('');
    }
  }

  const manual = () => {
    const m = /^\s*([\d.]+):(\d{2,5})\s*$/.exec(addr);
    const c = code.replace(/\D/g, '');
    if (!m || c.length !== 8) return setResult({ ok: false, text: 'Адрес вида 192.168.1.5:47123 и код из 8 цифр — как на экране компьютера.' });
    void run({ hosts: [m[1]], port: Number(m[2]), token: c });
  };

  return (
    <div className="stack gap12">
      {scan ? (
        <QrScanner
          onCode={(txt) => {
            const t = decodeTarget(txt);
            if (t) void run(t);
          }}
          onCancel={() => setScan(false)}
        />
      ) : (
        !busy &&
        !result?.ok && (
          <>
            {isPhone && (
              <button className="btn primary big" onClick={() => setScan(true)}>
                <Icon name="camera" size={20} /> Сканировать QR-код
              </button>
            )}
            <div className="stack gap8">
              <span className="small muted">{isPhone ? 'Или введи вручную то, что на экране компьютера:' : 'Введи адрес и код, которые показаны на другом устройстве:'}</span>
              <input className="input mono" inputMode="decimal" placeholder="192.168.1.5:47123" value={addr} onChange={(e) => setAddr(e.target.value)} aria-label="Адрес" />
              <input className="input mono" inputMode="numeric" placeholder="код из 8 цифр" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Код" />
              <button className="btn" onClick={manual}>
                Синхронизировать
              </button>
            </div>
          </>
        )
      )}
      {busy && (
        <div className="stack gap8 center">
          <div className="spinner" />
          <span className="muted">{step}</span>
        </div>
      )}
      {result && <div className={'hint ' + (result.ok ? 'ok' : 'warn')}>{result.text}</div>}
      {result?.ok && (
        <div className="row end">
          <button className="btn primary" onClick={onDone}>
            Готово
          </button>
        </div>
      )}
    </div>
  );
}

/** Камера + распознавание QR (jsQR). */
export function QrScanner({ onCode, onCancel }: { onCode: (text: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let done = false;
    const canvas = document.createElement('canvas');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const { default: jsQR } = await import('jsqr');
        const tick = () => {
          if (done) return;
          if (v.videoWidth) {
            const w = 480;
            const h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code?.data) {
              done = true;
              onCode(code.data);
              return;
            }
          }
          timer = window.setTimeout(tick, 200);
        };
        tick();
      } catch (e) {
        setErr('Нет доступа к камере. Разреши Мнеме камеру в настройках телефона или введи код вручную. ' + ((e as Error).message ?? ''));
      }
    })();
    return () => {
      done = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stack gap8">
      {err ? <div className="hint warn">{err}</div> : <video ref={video} className="qr-video" playsInline muted />}
      <button className="btn ghost" onClick={onCancel}>
        Ввести вручную
      </button>
    </div>
  );
}
